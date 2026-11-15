/*
  Attach a Google place_id to every BYOspot venue that does not have one.
  Does not store a Google formatted address.

  Google Maps Platform caching rules (checked 12 Nov 2026):
  https://developers.google.com/maps/documentation/places/web-service/policies
  Place IDs may be stored indefinitely. Formatted addresses must not be copied
  into our data. This script requests displayName and addressComponents so it
  can check the suburb, and it never writes formattedAddress.

  Pricing (Places API New):
  https://developers.google.com/maps/billing-and-pricing/pricing
  displayName makes the call Text Search Pro: $32 per 1,000 after 5,000 free
  calls a month. Do not add phone, website, written review fields, or opening
  hours. Those move the call onto an Enterprise SKU.

  The key is GOOGLE_MAPS_API_KEY, a server key restricted to Places API (New).
  The referrer-restricted browser key in Netlify will be rejected. Never
  commit the key.

  Usage:
    GOOGLE_MAPS_API_KEY=... node research/google-place-ids.mjs
    GOOGLE_MAPS_API_KEY=... node research/google-place-ids.mjs --limit 5
    GOOGLE_MAPS_API_KEY=... node research/google-place-ids.mjs --write

  Default is a dry run: it makes the Text Search calls and writes
  research/place-id-matches.csv only. It does not change data.js.
  --write also sets place_id on an exact single match.
*/
import fs from "fs";
import path from "path";
import vm from "vm";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const logic = require("../logic.js");

const DATA = new URL("../data.js", import.meta.url);
const REVIEW = new URL("./place-id-matches.csv", import.meta.url);
const MASK = "places.id,places.displayName,places.addressComponents";

export function parseLimit(argv) {
  const args = argv || [];
  let raw = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit") raw = args[i + 1] || "";
    else if (args[i].startsWith("--limit=")) raw = args[i].slice("--limit=".length);
  }
  if (!raw) return null;
  if (!/^[1-9]\d*$/.test(raw)) throw new Error("--limit needs a positive integer");
  return Number(raw);
}

export function targetsMissingPlaceId(records, ids, limit) {
  const out = [];
  for (let i = 0; i < records.length; i++) {
    if (records[i].place_id) continue;
    out.push({ place: records[i], id: ids[i] });
  }
  return limit == null ? out : out.slice(0, limit);
}

export function listPriceUsd(textCalls, detailCalls) {
  return Number(((textCalls * 32 + detailCalls * 17) / 1000).toFixed(2));
}

function fold(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function tokens(name) {
  const stop = new Set("the a an and of restaurant cafe bar kitchen eatery pty ltd".split(" "));
  return fold(name).split(" ").filter(t => t && !stop.has(t) && t.length > 2);
}
function nameOk(displayName, venueName) {
  const toks = tokens(venueName);
  const f = fold(displayName);
  if (!toks.length) return f.includes(fold(venueName));
  const hit = toks.filter(t => f.includes(t));
  return hit.length >= Math.min(2, toks.length) && hit.length / toks.length >= 0.6;
}
export function localityNames(components) {
  const want = new Set(["locality", "sublocality", "sublocality_level_1", "postal_town", "neighborhood"]);
  const names = [];
  for (const c of components || []) {
    if ((c.types || []).some(t => want.has(t))) names.push(c.longText || c.shortText || "");
  }
  return names.filter(Boolean);
}
function suburbOk(components, suburb) {
  const s = fold(suburb);
  return localityNames(components).some(n => fold(n) === s || fold(n).includes(s));
}
function stateOf(city) {
  return city === "Melbourne" || city === "Vic Coast" ? "VIC" : "NSW";
}
function searchQuery(place) {
  const street = (place.addressSource === "osm" || place.addressSource === "venue") && place.address ? place.address : "";
  return [place.name, street, place.suburb, stateOf(place.city), "Australia"].filter(Boolean).join(" ");
}
function displayText(place) {
  return (place && place.displayName && place.displayName.text) || "";
}

export function classify(candidates, venueName, suburb) {
  const hits = (candidates || []).filter(c => c && c.id && nameOk(displayText(c), venueName) && suburbOk(c.addressComponents, suburb));
  if (hits.length === 1) {
    return {
      status: "exact",
      displayName: displayText(hits[0]),
      locality: localityNames(hits[0].addressComponents).join(" | "),
      placeId: hits[0].id
    };
  }
  if (hits.length > 1) {
    return {
      status: "ambiguous",
      displayName: hits.map(displayText).join(" | "),
      locality: hits.map(h => localityNames(h.addressComponents).join(" | ")).join(" | "),
      placeId: ""
    };
  }
  return { status: "none", displayName: "", locality: "", placeId: "" };
}

export function csvEscape(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

export function reviewCsv(rows) {
  const header = ["venueId", "name", "suburb", "googleDisplayName", "googleLocality", "status"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([
      row.venueId,
      row.name,
      row.suburb,
      row.googleDisplayName,
      row.googleLocality,
      row.status
    ].map(csvEscape).join(","));
  }
  return lines.join("\n") + "\n";
}

async function textSearch(key, query) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": MASK
    },
    body: JSON.stringify({ textQuery: query, regionCode: "AU", pageSize: 5 })
  });
  if (!res.ok) throw new Error("Text Search " + res.status);
  const data = await res.json();
  return data.places || [];
}

async function main() {
  const key = process.env.GOOGLE_MAPS_API_KEY || "";
  const write = process.argv.includes("--write");
  let limit = null;
  try { limit = parseLimit(process.argv); }
  catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (!key) {
    console.error("Set GOOGLE_MAPS_API_KEY in the environment. No key is stored in the repo.");
    process.exit(1);
  }

  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(DATA, "utf8"), sandbox);
  const records = sandbox.window.BYO.places;
  const prepared = logic.prepare(sandbox.window.BYO);
  const ids = prepared.places.map(p => p.id);
  const missing = targetsMissingPlaceId(records, ids, null);
  const batch = limit == null ? missing : missing.slice(0, limit);

  let textCalls = 0;
  const rows = [];
  let exact = 0;
  let ambiguous = 0;
  let none = 0;
  for (const item of batch) {
    textCalls++;
    const candidates = await textSearch(key, searchQuery(item.place));
    const match = classify(candidates, item.place.name, item.place.suburb);
    if (match.status === "exact") exact++;
    else if (match.status === "ambiguous") ambiguous++;
    else none++;
    if (write && match.status === "exact") item.place.place_id = match.placeId;
    rows.push({
      venueId: item.id,
      name: item.place.name,
      suburb: item.place.suburb,
      googleDisplayName: match.displayName,
      googleLocality: match.locality,
      status: match.status
    });
    await new Promise(r => setTimeout(r, 150));
  }

  fs.writeFileSync(REVIEW, reviewCsv(rows));
  if (write) {
    const header = fs.readFileSync(DATA, "utf8").split("window.BYO = ")[0];
    fs.writeFileSync(DATA, header + "window.BYO = " + JSON.stringify(sandbox.window.BYO, null, 2) + ";\n");
  }

  console.log(JSON.stringify({
    venues: records.length,
    venuesMissingPlaceId: missing.length,
    considered: batch.length,
    textSearchProRequests: textCalls,
    placeDetailsProRequests: 0,
    exact,
    ambiguous,
    none,
    placeIdsWritten: write ? exact : 0,
    listPriceUsdIfFreeCapAlreadyUsed: listPriceUsd(textCalls, 0),
    reviewFile: "research/place-id-matches.csv",
    note: "Text Search Pro includes 5,000 free requests a month, then $32 per 1,000. A full run of every venue missing a place_id is one request each. Under an unused cap this run is $0. The review file stores a locality name, not a formatted address. Dry run does not change data.js.",
    wrote: write
  }, null, 2));
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
