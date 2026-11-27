/* Swappable restaurant card. Replace this file to restyle the list, the vote
   picker and the vote page without changing app.js.
   BYOCard.render(view, options) — options.mode is "results", "pick" or "vote".
   options.saved draws a heart on results cards. The heart is a separate button.
   BYOCard.renderDetail(view, options) — the restaurant screen. options.saved
   draws the same heart in the header.
   Pass only facts the record actually has. Empty strings and nulls are omitted.
   A placeId on the detail screen renders Google's place rating element.
   List cards never show a rating. Do not invent a number, and do not
   render written review text. */
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

  function heartSvg(on) {
    var path = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";
    if (on) {
      return '<svg class="save-heart" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="' + path + '"/></svg>';
    }
    return '<svg class="save-heart" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="' + path + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  }

  function saveButton(view, saved) {
    if (!view.id || view.missing) return "";
    var name = view.name || "venue";
    var on = !!saved;
    var label = on ? "Remove " + name + " from saved" : "Save " + name;
    return '<button type="button" class="save-btn' + (on ? " is-on" : "") + '" data-action="save" data-id="' + esc(view.id) + '" aria-pressed="' + (on ? "true" : "false") + '" aria-label="' + esc(label) + '">' + heartSvg(on) + "</button>";
  }

  function corkageLine(text) {
    if (!present(text)) return "";
    if (/^corkage\b/i.test(text)) return text;
    return "Corkage · " + text;
  }

  function googleRatingHtml(placeId) {
    if (!present(placeId)) return "";
    return '<gmp-place-details-compact class="google-rating" orientation="horizontal" truncation-preferred>' +
      '<gmp-place-details-place-request place="' + esc(placeId) + '"></gmp-place-details-place-request>' +
      '<gmp-place-rating></gmp-place-rating>' +
      '<gmp-place-attribution light-scheme-color="gray" dark-scheme-color="white"></gmp-place-attribution>' +
      '</gmp-place-details-compact>';
  }

  function pillHtml(view) {
    if (!present(view.byoLabel)) return "";
    var cls = pillClass(view.byoLabel);
    var icon = cls === "is-confirmed" ? checkSvg() : "";
    return '<span class="rcard-pill ' + cls + '">' + icon + esc(view.byoLabel) + "</span>";
  }

  function metaLine(view) {
    return [view.cuisine, view.location, view.distance].filter(present).join(" · ");
  }

  function factsHtml(view) {
    var html = '<span class="rcard-name">' + esc(view.name || "Restaurant") + "</span>";
    var meta = metaLine(view);
    if (meta) html += '<span class="rcard-meta">' + esc(meta) + "</span>";
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
    var aria = item.aria ? ' aria-label="' + esc(item.aria) + '"' : "";
    var venue = item.href && String(item.href).indexOf("/venue/") === 0;
    var venueAttrs = venue ? ' data-action="details" data-id="' + esc(item.id || "") + '"' : "";
    return '<a class="' + cls + '" data-act="1" href="' + esc(item.href) + '"' + venueAttrs + aria + extra + ">" + inner + "</a>";
  }

  function cardActions(view, mode) {
    var items = linkItems(view).slice(0, 2);
    if (view.id && !view.missing) {
      if (mode === "results") items.push({ href: "/venue/" + view.id, id: view.id, label: "More", aria: "More details" });
      else items.push({ action: "details", id: view.id, label: "More", aria: "More details" });
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
    if (mode === "results" && view.id && !view.missing) {
      open = '<a class="rcard-open" href="/venue/' + esc(view.id) + '" data-action="details" data-id="' + esc(view.id) + '">' + body + "</a>";
    } else if (openAction && view.id) {
      open = '<button type="button" class="rcard-open' + (control ? " has-control" : "") + '" data-action="' + openAction + '" data-id="' + esc(view.id) + '"' +
        (mode === "results" ? "" : ' aria-pressed="' + pressed + '"') + ">" +
        control + body + "</button>";
    } else if (control) {
      open = '<div class="rcard-open has-control"' + (mode === "vote" ? ' aria-pressed="' + pressed + '"' : "") + ">" + control + body + "</div>";
    } else {
      open = '<div class="rcard-open">' + body + "</div>";
    }
    var save = mode === "results" ? saveButton(view, options.saved) : "";
    var actions = cardActions(view, mode);
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
      save + open + addressHtml(view) + actionRow + "</article>";
  }

  function factRow(icon, text) {
    if (!present(text)) return "";
    return '<p class="venue-fact">' + icon + "<span>" + esc(text) + "</span></p>";
  }

  function shopHtml(shops) {
    if (!shops || !shops.length) return "";
    var rows = shops.map(function (shop) {
      if (!shop || !present(shop.name)) return "";
      var extra = [];
      if (present(shop.distance)) extra.push("~" + shop.distance);
      if (present(shop.walk)) extra.push(shop.walk);
      var text = (shop.label ? shop.label + ": " : "") + shop.name + (extra.length ? " · " + extra.join(" · ") : "");
      if (present(shop.url)) {
        return '<a class="venue-shop" href="' + esc(shop.url) + '" target="_blank" rel="noopener">' + esc(text) + "</a>";
      }
      return '<p class="venue-shop">' + esc(text) + "</p>";
    }).join("");
    if (!rows) return "";
    return '<h2 class="venue-subhead">Bottle shops within 2 km</h2><div class="venue-shops">' + rows + "</div>";
  }

  function renderDetail(view, options) {
    view = view || {};
    options = options || {};
    var meta = metaLine(view);
    var rating = googleRatingHtml(view.placeId);
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
      (view.id && !view.missing ? saveButton(view, options.saved) : '<span class="venue-top-gap" aria-hidden="true"></span>') + "</header>" +
      '<div class="venue-hero" aria-hidden="true">' + forkSvg() +
      (present(view.cuisine) ? "<span>" + esc(view.cuisine) + "</span>" : "") + "</div>" +
      '<h1 id="detailTitle" class="venue-name">' + esc(view.name || "Restaurant") + "</h1>" +
      (meta ? '<p class="venue-meta">' + esc(meta) + "</p>" : "") +
      rating +
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
      (view.id ? '<p class="venue-report-row"><button type="button" class="venue-report" data-action="report">Something wrong? Report it</button></p>' : "") +
      "</div>" + bar + "</div>";
  }

  return { render: render, renderDetail: renderDetail };
});
