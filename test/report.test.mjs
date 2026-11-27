import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import {
  REASONS,
  NOTE_MAX,
  RATE_MAX,
  validateReport,
  consumeRate,
  hashIp,
  rateKey,
  reportObject,
  reportBlobKey
} from "../report-core.mjs";
import { handleReport } from "../netlify/functions/report.mjs";

const require = createRequire(import.meta.url);
const card = require("../card.js");

const VENUE = "yayoi-world-square-sydney";
const PLACE = "ChIJJYaij4CvEmsRHvseGaDRyZw";

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
  return new Request("https://byospot.test/.netlify/functions/report", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nf-client-connection-ip": ip || "203.0.113.10",
      "x-forwarded-for": "198.51.100.20, 203.0.113.10"
    },
    body: JSON.stringify(body)
  });
}

test("a report needs a known reason and a route id", function () {
  assert.deepEqual(REASONS, ["BYO not allowed", "Corkage changed", "Days wrong", "Closed", "Other"]);
  assert.equal(validateReport(null).ok, false);
  assert.equal(validateReport({}).status, 400);
  assert.equal(validateReport({ venueId: VENUE }).ok, false);
  assert.equal(validateReport({ venueId: VENUE, reason: "Shut" }).ok, false);
  REASONS.forEach(function (reason) {
    const checked = validateReport({ venueId: VENUE, reason: reason });
    assert.equal(checked.ok, true, reason);
    assert.equal(checked.report.reason, reason);
    assert.equal(checked.report.note, "");
    assert.equal(checked.report.email, null);
  });
  const place = validateReport({ venueId: PLACE, reason: "Closed" });
  assert.equal(place.ok, true);
  assert.equal(place.report.venueId, PLACE);
  ["", " ", "../etc", "has space", "a/b", "<script>"].forEach(function (venueId) {
    assert.equal(validateReport({ venueId: venueId, reason: "Other" }).ok, false, venueId);
  });
});

test("the note is optional and stops at 500 characters, and email is optional", function () {
  const exact = "n".repeat(NOTE_MAX);
  const ok = validateReport({ venueId: VENUE, reason: "Other", note: "  " + exact + "  ", email: "  Person@Example.com  " });
  assert.equal(ok.ok, true);
  assert.equal(ok.report.note, exact);
  assert.equal(ok.report.email, "Person@Example.com");
  const long = validateReport({ venueId: VENUE, reason: "Other", note: exact + "!" });
  assert.equal(long.ok, false);
  assert.equal(long.status, 400);
  assert.equal(validateReport({ venueId: VENUE, reason: "Other", note: 12 }).ok, false);
  assert.equal(validateReport({ venueId: VENUE, reason: "Other", email: "" }).report.email, null);
  assert.equal(validateReport({ venueId: VENUE, reason: "Other", email: "   " }).report.email, null);
  assert.equal(validateReport({ venueId: VENUE, reason: "Other", email: "not-an-email" }).ok, false);
  assert.equal(validateReport({ venueId: VENUE, reason: "Other", email: "a@b" }).ok, false);
  const saved = reportObject(ok.report, "2026-11-28T00:00:00.000Z");
  assert.deepEqual(Object.keys(saved).sort(), ["email", "note", "reason", "ts", "venueId"]);
  assert.equal(saved.email, "Person@Example.com");
  assert.equal(reportBlobKey(saved.ts, "ab").includes("Person@Example.com"), false);
});

test("a filled honeypot is a quiet drop", function () {
  const hit = validateReport({ venueId: VENUE, reason: "Other", website: "http://spam.example" });
  assert.equal(hit.ok, true);
  assert.equal(hit.drop, true);
  assert.equal(hit.report, undefined);
  assert.equal(validateReport({ venueId: VENUE, reason: "Other", website: "   " }).drop, undefined);
  assert.equal(validateReport({ venueId: VENUE, reason: "Other", website: "" }).ok, true);
});

test("an IP can send 5 reports an hour, and the counter stores a hash", async function () {
  const start = Date.parse("2026-11-28T00:00:00.000Z");
  let record = null;
  for (let i = 0; i < RATE_MAX; i++) {
    const step = consumeRate(record, start);
    assert.equal(step.ok, true);
    record = step.record;
  }
  const blocked = consumeRate(record, start + 1000);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.record.hits.length, RATE_MAX);
  const still = consumeRate(blocked.record, start + 60 * 60 * 1000 - 1);
  assert.equal(still.ok, false);
  const later = consumeRate(blocked.record, start + 60 * 60 * 1000);
  assert.equal(later.ok, true);
  assert.equal(later.record.hits.length, 1);

  const ip = "203.0.113.10";
  const hash = await hashIp(ip);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash.includes(ip), false);
  assert.equal(await hashIp(ip), hash);
  assert.notEqual(await hashIp("203.0.113.11"), hash);
  assert.equal(rateKey(ip), "");
  assert.equal(rateKey(hash), "rl-" + hash);
  assert.equal(rateKey(hash).includes(ip), false);
});

test("the function saves a report, drops honeypots, and returns 429 past the limit", async function () {
  const store = memoryStore();
  const ip = "203.0.113.44";
  const logs = [];
  const originals = ["log", "info", "warn", "error", "debug"].map(function (name) {
    const original = console[name];
    console[name] = function () {
      logs.push(Array.from(arguments).join(" "));
    };
    return { name: name, original: original };
  });
  try {
    const note = "Corkage is now $20";
    const email = "guest@example.com";
    for (let i = 0; i < RATE_MAX; i++) {
      const res = await handleReport(post({
        venueId: VENUE,
        reason: "Corkage changed",
        note: note,
        email: email,
        website: ""
      }, ip), { ip: ip }, store);
      assert.equal(res.status, 200, "report " + i);
      assert.deepEqual(await res.json(), { ok: true });
    }
    const limited = await handleReport(post({
      venueId: VENUE,
      reason: "Other",
      note: note,
      email: email
    }, ip), { ip: ip }, store);
    assert.equal(limited.status, 429);

    const honeypot = await handleReport(post({
      venueId: VENUE,
      reason: "Other",
      note: "bot note",
      email: "bot@example.com",
      website: "https://spam.example"
    }, ip), { ip: ip }, store);
    assert.equal(honeypot.status, 200);
    assert.deepEqual(await honeypot.json(), { ok: true });

    const bad = await handleReport(post({ venueId: VENUE, reason: "Nope" }, ip), { ip: ip }, store);
    assert.equal(bad.status, 400);
    const wrongMethod = await handleReport(new Request("https://byospot.test/.netlify/functions/report"), {}, store);
    assert.equal(wrongMethod.status, 405);

    const reports = [];
    for (const [key, value] of store.data) {
      const packed = key + JSON.stringify(value);
      assert.equal(packed.includes(ip), false, key);
      assert.equal(packed.includes(email), key.startsWith("rl-") ? false : packed.includes(email));
      assert.equal(packed.includes("bot@example.com"), false);
      assert.equal(packed.includes("bot note"), false);
      if (key.startsWith("rl-")) {
        assert.match(key, /^rl-[a-f0-9]{64}$/);
        assert.equal(value.hits.length, RATE_MAX);
      } else {
        reports.push({ key: key, value: value });
      }
    }
    assert.equal(reports.length, RATE_MAX);
    reports.forEach(function (row) {
      assert.deepEqual(Object.keys(row.value).sort(), ["email", "note", "reason", "ts", "venueId"]);
      assert.equal(row.value.venueId, VENUE);
      assert.equal(row.value.reason, "Corkage changed");
      assert.equal(row.value.note, note);
      assert.equal(row.value.email, email);
      assert.equal(row.key, row.value.ts + "-" + row.key.slice(row.value.ts.length + 1));
      assert.match(row.key.slice(row.value.ts.length + 1), /^[0-9a-f]{16}$/);
    });
    assert.equal(logs.join("\n").includes(email), false);
    assert.equal(logs.join("\n").includes(note), false);
  } finally {
    originals.forEach(function (item) { console[item.name] = item.original; });
  }
});

test("the venue page links to the report sheet and the worker skips function responses", function () {
  const detail = card.renderDetail({ id: VENUE, name: "YAYOI World Square" });
  assert.match(detail, /Something wrong\? Report it/);
  assert.match(detail, /data-action="report"/);
  const nameless = card.renderDetail({ name: "Plain" });
  assert.equal(nameless.includes("Something wrong?"), false);

  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
  REASONS.forEach(function (reason) { assert.match(app, new RegExp(reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); });
  assert.match(app, /Thanks — we'll check it/);
  assert.match(app, /Couldn't send that\. Please try again\./);
  assert.match(app, /\/\.netlify\/functions\/report/);
  assert.match(css, /\.report-reason:has\(input:checked\) \{[^}]*background:\s*var\(--byo-mint\)/);
  assert.match(css, /\.report-sheet \.btn-primary \{[^}]*background:\s*var\(--byo-coral\)/);
  assert.match(css, /\.venue-report \{[^}]*color:\s*var\(--byo-teal\)/);

  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.equal(sw.match(/VERSION = "([^"]+)"/)[1], "byo-2026-11-28h");
  const fetchFn = sw.slice(sw.indexOf('addEventListener("fetch"'));
  const guard = fetchFn.indexOf("/.netlify/functions/");
  const put = fetchFn.indexOf("c.put");
  assert.ok(guard > -1 && put > guard);
  ["manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
    "icons/icon-v2-192.png", "icons/icon-v2-512.png", "icons/icon-v2-maskable-512.png",
    "icons/apple-touch-icon.png", "icons/apple-touch-icon-v2.png", "icons/favicon-v2.svg"].forEach(function (file) {
    assert.match(sw, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
  const manifest = fs.readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8");
  assert.match(manifest, /icons\/icon-v2-512\.png/);
  assert.match(manifest, /icons\/icon-v2-maskable-512\.png/);

  const fn = fs.readFileSync(new URL("../netlify/functions/report.mjs", import.meta.url), "utf8");
  assert.match(fn, /getStore\("reports"\)/);
  assert.equal(fn.includes("console."), false);
  assert.equal(fn.includes("mailto:"), false);
  assert.equal(fn.includes("sendMail"), false);
});
