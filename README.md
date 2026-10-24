# BYO Spot

BYO restaurant finder (static, view-only PWA) for Sydney, the Blue Mountains, Melbourne and the Victorian coast: `index.html`, `style.css` ("louder pop" theme), `app.js`, `data.js`, `sw.js`, `manifest.webmanifest`, `icons/`, `fonts/` (Inter and Fraunces, OFL). City / area chips read `cities` in `data.js` (fallback: a single Sydney city built from `regions`).

## Updating the data (monthly)

**Inclusion rule:** every BYO restaurant in Sydney we can find that is rated **4.0★ or higher on Google** with roughly 30+ reviews. There is no per-region cap. Places are ranked by Google rating within each region (ties go to review count), and Viet Eatery is pinned at #1 in Inner City. Places where BYO is only listed, not confirmed, show a "Confirm BYO" chip. Places where BYO is very unlikely are left out.

1. Research a region into `research/<region-slug>.json`, with the evidence for each place in `research/evidence/<region-slug>.json`. See `research/SCHEMA.md` for the format. Order doesn't matter, because the merge ranks places. `research/work/v2/build_v2.py "<Region>"` builds a region automatically from the cached sources:
   - BYO listings: findbyo.com (confirmed or unconfirmed) and AGFG BYO category pages.
   - Google rating and review count: calso.com.au, localaustralia.net and mealfinder.com.au (in that order).
   - Price: mealfinder's price range, otherwise "?".
2. `python3 merge_research.py --dry-run` validates the files without writing anything.
3. `python3 merge_research.py` replaces those regions in `data.js` (Viet Eatery stays #1 in Inner City). Then it runs `nearest_bottleshop.py --only-missing` for the nearest bottle shops (Overpass, batched and rate-limited). Use `--skip-bottleshops` when offline.
4. Bump `VERSION` in `sw.js` so installed copies refresh.

Ranks are per region, taken from array order. Regions with no places show as "soon", and suburb chips come from the data.

## How the list behaves (several hundred places)

- **City / area** filters the list to that city's regions and places. **All of a city** shows each of its regions grouped, with the top 3 as compact cards (tap "Corkage, price & more" for details) and a "See all" button in the region header that opens that region.
- **Search, Stars and Nearest** show a flat list that renders 24 cards at a time ("Show more", which also loads on scroll).
- **Suburb chips:** if a region has more than 12 suburbs, the top 10 appear plus a "More +N" chip.
- **Research placeholders:** a dish of "Unknown…" is hidden, and "Unknown" corkage shows as "Corkage: ask".
- **Region lists** also render 24 cards at a time, ranked #1…#N.
- **BYO tonight:** soft preference only — places whose `byoDays` match today (Australia/Sydney) rise to the top; unknowns and other nights stay visible underneath with a call-ahead note. Never hard-filters the list.
- **Plan a night:** pick ~3 places, copy a `#plan=` share link; friends open it and vote (tallies in `localStorage` on each device for v1).
- **Corkage vs wine list:** sticky calculator — corkage (prefilled when known), party size, your bottle $, optional wine-list $. Honest when corkage is unknown. No invented wine-list prices in data.
- **Bottle shops:** each card's details show two lines, **🍾 Chain** (the nearest chain store) and **🍷 Indie** (the nearest boutique or independent shop), with the name, the straight-line distance and a walking-directions link. If there's nothing within 2 km, the line reads "No chain within 2 km" or "No independent within 2 km". Data comes from OpenStreetMap `shop=alcohol|wine` via Overpass. A store counts as a chain when its `brand`, `brand:wikidata`, `name`, `operator` or `official_name` matches the `CHAINS` list in `nearest_bottleshop.py` (Dan Murphy's, BWS, Liquorland, First Choice, Vintage Cellars, Aldi, IGA Liquor, Bottlemart, Thirsty Camel, Cellarbrations, Porters, Local Liquor, Choice Liquor, Duty Free, Liquor Legends, The Bottle-O, Harry Brown and Super Cellars). Edit that list to reclassify stores. Everything else counts as independent. Stored as `bottleShops: {chain, independent}`. `python3 nearest_bottleshop.py --only-missing --retry-none` re-checks places with a missing line.
