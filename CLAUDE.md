# Working in Frameline

Frameline is a Kamero-style event photo gallery for Indian wedding and event studios: the studio uploads, guests
open a link (+ PIN), browse, download and buy. It is also **Studio AutoPilot's gallery add-on** (the studio CRM at
studioautopilot.in, repo dev-gwv/platform, local `E:\BuildOurs\IPC Studios CRM`), joined by sign-in and links,
never merged. Billing stays Frameline's own (its wallet and plans).

Read this before changing anything. When the owner gives a standing instruction, add it here.

## Layout and commands

pnpm 8 monorepo (turbo). On the owner's Windows PC, put pnpm first: `$env:Path = "$env:APPDATA\npm;C:\Program Files\nodejs;" + $env:Path`.

| Path | What |
|---|---|
| `apps/api` | Cloudflare Worker (Hono + zod-openapi), D1 (drizzle), R2, KV, Queues, Vectorize, Durable Objects. `/v1/*` |
| `apps/admin` | Studio app (Vite + React), Cloudflare Pages `frameline-admin.pages.dev` |
| `apps/gallery` | Guest gallery (Vite + React), `frameline-gallery.pages.dev` |
| `apps/processor` | Node service for the VPS: face detection (YuNet) + embeddings (SFace), EXIF, download renditions, watermark burn-in |
| `apps/mobile` | Expo app, **paused** (CI typechecks it as advisory only) |
| `packages/shared` | Types, the in-browser **mock API** (sample data, `api.ts`), the HTTP client (`http.ts`), rules, help guides |
| `packages/ui`, `packages/faces` | UI kit; face math shared by processor and (later) the browser |

**The gate before every push** (what CI runs):
```
pnpm turbo run typecheck --filter=!@frameline/mobile
pnpm --filter @frameline/api test        # ~230 tests, vitest-pool-workers
cd apps/processor; pnpm typecheck; node --test test/*.test.ts
```
**Push straight to `master`** after the gate passes (the owner's rule; no branches or PRs). CI then deploys
(`.github/workflows/deploy.yml`): D1 migrations (`wrangler d1 migrations apply --remote`), the Worker, both Pages
sites. Check what is live: `https://frameline-api.dev-d9b.workers.dev/v1/meta` (`build` = commit sha, `features.ai`).

Migrations are drizzle-generated: edit `apps/api/src/db/schema.ts`, then `pnpm db:generate --name <name>` in
`apps/api` (keeps `migrations/meta` snapshots right). Hand-append data fixes to the generated SQL after a
`--> statement-breakpoint`.

Sample data: run admin/gallery without `VITE_API_URL` and they use the mock API (demo studio "Northlight",
sample sign-in = Continue with Google, code 123456). Production builds refuse to run on sample data.

## Hard-won gotchas

- **Files have CRLF line endings.** Scripted find-and-replace must match `\r\n`; the Edit tool copes.
- **Scripted edits lose backslashes.** Three times a `\s`, `\W` or `\/` vanished when an edit went through a
  shell heredoc or a JS string (`/^s*/`, `split(/W+/)`). Prefer the Edit tool for regex lines and re-read them.
- **The processor runs on Node's type stripping**: no TypeScript parameter properties (`constructor(readonly x)`),
  no enums. The API is bundled by wrangler and may use them.
- **Refresh tokens rotate.** A saved browser session (Playwright `storageState`) must be re-saved after every run,
  or the next run is signed out "for safety" (reuse detection).
- **Smart App Control** on the owner's PC (since 19 Oct 2026) blocks `git.exe`; node works. If git fails with "An
  Application Control policy has blocked this file", the owner has to switch Smart App Control off (Windows
  Security → App & browser control) or git must run elsewhere.
- **Both GitHub repos are public** (checked 17 Oct: dev-gwv/Frameline and dev-gwv/platform). No secret is in code or
  history; keep it that way: every key is a Cloudflare secret (`wrangler secret put NAME --env production`),
  never a file. The owner was asked to make both private.

## Studio AutoPilot integration (docs/STUDIO_AUTOPILOT.md has the detail)

- Shared secret: `STUDIOAUTOPILOT_SECRET` here = `FRAMELINE_SECRET` on the Studio AutoPilot VPS. HS256 tokens,
  single-use (jti spent in KV), at most 5 minutes.
- In: `GET /integrations/studioautopilot/sso` (Open gallery), `POST .../events` (Create gallery, idempotent per
  project), `GET .../events/:projectId`, `GET .../events` (all the company's galleries), `GET .../studio` (linked?,
  plan, wallet, photos used). People are matched by Studio AutoPilot id, by email only when `email_verified`.
  Only the company owner sets the studio up; others join as editors.
- Out: `services/partner-notify.ts` queues a "gallery changed" notice in KV (`sa-out:<event>`) on uploads, PIN and
  settings changes; the minute cron sends one per gallery to `STUDIOAUTOPILOT_WEBHOOK_URL`
  (`https://api.studioautopilot.in/webhooks/frameline`), photos after 2 quiet minutes. It says only which project;
  Studio AutoPilot reads the gallery back. Studio AutoPilot keeps a cached row (`project_galleries`, its 0261/0264)
  and rings "N photos are in the … gallery".
- Galleries made from Studio AutoPilot: private-family preset with face privacy **off** and downloads **all**.

## Switches

- `AI_FEATURES` (wrangler var, production **"off"** until the processor runs): `lib/features.ts`. While off, guests
  get `withoutAi()` settings (no selfie search, no face privacy, "own" downloads become "all"); stored settings are
  untouched. `GET /v1/meta` → `features.ai`; admin and gallery read it at run time (`useServerFeatures`) and hide
  face controls, the full-access PIN and selfie wording. Turning on: deploy the processor, set `PROCESSOR_URL` /
  `PROCESSOR_TOKEN`, set the var to "on".
- Payments: `GET /v1/meta` `features.payments` is true only with Razorpay keys (or simulated in dev/test). Off:
  admin hides selling, payouts, card/UPI and client renewal links; `effectiveSettings` turns `storeEnabled` off for
  guests. `features.seller` comes from `SELLER_*` vars; without it there are no invoice downloads.
- `FEATURES` (`packages/shared/src/features.ts`, compile time): aiEnhance, cameraSync, broadcasts,
  website, guestNotify, reminderEmails are all **off** (they were simulated, or nothing sends them). Help guides
  carry `needs` and are hidden for switched-off features.
- Google Drive (`/v1/meta` `features.drive`, `features.driveImport`): on only with GOOGLE_CLIENT_ID/SECRET +
  `DRIVE_TOKEN_KEY` (+ `GOOGLE_PICKER_API_KEY` for imports). Off: Settings → Google Drive, the import menu and the
  event "Full-size photos" card are hidden. See "Google Drive" below.
- Photos get a 2048 px web copy from the studio's browser at upload (`PUT /v1/photos/:id/web`, `photos.web_copy`,
  `Photo.webUrl`); show photos with `displayUrl(photo)`, download originals from `photo.url`.
- **Photo files open only with a signature** (24 Oct, `lib/media-sign.ts`): never hand out a bare `/v1/media/...`
  photo address. Studio routes use `studioPhotosOut`, guest routes `guestPhotosOut` (web copy only, the original
  only when the gallery offers full-size downloads; a guest signature dies when the photo is hidden). Previews are
  not watermarked (only downloads, drawn in the guest's browser); the Watermark page says so.
- `features.email` (`/v1/meta`): false without SMTP/Resend. Then the gallery offers no emailed ZIP, sign-in shows
  Google + password only, and team invites are saved with `emailSent: false`.
- `FEATURES.phoneApp` off: no "Get the app" page, no QR "opens in the app", "studio page" not "studio app".
- While payments are off: renewing a gallery is free, events hold 25,000 photos (0015), and a gallery stays open a
  year from creation even for a past date (0014, `galleryExpiry`). Big ZIPs come in parts (`services/zips.ts`).

## Google Drive (28 Oct; docs/GOOGLE_DRIVE_PLAN.md)

- **Scope `drive.file` only**, never `drive`/`drive.readonly` (restricted: yearly CASA audit). Connect is its own
  consent (`POST /v1/drive/connect`, owner), never at sign-in. One `drive_connections` row per studio; the refresh
  token is AES-GCM sealed with `DRIVE_TOKEN_KEY` (`lib/seal.ts`); access tokens cached in KV `drive:at:<studio>`.
  Google refusing the token marks the row `revoked` (UI asks to reconnect). `services/drive.ts`.
- **Import**: Google Picker in the admin → `POST /v1/drive/expand` (folder contents; Google may refuse to list a
  picked folder → `closedFolders`) → `POST /events/:id/drive-imports` → `drive-import` jobs on the photo queue
  (10 files each, `services/drive-import.ts`) copy into R2 and make normal photos (`source: drive`,
  `photos.drive_file_id`, never twice per event). Web copy = Drive thumbnail at `=s2048` when it works.
- **Originals in Drive** (`events.originals_in = 'drive'`): uploads get `mode: 'drive'` sessions; the browser PUTs to
  a Google resumable session URI (`putDrive` in http.ts), completion checks the file is in the album's folder.
  `photos.storage = 'drive'`: `r2Key` still names the would-be path so the web copy and signatures work; the
  original is read through `openOriginal()` (`services/originals.ts`), falling back to the web copy
  (`X-Frameline-Fallback: web-copy`). Processing uses the web copy (`webOnly`). Deleting in Frameline leaves Drive alone.
- New photo rows go through `addPhotos()` (`services/add-photos.ts`): uploads, imports and Drive uploads share it.
- Test page: `/drive-test.html` on the admin site (folder listing, thumbnail size, browser upload to Drive).
- **Drive is a main action, never only in a ⋯ menu** (owner, 29 Oct). Where it shows (all hidden while the server
  switch is off): event header "From Drive" next to Upload; empty event / empty album; Upload dialog; Home "Import
  from Drive" (`/?upload=drive` picks the event); first-run card + Getting started "Connect Google Drive"; event
  card menu; ⌘K; More menu (`withDrive` in nav.ts); New event "Keep full-size photos in Google Drive"
  (`originalsIn` on POST /events); event Settings "Google Drive" card (folder link, import); viewer "Open in
  Drive" (`Photo.driveFileId`/`originalInDrive`, studio only); a progress line above the grid while imports run.
  Connecting from the import window comes back to it (`startDriveConnect` / `takeDriveReturn`, `lib/drive.tsx`).

## PINs

- The **event PIN** only opens the gallery; with face privacy on, guests then see only their own photos.
- The optional **full-access PIN** (`settings.fullAccessPin`, `POST/DELETE /events/:id/full-pin`) is for the couple
  and family: every photo. Never sent to guests; never equal to the event PIN. Sample Riya/Mehta galleries use 8642.

## The processor (apps/processor) and the VPS

- VPS: Hostinger + Coolify, 4 vCPU / 16 GB / 193 GB, shared with Studio AutoPilot and other apps (~40 containers,
  load ~0.5). SSH key on the owner's PC; the server has a GitHub key `gh_deploy`. **Not installed yet** (no
  `/root/frameline`). Compose: `apps/processor/docker-compose.vps.yml` (2 CPUs, 3 GB cap, Traefik).
- Load limits: the photo queue has `max_concurrency: 2`; the processor's `Limiter` runs 2 photos at once with 20
  waiting (`PROCESSOR_MAX_JOBS`, `PROCESSOR_MAX_WAITING`), then answers 503 `{"error":"busy"}`; the API re-queues a
  busy photo as a fresh message (never spends its retries); other 503s count as an outage. 2-minute timeout per photo.
- Estimate (not yet measured): 1.5–3 CPU-s per 24 MP photo → ~2,500–4,500 photos/hour on 2 cores.
- Selfie search still needs the browser side (gallery `SelfieFlow` sends a placeholder; embeddings via
  onnxruntime-web reusing `packages/faces`).

## Email and the support desk

- **Email**: `services/smtp.ts` (Gmail / Workspace over cloudflare:sockets, App Password) when `SMTP_USER` +
  `SMTP_PASS` are set; else Resend (`RESEND_API_KEY`); else production refuses to send. Gmail limits ~500/day
  (personal), 2,000 (Workspace).
- **Book a call is the way to a person** (owner, 19 Oct; it replaced the 17 Oct Google Sheet + inbox, which are
  gone along with screenshot uploads and the morning summary -- never bring them back). `SUPPORT_CALL_URL` (wrangler
  var, the owner's booking page) → `/v1/meta` `features.supportCallUrl` → Help's first card. The booking app handles
  everything after the booking. Studio AutoPilot does the same with its own `support_call_url` (its 0272, 0273).
- **Ask a question** (Help): `services/support-ai.ts` answers each ticket from the help guides
  (`packages/shared/src/help.ts`, only features that are on) and the studio's facts; Groq (`SUPPORT_AI_API_KEY`)
  then NVIDIA NIM (`SUPPORT_AI_FALLBACK_API_KEY`); bugs, billing, account and malformed answers are handed over:
  `ai_state` human and the answer ends with `handOverLine()` (Book a call, else WhatsApp); the assistant then stays
  quiet on that ticket and the thread shows a Book a call button.
  - Help page shows a WhatsApp link only when `SUPPORT_WHATSAPP` is set (a made-up number used to be hard-coded).
  - Keep the help guides true: the assistant repeats them word for word.

## Launch status (17 Oct review)

Works live (checked as a studio and as a guest on a phone): Google sign-in, create event, upload (23 photos in
51 s), processing, share link/PIN/QR, guest PIN + registration + browse + viewer + watermarked download,
full-access PIN, Studio AutoPilot link. Ready for a pilot with friendly studios on the trial; not for a paid launch.

Before real studios: delete the production sample studio "Northlight Studio" (its galleries 6402F9F, 7A1C0B2 are
public, PIN 5211 is in this public repo) — needs the owner's yes; make sure email works (SMTP secrets).
Before charging: Razorpay keys; KYC/payouts for selling (keep selling off). Soon: a real domain, real Terms and
Privacy (guests give phone numbers), the support AI key.

**23 Oct: launching with AI off and no payments** (batch 11 in docs/STUDIO_AUTOPILOT.md). What isn't real is
hidden or says so: selling, payouts, card/UPI, invoices without a seller, "Notify me", reminder emails, face finding.

**Pending (owner):**
- Real company name, GSTIN and address for invoices: wrangler vars `SELLER_NAME`, `SELLER_GSTIN`, `SELLER_ADDRESS`
  (production vars in `apps/api/wrangler.jsonc`). Until then no invoice downloads.
- SMTP secrets (`SMTP_USER`, `SMTP_PASS`) so email really goes out.
- Razorpay keys. **Before adding them, extend trial studios' `valid_till`**: a lapsed trial is only enforced once
  payments are live, so every old trial would be locked out of uploads the moment the keys go in. Renewals stop
  being free at the same moment.
- Legal review of `apps/admin/public/terms.html` and `privacy.html` (both drafts; operator Grateful World Ventures
  (OPC) Private Limited, address and GSTIN still "to be added").
- A real domain.
- Make both GitHub repos private.
- Northlight sample studio stays for testing until launch, then delete it.
- Hosting the processor (then `AI_FEATURES` on).
- Google Drive: the Google Cloud setup and verification in docs/GOOGLE_DRIVE_PLAN.md (needs the real domain
  first), then the test page, then `GOOGLE_PICKER_API_KEY`, `GOOGLE_PROJECT_NUMBER` and the secret `DRIVE_TOKEN_KEY`.

Live test data: event "Frameline Test – Demo Wedding" (`ev_2iat4iwano8v`, gallery `B6F105B`, PIN 7883,
full-access 2378) in the owner's studio, with 23 screenshots and test guests. Delete when done.
The owner's signed-in account is for testing (29 Oct: "you can create test data in my signed in account"). Added
29 Oct: event "Claude QA - Sharma Wedding" (`ev_aqpsc2hzm4vx`, 6 photos, albums Photos + Haldi, host
qa-couple@example.com), guest "Claude Test Guest" (+91 90000 00001) on B6F105B with 2 approved guest photos,
Smart QR "QA studio front desk", team invite qa-shooter@example.com, support ticket "QA test: …".

## Session log

- 15–19 Oct 2026 (Claude, terminal on the owner's PC): screenshots for the studio demo (`E:\BuildOurs\_screenshots`),
  live testing, Support page 422 fix (`e3eb4d6`), full-access PIN (`2f0d9f2`), Studio AutoPilot reads + notices
  (`eef85ad`), AI switch (`9299785`, `2a50d19`), processor load limits (`7795314`), support desk + Gmail SMTP
  (`fdf51ed`), Book a call replaces the Sheet (19 Oct). Studio AutoPilot side: `6b7a02a` (galleries list, Settings → Gallery, photos bell, 0264).
- 24 Oct 2026: launch review (security, API, both apps). Fixed: guests could fetch every original unwatermarked,
  PIN lock could be raced, past-dated galleries opened expired, 10k event cap, ZIPs cut at 4 GB, email-less
  failures, unbounded guest uploads/SVG, studio "guest" quota bypass, app/selfie/WhatsApp copy. Still open (not
  asked yet): `_headers` CSP on both Pages sites, thumbnails smaller than 2048 px for grids, index on
  `photos.copied_from`, guest Terms link + consent line, KYC files served by URL, help `expiry` guide
  (renewal links), latent Razorpay international-order confirm check (before payments go live).
- 27–28 Oct 2026: Camtom audit (camtom.in keeps photos in the studio's own Drive; face matching on its own Google
  Cloud servers, not Google Photos), then Google Drive import + originals in Drive (migration 0016), off until the
  owner's Google setup. Note: `node_modules` links pointed at the old `E:\BuildOurs\Kamero-Clone` path; fixed with
  `pnpm install --frozen-lockfile --config.confirmModulesPurge=false` (CI=true).
- 29 Oct 2026: Drive made a main action (`00619df`), then a live test in Chrome. Fixed: studio profile couldn't be
  saved at all without a logo (`logoUrl: ""` was refused; now "" removes it) and demanded phone + city; no way to
  edit an event's city, last day or type (`endDate: ""` clears it); no way to change your own name (Settings → Your
  account, `PATCH /v1/me`); photo sizes invented as 6000 × 4000 while no processor runs (now read from the file,
  `imageSize`); share message offered an app that doesn't exist; "Add photos" packs offered while payments are
  off; trial date shown after it passed; Drive button overflowed the event header on phones. Still open: no
  personal profile photo (users have none in the DB); Home's "Watch" videos are YouTube searches, not real videos.
  Second pass the same day (live, with test data): approved guest photos never showed in the gallery while review
  was on (now the server counts only visible ones in Guest uploads); host and team invites said "Invite sent"
  with email off; "Buyers" event type and support "Phone app / Desktop uploader" offered things that don't exist;
  studio page preview ignored the logo and said nothing when every event has a PIN. Checked working: guest PIN,
  sign-up, browse, favourite, download, Download all, guest upload + review, albums, move, trash/restore, QR,
  reports. The support assistant hands everything to a person (no `SUPPORT_AI_API_KEY` yet).
