// Daily cap for the Call to book lookup. The blob stores a count only.
// Phone numbers and the Places API key never go into the store or the logs.

export const DAILY_CAP = 30;
export const STORE_NAME = "call-cap";

const PLACE_ID = /^[A-Za-z0-9_-]{10,200}$/;

export function sydneyDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date instanceof Date ? date : new Date());
  const pick = {};
  parts.forEach(function (part) { pick[part.type] = part.value; });
  return pick.year + "-" + pick.month + "-" + pick.day;
}

export function capDecision(count) {
  const n = Number(count);
  const current = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (current >= DAILY_CAP) return { allow: false, count: current };
  return { allow: true, count: current + 1 };
}

export function clientCallResult(payload) {
  const phone = payload && payload.ok === true && typeof payload.nationalPhoneNumber === "string"
    ? payload.nationalPhoneNumber.trim()
    : "";
  if (!phone) return { fallback: true };
  return { phone: phone };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function reserveLookup(store, key) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let current = null;
    try {
      current = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
    } catch (e) {
      return { allow: false, reason: "unavailable" };
    }
    const count = current && current.data && Number(current.data.count);
    const decision = capDecision(count);
    if (!decision.allow) return { allow: false, reason: "cap" };
    const opts = current && current.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true };
    try {
      const write = await store.setJSON(key, { count: decision.count }, opts);
      if (write && write.modified) return { allow: true, count: decision.count };
    } catch (e) {
      return { allow: false, reason: "unavailable" };
    }
  }
  return { allow: false, reason: "unavailable" };
}

export async function handlePhoneRequest({ id, store, fetch: fetchImpl, apiKey, now }) {
  const placeId = String(id || "").trim();
  if (!PLACE_ID.test(placeId)) return json(400, { ok: false, reason: "invalid" });
  const key = String(apiKey || "").trim();
  if (!key) return json(503, { ok: false, reason: "unavailable" });
  const dateKey = sydneyDateKey(now || new Date());
  const slot = await reserveLookup(store, dateKey);
  if (!slot.allow) {
    const status = slot.reason === "cap" ? 429 : 503;
    return json(status, { ok: false, reason: slot.reason === "cap" ? "cap" : "unavailable" });
  }
  const url = "https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId);
  let res;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "nationalPhoneNumber"
      }
    });
  } catch (e) {
    return json(503, { ok: false, reason: "unavailable" });
  }
  if (!res || !res.ok) {
    if (res && res.text) { try { await res.text(); } catch (e) { /* discard */ } }
    return json(200, { ok: false, reason: "none" });
  }
  let body = {};
  try { body = await res.json(); } catch (e) { body = {}; }
  const phone = body && typeof body.nationalPhoneNumber === "string" ? body.nationalPhoneNumber.trim() : "";
  if (!phone) return json(200, { ok: false, reason: "none" });
  return json(200, { ok: true, nationalPhoneNumber: phone });
}
