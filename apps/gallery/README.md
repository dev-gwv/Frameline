# @frameline/gallery — guest web gallery

What guests open from WhatsApp links and QR codes. Phone-first, installable PWA, no account needed.

```
pnpm --filter @frameline/gallery dev      # http://localhost:5174
pnpm --filter @frameline/gallery build    # tsc -b && vite build
node apps/gallery/scripts/gen-icons.mjs   # regenerate PWA PNG icons
```

Data comes from `createMockApi` persisted under `localStorage['frameline.gallery.v1']` (see `src/lib/api.tsx`;
there is a `TODO(api)` switch for `createHttpApi` via `VITE_API_URL`). Everything the guest does on the device
(PIN, registration, selfie match, favourites, Download-all uses, orders, enquiries, follows, recent events) lives
in `localStorage['frameline.guest.v1']` (`src/lib/guest.ts`) until the API grows guest endpoints.

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

JSON payload (`GuestLinkPayload` in `src/lib/link.ts`; keys are short on purpose):

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
import { encodeGuestLink } from './src/lib/link'
encodeGuestLink({ e: '6402F9F', album: 'ev_riya_al2' })                 // /s/eyJlIjoiNjQwMkY5RiIsImFsYnVtIjoiZXZfcml5YV9hbDIifQ
encodeGuestLink({ e: '6402F9F', n: 'Dadi ji', me: true })               // /s/…  face link
encodeGuestLink({ e: '6402F9F', n: 'Priya', vip: { skipLogin: true, pin: true } }, 'https://frameline.in') // https://frameline.in/v/…
```

Rules: `/s/` links never bypass the PIN; use a VIP link with `pin` for that. A typed PIN also shows all photos
(per the Share screen: "the PIN … shows every photo when only their photos is on"); an embedded PIN does not unless
`vip.all` is set. Tokens are unsigned for now — the API should sign them (HMAC) or hide them behind KV short codes
(`frameline.in/s/Qm7k`); the decoder already ignores unknown keys.

## Access & download rules (src/lib/access.ts)

- Blocked states: `settings.disabled` → turned off; `status: archived` → archived; `expiresAt` past → expired;
  draft with no photos → "Photos are on their way"; unknown code → not found.
- Gates in order: app interstitial (`!skipAppLanding`), PIN (`access === 'link-pin'`, 5 tries then a 15-minute lock),
  registration (`requireRegistration` or `access === 'registered'`).
- Browse all: when `facePrivacy` is off, face search is off, the PIN was typed, or a VIP link has `all`.
  Otherwise albums open filtered to the guest's matches.
- Single download: `all` → yes; `own` → only photos they're in; `none` → explains why (+ Buy if the store is on).
  Bought photos are always downloadable.
- Download all (album / all photos): PIN each time (unless embedded), 5 uses per guest per device.
- Files: rendered on a canvas (tone gradient or uploaded image) at 2048 px (web) or 3072 px (`originalDownloads`),
  watermarked from `api.getWatermark()` unless `watermarkOff`; >12 photos offers an emailed ZIP (simulated).

## PWA

`public/manifest.webmanifest` (Frameline, theme `#15120E`), SVG + PNG icons (`scripts/gen-icons.mjs`) and a
hand-written `public/sw.js`: app shell cached on install, navigations network-first with offline fallback,
hashed assets and fonts cache-first, viewed photo renditions (`destination === 'image'`) cache-first capped at 300.
The worker registers only in production builds (`src/lib/pwa.ts`).

## Simulated for now (TODO(api) markers in code)

Face search (deterministic subset of photos containing `p_g1/p_g2/p_g3`), guest registration, favourites sync,
ZIP email, orders/payments (UPI/card mock), enquiries, follows, download counting, studio services/FAQ content and
lookup by follow code, guest-upload attribution (`uploadPhotos` records `uploadedBy: 'You'`; photos needing review
are hidden via `updatePhotos({ hidden: true })`).
