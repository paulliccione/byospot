import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const card = require("../card.js");

function acts(html) {
  return (html.match(/data-act="1"/g) || []).length;
}

const full = {
  id: "la-favola-newtown",
  name: "La Favola",
  cuisine: "Italian",
  location: "Newtown",
  distance: "650 m away",
  byoLabel: "BYO Sun–Thu",
  corkage: "$18 (wine)",
  stars: 4.6,
  reviewsLabel: "2,474",
  address: "170 King Street, Newtown NSW",
  directions: "https://www.google.com/maps/dir/?api=1&destination=170%20King",
  website: "http://www.favola.com.au",
  phone: "tel:+61295505555",
  price: "~$$$",
  takeaway: "Takeaway available",
  takeawayDetail: "Counter",
  byoDays: "Sunday, Monday, Tuesday, Wednesday, Thursday",
  note: "BYO wine only",
  bookingUrl: "https://example.com/book",
  shops: [{ label: "Nearest chain", name: "Shop", distance: "400 m", url: "https://www.google.com/maps/dir/?api=1&destination=1,2" }]
};

test("one card hides missing facts and never invents them", function () {
  const html = card.render({ id: "only", name: "Only Name", byoLabel: "Call to confirm" }, { mode: "results" });
  assert.match(html, /Only Name/);
  assert.match(html, /Call to confirm/);
  assert.match(html, /is-call/);
  assert.equal(html.includes("rcard-address"), false);
  assert.equal(html.includes("rcard-rating"), false);
  assert.equal(html.includes("rcard-cork"), false);
  assert.equal(html.includes("Google"), false);
  assert.equal(html.includes("Book a table"), false);
  assert.equal(html.includes("Directions"), false);
  assert.equal(html.includes("Corkage"), false);
  assert.ok(acts(html) <= 3);
  assert.equal(html.includes("M14 8h20"), false);
});

test("results, picker and vote share the card and keep corkage, status, rating and address", function () {
  ["results", "pick", "vote"].forEach(function (mode) {
    const html = card.render(full, { mode: mode, pressed: mode !== "results" });
    assert.match(html, new RegExp('data-mode="' + mode + '"'));
    assert.match(html, /La Favola/);
    assert.match(html, /BYO Sun–Thu/);
    assert.match(html, /is-days/);
    assert.match(html, /Corkage · \$18 \(wine\)/);
    assert.match(html, /4\.6 · 2,474 Google reviews/);
    assert.match(html, /170 King Street, Newtown NSW/);
    assert.match(html, /Italian · Newtown · 650 m away/);
    assert.match(html, /class="rcard-address"/);
    assert.equal(html.includes("<u"), false);
    assert.equal(html.includes("text-decoration:underline"), false);
    assert.ok(acts(html) <= 3, mode + " actions " + acts(html));
    assert.match(html, /Book a table/);
    assert.equal((html.match(/class="thumb"|mark-glass|M14 8h20/g) || []).length, 0);
  });
  const picked = card.render(full, { mode: "pick", pressed: true });
  assert.match(picked, /data-action="toggle"/);
  const voting = card.render(full, { mode: "vote", pressed: false });
  assert.match(voting, /data-action="pick-vote"/);
  const locked = card.render(full, { mode: "vote", pressed: true, interactive: false });
  assert.equal(locked.includes('data-action="pick-vote"'), false);
  assert.match(locked, /aria-pressed="true"/);
});

test("status pills stay distinct and confirmed styling needs that label", function () {
  assert.match(card.render({ id: "a", name: "A", byoLabel: "BYO tonight" }, { mode: "results" }), /is-confirmed/);
  assert.match(card.render({ id: "a", name: "A", byoLabel: "BYO confirmed" }, { mode: "results" }), /is-confirmed/);
  assert.match(card.render({ id: "a", name: "A", byoLabel: "BYO Fri–Sat" }, { mode: "results" }), /is-days/);
  const call = card.render({ id: "a", name: "A", byoLabel: "Call to confirm" }, { mode: "results" });
  assert.match(call, /is-call/);
  assert.equal(call.includes("is-confirmed"), false);
});

test("detail collapses empty rows and shows booking only when a url exists", function () {
  const bare = card.renderDetail({ id: "x", name: "Plain", byoLabel: "Call to confirm" });
  assert.match(bare, /Plain/);
  assert.match(bare, /Call to confirm/);
  assert.equal(bare.includes("venue-address"), false);
  assert.equal(bare.includes("venue-rating"), false);
  assert.equal(bare.includes("venue-cork"), false);
  assert.equal(bare.includes("Book a table"), false);
  assert.equal(bare.includes("Known for"), false);
  assert.equal(bare.includes("venue-bar"), false);
  const rich = card.renderDetail(full);
  assert.match(rich, /Corkage · \$18 \(wine\)/);
  assert.match(rich, /4\.6 · 2,474 Google reviews/);
  assert.match(rich, /170 King Street/);
  assert.match(rich, /class="venue-address"/);
  assert.match(rich, /Book a table/);
  assert.match(rich, /Takeaway available · Counter/);
  assert.match(rich, /BYO days/);
  assert.match(rich, /Bottle shops within 2 km/);
  assert.match(rich, /logos\/byospot-logo-teal\.svg/);
  const secondary = rich.split('data-row="secondary"')[1].split('data-row="primary"')[0];
  assert.ok((secondary.match(/data-act="1"/g) || []).length <= 3);
  assert.equal(rich.includes("<u"), false);
});

test("address without directions is text, and a directions link is not underlined in css", function () {
  const text = card.render({ id: "a", name: "A", address: "Newtown", byoLabel: "BYO confirmed" }, { mode: "results" });
  assert.match(text, /<p class="rcard-address">Newtown<\/p>/);
  assert.equal(text.includes("<a class=\"rcard-address\""), false);
  const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
  assert.match(css, /a\.rcard-address, a\.venue-address \{[^}]*text-decoration:\s*none/);
  assert.match(css, /\.rcard-act, \.venue-act \{[^}]*min-height:\s*44px/);
  assert.match(css, /a\.rcard-address, a\.venue-address \{[^}]*min-height:\s*44px/);
  assert.match(css, /\.venue-back \{[^}]*height:\s*44px/);
  assert.match(css, /\.venue-shop \{[^}]*min-height:\s*44px/);
});

test("app wires every surface through the same component and bumps the cache", function () {
  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const cardFn = app.slice(app.indexOf("function cardHtml"), app.indexOf("function nearestMode"));
  assert.match(cardFn, /BYOCard\.render/);
  assert.equal(cardFn.indexOf("glass"), -1);
  assert.match(app.slice(app.indexOf("function selectHtml"), app.indexOf("function steps")), /mode: "pick"/);
  assert.match(app.slice(app.indexOf("function voteHtml"), app.indexOf("function legacyHtml")), /mode: "vote"/);
  assert.match(app.slice(app.indexOf("function detailSheet"), app.indexOf("function filtersSheet")), /BYOCard\.renderDetail/);
  assert.match(app, /No BYO restaurants in /);
  assert.match(app, /Here are the closest BYO spots/);
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.equal(sw.match(/VERSION = "([^"]+)"/)[1], "byo-2026-11-12f");
  assert.equal(sw.indexOf("localities.json"), -1);
  assert.match(sw, /card\.js/);
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(html.indexOf("card.js") < html.indexOf("app.js"));
});
