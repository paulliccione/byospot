/* Swappable restaurant card. Replace this file to restyle the list, the vote
   picker and the vote page without changing app.js.
   BYOCard.render(view, options) — options.mode is "results", "pick" or "vote".
   BYOCard.renderDetail(view) — the restaurant screen.
   Pass only facts the record actually has. Empty strings and nulls are omitted.
   Do not fetch data or fill in a missing price, corkage, rating or address. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BYOCard = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function present(value) {
    return !(value == null || value === "");
  }

  function pillClass(label) {
    if (label === "BYO tonight" || label === "BYO confirmed") return "is-confirmed";
    if (label === "Call to confirm") return "is-call";
    return "is-days";
  }

  function checkSvg() {
    return '<svg class="rcard-check" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function arrowSvg() {
    return '<svg class="rcard-arrow" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function forkSvg() {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 3v6M12 3v6M16 3v6M8 9h8v1a4 4 0 0 1-8 0V9M12 14v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function bagSvg() {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6.5 8h11l-.8 12H7.3L6.5 8zM9 8V6.2A3 3 0 0 1 12 3a3 3 0 0 1 3 3.2V8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  }

  function bottleSvg() {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M10 2h4v3l1.5 2v13a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V7L10 5V2zM10 8h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  }

  function calendarSvg() {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function pinSvg() {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 21s6-5.1 6-10a6 6 0 1 0-12 0c0 4.9 6 10 6 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="11" r="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  }

  function backSvg() {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5L8 12l7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function corkageLine(text) {
    if (!present(text)) return "";
    if (/^corkage\b/i.test(text)) return text;
    return "Corkage · " + text;
  }

  function ratingLine(view) {
    if (typeof view.stars !== "number") return "";
    var line = "★ " + view.stars;
    if (present(view.reviewsLabel)) line += " · " + view.reviewsLabel + " Google reviews";
    else line += " · Google";
    return line;
  }

  function pillHtml(view) {
    if (!present(view.byoLabel)) return "";
    var cls = pillClass(view.byoLabel);
    var icon = cls === "is-confirmed" ? checkSvg() : "";
    return '<span class="rcard-pill ' + cls + '">' + icon + esc(view.byoLabel) + "</span>";
  }

  var CUISINE_GROUPS = [
    [/pizza|pizzeria/, "pizza"],
    [/seafood|fish and chips/, "seafood"],
    [/thai|isaan/, "thai"],
    [/vietnamese|\bpho\b/, "vietnamese"],
    [/cafe|brunch|breakfast|bakery/, "cafe"],
    [/korean/, "korean"],
    [/japanese|sushi|ramen|izakaya|teppanyaki|yakiniku|\bsoba\b/, "japanese"],
    [/indian/, "indian"],
    [/chinese|dim sum|dumpling|shanghainese|sichuan|hunan|\bwok\b|cantonese|peking/, "chinese"],
    [/lebanese|middle eastern|persian|shawarma|egyptian|afghan|doner|kebab/, "middle-eastern"],
    [/greek/, "greek"],
    [/mexican/, "mexican"],
    [/malaysian/, "malaysian"],
    [/turkish/, "turkish"],
    [/african|ethiopian/, "african"],
    [/modern australian|\baustralian\b/, "modern-australian"],
    [/italian|ligurian|sicilian/, "italian"]
  ];

  function cuisineGroup(cuisine) {
    var s = String(cuisine || "").toLowerCase();
    for (var i = 0; i < CUISINE_GROUPS.length; i++) {
      if (s && CUISINE_GROUPS[i][0].test(s)) return CUISINE_GROUPS[i][1];
    }
    return "generic";
  }

  function heroHtml(view) {
    var group = cuisineGroup(view.cuisine);
    var cuisine = present(view.cuisine) ? view.cuisine : "";
    var alt = cuisine ? "Illustrative photo of " + cuisine + " food" : "Illustrative photo of food";
    return '<div class="venue-hero">' +
      '<img src="images/cuisine/' + group + '.webp" alt="' + esc(alt) + '" width="800" height="500" loading="lazy" decoding="async">' +
      '<span class="venue-hero-label">Illustrative photo</span></div>';
  }

  function metaLine(view) {
    return [view.cuisine, view.location, view.distance].filter(present).join(" · ");
  }

  function factsHtml(view) {
    var html = '<span class="rcard-name">' + esc(view.name || "Restaurant") + "</span>";
    var meta = metaLine(view);
    if (meta) html += '<span class="rcard-meta">' + esc(meta) + "</span>";
    var rating = ratingLine(view);
    if (rating) html += '<span class="rcard-rating"><span aria-hidden="true">★</span> ' + esc(rating.replace(/^★\s*/, "")) + "</span>";
    if (present(view.byoLabel)) html += '<span class="rcard-status">' + pillHtml(view) + "</span>";
    if (present(view.corkage)) html += '<span class="rcard-cork">' + bottleSvg() + "<span>" + esc(corkageLine(view.corkage)) + "</span></span>";
    return html;
  }

  function addressHtml(view, className) {
    if (!present(view.address)) return "";
    var cls = className || "rcard-address";
    if (present(view.directions)) {
      return '<a class="' + cls + '" href="' + esc(view.directions) + '" target="_blank" rel="noopener">' +
        esc(view.address) + '<span class="rcard-sr">, directions</span></a>';
    }
    return '<p class="' + cls + '">' + esc(view.address) + "</p>";
  }

  function linkItems(view) {
    var items = [];
    if (present(view.bookingUrl)) items.push({ href: view.bookingUrl, label: "Book a table", external: true });
    if (present(view.directions)) items.push({ href: view.directions, label: "Directions", external: true });
    if (present(view.website)) items.push({ href: view.website, label: "Website", external: true });
    if (present(view.phone)) items.push({ href: view.phone, label: "Call", external: false });
    if (items.length) items[0].primary = true;
    return items;
  }

  function actionTag(item, className) {
    var cls = className + (item.primary ? " " + className + "-primary" : "");
    var inner = esc(item.label) + (item.primary ? arrowSvg() : "");
    if (item.action) {
      return '<button type="button" class="' + cls + '" data-act="1" data-action="' + esc(item.action) + '" data-id="' + esc(item.id || "") + '"' +
        (item.aria ? ' aria-label="' + esc(item.aria) + '"' : "") + ">" + inner + "</button>";
    }
    var extra = item.external ? ' target="_blank" rel="noopener"' : "";
    return '<a class="' + cls + '" data-act="1" href="' + esc(item.href) + '"' + extra + ">" + inner + "</a>";
  }

  function cardActions(view) {
    var items = linkItems(view).slice(0, 2);
    if (view.id && !view.missing) {
      items.push({ action: "details", id: view.id, label: "More", aria: "More details" });
    }
    return items.slice(0, 3);
  }

  function controlHtml(mode, pressed) {
    if (mode === "pick") {
      return '<span class="rcard-control" aria-hidden="true"><span class="rcard-box">' + (pressed ? "✓" : "") + "</span></span>";
    }
    if (mode === "vote") {
      return '<span class="rcard-control" aria-hidden="true"><span class="rcard-radio"></span></span>';
    }
    return "";
  }

  function render(view, options) {
    view = view || {};
    options = options || {};
    var mode = options.mode === "pick" || options.mode === "vote" ? options.mode : "results";
    var pressed = !!options.pressed;
    var interactive = options.interactive !== false;
    var openAction = mode === "pick" ? "toggle" : mode === "vote" ? "pick-vote" : "details";
    if (mode !== "results" && !interactive) openAction = "";
    if (view.missing && openAction === "details") openAction = "";
    var control = controlHtml(mode, pressed);
    var body = '<span class="rcard-body">' + factsHtml(view) + "</span>";
    var open;
    if (openAction && view.id) {
      open = '<button type="button" class="rcard-open' + (control ? " has-control" : "") + '" data-action="' + openAction + '" data-id="' + esc(view.id) + '"' +
        (mode === "results" ? "" : ' aria-pressed="' + pressed + '"') + ">" +
        control + body + "</button>";
    } else if (control) {
      open = '<div class="rcard-open has-control"' + (mode === "vote" ? ' aria-pressed="' + pressed + '"' : "") + ">" + control + body + "</div>";
    } else {
      open = '<div class="rcard-open">' + body + "</div>";
    }
    var actions = cardActions(view);
    var primary = null;
    var quiet = [];
    actions.forEach(function (item) {
      if (item.primary && !primary) primary = item;
      else quiet.push(item);
    });
    var actionRow = "";
    if (primary || quiet.length) {
      actionRow = '<div class="rcard-actions">' +
        (primary ? actionTag(primary, "rcard-act") : "") +
        (quiet.length ? '<div class="rcard-quiet">' + quiet.map(function (item) { return actionTag(item, "rcard-act"); }).join("") + "</div>" : "") +
        "</div>";
    }
    return '<article class="rcard' + (pressed ? " is-on" : "") + '" data-mode="' + mode + '">' +
      open + addressHtml(view) + actionRow + "</article>";
  }

  function factRow(icon, text) {
    if (!present(text)) return "";
    return '<p class="venue-fact">' + icon + "<span>" + esc(text) + "</span></p>";
  }

  function shopHtml(shops) {
    if (!shops || !shops.length) return "";
    var rows = shops.map(function (shop) {
      if (!shop || !present(shop.name)) return "";
      var text = (shop.label ? shop.label + ": " : "") + shop.name + (present(shop.distance) ? " · ~" + shop.distance : "");
      if (present(shop.url)) {
        return '<a class="venue-shop" href="' + esc(shop.url) + '" target="_blank" rel="noopener">' + esc(text) + "</a>";
      }
      return '<p class="venue-shop">' + esc(text) + "</p>";
    }).join("");
    if (!rows) return "";
    return '<h2 class="venue-subhead">Bottle shops within 2 km</h2><div class="venue-shops">' + rows + "</div>";
  }

  function renderDetail(view) {
    view = view || {};
    var meta = metaLine(view);
    var rating = ratingLine(view);
    var days = present(view.byoDays) ? "BYO days · " + view.byoDays : "";
    var price = present(view.price) ? "Price " + view.price : "";
    var takeaway = present(view.takeaway) ? view.takeaway + (present(view.takeawayDetail) ? " · " + view.takeawayDetail : "") : "";
    var address = addressHtml(view, "venue-address");
    var links = linkItems(view);
    var primary = null;
    var secondary = [];
    links.forEach(function (item) {
      if (item.primary && !primary) primary = item;
      else secondary.push(item);
    });
    secondary = secondary.slice(0, 3);
    var bar = "";
    if (primary || secondary.length) {
      bar = '<div class="venue-bar"><div class="venue-bar-inner">' +
        (secondary.length ? '<div class="venue-secondary" data-row="secondary">' + secondary.map(function (item) { return actionTag(item, "venue-act"); }).join("") + "</div>" : "") +
        (primary ? '<div data-row="primary">' + actionTag(primary, "venue-act") + "</div>" : "") +
        "</div></div>";
    }
    return '<div class="venue" role="dialog" aria-modal="true" aria-labelledby="detailTitle">' +
      '<div class="venue-page' + (bar ? " has-bar" : "") + '">' +
      '<header class="venue-top"><button type="button" class="venue-back" data-action="close" aria-label="Back">' + backSvg() + "</button>" +
      '<img class="venue-logo" src="logos/byospot-logo-teal.svg" alt="byo spot" width="150" height="37">' +
      '<span class="venue-top-gap" aria-hidden="true"></span></header>' +
      heroHtml(view) +
      '<h1 id="detailTitle" class="venue-name">' + esc(view.name || "Restaurant") + "</h1>" +
      (meta ? '<p class="venue-meta">' + esc(meta) + "</p>" : "") +
      (rating ? '<p class="venue-rating"><span aria-hidden="true">★</span> ' + esc(rating.replace(/^★\s*/, "")) + "</p>" : "") +
      (present(view.byoLabel) ? '<p class="venue-status">' + pillHtml(view) + "</p>" : "") +
      '<div class="venue-facts">' +
      factRow(forkSvg(), price) +
      factRow(bottleSvg(), present(view.corkage) ? corkageLine(view.corkage) : "") +
      factRow(calendarSvg(), days) +
      factRow(bagSvg(), takeaway) +
      (address ? '<div class="venue-fact">' + pinSvg() + address + "</div>" : "") +
      "</div>" +
      (present(view.address) && !present(view.directions) ? '<p class="venue-aside">Directions stay hidden until this record has a full street address.</p>' : "") +
      (present(view.note) ? '<p class="venue-note">' + esc(view.note) + "</p>" : "") +
      shopHtml(view.shops) +
      "</div>" + bar + "</div>";
  }

  return { render: render, renderDetail: renderDetail, cuisineGroup: cuisineGroup };
});
