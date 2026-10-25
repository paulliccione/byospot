/* Location, filtering and card facts for BYOSpot. No network, no DOM. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BYOLogic = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STATES = {
    NSW: "New South Wales",
    VIC: "Victoria",
    QLD: "Queensland",
    SA: "South Australia",
    WA: "Western Australia",
    TAS: "Tasmania",
    ACT: "Australian Capital Territory",
    NT: "Northern Territory"
  };

  var CITY_STATE = {
    Sydney: "NSW",
    "Blue Mountains": "NSW",
    Melbourne: "VIC",
    "Vic Coast": "VIC"
  };

  // Real Australian places with no BYOSpot listings, so a typed city is not treated as a typo.
  var KNOWN_ELSEWHERE = [
    { kind: "state", name: "Queensland", state: "QLD" },
    { kind: "state", name: "South Australia", state: "SA" },
    { kind: "state", name: "Western Australia", state: "WA" },
    { kind: "state", name: "Tasmania", state: "TAS" },
    { kind: "state", name: "Australian Capital Territory", state: "ACT" },
    { kind: "state", name: "Northern Territory", state: "NT" },
    { kind: "city", name: "Brisbane", state: "QLD" },
    { kind: "city", name: "Gold Coast", state: "QLD" },
    { kind: "city", name: "Sunshine Coast", state: "QLD" },
    { kind: "city", name: "Cairns", state: "QLD" },
    { kind: "city", name: "Townsville", state: "QLD" },
    { kind: "city", name: "Toowoomba", state: "QLD" },
    { kind: "city", name: "Adelaide", state: "SA" },
    { kind: "city", name: "Perth", state: "WA" },
    { kind: "city", name: "Fremantle", state: "WA" },
    { kind: "city", name: "Hobart", state: "TAS" },
    { kind: "city", name: "Launceston", state: "TAS" },
    { kind: "city", name: "Canberra", state: "ACT" },
    { kind: "city", name: "Darwin", state: "NT" },
    { kind: "city", name: "Alice Springs", state: "NT" },
    { kind: "city", name: "Newcastle", state: "NSW" },
    { kind: "city", name: "Wollongong", state: "NSW" },
    { kind: "city", name: "Central Coast", state: "NSW" },
    { kind: "city", name: "Ballarat", state: "VIC" },
    { kind: "city", name: "Bendigo", state: "VIC" },
    { kind: "city", name: "Shepparton", state: "VIC" }
  ];

  var QUERY_ALIAS = {
    nsw: "new south wales",
    vic: "victoria",
    qld: "queensland",
    sa: "south australia",
    wa: "western australia",
    tas: "tasmania",
    act: "australian capital territory",
    nt: "northern territory",
    melb: "melbourne",
    "sydney cbd": "cbd"
  };

  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }
  function fold(s) {
    return norm(s).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function stateName(id) { return STATES[id] || id || ""; }
  function stateOfCity(city) { return CITY_STATE[city] || ""; }

  function editDistance(a, b) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 2) return 9;
    var prev = new Array(lb + 1), cur = new Array(lb + 1), j, i;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur[0] = i;
      var rowMin = cur[0];
      var ca = a.charCodeAt(i - 1);
      for (j = 1; j <= lb; j++) {
        var cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        var v = prev[j] + 1;
        if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
        if (prev[j - 1] + cost < v) v = prev[j - 1] + cost;
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > 2) return 9;
      var swap = prev; prev = cur; cur = swap;
    }
    return prev[lb];
  }

  function prepare(data) {
    var source = (data && data.places) || [];
    var places = source.map(function (p) { return Object.assign({}, p); });
    var seen = {};
    places.forEach(function (p, i) {
      var id = (norm(p.name) + "-" + norm(p.suburb)).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || ("p" + i);
      p.id = p.id || id;
    });
    places.forEach(function (p) {
      if (!seen[p.id]) { seen[p.id] = 1; return; }
      var regionSlug = norm(p.region).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      var id = p.id + "-" + regionSlug, n = 2;
      while (seen[id]) { id = p.id + "-" + regionSlug + "-" + n; n++; }
      p.id = id;
      seen[id] = 1;
    });
    var phones = {};
    ((data && data.callFirst) || []).forEach(function (c) {
      var name = String(c.title || "").split(",")[0].trim().toLowerCase();
      if (name && c.phone) phones[name] = String(c.phone).trim();
    });
    var byId = {};
    places.forEach(function (p) {
      if (!p.phone && phones[String(p.name || "").trim().toLowerCase()]) {
        p.phone = phones[String(p.name).trim().toLowerCase()];
        p._phoneFromCallFirst = true;
      }
      p._search = fold([p.name, p.suburb, p.cuisine, p.family, p.region, p.city, p.address].join(" "));
      byId[p.id] = p;
    });
    return {
      places: places,
      byId: byId,
      index: buildIndex(places, (data && data.cities) || []),
      families: (data && data.families) || []
    };
  }

  function cityLabel(cities, id) {
    for (var i = 0; i < cities.length; i++) if (cities[i].id === id) return cities[i].label || id;
    return id;
  }

  function buildIndex(places, cities) {
    var cityById = {};
    cities.forEach(function (c) { cityById[c.id] = c; });
    var items = [];
    var stateCounts = {};
    var cityCounts = {};
    var regionCounts = {};
    var suburbKeys = {};

    places.forEach(function (p) {
      var st = stateOfCity(p.city);
      if (!st) return;
      stateCounts[st] = (stateCounts[st] || 0) + 1;
      cityCounts[p.city] = (cityCounts[p.city] || 0) + 1;
      var rkey = st + "|" + p.city + "|" + p.region;
      regionCounts[rkey] = (regionCounts[rkey] || 0) + 1;
      var skey = rkey + "|" + p.suburb;
      if (!suburbKeys[skey]) suburbKeys[skey] = { state: st, city: p.city, region: p.region, suburb: p.suburb, count: 0 };
      suburbKeys[skey].count++;
    });

    Object.keys(STATES).forEach(function (id) {
      var count = stateCounts[id] || 0;
      if (!count) return;
      items.push({
        kind: "state",
        name: STATES[id],
        context: "Australia",
        count: count,
        aliases: id === "NSW" ? ["nsw"] : id === "VIC" ? ["vic"] : [],
        area: { state: id, stateName: STATES[id], label: STATES[id] }
      });
    });

    cities.forEach(function (c) {
      var st = stateOfCity(c.id);
      if (!st) return;
      var aliases = [];
      if (c.id === "Sydney") aliases.push("syd");
      if (c.id === "Melbourne") aliases.push("melb");
      items.push({
        kind: "city",
        name: c.label || c.id,
        context: STATES[st],
        count: cityCounts[c.id] || 0,
        aliases: aliases,
        area: { state: st, stateName: STATES[st], city: c.id, cityLabel: c.label || c.id, label: c.label || c.id }
      });
      (c.regions || []).forEach(function (region) {
        var same = (c.regions.length === 1 && fold(region) === fold(c.label || c.id));
        if (same) return;
        var aliasesR = [];
        if (c.id === "Sydney" && region === "CBD") aliasesR.push("sydney cbd");
        items.push({
          kind: "region",
          name: region,
          context: (c.label || c.id) + ", " + st,
          count: regionCounts[st + "|" + c.id + "|" + region] || 0,
          aliases: aliasesR,
          area: {
            state: st,
            stateName: STATES[st],
            city: c.id,
            cityLabel: c.label || c.id,
            region: region,
            label: region
          }
        });
      });
    });

    var suburbNameCount = {};
    Object.keys(suburbKeys).forEach(function (k) { var s = suburbKeys[k]; suburbNameCount[fold(s.suburb)] = (suburbNameCount[fold(s.suburb)] || 0) + 1; });
    Object.keys(suburbKeys).forEach(function (k) {
      var s = suburbKeys[k];
      var cLabel = cityLabel(cities, s.city);
      var dup = suburbNameCount[fold(s.suburb)] > 1;
      var context = dup ? (s.region + ", " + cLabel + ", " + s.state) : (cLabel + ", " + s.state);
      items.push({
        kind: "suburb",
        name: s.suburb,
        context: context,
        count: s.count,
        aliases: [],
        area: {
          state: s.state,
          stateName: STATES[s.state],
          city: s.city,
          cityLabel: cLabel,
          region: s.region,
          suburb: s.suburb,
          label: s.suburb
        }
      });
    });

    KNOWN_ELSEWHERE.forEach(function (g) {
      var taken = items.some(function (item) { return fold(item.name) === fold(g.name); });
      if (taken) return;
      items.push({
        kind: g.kind,
        name: g.name,
        context: g.kind === "state" ? "Australia" : STATES[g.state],
        count: 0,
        knownEmpty: true,
        aliases: [],
        area: {
          knownEmpty: true,
          state: g.state,
          stateName: STATES[g.state],
          label: g.name
        }
      });
    });

    return { items: items, cities: cities, stateCounts: stateCounts };
  }

  function searchLocations(query, index) {
    var q = fold(query);
    if (!q) return [];
    if (QUERY_ALIAS[q]) q = QUERY_ALIAS[q];
    var items = (index && index.items) || [];
    var scored = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var names = [fold(item.name)].concat((item.aliases || []).map(fold));
      var best = 99;
      for (var n = 0; n < names.length; n++) {
        var name = names[n];
        if (!name) continue;
        if (name === q) best = Math.min(best, 0);
        else if (name.indexOf(q) === 0) best = Math.min(best, 1);
        else if (name.indexOf(" " + q) >= 0 || name.indexOf(q) > 0) best = Math.min(best, 2);
        else if (q.length >= 4) {
          var allow = q.length >= 8 ? 2 : 1;
          var d = editDistance(q, name);
          if (d <= allow) best = Math.min(best, 3 + d);
          var parts = name.split(" ");
          for (var p = 0; p < parts.length; p++) {
            if (parts[p].length < 4) continue;
            var dw = editDistance(q, parts[p]);
            if (dw <= allow) best = Math.min(best, 3 + dw);
          }
        }
      }
      if (best < 99) scored.push({ item: item, score: best });
    }
    scored.sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;
      var ac = a.item.count > 0 ? 1 : 0, bc = b.item.count > 0 ? 1 : 0;
      if (ac !== bc) return bc - ac;
      if (b.item.count !== a.item.count) return b.item.count - a.item.count;
      return a.item.name.localeCompare(b.item.name);
    });
    var out = [];
    var seen = {};
    for (var s = 0; s < scored.length && out.length < 8; s++) {
      var key = scored[s].item.kind + "|" + fold(scored[s].item.name) + "|" + (scored[s].item.context || "");
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(scored[s].item);
    }
    return out;
  }

  function browse(index, frame) {
    var items = (index && index.items) || [];
    var cities = (index && index.cities) || [];
    frame = frame || { level: "states" };
    if (frame.level === "states") {
      var rows = items.filter(function (item) { return item.kind === "state" && item.count > 0; }).map(function (item) {
        return {
          label: item.name,
          meta: item.count + (item.count === 1 ? " restaurant" : " restaurants"),
          drill: { level: "state", state: item.area.state }
        };
      });
      return { eyebrow: "Or browse by state", showAll: null, rows: rows };
    }
    if (frame.level === "state") {
      var st = frame.state;
      var showAll = { label: "Show all of " + STATES[st], area: { state: st, stateName: STATES[st], label: STATES[st] } };
      var rowsS = [];
      cities.forEach(function (c) {
        if (stateOfCity(c.id) !== st) return;
        var count = 0;
        items.forEach(function (item) { if (item.kind === "city" && item.area.city === c.id) count = item.count; });
        var one = c.regions && c.regions.length === 1 && fold(c.regions[0]) === fold(c.label || c.id);
        rowsS.push({
          label: c.label || c.id,
          meta: count + (count === 1 ? " restaurant" : " restaurants"),
          drill: one
            ? { level: "region", state: st, city: c.id, region: c.regions[0] }
            : { level: "city", state: st, city: c.id }
        });
      });
      return { eyebrow: STATES[st], showAll: showAll, rows: rowsS };
    }
    if (frame.level === "city") {
      var city = null;
      cities.forEach(function (c) { if (c.id === frame.city) city = c; });
      var label = city ? (city.label || city.id) : frame.city;
      var showCity = {
        label: "Show all of " + label,
        area: { state: frame.state, stateName: STATES[frame.state], city: frame.city, cityLabel: label, label: label }
      };
      var rowsC = [];
      items.forEach(function (item) {
        if (item.kind === "region" && item.area.city === frame.city) {
          rowsC.push({
            label: item.name,
            meta: item.count + (item.count === 1 ? " restaurant" : " restaurants"),
            drill: { level: "region", state: frame.state, city: frame.city, region: item.name }
          });
        }
      });
      rowsC.sort(function (a, b) { return a.label.localeCompare(b.label); });
      return { eyebrow: label, showAll: showCity, rows: rowsC };
    }
    var regionItem = null;
    items.forEach(function (item) {
      if (item.kind === "region" && item.area.city === frame.city && item.area.region === frame.region) regionItem = item;
    });
    var regionLabel = frame.region;
    var showRegion = {
      label: "Show all of " + regionLabel,
      area: regionItem ? regionItem.area : { state: frame.state, stateName: STATES[frame.state], city: frame.city, region: frame.region, label: regionLabel }
    };
    var rowsR = [];
    items.forEach(function (item) {
      if (item.kind === "suburb" && item.area.city === frame.city && item.area.region === frame.region) {
        rowsR.push({ label: item.name, meta: String(item.count), area: item.area });
      }
    });
    rowsR.sort(function (a, b) { return b.meta - a.meta || a.label.localeCompare(b.label); });
    return { eyebrow: regionLabel, showAll: showRegion, rows: rowsR };
  }

  function inArea(p, area) {
    if (!area || area.unrecognised) return false;
    if (area.near) return typeof p.lat === "number" && typeof p.lng === "number";
    if (area.knownEmpty) return false;
    var st = stateOfCity(p.city);
    if (area.state && st !== area.state) return false;
    if (area.city && p.city !== area.city) return false;
    if (area.region && p.region !== area.region) return false;
    if (area.suburb && p.suburb !== area.suburb) return false;
    return true;
  }

  function countArea(places, area) {
    var n = 0;
    for (var i = 0; i < places.length; i++) if (inArea(places[i], area)) n++;
    return n;
  }

  function parentArea(area) {
    if (!area || area.near || area.unrecognised) return null;
    if (area.suburb) {
      return {
        state: area.state,
        stateName: area.stateName,
        city: area.city,
        cityLabel: area.cityLabel,
        region: area.region,
        label: area.region || area.cityLabel || area.stateName
      };
    }
    if (area.region) {
      return {
        state: area.state,
        stateName: area.stateName,
        city: area.city,
        cityLabel: area.cityLabel,
        label: area.cityLabel || area.stateName
      };
    }
    if (area.city) return { state: area.state, stateName: area.stateName, label: area.stateName || stateName(area.state) };
    return null;
  }

  function broadenArea(places, area) {
    var parent = parentArea(area);
    if (parent && countArea(places, parent) > 0) return parent;
    return null;
  }

  function corkageText(p) {
    var c = String((p && p.corkage) || "").trim();
    if (!c || /^unknown$/i.test(c) || c === "?" || /^corkage:\s*ask$/i.test(c)) return "";
    return c;
  }
  function priceText(p) {
    var price = String((p && p.price) || "").trim();
    if (!price || price === "?" || price === "-" || price === "—") return "";
    return (p.priceEstimate ? "~" : "") + price;
  }
  function byoPresentation(p) {
    if (p && p.byoConfirmed === true) return { tone: "confirmed", label: "BYO confirmed" };
    if (p && p.byoConfirmed === false) return { tone: "listed", label: "BYO listed — call to confirm" };
    return { tone: "unknown", label: "BYO information unavailable" };
  }
  function addressRoutable(addr) {
    var a = String(addr || "").trim();
    if (!a) return false;
    if (/\d/.test(a)) return true;
    return /\b(street|st|road|rd|avenue|ave|park|cnr|lane|highway|hwy|parade|pde|drive|dr|place|pl|terrace|tce|crescent|cres|way|boulevard|bvd|esplanade|court|cct)\b/i.test(a);
  }
  function directionsUrl(p) {
    var addr = String((p && p.address) || "").trim();
    if (!addressRoutable(addr)) return "";
    var url = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(addr);
    var pid = p.googlePlaceId || p.google_place_id || p.placeId || "";
    if (pid) url += "&destination_place_id=" + encodeURIComponent(pid);
    return url;
  }
  function websiteUrl(p) {
    var u = String((p && p.website) || "").trim();
    return /^https?:\/\//i.test(u) ? u : "";
  }
  function phoneHref(p) {
    var raw = String((p && p.phone) || "").trim();
    if (!raw) return "";
    var digits = raw.replace(/\D/g, "");
    if (digits.length < 8) return "";
    if (digits.charAt(0) === "0") digits = "61" + digits.slice(1);
    return "tel:+" + digits;
  }
  function reviewCount(p) {
    var n = parseInt(String((p && p.reviews) || "").replace(/\D/g, ""), 10);
    return isNaN(n) ? 0 : n;
  }
  function formatNumber(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function haversine(a, b, c, d) {
    var R = 6371000, t = Math.PI / 180, p1 = a * t, p2 = c * t, dp = (c - a) * t, dl = (d - b) * t;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var ALWAYS_BYO = { daily: 1, everyday: 1, "every day": 1, "every night": 1, "all week": 1, "all days": 1, "any day": 1, "7 days": 1, "seven days": 1 };
  function sydneyWeekday(date) {
    try { return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "long" }).format(date || new Date()); }
    catch (e) { return WEEKDAYS[(date || new Date()).getDay()]; }
  }
  function normByoDays(p) {
    var d = p && p.byoDays;
    if (d == null || d === "" || (Array.isArray(d) && !d.length)) return [];
    return (Array.isArray(d) ? d : [d]).map(function (x) { return String(x).trim().toLowerCase(); }).filter(Boolean);
  }
  function byoTonightStatus(p, today) {
    today = (today || sydneyWeekday()).toLowerCase();
    var days = normByoDays(p);
    if (!days.length) return "unknown";
    if (days.some(function (x) { return ALWAYS_BYO[x]; })) return "yes";
    if (days.indexOf("weeknights") >= 0 || days.indexOf("weeknight") >= 0) {
      return ["monday", "tuesday", "wednesday", "thursday"].indexOf(today) >= 0 ? "yes" : "no";
    }
    return days.indexOf(today) >= 0 ? "yes" : "no";
  }

  function blankFilters() {
    return { q: "", cuisine: "All", byo: "All", corkage: "All", rating: 0, radius: 0, tonight: false, sort: "" };
  }
  function filtersActive(f) {
    if (!f) return false;
    return !!(String(f.q || "").trim() || (f.cuisine && f.cuisine !== "All") || (f.byo && f.byo !== "All") || (f.corkage && f.corkage !== "All") || Number(f.rating) > 0 || Number(f.radius) > 0);
  }
  function defaultSort(area) { return area && area.near ? "distance" : "name"; }

  function filterPlaces(places, area, filters, coords) {
    filters = filters || blankFilters();
    var q = fold(filters.q || "");
    var terms = q ? q.split(" ") : [];
    var radiusM = Number(filters.radius) > 0 ? Number(filters.radius) * 1000 : 0;
    var list = [];
    for (var i = 0; i < places.length; i++) {
      var p = places[i];
      if (!inArea(p, area)) continue;
      if (filters.cuisine && filters.cuisine !== "All" && p.family !== filters.cuisine) continue;
      if (filters.byo === "confirmed" && p.byoConfirmed !== true) continue;
      if (filters.byo === "listed" && p.byoConfirmed !== false) continue;
      if (filters.corkage === "known" && !corkageText(p)) continue;
      if (Number(filters.rating) > 0 && Number(p.stars) < Number(filters.rating)) continue;
      if (terms.length && !terms.every(function (t) { return p._search.indexOf(t) >= 0; })) continue;
      if (coords && typeof p.lat === "number" && typeof p.lng === "number") {
        p._dist = haversine(coords.lat, coords.lng, p.lat, p.lng);
        if (radiusM && p._dist > radiusM) continue;
      }
      list.push(p);
    }
    var sort = filters.sort || defaultSort(area);
    if (sort === "distance" && !(coords && area && area.near)) sort = "name";
    list.sort(function (a, b) {
      if (sort === "distance") return (a._dist || 0) - (b._dist || 0) || a.name.localeCompare(b.name);
      if (sort === "rating") return (b.stars || 0) - (a.stars || 0) || reviewCount(b) - reviewCount(a) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    if (filters.tonight) {
      var today = sydneyWeekday();
      var yes = [], unk = [], no = [];
      list.forEach(function (p) {
        var st = byoTonightStatus(p, today);
        if (st === "yes") yes.push(p); else if (st === "no") no.push(p); else unk.push(p);
      });
      list = yes.concat(unk, no);
    }
    return list;
  }

  function sortLabel(sort, area) {
    var used = sort || defaultSort(area);
    if (used === "distance" && area && area.near) return "Nearest first";
    if (used === "rating") return "Sorted by Google rating";
    return "Sorted A–Z";
  }

  function projectPins(list) {
    var pts = list.filter(function (p) { return typeof p.lat === "number" && typeof p.lng === "number"; });
    if (!pts.length) return { width: 100, height: 100, pins: [] };
    var minLat = pts[0].lat, maxLat = pts[0].lat, minLng = pts[0].lng, maxLng = pts[0].lng;
    pts.forEach(function (p) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    });
    var latSpan = Math.max(0.01, maxLat - minLat);
    var lngSpan = Math.max(0.01, maxLng - minLng);
    minLat -= latSpan * 0.14; maxLat += latSpan * 0.14;
    minLng -= lngSpan * 0.14; maxLng += lngSpan * 0.14;
    latSpan = maxLat - minLat; lngSpan = maxLng - minLng;
    var mid = (minLat + maxLat) / 2;
    var cos = Math.cos(mid * Math.PI / 180) || 1;
    var xSpan = lngSpan * cos;
    var ySpan = latSpan;
    var scale = 100 / Math.max(xSpan, ySpan);
    return {
      width: Math.max(20, xSpan * scale),
      height: Math.max(20, ySpan * scale),
      pins: pts.map(function (p) {
        return {
          id: p.id,
          x: (p.lng - minLng) * cos * scale,
          y: (maxLat - p.lat) * scale
        };
      })
    };
  }

  function presentPlace(p) {
    var byo = byoPresentation(p);
    return {
      id: p.id,
      name: p.name,
      cuisine: p.cuisine || "",
      suburb: p.suburb || "",
      region: p.region || "",
      stars: p.stars,
      reviews: reviewCount(p),
      byo: byo,
      corkage: corkageText(p),
      address: String(p.address || "").trim(),
      directions: directionsUrl(p),
      website: websiteUrl(p),
      phone: phoneHref(p),
      phoneText: phoneHref(p) ? String(p.phone).trim() : "",
      price: priceText(p)
    };
  }

  function areaFromParams(params) {
    function get(k) { return params.get ? (params.get(k) || "") : (params[k] || ""); }
    if (get("shortlist") === "1") return { shortlist: true, label: "Your shortlist" };
    if (get("near") === "1") return { near: true, label: "Near you" };
    if (get("unknown") === "1") {
      var query = get("qplace");
      return { unrecognised: true, query: query, label: query || "that search" };
    }
    if (get("empty") === "1") {
      return { knownEmpty: true, state: get("state"), stateName: stateName(get("state")), label: get("label") || "this place" };
    }
    var state = get("state");
    if (!state || !STATES[state]) return null;
    var city = get("city");
    var region = get("region");
    var suburb = get("suburb");
    var label = suburb || region || city || STATES[state];
    return {
      state: state,
      stateName: STATES[state],
      city: city,
      cityLabel: city,
      region: region,
      suburb: suburb,
      label: label
    };
  }

  function writeParams(area, filters, view) {
    var q = [];
    function add(k, v) { if (v != null && v !== "" && v !== "All" && v !== 0 && v !== "0") q.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v))); }
    if (!area) {
      /* home has no query */
    } else if (area.shortlist) add("shortlist", "1");
    else if (area.near) add("near", "1");
    else if (area.unrecognised) { add("unknown", "1"); add("qplace", area.query || area.label || ""); }
    else if (area.knownEmpty) { add("empty", "1"); add("label", area.label || ""); add("state", area.state || ""); }
    else {
      add("state", area.state || "");
      add("city", area.city || "");
      add("region", area.region || "");
      add("suburb", area.suburb || "");
    }
    filters = filters || {};
    add("q", String(filters.q || "").trim());
    add("cuisine", filters.cuisine || "");
    add("byo", filters.byo || "");
    add("corkage", filters.corkage || "");
    add("rating", Number(filters.rating) || "");
    add("radius", Number(filters.radius) || "");
    if (filters.tonight) add("tonight", "1");
    var sort = filters.sort || "";
    if (sort && sort !== defaultSort(area)) add("sort", sort);
    if (view === "map") add("view", "map");
    return q.join("&");
  }

  function filtersFromParams(params) {
    function get(k) { return params.get ? (params.get(k) || "") : (params[k] || ""); }
    var f = blankFilters();
    f.q = get("q");
    f.cuisine = get("cuisine") || "All";
    f.byo = get("byo") || "All";
    f.corkage = get("corkage") || "All";
    f.rating = Number(get("rating")) || 0;
    f.radius = Number(get("radius")) || 0;
    f.tonight = get("tonight") === "1";
    f.sort = get("sort") || "";
    return f;
  }

  return {
    STATES: STATES,
    norm: norm,
    fold: fold,
    prepare: prepare,
    searchLocations: searchLocations,
    browse: browse,
    inArea: inArea,
    countArea: countArea,
    parentArea: parentArea,
    broadenArea: broadenArea,
    corkageText: corkageText,
    priceText: priceText,
    byoPresentation: byoPresentation,
    addressRoutable: addressRoutable,
    directionsUrl: directionsUrl,
    websiteUrl: websiteUrl,
    phoneHref: phoneHref,
    reviewCount: reviewCount,
    formatNumber: formatNumber,
    haversine: haversine,
    byoTonightStatus: byoTonightStatus,
    sydneyWeekday: sydneyWeekday,
    blankFilters: blankFilters,
    filtersActive: filtersActive,
    defaultSort: defaultSort,
    filterPlaces: filterPlaces,
    sortLabel: sortLabel,
    projectPins: projectPins,
    presentPlace: presentPlace,
    areaFromParams: areaFromParams,
    writeParams: writeParams,
    filtersFromParams: filtersFromParams,
    stateName: stateName
  };
});
