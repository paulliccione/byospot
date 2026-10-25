(function () {
  "use strict";
  var L = window.BYOLogic;
  var D = window.BYO;
  if (!L || !D) return;
  var model = L.prepare(D);
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  var state = {
    screen: "home",
    area: null,
    filters: L.blankFilters(),
    view: "list",
    picks: loadPicks(),
    limit: 24,
    browseStack: [],
    locQuery: "",
    locReturn: "results",
    rows: [],
    showAll: null,
    coords: loadCoords(),
    geoBusy: false,
    geoError: "",
    detailId: "",
    menuOpen: false,
    filtersOpen: false,
    draft: null,
    mapId: "",
    poll: null,
    token: "",
    pollError: "",
    shareBusy: false,
    voteChoice: "",
    voteError: "",
    voteBusy: false,
    voteDone: false,
    removedNote: "",
    legacyIds: [],
    toast: "",
    keepScroll: false
  };
  var depth = 0;

  function loadPicks() {
    try {
      var raw = JSON.parse(sessionStorage.getItem("byospot-picks") || "[]");
      return Array.isArray(raw) ? raw.filter(function (id) { return typeof id === "string"; }) : [];
    } catch (e) { return []; }
  }
  function savePicks() {
    state.picks = state.picks.filter(function (id) { return model.byId[id]; });
    try { sessionStorage.setItem("byospot-picks", JSON.stringify(state.picks)); } catch (e) {}
  }
  function loadCoords() {
    try {
      var c = JSON.parse(sessionStorage.getItem("byospot-coords") || "null");
      if (c && typeof c.lat === "number" && typeof c.lng === "number") return c;
    } catch (e) {}
    return null;
  }
  function saveCoords(c) {
    state.coords = c;
    try { sessionStorage.setItem("byospot-coords", JSON.stringify(c)); } catch (e) {}
  }
  function voterToken() {
    var key = "byospot-voter";
    try {
      var v = localStorage.getItem(key);
      if (v && /^[A-Za-z0-9_-]{8,80}$/.test(v)) return v;
      var bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      v = "v";
      for (var i = 0; i < bytes.length; i++) v += bytes[i].toString(36);
      v = v.replace(/[^a-z0-9]/gi, "").slice(0, 24);
      while (v.length < 10) v += "x";
      localStorage.setItem(key, v);
      return v;
    } catch (e) { return "vsession00"; }
  }

  function icon(name) {
    if (name === "menu") return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    if (name === "back") return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (name === "pin") return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>';
    if (name === "close") return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    if (name === "glass") return '<svg viewBox="0 0 48 48" width="32" height="32" aria-hidden="true"><path d="M14 8h20l-3 16a8 8 0 0 1-14 0L14 8z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M18 18c2-2 4 2 6 0s4-2 6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M24 26v8M18 38h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    return "";
  }

  function header(home) {
    var back = home ? "" : '<button type="button" class="icon-btn" data-action="back" aria-label="Back">' + icon("back") + "</button>";
    return '<header class="top' + (home ? " top-home" : "") + '">' + back +
      '<a href="/" data-action="home"><img class="logo" src="icons/logo-horizontal.png" alt="BYOSpot"></a>' +
      '<button type="button" class="icon-btn" data-action="menu" aria-label="Menu" aria-expanded="' + (state.menuOpen ? "true" : "false") + '">' + icon("menu") + "</button></header>";
  }

  function homeArt() {
    return '<svg class="home-art" viewBox="0 0 220 108" role="img" aria-hidden="true">' +
      '<g fill="none" stroke="#800020" stroke-width="2.6" stroke-linejoin="round">' +
      '<path d="M46 10h40l-5 32a18 18 0 0 1-30 0L46 10z" fill="#fff"/>' +
      '<path d="M52 30c5-6 10 4 15 0s10-6 15 0v8a12 12 0 0 1-30 0v-8z" fill="#800020" stroke="none"/>' +
      '<path d="M66 48v16M52 68h28" stroke-linecap="round"/>' +
      "</g>" +
      '<g stroke="#001838" stroke-width="2.6" stroke-linecap="round">' +
      '<ellipse cx="150" cy="72" rx="46" ry="16" fill="#fff"/>' +
      '<ellipse cx="150" cy="66" rx="32" ry="11" fill="#f6e6cf" stroke="none"/>' +
      '<path d="M128 64c8-7 14 5 22 0s14-7 22 0" fill="none" stroke="#d7a04a"/>' +
      '<path d="M130 70c8-5 14 4 20 0s12-5 18 1" fill="none" stroke="#c4842c"/>' +
      '<circle cx="150" cy="62" r="5.5" fill="#800020" stroke="none"/>' +
      '<path d="M184 28v26M178 28v12M190 28v12" fill="none"/>' +
      "</g></svg>";
  }

  function homeHtml() {
    var err = state.geoError ? '<p class="loc-status" role="status">' + state.geoError + "</p>" : "";
    return header(true) + '<main id="main" class="home">' +
      '<div class="home-copy"><h1>Great food.<br>Your wine.</h1>' +
      '<p class="lede">Find your next BYO restaurant.</p>' + homeArt() + "</div>" +
      '<div class="home-actions">' + err +
      '<button type="button" class="btn btn-primary" data-action="near" ' + (state.geoBusy ? "disabled aria-busy=\"true\"" : "") + ">" +
      icon("pin") + "<span>" + (state.geoBusy ? "Finding restaurants near you…" : "Find BYO Near Me") + "</span></button>" +
      '<button type="button" class="btn btn-secondary" data-action="choose-location">' + icon("pin") + "<span>Choose a Location</span></button>" +
      '<p class="home-note">Two choices. Your next BYO spot is only a tap away.</p></div></main>';
  }

  function locationListInner() {
    var q = state.locQuery.trim();
    if (q) {
      var matches = L.searchLocations(q, model.index);
      state.rows = matches.map(function (m) {
        return {
          label: m.name,
          meta: m.context + (m.count ? "" : " · No BYO listings yet"),
          area: m.area
        };
      });
      state.showAll = null;
      if (!matches.length) {
        return '<div class="empty-panel"><h2>We couldn’t find that location</h2>' +
          "<p>Check the spelling, or browse states, regions and suburbs.</p>" +
          '<div class="stack"><button type="button" class="btn btn-secondary" data-action="clear-loc">Browse states, regions and suburbs</button></div></div>';
      }
      return rowsHtml(state.rows);
    }
    var frame = state.browseStack[state.browseStack.length - 1] || { level: "states" };
    var page = L.browse(model.index, frame);
    state.showAll = page.showAll;
    state.rows = page.rows;
    var show = page.showAll ? '<button type="button" class="show-all" data-action="show-all">' + esc(page.showAll.label) + "</button>" : "";
    return '<p class="eyebrow">' + esc(page.eyebrow || "") + "</p>" + show + rowsHtml(page.rows);
  }
  function rowsHtml(rows) {
    return rows.map(function (row, i) {
      var chev = row.drill ? '<span class="chev" aria-hidden="true">›</span>' : "";
      return '<button type="button" class="loc-row" data-action="loc-row" data-i="' + i + '"><span><span class="label">' +
        esc(row.label) + '</span></span><span class="meta">' + esc(row.meta || "") + "</span>" + chev + "</button>";
    }).join("");
  }
  function locationHtml() {
    return header(false) + '<main id="main" class="screen"><h1>Choose a location</h1>' +
      '<form id="locForm" role="search"><label class="search"><span class="sr" style="position:absolute;left:-999px">Search suburb, city or region</span>' +
      '<input id="locQ" type="search" enterkeyhint="search" placeholder="Search suburb, city or region" autocomplete="off" value="' + esc(state.locQuery) + '">' +
      (state.locQuery ? '<button type="button" class="clear" data-action="clear-loc" aria-label="Clear search">×</button>' : "") +
      "</label></form><div id=\"locList\">" + locationListInner() + "</div></main>";
  }

  function currentList() {
    if (state.area && state.area.shortlist) {
      var picked = state.picks.map(function (id) { return model.byId[id]; }).filter(Boolean);
      var narrowed = Object.assign(L.blankFilters(), state.filters);
      narrowed.radius = 0;
      return L.filterPlaces(picked, { near: true }, narrowed, null);
    }
    var coords = state.area && state.area.near ? state.coords : null;
    return L.filterPlaces(model.places, state.area, state.filters, coords);
  }
  function resultsHeading() {
    if (!state.area) return "BYO restaurants";
    if (state.area.near) return "BYO restaurants near you";
    if (state.area.unrecognised || state.area.knownEmpty) return "Search results";
    return "BYO restaurants in " + state.area.label;
  }

  function badgeHtml(p) {
    var byo = L.byoPresentation(p);
    var cork = L.corkageText(p);
    return '<div class="byo-row"><span class="badge ' + byo.tone + '">' + esc(byo.label) + "</span>" +
      (cork ? '<span class="cork">' + esc(cork) + "</span>" : "") + "</div>";
  }
  function cardHtml(p) {
    var view = L.presentPlace(p);
    var rating = typeof p.stars === "number"
      ? '<p class="rating"><span class="star" aria-hidden="true">★</span> ' + esc(p.stars) +
        (view.reviews ? ' <span class="muted">(' + esc(L.formatNumber(view.reviews)) + " Google reviews)</span>" : "") + "</p>"
      : "";
    var addr = view.address
      ? (view.directions
        ? '<p class="addr"><a href="' + esc(view.directions) + '" target="_blank" rel="noopener">' + esc(view.address) + "</a></p>"
        : '<p class="addr">' + esc(view.address) + "</p>")
      : "";
    var dist = state.area && state.area.near && typeof p._dist === "number" ? '<p class="dist">' + esc(formatDist(p._dist)) + " away</p>" : "";
    var actions = "";
    if (view.directions) actions += '<a href="' + esc(view.directions) + '" target="_blank" rel="noopener">Directions</a>';
    if (view.website) actions += '<a href="' + esc(view.website) + '" target="_blank" rel="noopener">Website</a>';
    if (view.phone) actions += '<a href="' + esc(view.phone) + '">Call</a>';
    actions += '<button type="button" data-action="details" data-id="' + esc(p.id) + '">More details</button>';
    return '<article class="card"><button type="button" class="card-hit" data-action="details" data-id="' + esc(p.id) + '">' +
      '<span class="thumb">' + icon("glass") + "</span><span><h3>" + esc(p.name) + "</h3>" +
      '<p class="meta">' + esc([p.cuisine, p.suburb].filter(Boolean).join(" · ")) + "</p>" +
      rating + badgeHtml(p) + addr + dist + "</span></button><div class=\"actions\">" + actions + "</div></article>";
  }
  function formatDist(m) {
    if (m < 950) return Math.max(10, Math.round(m / 10) * 10) + " m";
    var km = m / 1000;
    return (km < 10 ? km.toFixed(1) : String(Math.round(km))) + " km";
  }

  function emptyHtml(list) {
    if (list.length) return "";
    if (L.filtersActive(state.filters) && state.area && !state.area.unrecognised && !state.area.knownEmpty) {
      return '<div class="empty-panel"><h2>No restaurants match these filters</h2><p>Clear them to see every listing for this search.</p>' +
        '<div class="stack"><button type="button" class="btn btn-primary" data-action="reset-filters">Clear filters</button></div></div>';
    }
    if (state.area && state.area.unrecognised) {
      return '<div class="empty-panel"><h2>We couldn’t find that location</h2>' +
        "<p>Check the spelling, or browse states, regions and suburbs.</p>" +
        '<div class="stack"><button type="button" class="btn btn-primary" data-action="choose-location">Browse states, regions and suburbs</button></div></div>';
    }
    var name = (state.area && state.area.label) || "this place";
    var parent = state.area ? L.broadenArea(model.places, state.area) : null;
    return '<div class="empty-panel"><div class="thumb" style="margin:0 auto 8px">' + icon("glass") + "</div>" +
      "<h2>No BYO restaurants found in " + esc(name) + "</h2>" +
      "<p>Try a nearby suburb or broaden your search to the surrounding region.</p>" +
      '<div class="stack"><button type="button" class="btn btn-primary" data-action="broaden">' +
      (parent ? "Explore nearby areas" : "Explore nearby areas") + "</button>" +
      '<button type="button" class="btn btn-secondary" data-action="choose-location">Browse states, regions and suburbs</button></div>' +
      '<p class="section-label">Try a broader location</p></div>';
  }

  function mapHtml(list) {
    var plot = L.projectPins(list);
    var selected = state.mapId && model.byId[state.mapId] ? model.byId[state.mapId] : null;
    if (!selected && list[0]) selected = list[0];
    var pins = plot.pins.map(function (pin) {
      var on = selected && pin.id === selected.id;
      var id = esc(pin.id);
      return '<g data-action="map-pin" data-id="' + id + '" style="cursor:pointer">' +
        '<circle cx="' + pin.x + '" cy="' + pin.y + '" r="7" fill="transparent"></circle>' +
        '<circle cx="' + pin.x + '" cy="' + pin.y + '" r="' + (on ? 3.4 : 2.6) + '" fill="' + (on ? "#5c0018" : "#800020") + '" stroke="#fff" stroke-width="0.8"></circle></g>';
    }).join("");
    var preview = "";
    if (selected) {
      var byo = L.byoPresentation(selected);
      preview = '<button type="button" class="map-preview" data-action="details" data-id="' + esc(selected.id) + '"><strong>' +
        esc(selected.name) + "</strong><span>" + esc([selected.cuisine, selected.suburb, byo.label].filter(Boolean).join(" · ")) + "</span></button>";
    }
    return '<div class="map-wrap"><svg class="map-svg" viewBox="0 0 ' + plot.width + " " + plot.height + '" role="img" aria-label="Map of restaurants at stored coordinates">' +
      pins + "</svg></div>" + preview +
      '<p class="map-caption">Pins use each restaurant’s stored coordinates.</p>';
  }

  function resultsHtml() {
    if (state.area && state.area.near && !state.coords) {
      return header(false) + '<main id="main" class="screen"><h1>BYO restaurants near you</h1>' +
        '<div class="panel"><p>We need your location to list restaurants near you. BYOSpot only asks when you tap the button.</p>' +
        '<div class="stack"><button type="button" class="btn btn-primary" data-action="near">' + (state.geoBusy ? "Finding restaurants near you…" : "Find BYO Near Me") + "</button>" +
        '<button type="button" class="btn btn-secondary" data-action="choose-location">Choose a Location</button></div>' +
        (state.geoError ? '<p class="loc-status" role="status">' + state.geoError + "</p>" : "") +
        "</div></main>";
    }
    var list = currentList();
    var shown = state.view === "map" ? list : list.slice(0, state.limit);
    var nFilters = activeFilterCount(state.filters);
    var body;
    if (!list.length) body = emptyHtml(list);
    else if (state.view === "map") body = mapHtml(list);
    else {
      body = '<div class="cards">' + shown.map(cardHtml).join("") + "</div>";
      if (list.length > shown.length) body += '<div class="stack" style="margin-top:12px"><button type="button" class="btn btn-ghost" id="showMore" data-action="more">Show more</button></div><div id="moreSentinel"></div>';
    }
    var banner = list.length ? '<section class="vote-banner"><h2>Where Should We Eat?</h2>' +
      "<p>Going out with friends? Shortlist a few BYO restaurants and let everyone vote.</p>" +
      '<button type="button" class="btn btn-primary" data-action="vote-start">Put It to a Vote</button></section>' : "";
    var locLabel = state.area && state.area.near ? "Near you" : ((state.area && state.area.label) || "Choose a location");
    return header(false) + '<main id="main" class="screen"><h1>' + esc(resultsHeading()) + "</h1>" +
      '<button type="button" class="loc-line" data-action="choose-location">' + icon("pin") + "<span>" + esc(locLabel) + "</span><span>Change</span></button>" +
      banner +
      '<div class="toolbar"><h2>Restaurants</h2><div class="toolbar-actions">' +
      '<button type="button" class="btn btn-small btn-ghost" data-action="filters">Filters' + (nFilters ? " · " + nFilters : "") + "</button>" +
      '<div class="seg" role="group" aria-label="List or map"><button type="button" data-action="view" data-view="list" aria-pressed="' + (state.view !== "map") + '">List</button>' +
      '<button type="button" data-action="view" data-view="map" aria-pressed="' + (state.view === "map") + '">Map</button></div></div></div>' +
      (list.length ? '<p class="sort-note">' + esc(L.sortLabel(state.filters.sort, state.area)) + "</p><p class=\"count-line\">" + list.length + (list.length === 1 ? " restaurant" : " restaurants") + "</p>" : "") +
      body + "</main>";
  }

  function activeFilterCount(f) {
    var n = 0;
    if (String(f.q || "").trim()) n++;
    if (f.cuisine && f.cuisine !== "All") n++;
    if (f.byo && f.byo !== "All") n++;
    if (f.corkage && f.corkage !== "All") n++;
    if (Number(f.rating) > 0) n++;
    if (Number(f.radius) > 0) n++;
    if (f.tonight) n++;
    if (f.sort && f.sort !== L.defaultSort(state.area)) n++;
    return n;
  }

  function selectHtml() {
    var list = currentList();
    if (!(state.area && state.area.shortlist)) {
      var allowed = {};
      list.forEach(function (p) { allowed[p.id] = 1; });
      var dropped = state.picks.filter(function (id) { return !allowed[id]; });
      if (dropped.length) {
        state.picks = state.picks.filter(function (id) { return allowed[id]; });
        savePicks();
        if (!state.removedNote) state.removedNote = "Removed " + dropped.length + (dropped.length === 1 ? " restaurant that isn’t" : " restaurants that aren’t") + " in this area.";
      }
    }
    var ids = {};
    list.forEach(function (p) { ids[p.id] = 1; });
    var visiblePicks = state.picks.filter(function (id) { return ids[id]; });
    var shown = list.slice(0, state.limit || 30);
    var cards = shown.map(function (p) {
      var on = visiblePicks.indexOf(p.id) >= 0;
      var cork = L.corkageText(p);
      return '<button type="button" class="check" data-action="toggle" data-id="' + esc(p.id) + '" aria-pressed="' + on + '">' +
        '<span class="box" aria-hidden="true">' + (on ? "✓" : "") + "</span><span><strong>" + esc(p.name) + "</strong>" +
        '<span class="fine">' + esc([p.cuisine, p.suburb].filter(Boolean).join(" · ")) + "</span><br>" +
        '<span class="fine">' + esc(L.byoPresentation(p).label + (cork ? " · " + cork : "")) + "</span>" +
        (p.address ? '<br><span class="fine">' + esc(p.address) + "</span>" : "") +
        "</span></button>";
    }).join("");
    var note = state.removedNote ? '<p class="note" role="status">' + esc(state.removedNote) + "</p>" : "";
    var err = state.pollError ? '<p class="loc-status" role="alert">' + esc(state.pollError) + "</p>" : "";
    var locLabel = state.area && state.area.near ? "Near you" : ((state.area && state.area.label) || "Choose a location");
    return header(false) + '<main id="main" class="screen screen-select">' + steps(1) +
      "<h1>Where Should We Eat?</h1><p class=\"sub\">Tick the restaurants you’d like your friends to choose between.</p>" +
      '<button type="button" class="loc-line" data-action="choose-location">' + icon("pin") + "<span>" + esc(locLabel) + "</span><span>Change</span></button>" +
      note + err +
      '<div class="toolbar"><h2>Restaurants</h2><button type="button" class="btn btn-small btn-ghost" data-action="filters">Filters' + (activeFilterCount(state.filters) ? " · " + activeFilterCount(state.filters) : "") + "</button></div>" +
      (list.length ? cards + (list.length > shown.length ? '<div class="stack"><button type="button" class="btn btn-ghost" data-action="more">Show more</button></div>' : "") : emptyHtml(list)) +
      '<p class="fine-print">Choose at least two. There’s no three-restaurant limit.</p></main>' +
      '<div class="dock"><div class="dock-inner"><div class="dock-meta"><strong>' + visiblePicks.length + " restaurant" + (visiblePicks.length === 1 ? "" : "s") + " selected</strong><span>Minimum 2</span></div>" +
      '<button type="button" class="btn btn-primary" data-action="continue-share" ' + (visiblePicks.length < 2 || state.shareBusy ? "disabled" : "") + ">" +
      (state.shareBusy ? "Saving shortlist…" : "Continue to share") + "</button></div></div>";
  }

  function steps(n) {
    function dot(i, label) {
      var cls = i < n ? "step done" : i === n ? "step on" : "step";
      var mark = i < n ? "✓" : String(i);
      return '<span class="' + cls + '" aria-hidden="true">' + mark + "</span>";
    }
    return '<div class="steps" aria-label="Step ' + n + ' of 3">' + dot(1, "Select") + '<i class="step-line"></i>' + dot(2, "Share") + '<i class="step-line"></i>' + dot(3, "Vote") + "</div>" +
      '<div class="step-labels"><span>Select</span><span>Share</span><span>Vote</span></div>';
  }

  function shareHtml() {
    var poll = state.poll;
    if (state.pollLoading) return header(false) + '<main id="main" class="screen"><p class="sub" role="status">Loading shortlist…</p></main>';
    if (!poll) return header(false) + '<main id="main" class="screen"><div class="panel"><h1>This shortlist isn’t available</h1><p>' +
      esc(state.pollError || "This voting link isn’t valid or has expired.") + "</p></div></main>";
    var url = location.origin + "/vote/" + poll.shareToken;
    var rows = poll.restaurantIds.map(function (id) {
      var p = model.byId[id];
      var name = p ? p.name : "A restaurant no longer listed";
      var meta = p ? [p.cuisine, p.suburb].filter(Boolean).join(" · ") : "";
      return '<button type="button" class="place-row" data-action="details" data-id="' + esc(id) + '"><span><strong>' + esc(name) + "</strong><br><span class=\"fine\">" + esc(meta) + '</span></span><span class="chev" aria-hidden="true">›</span></button>';
    }).join("");
    return header(false) + '<main id="main" class="screen">' + steps(2) +
      '<div style="text-align:center"><div class="thumb" style="margin:8px auto">' + icon("glass") + "</div><h1>Your shortlist is ready!</h1>" +
      '<p class="sub">Share a link with your friends so they can vote on where to eat.</p></div>' +
      '<div class="link-row"><code>' + esc(url.replace(/^https?:\/\//, "")) + '</code><button type="button" class="btn btn-small btn-secondary" data-action="copy" data-url="' + esc(url) + '">Copy</button></div>' +
      '<button type="button" class="btn btn-primary" data-action="native-share" data-url="' + esc(url) + '">Share with friends</button>' +
      '<p class="section-label">Restaurants (' + poll.restaurantIds.length + ")</p>" + rows +
      '<div class="stack"><button type="button" class="btn btn-secondary" data-action="edit-shortlist">Edit shortlist</button>' +
      '<a class="btn btn-ghost" href="/vote/' + esc(poll.shareToken) + '">Preview the voting screen</a></div>' +
      (state.toast ? '<p id="toast" class="toast" role="status">' + esc(state.toast) + "</p>" : '<p id="toast" class="toast" role="status" hidden></p>') +
      "</main>";
  }

  function voteHtml() {
    if (state.pollLoading) return header(false) + '<main id="main" class="screen"><p role="status">Loading the shortlist…</p></main>';
    var poll = state.poll;
    if (!poll) return header(false) + '<main id="main" class="screen"><div class="panel"><h1>This voting link isn’t valid or has expired</h1><p>' +
      esc(state.pollError || "Ask the person who shared it for a new link.") + '</p><button type="button" class="btn btn-primary" data-action="home">Find a BYO restaurant</button></div></main>';
    var done = state.voteDone || !!poll.myVote;
    var choices = poll.restaurantIds.map(function (id) {
      var p = model.byId[id];
      var name = p ? p.name : "Restaurant no longer listed";
      var bits = [];
      if (p) {
        if (p.cuisine) bits.push(p.cuisine);
        if (p.suburb) bits.push(p.suburb);
        var cork = L.corkageText(p);
        bits.push(cork || L.byoPresentation(p).label);
      }
      var pressed = (state.voteChoice || poll.myVote) === id;
      if (done) {
        return '<div class="choice" aria-pressed="' + pressed + '"><span class="radio"></span><span><strong>' + esc(name) + '</strong><br><span class="fine">' + esc(bits.join(" · ")) + "</span></span></div>";
      }
      return '<button type="button" class="choice" data-action="pick-vote" data-id="' + esc(id) + '" aria-pressed="' + pressed + '"><span class="radio"></span><span><strong>' +
        esc(name) + '</strong><br><span class="fine">' + esc(bits.join(" · ")) + "</span></span></button>";
    }).join("");
    var summary = "";
    if (poll.summary && (done || (poll.total || 0) > 0)) {
      if (poll.summary.kind === "tie") summary = "<p><strong>It’s a tie.</strong></p>";
      else if (poll.summary.kind === "lead") {
        var lead = model.byId[poll.summary.ids[0]];
        summary = "<p><strong>Leading: " + esc(lead ? lead.name : "one restaurant") + "</strong></p>";
      } else if (done) summary = "<p>No votes yet.</p>";
      if (poll.summary.kind !== "none" || done) {
        var max = 0;
        poll.restaurantIds.forEach(function (id) { max = Math.max(max, poll.tallies[id] || 0); });
        summary += '<div class="bars">' + poll.restaurantIds.map(function (id) {
          var n = poll.tallies[id] || 0;
          var p = model.byId[id];
          var w = max ? Math.round(100 * n / max) : 0;
          return '<div class="bar-row"><span>' + esc(p ? p.name : "Restaurant") + "</span><span>" + n + '</span><span class="track"><i style="width:' + w + '%"></i></span></div>';
        }).join("") + "</div>";
      }
    }
    return header(false) + '<main id="main" class="screen">' + steps(3) +
      "<h1>Where should we eat?</h1><p class=\"sub\">Pick your favourite restaurant. No account needed.</p>" +
      (state.voteError ? '<p class="loc-status" role="alert">' + esc(state.voteError) + "</p>" : "") +
      (done ? '<p class="note" role="status">Thanks — your vote’s in.</p>' : "") +
      choices +
      (done ? "" : '<button type="button" class="btn btn-primary" data-action="submit-vote" ' + (!state.voteChoice || state.voteBusy ? "disabled" : "") + ">" +
        (state.voteBusy ? "Submitting…" : "Submit my vote") + "</button>") +
      summary +
      '<p class="fine-print">Voting is saved for this browser. A repeat tap won’t be counted twice.</p></main>';
  }

  function legacyHtml() {
    var ids = state.legacyIds || [];
    if (ids.length < 2) {
      return header(false) + '<main id="main" class="screen"><div class="panel"><h1>This older link can’t collect votes</h1><p>Ask for a new share link with at least two restaurants.</p>' +
        '<button type="button" class="btn btn-primary" data-action="home">Find a BYO restaurant</button></div></main>';
    }
    state.picks = ids.slice();
    var rows = ids.map(function (id) {
      var p = model.byId[id];
      return "<p><strong>" + esc(p.name) + "</strong><br><span class=\"fine\">" + esc(p.suburb) + "</span></p>";
    }).join("");
    return header(false) + '<main id="main" class="screen"><h1>This is an older shortlist link</h1>' +
      "<p class=\"sub\">Votes on the old link stayed on each phone. Create a new link so friends vote on the same shortlist.</p>" +
      rows + (state.pollError ? '<p class="loc-status" role="alert">' + esc(state.pollError) + "</p>" : "") +
      '<button type="button" class="btn btn-primary" data-action="continue-share">' + (state.shareBusy ? "Saving shortlist…" : "Create a shareable poll") + "</button></main>";
  }

  function detailSheet() {
    var p = model.byId[state.detailId];
    if (!p) return "";
    var view = L.presentPlace(p);
    var bits = [];
    if (view.price) bits.push("<p><strong>Price</strong> " + esc(view.price) + (p.priceBasis ? " · " + esc(p.priceBasis) : "") + "</p>");
    var dish = /^unknown\b/i.test(p.dish || "") ? "" : (p.dish || "");
    if (dish) bits.push("<p><strong>Known for</strong> " + esc(dish) + "</p>");
    if (p.note) bits.push("<p>" + esc(p.note) + "</p>");
    if (p.takeaway === "yes" || p.takeaway === "no") {
      bits.push("<p><strong>Takeaway</strong> " + (p.takeaway === "yes" ? "Yes" : "Dine-in only") + (p.takeawayDetail ? " · " + esc(p.takeawayDetail) : "") + "</p>");
    }
    if (p.byoDays) {
      var days = Array.isArray(p.byoDays) ? p.byoDays.join(", ") : String(p.byoDays);
      if (days) bits.push("<p><strong>BYO days</strong> " + esc(days) + "</p>");
    }
    if (p.deal && p.deal.url) bits.push('<p><a href="' + esc(p.deal.url) + '" target="_blank" rel="noopener">EatClub ' + esc(p.deal.pct || "") + "</a>" + (p.deal.when ? " · " + esc(p.deal.when) : "") + "</p>");
    if (view.address && !view.directions) bits.push("<p>Directions stay hidden until this record has a full street address.</p>");
    var shops = shopBlock(p);
    var actions = "";
    if (view.directions) actions += '<a class="btn btn-secondary" href="' + esc(view.directions) + '" target="_blank" rel="noopener">Directions</a>';
    if (view.website) actions += '<a class="btn btn-ghost" href="' + esc(view.website) + '" target="_blank" rel="noopener">Website</a>';
    if (view.phone) actions += '<a class="btn btn-ghost" href="' + esc(view.phone) + '">Call</a>';
    return '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="detailTitle"><div class="sheet-card detail">' +
      '<div class="sheet-head"><h2 id="detailTitle">' + esc(p.name) + '</h2><button type="button" class="icon-btn" data-action="close" aria-label="Close">' + icon("close") + "</button></div>" +
      "<p class=\"meta\">" + esc([p.cuisine, p.suburb, p.region].filter(Boolean).join(" · ")) + "</p>" +
      (typeof p.stars === "number" ? '<p class="rating"><span class="star">★</span> ' + esc(p.stars) + " <span class=\"muted\">(" + esc(L.formatNumber(view.reviews)) + " Google reviews)</span></p>" : "") +
      badgeHtml(p) + (view.address ? "<p class=\"addr\">" + esc(view.address) + "</p>" : "") +
      bits.join("") + shops + '<div class="stack">' + actions + "</div></div></div>";
  }
  function shopBlock(p) {
    var s = p.bottleShops;
    if (!s) return "";
    function row(b, label) {
      if (!b) return "";
      var url = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(b.lat + "," + b.lng) + "&travelmode=walking";
      var dist = typeof b.distanceM === "number" ? " · ~" + (b.distanceM < 1000 ? Math.round(b.distanceM) + " m" : (b.distanceM / 1000).toFixed(1) + " km") : "";
      return '<li><a href="' + url + '" target="_blank" rel="noopener">' + esc(label + ": " + b.name + dist) + "</a></li>";
    }
    var html = row(s.chain, "Nearest chain") + row(s.independent, "Nearest indie");
    return html ? '<p><strong>Bottle shops within 2 km</strong></p><ul class="shops">' + html + "</ul>" : "";
  }

  function menuSheet() {
    if (!state.menuOpen) return "";
    var calls = (D.callFirst || []).map(function (c) {
      var tel = "+61" + String(c.phone || "").replace(/\D/g, "").replace(/^0/, "");
      var detail = /rank/i.test(c.detail || "") ? "Call to confirm" : (c.detail || "");
      return '<li><a href="tel:' + esc(tel) + '"><span><strong>' + esc(String(c.title || "").split(",")[0]) + "</strong><br><span class=\"fine\">" + esc(detail) + "</span></span><span>" + esc(c.phone || "") + "</span></a></li>";
    }).join("");
    return '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="menuTitle"><div class="sheet-card">' +
      '<div class="sheet-head"><h2 id="menuTitle">Menu</h2><button type="button" class="icon-btn" data-action="close" aria-label="Close">' + icon("close") + "</button></div>" +
      '<p>BYOSpot lists BYO restaurants rated 4.0★ or higher on Google across Sydney, the Blue Mountains, Melbourne and the Victorian coast. Listings as of ' + esc(D.asOf || "") + ". Corkage and BYO policy can change — call the restaurant to confirm.</p>" +
      "<h3>Call before you go</h3><ul class=\"call-list\">" + calls + "</ul>" +
      "<h3>EatClub</h3><p class=\"fine-print\">" + esc(D.finePrint || "") + "</p></div></div>";
  }

  function filtersSheet() {
    if (!state.filtersOpen) return "";
    var d = state.draft || L.blankFilters();
    function chips(group, options) {
      return '<div class="chips" role="group">' + options.map(function (o) {
        var on = String(d[group] == null ? "" : d[group]) === String(o.v);
        return '<button type="button" class="chip" data-action="draft" data-key="' + group + '" data-v="' + esc(o.v) + '" aria-pressed="' + on + '">' + esc(o.label) + "</button>";
      }).join("") + "</div>";
    }
    var cuisines = [{ v: "All", label: "Any" }].concat((model.families || []).map(function (f) { return { v: f, label: f }; }));
    var sorts = [{ v: "", label: "Default" }, { v: "name", label: "A–Z" }, { v: "rating", label: "Rating" }];
    if (state.area && state.area.near && state.coords) sorts.splice(1, 0, { v: "distance", label: "Distance" });
    var radius = "";
    if (state.area && state.area.near && state.coords) {
      radius = "<h3>Search radius</h3>" + chips("radius", [
        { v: "0", label: "Any" }, { v: "5", label: "5 km" }, { v: "10", label: "10 km" }, { v: "25", label: "25 km" }, { v: "50", label: "50 km" }
      ]);
    }
    var preview = L.filterPlaces(model.places, state.area, d, state.area && state.area.near ? state.coords : null);
    return '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="filterTitle"><div class="sheet-card">' +
      '<div class="sheet-head"><h2 id="filterTitle">Filters</h2><button type="button" class="icon-btn" data-action="close" aria-label="Close">' + icon("close") + "</button></div>" +
      '<label class="field"><span>Restaurant name</span><input id="filterQ" type="search" value="' + esc(d.q || "") + '" placeholder="Name or dish"></label>' +
      "<h3>Cuisine</h3>" + chips("cuisine", cuisines) +
      "<h3>BYO status</h3>" + chips("byo", [
        { v: "All", label: "Any" }, { v: "confirmed", label: "BYO confirmed" }, { v: "listed", label: "BYO listed — call to confirm" }
      ]) +
      "<h3>Corkage</h3>" + chips("corkage", [{ v: "All", label: "Any" }, { v: "known", label: "Amount listed" }]) +
      "<h3>Google rating</h3>" + chips("rating", [{ v: "0", label: "Any" }, { v: "4.5", label: "4.5+" }]) +
      radius +
      "<h3>Sort</h3>" + chips("sort", sorts) +
      '<div class="chips" style="margin-top:12px"><button type="button" class="chip" data-action="draft" data-key="tonight" data-v="' + (d.tonight ? "0" : "1") + '" aria-pressed="' + !!d.tonight + '">Prefer BYO tonight</button></div>' +
      '<p class="count-line" id="filterCount">' + preview.length + (preview.length === 1 ? " restaurant" : " restaurants") + "</p>" +
      '<div class="stack"><button type="button" class="btn btn-primary" data-action="apply-filters">Show restaurants</button>' +
      '<button type="button" class="btn btn-ghost" data-action="reset-filters">Clear filters</button></div></div></div>';
  }

  function screenHtml() {
    if (state.screen === "home") return homeHtml();
    if (state.screen === "location") return locationHtml();
    if (state.screen === "results") return resultsHtml();
    if (state.screen === "select") return selectHtml();
    if (state.screen === "share") return shareHtml();
    if (state.screen === "vote") return voteHtml();
    if (state.screen === "legacy") return legacyHtml();
    return homeHtml();
  }

  function render() {
    var y = window.scrollY || 0;
    var keep = state.keepScroll;
    state.keepScroll = false;
    document.body.classList.toggle("modal-open", !!(state.detailId || state.menuOpen || state.filtersOpen));
    $("app").innerHTML = screenHtml() + detailSheet() + menuSheet() + filtersSheet();
    var title = "BYOSpot";
    if (state.screen === "home") title = "BYOSpot · Find a BYO restaurant";
    else if (state.screen === "results") title = resultsHeading() + " · BYOSpot";
    else if (state.screen === "location") title = "Choose a location · BYOSpot";
    else if (state.screen === "select" || state.screen === "share") title = "Where Should We Eat? · BYOSpot";
    else if (state.screen === "vote") title = "Where should we eat? · BYOSpot";
    document.title = title;
    if (keep) window.scrollTo(0, y);
  }

  function resultsQuery() {
    return L.writeParams(state.area, state.filters, state.view);
  }
  function go(path, opts) {
    opts = opts || {};
    if (opts.replace) history.replaceState({ app: 1, depth: depth }, "", path);
    else { depth += 1; history.pushState({ app: 1, depth: depth }, "", path); }
    applyRoute(true);
  }
  function syncUrl() {
    var base = state.screen === "select" ? "/select" : "/results";
    var qs = resultsQuery();
    history.replaceState({ app: 1, depth: depth }, "", base + (qs ? "?" + qs : ""));
    render();
  }

  function applyRoute(scroll) {
    var route = parseRoute();
    state.screen = route.screen;
    state.detailId = "";
    state.menuOpen = false;
    state.filtersOpen = false;
    if (route.screen === "results" || route.screen === "select") {
      state.area = L.areaFromParams(route.params) || state.area;
      state.filters = L.filtersFromParams(route.params);
      state.view = route.params.get("view") === "map" ? "map" : "list";
      if (!state.area) { state.screen = "home"; }
      if (state.screen === "select" && state.limit < 30) state.limit = 30;
    }
    if (route.screen === "vote" || route.screen === "share") {
      if (state.token !== route.token) {
        state.token = route.token;
        state.poll = null;
        state.voteDone = false;
        state.voteChoice = "";
        state.voteError = "";
        state.pollError = "";
      }
      if (!state.poll) loadPoll(route.token, route.screen);
    }
    if (route.screen === "legacy") state.legacyIds = route.ids;
    if (route.screen === "home") state.geoError = state.geoError;
    render();
    if (scroll) window.scrollTo(0, 0);
  }

  function parseRoute() {
    var path = location.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
    var params = new URLSearchParams(location.search);
    var hash = location.hash || "";
    if (hash === "#plan" || hash.indexOf("#plan=") === 0) {
      var body = hash === "#plan" ? "" : hash.slice("#plan=".length);
      var ids = body.split(",").filter(function (id) { return !!model.byId[id]; });
      return { screen: "legacy", ids: ids, params: params };
    }
    var vote = path.match(/^\/vote\/([A-Za-z0-9_-]+)$/);
    if (vote) return { screen: "vote", token: vote[1], params: params };
    var share = path.match(/^\/share\/([A-Za-z0-9_-]+)$/);
    if (share) return { screen: "share", token: share[1], params: params };
    if (path === "/location") return { screen: "location", params: params };
    if (path === "/select") return { screen: "select", params: params };
    if (path === "/results") return { screen: "results", params: params };
    return { screen: "home", params: params };
  }

  function loadPoll(token, screen) {
    state.pollLoading = true;
    render();
    fetch("/api/polls/" + encodeURIComponent(token) + "?voter=" + encodeURIComponent(voterToken()))
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; }); })
      .then(function (r) {
        state.pollLoading = false;
        if (!r.ok) { state.poll = null; state.pollError = (r.data && r.data.error) || "This voting link isn’t valid or has expired."; }
        else {
          state.poll = r.data;
          state.pollError = "";
          if (r.data.myVote) { state.voteDone = true; state.voteChoice = r.data.myVote; }
        }
        if (state.screen === screen && state.token === token) render();
      })
      .catch(function () {
        state.pollLoading = false;
        state.poll = null;
        state.pollError = "You're offline or we couldn't reach the voting service. Check your connection and try again.";
        if (state.screen === screen) render();
      });
  }

  function chooseArea(area) {
    var ret = state.locReturn || "results";
    try { ret = sessionStorage.getItem("byospot-loc-return") || ret; } catch (e) {}
    if (!area.near && state.filters.sort === "distance") state.filters.sort = "";
    if (ret === "select") {
      var next = L.filterPlaces(model.places, area, state.filters, area.near ? state.coords : null);
      var keep = {};
      next.forEach(function (p) { keep[p.id] = 1; });
      var removed = state.picks.filter(function (id) { return !keep[id]; });
      state.picks = state.picks.filter(function (id) { return keep[id]; });
      savePicks();
      state.removedNote = removed.length ? ("Removed " + removed.length + (removed.length === 1 ? " restaurant that isn’t" : " restaurants that aren’t") + " in this area.") : "";
      state.area = area;
      state.view = "list";
      go("/select?" + L.writeParams(area, state.filters, "list"));
      return;
    }
    state.area = area;
    state.view = "list";
    state.limit = 24;
    go("/results?" + L.writeParams(area, state.filters, "list"));
  }

  function openLocation(ret) {
    state.locReturn = ret;
    state.locQuery = "";
    state.browseStack = [];
    try { sessionStorage.setItem("byospot-loc-return", ret); } catch (e) {}
    go("/location");
  }

  function requestNear() {
    state.geoError = "";
    if (!("geolocation" in navigator)) {
      state.geoError = "Location isn’t available in this browser. Choose a location instead.";
      render();
      return;
    }
    state.geoBusy = true;
    render();
    navigator.geolocation.getCurrentPosition(function (pos) {
      state.geoBusy = false;
      state.geoError = "";
      saveCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      state.area = { near: true, label: "Near you" };
      state.filters.sort = "distance";
      state.view = "list";
      state.limit = 24;
      go("/results?" + L.writeParams(state.area, state.filters, "list"));
    }, function (err) {
      state.geoBusy = false;
      if (err && err.code === 1) state.geoError = "Location is off for this site, so we can’t sort by distance. Choose a location instead.";
      else state.geoError = "We couldn’t find your location just now. Choose a location instead.";
      if (state.screen !== "home" && state.screen !== "results") state.screen = "home";
      render();
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 });
  }

  function uiBack() {
    if (history.state && history.state.app && depth > 0) { history.back(); return; }
    if (state.screen === "share") { go("/select?" + resultsQuery(), { replace: true }); return; }
    if (state.screen === "select" || state.screen === "location" || state.screen === "results") {
      if (state.screen === "select" && state.area) { go("/results?" + resultsQuery(), { replace: true }); return; }
      go("/", { replace: true });
      return;
    }
    go("/", { replace: true });
  }

  function createShare() {
    if (state.picks.length < 2 || state.shareBusy) return;
    state.shareBusy = true;
    state.pollError = "";
    render();
    fetch("/api/polls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restaurantIds: state.picks })
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, data: data }; });
    }).then(function (r) {
      state.shareBusy = false;
      if (!r.ok) {
        state.pollError = (r.data && r.data.error) || "We couldn’t save this shortlist, so a shareable link isn’t ready.";
        render();
        return;
      }
      state.poll = r.data;
      state.token = r.data.shareToken;
      state.pollError = "";
      go("/share/" + r.data.shareToken);
    }).catch(function () {
      state.shareBusy = false;
      state.pollError = "We couldn’t save this shortlist. Check your connection and try again.";
      render();
    });
  }

  function submitVote() {
    if (!state.voteChoice || state.voteBusy || !state.token) return;
    state.voteBusy = true;
    state.voteError = "";
    render();
    var voter = voterToken();
    fetch("/api/polls/" + encodeURIComponent(state.token) + "/vote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restaurantId: state.voteChoice, participantToken: voter })
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
    }).then(function (r) {
      state.voteBusy = false;
      if (!r.ok) {
        state.voteError = (r.data && r.data.error) || "We couldn’t save your vote.";
        if (r.data && r.data.tallies) state.poll = r.data;
        if (r.status === 409) state.voteDone = true;
        render();
        return;
      }
      state.poll = r.data;
      state.voteDone = true;
      state.voteError = "";
      render();
    }).catch(function () {
      state.voteBusy = false;
      state.voteError = "You're offline or we couldn't reach the voting service. Check your connection and try again.";
      render();
    });
  }

  function copyText(url) {
    function ok() {
      var el = $("toast");
      if (el) { el.hidden = false; el.textContent = "Link copied."; return; }
      state.toast = "Link copied.";
      render();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok).catch(function () { window.prompt("Copy this link:", url); ok(); });
    else { window.prompt("Copy this link:", url); ok(); }
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action], a.logo, a[data-action='home']");
    if (!el) return;
    var action = el.getAttribute("data-action");
    if (el.tagName === "A" && el.getAttribute("href") === "/" && !action) action = "home";
    if (action === "home") { e.preventDefault(); go("/"); return; }
    if (action === "back") {
      if (state.screen === "location" && state.locQuery) { state.locQuery = ""; render(); return; }
      if (state.screen === "location" && state.browseStack.length) { state.browseStack.pop(); render(); return; }
      uiBack();
      return;
    }
    if (action === "menu") { state.menuOpen = true; state.detailId = ""; state.filtersOpen = false; render(); return; }
    if (action === "close") { state.menuOpen = false; state.detailId = ""; state.filtersOpen = false; state.keepScroll = true; render(); return; }
    if (action === "near") { requestNear(); return; }
    if (action === "choose-location") {
      openLocation(state.screen === "select" ? "select" : "results");
      return;
    }
    if (action === "clear-loc") { state.locQuery = ""; state.browseStack = []; render(); return; }
    if (action === "loc-row") {
      var row = state.rows[Number(el.getAttribute("data-i"))];
      if (!row) return;
      if (row.drill) { state.browseStack.push(row.drill); state.locQuery = ""; render(); return; }
      if (row.area) chooseArea(row.area);
      return;
    }
    if (action === "show-all" && state.showAll) { chooseArea(state.showAll.area); return; }
    if (action === "broaden") {
      var parent = state.area ? L.broadenArea(model.places, state.area) : null;
      if (parent) chooseArea(parent);
      else openLocation("results");
      return;
    }
    if (action === "view") {
      state.view = el.getAttribute("data-view") === "map" ? "map" : "list";
      syncUrl();
      return;
    }
    if (action === "filters") {
      state.draft = Object.assign(L.blankFilters(), state.filters);
      state.filtersOpen = true;
      state.menuOpen = false;
      render();
      return;
    }
    if (action === "draft") {
      var key = el.getAttribute("data-key");
      var val = el.getAttribute("data-v");
      if (!state.draft) state.draft = Object.assign(L.blankFilters(), state.filters);
      if (key === "tonight") state.draft.tonight = val === "1";
      else if (key === "rating" || key === "radius") state.draft[key] = Number(val) || 0;
      else state.draft[key] = val;
      render();
      return;
    }
    if (action === "apply-filters") {
      var qEl = $("filterQ");
      if (qEl && state.draft) state.draft.q = qEl.value;
      state.filters = Object.assign(L.blankFilters(), state.draft || {});
      state.filtersOpen = false;
      state.limit = 24;
      syncUrl();
      return;
    }
    if (action === "reset-filters") {
      var sort = state.area && state.area.near ? "distance" : "";
      state.filters = L.blankFilters();
      state.filters.sort = sort;
      state.draft = Object.assign(L.blankFilters(), state.filters);
      state.filtersOpen = false;
      state.limit = 24;
      if (state.screen === "results" || state.screen === "select") syncUrl();
      else render();
      return;
    }
    if (action === "more") { state.limit += 24; state.keepScroll = true; render(); return; }
    if (action === "details") {
      var id = el.getAttribute("data-id");
      if (id && model.byId[id]) { state.detailId = id; state.menuOpen = false; render(); }
      return;
    }
    if (action === "map-pin") { state.mapId = el.getAttribute("data-id") || ""; state.keepScroll = true; render(); return; }
    if (action === "vote-start") {
      state.limit = 30;
      state.pollError = "";
      go("/select?" + L.writeParams(state.area, state.filters, "list"));
      return;
    }
    if (action === "toggle") {
      var tid = el.getAttribute("data-id");
      var at = state.picks.indexOf(tid);
      if (at >= 0) state.picks.splice(at, 1);
      else state.picks.push(tid);
      savePicks();
      state.keepScroll = true;
      render();
      return;
    }
    if (action === "continue-share") { createShare(); return; }
    if (action === "copy") { copyText(el.getAttribute("data-url") || ""); return; }
    if (action === "native-share") {
      var url = el.getAttribute("data-url") || "";
      if (navigator.share) {
        navigator.share({ title: "Where should we eat?", text: "Vote on a BYO shortlist.", url: url }).catch(function (err) {
          if (err && err.name === "AbortError") return;
          copyText(url);
        });
      } else copyText(url);
      return;
    }
    if (action === "edit-shortlist") {
      if (state.poll && state.poll.restaurantIds) { state.picks = state.poll.restaurantIds.filter(function (id) { return model.byId[id]; }); savePicks(); }
      state.area = { shortlist: true, label: "Your shortlist" };
      state.removedNote = "Changing area keeps restaurants that are still in the new results and removes the others from this shortlist.";
      go("/select?" + L.writeParams(state.area, state.filters, "list"));
      return;
    }
    if (action === "pick-vote") { state.voteChoice = el.getAttribute("data-id") || ""; state.keepScroll = true; render(); return; }
    if (action === "submit-vote") { submitVote(); return; }
  });

  document.addEventListener("input", function (e) {
    if (e.target.id === "locQ") {
      state.locQuery = e.target.value;
      var list = $("locList");
      var clear = document.querySelector(".search .clear");
      if (!clear && state.locQuery) { render(); var again = $("locQ"); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } return; }
      if (clear && !state.locQuery) { render(); return; }
      if (list) list.innerHTML = locationListInner();
    }
    if (e.target.id === "filterQ" && state.draft) {
      state.draft.q = e.target.value;
      var count = $("filterCount");
      if (count) {
        var preview = L.filterPlaces(model.places, state.area, state.draft, state.area && state.area.near ? state.coords : null);
        count.textContent = preview.length + (preview.length === 1 ? " restaurant" : " restaurants");
      }
    }
  });
  document.addEventListener("submit", function (e) {
    if (e.target.id !== "locForm") return;
    e.preventDefault();
    var q = state.locQuery.trim();
    if (!q) return;
    if (state.rows && state.rows[0] && state.rows[0].area) { chooseArea(state.rows[0].area); return; }
    chooseArea({ unrecognised: true, query: q, label: q });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && (state.detailId || state.menuOpen || state.filtersOpen)) {
      state.detailId = ""; state.menuOpen = false; state.filtersOpen = false; state.keepScroll = true; render();
    }
  });
  window.addEventListener("popstate", function () {
    depth = (history.state && history.state.depth) || 0;
    applyRoute(true);
  });

  depth = (history.state && history.state.depth) || 0;
  history.replaceState({ app: 1, depth: depth }, "", location.pathname + location.search + location.hash);
  applyRoute(false);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
  }
})();
