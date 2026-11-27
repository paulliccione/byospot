// Validation and rate-limit rules for venue reports.
// The raw IP is never stored. Callers pass a hash into rateKey.

export const REASONS = ["BYO not allowed", "Corkage changed", "Days wrong", "Closed", "Other"];
export const NOTE_MAX = 500;
export const RATE_MAX = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

const VENUE_RE = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function honeypotHit(body) {
  if (!body || typeof body !== "object") return false;
  var value = body.website;
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function validateReport(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "That report could not be read." };
  }
  if (honeypotHit(body)) return { ok: true, drop: true };

  var venueId = typeof body.venueId === "string" ? body.venueId.trim() : "";
  if (!VENUE_RE.test(venueId)) return { ok: false, status: 400, error: "That venue isn't valid." };

  var reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (REASONS.indexOf(reason) < 0) return { ok: false, status: 400, error: "Choose a reason." };

  if (body.note != null && typeof body.note !== "string") {
    return { ok: false, status: 400, error: "That note isn't valid." };
  }
  var note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > NOTE_MAX) return { ok: false, status: 400, error: "Keep the note under 500 characters." };

  var email = null;
  if (body.email != null && body.email !== "") {
    if (typeof body.email !== "string") return { ok: false, status: 400, error: "That email isn't valid." };
    var trimmed = body.email.trim();
    if (trimmed) {
      if (trimmed.length > 254 || !EMAIL_RE.test(trimmed)) {
        return { ok: false, status: 400, error: "That email isn't valid." };
      }
      email = trimmed;
    }
  }

  return {
    ok: true,
    report: { venueId: venueId, reason: reason, note: note, email: email }
  };
}

export function reportObject(report, ts) {
  return {
    venueId: report.venueId,
    reason: report.reason,
    note: report.note,
    email: report.email == null ? null : report.email,
    ts: ts
  };
}

export function reportBlobKey(ts, random) {
  return String(ts) + "-" + String(random);
}

// Sliding window. `record` is { hits: [epoch ms, ...] } or null.
// A denied call does not add a hit.
export function consumeRate(record, now, max, windowMs) {
  max = max || RATE_MAX;
  windowMs = windowMs || RATE_WINDOW_MS;
  now = Number(now);
  var hits = [];
  var prev = record && Array.isArray(record.hits) ? record.hits : [];
  for (var i = 0; i < prev.length; i++) {
    var t = Number(prev[i]);
    if (Number.isFinite(t) && now - t < windowMs) hits.push(t);
  }
  if (hits.length >= max) return { ok: false, record: { hits: hits } };
  hits.push(now);
  return { ok: true, record: { hits: hits } };
}

export async function hashIp(ip) {
  var data = new TextEncoder().encode(String(ip == null ? "" : ip));
  var digest = await crypto.subtle.digest("SHA-256", data);
  var bytes = new Uint8Array(digest);
  var hex = "";
  for (var i = 0; i < bytes.length; i++) {
    var piece = bytes[i].toString(16);
    hex += piece.length === 1 ? "0" + piece : piece;
  }
  return hex;
}

// Only a 64-char hex digest becomes a blob key. A raw IP is rejected.
export function rateKey(hash) {
  if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) return "";
  return "rl-" + hash;
}
