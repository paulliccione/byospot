import { getStore } from "@netlify/blobs";
import {
  validateReport,
  consumeRate,
  hashIp,
  rateKey,
  reportBlobKey,
  reportObject,
  RATE_MAX,
  RATE_WINDOW_MS
} from "../../report-core.mjs";

// Do not write the email or the note to the logs. No mail is sent from here.
export default async function handler(request, context) {
  return handleReport(request, context, getStore("reports"));
}

export async function handleReport(request, context, store) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  if (request.method !== "POST") return json(405, { error: "Use POST to send a report." });

  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    return json(err.status || 400, { error: err.publicMessage || "That report could not be read." });
  }

  const checked = validateReport(body);
  if (checked.drop) return json(200, { ok: true });
  if (!checked.ok) return json(checked.status || 400, { error: checked.error || "That report could not be read." });

  let rl;
  try {
    rl = rateKey(await hashIp(clientIp(request, context)));
  } catch (e) {
    return json(503, { error: "We couldn't save that report. Try again." });
  }
  if (!rl) return json(503, { error: "We couldn't save that report. Try again." });

  let current = null;
  try {
    current = await store.get(rl, { type: "json", consistency: "strong" });
  } catch (e) {
    return json(503, { error: "We couldn't save that report. Try again." });
  }
  const decision = consumeRate(current, Date.now(), RATE_MAX, RATE_WINDOW_MS);
  if (!decision.ok) return json(429, { error: "Too many reports from this network. Try again later." });

  const ts = new Date().toISOString();
  const saved = reportObject(checked.report, ts);
  const key = reportBlobKey(ts, randomId());
  try {
    await store.setJSON(rl, decision.record);
    await store.setJSON(key, saved);
  } catch (e) {
    return json(503, { error: "We couldn't save that report. Try again." });
  }
  return json(200, { ok: true });
}

function clientIp(request, context) {
  var ip = "";
  if (context && context.ip) ip = String(context.ip);
  else ip = request.headers.get("x-nf-client-connection-ip") || request.headers.get("x-forwarded-for") || "";
  var first = String(ip).split(",")[0].trim();
  return first || "unknown";
}

function randomId() {
  var bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  var s = "";
  for (var i = 0; i < bytes.length; i++) {
    var piece = bytes[i].toString(16);
    s += piece.length === 1 ? "0" + piece : piece;
  }
  return s;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 8000) {
    const err = new Error("large");
    err.status = 400;
    err.publicMessage = "That report is too large.";
    throw err;
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error("json");
    err.status = 400;
    err.publicMessage = "That report could not be read.";
    throw err;
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
