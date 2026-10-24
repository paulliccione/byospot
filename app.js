(function () {
  "use strict";
  var D = window.BYO;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var norm = function (s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); };
  var slug = function (s) { return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); };

  var REGIONS = D.regions;
  var places = D.places.slice();
  // Per-region rank = position inside its region in data.js (pinned places first).
  var byRegion = {};
  places.forEach(function (p, i) {
    p._i = i;
    p.id = p.id || (norm(p.name) + "-" + norm(p.suburb)).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || ("p" + i);
    (byRegion[p.region] = byRegion[p.region] || []).push(p);
  });
  var byId = {}; places.forEach(function (p) { byId[p.id] = p; });
  Object.keys(byRegion).forEach(function (r) {
    byRegion[r].sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a._i - b._i; });
    byRegion[r].forEach(function (p, i) { p._rank = i + 1; });
  });
  var regionIndex = function (r) { var i = REGIONS.indexOf(r); return i < 0 ? 99 : i; };
  places.sort(function (a, b) { return regionIndex(a.region) - regionIndex(b.region) || a._rank - b._rank; });
  places.forEach(function (p) { p._search = norm([p.name, p.suburb, p.cuisine, /^unknown\b/i.test(p.dish || "") ? "" : p.dish, p.region].join(" ")); });
  var hero = places.filter(function (p) { return p.pinned; })[0] || places[0];
  var count = function (r) { return (byRegion[r] || []).length; };
  var famSet = D.families.filter(function (f) { return places.some(function (p) { return p.family === f; }); });

  function stars(n) { var f = Math.round(n); return "★".repeat(f) + "☆".repeat(5 - f); }
  function priceText(p) { return p.price === "?" ? "Price ?" : (p.priceEstimate ? "~" : "") + p.price; }
  function famColor(f) { return "var(--fam-" + slug(f || "other") + ", var(--fam-other))"; }
  function chip(t, cls, c) { return '<span class="chip ' + (cls || "") + '"' + (c ? ' style="--c:' + c + '"' : "") + ">" + esc(t) + "</span>"; }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } }
  function fmtDist(m) { return m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1) + " km"; }
  function haversine(a, b, c, d) {
    var R = 6371000, t = Math.PI / 180, p1 = a * t, p2 = c * t, dp = (c - a) * t, dl = (d - b) * t;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function takeawayChip(p) {
    if (p.takeaway === "yes") return chip("🥡 Takeaway", "tint ta");
    if (p.takeaway === "no") return chip("Dine-in only", "muted");
    return chip("🥡 ?", "muted");
  }
  // Two compact lines: nearest chain and nearest boutique/independent (OSM, straight-line, 2 km max).
  function shopRow(b, kind, label) {
    if (b === undefined) return "";
    if (b === null) return '<li class="none"><span class="k">' + label + '</span><span>No ' + (kind === "chain" ? "chain" : "independent") + " within 2 km</span></li>";
    var url = "https://www.google.com/maps/dir/?api=1&destination=" + b.lat + "," + b.lng + "&travelmode=walking";
    return '<li><span class="k">' + label + '</span><a href="' + url + '" target="_blank" rel="noopener" title="Approx. straight-line distance" aria-label="Walking directions to nearest ' + (kind === "chain" ? "chain bottle shop" : "independent bottle shop") + ", " + esc(b.name) + ", about " + fmtDist(b.distanceM) + ' away"><span class="n">' + esc(b.name) + '</span><span class="d">~' + fmtDist(b.distanceM) + "</span></a></li>";
  }
  function bottleLine(p) {
    var s = p.bottleShops;
    if (!s && p.bottleShop !== undefined) s = { chain: undefined, independent: p.bottleShop };   // legacy single shop
    if (!s) return "";
    return '<ul class="bottle" aria-label="Nearest bottle shops">' + shopRow(s.chain, "chain", "🍾 Chain") + shopRow(s.independent, "independent", "🍷 Indie") + "</ul>";
  }

  // Header
  $("title").textContent = D.title;
  $("summary").textContent = D.summary;

  // State
  var state = { q: "", region: "All", suburb: "All", fam: "All", price: "Any", deals: false, takeaway: false, tonight: false, sort: "region", loc: null, subMore: false, limit: 24, planMode: false, picks: [] };
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function sydneyWeekday() {
    try { return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "long" }).format(new Date()); }
    catch (e) { return WEEKDAYS[new Date().getDay()]; }
  }
  function byoTonightStatus(p) {
    if (p.byoTonight === true) return "yes";
    if (p.byoTonight === false) return "no";
    var d = p.byoDays;
    if (d == null || d === "" || (Array.isArray(d) && !d.length)) return "unknown";
    var today = sydneyWeekday().toLowerCase();
    var items = Array.isArray(d) ? d : [d];
    var normed = items.map(function (x) { return String(x).trim().toLowerCase(); });
    if (normed.indexOf("daily") >= 0) return "yes";
    if (normed.indexOf("weeknights") >= 0 || normed.indexOf("weeknight") >= 0) {
      return ["monday", "tuesday", "wednesday", "thursday"].indexOf(today) >= 0 ? "yes" : "no";
    }
    return normed.indexOf(today) >= 0 ? "yes" : "no";
  }
  function parseCorkageDollars(p) {
    // Best-effort parse of "$10 a bottle" / "$5 pp" — returns {amount, per:"bottle"|"person"|null, unknown:bool}
    var c = (p && p.corkage) || "";
    if (!c || /^unknown$/i.test(c) || /^corkage:\s*ask$/i.test(c)) return { amount: null, per: null, unknown: true };
    var m = c.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return { amount: null, per: null, unknown: true };
    var amount = parseFloat(m[1]);
    var per = /\b(pp|per person|a person)\b/i.test(c) ? "person" : "bottle";
    return { amount: amount, per: per, unknown: false };
  }
  var PAGE = 24, PER_GROUP = 3, SUB_MAX = 12, SUB_SHOW = 10;

  // Hero
  function renderHero() {
    var H = D.hero || {}, p = hero;
    $("hero").innerHTML =
      '<div class="hero-rank">#' + p._rank + "</div>" +
      '<div class="hero-body">' +
        '<div class="eyebrow">' + esc(H.eyebrow || "Top of the list") + " · " + esc(p.region) + "</div>" +
        '<div class="hero-name">' + esc(p.name) + "</div>" +
        '<div class="stars">' + stars(p.stars) + " <span>" + esc(p.stars) + " from " + esc(p.reviews) + " Google reviews</span><span class=\"price\" style=\"color:inherit\"> · " + esc(priceText(p)) + "</span></div>" +
        (dishOf(p) ? "<div>" + esc(dishOf(p)) + "</div>" : "") +
        '<div class="chips">' + chip(p.cuisine) + chip(p.address.replace(/ NSW \d{4}$/, "")) + chip(/^unknown$/i.test(p.corkage) ? "Corkage: ask" : p.corkage + " corkage") + chip(p.priceBasis) + (p.takeaway === "yes" ? chip("🥡 Takeaway") : "") + "</div>" +
        (p.takeawayDetail ? '<div class="hero-small">Takeaway: ' + esc(p.takeawayDetail) + "</div>" : "") +
        bottleLine(p) +
        '<div class="hero-small">' + esc(p.note) + ". " + esc(H.extraNote || "") + (p.website ? ' <a href="' + esc(p.website) + '" target="_blank" rel="noopener">' + esc(host(p.website)) + "</a>" : "") + "</div>" +
      "</div>";
  }
  renderHero();

  // Metrics
  var live = REGIONS.filter(function (r) { return count(r) > 0; }).length;
  $("metrics").innerHTML = [
    [places.length, "BYO spots"],
    [live + " of " + REGIONS.length, "Regions live"],
    [places.filter(function (p) { return p.deal; }).length, "With EatClub deals"],
    [places.filter(function (p) { return p.takeaway === "yes"; }).length + " of " + places.length, "Takeaway"]
  ].map(function (m) { return '<div class="metric"><div class="v">' + esc(m[0]) + '</div><div class="l">' + esc(m[1]) + "</div></div>"; }).join("");

  $("caption").textContent = "Every BYO restaurant we could find rated 4.0★ or higher on Google, across Sydney's " + REGIONS.length + " regions and ranked by Google rating. Here you see the top 3 of each; tap See all, or pick a region and suburb. Ratings, prices and EatClub deals as of " + D.asOf + ".";

  // Generic pressed-button group
  function group(el, opts, key, after) {
    el.innerHTML = opts.map(function (o) {
      return '<button type="button" class="' + (o.cls || "") + '" data-v="' + esc(o.v) + '" aria-pressed="' + (state[key] === o.v) + '"' + (o.disabled ? " disabled" : "") + ">" + o.html + "</button>";
    }).join("");
    el.onclick = function (e) {
      var b = e.target.closest("button"); if (!b || b.disabled) return;
      state[key] = b.getAttribute("data-v");
      Array.prototype.forEach.call(el.children, function (c) { c.setAttribute("aria-pressed", String(c === b)); });
      if (after) after();
      render();
    };
  }
  group($("regionChips"), [{ v: "All", html: "All Sydney" }].concat(REGIONS.map(function (r) {
    var n = count(r);
    return { v: r, cls: n ? "" : "soon", html: esc(r) + (n ? '<span class="count">' + n + "</span>" : "<small>soon</small>") };
  })), "region", function () {
    state.suburb = "All"; state.subMore = false;
    if (state.region !== "All" && state.sort === "region") state.sort = "rank";
    if (state.region === "All" && state.sort === "rank") state.sort = "region";
    renderSuburbs(); renderSort();
  });
  group($("famSeg"), ["All"].concat(famSet).map(function (f) { return { v: f, html: esc(f) }; }), "fam");
  group($("priceSeg"), ["Any", "$", "$$", "$$$", "$$$$"].map(function (f) { return { v: f, html: esc(f) }; }), "price");
  $("priceLegend").innerHTML = (D.priceLegend || []).map(function (l) { return "<span><b>" + esc(l.level) + "</b> " + esc(l.label) + "</span>"; }).join("") + '<span class="ln">' + esc(D.priceLegendNote || "") + "</span>";
  $("dealsOnly").addEventListener("change", function (e) { state.deals = e.target.checked; render(); });
  $("takeawayOnly").addEventListener("change", function (e) { state.takeaway = e.target.checked; render(); });
  $("byoTonight").addEventListener("change", function (e) {
    state.tonight = e.target.checked;
    // Soft preference works best as a flat list with section dividers
    if (state.tonight && state.region === "All" && state.sort === "region") { state.sort = "stars"; renderSort(); }
    render();
  });

  function renderSuburbs() {
    var row = $("suburbRow"), list = byRegion[state.region];
    if (!list) { row.hidden = true; row.innerHTML = ""; return; }
    // Only suburbs that actually have listed places, most places first.
    var tally = {};
    list.forEach(function (p) { tally[p.suburb] = (tally[p.suburb] || 0) + 1; });
    var subs = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a] || a.localeCompare(b); });
    row.hidden = false;
    // Keep the row manageable: past ~12 suburbs show the top 10 and a More chip.
    var hiddenN = 0;
    if (subs.length > SUB_MAX && !state.subMore) {
      var shown = subs.slice(0, SUB_SHOW);
      if (state.suburb !== "All" && shown.indexOf(state.suburb) < 0) shown.push(state.suburb);
      hiddenN = subs.length - shown.length; subs = shown;
    }
    var opts = [{ v: "All", html: "All of " + esc(state.region) }].concat(subs.map(function (s) { return { v: s, html: esc(s) + '<span class="count">' + tally[s] + "</span>" }; }));
    if (hiddenN) opts.push({ v: "__more", cls: "more", html: "More <span class=\"count\">+" + hiddenN + "</span>" });
    group(row, opts, "suburb", function () { if (state.suburb === "__more") { state.suburb = "All"; state.subMore = true; renderSuburbs(); } });
  }
  function renderSort() {
    var opts = [state.region === "All" ? { v: "region", html: "By region" } : { v: "rank", html: "Ranked" }];
    opts.push({ v: "stars", html: "Stars" });
    // Nearest only appears once location is known. Near me is the only way to ask for it.
    if (state.loc) opts.push({ v: "near", html: "Nearest" });
    group($("sortSeg"), opts, "sort", syncNearBtn);
  }
  renderSort();

  // Search
  var search = $("search");
  search.addEventListener("input", function () { state.q = search.value; $("clearSearch").hidden = !search.value; render(); });
  $("clearSearch").addEventListener("click", function () { search.value = ""; state.q = ""; $("clearSearch").hidden = true; search.focus(); render(); });

  // Near me — the only entry point for location. Once it succeeds, the Nearest chip appears.
  var msg = $("locMsg"), nearBtn = $("nearMe");
  function syncNearBtn() {
    var on = !!(state.loc && state.sort === "near");
    var label = nearBtn.querySelector("span");
    if (label) label.textContent = on ? "Nearest first" : "Near me";
    nearBtn.setAttribute("aria-pressed", String(on));
    if (on) nearBtn.setAttribute("aria-label", "Nearest first");
    else nearBtn.removeAttribute("aria-label");
  }
  function showMsg(html) { msg.innerHTML = html; msg.hidden = !html; }
  nearBtn.addEventListener("click", function () {
    if (state.loc && state.sort === "near") { state.sort = "rank"; syncNearBtn(); renderSort(); render(); return; }
    if (!("geolocation" in navigator)) { showMsg("<strong>Location isn't available</strong> on this browser, so we can't sort by distance. Try picking a region instead."); return; }
    nearBtn.setAttribute("aria-busy", "true");
    navigator.geolocation.getCurrentPosition(function (pos) {
      nearBtn.removeAttribute("aria-busy");
      state.loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      places.forEach(function (p) { p._dist = haversine(state.loc.lat, state.loc.lng, p.lat, p.lng); });
      state.sort = "near"; syncNearBtn();
      showMsg(""); renderSort(); render();
    }, function (err) {
      nearBtn.removeAttribute("aria-busy");
      if (err.code === 1) showMsg("<strong>No worries.</strong> Location is switched off for this app, so we can't sort by distance. To use Near me, allow location for this site in your browser settings, or just pick a region below.");
      else showMsg("<strong>Couldn't find your location</strong> just now. Check location is on and try again, or pick a region below.");
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });

  // Research placeholders ("Unknown", "Unknown – check menu (seafood)") are shown as gaps, never as text.
  function dishOf(p) { return /^unknown\b/i.test(p.dish || "") ? "" : (p.dish || ""); }
  function dishHint(p) { var m = /^unknown\b.*?\(([^)]+)\)/i.exec(p.dish || ""); return m ? m[1] : ""; }
  function corkageOf(p) { return !p.corkage || /^unknown$/i.test(p.corkage) ? "Corkage: ask" : p.corkage; }

  function card(p, compact, tone) {
    var dish = dishOf(p), hint = dishHint(p);
    var dealHtml = p.deal ? (compact
      ? '<a class="deal-chip" href="' + esc(p.deal.url) + '" target="_blank" rel="noopener">EatClub ' + esc(p.deal.pct) + " ↗</a>"
      : '<a class="deal" href="' + esc(p.deal.url) + '" target="_blank" rel="noopener"><div class="d1">EatClub ' + esc(p.deal.pct) + '</div><div class="d2">' + esc(p.deal.when) + "</div></a>") : "";
    var ta = p.takeaway === "yes" ? chip("🥡 Takeaway", "tint ta") : p.takeaway === "no" ? chip("Dine-in only", "muted") : (compact ? "" : chip("Takeaway: ask", "muted"));
    var ton = tone || (state.tonight ? byoTonightStatus(p) : "");
    var tonightChip = "";
    if (state.tonight) {
      if (ton === "yes") tonightChip = chip("BYO tonight", "tint ok");
      else if (ton === "no") tonightChip = chip("Other night", "muted");
      else tonightChip = chip("BYO days unknown — call ahead", "warn");
    }
    var picked = state.picks.indexOf(p.id) >= 0;
    var planBtn = state.planMode
      ? '<button type="button" class="plan-add' + (picked ? " on" : "") + '" data-add="' + esc(p.id) + '" aria-pressed="' + picked + '">' + (picked ? "Added ✓" : "Add") + "</button>"
      : "";
    var details =
      '<div class="meta">' + esc(p.priceBasis) + (p.priceEstimate ? " (estimate)" : "") + (p.takeaway === "yes" && p.takeawayDetail && !/^takeaway$/i.test(p.takeawayDetail) ? " · Takeaway: " + esc(p.takeawayDetail) : "") + "</div>" +
      '<div class="card-foot"><span>🍷 ' + esc(corkageOf(p)) + "</span>" + (p.website ? '<a href="' + esc(p.website) + '" target="_blank" rel="noopener">Website ↗</a>' : "<span class=\"muted-t\">No website</span>") + "</div>" +
      (p.note || hint ? '<div class="note">' + esc([p.note, hint].filter(Boolean).join(". ")) + "</div>" : "") +
      '<button type="button" class="calc-open" data-calc="' + esc(p.id) + '">Corkage vs wine list</button>';
    var cls = "card" + (compact ? " compact" : "") + (ton === "no" || ton === "unknown" ? " dim" : "") + (picked ? " picked" : "");
    return '<article class="' + cls + '" data-id="' + esc(p.id) + '" style="--c:' + famColor(p.family) + '">' +
      '<div class="card-top"><div class="card-name">' + esc(p.name) + '</div><div class="rank"><b>#' + p._rank + "</b><small>" + esc(p.region) + "</small></div></div>" +
      (state.loc ? '<span class="dist">📍 ' + (p._dist / 1000).toFixed(1) + " km away</span>" : "") +
      '<div class="stars">' + stars(p.stars) + " <span>" + esc(p.stars) + " (" + esc(p.reviews) + ')</span><span class="price">· ' + esc(priceText(p)) + "</span></div>" +
      '<div class="chips">' + chip(p.cuisine, "tint", famColor(p.family)) + chip(p.suburb) + ta + (p.byoConfirmed ? "" : chip("Confirm BYO", "warn")) + tonightChip + "</div>" +
      (dish ? '<div class="dish">' + esc(dish) + "</div>" : "") +
      planBtn +
      (compact ? dealHtml : dealHtml) +
      (compact
        ? '<button type="button" class="details-btn" aria-expanded="false">Corkage, price &amp; more <span aria-hidden="true">▾</span></button><div class="details" hidden>' + bottleLine(p) + details + "</div>"
        : bottleLine(p) + details) +
    "</article>";
  }

  function render() {
    var q = norm(state.q).trim();
    var terms = q ? q.split(/\s+/) : [];
    var list = places.filter(function (p) {
      return (state.region === "All" || p.region === state.region) &&
        (state.suburb === "All" || p.suburb === state.suburb) &&
        (state.fam === "All" || p.family === state.fam) &&
        (state.price === "Any" || p.price === state.price) &&
        (!state.deals || !!p.deal) && (!state.takeaway || p.takeaway === "yes") &&
        terms.every(function (t) { return p._search.indexOf(t) >= 0; });
    });
    var filtered = !!(q || state.suburb !== "All" || state.fam !== "All" || state.price !== "Any" || state.deals || state.takeaway);
    var tonightOn = !!state.tonight;
    var grouped = state.sort === "region" && state.region === "All" && !tonightOn;
    var showHero = !filtered && !tonightOn && !state.planMode && (grouped || state.sort === "rank") && (state.region === "All" || state.region === hero.region);
    $("hero").hidden = !showHero;
    document.body.classList.toggle("searching", !!q);
    document.body.classList.toggle("plan-mode", !!state.planMode);
    document.body.classList.toggle("tonight-on", tonightOn);
    if (showHero) list = list.filter(function (p) { return p !== hero; });
    if (state.sort === "near" && state.loc) list.sort(function (a, b) { return a._dist - b._dist; });
    else if (state.sort === "stars") list.sort(function (a, b) { return b.stars - a.stars || parseInt(String(b.reviews).replace(/\D/g, ""), 10) - parseInt(String(a.reviews).replace(/\D/g, ""), 10); });

    var yes = [], unk = [], no = [];
    if (tonightOn) {
      list.forEach(function (p) {
        var st = byoTonightStatus(p);
        if (st === "yes") yes.push(p); else if (st === "no") no.push(p); else unk.push(p);
      });
      list = yes.concat(unk, no);
    }

    var html = "", total = list.length + (showHero ? 1 : 0);
    if (grouped) {
      var cap = filtered ? 6 : PER_GROUP;
      REGIONS.forEach(function (r) {
        var g = list.filter(function (p) { return p.region === r; });
        var n = g.length + (showHero && hero.region === r ? 1 : 0);
        if (!g.length) return;
        html += '<section class="region-group"><h3 class="group-head">' + esc(r) + "<span>" + n + (n === 1 ? " spot" : " spots") + "</span></h3>" +
          '<div class="grid">' + g.slice(0, cap).map(function (p) { return card(p, true); }).join("") + "</div>" +
          (n > cap + (showHero && hero.region === r ? 1 : 0) || filtered ? '<button type="button" class="see-all" data-region="' + esc(r) + '">See all ' + (filtered ? "of " + esc(r) : n + " in " + esc(r)) + ' →</button>' : "") +
          "</section>";
      });
    } else if (tonightOn) {
      var shown = list.slice(0, state.limit);
      var parts = [];
      var lastBand = null;
      var allUnknown = !yes.length && !no.length;
      if (allUnknown) {
        parts.push('<p class="tonight-note" role="status">We don’t know BYO days for these places yet — call ahead. Order is otherwise unchanged.</p>');
      } else {
        parts.push('<p class="tonight-note" role="status">Showing places that look BYO-friendly <strong>tonight (' + esc(sydneyWeekday()) + ', Sydney)</strong> first. Others stay visible underneath — never removed.</p>');
      }
      parts.push('<div class="grid">');
      shown.forEach(function (p) {
        var st = byoTonightStatus(p);
        var band = st === "yes" ? "yes" : st === "no" ? "no" : "unknown";
        if (!allUnknown && band !== lastBand) {
          if (band === "yes") parts.push('<h3 class="band-head">BYO tonight</h3>');
          else if (band === "unknown") parts.push('<h3 class="band-head muted">BYO days unknown — call ahead</h3>');
          else parts.push('<h3 class="band-head muted">Other nights</h3>');
          lastBand = band;
        }
        parts.push(card(p, false, st));
      });
      parts.push("</div>");
      html = parts.join("");
      if (list.length > state.limit) html += '<button type="button" class="see-all show-more" id="showMore">Show ' + Math.min(PAGE, list.length - state.limit) + " more · " + (list.length - state.limit) + " left</button>";
    } else {
      html = '<div class="grid">' + list.slice(0, state.limit).map(function (p) { return card(p, false); }).join("") + "</div>";
      if (list.length > state.limit) html += '<button type="button" class="see-all show-more" id="showMore">Show ' + Math.min(PAGE, list.length - state.limit) + " more · " + (list.length - state.limit) + " left</button>";
    }
    $("grid").innerHTML = list.length ? html : "";
    var tonightBit = tonightOn ? (", " + yes.length + " look good tonight") : "";
    $("resultCount").textContent = total + (total === 1 ? " place" : " places") + (state.region === "All" ? " across Sydney" : " in " + state.region) + (state.suburb !== "All" ? " · " + state.suburb : "") + (state.sort === "near" ? ", nearest first" : grouped && !filtered ? ", top 3 per region" : "") + tonightBit;
    $("listHeading").textContent = state.region === "All" ? "All of Sydney" : state.region;
    var on = (state.fam !== "All") + (state.price !== "Any") + state.deals + state.takeaway;
    $("moreFiltersLabel").textContent = on ? "More filters · " + on + " on" : "More filters";

    var empty = $("empty");
    if (list.length || showHero) { empty.hidden = true; return; }
    empty.hidden = false;
    if (state.region !== "All" && !count(state.region)) empty.innerHTML = '<div class="big">🍷</div><strong>' + esc(state.region) + " is coming soon</strong>We're still researching this region.";
    else empty.innerHTML = "<strong>Nothing matches yet</strong>Try a different search, suburb, cuisine, price or toggle.";
  }

  // Reset paging whenever the view changes; "Show more" / See all are delegated.
  var baseRender = render;
  render = function (keepLimit) { if (keepLimit !== true) state.limit = PAGE; baseRender(); };
  $("grid").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.id === "showMore") { state.limit += PAGE; baseRender(); return; }
    if (b.classList.contains("details-btn")) {
      var open = b.getAttribute("aria-expanded") !== "true";
      b.setAttribute("aria-expanded", String(open)); b.nextElementSibling.hidden = !open; return;
    }
    var addId = b.getAttribute("data-add");
    if (addId) { togglePick(addId); render(true); syncPlanner(); return; }
    var calcId = b.getAttribute("data-calc");
    if (calcId) { openCalcFor(calcId); return; }
    var r = b.getAttribute("data-region");
    if (r) {
      var chip = $("regionChips").querySelector('button[data-v="' + r.replace(/"/g, '\\"') + '"]');
      if (chip) { chip.click(); chip.scrollIntoView({ block: "nearest", inline: "center" }); $("listSection").scrollIntoView({ behavior: "smooth", block: "start" }); }
    }
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting && document.getElementById("showMore")) { state.limit += PAGE; baseRender(); } });
    }, { rootMargin: "600px" }).observe($("footSentinel") || $("empty"));
  }
  renderSuburbs();
  render();

  // Fine print, calls, reserve
  $("finePrint").textContent = D.finePrint;
  $("calls").innerHTML = (D.callFirst || []).map(function (c) {
    var tel = "+61" + String(c.phone).replace(/\D/g, "").replace(/^0/, "");
    return '<li><a href="tel:' + tel + '"><div><div class="row-title">' + esc(c.title) + '</div><div class="row-detail">' + esc(c.detail) + '</div></div><span class="row-phone">📞 ' + esc(c.phone) + "</span></a></li>";
  }).join("");
  $("reserve").textContent = D.reserve;
  $("footnote").textContent = "Bottle shops are from OpenStreetMap, within 2 km, with straight-line distances, so the walk may be a little longer. Chain means a big brand or banner group (Dan Murphy's, BWS, Liquorland, First Choice, Vintage Cellars, IGA, Bottlemart, Cellarbrations and the like); Indie is every other bottle shop or wine store. Data as of " + D.asOf + ".";

  // ---- Group night planner (URL hash shortlist + localStorage votes) ----
  function togglePick(id) {
    var i = state.picks.indexOf(id);
    if (i >= 0) state.picks.splice(i, 1);
    else {
      if (state.picks.length >= 6) { showPlannerMsg("Keep it to about 3–6 places so friends can decide."); return; }
      state.picks.push(id);
    }
    writePlanHash();
  }
  function writePlanHash() {
    if (!state.picks.length) {
      if (/^#plan=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    var h = "#plan=" + state.picks.join(",");
    if (location.hash !== h) history.replaceState(null, "", h);
  }
  function readPlanHash() {
    var m = /^#plan=([\w,-]+)$/.exec(location.hash || "");
    if (!m) return null;
    return m[1].split(",").filter(function (id) { return !!byId[id]; });
  }
  function voteKey(ids) { return "byospot-votes-" + ids.slice().sort().join(","); }
  function loadVotes(ids) {
    try { return JSON.parse(localStorage.getItem(voteKey(ids)) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function saveVotes(ids, votes) {
    try { localStorage.setItem(voteKey(ids), JSON.stringify(votes)); } catch (e) {}
  }
  function voterId() {
    var k = "byospot-voter";
    try {
      var v = localStorage.getItem(k);
      if (v) return v;
      v = "v" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(k, v);
      return v;
    } catch (e) { return "anon"; }
  }
  function showPlannerMsg(t) {
    var el = $("plannerMsg"); if (!el) return;
    el.hidden = !t; el.textContent = t || "";
  }
  function syncPlanner() {
    var box = $("plannerPicks"), empty = $("plannerEmpty"), share = $("plannerShare");
    if (!box) return;
    box.innerHTML = state.picks.map(function (id) {
      var p = byId[id]; if (!p) return "";
      return '<div class="planner-row"><div><strong>' + esc(p.name) + '</strong><span>' + esc(p.suburb) + " · " + esc(p.cuisine) + '</span></div>' +
        '<button type="button" class="btn ghost sm" data-add="' + esc(id) + '">Remove</button></div>';
    }).join("");
    empty.hidden = state.picks.length > 0;
    share.disabled = state.picks.length < 2;
    $("planNight").setAttribute("aria-pressed", String(state.planMode));
    $("planNight").textContent = state.planMode ? ("Planning… " + state.picks.length) : "Plan a night";
  }
  function openPlanner() {
    state.planMode = true;
    $("plannerSheet").hidden = false;
    syncPlanner();
  }
  function closePlanner() { $("plannerSheet").hidden = true; }
  $("planNight").addEventListener("click", function () {
    if (state.planMode && !$("plannerSheet").hidden) {
      state.planMode = false; $("plannerSheet").hidden = true; $("planNight").setAttribute("aria-pressed", "false");
      $("planNight").textContent = "Plan a night"; render(true); return;
    }
    openPlanner(); render(true);
  });
  $("plannerClose").addEventListener("click", closePlanner);
  $("plannerClear").addEventListener("click", function () {
    state.picks = []; writePlanHash(); syncPlanner(); showPlannerMsg("Picks cleared."); render(true);
  });
  $("plannerShare").addEventListener("click", function () {
    if (state.picks.length < 2) return;
    writePlanHash();
    var url = location.href.split("#")[0] + "#plan=" + state.picks.join(",");
    function ok() { showPlannerMsg("Link copied — send it to your friends."); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok).catch(function () { prompt("Copy this link:", url); ok(); });
    else { prompt("Copy this link:", url); ok(); }
  });
  $("plannerPicks").addEventListener("click", function (e) {
    var b = e.target.closest("[data-add]"); if (!b) return;
    togglePick(b.getAttribute("data-add")); syncPlanner(); render(true);
  });

  function renderVoteSheet(ids) {
    var votes = loadVotes(ids);
    var me = voterId();
    var my = votes[me] || null;
    var tallies = {};
    ids.forEach(function (id) { tallies[id] = 0; });
    Object.keys(votes).forEach(function (vid) { if (tallies[votes[vid]] != null) tallies[votes[vid]]++; });
    var totalVoters = Object.keys(votes).length;
    $("voteList").innerHTML = ids.map(function (id) {
      var p = byId[id]; if (!p) return "";
      var n = tallies[id] || 0;
      var pct = totalVoters ? Math.round(100 * n / totalVoters) : 0;
      return '<button type="button" class="vote-row' + (my === id ? " mine" : "") + '" data-vote="' + esc(id) + '">' +
        '<div class="vote-main"><strong>' + esc(p.name) + '</strong><span>' + esc(p.suburb) + " · ★" + esc(p.stars) + " · " + esc(corkageOf(p)) + '</span></div>' +
        '<div class="vote-tally"><b>' + n + '</b><small>' + pct + '%</small></div></button>';
    }).join("") + (totalVoters ? '<p class="vote-meta">' + totalVoters + (totalVoters === 1 ? " vote" : " votes") + " on this device</p>" : '<p class="vote-meta">No votes yet — be the first.</p>');
    $("voteEmpty").hidden = ids.length > 0;
    $("voteSheet").hidden = false;
  }
  $("voteList").addEventListener("click", function (e) {
    var b = e.target.closest("[data-vote]"); if (!b) return;
    var ids = readPlanHash() || state.picks;
    if (!ids || !ids.length) return;
    var votes = loadVotes(ids);
    votes[voterId()] = b.getAttribute("data-vote");
    saveVotes(ids, votes);
    renderVoteSheet(ids);
  });
  $("voteClose").addEventListener("click", function () { $("voteSheet").hidden = true; });
  $("voteBrowse").addEventListener("click", function () {
    $("voteSheet").hidden = true;
    history.replaceState(null, "", location.pathname + location.search);
  });
  function bootHash() {
    var ids = readPlanHash();
    if (ids && ids.length) { state.picks = ids.slice(); renderVoteSheet(ids); syncPlanner(); }
  }
  window.addEventListener("hashchange", bootHash);

  // ---- Corkage vs wine-list calculator ----
  function openCalcFor(id) {
    var p = byId[id]; if (!p) return;
    $("calcPanel").hidden = false;
    $("calcToggle").setAttribute("aria-expanded", "true");
    ensureCalcPlaces();
    $("calcPlace").value = id;
    applyCalcPlace(p);
  }
  function ensureCalcPlaces() {
    var sel = $("calcPlace");
    if (sel.getAttribute("data-ready") === "1") return;
    var opts = ['<option value="">— type corkage yourself —</option>'];
    var pool = state.picks.length ? state.picks.map(function (id) { return byId[id]; }).filter(Boolean)
      : (state.region !== "All" ? places.filter(function (p) { return p.region === state.region; }) : places.slice(0, 80));
    pool.slice(0, 100).forEach(function (p) {
      opts.push('<option value="' + esc(p.id) + '">' + esc(p.name) + " (" + esc(p.suburb) + ")</option>");
    });
    sel.innerHTML = opts.join("");
    sel.setAttribute("data-ready", "1");
  }
  function applyCalcPlace(p) {
    var parsed = parseCorkageDollars(p);
    var hint = $("calcCorkHint");
    if (parsed.unknown) {
      $("calcCork").value = "";
      hint.hidden = false;
      hint.textContent = "Corkage unknown for " + p.name + " — ask the venue, then type it in.";
      $("calcCork").removeAttribute("data-per");
    } else {
      $("calcCork").value = String(parsed.amount);
      hint.hidden = false;
      hint.textContent = parsed.per === "person"
        ? ("Listed as about $" + parsed.amount + " per person. We’ll multiply by party size.")
        : ("Prefilling $" + parsed.amount + " from the listing (per bottle). Edit if wrong.");
      $("calcCork").setAttribute("data-per", parsed.per || "bottle");
    }
    runCalc();
  }
  function runCalc() {
    var cork = parseFloat($("calcCork").value);
    var party = parseInt($("calcParty").value, 10) || 0;
    var bottle = parseFloat($("calcBottle").value);
    var list = parseFloat($("calcList").value);
    var per = $("calcCork").getAttribute("data-per") || "bottle";
    var out = $("calcResult");
    if (!party) { out.textContent = "Add a party size."; out.className = "calc-result"; return; }
    if (isNaN(cork) || cork < 0) { out.textContent = "Need corkage (or ask the venue) to compare honestly."; out.className = "calc-result need"; return; }
    if (isNaN(bottle) || bottle < 0) { out.textContent = "Add what your bottle cost (bottle shop / what you brought)."; out.className = "calc-result need"; return; }
    var corkTotal = per === "person" ? cork * party : cork;
    var byoTotal = bottle + corkTotal;
    if (isNaN(list) || list <= 0) {
      out.innerHTML = "<strong>BYO night ≈ $" + byoTotal.toFixed(0) + "</strong> (bottle $" + bottle.toFixed(0) + " + corkage $" + corkTotal.toFixed(0) + "). Add a wine-list bottle price to see which wins.";
      out.className = "calc-result info";
      return;
    }
    var diff = list - byoTotal;
    if (Math.abs(diff) < 1) {
      out.innerHTML = "<strong>About even</strong> — BYO ≈ $" + byoTotal.toFixed(0) + ", wine list $" + list.toFixed(0) + ".";
      out.className = "calc-result even";
    } else if (diff > 0) {
      out.innerHTML = "<strong>BYO wins by ~$" + diff.toFixed(0) + "</strong> — BYO ≈ $" + byoTotal.toFixed(0) + " vs wine list $" + list.toFixed(0) + ".";
      out.className = "calc-result win";
    } else {
      out.innerHTML = "<strong>Wine list wins by ~$" + (-diff).toFixed(0) + "</strong> — wine list $" + list.toFixed(0) + " vs BYO ≈ $" + byoTotal.toFixed(0) + ".";
      out.className = "calc-result lose";
    }
  }
  $("calcToggle").addEventListener("click", function () {
    var open = $("calcPanel").hidden;
    $("calcPanel").hidden = !open;
    $("calcToggle").setAttribute("aria-expanded", String(open));
    if (open) { ensureCalcPlaces(); runCalc(); }
  });
  $("calcPlace").addEventListener("change", function () {
    var p = byId[$("calcPlace").value];
    if (p) applyCalcPlace(p); else { $("calcCorkHint").hidden = true; $("calcCork").removeAttribute("data-per"); runCalc(); }
  });
  ["calcCork", "calcParty", "calcBottle", "calcList"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      if (id === "calcCork") $("calcCork").removeAttribute("data-per");
      runCalc();
    });
  });

  bootHash();
  syncPlanner();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
