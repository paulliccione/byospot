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
  research/place-id-matches.csv and research/place-ids.local.json.
  It does not change data.js. The json file is gitignored.
  --write also sets place_id on an exact single match.

  Apply a reviewed sheet with no network calls:
    node research/google-place-ids.mjs --only research/place-id-recheck.txt
    node research/google-place-ids.mjs --apply research/place-id-matches.csv --ids research/place-ids.local.json --skip research/place-id-skip.txt
  A place_id is copied only when the reviewed status is exact or check, the
  venue is not skipped, the googleDisplayName matches the ids file exactly,
  and that file has a place_id.
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
const LOCAL_IDS = new URL("./place-ids.local.json", import.meta.url);
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

export function filterOnly(targets, onlyIds) {
  if (!onlyIds) return targets;
  const want = onlyIds instanceof Set ? onlyIds : new Set(onlyIds);
  return targets.filter(item => want.has(item.id));
}

export function listPriceUsd(textCalls, detailCalls) {
  return Number(((textCalls * 32 + detailCalls * 17) / 1000).toFixed(2));
}

export function localIdsDocument(rows) {
  const doc = {};
  for (const row of rows) {
    doc[row.venueId] = {
      place_id: row.placeId || "",
      googleDisplayName: row.googleDisplayName || "",
      googleLocality: row.googleLocality || "",
      status: row.status || ""
    };
  }
  return doc;
}

export function parseReviewCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
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
  return rows.filter(r => r.some(Boolean)).map(r => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i] || ""; });
    return o;
  });
}

export function parseSkipIds(text) {
  return String(text || "").split(/\r?\n/).map(line => line.trim()).filter(line => line && line.charAt(0) !== "#");
}

export function applyPlaceIds({ places, venueIds, reviewedRows, idMap, skipIds }) {
  const index = new Map();
  venueIds.forEach((id, i) => index.set(id, places[i]));
  const skip = new Set(skipIds || []);
  const skipped = {};
  const changedName = [];
  let written = 0;
  function bump(reason) { skipped[reason] = (skipped[reason] || 0) + 1; }
  for (const row of reviewedRows || []) {
    const status = String(row.status || "").trim();
    const venueId = String(row.venueId || "").trim();
    if (status !== "exact" && status !== "check") { bump("status"); continue; }
    if (skip.has(venueId)) { bump("skip-list"); continue; }
    const stored = idMap ? idMap[venueId] : null;
    if (!stored) { bump("missing-ids-record"); continue; }
    if (String(stored.googleDisplayName || "") !== String(row.googleDisplayName || "")) {
      changedName.push({
        venueId: venueId,
        reviewed: row.googleDisplayName || "",
        ids: stored.googleDisplayName || ""
      });
      bump("changed-name");
      continue;
    }
    if (!stored.place_id) { bump("missing-place-id"); continue; }
    const place = index.get(venueId);
    if (!place) { bump("unknown-venue"); continue; }
    place.place_id = stored.place_id;
    written++;
  }
  return { written: written, skipped: skipped, changedName: changedName };
}

export function normaliseName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function localityNames(components) {
  const want = new Set(["locality", "sublocality", "sublocality_level_1", "postal_town", "neighborhood"]);
  const names = [];
  for (const c of components || []) {
    if ((c.types || []).some(t => want.has(t))) names.push(c.longText || c.shortText || "");
  }
  return names.filter(Boolean);
}
function localityEquals(components, suburb) {
  const want = normaliseName(suburb);
  if (!want) return false;
  return localityNames(components).some(n => normaliseName(n) === want);
}
function nameRelation(venueName, googleName) {
  const ours = normaliseName(venueName);
  const theirs = normaliseName(googleName);
  if (!ours || !theirs) return "other";
  if (ours === theirs) return "equal";
  if (ours.includes(theirs) || theirs.includes(ours)) return "contains";
  return "other";
}
function isExactCandidate(candidate, venueName, suburb) {
  return nameRelation(venueName, displayText(candidate)) !== "other" && localityEquals(candidate.addressComponents, suburb);
}
function candidateScore(candidate, venueName, suburb) {
  const relation = nameRelation(venueName, displayText(candidate));
  let score = localityEquals(candidate.addressComponents, suburb) ? 100 : 0;
  if (relation === "equal") score += 20;
  else if (relation === "contains") score += 10;
  return score;
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

function shownLocality(candidate, suburb) {
  const names = localityNames(candidate.addressComponents);
  const want = normaliseName(suburb);
  const matched = names.find(n => normaliseName(n) === want);
  return matched || names.join(" | ");
}

export function classify(candidates, venueName, suburb) {
  const list = (candidates || []).filter(c => c && c.id);
  if (!list.length) {
    return { status: "none", displayName: "", locality: "", placeId: "", candidates: 0 };
  }
  const exact = list.filter(c => isExactCandidate(c, venueName, suburb));
  if (exact.length === 1) {
    return {
      status: "exact",
      displayName: displayText(exact[0]),
      locality: shownLocality(exact[0], suburb),
      placeId: exact[0].id,
      candidates: list.length
    };
  }
  const best = list.slice().sort((a, b) => candidateScore(b, venueName, suburb) - candidateScore(a, venueName, suburb))[0];
  return {
    status: "check",
    displayName: displayText(best),
    locality: shownLocality(best, suburb),
    placeId: best.id,
    candidates: list.length
  };
}

export function csvEscape(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

export function reviewCsv(rows) {
  const header = ["venueId", "name", "suburb", "googleDisplayName", "googleLocality", "status", "candidates"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([
      row.venueId,
      row.name,
      row.suburb,
      row.googleDisplayName,
      row.googleLocality,
      row.status,
      row.candidates
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

function argValue(flag) {
  const eq = process.argv.find(a => a.startsWith(flag + "="));
  if (eq) return eq.slice(flag.length + 1);
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] || "") : "";
}

function applyFromFiles() {
  const reviewedPath = argValue("--apply");
  const idsPath = argValue("--ids");
  const skipPath = argValue("--skip");
  if (!reviewedPath || !idsPath) {
    console.error("Use --apply <reviewed.csv> --ids <place-ids.local.json> [--skip <ids.txt>]");
    process.exit(1);
  }
  const reviewedRows = parseReviewCsv(fs.readFileSync(reviewedPath, "utf8"));
  const idMap = JSON.parse(fs.readFileSync(idsPath, "utf8"));
  const skipIds = skipPath ? parseSkipIds(fs.readFileSync(skipPath, "utf8")) : [];
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(DATA, "utf8"), sandbox);
  const records = sandbox.window.BYO.places;
  const venueIds = logic.prepare(sandbox.window.BYO).places.map(p => p.id);
  const result = applyPlaceIds({
    places: records,
    venueIds: venueIds,
    reviewedRows: reviewedRows,
    idMap: idMap,
    skipIds: skipIds
  });
  if (result.written) {
    const header = fs.readFileSync(DATA, "utf8").split("window.BYO = ")[0];
    fs.writeFileSync(DATA, header + "window.BYO = " + JSON.stringify(sandbox.window.BYO, null, 2) + ";\n");
  }
  console.log(JSON.stringify({
    written: result.written,
    skipped: result.skipped,
    changedName: result.changedName
  }, null, 2));
}

async function main() {
  if (process.argv.includes("--apply") || process.argv.some(a => a.startsWith("--apply="))) {
    applyFromFiles();
    return;
  }
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
  const onlyPath = argValue("--only");
  const onlyIds = onlyPath ? parseSkipIds(fs.readFileSync(onlyPath, "utf8")) : null;
  const scoped = filterOnly(missing, onlyIds);
  const batch = limit == null ? scoped : scoped.slice(0, limit);

  let textCalls = 0;
  const rows = [];
  let exact = 0;
  let check = 0;
  let none = 0;
  for (const item of batch) {
    textCalls++;
    const candidates = await textSearch(key, searchQuery(item.place));
    const match = classify(candidates, item.place.name, item.place.suburb);
    if (match.status === "exact") exact++;
    else if (match.status === "check") check++;
    else none++;
    if (write && match.status === "exact") item.place.place_id = match.placeId;
    rows.push({
      venueId: item.id,
      name: item.place.name,
      suburb: item.place.suburb,
      googleDisplayName: match.displayName,
      googleLocality: match.locality,
      status: match.status,
      candidates: match.candidates,
      placeId: match.placeId || ""
    });
    await new Promise(r => setTimeout(r, 150));
  }

  fs.writeFileSync(REVIEW, reviewCsv(rows));
  fs.writeFileSync(LOCAL_IDS, JSON.stringify(localIdsDocument(rows), null, 2) + "\n");
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
    check,
    none,
    placeIdsWritten: write ? exact : 0,
    listPriceUsdIfFreeCapAlreadyUsed: listPriceUsd(textCalls, 0),
    reviewFile: "research/place-id-matches.csv",
    idsFile: "research/place-ids.local.json",
    note: "Text Search Pro includes 5,000 free requests a month, then $32 per 1,000. A full run of every venue missing a place_id is one request each. Under an unused cap this run is $0. The review file stores a locality name, not a formatted address. Dry run does not change data.js.",
    wrote: write
  }, null, 2));
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
