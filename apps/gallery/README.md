# @frameline/gallery — guest web gallery

What guests open from WhatsApp links and QR codes. Phone-first, installable PWA, no account needed.

```
pnpm --filter @frameline/gallery dev      # http://localhost:5174
pnpm --filter @frameline/gallery build    # tsc -b && vite build
node apps/gallery/scripts/gen-icons.mjs   # regenerate PWA PNG icons
```

Data comes from the `FramelineApi` guest endpoints (`src/lib/api.tsx`): `createHttpApi` against apps/api when
`VITE_API_URL` is set (guest tokens in `localStorage['frameline.guest.tokens.<SHORTID>']`), otherwise `createMockApi`
persisted under `localStorage['frameline.gallery.v1']`. Errors are mapped to plain words in `src/lib/errors.ts`.

`localStorage['frameline.guest.v2']` (`src/lib/guest.ts`) keeps only what the API has no per-guest endpoint for:
guest-session meta (expiry, see-all), gate choices, the face match, favourites (ids + photo snapshots; each tap is
sent with `setFavourite`), Download-all uses, photos bought on this device, recent events, follows and form pre-fill.

## Routes

| Route | Screen |
| --- | --- |
| `/` | Open your photos (event code), recently opened events, follow a studio by code |
| `/:shortId` | Event landing: gates (app interstitial → PIN → registration), hero, Find my photos, Browse all, albums, films, highlights, guest upload, enquiry |
| `/:shortId/me` | "We found you in N photos", album chips, Buy + Download N |
| `/:shortId/a/:albumId` | Album grid with infinite loading. `all` = every album, `highlights` = most-favourited |
| `/:shortId/p/:photoId?from=me\|fav\|all\|highlights\|<albumId>` | Photo viewer (dark): swipe/arrow keys, Favourite, Download, Share, Buy print, enquiry |
| `/:shortId/favourites` | The guest's favourites |
| `/s/:token`, `/v/:token` | Personal links (below) |
| `/studio/:followCode` | Studio profile: featured galleries, services, questions, contact, Follow |

`shortId` is case-insensitive; the app links in lower case (`/6402f9f`).

## Personal link token format

```
/s/<token>   album links and face ("My photos") links
/v/<token>   VIP links (only /v/ honours the vip flags)

token = base64url(UTF-8 JSON), no "=" padding
```

JSON payload (`GuestLinkPayload` in `@frameline/shared` links.ts; keys are short on purpose):

| key | type | meaning |
| --- | --- | --- |
| `e` | string, required | Event shortId, e.g. `"6402F9F"` |
| `n` | string | Welcome name → "Welcome, Dadi ji" (max 40 chars) |
| `album` | string | Album id to land on (ignored if it doesn't exist) |
| `me` | `true` | Face link: start on "My photos" with no selfie |
| `p` | string | Person id from face recognition for `me` links (else a person is picked deterministically from the name) |
| `vip.skipLogin` | `true` | Skip registration and the app interstitial |
| `vip.pin` | `true` | PIN embedded: passes the PIN gate and Download all never asks for the PIN (still 5 uses) |
| `vip.all` | `true` | See all photos even when "guests see only their photos" is on |

Examples:

```ts
import { encodeGuestLink } from '@frameline/shared'
encodeGuestLink({ e: '6402F9F', album: 'ev_riya_al2' })                 // /s/eyJlIjoiNjQwMkY5RiIsImFsYnVtIjoiZXZfcml5YV9hbDIifQ
encodeGuestLink({ e: '6402F9F', n: 'Dadi ji', me: true })               // /s/…  face link
encodeGuestLink({ e: '6402F9F', n: 'Priya', vip: { skipLogin: true, pin: true } }, 'https://frameline.in') // https://frameline.in/v/…
```

Rules: `/s/` links never bypass the PIN; use a VIP link with `pin` for that. The gallery calls
`resolveGuestLink(code)` first (server-signed 14-character codes from `createGuestLink`, or these unsigned tokens);
VIP links with `pin`/`all` come back with a guest session. If the API doesn't know the code the token is decoded
locally and its VIP flags are ignored. Face links without `p` look the person up with `searchFaces` after the gates.

## Access & download rules (src/lib/access.ts — the API enforces them)

- Blocked states come from `getPublicEvent(...).blocked`: disabled, archived, expired, empty; unknown code → not found.
- Gates in order: app interstitial (`!skipAppLanding`), PIN (`verifyPin`; 401 `invalid_pin` shows tries left, 429
  `pin_locked` shows the 15-minute lock), registration (`registerGuest`). Sessions last 12 h; when the API answers
  `pin_required` / `registration_required` / expired token, the matching gate opens again.
- Browse all: when `facePrivacy` or face search is off, or the session has `seeAll` (typed PIN, VIP `all`).
  Otherwise albums open filtered to the guest's matches (`listPublicPhotos({ personId })`).
- Single download: `all` → yes; `own` → only photos they're in; `none` → explains why (+ Buy if the store is on).
  Bought photos are always downloadable.
- Download all: PIN each time on PIN galleries (checked by `verifyPin`, unless embedded), 5 uses per guest per
  device (counted locally — the API doesn't track it).
- Files: rendered on a canvas at 2048 px (web) or 3072 px (`originalDownloads`), watermarked from `getWatermark()`
  (falls back to the studio name when the API won't serve it to guests) unless `watermarkOff`; counted with
  `recordDownload`. >12 photos offers an emailed ZIP (`requestZip`; simulated when the API refuses guests).

## PWA

`public/manifest.webmanifest` (Frameline, theme `#15120E`), SVG + PNG icons (`scripts/gen-icons.mjs`) and a
hand-written `public/sw.js`: app shell cached on install, navigations network-first with offline fallback,
hashed assets and fonts cache-first, viewed photo renditions (`destination === 'image'`) cache-first capped at 300.
The worker registers only in production builds (`src/lib/pwa.ts`).

## Still simulated / TODO(api)

Razorpay Checkout for pending orders, print delivery address (not in `OrderInput`), guest ZIP requests, unfollow,
the guest's purchased-photo list, and a face embedding for `searchFaces` (the dev match uses the selfie key
`${event.id}:${file.name}:${file.size}`).
