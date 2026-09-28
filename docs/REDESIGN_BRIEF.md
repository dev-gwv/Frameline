# Redesign brief (v2): read fully before coding

The user approved a simpler, Kamero-style redesign. It **replaces** the old design (`frameline-design.html`) for
layout, navigation and flows. Features and data stay; how they're presented changes.

- **Spec:** `docs/design/frameline-redesign.html`. Search for `{id:'<screen-id>'` inside the `journey(...)` calls.
  For each screen: `render` is the visual spec (layout, copy, hierarchy — build it to look like that), `what` + `list`
  are behaviour requirements, `next` is the flow. The `COV` array ("Coverage" tab) lists every existing screen/state and
  where it now lives; rows pointing at your area must all still work. `R1`/`R2` are the design/behaviour rules below.
  You can open the page in a browser (serve the folder or open the file) to see it rendered.
- The old brief `docs/BUILD_BRIEF.md` still applies for monorepo, data access (`queries.ts`, `useApi`, `useAction`),
  states (Skeleton/EmptyState/QueryError), formatting (`fmt.*`), no `window.confirm`, "no dead buttons" and verification
  — **except where this brief overrides it** (tokens, dark cards, mono, drawers, confirms).

## Information architecture (admin)
- **Top bar** (white, 56px, full width): logo · **Home · Events · Sell photos · More ▾** … right side: search (⌘K),
  photos-used pill (opens /plan), Help (?) (/support), avatar menu (Studio profile, Team, Plan and billing, Settings,
  Help and support, Sign out). No sidebar anywhere.
- **More ▾** menu (2 columns, each item icon + name + one-line description): Watermark, Camera sync, Smart QR,
  Messages to guests, AI enhance, Your studio app, Reports, Team.
- **Phone (<768px):** compact top bar (logo, search, avatar) + bottom tab bar Home · Events · Sell · More (More opens a
  sheet with the More items + account items).
- **Event page** `/events/:eventId` = shared EventLayout: back link, name + status chip, one facts line
  (dates · city · N of M photos · PIN), buttons ⋯ / Upload / **Share** (gold); tabs **Photos · Guests · Settings**
  (Guests shows a count badge of things needing action). Child routes: index = Photos, `guests`, `settings`.

### Route map
| Route | Screen | Owner (stage 2) |
|---|---|---|
| `/login`, `/auth/callback`, `/setup` | Sign in, code, forgot password, setup wizard (3 steps) | C |
| `/` | Home (first-run variant, Needs you, events, 3 cards) + upload picker modal | C |
| `/events` (`?new=1`, `?f=trash`) | Events grid, status tabs, sort, New event **modal**, Recently deleted | C |
| `/events/:eventId` (layout) | EventLayout header + tabs | Foundation |
| `/events/:eventId` (index) | Photos tab: rail, grid, selection bar, move menu, empty drop zone, uploading strip, ⋯ menu, Import, Films, Upload modal, "not enough space" modal, Share modal | A |
| `/events/:eventId/photos/:photoId` | Photo viewer (no shell): Details/People/Activity panel, ⋯ menu | A |
| `/events/:eventId/guests` | Guests tab: 4 stats, filter chips (Everyone/Picks/Requests/Uploads), picks modal, uploads review | B |
| `/events/:eventId/settings` | Settings tab: summary sentence, 2-col card grid, Change downloads modal, lower cards, Add host, Add photos | B |
| `/sell`, `/sell/settings/:tab` | Sell first-run checklist, dashboard (3 numbers + tabs), Sell from an event, Order modal + **Refund**, Withdraw; settings left-list page (Business details, Payout account, Prices, Watermark for sale photos, Selling abroad, Terms) | D |
| `/plan` | Plan and billing, Renew modal (also opened from Home), Checkout, "You're on …", Add money, Redeem code, event packs, renewal pricing | D |
| `/settings/:tab` | Left list: Studio profile, Team, Notifications, Billing and GST, Invoices, Security; Invite modal | D |
| `/support` | Help: 3 cards + Your requests + new request modal | D |
| `/watermark`, `/camera-sync`, `/qr`, `/messages`, `/enhance(/:photoId)`, `/studio-app`, `/reports` | Tools | E |
| Old paths | `/store`→`/sell`, `/store/settings`→`/sell/settings/business`, `/wallet`→`/sell?tab=payouts`, `/broadcasts`→`/messages`, `/watermarks`→`/watermark`, `/website`→404 | Foundation |

## Design rules (override BUILD_BRIEF where they differ)
1. **One gold button per screen** (`variant="primary"`). Everything else outlined or ghost.
2. **Light everywhere except the photo viewer.** Do not use `DarkCard` or `bg-side*` tokens in new work.
3. **Fonts:** Manrope for all UI; `font-display` (Fraunces) **only** for page titles (and the odd big hero number).
   No `font-mono` for counts/money/IDs in UI (use `tnum`); no uppercase `eyebrow` labels.
4. **Chips only mean status** (Live, Uploading, Expiring, Draft, counts needing action) — always a dot or icon + word.
5. **Every icon has a word** (label next to it, or a named menu item). Icon-only buttons only for ⋯/close/back, with `aria-label`.
6. Layout: content `max-w-[1200px] mx-auto px-4 sm:px-6`, page bg `bg-paper`, white cards `rounded-card border border-line bg-surface shadow-card`, card titles 15px extra-bold sans, buttons 38px (46px on phone primary actions).
7. **Modal or page, never a drawer.** ≤ ~5 fields → `Modal`; longer → a full page with a Back link. Don't use `Drawer`.
8. **Undo, not "Are you sure?"** Trash, archive, hide, move, remove host/member, reject: act immediately and show a toast
   with an **Undo** action (`useToast().toast({ title, action: { label: 'Undo', onClick } })`). Ask first
   (`ConfirmDialog`) only for: sending messages, paying, refunding, new PIN, delete forever, turning off an event, resetting camera passwords.
9. **Fold the rare:** options fewer than 1 in 5 people need go under "More options" or ⋯.
10. **Buttons say what happens**, with counts/amounts on them: "Upload 404 photos", "Pay ₹30,998".
11. **Every dead end has a way out:** empty, error, offline, closed states explain why and offer one next step.
12. **Two resource words:** "photos" = plan/event space; "wallet" = money (₹). Never "credits"/"capacity" in UI copy.
13. **Needs you, not activity:** only actionable items reach Home.
14. Phone: targets ≥ 44px, sheets from the bottom, one column, no horizontal page scroll at 390px.

## Ownership (stage 2)
Only edit files you own. `packages/*`, `apps/api/*`, `apps/admin/src/lib/*`, `apps/admin/src/layout/*`, `main.tsx`
belong to the lead/foundation — if you need something there, work around it locally and list it under
"Needs from lead". **`routes.tsx`:** you may edit only the route entries for your own screens (re-read the file right
before each edit; other agents edit it too). You may delete/rename files inside your own folders.

| Agent | Owns |
|---|---|
| A | `pages/workspace/**`, `pages/viewer/**` |
| B | `pages/guests/**`, `pages/event-settings/**` |
| C | `pages/home/**`, `pages/events/**`, `pages/auth/**`, `pages/system.tsx`, `pages/NotFound.tsx` |
| D | `pages/store/**`, `pages/wallet/**`, `pages/sell/**` (new), `pages/plan/**`, `pages/settings/**`, `pages/support/**` |
| E | `pages/watermarks/**`, `pages/camera-sync/**`, `pages/qr/**`, `pages/broadcasts/**`, `pages/enhance/**`, `pages/studio-app/**`, `pages/reports/**` |
| F | `apps/gallery/**` |
| G | `apps/mobile/**` — **paused by the user.** Build the web app and API only; keep the API and shared contract client-agnostic so a native app can use them later. The admin and gallery web apps must work well in phone browsers. |

## Verify before reporting
- `pnpm --filter @frameline/admin exec tsc -b` (or the app's own typecheck) passes for your files.
- Admin dev server: http://localhost:5173 (gallery 5174). If it isn't running, start it in the background with
  `pnpm dev:admin -- --strictPort` (never kill a server you didn't start). Check your screens at desktop width and 390px
  in light and dark. If you use Chrome, open your own tab and close it when done.
- Everything must work against the mock API (sample data persists in localStorage).
- Final report: screens done (by artifact screen id), anything simulated, deviations from the spec and why, "Needs from lead".

## Foundation API (built in stage 1: use these, don't re-invent them)

### Shell & navigation (`apps/admin/src/layout`, foundation-owned)
- `AppShell`: white 56px top bar (Home · Events · Sell photos · More ▾ · search · photos pill → /plan · Help → /support ·
  avatar menu) and, under 768px, a compact top bar + bottom tabs (Home · Events · Sell · More → bottom sheet).
  **Pages scroll with the window.** Don't add your own sidebar or top bar. The shell pads `main` for the phone tab bar;
  fixed bottom UI must sit at `bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-6` (SelectionBar already does).
- `nav.ts`: `PRIMARY_NAV`, `MORE_NAV` (with one-line descriptions), `ACCOUNT_NAV`, `EXTRA_PAGES`, `PHONE_TABS`. The ⌘K
  palette derives from it. A new tool goes into `MORE_NAV`, never a 4th top link.
- ⌘K palette (groups Events · Actions · Pages) uses these deep links. **Owners must support them**:
  `/events?new=1` (C), `/events?f=trash` (C; old code used `?status=trash`), `/?upload=1` (C: upload picker),
  `/plan?renew=<eventId>[&faces=1]` (D; C may also open D's Renew modal on Home), `/events/<id>?modal=share|upload`
  (A), `/events/<id>/guests?f=requests|uploads` (B), `/settings/team?invite=1` (D), `/sell?tab=payouts` (D).
- `UploadDock` / `useUploads()` (same `start()` as before) now pauses by itself offline ("Paused: you're offline",
  resumes on the `online` event) and stops with Retry on server errors. `useEventUploads(eventId)` →
  `{ jobs, done, total, togglePause, retry }` for A's "Uploading 212 of 404" strip; `uploadRate(job)` → `{ mbps, minsLeft }`.

### Event page (`pages/event/EventLayout.tsx`, foundation-owned)
- `/events/:eventId` renders the header (Back to Events, name + `EventStatusChip`, facts line via `eventFacts(event)`,
  ⋯ menu, Upload, gold Share) + tabs Photos · Guests (badge) · Settings, then `<Outlet/>` inside the 1200px column.
- Tabs get the event without refetching: `const { event } = useEventContext()` (from `pages/event/EventLayout`).
  Don't render your own event title/header inside a tab.
- **Modals via `?modal=`** (use `useModalParam()` from `lib/url`): `share` (+`&tab=link|qr|message|personal`),
  `upload` (+`&album=<id>` optional), `import`, `films`, `faces`. They're mounted once by
  **`pages/workspace/EventModals.tsx`** (owner **A**; now a stub that mounts the old Share/Upload/Import/Films modals
  and a small Face finding modal), so Upload and Share work from Guests and Settings too. TRANSITION for A: the old
  Workspace still mounts Upload/Import/Share itself, so EventModals skips those on the Photos tab (`photosTabOwns`) and
  EventLayout hides the old `WorkspaceHeader` with `[&>div>header]:hidden`. Remove both when you rewrite the Photos tab.
- ⋯ menu: Preview as a guest, Import from Google Drive, Films, Face finding, Archive event (acts immediately + Undo
  toast; "Restore event" when archived). Delete stays at the bottom of Settings (B).
- Guests badge = pending access requests + guest photos awaiting review (`useGuestsAttention(eventId)`).

### `@frameline/ui` (restyled to the rules)
- Restyled: `Button` (sm 30 / md 38 / lg 46px; new `variant="destructive"` = solid red, only for refund and delete
  forever; `dark`/`side` deprecated), `Card` (18px padding, soft shadow), `CardHeader` (15px extra-bold sans + optional
  `description`), `Chip` (dot by default; `icon` prop; `dot={false}` for pure counts), `EventStatusChip` (always dot +
  word: "Expires in 6 days", "Expired"; `className`), `PageHeader` (Fraunces 26px, subtitle ink-2), `StatCard` (number
  first, label under, optional `action`), `TabBar` (count → gold `CountBadge`), `Meter` (`tone`, `label`), `Kbd` and
  `StepBadge` (no mono), `Tip` (inverse colours), `LogoMark`, `EmptyState` (title 22px, `action` can hold 1–2 buttons).
- **`Modal` becomes a bottom sheet on phones (<640px) automatically**, a centred dialog above. The body has default
  padding (22px sides, 14px gaps): pass `bodyClassName="p-0"` for edge-to-edge content. Footer = Cancel (`ghost`) + the one gold button.
- `ConfirmDialog`: only for rule-8 cases. `onConfirm` may return a promise (spinner; closes on success, stays open on
  error); `danger` → solid red; `children` for an extra field (e.g. the refund reason).
- `Menu` items take `description` (second line); `header` (account block); `columns={2}` (More menu).
- New: `Page` ({title, subtitle, crumb, actions, children}: the 1200px column + header; use it for every new page),
  `PageBody` (just the column), `RadioCard` / `RadioCardGroup` ({value, onChange, options: [{value, title, description,
  extra?}], columns}), `FilterChips` ({value, onChange, options: [{value, label, count, attention}]}), `SelectionBar`
  ({label: "4 selected", onClear, children: actions}; white floating bar, above the tab bar on phones), `BottomSheet`
  (phone menus), `ChecklistSteps` ({title, steps: [{title, description, done, action}]}), `StepIndicator` ({steps,
  current}) for the setup wizard, `CountBadge`.
- Toasts: dark pill at the bottom centre (above the phone tab bar). `useToast().undo(title, onUndo)` is the rule-8 Undo
  toast (6 s); `toast({ title, action: { label, onClick } })` also stays 6 s. `Drawer` is still exported but deprecated.
- Tokens now match the redesign palette (`--paper #F7F5F0`, gold `#B8862B`, gold text `#8A5E14`, softer shadows) plus
  `bg-inverse text-inverse-ink text-inverse-accent` for dark floating UI, and the `scrollbar-none` utility.

### `apps/admin/src/lib`
- `lib/url.tsx`: `useModalParam()` → `{ modal, params, open(name, extra?), close(clearKeys = ['tab']), set }`;
  `useParamState()` → `[params, set(patch, replace?)]`; `BackLink` ("‹ Events"); `GALLERY_URL`, `galleryUrl(shortId)`.
- `lib/queries.ts` (new):
  - `useNeedsYou()` → `NeedsYouEntry[]`: `kind`, `title`, `detail`, `eventId`, `eventName`, `to`, `actionLabel`
    ("Review"/"Renew"), plus `accessRequestId` / `count` / `daysLeft` where relevant. Kinds: `access-request`,
    `guest-uploads`, `event-expiring` (≤ 14 days left, or expired ≤ 7 days ago), `face-data-expiring`. Approve or
    decline requests in place with `api.resolveAccessRequest(item.accessRequestId, true|false)`. Uploaders get a 403:
    treat as empty. `needsYouTarget(item)` gives the link for a raw item.
  - `useGuestsAttention(eventId)` → number for the Guests badge.
  - `useWalletBalance()` → `WalletBalance` (owner only). **The money word is "wallet"**: show `balance` as "Wallet"
    (Sell "In your wallet", Plan "Wallet"); cap Withdraw at `withdrawable`; `prepaid` is what packs, renewals and AI
    enhance spend (402 `insufficient_credits` → "Add money to your wallet"). Never derive it from `ledger[0].balance`
    and never say "credits" in copy (`Usage.walletCredits` equals `prepaid`, kept for compatibility).
  - `useRefundOrder()` (Agent D): ask first with `<ConfirmDialog danger title="Refund ₹1,199 to Priya?"
    confirmLabel="Refund ₹1,199" onConfirm={() => refund.mutateAsync({ orderId, reason })}>` plus a "Reason (she sees
    this)" field as children. The success toast is built in; 409 `order_not_refundable` (already refunded, pending, or
    paid directly abroad) shows the server's words. Refundable when `order.status` is `paid` or `printing`; refunded
    orders carry `refundedAt` and `refundReason`.

### API contract v4 (`FramelineApi`, mock, `createHttpApi`, apps/api; usable by a native client too)
| Method | HTTP | Role | Notes |
|---|---|---|---|
| `getWallet()` | `GET /v1/wallet` | owner | `{ balance, withdrawable, prepaid, earnings, currency: 'INR', asOf }` in rupees |
| `listNeedsYou()` | `GET /v1/needs-you` → `{ items }` | editor+ | built by `buildNeedsYou()` in `@frameline/shared` (same logic in mock and API) |
| `refundOrder(id, reason)` | `POST /v1/orders/:id/refund` `{ reason }` + `Idempotency-Key` | owner | ledger `refund` line (−share), status `refunded`; real Razorpay refund when keys and a payment ref exist, else simulated; 409 `order_not_refundable` (`problem.orderStatus`), 503 `payment_provider_error` |

Shared constants: `NEEDS_YOU_EXPIRY_DAYS` (14), `EXPIRY_GRACE_DAYS` (7), `FACE_RETENTION_DAYS` (45; C: import this
instead of the copy in `home/stats.ts`). D1 migration `0003_contract_v4.sql` adds `orders.refunded_at` and
`orders.refund_reason`. Tests: `apps/api/test/contract-v4.test.ts`.

### Routes (done)
New paths point at the old pages until stage 2 replaces them: `/sell` → old Store (`/sell?tab=payouts` → old Wallet),
`/sell/settings/:tab` → old StoreSettings, `/messages` → Broadcasts, `/watermark` → Watermarks. Old paths redirect
(`/store`, `/store/settings`, `/wallet`, `/broadcasts`, `/watermarks`); `/website` is a 404 while `FEATURES.website` is
off. Lazy loading is kept; `AppShell collapsed` mode is gone.

### API contract v5 (stage-2 gaps closed; `FramelineApi`, mock, `createHttpApi`, apps/api)
All mutations below send an `Idempotency-Key` from the HTTP client; lists stay cursor-paginated; errors are problem+json
with stable `code`s; media URLs are absolute. Rules shared by the mock and the API live in `@frameline/shared/rules.ts`
(`TRASH_DAYS` 30, `GST_RATE`, `effectivePrices`, `watermarkAnchor`, `handleProblem`, `simulatePayoutCheck`,
`selfieHasNoFace`, `addRotation`). D1 migration `0004_contract_v5.sql`. Tests: `apps/api/test/contract-v5.test.ts`
(API) and `apps/api/test/mock-v5.test.ts` (mock).

| Method | HTTP | Role | Notes |
|---|---|---|---|
| `deletePhotos(ids)` | `POST /v1/photos/bulk-delete` | editor | now a **soft delete** (`Photo.deletedAt`); hidden everywhere, purged by the daily cron after 30 days |
| `restorePhotos(ids)` | `POST /v1/photos/restore` `{ ids }` → `{ restored }` | editor | Undo for trash |
| `deleteAlbum(id)` / `restoreAlbum(id)` | `DELETE /v1/albums/:id` / `POST /v1/albums/:id/restore` → Album | editor | album + the photos trashed with it |
| `deleteQR` / `restoreQR(id)` | `DELETE /v1/qrs/:id` / `POST /v1/qrs/:id/restore` | editor | soft; a trashed QR's short link stops resolving |
| `deleteBroadcast` / `restoreBroadcast(id)` | `DELETE /v1/broadcasts/:id` / `POST …/restore` | editor | soft; a trashed scheduled message isn't sent |
| `deleteEvent(id, { permanent })` | `DELETE /v1/events/:id?permanent=true` | editor | permanent only for events already in the trash (409 `not_in_trash`) — "Delete forever" |
| `rotatePhotos(ids, degrees)` | `POST /v1/photos/rotate` `{ ids, degrees }` → `{ updated }` | editor | multiples of 90; `Photo.rotation` 0/90/180/270 |
| `setPhotoReview(ids, status)` | `POST /v1/photos/review` | editor | status adds `'rejected'` (never shown to guests) |
| `listPhotos` / `listPhotoIds` `sort: 'newest'` | `?sort=newest` | uploader+ | capture time descending (cursor-safe) |
| `removeGuest(id)` / `restoreGuest(id)` | `DELETE /v1/guests/:id` / `POST /v1/guests/:id/restore` | editor | removed guests drop out of Guests and their guest token stops working (403 `guest_removed`) |
| `reopenAccessRequest(id)` | `POST /v1/access-requests/:id/reopen` → AccessRequest | editor | Undo for approve/decline (removes the guest approval added) |
| `getEventStats(id)` | `GET /v1/events/:id/stats` → EventStats | uploader+ | visits, photo views, downloads, favourites, guests, face searches, processing, face finding `{ ready, total, pending }` |
| `getStudioStats({ month })` | `GET /v1/studio/stats?month=YYYY-MM` → StudioStats | editor | this month / last month / all time (visits, downloads, face searches, photo views, photos delivered, sales, orders); daily counters in `event_daily_stats` |
| `updateOrder(id, { trackingNumber })` | `PATCH /v1/orders/:id` | owner | `''` clears it |
| `resendDownloadLink(id)` | `POST /v1/orders/:id/resend-link` → `{ sentTo, order }` | owner | emails the buyer (mailer; console in dev); 409 `order_not_deliverable`, 422 `no_buyer_email` |
| `verifyPayoutAccount()` | `POST /v1/store/payout/verify` → PayoutCheck | owner | also runs automatically when bank details change; result in `StoreSettings.payout.check` (`verified` / `name_mismatch` with `nameAtBank` / `failed`); deterministic simulation until a payout provider is wired |
| `changePlan(plan, { billing, payWith })` | `POST /v1/studio/plan` `{ planId, billing, payWith }` | owner | server-side GST + wallet debit in one call; `PlanChange` adds `gst`, `total`, `payWith`; purchase `method` 'credits' (= wallet) / 'card' / 'upi' |
| `checkHandle(handle)` | `GET /v1/studio/handle-check?handle=` → HandleCheck | any member | `invalid` / `reserved` / `taken` / `yours` |
| `recordPhotoViews(ids, shortId)` | `POST /v1/public/views` `{ photoIds }` | guest | per-photo `Photo.views` + daily stats |
| `requestNotify(shortId, phone)` / `cancelNotify` | `POST /v1/public/events/:shortId/notify` `{ phone }` / `POST …/notify/cancel` | guest | 409 `already_live`; when the first photos go live the API messages everyone waiting (simulated via mailer/log) |
| `registerGuest` | unchanged path | guest | `email` optional: name + email **or** phone |
| `searchFaces` / `matchFaceForLink` | unchanged paths | | input adds `faces?`, `image?: {width,height}`; result adds `faceFound` (`false` + `reason: 'no_face'` when there's no usable face) |

Type changes: `Photo` + `quality`, `views`, `rotation`, `deletedAt`, `reviewStatus` + `'rejected'`; `EventHost` + `access`
(`'full' | 'upload'`), `status` (`'invited' | 'accepted'`), `invitedAt`; `EventSettings` + `priceOverrides`,
`forSaleWatermark`; `Order` + `trackingNumber`, `linkSentAt`; `Camera` + `lastUploadAt`; `Studio.whatsapp`,
`PublicStudio.whatsapp` (always set: WhatsApp number or phone); `WatermarkSettings.position` + `'tc' | 'bc'`;
`StoreSettings.saleWatermark.template` + `'logo' | 'corner' | 'frame'`; `StoreSettings.payout.check`; `Album`,
`SmartQR`, `Broadcast` + `deletedAt`. Guest-facing prices (`listPublicPrices`, `createOrder`) apply the event's
`priceOverrides`. The mock syncs across tabs (`localStoragePersistence(key)` listens to the `storage` event).
