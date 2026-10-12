# Studio AutoPilot integration

Frameline is the gallery add-on of **Studio AutoPilot**, the studio-management app
(repo IPC-Studios/platform, live at studioautopilot.in). The two apps stay separate.
They are joined by single sign-in and one gallery per project, and are never
merged. Billing stays Frameline's own: a studio pays for the add-on from its
Frameline wallet.

Live and connected since 12 Oct 2026. Frameline build `73229fd`, Studio AutoPilot
`43785e9`. The shared secret was verified from the live API: a signed pass was
accepted.

## How it works

| Piece | Frameline | Studio AutoPilot |
|---|---|---|
| Shared secret | `STUDIOAUTOPILOT_SECRET` (Cloudflare secret) | `FRAMELINE_SECRET` + `FRAMELINE_API_URL` (VPS `.env`) |
| Token | Checked by `apps/api/src/lib/partner-token.ts`. HS256, `iss: studioautopilot`, `aud: frameline`, at most 5 min, single-use (jti spent in KV) | Signed by `services/api/src/lib/frameline.ts`. One-minute lifetime, a fresh jti every call |
| Sign-in | `GET /v1/integrations/studioautopilot/sso?token=`. Redirects to the admin app's `/auth/callback?from=/events/<id>#tokens` (the same hand-over as Google sign-in). Failures go to `/login?error=sa_*` | **Open gallery** on a project: the browser window is opened at the press, then the link is fetched |
| Gallery per project | `POST /v1/integrations/studioautopilot/events` (idempotent per project; a trashed event is replaced). `GET .../events/:projectId` | **Create gallery**. Link and PIN kept in `project_galleries` (0261) and shown on the client's tracking page |
| Id mapping | `partner_links` (0006): company→studio, user→user, `<company>:<project>`→event | Sends user id, company id/name, `isOwner`, `email_verified` |

Rules that matter:
- **A person is matched by their Studio AutoPilot id**, and by email only when
  `email_verified` is true. Studio AutoPilot team logins can carry any email, so
  an email match would hand a stranger's account over. Unverified people get a
  `sa-<id>@users.studioautopilot.invalid` address.
- **Only the company's owner sets the studio up** (the wallet is theirs). Everyone
  after the owner joins as an **editor**. An owner's existing Frameline studio is
  kept, not duplicated.
- **Galleries made from Studio AutoPilot** use the private-family preset with
  `SA_GALLERY` = face privacy **off** and downloads **all**, plus PIN and
  registration. With selfie search not running, 'own' downloads would let nobody
  download. Turn these back on per event once selfie search works.

## Outstanding (Frameline as a whole)

Known when the integration shipped:
- **Selfie search does not work in production.** The processor
  (`apps/processor`) is not deployed, and `apps/gallery/src/components/SelfieFlow.tsx`
  sends no embedding. Face clustering into people is not built either.
- **Simulated without keys or never built:** Razorpay checkout (simulated as
  paid), payouts and the ₹1 bank check, Google Drive import, camera FTP sync
  (no SFTPGo hook), AI enhance. Notify-me SMS/WhatsApp is only a log line.
  Broadcasts are stored and never sent. ZIP "downloads" are a link manifest, not
  a ZIP.
- **Support tickets are write-only:** nobody can answer them.
- **Smart QR** has no public short-link redirect. The website builder is behind
  `FEATURES.website = false`.
- **Media is served unauthenticated by key** (`GET /v1/media/*`).
- **Docs disagree on the Vectorize dimension:** 512 in `apps/api/README.md`, 128
  in `wrangler.jsonc` and `DEPLOYMENT.md`. 128 (SFace) is correct.
- **The mobile app is paused.** CI typechecks it as advisory only.

### Docs-against-code review (12 Oct 2026)

**Launch blockers**
- **The admin's production build has no `VITE_GALLERY_URL`.** Share links, QR codes
  and messages made inside Frameline's admin point to `http://localhost:5174`
  (`apps/admin/src/lib/url.tsx:6`, `pages/workspace/lib.ts:6`; `deploy.yml` sets only
  `VITE_API_URL`). Links made through Studio AutoPilot are fine: they come from
  the API's `GALLERY_URL`.
- **Email sign-in needs `RESEND_API_KEY`.** Without it, OTP, team and host
  invites, ZIP and order emails fail with 503 (`services/mailer.ts:38-49`), and
  seeded users have no password. Sign-in through Studio AutoPilot and Google
  (configured) still works. Check whether the key is set in Cloudflare.
- **Studio purchases are never charged:** plans, adding money, renewals and packs
  by card or UPI are recorded as paid without Razorpay (`routes/account.ts:94`,
  `routes/studio.ts:133`, `routes/events.ts:439,450,557`). Guest checkout also
  needs `VITE_RAZORPAY_KEY` in the gallery build (`deploy.yml` doesn't set it).
- **The sample studio is still seeded in production** (DEPLOYMENT.md "Going to
  real data").

**Links that lead nowhere**
- Smart QR `frameline.in/q/<slug>` has no redirect route.
- `GALLERY_URL/renew/<id>` has no page or checkout.
- The follow link `/follow/<code>` doesn't match the gallery's `/studio/:followCode`,
  and `/app?code=` has no route.
- No real domain yet, but `frameline.in` is hard-coded in QR posters, the FTP
  host, follow links, terms and `MAIL_FROM`.
- Production sets no `API_PUBLIC_URL` / `PUBLIC_MEDIA_BASE`, so ZIP emails carry a
  relative link.

**Face pipeline**, in the order `apps/processor/README.md` gives:
1. Clustering into people. Real faces have no `personId`, so People, face
   privacy and "own" downloads can't work.
2. Selfie matching in the browser. The gallery sends no embedding.
3. Renditions (2048/3072), watermark burn-in and AI enhance. Download renditions
   404, and AI enhance still takes ₹8 from the wallet.
4. EXIF and capture time.

Also: the processor isn't deployed, nothing in CI builds it, and the Cloudflare
Container plan in `services/processor.ts` is stale.

**Never sent:** broadcasts (the cron only stamps `sent_at`). SMS/WhatsApp are log
lines. The "payment and invoice emails always go out" setting has no email
code behind it.

### Code review (12 Oct 2026): holes, not just gaps

**Money (launch blockers)**
- `POST /v1/studio/credits` adds up to ₹10 lakh to the wallet with no payment
  (`routes/studio.ts:122-138`).
- Plan changes, renewals and packs paid "by card/UPI" are never charged, even
  with Razorpay keys (`account.ts:123-129`, `events.ts:448-450,556-558`).
- Store orders are `paid` without keys (`public.ts:711-733`). The `international`
  method is always `paid-direct`: it unlocks the photos and credits the
  payout balance, even with keys and even if the studio never enabled it.
- The production gallery shows its own card/CVC form ("Test payments"), because CI
  never sets `VITE_RAZORPAY_KEY`.
- Payouts are a ledger line and the ₹1 bank check is simulated. Refunds are
  simulated without keys. The trial (`validTill`) is never enforced, and photo
  packs raise a limit nothing checks.

**Privacy and access (launch blockers)**
- **`POST /public/events/:id/pin`** checks the PIN only for `link-pin` galleries;
  on `link` galleries any PIN returns a see-all session, which defeats face
  privacy (`public.ts:164-165`).
- **Originals are public** at `/v1/media/*` with a one-year public cache. A photo
  hidden or trashed later stays fetchable. The "for sale" watermark is a
  browser overlay over the original. There is no `PUBLIC_MEDIA_BASE`/CDN, so
  every image streams through the Worker.
- **`GET /public/zips/:id`** needs no auth and skips the hidden/review checks. The
  "ZIP" is a list of links.
- **Guest `/register`** matches existing guests by email or phone without
  verification and hands over their session; with `/me/orders` matching by
  email, someone else's paid orders can be read. Guests also choose the
  `personId` and the selfie `minScore`.

**Breaks at real events**
- Rate limits are 300/min per IP and 120/min for public routes, and every image
  goes through the Worker, so guests on shared venue Wi-Fi are blocked in
  seconds.
- Without `PROCESSOR_URL`, production silently simulates processing.
- There is no `failed` status or dead-letter consumer: HEIC, video or corrupt
  files stay `processing` forever.
- The processor ignores EXIF rotation, so portrait shots are scanned sideways.
- Single-photo download 404s because nothing writes renditions.
- "Download all" is one browser download per photo.

**Other**
- **Smart QR** slugs are unique only per studio, have no resolver, and the scan
  count is never incremented.
- **Google Drive import** creates fake `DRV_*.JPG` rows that use up quota.
- **Studio dates are frozen** at `DEMO_NOW` 26 Sep 2026 (`packages/shared/src/format.ts:47`).
- **KYC documents** are never reviewed.
- **No sample-data fallback guard:** a build without `VITE_API_URL` silently runs on
  sample data.
- **Tests:** none for the frontends, the processor or `packages/faces`. API tests
  never exercise the real processor.

**Suggested order:**
1. Lock the money paths.
2. Always verify the PIN.
3. Serve renditions behind a CDN, not originals; hidden photos unreachable.
4. Make selfie search real, or keep it off.
5. No silent simulated processor in production; add a `failed` status and a
   dead-letter consumer.
6. Rate limits keyed by guest or device.
7. Real ZIP with auth and visibility checks.
8. QR resolver with unique slugs; disable Drive import.
9. Real clock, the Razorpay key in CI, guest verification, plan expiry.
10. The four launch blockers from the docs review above.

### Fix progress
The findings above describe the code as it was on 12 Oct 2026. These are fixed since then:

**Batch 1, money (`4d1f545`)**
- Plans, adding money, renewals and packs go through `services/payments.ts`.
  - With Razorpay keys, they open a `studio_payments` row and return 202 `{ payment }`.
  - The purchase is granted only by `POST /studio/payments/:id/confirm` (Checkout signature) or the webhook (amount checked). Both use compare-and-set, so each grants once.
  - Without keys, they're simulated only in development and test; elsewhere they return 503 `payments_not_configured`.
- International orders need `storeSettings.international.enabled` and start as `pending`. The studio marks them received with `POST /orders/:id/received`; that never touches the payout balance.
- The gallery shows its card form only in the demo. The admin and gallery production builds refuse to run on sample data without `VITE_ALLOW_SAMPLE_DATA=1`.

**Batch 2, privacy (`6d0542c`)**
- The PIN is always checked.
- `/v1/media/*` serves an original publicly only while a guest could see it. Everything else needs a signature, which `lib/media-sign.ts` adds to studio photo URLs and which lasts 24 hours.
- `/register` reuses a guest only for that guest's own session token, and `/me/orders` matches by guest id.
- ZIPs and the cover respect visibility. The selfie `minScore` is at least 0.5, and "own" downloads check the `personId`.

**Batch 3, links and settings**
- Rate limits:
  - Public gallery routes allow 300 a minute, keyed by guest token, then the `x-guest-device` header, then IP.
  - The global limit is 1200 a minute and skips `GET /v1/media/*`.
- `deploy.yml` sets `VITE_GALLERY_URL` for the admin build, from the repo variable `GALLERY_URL` or the Pages URL.
- `wrangler.jsonc` sets `API_PUBLIC_URL` in production.
- `DEMO_NOW` is the real clock.
- `FEATURES.driveImport`, `aiEnhance`, `cameraSync` and `broadcasts` are off. Their admin entry points are hidden, and `POST /photos/:id/enhance` returns 503 `feature_unavailable` before touching the wallet. The code stays in place; turn a flag back on once the feature is real.

**Batch 4, links that lead nowhere**
- Smart QR:
  - `GET /v1/public/q/:slug` resolves a QR to its event and counts the scan.
  - Slugs are unique across all studios (migration `0008`; slugs already shared by two studios get a suffix).
  - The admin encodes `GALLERY_URL/q/<slug>`, and the gallery's `/q/:slug` page follows it.
- Renewal links: `GET /v1/public/renewals/:id`, `POST …/pay` (202 with a Razorpay checkout, or simulated in development and test) and `POST …/confirm`. The webhook settles them too, since they ride on `studio_payments` with `payload.linkId`. The gallery's `/renew/:id` page takes the payment. The studio's purchase list shows "(paid by your client)".
- The gallery now has `/follow/:code`, `/f/:code` and `/app?code=`. The admin's follow and app links use `GALLERY_URL` instead of `frameline.in`.

**Batch 5, limits**
- Studio uploads stop at the event's `photoLimit` (402 `event_limit_reached`); photo packs raise it.
- A lapsed plan or trial blocks new uploads (402 `plan_expired`) only while Razorpay is live. Without payments a studio couldn't renew, so nothing is enforced. Galleries stay open either way.

**Batch 6, processing**
- New photo status `failed`: the processor's 422 (a file it can't decode) or the 5th failed attempt sets it. The admin grid shows "Couldn't process", and guests never see the photo.
- Photos registered by URL skip the HTTP processor.
- Without `PROCESSOR_URL`, production logs `processor_not_configured` and `GET /health` reports `processor: simulated`, so it is no longer silent.
- The processor:
  - turns photos upright from EXIF before finding faces;
  - writes `renditions/2048.jpg` and `3072.jpg`;
  - answers 422 for files it can't decode.
- Downloads use a rendition only when no watermark applies. Otherwise the gallery burns the watermark in itself.
- Still open here: deploying the processor (needs the owner), EXIF capture time and camera, watermark burn-in, face clustering, selfie embeddings in the browser.

**Batch 7, a real ZIP**
- `GET /v1/public/zips/:id/download` streams a real ZIP (`lib/zip.ts`): stored entries, CRC computed on the fly, plain ZIP up to 65,535 files and 4 GiB. The "ready" email links there. The JSON list at `/zips/:id` stays.
- `zip_requests.requested_by` (migration `0009`):
  - A studio export holds the originals.
  - A guest ZIP follows the gallery: the 3072 rendition or original when full size is allowed, otherwise the 2048 rendition or a web-quality upload.
- A ZIP can't carry a watermark. When downloads are watermarked, guest ZIPs are refused (409 `watermark_required`, also re-checked at download), and the gallery offers only "Save one by one", which burns the watermark in. Before this, the "ZIP" handed out clean originals.

**Batch 8, receipts and docs**
- Paid orders email the buyer a signed receipt link: `GALLERY_URL/<code>/orders?receipt=<orderId>.<hmac>`.
  - Sent on every path to paid: simulated, confirm, webhook, and a direct payment marked received.
  - `GET /v1/public/receipts/:token` returns the order.
  - The gallery remembers the receipt on that device, lists the order under "Your orders" and unlocks its photos.
- Docs contradictions fixed:
  - 128-dimension vectors;
  - the webhook is built;
  - selfie search doesn't work yet;
  - Node 22;
  - the root README lists `processor` and `faces`;
  - DEPLOYMENT.md lists `STUDIOAUTOPILOT_SECRET` and `PROCESSOR_URL`;
  - the upload mode reads as optional.

**Batch 9, faces and EXIF (`fe9bc9d`)**
- The processor reads capture time, camera, lens and exposure from EXIF (`apps/processor/src/exif.ts`).
- Faces are clustered into people (`services/clustering.ts`): a new face joins the closest earlier face's person at cosine ≥ 0.42, checking this queue batch in memory and then Vectorize; otherwise it starts a new unnamed person. Photo counts are recounted per batch.

**Batch 10, watermarks burned in on the server**
- New processor endpoint `POST /render`: upright, turned by the studio's rotation, resized, watermark burned in (an SVG overlay matching the gallery's canvas layout).
- `services/renditions.ts`:
  - `watermarkFor` is the gallery's watermark rule;
  - `downloadFile` returns the stored rendition when the file is plain and unrotated, otherwise a fresh render from the processor.
- Single downloads and guest ZIPs use it, so watermarked galleries get ZIPs again whenever a processor is connected. Without one: 409 `watermark_required`, and the gallery switches to saving one by one.

**Still open:**
- Guest email verification for "registered" galleries. Batch 2 already removed the session takeover, so a typed email can't reach anyone else's photos or orders; what's left is that the email isn't proven.
- Browser selfie embeddings (needs the face models hosted somewhere the gallery can load them).
- KYC review, and support tickets nobody can answer.

**Needs the owner:**
- Razorpay keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`). The browser gets the key from each checkout, so `VITE_RAZORPAY_KEY` isn't needed.
- `RESEND_API_KEY`: sign-in codes, ZIP and receipt emails.
- Removing the production sample studio.
- Hosting the processor (`PROCESSOR_URL` / `PROCESSOR_TOKEN`).
- A real domain or CDN (`PUBLIC_MEDIA_BASE`, plus a repo variable `GALLERY_URL` once the gallery has its own domain).
