import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import {
  parseLimit,
  targetsMissingPlaceId,
  filterOnly,
  listPriceUsd,
  classify,
  normaliseName,
  reviewCsv,
  localIdsDocument,
  applyPlaceIds
} from "../research/google-place-ids.mjs";

const require = createRequire(import.meta.url);
const logic = require("../logic.js");

test("every venue missing a place id is selected, and a limit trims the batch", function () {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL("../data.js", import.meta.url), "utf8"), sandbox);
  const prepared = logic.prepare(sandbox.window.BYO);
  const ids = prepared.places.map(function (p) { return p.id; });
  const all = targetsMissingPlaceId(sandbox.window.BYO.places, ids, null);
  assert.equal(all.length, 12);
  assert.equal(targetsMissingPlaceId(sandbox.window.BYO.places, ids, 5).length, 5);
  const only = filterOnly(all, ["arte-bianca-double-bay", "missing-id"]);
  assert.deepEqual(only.map(function (item) { return item.id; }), ["arte-bianca-double-bay"]);
});

function place(id, name, locality) {
  return {
    id: id,
    displayName: { text: name },
    formattedAddress: "1 Example Street, " + locality,
    addressComponents: [{ longText: locality, types: ["locality"] }]
  };
}

test("the name normaliser drops accents, punctuation and extra space", function () {
  assert.equal(normaliseName("Café & Bar..."), "cafe and bar");
  assert.equal(normaliseName("  O'Connor-Hill,  "), "o connor hill");
  assert.equal(normaliseName("Chinta   Ria + Buddha"), "chinta ria buddha");
  assert.equal(normaliseName("Maydanoz"), "maydanoz");
});

test("exact needs one locality match whose names are equal or contained", function () {
  const same = classify(
    [place("ChIJchinta000001", "Chinta Ria Buddha Love", "Haymarket")],
    "Chinta Ria Buddha Love",
    "Haymarket"
  );
  assert.equal(same.status, "exact");
  assert.equal(same.placeId, "ChIJchinta000001");
  assert.equal(same.candidates, 1);
  const contained = classify(
    [place("ChIJmaydanoz0001", "Maydanoz Restaurant Bar", "Sydney")],
    "Maydanoz",
    "Sydney"
  );
  assert.equal(contained.status, "exact");
  assert.equal(contained.placeId, "ChIJmaydanoz0001");
  const plusUnrelated = classify(
    [
      place("ChIJchinta000001", "Chinta Ria Buddha Love", "Haymarket"),
      place("ChIJother0000001", "Somewhere Else", "Haymarket")
    ],
    "Chinta Ria Buddha Love",
    "Haymarket"
  );
  assert.equal(plusUnrelated.status, "exact");
  assert.equal(plusUnrelated.placeId, "ChIJchinta000001");
  assert.equal(plusUnrelated.candidates, 2);
});

test("partial names and extra hits are check, and no hit is none", function () {
  const charles = classify(
    [place("ChIJcharles00001", "The Charles Brasserie and Bar", "Sydney")],
    "The Charles Grand Brasserie",
    "Sydney"
  );
  assert.equal(charles.status, "check");
  assert.equal(charles.placeId, "ChIJcharles00001");
  assert.equal(charles.displayName, "The Charles Brasserie and Bar");
  assert.equal(charles.candidates, 1);
  const menya = classify(
    [place("ChIJmenya0000001", "Menya City Japanese Noodle Bar", "Sydney")],
    "Menya Noodle Bar",
    "Sydney"
  );
  assert.equal(menya.status, "check");
  assert.equal(menya.placeId, "ChIJmenya0000001");
  const two = classify(
    [
      place("ChIJmaydanoz0001", "Maydanoz Restaurant Bar", "Sydney"),
      place("ChIJmaydanoz0002", "Maydanoz", "Sydney")
    ],
    "Maydanoz",
    "Sydney"
  );
  assert.equal(two.status, "check");
  assert.equal(two.placeId, "ChIJmaydanoz0002");
  assert.equal(two.displayName, "Maydanoz");
  assert.equal(two.candidates, 2);
  const none = classify([], "Hikaru", "Newtown");
  assert.equal(none.status, "none");
  assert.equal(none.displayName, "");
  assert.equal(none.candidates, 0);
  assert.equal(none.formattedAddress, undefined);
});

test("the review file lists candidates and no formatted address", function () {
  const csv = reviewCsv([{
    venueId: "hikaru-newtown",
    name: "Hikaru",
    suburb: "Newtown",
    googleDisplayName: "Hikaru",
    googleLocality: "Newtown",
    status: "exact",
    candidates: 1,
    formattedAddress: "should not be written"
  }]);
  assert.match(csv, /^venueId,name,suburb,googleDisplayName,googleLocality,status,candidates\n/);
  assert.match(csv, /hikaru-newtown,Hikaru,Newtown,Hikaru,Newtown,exact,1\n/);
  assert.equal(csv.includes("formattedAddress"), false);
  assert.equal(csv.includes("George"), false);
  const quoted = reviewCsv([{
    venueId: "a",
    name: 'Fish "and" chips',
    suburb: "A, B",
    googleDisplayName: "",
    googleLocality: "",
    status: "none",
    candidates: 0
  }]);
  assert.match(quoted, /"Fish ""and"" chips","A, B"/);
});

test("apply copies a place id only when the reviewed name still matches", function () {
  const places = [{ name: "Chiswick" }, { name: "Arte Bianca" }, { name: "Closed" }];
  const venueIds = ["chiswick-woollahra", "arte-bianca-double-bay", "somewhere"];
  const idMap = {
    "chiswick-woollahra": { place_id: "ChIJoceanst0001", googleDisplayName: "65 Ocean St", googleLocality: "Woollahra", status: "check" },
    "arte-bianca-double-bay": { place_id: "ChIJarte0000001", googleDisplayName: "Arte Bianca", googleLocality: "Double Bay", status: "exact" },
    "somewhere": { place_id: "", googleDisplayName: "Somewhere", googleLocality: "", status: "none" }
  };
  const rows = [
    { venueId: "chiswick-woollahra", status: "check", googleDisplayName: "65 Ocean St" },
    { venueId: "arte-bianca-double-bay", status: "exact", googleDisplayName: "Arte Bianca" },
    { venueId: "somewhere", status: "none", googleDisplayName: "" },
    { venueId: "chiswick-woollahra", status: "check", googleDisplayName: "Chiswick" }
  ];
  const result = applyPlaceIds({
    places: places,
    venueIds: venueIds,
    reviewedRows: rows,
    idMap: idMap,
    skipIds: ["arte-bianca-double-bay"]
  });
  assert.equal(places[0].place_id, "ChIJoceanst0001");
  assert.equal(places[0].googleDisplayName, undefined);
  assert.equal(places[1].place_id, undefined);
  assert.equal(places[2].place_id, undefined);
  assert.equal(result.written, 1);
  assert.equal(result.skipped["skip-list"], 1);
  assert.equal(result.skipped.status, 1);
  assert.equal(result.changedName.length, 1);
  assert.equal(result.changedName[0].venueId, "chiswick-woollahra");
  assert.equal(result.changedName[0].reviewed, "Chiswick");
  assert.equal(result.changedName[0].ids, "65 Ocean St");
  const doc = localIdsDocument([{
    venueId: "chiswick-woollahra",
    placeId: "ChIJoceanst0001",
    googleDisplayName: "65 Ocean St",
    googleLocality: "Woollahra",
    status: "check"
  }]);
  assert.deepEqual(doc["chiswick-woollahra"], {
    place_id: "ChIJoceanst0001",
    googleDisplayName: "65 Ocean St",
    googleLocality: "Woollahra",
    status: "check"
  });
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
