import { getStore } from "@netlify/blobs";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import core from "../../submission-core.js";
import {
  consumeRate,
  hashIp,
  rateKey,
  RATE_MAX,
  RATE_WINDOW_MS
} from "../../report-core.mjs";

// Stores a tip or a venue update. Nothing is published from here.
// Do not write the email or the phone to the logs. No mail is sent.
let catalogCache = null;

export function clearVenueCatalogCache() {
  catalogCache = null;
}

export function loadVenueCatalog() {
  if (catalogCache) return catalogCache;
  var paths = catalogPaths();
  for (var i = 0; i < paths.length; i++) {
    if (!existsSync(paths[i])) continue;
    try {
      var text = readFileSync(paths[i], "utf8");
      var start = text.indexOf("{");
      var end = text.lastIndexOf("}");
      if (start < 0 || end <= start) continue;
      var data = JSON.parse(text.slice(start, end + 1));
      catalogCache = core.indexVenues(data && data.places);
      return catalogCache;
    } catch (e) {
      catalogCache = [];
      return catalogCache;
    }
  }
  catalogCache = [];
  return catalogCache;
}

function catalogPaths() {
  var here = dirname(fileURLToPath(import.meta.url));
  var paths = [
    join(here, "data.js"),
    join(here, "..", "data.js"),
    join(here, "..", "..", "data.js"),
    join(process.cwd(), "data.js")
  ];
  if (process.env.LAMBDA_TASK_ROOT) paths.push(join(process.env.LAMBDA_TASK_ROOT, "data.js"));
  return paths;
}

export default async function handler(request, context) {
  return handleSubmission(request, context, getStore("submissions"));
}

export async function handleSubmission(request, context, store, places) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  if (request.method !== "POST") return json(405, { error: "Use POST to send this." });

  let body;
  try {
    body = await readJson(request);
  } catch (err) {
    return json(err.status || 400, { error: err.publicMessage || "That submission could not be read." });
  }

  const checked = core.validateSubmission(body);
  if (checked.drop) return json(200, { ok: true });
  if (!checked.ok) return json(checked.status || 400, { error: checked.error || "That submission could not be read." });

  let rl;
  try {
    rl = rateKey(await hashIp(clientIp(request, context)));
  } catch (e) {
    return json(503, { error: "We couldn't save that. Try again." });
  }
  if (!rl) return json(503, { error: "We couldn't save that. Try again." });

  let current = null;
  try {
    current = await store.get(rl, { type: "json", consistency: "strong" });
  } catch (e) {
    return json(503, { error: "We couldn't save that. Try again." });
  }
  const decision = consumeRate(current, Date.now(), RATE_MAX, RATE_WINDOW_MS);
  if (!decision.ok) return json(429, { error: "Too many submissions from this network. Try again later." });

  const catalog = Array.isArray(places) ? places : loadVenueCatalog();
  const ts = new Date().toISOString();
  const saved = core.finalizeSubmission(checked.submission, catalog, ts);
  const key = ts + "-" + randomId();
  try {
    await store.setJSON(rl, decision.record);
    await store.setJSON(key, saved);
  } catch (e) {
    return json(503, { error: "We couldn't save that. Try again." });
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
  if (text.length > core.BODY_MAX) {
    const err = new Error("large");
    err.status = 400;
    err.publicMessage = "That submission is too large.";
    throw err;
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error("json");
    err.status = 400;
    err.publicMessage = "That submission could not be read.";
    throw err;
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
