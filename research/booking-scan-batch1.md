# Booking-link scan, batch 1

Checked 28 November 2026. Fifty venues that already have a website in `data.js`. No other venues were fetched.

## How the 50 were chosen

`data.js` lists 1,044 places. 324 of them have a website starting with http. Those 324 were grouped by region, in the region order already in the file. Melbourne, Geelong and the Victorian coast have no website stored, so they were not candidates and were not fetched. The 13 regions that do have a website each took an equal share of the 50. Leftover slots went to regions that still had unused venues, in that same order. Inside a region the venues stay in file order, and the pick is every Nth: index `floor(i × count / quota)`.

Gift-card pages (NowBookIt card-selection links) were not treated as table bookings. A widget script was not stored when the venue's own booking page was the page a person can open.

## Hit rate

**14 of 50** venues had a booking link stored in `bookingUrl`. Of the other 36, 28 homepages loaded with nothing stored, 5 fetches were blocked, and 3 failed.

| Platform | Venues |
| --- | --- |
| NowBookIt | 1 |
| OpenTable | 1 |
| ResDiary | 2 |
| SevenRooms | 6 |
| Venue booking page | 3 |
| WowApps | 1 |

Cipri Italian and Pikkio embed an OpenTable widget. The stored URL is the venue page that hosts it. Bill & Toni is the one direct OpenTable restaurant link.

## Venues with a booking link

| Venue | Region | Platform | Booking URL | Found on |
| --- | --- | --- | --- | --- |
| Ho Jiak Haymarket, Haymarket | CBD | SevenRooms | https://www.sevenrooms.com/explore/hojiakhaymarket/reservations/create/search?lang=en&tracking=website | https://www.hojiak.com.au/haymarket/ |
| Arthur, Surry Hills | Inner City | SevenRooms | https://www.sevenrooms.com/explore/arthur/reservations/create/search/landing | https://www.arthurrestaurant.com/ |
| ATTENZIONE! Food & Wine, Redfern | Inner City | SevenRooms | https://www.sevenrooms.com/reservations/attenzionefoodandwineredfern | https://www.attenzionefoodandwine.com/ |
| Bill & Toni Italian Restaurant, Darlinghurst | Inner City | OpenTable | https://www.opentable.com.au/r/bill-and-toni-italian-restaurant-reservations-darlinghurst?restref=125393&lang=en-AU&ot_source=Restaurant%20website | https://www.billandtonis.com.au/ |
| Lil Franky Pizzeria, Tempe | Inner West | WowApps | https://bookings.wowapps.com/make-booking/lilfrankypizzeria?src=web | https://www.lilfranky.com.au/reservations |
| Louie, Coogee | Eastern Suburbs | SevenRooms | https://www.sevenrooms.com/reservations/louiecoogee | https://louiecoogee.com.au/ |
| Cipri Italian, Paddington | Eastern Suburbs | Venue booking page | https://cipriitalian.com.au/book | https://cipriitalian.com.au/ |
| I Love Pho, Crows Nest | Lower North Shore | ResDiary | https://booking.resdiary.com/widget/Standard/ILOVEPHORestaurant/8241 | https://ilovepho.com.au/reservation/ |
| Garfish Crows Nest, Crows Nest | Lower North Shore | SevenRooms | https://www.sevenrooms.com/explore/garfishcrowsnestvenue/reservations/create/search/ | https://garfish.com.au/reservations-crows-nest |
| Teta's Authentic Lebanese, Roseville Chase | Upper North Shore | SevenRooms | https://www.sevenrooms.com/reservations/tetasroseville | https://www.tetas.net.au/ |
| Chez Pascal, Sans Souci | St George | ResDiary | https://booking.resdiary.com/widget/Standard/ChezPascalFrenchRestaurant/11121?includeJquery=false | https://www.chezpascal.com.au/ |
| Alphabet St, Cronulla | Sutherland Shire | NowBookIt | https://bookings.nowbookit.com/?accountid=f79eef14-4957-48ee-b6f6-f1e158e810b4&colors=hex%2Cfce4ec%2Cf8bbd0&font=Nanum%20Gothic&theme=dark&venueid=1967 | https://natalegrouprestaurants.com/alphabet-st-cronulla |
| Pikkio Pizzeria Trattoria, Panania | Canterbury-Bankstown | Venue booking page | https://pikkio.com.au/bookings/ | https://pikkio.com.au/ |
| Taste of Tuscany, Carlingford | Hills & North West | Venue booking page | https://www.tasteoftuscany.com.au/booknow | https://www.tasteoftuscany.com.au/ |

## No booking link

The homepage loaded (HTTP 200) and did not yield a booking URL that was stored.

- Kafe Kooks - The House of Roti, Ultimo (CBD).
- Menya Noodle Bar, Sydney (CBD).
- Auvers Dining - Darling Square, Haymarket (CBD).
- Viet Eatery, Surry Hills (Inner City).
- Golden Pide, Surry Hills (Inner City).
- Da Lat Restaurant, Randwick (Eastern Suburbs).
- Maranello's, Maroubra (Eastern Suburbs).
- Haidilao Hotpot Chatswood, Chatswood (Lower North Shore).
- La Botte, Willoughby (Lower North Shore).
- Young's Gourmet Pizzeria, Normanhurst (Upper North Shore).
- Meena Thai, East Lindfield (Upper North Shore).
- Rosso Cavallino St Ives, St Ives (Upper North Shore).
- Pocket Pizza Brookvale, Brookvale (Northern Beaches).
- Little Manly Beach Kiosk, Manly (Northern Beaches).
- Livoti's Italian Restaurant, Dee Why (Northern Beaches).
- Fishmongers Manly, Manly (Northern Beaches).
- Sunny Seafood Restaurant, Mortdale (St George).
- Jailhouse Rock Pizza & Pasta, Brighton-Le-Sands (St George).
- Ros Niyom Thai Restaurant and Bar, Kirrawee (Sutherland Shire).
- Thai Rim Nam, Como (Sutherland Shire).
- Siam Thai Sutherland, Sutherland (Sutherland Shire).
- Tsipouro Taverna, Earlwood (Canterbury-Bankstown).
- Wally & Ossie's, Campsie (Canterbury-Bankstown).
- Sushi Mata, Parramatta (Western Sydney).
- Temasek Restaurant, Parramatta (Western Sydney).
- Castle Taj, Castle Hill (Hills & North West).
- Red Galangal, Rouse Hill (Hills & North West).
- 8Things, Katoomba (Blue Mountains). The homepage linked Google Maps reserve URLs. Each copy had a different session query, and the path with that query removed returned 404, so no booking URL was stored.

## Failures and blocked fetches

| Venue | Website | What happened |
| --- | --- | --- |
| Fish At The Rocks, Millers Point | http://www.fishattherocks.com.au/ | Blocked, HTTP 403 |
| Kandy Bites by Chef Ceylon, Glebe | https://kandybites.com.au/ | Blocked, HTTP 429 |
| Arabella, Newtown | http://www.arabella.com.au/ | Failed, HTTP 502 |
| Mario's Pizzeria, Croydon | http://www.mariospizzeria.com.au/ | Failed, HTTP 502 |
| Blue Heaven, Hurstville | https://blue-heaven1.square.site | Blocked, HTTP 429 |
| Se Jong Korean BBQ Buffet, Campsie | https://social.quandoo.com/en/groups/Se-Jong-Korean-BBQ-Buffet-Campsie | Blocked, HTTP 503 |
| Liverpool Nutrition, Liverpool | https://www.instagram.com/liverpoolnutrition/ | Blocked, HTTP 429 |
| Lakeside Restaurant, Penrith | http://www.lakesiderestaurant.com.au/ | Failed, HTTP 502 |

Each stored record has `bookingUrl`, `bookingUrlSource` (the page the link was found on) and `bookingUrlCheckedAt` of `2026-11-28`. No page text or images were copied.
