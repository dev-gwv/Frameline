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
| ~~`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`~~ | **Decided: not setting these.** Uploads proxy through the Worker (`storage.ts`'s `'proxy'` mode) rather than going direct-to-R2 with presigned URLs. Fine at our current scale; revisit only if upload throughput becomes a real bottleneck. | — |

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
  ArcFace (512-dim), the index must be recreated — Vectorize can't change dimensions in place, and every
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
