const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,80}$/;
const VOTER_RE = /^[A-Za-z0-9_-]{8,80}$/;

export function newToken() {
  var bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  var s = "";
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function validateRestaurantIds(ids) {
  if (!Array.isArray(ids)) return { error: "Choose at least two restaurants." };
  var clean = [];
  var seen = {};
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if (typeof id !== "string" || !ID_RE.test(id) || id.length > 96) {
      return { error: "A restaurant in this shortlist isn't valid." };
    }
    if (seen[id]) continue;
    seen[id] = 1;
    clean.push(id);
  }
  if (clean.length < 2) return { error: "Choose at least two restaurants." };
  if (clean.length > 30) return { error: "Choose 30 restaurants or fewer." };
  return { ids: clean };
}

export function createPoll(restaurantIds) {
  var checked = validateRestaurantIds(restaurantIds);
  if (checked.error) return { ok: false, status: 400, error: checked.error };
  var now = new Date().toISOString();
  return {
    ok: true,
    status: 201,
    poll: {
      shareToken: newToken(),
      restaurantIds: checked.ids,
      createdAt: now,
      status: "open",
      votes: []
    }
  };
}

export function castVote(poll, body) {
  if (!poll) return { ok: false, status: 404, error: "This voting link isn't valid or has expired." };
  if (poll.status && poll.status !== "open") {
    return { ok: false, status: 409, error: "This poll is closed.", poll: poll };
  }
  body = body || {};
  var voter = String(body.participantToken || "");
  if (!VOTER_RE.test(voter)) {
    return { ok: false, status: 400, error: "Reload the page and try your vote again." };
  }
  var rid = String(body.restaurantId || "");
  if (poll.restaurantIds.indexOf(rid) < 0) {
    return { ok: false, status: 400, error: "That restaurant isn't on this shortlist." };
  }
  var votes = poll.votes || [];
  for (var i = 0; i < votes.length; i++) {
    if (votes[i].participantToken === voter) {
      return { ok: false, status: 409, error: "You've already voted on this shortlist.", poll: poll };
    }
  }
  if (votes.length >= 80) return { ok: false, status: 429, error: "This poll isn't taking more votes right now." };
  var next = {
    shareToken: poll.shareToken,
    restaurantIds: poll.restaurantIds.slice(),
    createdAt: poll.createdAt,
    status: poll.status || "open",
    votes: votes.concat({
      restaurantId: rid,
      participantToken: voter,
      createdAt: new Date().toISOString()
    })
  };
  return { ok: true, status: 200, poll: next };
}

export function talliesOf(poll) {
  var tallies = {};
  (poll.restaurantIds || []).forEach(function (id) { tallies[id] = 0; });
  (poll.votes || []).forEach(function (v) {
    if (tallies[v.restaurantId] != null) tallies[v.restaurantId]++;
  });
  return tallies;
}

export function summarizeTallies(tallies, ids) {
  var best = 0;
  (ids || []).forEach(function (id) {
    var n = tallies[id] || 0;
    if (n > best) best = n;
  });
  if (!best) return { kind: "none", count: 0, ids: [] };
  var leaders = (ids || []).filter(function (id) { return (tallies[id] || 0) === best; });
  if (leaders.length > 1) return { kind: "tie", count: best, ids: leaders };
  return { kind: "lead", count: best, ids: leaders };
}

export function publicView(poll, participantToken) {
  if (!poll) return null;
  var tallies = talliesOf(poll);
  var mine = "";
  if (participantToken) {
    (poll.votes || []).forEach(function (v) {
      if (v.participantToken === participantToken) mine = v.restaurantId;
    });
  }
  return {
    shareToken: poll.shareToken,
    restaurantIds: poll.restaurantIds.slice(),
    createdAt: poll.createdAt,
    status: poll.status || "open",
    total: (poll.votes || []).length,
    tallies: tallies,
    summary: summarizeTallies(tallies, poll.restaurantIds),
    myVote: mine
  };
}

export function validShareToken(token) {
  return TOKEN_RE.test(String(token || ""));
}
