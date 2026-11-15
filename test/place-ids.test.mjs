import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import {
  parseLimit,
  targetsMissingPlaceId,
  listPriceUsd,
  classify,
  reviewCsv
} from "../research/google-place-ids.mjs";

const require = createRequire(import.meta.url);
const logic = require("../logic.js");

test("every venue missing a place id is selected, and a limit trims the batch", function () {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL("../data.js", import.meta.url), "utf8"), sandbox);
  const prepared = logic.prepare(sandbox.window.BYO);
  const ids = prepared.places.map(function (p) { return p.id; });
  const all = targetsMissingPlaceId(sandbox.window.BYO.places, ids, null);
  assert.equal(all.length, 1046);
  assert.equal(all[0].id, prepared.places[0].id);
  assert.equal(targetsMissingPlaceId(sandbox.window.BYO.places, ids, 5).length, 5);
  const withId = sandbox.window.BYO.places.map(function (p, i) {
    return i === 0 ? Object.assign({}, p, { place_id: "ChIJalreadySet01" }) : p;
  });
  assert.equal(targetsMissingPlaceId(withId, ids, null).length, 1045);
});

test("classify keeps an exact place id and never a formatted address", function () {
  const hit = {
    id: "ChIJexactPlace01",
    displayName: { text: "Hikaru" },
    formattedAddress: "1 George St, Sydney NSW",
    addressComponents: [{ longText: "Newtown", types: ["locality"] }]
  };
  const other = {
    id: "ChIJotherPlace01",
    displayName: { text: "Hikaru" },
    formattedAddress: "2 King St, Newtown NSW",
    addressComponents: [{ longText: "Newtown", types: ["locality"] }]
  };
  const exact = classify([hit], "Hikaru", "Newtown");
  assert.equal(exact.status, "exact");
  assert.equal(exact.placeId, "ChIJexactPlace01");
  assert.equal(exact.locality, "Newtown");
  assert.equal(exact.formattedAddress, undefined);
  const ambiguous = classify([hit, other], "Hikaru", "Newtown");
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.placeId, "");
  const none = classify([hit], "Hikaru", "Bondi");
  assert.equal(none.status, "none");
  assert.equal(none.displayName, "");
});

test("the review file has the six columns and no formatted address", function () {
  const csv = reviewCsv([{
    venueId: "hikaru-newtown",
    name: "Hikaru",
    suburb: "Newtown",
    googleDisplayName: "Hikaru",
    googleLocality: "Newtown",
    status: "exact",
    formattedAddress: "should not be written"
  }]);
  assert.match(csv, /^venueId,name,suburb,googleDisplayName,googleLocality,status\n/);
  assert.match(csv, /hikaru-newtown,Hikaru,Newtown,Hikaru,Newtown,exact\n/);
  assert.equal(csv.includes("formattedAddress"), false);
  assert.equal(csv.includes("George"), false);
  const quoted = reviewCsv([{
    venueId: "a",
    name: 'Fish "and" chips',
    suburb: "A, B",
    googleDisplayName: "",
    googleLocality: "",
    status: "none"
  }]);
  assert.match(quoted, /"Fish ""and"" chips","A, B"/);
});

test("a full run is one Text Search each and the list price is the paid rate", function () {
  assert.equal(listPriceUsd(1046, 0), 33.47);
  assert.equal(listPriceUsd(649, 0), 20.77);
  assert.throws(function () { parseLimit(["--limit", "0"]); });
  assert.equal(parseLimit(["--limit", "5"]), 5);
  assert.equal(parseLimit(["--limit=12"]), 12);
  assert.equal(parseLimit([]), null);
  const src = fs.readFileSync(new URL("../research/google-place-ids.mjs", import.meta.url), "utf8");
  assert.equal(src.includes("unresolved-addresses.csv"), false);
  assert.equal(src.includes("places.formattedAddress"), false);
});
