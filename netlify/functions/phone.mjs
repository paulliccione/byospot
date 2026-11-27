import { getStore } from "@netlify/blobs";
import { STORE_NAME, handlePhoneRequest } from "../../phone-core.mjs";

export default async function handler(request) {
  const url = new URL(request.url);
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, reason: "method" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }
  let store;
  try {
    store = getStore({ name: STORE_NAME, consistency: "strong" });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: "unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }
  return handlePhoneRequest({
    id: url.searchParams.get("id") || "",
    store: store,
    fetch: globalThis.fetch,
    apiKey: process.env.GOOGLE_PLACES_SERVER_KEY || "",
    now: new Date()
  });
}
