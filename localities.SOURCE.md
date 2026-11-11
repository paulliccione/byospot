# NSW and VIC suburbs and localities

`localities.json` is the place list used when someone types a suburb into **Choose a Location** and that suburb has no BYOspot listings.

## Source

Australian Bureau of Statistics, Australian Statistical Geography Standard (ASGS) Edition 3:

- Suburbs and Localities (SAL) 2021, `SAL_2021_AUST_GDA2020`
- Statistical Area Level 4 (SA4) 2021, `SA4_2021_AUST_GDA2020`

Both files are the GDA2020 digital boundary files published by the ABS:

https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files

The ABS describes Suburbs and Localities as an approximation of gazetted suburbs (in cities and larger towns) and localities (elsewhere). Each point in `localities.json` is the centroid of that SAL boundary, not a street address. Region names outside Sydney, the Blue Mountains, Melbourne and the Victorian coast are the ABS SA4 names (for example Gosford is in Central Coast). Inside those covered areas, the region is the nearest BYOspot venue’s region when one is within 40 km, so **Browse {region}** opens a list that already has venues.

Suburbs that already have a BYOspot listing are not repeated in this file. “No usual address” and “Migratory - Offshore - Shipping” rows are left out. They are not suburbs.

## Licence

Creative Commons Attribution 4.0 International (CC BY 4.0)

https://creativecommons.org/licenses/by/4.0/

© Australian Bureau of Statistics. This derived list contains no ABS boundary polygons, only suburb and locality names, state, centroid coordinates and a region label.

## In the app

The file is not part of the service-worker install list. Choose a Location loads it the first time that screen opens, so the home screen stays light. `scripts/build_localities.py` rebuilds it from the ABS shapefiles and `data.js` without editing venue records.
