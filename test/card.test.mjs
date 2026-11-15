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
  placeId: "ChIJtestPlaceId0001",
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

test("a card never prints a stored rating and omits the widget without a place id", function () {
  const stored = card.render({ id: "a", name: "A", stars: 4.6, reviewsLabel: "2,474", byoLabel: "BYO confirmed" }, { mode: "results" });
  assert.equal(stored.includes("4.6"), false);
  assert.equal(stored.includes("2,474"), false);
  assert.equal(stored.includes("gmp-place-rating"), false);
  assert.equal(stored.includes("gmp-place-reviews"), false);
  const detail = card.renderDetail({ id: "a", name: "A", stars: 4.2, reviewsLabel: "10" });
  assert.equal(detail.includes("4.2"), false);
  assert.equal(detail.includes("gmp-place-rating"), false);
});

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

test("results, picker and vote share the card and keep corkage, status and address", function () {
  ["results", "pick", "vote"].forEach(function (mode) {
    const html = card.render(full, { mode: mode, pressed: mode !== "results" });
    assert.match(html, new RegExp('data-mode="' + mode + '"'));
    assert.match(html, /La Favola/);
    assert.match(html, /BYO Sun–Thu/);
    assert.match(html, /is-days/);
    assert.match(html, /Corkage · \$18 \(wine\)/);
    assert.equal(html.includes("gmp-place-rating"), false);
    assert.equal(html.includes("gmp-place-attribution"), false);
    assert.equal(html.includes("gmp-place-reviews"), false);
    assert.match(html, /170 King Street, Newtown NSW/);
    assert.match(html, /Italian · Newtown · 650 m away/);
    assert.match(html, /class="rcard-address"/);
    assert.equal(html.includes("<u"), false);
    assert.equal(html.includes("text-decoration:underline"), false);
    assert.ok(acts(html) <= 3, mode + " actions " + acts(html));
    assert.match(html, /Book a table/);
    assert.equal(html.includes("venue-hero"), false);
    assert.equal((html.match(/class="thumb"|mark-glass|M14 8h20/g) || []).length, 0);
  });
  const listed = card.render(full, { mode: "results" });
  assert.equal((listed.match(/href="\/venue\/la-favola-newtown"/g) || []).length, 2);
  assert.equal(listed.includes("gmp-place-rating"), false);
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
  assert.match(rich, /<gmp-place-rating><\/gmp-place-rating>/);
  assert.match(rich, /gmp-place-attribution/);
  assert.equal(rich.includes("gmp-place-reviews"), false);
  assert.equal(rich.includes("gmp-place-review-summary"), false);
  assert.equal(rich.includes("gmp-place-summary"), false);
  assert.equal(rich.includes("4.6"), false);
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

test("venue detail shows the mint cuisine panel and no photos", function () {
  const italian = card.renderDetail({ id: "la-favola-newtown", name: "La Favola", cuisine: "Italian" });
  const long = card.renderDetail({ id: "arabella-newtown", name: "Arabella", cuisine: "Middle Eastern (Lebanese)" });
  const bare = card.renderDetail({ id: "x", name: "Plain" });
  const cardHtml = card.render(full, { mode: "results" });
  [italian, long, bare, cardHtml].forEach(function (html) {
    assert.equal(html.includes("Illustrative photo"), false);
    assert.equal(html.includes("images/cuisine"), false);
  });
  function hero(html) {
    const start = html.indexOf('<div class="venue-hero"');
    assert.ok(start > html.indexOf('class="venue-top"'));
    assert.ok(start < html.indexOf('class="venue-name"'));
    return html.slice(start, html.indexOf("</div>", start));
  }
  const italianHero = hero(italian);
  assert.match(italianHero, /aria-hidden="true"/);
  assert.match(italianHero, /M8 3v6M12 3v6M16 3v6/);
  assert.match(italianHero, /<span>Italian<\/span>/);
  const longHero = hero(long);
  assert.match(longHero, /<span>Middle Eastern \(Lebanese\)<\/span>/);
  const bareHero = hero(bare);
  assert.match(bareHero, /M8 3v6M12 3v6M16 3v6/);
  assert.equal(bareHero.includes("<span"), false);
  assert.equal(cardHtml.includes("venue-hero"), false);
  assert.match(italian, /La Favola/);
  assert.match(italian, /logos\/byospot-logo-teal\.svg/);
  assert.equal((italian.match(/<img\b/g) || []).length, 1);
  assert.equal((long.match(/<img\b/g) || []).length, 1);
  assert.equal((bare.match(/<img\b/g) || []).length, 1);
  assert.equal((cardHtml.match(/<img\b/g) || []).length, 0);
  assert.equal(card.cuisineGroup, undefined);
  const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
  assert.match(css, /\.venue-hero \{[^}]*height:\s*156px/);
  assert.match(css, /\.venue-hero \{[^}]*background:\s*#C7F1DC/);
  assert.match(css, /\.venue-hero \{[^}]*color:\s*#064E50/);
  assert.match(css, /\.venue-hero svg \{[^}]*width:\s*44px;\s*height:\s*44px/);
  assert.equal(fs.existsSync(new URL("../images/cuisine", import.meta.url)), false);
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
  assert.equal(sw.match(/VERSION = "([^"]+)"/)[1], "byo-2026-11-15d4");
  assert.ok(sw.match(/VERSION = "([^"]+)"/)[1] > "byo-2026-11-15c2");
  assert.match(sw, /maps\.js/);
  assert.match(sw, /config\.js/);
  const resultsFn = app.slice(app.indexOf("function resultsHtml"), app.indexOf("function activeFilterCount"));
  assert.equal(resultsFn.includes("count-line"), false);
  assert.equal(resultsFn.includes("sort-note"), false);
  assert.equal(resultsFn.includes("area-back"), false);
  assert.equal(resultsFn.includes("toolbar"), false);
  assert.match(resultsFn, /resultsHero\(true\)/);
  assert.equal(resultsFn.includes("areaControl"), false);
  assert.equal(resultsFn.includes("areaBanner"), false);
  assert.match(app, /id="resultSort"/);
  assert.match(app, /class="filters-btn"/);
  assert.match(app, /Where should<br>we eat\?/);
  assert.match(app, /go\("\/venue\/" \+ id\)/);
  const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
  assert.match(css, /\.results-hero \{[^}]*background:\s*#C7F1DC/);
  assert.match(app.slice(app.indexOf("function shareHtml"), app.indexOf("function voteHtml")), /screen-share/);
  assert.match(app.slice(app.indexOf("function voteHtml"), app.indexOf("function legacyHtml")), /screen-vote/);
  const cardSrc = fs.readFileSync(new URL("../card.js", import.meta.url), "utf8");
  assert.equal(cardSrc.includes("rcard-rating"), false);
  assert.equal(cardSrc.includes("function ratingSlot"), false);
  assert.match(cardSrc, /href="\/venue\/' \+ esc\(view\.id\)/);
  assert.match(sw, /icons\/icon-v2-512\.png/);
  assert.match(sw, /icons\/icon-v2-maskable-512\.png/);
  assert.equal(sw.indexOf("images/cuisine"), -1);
  assert.equal(sw.indexOf("localities.json"), -1);
  assert.match(sw, /card\.js/);
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(html.indexOf("card.js") < html.indexOf("app.js"));
});
