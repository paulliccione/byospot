// Validation and duplicate matching for diner tips and venue updates.
// Nothing in here publishes a listing. Email and phone are not logged.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BYOSubmit = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var NAME_MAX = 120;
  var SUBURB_MAX = 80;
  var PERSON_MAX = 80;
  var SOURCE_MAX = 500;
  var WEBSITE_MAX = 500;
  var NOTES_MAX = 500;
  var EMAIL_MAX = 254;
  var PHONE_MAX = 40;
  var AMOUNT_MAX = 20;
  var BODY_MAX = 20000;

  var BRING_DINER = ["Wine", "Beer", "Not sure"];
  var BRING_VENUE = ["Wine", "Beer", "Spirits"];
  var DAYS_DINER = ["Every day", "Some days", "Not sure"];
  var DAYS_VENUE = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var TIMES = ["Lunch", "Dinner", "All service"];
  var ROLES = ["Owner", "Manager", "Staff"];
  var CORKAGE_KINDS = ["free", "amount", "unsure"];
  var CORKAGE_UNITS = ["free", "per bottle", "per person"];
  var SLUG_RE = /^[a-z0-9-]{1,128}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PHONE_RE = /^[0-9+().\-\s]{6,40}$/;
  var AMOUNT_RE = /^\d{1,4}(\.\d{1,2})?$/;
  var CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function fold(s) {
    return norm(s).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function honeypotHit(body) {
    if (!body || typeof body !== "object") return false;
    var value = body.company;
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  }

  function fail(error) {
    return { ok: false, status: 400, error: error };
  }

  function cleanText(value, max, error) {
    if (value == null) return { ok: true, value: "" };
    if (typeof value !== "string") return fail(error);
    if (CONTROL_RE.test(value)) return fail(error);
    var trimmed = value.trim();
    if (trimmed.length > max) return fail(error);
    return { ok: true, value: trimmed };
  }

  function optionalEnum(value, allowed, error) {
    if (value == null || value === "") return { ok: true, value: null };
    if (typeof value !== "string" || allowed.indexOf(value) < 0) return fail(error);
    return { ok: true, value: value };
  }

  function cleanEmail(value, required) {
    if (value == null || value === "") {
      if (required) return fail("Add your work email.");
      return { ok: true, value: null };
    }
    if (typeof value !== "string") return fail("That email isn't valid.");
    var trimmed = value.trim();
    if (!trimmed) {
      if (required) return fail("Add your work email.");
      return { ok: true, value: null };
    }
    if (trimmed.length > EMAIL_MAX || !EMAIL_RE.test(trimmed) || CONTROL_RE.test(trimmed)) {
      return fail("That email isn't valid.");
    }
    return { ok: true, value: trimmed };
  }

  function cleanAmount(value) {
    if (value == null || value === "") return { ok: true, value: null };
    if (typeof value !== "string") return fail("That corkage amount isn't valid.");
    var trimmed = value.trim().replace(/^\$/, "").trim();
    if (!trimmed) return { ok: true, value: null };
    if (trimmed.length > AMOUNT_MAX || !AMOUNT_RE.test(trimmed)) return fail("That corkage amount isn't valid.");
    return { ok: true, value: trimmed };
  }

  function cleanPhone(value) {
    if (value == null || value === "") return { ok: true, value: null };
    if (typeof value !== "string") return fail("That phone isn't valid.");
    var trimmed = value.trim();
    if (!trimmed) return { ok: true, value: null };
    if (trimmed.length > PHONE_MAX || !PHONE_RE.test(trimmed)) return fail("That phone isn't valid.");
    return { ok: true, value: trimmed };
  }

  function cleanWebsite(value) {
    var text = cleanText(value, WEBSITE_MAX, "Add the venue's website or official page.");
    if (!text.ok) return text;
    if (!text.value) return fail("Add the venue's website or official page.");
    if (/^\s*javascript:/i.test(text.value)) return fail("Add the venue's website or official page.");
    var candidate = /^https?:\/\//i.test(text.value) ? text.value : "https://" + text.value;
    var url;
    try { url = new URL(candidate); }
    catch (e) { return fail("Add the venue's website or official page."); }
    if (url.protocol !== "http:" && url.protocol !== "https:") return fail("Add the venue's website or official page.");
    if (!url.hostname || url.hostname.indexOf(".") < 0) return fail("Add the venue's website or official page.");
    return { ok: true, value: text.value };
  }

  function cleanSlug(value) {
    if (value == null || value === "") return null;
    if (typeof value !== "string") return null;
    var trimmed = value.trim();
    if (!SLUG_RE.test(trimmed)) return null;
    return trimmed;
  }

  function cleanBringList(value) {
    if (value == null) return { ok: true, value: [] };
    if (!Array.isArray(value) || value.length > BRING_VENUE.length) return fail("Choose wine, beer or spirits.");
    var seen = {};
    for (var i = 0; i < value.length; i++) {
      if (BRING_VENUE.indexOf(value[i]) < 0) return fail("Choose wine, beer or spirits.");
      seen[value[i]] = 1;
    }
    return { ok: true, value: BRING_VENUE.filter(function (item) { return seen[item]; }) };
  }

  function cleanVenueDays(value) {
    if (value == null) return { ok: true, value: [] };
    if (!Array.isArray(value) || value.length > DAYS_VENUE.length) return fail("Those BYO days aren't valid.");
    var seen = {};
    for (var i = 0; i < value.length; i++) {
      if (DAYS_VENUE.indexOf(value[i]) < 0) return fail("Those BYO days aren't valid.");
      seen[value[i]] = 1;
    }
    return { ok: true, value: DAYS_VENUE.filter(function (day) { return seen[day]; }) };
  }

  function validateDiner(body) {
    var name = cleanText(body.restaurantName, NAME_MAX, "Add the restaurant name.");
    if (!name.ok) return name;
    if (!name.value) return fail("Add the restaurant name.");

    var suburb = cleanText(body.suburb, SUBURB_MAX, "Add the suburb.");
    if (!suburb.ok) return suburb;
    if (!suburb.value) return fail("Add the suburb.");

    var bring = optionalEnum(body.bring, BRING_DINER, "Choose what guests can bring.");
    if (!bring.ok) return bring;
    var days = optionalEnum(body.byoDays, DAYS_DINER, "Choose the BYO days.");
    if (!days.ok) return days;

    var kind = optionalEnum(body.corkageKind, CORKAGE_KINDS, "That corkage choice isn't valid.");
    if (!kind.ok) return kind;
    var amount = cleanAmount(body.corkageAmount);
    if (!amount.ok) return amount;
    if (kind.value === "amount" && !amount.value) return fail("Add the corkage amount, or choose Free or Not sure.");
    if (kind.value !== "amount") amount = { ok: true, value: null };

    var source = cleanText(body.source, SOURCE_MAX, "Tell us where you saw that it's BYO.");
    if (!source.ok) return source;
    if (!source.value) return fail("Tell us where you saw that it's BYO.");

    var email = cleanEmail(body.email, false);
    if (!email.ok) return email;

    return {
      ok: true,
      submission: {
        type: "diner",
        restaurantName: name.value,
        suburb: suburb.value,
        bring: bring.value,
        byoDays: days.value,
        corkageKind: kind.value,
        corkageAmount: amount.value,
        source: source.value,
        email: email.value,
        venueSlug: cleanSlug(body.venueSlug),
        removalRequest: false
      }
    };
  }

  function validateVenue(body) {
    var name = cleanText(body.venueName, NAME_MAX, "Add the venue name.");
    if (!name.ok) return name;
    if (!name.value) return fail("Add the venue name.");

    var contact = cleanText(body.contactName, PERSON_MAX, "Add your name.");
    if (!contact.ok) return contact;
    if (!contact.value) return fail("Add your name.");

    var role = optionalEnum(body.role, ROLES, "Choose your role.");
    if (!role.ok) return role;
    if (!role.value) return fail("Choose your role.");

    var email = cleanEmail(body.email, true);
    if (!email.ok) return email;
    var phone = cleanPhone(body.phone);
    if (!phone.ok) return phone;
    var website = cleanWebsite(body.website);
    if (!website.ok) return website;

    var bring = cleanBringList(body.bring);
    if (!bring.ok) return bring;
    var days = cleanVenueDays(body.byoDays);
    if (!days.ok) return days;
    var times = optionalEnum(body.byoTimes, TIMES, "Those service times aren't valid.");
    if (!times.ok) return times;

    var unit = optionalEnum(body.corkageUnit, CORKAGE_UNITS, "That corkage choice isn't valid.");
    if (!unit.ok) return unit;
    var amount = cleanAmount(body.corkageAmount);
    if (!amount.ok) return amount;
    if (unit.value === "free") amount = { ok: true, value: null };

    var notes = cleanText(body.notes, NOTES_MAX, "Keep the note under 500 characters.");
    if (!notes.ok) return notes;

    if (body.removalRequest != null && typeof body.removalRequest !== "boolean") {
      return fail("That removal choice isn't valid.");
    }
    if (body.accuracyConfirmed !== true) return fail("Confirm the details are accurate.");

    return {
      ok: true,
      submission: {
        type: "venue",
        venueName: name.value,
        contactName: contact.value,
        role: role.value,
        email: email.value,
        phone: phone.value,
        website: website.value,
        bring: bring.value,
        corkageAmount: amount.value,
        corkageUnit: unit.value,
        byoDays: days.value,
        byoTimes: times.value,
        notes: notes.value,
        removalRequest: body.removalRequest === true,
        accuracyConfirmed: true,
        venueSlug: cleanSlug(body.venueSlug)
      }
    };
  }

  function validateSubmission(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail("That submission could not be read.");
    }
    if (honeypotHit(body)) return { ok: true, drop: true };
    if (body.type === "diner") return validateDiner(body);
    if (body.type === "venue") return validateVenue(body);
    return fail("Choose diner or venue.");
  }

  function indexVenues(places) {
    var list = (Array.isArray(places) ? places : []).map(function (p) {
      p = p || {};
      return {
        id: p.id ? String(p.id) : "",
        name: String(p.name || ""),
        suburb: String(p.suburb || ""),
        region: String(p.region || "")
      };
    });
    list.forEach(function (p, i) {
      var generated = (norm(p.name) + "-" + norm(p.suburb)).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || ("p" + i);
      p.id = p.id || generated;
    });
    var seen = {};
    list.forEach(function (p) {
      if (!seen[p.id]) { seen[p.id] = 1; return; }
      var regionSlug = norm(p.region).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      var id = p.id + "-" + regionSlug;
      var n = 2;
      while (seen[id]) { id = p.id + "-" + regionSlug + "-" + n; n++; }
      p.id = id;
      seen[id] = 1;
    });
    return list;
  }

  function matchVenues(query, places, limit) {
    var q = fold(query);
    if (q.length < 2) return [];
    var indexed = indexVenues(places);
    var cap = Number(limit) > 0 ? Number(limit) : 4;
    var hits = [];
    indexed.forEach(function (p) {
      var name = fold(p.name);
      if (!name) return;
      var exact = name === q;
      var score = 0;
      if (exact) score = 100;
      else if (q.indexOf(name + " ") === 0) score = 90;
      else if (name.indexOf(q) === 0) score = 80;
      else if (q.length >= 3 && name.indexOf(q) >= 0) score = 60;
      else return;
      hits.push({ id: p.id, name: p.name, suburb: p.suburb, score: score, exact: exact });
    });
    hits.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      var byName = a.name.localeCompare(b.name);
      if (byName) return byName;
      return String(a.suburb).localeCompare(String(b.suburb));
    });
    return hits.slice(0, cap);
  }

  function resolveVenueSlug(input, places) {
    input = input || {};
    var indexed = indexVenues(places);
    var requested = cleanSlug(input.venueSlug);
    var name = fold(input.name || "");
    var suburb = fold(input.suburb || "");
    if (indexed.length) {
      var requestedPlace = null;
      if (requested) {
        for (var i = 0; i < indexed.length; i++) {
          if (indexed[i].id === requested) { requestedPlace = indexed[i]; break; }
        }
      }
      if (requestedPlace) {
        var suburbOk = !suburb || fold(requestedPlace.suburb) === suburb;
        var nameOk = !name || fold(requestedPlace.name) === name;
        if (suburbOk && nameOk) return requestedPlace.id;
      }
      if (!name) return null;
      var exact = [];
      for (var j = 0; j < indexed.length; j++) {
        if (fold(indexed[j].name) === name) exact.push(indexed[j]);
      }
      if (!exact.length) return null;
      if (suburb) {
        var both = exact.filter(function (p) { return fold(p.suburb) === suburb; });
        return both.length ? both[0].id : null;
      }
      return exact.length === 1 ? exact[0].id : null;
    }
    return requested || null;
  }

  function finalizeSubmission(submission, places, createdAt) {
    var copy = Object.assign({}, submission);
    var name = copy.type === "diner" ? copy.restaurantName : copy.venueName;
    var suburb = copy.type === "diner" ? copy.suburb : "";
    copy.venueSlug = resolveVenueSlug({
      name: name,
      suburb: suburb,
      venueSlug: copy.venueSlug
    }, places);
    if (copy.type !== "venue") copy.removalRequest = false;
    copy.createdAt = createdAt;
    return copy;
  }

  return {
    NAME_MAX: NAME_MAX,
    SUBURB_MAX: SUBURB_MAX,
    NOTES_MAX: NOTES_MAX,
    BODY_MAX: BODY_MAX,
    BRING_DINER: BRING_DINER,
    BRING_VENUE: BRING_VENUE,
    DAYS_DINER: DAYS_DINER,
    DAYS_VENUE: DAYS_VENUE,
    TIMES: TIMES,
    ROLES: ROLES,
    fold: fold,
    honeypotHit: honeypotHit,
    validateSubmission: validateSubmission,
    indexVenues: indexVenues,
    matchVenues: matchVenues,
    resolveVenueSlug: resolveVenueSlug,
    finalizeSubmission: finalizeSubmission
  };
});
