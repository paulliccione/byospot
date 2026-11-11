/*
  Attach a Google place_id to unresolved BYOspot venues. Does not store a
  Google address.

  Google Maps Platform caching rules (checked 12 Nov 2026):
  https://developers.google.com/maps/documentation/places/web-service/policies
  Place IDs may be stored indefinitely. Formatted addresses and other Places
  content must not be cached or copied into our data. Latitude and longitude
  from Places may be cached for 30 days only, so this script does not write
  them. If a Google address is ever shown in the app, it has to be fetched at
  view time and carry a Google Maps attribution. This script does neither.

  Pricing (Places API New, same date):
  https://developers.google.com/maps/billing-and-pricing/pricing
  The field mask below is Text Search Pro (and Place Details Pro when a
  place_id already exists). Text Search Pro is $32 per 1,000 requests after
  5,000 free calls a month. Place Details Pro is $17 per 1,000 after 5,000
  free calls a month. Do not add phone, website, reviews, or opening hours to
  the mask: those move the call onto an Enterprise SKU.

  Usage:
    GOOGLE_MAPS_API_KEY=... node research/google-place-ids.mjs
    GOOGLE_MAPS_API_KEY=... node research/google-place-ids.mjs --write

  The key is read from the environment only. Never commit it.
  Default is a dry run. --write sets googlePlaceId on a single clear match
  and leaves the street address as the suburb.
*/
import fs from "fs";
import vm from "vm";

const KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const WRITE = process.argv.includes("--write");
const CSV = new URL("./unresolved-addresses.csv", import.meta.url);
const DATA = new URL("../data.js", import.meta.url);
const MASK = "places.id,places.displayName,places.formattedAddress,places.addressComponents";
const DETAIL_MASK = "id,displayName,formattedAddress,addressComponents";

if (!KEY) {
  console.error("Set GOOGLE_MAPS_API_KEY in the environment. No key is stored in the repo.");
  process.exit(1);
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
function suburbOf(components) {
  const want = new Set(["locality", "sublocality", "sublocality_level_1", "postal_town", "neighborhood"]);
  const names = [];
  for (const c of components || []) {
    if ((c.types || []).some(t => want.has(t))) names.push(c.longText || c.shortText || "");
  }
  return names;
}
function suburbOk(components, suburb) {
  const s = fold(suburb);
  return suburbOf(components).some(n => fold(n) === s || fold(n).includes(s));
}
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter(r => r.length && r.some(Boolean)).map(r => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i] || ""; });
    return o;
  });
}
function stateOf(city) {
  return city === "Melbourne" || city === "Vic Coast" ? "VIC" : "NSW";
}

async function textSearch(query) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": MASK
    },
    body: JSON.stringify({ textQuery: query, regionCode: "AU", pageSize: 5 })
  });
  if (!res.ok) throw new Error("Text Search " + res.status);
  const data = await res.json();
  return data.places || [];
}
async function placeDetails(placeId) {
  const res = await fetch("https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId), {
    headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": DETAIL_MASK }
  });
  if (!res.ok) throw new Error("Place Details " + res.status);
  return res.json();
}

const unresolved = parseCsv(fs.readFileSync(CSV, "utf8"));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(DATA, "utf8"), sandbox);
const places = sandbox.window.BYO.places;
const byName = new Map();
places.forEach((p, i) => byName.set(fold(p.name) + "|" + fold(p.suburb), i));

let textCalls = 0;
let detailCalls = 0;
let linked = 0;
const review = [];

for (const row of unresolved) {
  const idx = byName.get(fold(row.name) + "|" + fold(row.suburb));
  const place = idx == null ? null : places[idx];
  if (!place || place.addressSource !== "suburb-only") continue;
  const state = stateOf(place.city);
  let candidates = [];
  if (place.googlePlaceId) {
    detailCalls++;
    const one = await placeDetails(place.googlePlaceId);
    candidates = [one];
  } else {
    textCalls++;
    candidates = await textSearch(place.name + " " + place.suburb + " " + state + " Australia");
  }
  const hits = candidates.filter(c => nameOk((c.displayName && c.displayName.text) || "", place.name) && suburbOk(c.addressComponents, place.suburb));
  if (hits.length === 1 && hits[0].id) {
    linked++;
    if (WRITE) place.googlePlaceId = hits[0].id;
    // formattedAddress was used only to validate. It is not stored.
  } else {
    review.push({ name: place.name, suburb: place.suburb, hits: hits.length });
  }
  await new Promise(r => setTimeout(r, 150));
}

if (WRITE) {
  const header = fs.readFileSync(DATA, "utf8").split("window.BYO = ")[0];
  fs.writeFileSync(DATA, header + "window.BYO = " + JSON.stringify(sandbox.window.BYO, null, 2) + ";\n");
}

const listPrice = (textCalls * 32 + detailCalls * 17) / 1000;
console.log(JSON.stringify({
  unresolved: unresolved.length,
  textSearchProRequests: textCalls,
  placeDetailsProRequests: detailCalls,
  placeIdsLinked: linked,
  needsManualReview: review.length,
  listPriceUsdIfFreeCapAlreadyUsed: Number(listPrice.toFixed(2)),
  note: "Text Search Pro includes 5,000 free requests a month, then $32 per 1,000. Place Details Pro includes 5,000 free requests a month, then $17 per 1,000. Under an unused cap this run is $0. Formatted addresses were not written.",
  wrote: WRITE
}, null, 2));
