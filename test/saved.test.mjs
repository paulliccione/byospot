import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const saved = require("../saved.js");
const logic = require("../logic.js");
const card = require("../card.js");

function memory() {
  return {
    store: {},
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
    },
    setItem: function (key, value) { this.store[key] = String(value); }
  };
}

test("add, remove and toggle keep newest first and drop duplicates", function () {
  assert.deepEqual(saved.add([], "a"), ["a"]);
  assert.deepEqual(saved.add(["b"], "a"), ["a", "b"]);
  assert.deepEqual(saved.add(["b", "a"], "a"), ["a", "b"]);
  assert.deepEqual(saved.add(["a", "a", "b"], "c"), ["c", "a", "b"]);
  assert.deepEqual(saved.add(["a"], ""), ["a"]);
  assert.deepEqual(saved.add(["a"], "has space"), ["a"]);
  assert.deepEqual(saved.remove(["a", "b", "a"], "a"), ["b"]);
  assert.deepEqual(saved.remove(["a"], "missing"), ["a"]);
  assert.deepEqual(saved.toggle([], "a"), ["a"]);
  assert.deepEqual(saved.toggle(["b"], "a"), ["a", "b"]);
  assert.deepEqual(saved.toggle(["a", "b"], "a"), ["b"]);
  assert.deepEqual(saved.toggle(["a", "a", "b"], "a"), ["b"]);
});

test("reading resolves redirect ids, dedupes them and ignores bad JSON", function () {
  const resolve = logic.resolveVenueId;
  assert.deepEqual(saved.parse("not json", resolve), []);
  assert.deepEqual(saved.parse("{", resolve), []);
  assert.deepEqual(saved.parse("{}", resolve), []);
  assert.deepEqual(saved.parse("null", resolve), []);
  assert.deepEqual(saved.parse("42", resolve), []);
  assert.deepEqual(saved.parse('"yayoi-world-square-sydney"', resolve), []);
  assert.deepEqual(saved.parse("[1, null, {}, \"\", \"ok\", \"ok\"]", resolve), ["ok"]);
  assert.deepEqual(
    saved.parse(
      '["borrelli-s-epping","borrelli-s-italian-restaurant-epping","la-botte-pizza-restaurant-pascoe-vale-north-north-west"]',
      resolve
    ),
    ["borrelli-s-italian-restaurant-epping", "la-botte-pizza-restaurant-pascoe-vale"]
  );
  assert.deepEqual(saved.add(["borrelli-s-epping"], "other", resolve), ["other", "borrelli-s-italian-restaurant-epping"]);
  assert.deepEqual(saved.toggle(["borrelli-s-epping"], "borrelli-s-italian-restaurant-epping", resolve), []);
});

test("localStorage can be missing, throw, or hold bad JSON", function () {
  const mem = memory();
  assert.equal(saved.KEY, "byo.saved.v1");
  assert.deepEqual(saved.read(mem, logic.resolveVenueId), []);
  assert.equal(saved.write(mem, ["b", "a", "a", "not an id"]), true);
  assert.equal(mem.store[saved.KEY], JSON.stringify(["b", "a"]));
  assert.deepEqual(saved.read(mem, logic.resolveVenueId), ["b", "a"]);
  mem.store[saved.KEY] = "{bad";
  assert.deepEqual(saved.read(mem, logic.resolveVenueId), []);
  mem.store[saved.KEY] = JSON.stringify(["borrelli-s-epping", "borrelli-s-epping", "kept"]);
  assert.deepEqual(saved.read(mem, logic.resolveVenueId), ["borrelli-s-italian-restaurant-epping", "kept"]);
  assert.deepEqual(saved.read(null), []);
  assert.deepEqual(saved.read({}), []);
  assert.equal(saved.write(null, ["a"]), false);
  assert.equal(saved.write({}, ["a"]), false);
  const denied = {
    getItem: function () { throw new Error("denied"); },
    setItem: function () { throw new Error("denied"); }
  };
  assert.deepEqual(saved.read(denied), []);
  assert.equal(saved.write(denied, ["a"]), false);
});

test("the heart is a button outside the venue link", function () {
  const view = { id: "yayoi-world-square-sydney", name: "YAYOI World Square" };
  const off = card.render(view, { mode: "results", saved: false });
  const on = card.render(view, { mode: "results", saved: true });
  function heart(html) {
    const match = html.match(/<button\b[^>]*data-action="save"[^>]*>[\s\S]*?<\/button>/);
    assert.ok(match, "save button missing");
    return match[0];
  }
  const offBtn = heart(off);
  assert.match(offBtn, /type="button"/);
  assert.match(offBtn, /aria-pressed="false"/);
  assert.match(offBtn, /aria-label="Save YAYOI World Square"/);
  assert.equal(offBtn.includes('fill="currentColor"'), false);
  const open = off.slice(off.indexOf('<a class="rcard-open"'), off.indexOf("</a>") + 4);
  assert.equal(open.includes("data-action=\"save\""), false);
  assert.match(open, /href="\/venue\/yayoi-world-square-sydney"/);
  const onBtn = heart(on);
  assert.match(onBtn, /aria-pressed="true"/);
  assert.match(onBtn, /aria-label="Remove YAYOI World Square from saved"/);
  assert.match(onBtn, /fill="currentColor"/);
  assert.equal(card.render(view, { mode: "pick", saved: true }).includes('data-action="save"'), false);
  assert.equal(card.render(view, { mode: "vote", saved: true }).includes('data-action="save"'), false);
  const detail = card.renderDetail(view, { saved: true });
  const detailBtn = heart(detail);
  assert.match(detailBtn, /aria-pressed="true"/);
  assert.match(detailBtn, /aria-label="Remove YAYOI World Square from saved"/);
  const unsavedDetail = heart(card.renderDetail(view));
  assert.match(unsavedDetail, /aria-pressed="false"/);
  assert.match(unsavedDetail, /aria-label="Save YAYOI World Square"/);
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.equal(sw.match(/VERSION = "([^"]+)"/)[1], "byo-2026-11-28j");
  const css = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const pill = app.slice(app.indexOf("function savedHeart"), app.indexOf("function header"));
  assert.match(pill, /M12 20\.5s-7\.5-4\.6-9\.3-9\.2C1\.4 8 3\.4 4\.5 6\.9 4\.5c2 0 3\.6 1\.1 5\.1 3 1\.5-1\.9 3\.1-3 5\.1-3 3\.5 0 5\.5 3\.5 4\.2 6\.8-1\.8 4\.6-9\.3 9\.2-9\.3 9\.2z/);
  assert.match(pill, /fill="' \+ fill \+ '" stroke="' \+ stroke \+ '" stroke-width="2" stroke-linejoin="round"/);
  assert.match(pill, /#FF795A/);
  assert.match(pill, /#064E50/);
  assert.match(pill, /href="\/saved"/);
  assert.match(pill, /class="saved-pill/);
  assert.match(pill, / empty/);
  assert.match(pill, /class="cnt"/);
  assert.match(pill, /Saved, 1 venue/);
  assert.match(pill, /Saved, " \+ n \+ " venues/);
  assert.match(css, /\.saved-pill \{[^}]*background:\s*#fff/);
  assert.match(css, /\.saved-pill \{[^}]*border:\s*1\.5px solid #D6E3DF/);
  assert.match(css, /\.saved-pill \{[^}]*border-radius:\s*999px/);
  assert.match(css, /\.saved-pill \{[^}]*padding:\s*8px 8px 8px 14px/);
  assert.match(css, /\.saved-pill \{[^}]*font-weight:\s*600/);
  assert.match(css, /\.saved-pill \{[^}]*font-size:\s*15px/);
  assert.match(css, /\.saved-pill \{[^}]*box-shadow:\s*0 2px 8px rgba\(6, 78, 80, \.10\)/);
  assert.match(css, /\.saved-pill \.cnt \{[^}]*background:\s*#FF795A/);
  assert.match(css, /\.saved-pill \.cnt \{[^}]*color:\s*#003638/);
  assert.match(css, /\.saved-pill \.cnt \{[^}]*min-width:\s*26px/);
  assert.match(css, /\.saved-pill \.cnt \{[^}]*height:\s*26px/);
  assert.match(css, /\.saved-pill \.cnt \{[^}]*font-size:\s*13px/);
  assert.match(css, /\.saved-pill \.cnt \{[^}]*font-weight:\s*700/);
  assert.match(css, /\.saved-pill\.empty \{[^}]*padding-right:\s*16px/);
  assert.match(css, /\.saved-pill\.empty \{[^}]*box-shadow:\s*none/);
  assert.match(css, /\.saved-pill\.empty \{[^}]*color:\s*#426768/);
  assert.match(sw, /"saved\.js"/);
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(html.indexOf("saved.js") < html.indexOf("app.js"));
  assert.match(css, /\.save-btn\.is-on \{[^}]*#FF795A/);
  assert.match(css, /#064E50/);
});
