import { getStore } from "@netlify/blobs";
import { createPoll, castVote, publicView, validShareToken } from "../../poll-core.mjs";

export default async function handler(request, context) {
  const url = new URL(request.url);
  const route = matchRoute(url.pathname);
  if (!route) return json(404, { error: "This voting link isn't valid or has expired." });
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });

  try {
    const store = getStore({ name: "byospot-polls", consistency: "strong" });
    const prefix = (context && context.deploy && context.deploy.context) || "site";
    if (route.kind === "collection") {
      if (request.method !== "POST") return json(405, { error: "Use POST to create a poll." });
      const ip = clientIp(request, context);
      if (!(await allow(store, prefix + ":rl:create:" + ip, 20, 60 * 60 * 1000))) {
        return json(429, { error: "Too many shortlists were just created. Wait a little and try again." });
      }
      const body = await readJson(request);
      const created = createPoll(body.restaurantIds);
      if (!created.ok) return json(created.status, { error: created.error });
      const key = prefix + ":" + created.poll.shareToken;
      await store.setJSON(key, created.poll, { onlyIfNew: true });
      return json(201, publicView(created.poll, ""));
    }

    const key = prefix + ":" + route.token;
    if (!validShareToken(route.token)) return json(404, { error: "This voting link isn't valid or has expired." });

    if (route.kind === "poll" && request.method === "GET") {
      const poll = await store.get(key, { type: "json", consistency: "strong" });
      if (!poll) return json(404, { error: "This voting link isn't valid or has expired." });
      return json(200, publicView(poll, url.searchParams.get("voter") || ""));
    }

    if (route.kind === "vote" && request.method === "POST") {
      const ip = clientIp(request, context);
      if (!(await allow(store, prefix + ":rl:vote:" + ip, 40, 60 * 60 * 1000))) {
        return json(429, { error: "Too many vote attempts. Wait a little and try again." });
      }
      const body = await readJson(request);
      for (var attempt = 0; attempt < 5; attempt++) {
        const current = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
        if (!current || !current.data) return json(404, { error: "This voting link isn't valid or has expired." });
        const result = castVote(current.data, body);
        if (!result.ok) {
          return json(result.status, Object.assign({ error: result.error }, result.poll ? publicView(result.poll, body.participantToken || "") : {}));
        }
        const write = await store.setJSON(key, result.poll, { onlyIfMatch: current.etag });
        if (write && write.modified) return json(200, publicView(result.poll, body.participantToken || ""));
      }
      return json(503, { error: "We couldn't save that vote. Try again." });
    }

    return json(405, { error: "That action isn't available." });
  } catch (err) {
    if (err && err.publicMessage) return json(400, { error: err.publicMessage });
    return json(503, { error: "We couldn't reach the voting service. Try again in a moment." });
  }
}

export const config = { path: "/api/*" };

function matchRoute(pathname) {
  var path = String(pathname || "").replace(/\/+$/, "") || "/";
  var rest = path;
  var apiAt = path.indexOf("/api/");
  if (apiAt >= 0) rest = path.slice(apiAt);
  else if (path.indexOf("/.netlify/functions/polls") >= 0) {
    rest = "/api/polls" + path.slice(path.indexOf("/.netlify/functions/polls") + "/.netlify/functions/polls".length);
  }
  if (rest === "/api/polls") return { kind: "collection" };
  const vote = rest.match(/^\/api\/polls\/([A-Za-z0-9_-]+)\/vote$/);
  if (vote) return { kind: "vote", token: vote[1] };
  const poll = rest.match(/^\/api\/polls\/([A-Za-z0-9_-]+)$/);
  if (poll) return { kind: "poll", token: poll[1] };
  return null;
}

function clientIp(request, context) {
  if (context && context.ip) return String(context.ip);
  return request.headers.get("x-nf-client-connection-ip") || request.headers.get("x-forwarded-for") || "unknown";
}

async function allow(store, key, max, windowMs) {
  const now = Date.now();
  let hits = [];
  try {
    const cur = await store.get(key, { type: "json", consistency: "strong" });
    if (cur && Array.isArray(cur.hits)) hits = cur.hits.filter(function (t) { return now - t < windowMs; });
  } catch (e) {
    hits = [];
  }
  if (hits.length >= max) return false;
  hits.push(now);
  try { await store.setJSON(key, { hits: hits }); } catch (e) { /* don't block the vote if the limiter can't write */ }
  return true;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 4000) { const err = new Error("large"); err.publicMessage = "That request is too large."; throw err; }
  if (!text) return {};
  try { return JSON.parse(text); }
  catch (e) { const err = new Error("json"); err.publicMessage = "That request could not be read."; throw err; }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
