import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createPoll, castVote, publicView, summarizeTallies } from "../poll-core.mjs";

const require = createRequire(import.meta.url);
const logic = require("../logic.js");

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../data.js", import.meta.url), "utf8"), sandbox);
const data = sandbox.window.BYO;
const model = logic.prepare(data);

test("stable ids match the previous shortlist scheme", function () {
  assert.equal(model.byId["maydanoz-sydney"].name, "Maydanoz");
  assert.equal(model.byId["kafe-kooks-the-house-of-roti-ultimo"].suburb, "Ultimo");
  assert.equal(model.byId["lil-franky-pizzeria-tempe"].name, "Lil Franky Pizzeria");
  assert.ok(model.byId["mister-truong-s-brunswick-west-north-north-west"]);
  assert.equal(model.places.length, data.places.length);
});

test("unknown price and corkage are omitted and confirmation is not invented", function () {
  const unknown = model.places.find(function (p) { return p.price === "?" && /^unknown$/i.test(p.corkage) && p.byoConfirmed === false; });
  const view = logic.presentPlace(unknown);
  assert.equal(view.price, "");
  assert.equal(view.corkage, "");
  assert.equal(view.byo.label, "BYO listed — call to confirm");
  assert.equal(view.byo.tone, "listed");
  const confirmed = model.places.find(function (p) { return p.byoConfirmed === true && logic.corkageText(p); });
  const confirmedView = logic.presentPlace(confirmed);
  assert.equal(confirmedView.byo.label, "BYO confirmed");
  assert.equal(confirmedView.byo.tone, "confirmed");
  assert.ok(confirmedView.corkage);
  assert.equal(confirmedView.rank, undefined);
});

test("directions use the stored address and hide suburb-only records", function () {
  const may = model.byId["maydanoz-sydney"];
  const url = logic.directionsUrl(may);
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
  assert.ok(decodeURIComponent(url.split("destination=")[1]).indexOf(may.address) === 0);
  const vague = model.places.find(function (p) { return p.address === "Chatswood NSW"; });
  assert.equal(logic.directionsUrl(vague), "");
  assert.equal(logic.addressRoutable("Cnr Thurlow And Bourke Streets, Redfern NSW"), true);
});

test("location search disambiguates, fuzzy-matches, and separates unknown places", function () {
  const newtown = logic.searchLocations("newtown", model.index);
  assert.ok(newtown.some(function (item) { return item.name === "Newtown" && item.count > 0; }));
  const richmond = logic.searchLocations("Richmond", model.index).filter(function (item) { return item.name === "Richmond"; });
  assert.ok(richmond.length >= 2);
  assert.notEqual(richmond[0].context, richmond[1].context);
  const fuzzy = logic.searchLocations("newtowm", model.index);
  assert.equal(fuzzy[0].name, "Newtown");
  const brisbane = logic.searchLocations("Brisbane", model.index);
  assert.equal(brisbane[0].name, "Brisbane");
  assert.equal(brisbane[0].count, 0);
  assert.equal(logic.searchLocations("asdfqwerzz", model.index).length, 0);
  const nsw = logic.searchLocations("nsw", model.index);
  assert.equal(nsw[0].name, "New South Wales");
});

test("browse can stop at state, region, or suburb", function () {
  const states = logic.browse(model.index, { level: "states" });
  assert.deepEqual(states.rows.map(function (r) { return r.label; }), ["New South Wales", "Victoria"]);
  const nsw = logic.browse(model.index, { level: "state", state: "NSW" });
  assert.match(nsw.showAll.label, /New South Wales/);
  assert.ok(nsw.rows.some(function (r) { return r.label === "Sydney"; }));
  const sydney = logic.browse(model.index, { level: "city", state: "NSW", city: "Sydney" });
  assert.match(sydney.showAll.label, /Sydney/);
  assert.ok(sydney.rows.some(function (r) { return r.label === "Inner West"; }));
  const inner = logic.browse(model.index, { level: "region", state: "NSW", city: "Sydney", region: "Inner West" });
  assert.match(inner.showAll.label, /Inner West/);
  assert.ok(inner.rows.some(function (r) { return r.label === "Newtown" && r.area; }));
  const allNsw = nsw.showAll.area;
  assert.ok(logic.countArea(model.places, allNsw) > 700);
  assert.equal(logic.countArea(model.places, brisbaneArea()), 0);
});

function brisbaneArea() {
  return logic.searchLocations("Brisbane", model.index)[0].area;
}

test("near me sorts by distance and a region defaults to A–Z", function () {
  const area = { near: true, label: "Near you" };
  const filters = logic.blankFilters();
  const list = logic.filterPlaces(model.places, area, filters, { lat: -33.87, lng: 151.21 });
  assert.ok(list.length > 10);
  assert.ok(list[0]._dist <= list[1]._dist);
  assert.equal(logic.sortLabel("", area), "Nearest first");
  const region = { state: "NSW", stateName: "New South Wales", city: "Sydney", cityLabel: "Sydney", region: "Inner West", label: "Inner West" };
  const alpha = logic.filterPlaces(model.places, region, logic.blankFilters(), null);
  assert.ok(alpha[0].name.localeCompare(alpha[1].name) <= 0);
  assert.equal(logic.sortLabel("", region), "Sorted A–Z");
  const rated = logic.filterPlaces(model.places, region, Object.assign(logic.blankFilters(), { sort: "rating" }), null);
  assert.ok(rated[0].stars >= rated[rated.length - 1].stars);
});

test("polls require two restaurants, persist a vote once, and can tie", function () {
  const bad = createPoll(["only-one"]);
  assert.equal(bad.ok, false);
  const made = createPoll(["maydanoz-sydney", "lil-franky-pizzeria-tempe", "maydanoz-sydney"]);
  assert.equal(made.ok, true);
  assert.equal(made.poll.restaurantIds.length, 2);
  assert.equal(made.poll.status, "open");
  const vote = castVote(made.poll, { restaurantId: "maydanoz-sydney", participantToken: "voter-token-1" });
  assert.equal(vote.ok, true);
  const again = castVote(vote.poll, { restaurantId: "lil-franky-pizzeria-tempe", participantToken: "voter-token-1" });
  assert.equal(again.ok, false);
  assert.equal(again.status, 409);
  const other = castVote(vote.poll, { restaurantId: "lil-franky-pizzeria-tempe", participantToken: "voter-token-2" });
  assert.equal(other.ok, true);
  const view = publicView(other.poll, "voter-token-2");
  assert.equal(view.myVote, "lil-franky-pizzeria-tempe");
  assert.equal(view.tallies["maydanoz-sydney"], 1);
  assert.equal(view.tallies["lil-franky-pizzeria-tempe"], 1);
  assert.equal(view.summary.kind, "tie");
  assert.equal(JSON.stringify(view).indexOf("voter-token"), -1);
  assert.equal(summarizeTallies({ a: 2, b: 2 }, ["a", "b"]).kind, "tie");
});

test("removed product copy is gone from the client", function () {
  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
  ["Plan a night", "Top 3", "Shortlist 0/3", "Corkage vs wine", "Price ?", "Add ~3"].forEach(function (phrase) {
    assert.equal(app.indexOf(phrase), -1, phrase);
    assert.equal(html.indexOf(phrase), -1, phrase);
    assert.equal(css.indexOf(phrase), -1, phrase);
  });
  assert.match(app, /Great food\./);
  assert.match(app, /Find your next BYO restaurant\./);
  assert.match(app, /Find BYO Near Me/);
  assert.match(app, /Choose a Location/);
  assert.match(app, /Where Should We Eat\?/);
  assert.match(app, /Put It to a Vote/);
  assert.match(app, /Tick the restaurants you’d like your friends to choose between\./);
  assert.match(app, /Where should we eat\?/);
});
