import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import core from "../submission-core.js";
import { RATE_MAX } from "../report-core.mjs";
import { handleSubmission, loadVenueCatalog, clearVenueCatalogCache } from "../netlify/functions/submit.mjs";

const require = createRequire(import.meta.url);
const logic = require("../logic.js");

const ARTHUR = "arthur-surry-hills";

function loadData() {
  const text = fs.readFileSync(new URL("../data.js", import.meta.url), "utf8");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(text.slice(start, end + 1));
}

function memoryStore() {
  const data = new Map();
  return {
    data,
    async get(key) {
      if (!data.has(key)) return null;
      return JSON.parse(JSON.stringify(data.get(key)));
    },
    async setJSON(key, value) {
      data.set(key, JSON.parse(JSON.stringify(value)));
      return { modified: true };
    }
  };
}

function post(body, ip) {
  return new Request("https://byospot.test/.netlify/functions/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nf-client-connection-ip": ip || "203.0.113.10"
    },
    body: JSON.stringify(body)
  });
}

function diner(extra) {
  return Object.assign({
    type: "diner",
    restaurantName: "Arthur",
    suburb: "Surry Hills",
    bring: "Wine",
    byoDays: "Some days",
    corkageKind: "amount",
    corkageAmount: "$35",
    source: "https://www.arthurrestaurant.com/menu",
    email: "guest@example.com",
    company: ""
  }, extra || {});
}

function venue(extra) {
  return Object.assign({
    type: "venue",
    venueName: "Arthur",
    venueSlug: ARTHUR,
    contactName: "Alex Lee",
    role: "Owner",
    email: "alex@arthurrestaurant.com",
    phone: "0400 000 000",
    website: "https://www.arthurrestaurant.com/",
    bring: ["Wine", "Beer"],
    corkageAmount: "35",
    corkageUnit: "per bottle",
    byoDays: ["Sun", "Sat"],
    byoTimes: "Lunch",
    notes: "Weekend lunch only",
    removalRequest: false,
    accuracyConfirmed: true,
    company: ""
  }, extra || {});
}

const FIXTURE = [
  { name: "Arthur", suburb: "Surry Hills", region: "Inner City" },
  { name: "Arthur", suburb: "Fitzroy", region: "Inner North" },
  { name: "Thai Pothong", suburb: "Newtown", region: "Inner West" }
];

test("venue ids match the app, including Arthur in Surry Hills", function () {
  const data = loadData();
  const indexed = core.indexVenues(data.places);
  const prepared = logic.prepare(data);
  assert.equal(indexed.length, prepared.places.length);
  indexed.forEach(function (place, i) {
    assert.equal(place.id, prepared.places[i].id);
    assert.equal(place.name, prepared.places[i].name);
  });
  const arthur = indexed.filter(function (place) {
    return place.name === "Arthur" && place.suburb === "Surry Hills";
  });
  assert.equal(arthur.length, 1);
  assert.equal(arthur[0].id, ARTHUR);
  clearVenueCatalogCache();
  const loaded = loadVenueCatalog();
  assert.equal(loaded.find(function (place) { return place.id === ARTHUR; }).name, "Arthur");
});

test("duplicate matching links an exact name and suburb, and ignores a partial or the wrong suburb", function () {
  const hits = core.matchVenues("art", FIXTURE, 4);
  const surry = hits.find(function (hit) { return hit.id === ARTHUR; });
  assert.ok(surry);
  assert.equal(surry.exact, false);
  assert.equal(surry.name, "Arthur");
  assert.equal(surry.suburb, "Surry Hills");
  assert.ok(hits.some(function (hit) { return hit.suburb === "Fitzroy"; }));
  assert.equal(core.matchVenues("a", FIXTURE).length, 0);
  assert.equal(core.matchVenues("Arthur", FIXTURE).filter(function (hit) { return hit.exact; }).length, 2);

  assert.equal(core.resolveVenueSlug({ name: "Arthur", suburb: "Surry Hills" }, FIXTURE), ARTHUR);
  assert.equal(core.resolveVenueSlug({ name: "  arthur  ", suburb: "surry hills" }, FIXTURE), ARTHUR);
  assert.equal(core.resolveVenueSlug({ name: "Arthur", suburb: "Newtown" }, FIXTURE), null);
  assert.equal(core.resolveVenueSlug({ name: "Arthur" }, FIXTURE), null);
  assert.equal(core.resolveVenueSlug({ name: "Thai Pothong" }, FIXTURE), "thai-pothong-newtown");
  assert.equal(core.resolveVenueSlug({ name: "Arth", suburb: "Surry Hills" }, FIXTURE), null);
  assert.equal(core.resolveVenueSlug({
    name: "Arthur",
    suburb: "Newtown",
    venueSlug: ARTHUR
  }, FIXTURE), null);
  assert.equal(core.resolveVenueSlug({
    name: "Arthur Pizza",
    venueSlug: ARTHUR
  }, FIXTURE), null);
  assert.equal(core.resolveVenueSlug({
    name: "Arthur",
    venueSlug: ARTHUR
  }, FIXTURE), ARTHUR);
  assert.equal(core.resolveVenueSlug({
    name: "Brand New Room",
    venueSlug: "brand-new-room"
  }, []), "brand-new-room");
  assert.equal(core.resolveVenueSlug({
    name: "Brand New Room",
    venueSlug: "../etc"
  }, []), null);
});

test("diner and venue submissions are capped, and a honeypot is a quiet drop", function () {
  const ok = core.validateSubmission(diner());
  assert.equal(ok.ok, true);
  assert.equal(ok.submission.corkageAmount, "35");
  assert.equal(ok.submission.email, "guest@example.com");
  assert.equal(ok.submission.removalRequest, false);
  assert.equal(core.validateSubmission(diner({ email: "" })).submission.email, null);
  assert.equal(core.validateSubmission(diner({ email: "not-an-email" })).ok, false);
  assert.equal(core.validateSubmission(diner({ restaurantName: "  " })).ok, false);
  assert.equal(core.validateSubmission(diner({ suburb: "" })).error, "Add the suburb.");
  assert.equal(core.validateSubmission(diner({ source: "" })).ok, false);
  assert.equal(core.validateSubmission(diner({ restaurantName: "n".repeat(core.NAME_MAX + 1) })).ok, false);
  assert.equal(core.validateSubmission(diner({ bring: "Spirits" })).ok, false);
  assert.equal(core.validateSubmission(diner({ corkageKind: "amount", corkageAmount: "" })).ok, false);
  assert.equal(core.validateSubmission(diner({ corkageKind: "free", corkageAmount: "10" })).submission.corkageAmount, null);

  const owner = core.validateSubmission(venue());
  assert.equal(owner.ok, true);
  assert.deepEqual(owner.submission.byoDays, ["Sat", "Sun"]);
  assert.deepEqual(owner.submission.bring, ["Wine", "Beer"]);
  assert.equal(owner.submission.accuracyConfirmed, true);
  assert.equal(core.validateSubmission(venue({ role: "Chef" })).ok, false);
  assert.equal(core.validateSubmission(venue({ email: "owner@gmail.com" })).ok, true);
  assert.equal(core.validateSubmission(venue({ email: "" })).error, "Add your work email.");
  assert.equal(core.validateSubmission(venue({ website: "javascript:alert(1)" })).ok, false);
  assert.equal(core.validateSubmission(venue({ website: "arthurrestaurant.com/byo" })).ok, true);
  assert.equal(core.validateSubmission(venue({ phone: "call me" })).ok, false);
  assert.equal(core.validateSubmission(venue({ notes: "n".repeat(core.NOTES_MAX + 1) })).ok, false);
  assert.equal(core.validateSubmission(venue({ accuracyConfirmed: false })).ok, false);
  assert.equal(core.validateSubmission(venue({ removalRequest: "yes" })).ok, false);
  const removal = core.validateSubmission(venue({ removalRequest: true }));
  assert.equal(removal.ok, true);
  assert.equal(removal.submission.removalRequest, true);

  const dropped = core.validateSubmission(diner({ company: "https://spam.example" }));
  assert.equal(dropped.ok, true);
  assert.equal(dropped.drop, true);
  assert.equal(dropped.submission, undefined);
  assert.equal(core.validateSubmission({}).error, "Choose diner or venue.");
  assert.equal(core.validateSubmission(null).ok, false);
});

test("the function stores a diner tip and a venue update, matches Arthur, and does not publish or log contact details", async function () {
  const store = memoryStore();
  const ip = "203.0.113.77";
  const logs = [];
  const originals = ["log", "info", "warn", "error", "debug"].map(function (name) {
    const original = console[name];
    console[name] = function () { logs.push(Array.from(arguments).join(" ")); };
    return { name: name, original: original };
  });
  const email = "guest@example.com";
  const phone = "0400 000 000";
  const workEmail = "alex@arthurrestaurant.com";
  try {
    const tip = await handleSubmission(post(diner({ email: email }), ip), { ip: ip }, store, FIXTURE);
    assert.equal(tip.status, 200);
    assert.deepEqual(await tip.json(), { ok: true });

    const update = await handleSubmission(post(venue({
      email: workEmail,
      phone: phone,
      removalRequest: true
    }), ip), { ip: ip }, store, FIXTURE);
    assert.equal(update.status, 200);

    const wrongSuburb = await handleSubmission(post(diner({
      suburb: "Newtown",
      venueSlug: ARTHUR,
      email: ""
    }), ip), { ip: ip }, store, FIXTURE);
    assert.equal(wrongSuburb.status, 200);

    const partial = await handleSubmission(post(diner({
      restaurantName: "Arth",
      email: ""
    }), ip), { ip: ip }, store, FIXTURE);
    assert.equal(partial.status, 200);

    const rows = [];
    for (const [key, value] of store.data) {
      const packed = key + JSON.stringify(value);
      assert.equal(packed.includes(ip), false, key);
      if (key.startsWith("rl-")) {
        assert.match(key, /^rl-[a-f0-9]{64}$/);
        continue;
      }
      rows.push({ key: key, value: value });
      assert.equal(Object.prototype.hasOwnProperty.call(value, "company"), false);
      assert.equal(value.createdAt.length > 10, true);
      assert.equal(key, value.createdAt + "-" + key.slice(value.createdAt.length + 1));
      assert.match(key.slice(value.createdAt.length + 1), /^[0-9a-f]{16}$/);
    }
    assert.equal(rows.length, 4);
    assert.equal(rows[0].value.type, "diner");
    assert.equal(rows[0].value.venueSlug, ARTHUR);
    assert.equal(rows[0].value.restaurantName, "Arthur");
    assert.equal(rows[0].value.suburb, "Surry Hills");
    assert.equal(rows[0].value.email, email);
    assert.equal(rows[0].value.removalRequest, false);
    assert.equal(rows[0].value.corkageAmount, "35");
    assert.equal(rows[1].value.type, "venue");
    assert.equal(rows[1].value.venueSlug, ARTHUR);
    assert.equal(rows[1].value.removalRequest, true);
    assert.equal(rows[1].value.email, workEmail);
    assert.equal(rows[1].value.phone, phone);
    assert.deepEqual(rows[1].value.byoDays, ["Sat", "Sun"]);
    assert.equal(rows[1].value.accuracyConfirmed, true);
    assert.equal(rows[2].value.venueSlug, null);
    assert.equal(rows[2].value.suburb, "Newtown");
    assert.equal(rows[3].value.venueSlug, null);
    assert.equal(rows[3].value.restaurantName, "Arth");
    assert.equal(FIXTURE[0].name, "Arthur");
    assert.equal(logs.join("\n").includes(email), false);
    assert.equal(logs.join("\n").includes(workEmail), false);
    assert.equal(logs.join("\n").includes(phone), false);
  } finally {
    originals.forEach(function (item) { console[item.name] = item.original; });
  }
});

test("an IP can send 5 submissions an hour, and bad requests never get stored", async function () {
  const store = memoryStore();
  const ip = "203.0.113.90";
  for (let i = 0; i < RATE_MAX; i++) {
    const res = await handleSubmission(post(diner({
      restaurantName: "New Room " + i,
      suburb: "Gosford",
      email: ""
    }), ip), { ip: ip }, store, FIXTURE);
    assert.equal(res.status, 200, "submission " + i);
  }
  const limited = await handleSubmission(post(diner({
    restaurantName: "One More",
    suburb: "Gosford",
    email: ""
  }), ip), { ip: ip }, store, FIXTURE);
  assert.equal(limited.status, 429);

  const other = await handleSubmission(post(diner({
    restaurantName: "Other Network",
    suburb: "Gosford",
    email: ""
  }), "203.0.113.91"), { ip: "203.0.113.91" }, store, FIXTURE);
  assert.equal(other.status, 200);

  const honeypot = await handleSubmission(post(diner({ company: "filled" }), ip), { ip: ip }, store, FIXTURE);
  assert.equal(honeypot.status, 200);
  assert.deepEqual(await honeypot.json(), { ok: true });

  const bad = await handleSubmission(post({ type: "diner", restaurantName: "Nope" }, ip), { ip: ip }, store, FIXTURE);
  assert.equal(bad.status, 400);
  const wrongMethod = await handleSubmission(new Request("https://byospot.test/.netlify/functions/submit"), {}, store, FIXTURE);
  assert.equal(wrongMethod.status, 405);
  const options = await handleSubmission(new Request("https://byospot.test/.netlify/functions/submit", { method: "OPTIONS" }), {}, store, FIXTURE);
  assert.equal(options.status, 204);

  const huge = "x".repeat(core.BODY_MAX + 1);
  const large = await handleSubmission(new Request("https://byospot.test/.netlify/functions/submit", {
    method: "POST",
    headers: { "content-type": "application/json", "x-nf-client-connection-ip": "203.0.113.92" },
    body: huge
  }), { ip: "203.0.113.92" }, store, FIXTURE);
  assert.equal(large.status, 400);

  let stored = 0;
  let honeypotHit = false;
  for (const [key, value] of store.data) {
    if (key.startsWith("rl-")) continue;
    stored++;
    const packed = JSON.stringify(value);
    assert.equal(packed.includes("filled"), false);
    assert.equal(packed.includes("Nope"), false);
    assert.equal(packed.includes("One More"), false);
    if (packed.includes("honeypot")) honeypotHit = true;
  }
  assert.equal(honeypotHit, false);
  assert.equal(stored, RATE_MAX + 1);
});

test("the form route, entry points, and worker stay in brand and do not publish listings", function () {
  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const card = fs.readFileSync(new URL("../card.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const fn = fs.readFileSync(new URL("../netlify/functions/submit.mjs", import.meta.url), "utf8");
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

  const nearest = app.slice(app.indexOf("function nearestEmptyHtml"), app.indexOf("function emptyHtml"));
  assert.ok(nearest.indexOf("addPrompt") < nearest.indexOf("closest-lead"));
  assert.match(nearest, /closest-lead/);
  const results = app.slice(app.indexOf("function resultsHtml"), app.indexOf("function activeFilterCount"));
  assert.ok(results.indexOf('addPrompt("list")') < results.indexOf("planLink()"));
  assert.match(app, /\+ Know a BYO spot in/);
  assert.match(app, /Add it and we'll check it with the venue/);
  assert.match(app, /\+ Missing a BYO spot in/);
  assert.match(app, /Tell us, or add your own venue/);
  assert.match(app, /\/add\?suburb=/);
  assert.match(card, /Own or work here\? Update your details/);
  assert.match(card, /\/add\?venue=/);
  assert.match(card, /Something wrong\? Report it/);
  assert.ok(card.indexOf("Something wrong? Report it") < card.indexOf("Own or work here? Update your details"));

  const home = app.slice(app.indexOf("function homeHtml"), app.indexOf("function locationListInner"));
  assert.equal(home.includes("/add"), false);
  assert.match(app, /Who are you\?/);
  assert.match(app, /Diners and venues both welcome\. We only list places that the venue itself says are BYO\./);
  assert.match(app, /I'm a diner/);
  assert.match(app, /I own or work here/);
  assert.match(app, /How we check:/);
  assert.match(app, /We check every tip against the venue's own website, menu or socials before it goes live\./);
  assert.match(app, /Not this one\? Keep typing to add a new spot/);
  assert.match(app, /already listed; you're updating it/);
  assert.match(app, /An email at your venue's own domain gets verified fastest/);
  assert.match(app, /We're no longer BYO/);
  assert.match(app, /I confirm these details are accurate and I'm allowed to share them for this venue\./);
  assert.match(app, /How verification works/);
  assert.match(app, /Send for verification/);
  assert.match(app, /Send tip/);
  assert.match(app, /Thanks for the tip!/);
  assert.match(app, /Thanks, we've got it/);
  assert.match(app, /We'll contact you at /);
  assert.match(app, /usually within 2 business days/);
  assert.match(app, /We'll email you when it's live/);
  assert.match(app, /We'd rather miss a spot than list a wrong one/);
  assert.match(app, /\/\.netlify\/functions\/submit/);
  assert.equal(app.includes("Check your inbox"), false);
  assert.equal(app.includes("We've sent a link"), false);
  assert.equal(app.includes("We have sent a link"), false);
  assert.match(app, /path === "\/add"/);

  assert.match(css, /\.add-prompt \{[^}]*border-radius:\s*20px/);
  assert.match(css, /\.add-note \{[^}]*background:\s*#C7F1DC/);
  assert.match(css, /\.venue-owner \{[^}]*border:[^}]*dashed/);
  assert.match(css, /\.add-choice:has\(input:checked\) \{[^}]*background:\s*#C7F1DC/);
  assert.match(html, /submission-core\.js/);
  assert.ok(html.indexOf("submission-core.js") < html.indexOf("app.js"));

  assert.match(fn, /getStore\("submissions"\)/);
  assert.equal(fn.includes("console."), false);
  assert.equal(fn.includes("mailto:"), false);
  assert.equal(fn.includes("sendMail"), false);
  assert.equal(fn.includes("data.js"), true);
  const data = fs.readFileSync(new URL("../data.js", import.meta.url), "utf8");
  assert.equal(data.includes("submissions"), false);

  assert.equal(sw.match(/VERSION = "([^"]+)"/)[1], "byo-2026-11-28l");
  assert.match(sw, /submission-core\.js/);
  ["manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
    "icons/icon-v2-192.png", "icons/icon-v2-512.png", "icons/icon-v2-maskable-512.png",
    "icons/apple-touch-icon.png", "icons/apple-touch-icon-v2.png", "icons/favicon-v2.svg"].forEach(function (file) {
    assert.match(sw, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});
