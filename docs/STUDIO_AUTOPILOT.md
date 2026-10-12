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

**Contradictions to fix in the docs**
- Vector size: 512 in the api README and `processor.ts:14`, versus 128 (correct).
- Upload mode: "decided: proxy" versus direct-to-R2 being enabled.
- The api README calls the Razorpay webhook a TODO, but it is built.
- The processor README says selfie search works. It doesn't.
- Node version: 25 in BUILD_BRIEF, 22 in the README and CI.
- The root README omits `apps/processor` and `packages/faces`.
- `STUDIOAUTOPILOT_SECRET` is missing from DEPLOYMENT.md's secrets table.
