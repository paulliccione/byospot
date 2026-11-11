# BYOSpot

Mobile-first PWA for finding BYO restaurants in Sydney, the Blue Mountains, Melbourne and the Victorian coast. The opening screen has two choices: **Find BYO Near Me** and **Choose a Location**. Restaurant records live in `data.js`. Group votes are saved by `netlify/functions/polls.mjs` in the Netlify Blobs store `byospot-polls`. Keys are prefixed with the deploy context, so a deploy preview does not write into production polls.

`index.html`, `style.css`, `app.js`, `logic.js`, `data.js`, `sw.js`, `manifest.webmanifest`, `icons/`, `fonts/` (Inter and Fraunces, OFL). Local preview with the poll API: `node dev-server.mjs`.

## Updating the data (monthly)

**Inclusion rule:** the BYO restaurants already collected for Sydney, the Blue Mountains, Melbourne and the Victorian coast. There is no per-region cap, and Google star ratings are not stored or used to rank or filter. Places where BYO is only listed, not confirmed, show “BYO listed — call to confirm” in the app. Places where BYO is very unlikely are left out.

1. Research a region into `research/<region-slug>.json`, with the evidence for each place in `research/evidence/<region-slug>.json`. See `research/SCHEMA.md` for the format. `research/work/v2/build_v2.py "<Region>"` builds a region automatically from the cached sources:
   - BYO listings: findbyo.com (confirmed or unconfirmed) and AGFG BYO category pages.
   - Street address: OpenStreetMap (or the venue’s own site). If neither has a street address, store the suburb only and set `addressSource` to `"suburb-only"`. Do not copy an address from Google.
   - Do not store Google star ratings, review counts, or review text. A `place_id` may be kept for a Google Maps link. There is no `place_id` in the data yet.
   - Price: mealfinder's price range, otherwise "?".
2. `python3 merge_research.py --dry-run` validates the files without writing anything.
3. `python3 merge_research.py` replaces those regions in `data.js` (Viet Eatery stays pinned in Inner City). Then it runs `nearest_bottleshop.py --only-missing` for the nearest bottle shops (Overpass, batched and rate-limited). Use `--skip-bottleshops` when offline.
4. Bump `VERSION` in `sw.js` so installed copies refresh.

The file still lists places in the previous per-region order. The app does not show that order as a ranking.

## How the app behaves

- **Home** only offers Find BYO Near Me (geolocation on tap) and Choose a Location. There is no ranking, no Plan a night bar, and no corkage calculator.
- **Location** search matches suburbs, cities, regions and states in the data, plus well-known Australian places that have no listings yet. Browse is State → city or region → suburb. Show all can stop at a city or region. A whole state is not offered as one list.
- **Results** are compact cards with a BYO day line, corkage when it is known, the address when it was re-sourced, and Directions / Website / Call only when that data exists. Directions is hidden when `addressSource` is `"suburb-only"`. Near Me then shows “in {Suburb}” instead of a precise distance, and does not use a suburb-centre point for directions. The day line is “BYO tonight” or a short day span such as “BYO Fri–Sat” when `byoDays` says so, “BYO confirmed” when BYO is confirmed but the days are not listed, and “Call to confirm” when it is only listed. Unknown prices and unknown corkage are omitted. Default sort is distance after Near Me, otherwise A–Z. There is no Google-rating filter or sort. Cuisine filters can select more than one family. There is no map view until a street map exists. Live Google Place Details ratings are not shown: that would need a server-side API key and a `place_id` on each venue, and neither is in this repo.
- **Put It to a Vote** opens a separate checkbox screen (minimum two restaurants, no maximum of three). Continue creates a poll and a `/vote/:token` link. Friends vote without an account. A second vote from the same browser token is rejected.
- **Older `#plan=` links** explain that they can’t collect shared votes and offer a new poll.
- **Planning with friends** is a text link under the venue list. It opens the same shortlist and vote flow. There is no “Prefer BYO tonight” filter.
- **Bottle shops** stay behind More details: nearest chain and nearest independent within 2 km, with a walking-directions link. Data comes from OpenStreetMap `shop=alcohol|wine` via Overpass. A store counts as a chain when its `brand`, `brand:wikidata`, `name`, `operator` or `official_name` matches the `CHAINS` list in `nearest_bottleshop.py`. Stored as `bottleShops: {chain, independent}`.
- The research file still lists places in the old per-region order, including the pinned Inner City row. The site does not display that order as a ranking.
