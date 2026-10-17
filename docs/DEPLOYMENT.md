# Deployment

Frameline runs on Cloudflare: the API as a Worker, the admin app and guest gallery as Pages sites. Deployed 28
Sep 2026 to free Cloudflare subdomains (no custom domain yet — "Frameline" is still a placeholder name):

| App | URL | Cloudflare project |
|---|---|---|
| API | https://frameline-api.dev-d9b.workers.dev | Worker `frameline-api`, `env.production` |
| Admin | https://frameline-admin.pages.dev | Pages project `frameline-admin` |
| Gallery | https://frameline-gallery.pages.dev | Pages project `frameline-gallery` |

The production database is seeded with the same sample studio used locally (`aarav@northlight.in`, event
`6402F9F`) so the deployment is testable before real sign-ups exist. Wipe it with `db:reset` equivalent
against `--remote` once you're ready for real users (see "Going to real data" below).

## How deploys happen

- **`.github/workflows/ci.yml`** — every push and PR: `pnpm turbo run typecheck` (all packages except the
  paused mobile app, which typechecks separately and is advisory-only) and the API's vitest suite.
- **`.github/workflows/deploy.yml`** — after CI passes on `master`: applies any new D1 migrations, deploys the
  Worker, then builds and deploys both Pages sites. Also runnable by hand from the Actions tab
  ("Deploy" → "Run workflow") to redeploy without a new commit.

### One-time setup

Done — `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are set as repository secrets on
github.com/dev-gwv/Frameline (**Settings → Secrets and variables → Actions**). `deploy.yml` deploys for real
on every push to `master` from here on.

### Required Worker secrets (already set on `frameline-api`, `env.production`)

`JWT_SECRET` and `OTP_PEPPER` were generated and uploaded via `wrangler secret put … --env production` during
setup. They never need to be in GitHub Actions — they live only on the Worker. To rotate them:
`npx wrangler secret put JWT_SECRET --env production` (from `apps/api`).

### Optional secrets — set these when you're ready for the real thing

Nothing below is required for the app to run; each feature just simulates until its secret exists (all via
`wrangler secret put <NAME> --env production` from `apps/api`):

| Secret | Unlocks | Get it from |
|---|---|---|
| `RESEND_API_KEY` | Real sign-in emails (without it, `production` returns a clear "email sign-in isn't configured" error — there's no dev fallback outside `development`/`test`) | resend.com (has a free tier) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in | Google Cloud Console → OAuth consent screen + credentials |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Real payments (without them, orders simulate as paid) | razorpay.com |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | **Optional, not set today.** Without them uploads proxy through the Worker (`storage.ts`'s `'proxy'` mode); setting them switches browser uploads to direct-to-R2 presigned URLs (needs the bucket CORS rule below). Fine at our current scale. | Cloudflare R2 API tokens |
| `STUDIOAUTOPILOT_SECRET` | Studio AutoPilot single sign-on and gallery API (`docs/STUDIO_AUTOPILOT.md`); must equal `FRAMELINE_SECRET` on Studio AutoPilot's server | shared with Studio AutoPilot |
| `PROCESSOR_URL` / `PROCESSOR_TOKEN` | The image processor (`apps/processor`): face finding, EXIF rotation, download renditions. Without it photos go live with none of those (`GET /health` shows `processor: simulated`) | your processor deployment |

**This is the first step toward doing all of the above for real** — none of it is wired up yet, so sign-in by
email/Google, real payments and direct-to-R2 uploads still need those secrets added before they work outside
the simulated/dev behaviour.

## Provisioned Cloudflare resources

Created under the `dev@gratefulworldventures.in` account (id `d9b73b5a2afa3689965e35065b313604`):

- D1 database `frameline` (`32bf8f23-7594-4c5f-8e7a-51b5eed336a7`)
- R2 bucket `frameline-media`, with a **CORS policy** (`apps/api/r2-cors.json`, applied via
  `wrangler r2 bucket cors set frameline-media --file r2-cors.json`) allowing `PUT`/`GET`/`HEAD` from the admin
  and gallery origins (+ localhost dev ports), exposing `ETag`. This is required for direct-to-R2 presigned
  uploads (`uploadMode() === 's3'`, once `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` are set) — without it the
  browser's own CORS enforcement silently blocks every upload PUT before it reaches R2, which the client's
  `putPart()` then indistinguishably reports as "you're offline" (a bare `TypeError` from a blocked `fetch()`
  looks identical to a real network failure in JS). If the bucket is ever recreated, redo this step, or
  uploads will "go offline" the moment direct uploads are enabled again. Add a new Pages URL (a real domain
  later, say) to `allowed.origins` in `r2-cors.json` and re-run the same command.
- KV namespace `e672b1baa531411a90176fa35a293291`
- Queues `frameline-photos` + `frameline-photos-dlq`
- Vectorize index `frameline-faces` — **128 dimensions**, chosen to match the SFace face-embedding model
  planned for the VPS photo processor (see the project memory / `REDESIGN_BRIEF.md`). If that later moves to
  ArcFace (512-dim) instead of today's SFace (128-dim), the index must be recreated — Vectorize can't change dimensions in place, and every
  stored face vector would need reprocessing.
- Durable Objects `EventHub`, `RateLimiter` (deployed with the Worker)
- Pages projects `frameline-admin`, `frameline-gallery` (production branch `master`)

If the Cloudflare **dashboard** ever shows "No access" on the R2 page for this account, that's a dashboard
display quirk, not a real permissions problem — `wrangler` (using the same login) can create, list and use
the bucket fine via the API. Refreshing or re-opening the R2 page usually clears it.

## Going to a real domain

Once a domain is chosen and added to this Cloudflare account:

1. `apps/api/wrangler.jsonc` → `env.production`: add `"routes": [{ "pattern": "api.<domain>", "custom_domain": true }]`,
   and update `APP_URL` / `GALLERY_URL` / `CORS_ORIGINS` / add `API_PUBLIC_URL` and `PUBLIC_MEDIA_BASE` to the
   real URLs (see the commented-out shape this file had before — same idea, real domain instead of
   `frameline.in`).
2. Cloudflare Pages → each project → **Custom domains** → add `app.<domain>` / `<domain>` respectively (or do
   it with `wrangler pages domain add`).
3. Update `deploy.yml`'s `VITE_API_URL` fallback (or set the `API_URL` repo/environment **variable** in GitHub
   so you don't have to edit the workflow) to the new API domain.
4. Redeploy (push to `master`, or run the Deploy workflow by hand).

## Going to real data

The seeded sample studio (`Northlight Studio` / `aarav@northlight.in`) is meant only to prove the deployment
works end to end. Before real studios sign up, either accept that the sample studio will sit alongside real
ones (harmless, just tidy it up later) or clear it: `wrangler d1 execute DB --env production --remote
--command "DELETE FROM studios WHERE id = 'st_northlight'"` (cascades via foreign keys to its events, users,
etc. — check `apps/api/src/db/schema.ts` for the exact cascade behaviour before running this against real
data sitting alongside it).

## What's still simulated in production

Unchanged from local dev until the linked work is done: photo/face processing (needs the VPS processor — see
the project's saved plan for the Hostinger VPS), camera-sync FTP (same processor), and anything gated on the
optional secrets above.

## The AI switch (`AI_FEATURES`)

Face finding and selfie search ("Find my photos") need the image processor (`apps/processor`, `PROCESSOR_URL`).
Until it runs, production sets `AI_FEATURES: "off"` in `apps/api/wrangler.jsonc` (production vars). While off:

- every gallery behaves as if selfie search and face privacy were off, and "only photos they're in" downloads
  become "everything" (`withoutAi` in `packages/shared/src/rules.ts`, applied by `apps/api/src/lib/features.ts`);
  the event's stored settings are not changed, so turning AI on restores them;
- selfie search answers `face_search_disabled`, "Find faces again" answers 503 `feature_unavailable`;
- `GET /v1/meta` says `features.ai: false`, and the admin and gallery apps hide the selfie and face controls
  (Faces card, the full-access PIN, "Only photos they're in", selfie wording).

To turn AI on: deploy the processor, set `PROCESSOR_URL`/`PROCESSOR_TOKEN`, change the var to `"on"` and deploy
the API. No app release is needed; the apps read the switch at run time.

## Email over Gmail SMTP

Frameline sends sign-in codes, ZIP and receipt emails and the support emails through Gmail when these are set
(they take priority over `RESEND_API_KEY`). In Google: turn on 2-Step Verification for the sending account, then
Google Account → Security → App passwords → make one for "Frameline".

```
npx wrangler secret put SMTP_USER --env production   # the Gmail / Workspace address, e.g. support@yourdomain.in
npx wrangler secret put SMTP_PASS --env production   # the 16-character App Password (not the account password)
```

Optional: `SMTP_FROM` ("Frameline <alias@...>", a Send-mail-as alias the account owns), `SMTP_HOST` /
`SMTP_PORT` (default `smtp.gmail.com` / `465`). Limits: about 500 recipients a day on a personal Gmail, 2,000 on
Workspace. Code: `apps/api/src/services/smtp.ts`.

## The support desk

Help → Ask the team: the assistant answers first (`services/support-ai.ts`), and hands bugs, money, account
problems and anything it is unsure of to the team: a row in the support Google Sheet plus an email
(`services/support-desk.ts`). The team replies in the Sheet; the reply lands in the studio's ticket and inbox.
A morning email (08:30 India) lists what is still open.

1. The Sheet: follow the steps at the top of `docs/support-sheet.gs` (5 minutes). It gives the web app URL.
2. Secrets:
   ```
   npx wrangler secret put SUPPORT_AI_API_KEY --env production            # Groq API key (console.groq.com)
   npx wrangler secret put SUPPORT_AI_FALLBACK_API_KEY --env production   # optional: NVIDIA NIM key (build.nvidia.com)
   npx wrangler secret put SUPPORT_SHEET_URL --env production             # the Sheet's web app URL
   npx wrangler secret put SUPPORT_SHEET_SECRET --env production          # 24+ random characters, same as the Sheet's SECRET
   npx wrangler secret put SUPPORT_INBOX --env production                 # where team emails and the morning summary go
   npx wrangler secret put SUPPORT_WHATSAPP --env production              # optional: support's WhatsApp number for Help
   ```
   Models default to `llama-3.3-70b-versatile` (Groq) and `meta/llama-3.3-70b-instruct` (NIM); change with
   `SUPPORT_AI_MODEL` / `SUPPORT_AI_FALLBACK_MODEL`. With no AI key every ticket goes straight to the team.
3. Screenshots studios attach are kept in R2 under `support/` (never public); the Sheet row links them through a
   signed page that lasts 90 days.
