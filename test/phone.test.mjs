import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import {
  DAILY_CAP,
  sydneyDateKey,
  capDecision,
  clientCallResult,
  handlePhoneRequest
} from "../phone-core.mjs";

const require = createRequire(import.meta.url);
const card = require("../card.js");

function memoryStore(initial) {
  const rows = new Map();
  if (initial) rows.set(initial.key, { value: initial.value, etag: "etag-0" });
  return {
    rows: rows,
    async getWithMetadata(key) {
      const row = rows.get(key);
      if (!row) return null;
      return { data: row.value, etag: row.etag };
    },
    async setJSON(key, value, opts) {
      const row = rows.get(key);
      if (opts && opts.onlyIfNew && row) return { modified: false };
      if (opts && opts.onlyIfMatch && (!row || row.etag !== opts.onlyIfMatch)) return { modified: false };
      const etag = "etag-" + (rows.size + 1) + "-" + Math.random().toString(16).slice(2);
      rows.set(key, { value: value, etag: etag });
      return { modified: true, etag: etag };
    }
  };
}

function silence() {
  const names = ["log", "info", "warn", "error", "debug"];
  const saved = {};
  const lines = [];
  names.forEach(function (name) {
    saved[name] = console[name];
    console[name] = function () {
      lines.push(Array.from(arguments).map(String).join(" "));
    };
  });
  return {
    lines: lines,
    restore: function () { names.forEach(function (name) { console[name] = saved[name]; }); }
  };
}

test("the Sydney date key rolls over at midnight Australia/Sydney", function () {
  assert.equal(sydneyDateKey(new Date("2026-11-27T12:30:00Z")), "2026-11-27");
  assert.equal(sydneyDateKey(new Date("2026-11-27T13:30:00Z")), "2026-11-28");
});

test("the cap allows 30 lookups and stops on the next one", function () {
  assert.equal(DAILY_CAP, 30);
  assert.deepEqual(capDecision(0), { allow: true, count: 1 });
  assert.deepEqual(capDecision(29), { allow: true, count: 30 });
  assert.deepEqual(capDecision(30), { allow: false, count: 30 });
  assert.deepEqual(capDecision(undefined), { allow: true, count: 1 });
  assert.equal(clientCallResult({ ok: false, reason: "cap" }).fallback, true);
  assert.equal(clientCallResult({ ok: false, reason: "none" }).fallback, true);
  assert.equal(clientCallResult({ ok: true, nationalPhoneNumber: "  (02) 1111 2222  " }).phone, "(02) 1111 2222");
  assert.equal(clientCallResult({ ok: true, nationalPhoneNumber: "" }).fallback, true);
});

test("a full cap does not call Google, and the phone is not stored", async function () {
  const store = memoryStore({ key: "2026-11-28", value: { count: 30 } });
  let calls = 0;
  const fetchImpl = async function () { calls += 1; throw new Error("should not fetch"); };
  const log = silence();
  try {
    const res = await handlePhoneRequest({
      id: "ChIJtestPlaceId0001",
      store: store,
      fetch: fetchImpl,
      apiKey: "server-key-should-stay-hidden",
      now: new Date("2026-11-27T20:00:00Z")
    });
    assert.equal(calls, 0);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.equal(res.status, 429);
    assert.equal(body.reason, "cap");
    assert.equal(body.nationalPhoneNumber, undefined);
    assert.equal(JSON.stringify(body).includes("server-key-should-stay-hidden"), false);
    const saved = JSON.stringify(Array.from(store.rows.values()));
    assert.equal(saved.includes("nationalPhoneNumber"), false);
    assert.equal(log.lines.join("\n").includes("server-key-should-stay-hidden"), false);
  } finally {
    log.restore();
  }
});

test("an allowed lookup asks only for nationalPhoneNumber and does not log it", async function () {
  const store = memoryStore();
  const seen = [];
  const fetchImpl = async function (url, opts) {
    seen.push({ url: url, headers: opts.headers });
    return new Response(JSON.stringify({ nationalPhoneNumber: "(02) 9550 5555", internationalPhoneNumber: "+61 2 9550 5555" }), { status: 200 });
  };
  const log = silence();
  try {
    const res = await handlePhoneRequest({
      id: "ChIJtestPlaceId0001",
      store: store,
      fetch: fetchImpl,
      apiKey: "server-key-should-stay-hidden",
      now: new Date("2026-11-27T20:00:00Z")
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].headers["X-Goog-FieldMask"], "nationalPhoneNumber");
    assert.equal(seen[0].headers["X-Goog-Api-Key"], "server-key-should-stay-hidden");
    assert.equal(seen[0].url.includes("server-key-should-stay-hidden"), false);
    assert.match(seen[0].url, /\/places\/ChIJtestPlaceId0001$/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.equal(body.nationalPhoneNumber, "(02) 9550 5555");
    assert.equal(body.internationalPhoneNumber, undefined);
    const saved = JSON.stringify(Array.from(store.rows.values()));
    assert.equal(saved.includes("9550"), false);
    assert.equal(saved.includes("server-key"), false);
    assert.deepEqual(store.rows.get("2026-11-28").value, { count: 1 });
    assert.equal(log.lines.join("\n").includes("9550"), false);
    assert.equal(log.lines.join("\n").includes("server-key-should-stay-hidden"), false);
  } finally {
    log.restore();
  }
});

test("thirty lookups succeed and the thirty-first does not call Google", async function () {
  const store = memoryStore();
  let calls = 0;
  const fetchImpl = async function () {
    calls += 1;
    return new Response(JSON.stringify({ nationalPhoneNumber: "(02) 9000 0000" }), { status: 200 });
  };
  for (let i = 0; i < 30; i++) {
    const res = await handlePhoneRequest({
      id: "ChIJtestPlaceId0001",
      store: store,
      fetch: fetchImpl,
      apiKey: "server-key-should-stay-hidden",
      now: new Date("2026-11-27T20:00:00Z")
    });
    assert.equal(res.status, 200);
  }
  assert.equal(calls, 30);
  const blocked = await handlePhoneRequest({
    id: "ChIJtestPlaceId0001",
    store: store,
    fetch: fetchImpl,
    apiKey: "server-key-should-stay-hidden",
    now: new Date("2026-11-27T20:00:00Z")
  });
  assert.equal(calls, 30);
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).reason, "cap");
});

test("a missing number or a Google error falls back without echoing the body", async function () {
  const empty = memoryStore();
  const res = await handlePhoneRequest({
    id: "ChIJtestPlaceId0001",
    store: empty,
    fetch: async function () { return new Response("{}", { status: 200 }); },
    apiKey: "server-key-should-stay-hidden",
    now: new Date("2026-11-27T20:00:00Z")
  });
  assert.deepEqual(await res.json(), { ok: false, reason: "none" });
  assert.equal(res.headers.get("cache-control"), "no-store");

  const denied = memoryStore();
  const secret = "server-key-should-stay-hidden (02) 9550 5555";
  const bad = await handlePhoneRequest({
    id: "ChIJtestPlaceId0001",
    store: denied,
    fetch: async function () { return new Response(secret, { status: 403 }); },
    apiKey: "server-key-should-stay-hidden",
    now: new Date("2026-11-27T20:00:00Z")
  });
  const body = await bad.json();
  assert.equal(body.reason, "none");
  assert.equal(JSON.stringify(body).includes("9550"), false);
  assert.equal(JSON.stringify(body).includes("server-key-should-stay-hidden"), false);
});

test("an invalid id or a missing key does not call Google or spend the cap", async function () {
  const store = memoryStore();
  let calls = 0;
  const fetchImpl = async function () { calls += 1; return new Response("{}", { status: 200 }); };
  const badId = await handlePhoneRequest({ id: "../secret", store: store, fetch: fetchImpl, apiKey: "k", now: new Date() });
  assert.equal(badId.status, 400);
  const noKey = await handlePhoneRequest({ id: "ChIJtestPlaceId0001", store: store, fetch: fetchImpl, apiKey: "", now: new Date() });
  assert.equal(noKey.status, 503);
  assert.equal(calls, 0);
  assert.equal(store.rows.size, 0);
  assert.equal(badId.headers.get("cache-control"), "no-store");
  assert.equal(noKey.headers.get("cache-control"), "no-store");
});

test("Book a table is the primary link, and Call to book falls back to Directions", function () {
  const directions = "https://www.google.com/maps/dir/?api=1&destination=170%20King";
  const booked = card.renderDetail({
    id: "arthur-surry-hills",
    name: "Arthur",
    bookingUrl: "https://www.sevenrooms.com/explore/arthur/reservations/create/search/landing",
    directions: directions,
    phone: "tel:+61290001111",
    callToBook: true,
    callPlaceId: "ChIJtestPlaceId0001"
  });
  const primary = booked.split('data-row="primary"')[1];
  assert.match(primary, /Book a table/);
  assert.match(primary, /target="_blank"/);
  assert.match(primary, /rel="noopener"/);
  assert.match(primary, /href="https:\/\/www\.sevenrooms\.com\/explore\/arthur\/reservations\/create\/search\/landing"/);
  assert.match(booked, /data-action="call-to-book"/);
  assert.match(booked, /data-place-id="ChIJtestPlaceId0001"/);
  assert.match(booked, /Call · from the venue/);
  assert.match(booked, /tel:\+61290001111/);

  const hidden = card.renderDetail({
    id: "x",
    name: "Plain",
    directions: directions,
    callPlaceId: "ChIJtestPlaceId0001"
  });
  assert.equal(hidden.includes("Call to book"), false);

  const number = card.renderDetail({
    id: "x",
    name: "Plain",
    directions: directions,
    phone: "tel:+61290001111",
    googlePhone: "(02) 9550 5555",
    googlePhoneHref: "tel:+61295505555"
  });
  const google = number.split('data-row="google-call"')[1].split('data-row="primary"')[0];
  assert.match(google, /href="tel:\+61295505555"/);
  assert.match(google, /\(02\) 9550 5555/);
  assert.match(google, /Google Maps/);
  assert.match(google, /Check BYO and corkage with the venue\./);
  assert.equal(google.includes("from the venue"), false);
  assert.match(number, /Call · from the venue/);
  assert.match(number, /tel:\+61290001111/);
  assert.equal(number.includes("Call to book"), false);

  const fallback = card.renderDetail({
    id: "x",
    name: "Plain",
    directions: directions,
    callBookFallback: true,
    callPlaceId: "ChIJtestPlaceId0001"
  });
  assert.equal(fallback.includes("Call to book"), false);
  assert.equal(fallback.includes("Google Maps"), false);
  assert.equal(fallback.includes("tel:"), false);
  assert.match(fallback, /Directions/);
  assert.match(fallback, /href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=170%20King"/);
});

test("the phone function skips the service worker and the flag defaults off", function () {
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(sw, /\/\.netlify\/functions\//);
  assert.equal(sw.match(/VERSION = "([^"]+)"/)[1], "byo-2026-11-28g");
  const fn = fs.readFileSync(new URL("../netlify/functions/phone.mjs", import.meta.url), "utf8");
  const core = fs.readFileSync(new URL("../phone-core.mjs", import.meta.url), "utf8");
  assert.match(fn, /name: STORE_NAME/);
  assert.match(core, /call-cap/);
  assert.equal(fn.includes("console."), false);
  assert.equal(core.includes("console."), false);
  const cfg = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
  assert.match(cfg, /"callToBook":false/);
  const writer = fs.readFileSync(new URL("../scripts/write-maps-config.mjs", import.meta.url), "utf8");
  assert.match(writer, /CALL_TO_BOOK_ENABLED/);
  assert.match(writer, /=== "true"/);
  assert.equal(writer.includes("console.log(key)"), false);
  assert.equal(writer.includes("console.log(raw)"), false);
});
