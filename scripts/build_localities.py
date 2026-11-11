#!/usr/bin/env python3
"""Build localities.json from ABS ASGS Edition 3 boundaries.

Reads the official Suburbs and Localities (SAL) and Statistical Area Level 4
(SA4) shapefiles (GDA2020) and the venue coordinates in data.js. Writes a
compact NSW + VIC locality list. Does not modify data.js.

Downloads (CC BY 4.0), if you need to regenerate:

  SAL_2021_AUST_GDA2020_SHP.zip
  SA4_2021_AUST_SHP_GDA2020.zip

from:
  https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files
"""

import argparse
import json
import math
import re
import subprocess
import unicodedata
from pathlib import Path

STATE_CODE = {"1": "NSW", "2": "VIC"}
# Inside a covered metro SA4, "Browse {region}" uses the nearest listing's
# BYOspot region when one is within this distance. Places outside those SA4s
# keep the ABS SA4 name, so Gosford stays Central Coast rather than the
# Northern Beaches venue 21 km away.
NEAR_VENUE_M = 40000
# (city, region) for SA4s that overlap the app's existing coverage.
COVERED_SA4 = {
    "Sydney - Baulkham Hills and Hawkesbury": ("Sydney", "Hills & North West"),
    "Sydney - Blacktown": ("Sydney", "Western Sydney"),
    "Sydney - City and Inner South": ("Sydney", "Inner City"),
    "Sydney - Eastern Suburbs": ("Sydney", "Eastern Suburbs"),
    "Sydney - Inner South West": ("Sydney", "Canterbury-Bankstown"),
    "Sydney - Inner West": ("Sydney", "Inner West"),
    "Sydney - North Sydney and Hornsby": ("Sydney", "Upper North Shore"),
    "Sydney - Northern Beaches": ("Sydney", "Northern Beaches"),
    "Sydney - Outer South West": ("Sydney", "Western Sydney"),
    "Sydney - Outer West and Blue Mountains": ("Blue Mountains", "Blue Mountains"),
    "Sydney - Parramatta": ("Sydney", "Western Sydney"),
    "Sydney - Ryde": ("Sydney", "Lower North Shore"),
    "Sydney - South West": ("Sydney", "Western Sydney"),
    "Sydney - Sutherland": ("Sydney", "Sutherland Shire"),
    "Melbourne - Inner": ("Melbourne", "Inner Melbourne"),
    "Melbourne - Inner East": ("Melbourne", "Inner East"),
    "Melbourne - Inner South": ("Melbourne", "Inner South"),
    "Melbourne - North East": ("Melbourne", "Inner North"),
    "Melbourne - North West": ("Melbourne", "North / North-West"),
    "Melbourne - Outer East": ("Melbourne", "Outer East"),
    "Melbourne - South East": ("Melbourne", "Outer South-East"),
    "Melbourne - West": ("Melbourne", "West"),
    "Geelong": ("Vic Coast", "Geelong"),
    "Mornington Peninsula": ("Vic Coast", "Mornington Peninsula"),
}

SKIP_NAME = re.compile(
    r"no usual address|migratory|offshore|shipping",
    re.I,
)
NAME_SPLIT = re.compile(r"^(.*?)\s+\((.+)\)\s*$")


def fold(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def haversine(lat1, lng1, lat2, lng2):
    radius = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(min(1.0, math.sqrt(h)))


def parse_name(raw):
    match = NAME_SPLIT.match(raw.strip())
    if not match:
        return raw.strip(), ""
    base, inside = match.group(1).strip(), match.group(2).strip()
    if " - " in inside:
        qualifier, _state = inside.rsplit(" - ", 1)
        return base, qualifier.strip()
    return base, ""


def rings_of(shape):
    points = shape.points
    if not points:
        return []
    parts = list(shape.parts) + [len(points)]
    rings = []
    for i in range(len(parts) - 1):
        ring = points[parts[i] : parts[i + 1]]
        if len(ring) >= 4:
            rings.append(ring)
    return rings


def shape_centroid(shape):
    total = 0.0
    sx = 0.0
    sy = 0.0
    for ring in rings_of(shape):
        area = 0.0
        cx = 0.0
        cy = 0.0
        for i in range(len(ring) - 1):
            x0, y0 = ring[i]
            x1, y1 = ring[i + 1]
            cross = x0 * y1 - x1 * y0
            area += cross
            cx += (x0 + x1) * cross
            cy += (y0 + y1) * cross
        if abs(area) < 1e-14:
            continue
        total += area / 2.0
        sx += cx / 6.0
        sy += cy / 6.0
    if abs(total) < 1e-14:
        points = shape.points
        if not points:
            return None
        return (
            sum(p[0] for p in points) / len(points),
            sum(p[1] for p in points) / len(points),
        )
    return sx / total, sy / total


def point_in_rings(x, y, rings):
    inside = False
    for ring in rings:
        for i in range(len(ring) - 1):
            x0, y0 = ring[i]
            x1, y1 = ring[i + 1]
            if (y0 > y) != (y1 > y):
                xint = (x1 - x0) * (y - y0) / (y1 - y0) + x0
                if x < xint:
                    inside = not inside
    return inside


def load_venues(data_js):
    out = Path("/tmp/byospot-venue-points.json")
    script = r"""
import fs from "fs";
import vm from "vm";
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(process.argv[1], "utf8"), sandbox);
const cityState = { Sydney: "NSW", "Blue Mountains": "NSW", Melbourne: "VIC", "Vic Coast": "VIC" };
const places = sandbox.window.BYO.places.map(function (p) {
  return { lat: p.lat, lng: p.lng, region: p.region, city: p.city, suburb: p.suburb, state: cityState[p.city] || "" };
});
fs.writeFileSync(process.argv[2], JSON.stringify(places));
"""
    subprocess.check_call(["node", "--input-type=module", "-e", script, str(data_js), str(out)])
    return json.loads(out.read_text())


def load_sa4(path):
    import shapefile

    reader = shapefile.Reader(str(path))
    areas = []
    for shape, rec in zip(reader.iterShapes(), reader.iterRecords()):
        data = rec.as_dict()
        state = STATE_CODE.get(data["STE_CODE21"])
        if not state:
            continue
        rings = rings_of(shape)
        if not rings:
            continue
        xs = [p[0] for ring in rings for p in ring]
        ys = [p[1] for ring in rings for p in ring]
        centroid = shape_centroid(shape)
        areas.append(
            {
                "name": data["SA4_NAME21"].strip(),
                "state": state,
                "rings": rings,
                "bbox": (min(xs), min(ys), max(xs), max(ys)),
                "centroid": centroid,
            }
        )
    return areas


def sa4_for(lng, lat, areas):
    for area in areas:
        minx, miny, maxx, maxy = area["bbox"]
        if lng < minx or lng > maxx or lat < miny or lat > maxy:
            continue
        if point_in_rings(lng, lat, area["rings"]):
            return area["name"]
    best = None
    best_d = None
    for area in areas:
        centroid = area["centroid"]
        if not centroid:
            continue
        dist = haversine(lat, lng, centroid[1], centroid[0])
        if best_d is None or dist < best_d:
            best_d = dist
            best = area["name"]
    return best or ""


def nearest_venue(lat, lng, venues, state):
    best = None
    best_d = None
    for venue in venues:
        if venue.get("state") != state:
            continue
        if not isinstance(venue.get("lat"), (int, float)) or not isinstance(venue.get("lng"), (int, float)):
            continue
        dist = haversine(lat, lng, venue["lat"], venue["lng"])
        if best_d is None or dist < best_d:
            best_d = dist
            best = venue
    return best, best_d if best_d is not None else 1e18


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sal", required=True, help="Path to SAL_2021_AUST_GDA2020.shp")
    parser.add_argument("--sa4", required=True, help="Path to SA4_2021_AUST_GDA2020.shp")
    parser.add_argument("--data", default="data.js")
    parser.add_argument("--out", default="localities.json")
    args = parser.parse_args()

    import shapefile

    venues = load_venues(args.data)
    listed = set()
    for venue in venues:
        if venue.get("state") and venue.get("suburb"):
            listed.add(venue["state"] + "|" + fold(venue["suburb"]))
    print("venues", len(venues), "listed suburb keys", len(listed))

    print("loading SA4…")
    sa4s = load_sa4(args.sa4)
    print("sa4 regions", len(sa4s))

    print("loading SAL centroids…")
    reader = shapefile.Reader(str(args.sal))
    rows = []
    skipped_listed = 0
    skipped_special = 0
    for shape, rec in zip(reader.iterShapes(), reader.iterRecords()):
        data = rec.as_dict()
        state = STATE_CODE.get(data["STE_CODE21"])
        if not state:
            continue
        raw = data["SAL_NAME21"].strip()
        if SKIP_NAME.search(raw):
            skipped_special += 1
            continue
        name, _qualifier = parse_name(raw)
        if not name or SKIP_NAME.search(name):
            skipped_special += 1
            continue
        if state + "|" + fold(name) in listed:
            skipped_listed += 1
            continue
        centroid = shape_centroid(shape)
        if not centroid:
            continue
        lng, lat = centroid
        region_name = sa4_for(lng, lat, sa4s)
        if SKIP_NAME.search(region_name or ""):
            skipped_special += 1
            continue
        covered = COVERED_SA4.get(region_name)
        if covered:
            venue, dist = nearest_venue(lat, lng, venues, state)
            if venue and dist <= NEAR_VENUE_M and venue.get("region") and venue.get("city"):
                region = venue["region"]
                city = venue["city"]
            else:
                city, region = covered
        else:
            region = region_name
            city = ""
        rows.append(
            [
                name,
                state,
                round(lat, 5),
                round(lng, 5),
                region,
                city,
            ]
        )

    rows.sort(key=lambda row: (row[1], fold(row[0]), row[2], row[3], row[4]))
    # Same cleaned name and state can occur once per LGA. Keep each distinct
    # coordinate so a typed name still resolves, and let search disambiguate.
    payload = {
        "source": "Australian Bureau of Statistics, Australian Statistical Geography Standard (ASGS) Edition 3, Suburbs and Localities (SAL) 2021 and Statistical Area Level 4 (SA4) 2021, GDA2020.",
        "licence": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        "licenceUrl": "https://creativecommons.org/licenses/by/4.0/",
        "attribution": "Australian Bureau of Statistics, ASGS Edition 3 SAL 2021 and SA4 2021. Centroid coordinates were calculated from the official SAL boundaries. Localities outside the covered Sydney, Blue Mountains, Melbourne and Victorian-coast SA4s keep the ABS SA4 name. Inside those SA4s, region is the nearest BYOspot venue's region when one is within 40 km, otherwise a fixed SA4-to-region match.",
        "places": rows,
    }
    out = Path(args.out)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("wrote", out, "places", len(rows), "bytes", out.stat().st_size)
    print("skipped listed", skipped_listed, "skipped special", skipped_special)

    def show(name, state=None):
        hits = [row for row in rows if fold(row[0]) == fold(name) and (state is None or row[1] == state)]
        print(name, hits[:6], "count", len(hits))

    for sample in ("Gosford", "Terrigal", "Wyong", "Wollongong", "Newcastle", "Surrey Hills", "Newtown", "Torquay", "Queenscliff"):
        show(sample)


if __name__ == "__main__":
    main()
