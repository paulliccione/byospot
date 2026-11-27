/* Saved venue ids for this device. No network, no DOM.
   Storage key byo.saved.v1 is a JSON array of canonical venue ids, newest first.
   Pass resolveVenueId when reading so old ids follow the redirect map. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BYOSaved = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEY = "byo.saved.v1";

  function isId(id) {
    return typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id);
  }

  function canonical(id, resolveId) {
    if (!isId(id)) return "";
    var next = id;
    if (typeof resolveId === "function") {
      try { next = resolveId(id); }
      catch (e) { next = id; }
    }
    return isId(next) ? next : "";
  }

  function normalise(list, resolveId) {
    if (!Array.isArray(list)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var id = canonical(list[i], resolveId);
      if (!id || seen[id]) continue;
      seen[id] = 1;
      out.push(id);
    }
    return out;
  }

  function parse(raw, resolveId) {
    if (raw == null || raw === "") return [];
    var data;
    try { data = JSON.parse(raw); }
    catch (e) { return []; }
    return normalise(data, resolveId);
  }

  function add(list, id, resolveId) {
    var next = canonical(id, resolveId);
    var ids = normalise(list, resolveId);
    if (!next) return ids;
    return [next].concat(ids.filter(function (item) { return item !== next; }));
  }

  function remove(list, id, resolveId) {
    var next = canonical(id, resolveId);
    return normalise(list, resolveId).filter(function (item) { return item !== next; });
  }

  function toggle(list, id, resolveId) {
    var next = canonical(id, resolveId);
    var ids = normalise(list, resolveId);
    if (!next) return ids;
    if (ids.indexOf(next) >= 0) return ids.filter(function (item) { return item !== next; });
    return [next].concat(ids);
  }

  function read(storage, resolveId) {
    try {
      if (!storage || typeof storage.getItem !== "function") return [];
      return parse(storage.getItem(KEY), resolveId);
    } catch (e) { return []; }
  }

  function write(storage, list) {
    try {
      if (!storage || typeof storage.setItem !== "function") return false;
      storage.setItem(KEY, JSON.stringify(normalise(list)));
      return true;
    } catch (e) { return false; }
  }

  return {
    KEY: KEY,
    parse: parse,
    add: add,
    remove: remove,
    toggle: toggle,
    read: read,
    write: write
  };
});
