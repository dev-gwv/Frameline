# @frameline/api

Production backend for Frameline: **Hono on Cloudflare Workers**, D1 (Drizzle), R2, Queues, Durable Objects,
KV, Vectorize and the Workers Rate Limiting API. It implements every method of `FramelineApi`
(`packages/shared/src/api.ts`); `createHttpApi()` in `packages/shared/src/http.ts` is the matching client.

```
apps/api
├─ src/
│  ├─ index.ts            Worker entry: fetch (Hono app) + queue consumer; exports EventHub, RateLimiter DOs
│  ├─ app.ts              global middleware, /health, /v1 router, OpenAPI + docs, error handlers
│  ├─ env.ts              bindings, vars, secrets, per-request context types
│  ├─ routes/             one router per resource (auth, studio, events, photos, uploads, business, public, realtime)
│  ├─ middleware/         request-id, logger, auth/RBAC, rate-limit, idempotency, versioning
│  ├─ services/           sessions, provisioning, mailer, storage (R2 multipart), processor + queue, realtime, audit
│  ├─ do/                 EventHub (WebSocket fan-out), RateLimiter (sliding window)
│  ├─ db/                 Drizzle schema, row→contract mappers, seed SQL builder
│  ├─ schemas/domain.ts   zod mirrors of the shared types (validation + OpenAPI)
│  └─ lib/                errors (RFC 9457), JWT, crypto, pagination, ids, money
├─ migrations/            drizzle-kit generated SQL, applied by wrangler
├─ scripts/seed.ts        loads createSeed() into local D1
└─ test/                  vitest + @cloudflare/vitest-pool-workers (runs inside workerd)
```

## Commands

Run from the repo root with `pnpm --filter @frameline/api <script>` or inside `apps/api`:

| Script | What it does |
| --- | --- |
| `dev` | `wrangler dev` on http://127.0.0.1:8787 (local D1/R2/KV/Queues/DOs) |
| `db:migrate:local` | apply `migrations/` to local D1 |
| `db:seed` | apply migrations, then load the shared sample data (`createSeed()`) into local D1 (idempotent) |
| `db:reset:local` | wipe all rows, then seed again |
| `db:generate` | regenerate SQL migrations after editing `src/db/schema.ts` |
| `typecheck` | `tsc` for the Worker + tests, and for Node scripts/configs |
| `test` | vitest in workerd (migrations + a trimmed seed are applied per test file) |
| `deploy` | `wrangler deploy --minify` (use `--env production`) |

First run:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm --filter @frameline/api db:seed
pnpm --filter @frameline/api dev
# sign in: POST /v1/auth/otp/request {"email":"aarav@northlight.in"}; the code is in the dev log
# (and returned as `devCode` in development/test only)
```

Seeded users: `aarav@northlight.in` (owner), `meera@northlight.in` (editor), `kunal.shah@gmail.com`
(uploader, assigned to *Tessera Labs Offsite* only). API reference: http://127.0.0.1:8787/v1/docs.

## Configuration

`wrangler.jsonc` holds bindings and non-secret vars. Secrets go in `.dev.vars` locally (see
`.dev.vars.example`) and `wrangler secret put NAME --env production` in production.

| Name | Kind | Needed for |
| --- | --- | --- |
| `JWT_SECRET` | secret, **required** | access/guest/upload tokens; refresh-token hashing |
| `OTP_PEPPER` | secret, **required** | OTP code hashing |
| `RESEND_API_KEY`, `MAIL_FROM` | secret / var | sending sign-in codes and invites. Without a key: dev/test log the email; production refuses with 503 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secrets | Google sign-in (501 `not_configured` without them). Redirect URI: `{API_PUBLIC_URL}/v1/auth/google/callback` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | secrets | direct-to-R2 presigned part uploads. Without them uploads use the Worker proxy |
| `PROCESSOR_URL`, `PROCESSOR_TOKEN` | secrets | real image/face processing (simulated without them) |
| `RAZORPAY_*` | secrets | reserved for checkout/payouts (not used by v1 routes yet) |
| `CORS_ORIGINS` | var | comma-separated allowlist (admin 5173, gallery 5174, Expo web 8081/19006) |
| `APP_URL`, `GALLERY_URL`, `API_PUBLIC_URL`, `PUBLIC_MEDIA_BASE` | vars | links in emails, OAuth redirects, presigned proxy URLs, CDN base for media |
| `VECTORIZE_REMOTE` | var | set `1` in dev only when Vectorize runs as a remote binding |

Before the first deploy, create the resources and paste their ids into `wrangler.jsonc`:
`wrangler d1 create frameline`, `wrangler r2 bucket create frameline-media`, `wrangler kv namespace create KV`,
`wrangler queues create frameline-photos` (+ `frameline-photos-dlq`),
`wrangler vectorize create frameline-faces --dimensions=512 --metric=cosine`, then
`pnpm db:migrate:remote`. For browser uploads straight to R2, add a bucket CORS rule allowing `PUT` from the app
origins and **exposing `ETag`**.

## Architecture notes

- **Auth.** Passwordless email OTP: 6-digit code, stored as HMAC-SHA256(pepper, email+code), 10-minute expiry,
  5 wrong attempts burn the code, 30 s resend cooldown. Optional password (PBKDF2-SHA256, 100,000 iterations, the
  Workers maximum). Google OAuth authorization-code + PKCE with a state cookie and a single-use KV record.
  Sessions: 15-minute HS256 access JWT, and a 30-day refresh token (random 256-bit, stored hashed). Refresh
  tokens rotate on every use; presenting a rotated token revokes the whole family (theft detection). New emails
  get an account; pending team invites become memberships, and users with no studio get one.
- **RBAC.** `requireStudio(minRole)` loads the membership (`X-Studio-Id` header, else the first studio).
  owner > editor > uploader. Owners: billing (credits), payouts (orders, ledger), team. Editors: events,
  settings, albums/photos, tools, website, watermark. Uploaders: read and upload to their assigned events only.
  Other events return 404, so their ids don't leak.
- **Public gallery** (`/v1/public/**`): event landing by short id, PIN/registration → 12 h guest token,
  albums/photos (blocked while face privacy is on), selfie search (Vectorize, namespace = event id), access
  requests, studio enquiries.
- **Uploads.** `POST /v1/events/:id/uploads` reserves photo ids and opens R2 multipart uploads (10 MiB parts).
  With R2 keys, part URLs are S3 presigned (aws4fetch); otherwise they point at
  `PUT /v1/uploads/:uploadId/files/:photoId/parts/:n?token=…` which streams into R2 through the binding.
  `POST …/uploads/:uploadId/complete` completes the multipart uploads, inserts `processing` photos, updates
  counts/usage and enqueues one `process-photo` message per photo.
- **Processing.** The queue consumer calls a `PhotoProcessor`: `HttpProcessor` (PROCESSOR_URL) or
  `SimulatedProcessor` (dev). It stores faces in D1 and embeddings in Vectorize, marks photos `ready`, flips
  events from `uploading` to `live`, and publishes change topics. **TODO:** bind the Cloudflare Container
  (sharp + InsightFace ONNX) and add a `ContainerProcessor`; the interface is in `src/services/processor.ts`.
- **Realtime.** One `EventHub` Durable Object per studio (WebSocket hibernation). Every mutation publishes
  `{"topic": ChangeTopic}`. Connect to `GET /v1/realtime` with subprotocols `['frameline', 'bearer.<jwt>']`
  (or `?token=`), plus optional `?studio=`. Send `ping` to get `pong`.
- **Money** is stored as integer paise (`*_paise` columns) and returned in rupees, matching the shared types.
- **D1 limits.** At most 100 bound parameters per statement, so id lists are chunked by 80. Statements stay
  under 100 KB.

## Error format

Every error is `application/problem+json` (RFC 9457):

```json
{
  "type": "https://api.frameline.in/problems/validation_failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "Some fields are missing or invalid. Fix them and try again.",
  "code": "validation_failed",
  "requestId": "fd64fe25-d97e-49eb-905c-0bd5a43666fa",
  "instance": "/v1/events",
  "errors": [{ "field": "name", "in": "body", "message": "Give the event a name", "code": "too_small" }]
}
```

`AppError` subclasses: `BadRequest` 400, `Unauthorized` 401, `Forbidden` 403, `NotFound` 404, `Conflict` 409,
`PayloadTooLarge` 413, `UnsupportedMediaType` 415, `ValidationFailed` 422, `RateLimited` 429 (+`Retry-After`),
`NotConfigured` 501, `ServiceUnavailable` 503. Unknown errors become a generic 500. The message and stack are
shown only when `ENVIRONMENT=development`. Every response carries `X-Request-Id`: the inbound one is kept if it
is well-formed, otherwise one is generated.

## Conventions

- **Pagination.** Every list endpoint takes `?limit=` (1–200, default 50) and `?cursor=`, and returns
  `{ items, nextCursor }`. The cursor is an opaque keyset cursor (sort key + id). `GET …/photos` also returns
  `total` and accepts a legacy `offset`.
- **Idempotency.** POST create, upload and payment endpoints accept `Idempotency-Key` (8–255 chars). The first
  response is stored in D1 for 24 h, keyed by principal + method + path + key. A retry with the same body replays
  it with `Idempotent-Replayed: true`. A different body gets 422 `idempotency_key_reused`. A retry while the
  first request is still running gets 409. 5xx responses are not stored.
- **Body limits.** 1 MiB for JSON; 16 MiB for proxied upload parts.
- **Logging.** One JSON line per request: method, path, status, durationMs, requestId, userId, studioId, ip.

## Versioning policy

- Every resource lives under `/v1`. `/health` is unversioned. `GET /v1/meta` returns the API version and build.
- Within v1, changes are additive only: new endpoints, new optional fields, new enum values that clients must
  tolerate. Breaking changes ship as `/v2`, mounted next to v1.
- When v2 ships, v1 responses get `Deprecation` and `Sunset` headers plus `Link: rel="successor-version"` via
  `deprecate()` in `src/middleware/versioning.ts`. v1 stays up for at least 6 months after the deprecation date.
- `API-Version` is sent on every versioned response.

## Rate limits

| Bucket | Limit | Key | Store |
| --- | --- | --- | --- |
| global | 300 / min | IP | `RL_GLOBAL` binding, else DO |
| OTP request | 5 / 15 min | IP **and** email | RateLimiter DO |
| OTP verify, password login, set password | 10 / 15 min | IP **and** email | RateLimiter DO |
| OTP resend cooldown | 1 / 30 s | email | D1 |
| refresh | 60 / min | IP | RateLimiter DO |
| writes (non-GET) | 120 / min | user (else IP) | `RL_WRITE` binding, else DO |
| public gallery | 120 / min | IP | `RL_PUBLIC` binding, else DO |
| gallery PIN | 10 / 15 min | IP + gallery | RateLimiter DO |

A 429 is a problem document with `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
and `RateLimit-Policy`. Successful responses carry the same `RateLimit-*` headers for the tightest bucket that
applied. The Workers binding only supports 10 s or 60 s periods, so longer windows always use the sliding-window
`RateLimiter` Durable Object, which also runs under `wrangler dev`.

## Endpoints

`GET /v1/openapi.json` has the full list; `/v1/docs` renders it with Scalar. Summary:

- **Meta:** `GET /health`, `GET /v1/meta`, `GET /v1/openapi.json`, `GET /v1/docs`
- **Auth:** `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify`, `POST /v1/auth/password/login`,
  `POST /v1/auth/password`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `GET /v1/auth/google/start`,
  `GET /v1/auth/google/callback`
- **Account/studio:** `GET|PATCH /v1/me`, `GET|PATCH /v1/studio`, `GET /v1/studio/usage`,
  `POST /v1/studio/credits`, `GET|PATCH /v1/watermark`, `GET|PATCH /v1/website`, `GET /v1/team`,
  `POST /v1/team/invites`
- **Events:** `GET|POST /v1/events`, `GET|PATCH|DELETE /v1/events/:id` (id or short id),
  `PATCH /v1/events/:id/settings`, `POST /v1/events/:id/pin/reset`, `PUT /v1/events/:id/cover`
- **Albums:** `GET|POST /v1/events/:id/albums`, `PUT /v1/events/:id/albums/order`, `PATCH|DELETE /v1/albums/:id`
- **Photos:** `GET /v1/events/:id/photos` (albumId, sort, filter, personId, cursor), `GET /v1/photos/:id`,
  `PATCH /v1/photos` (bulk), `POST /v1/photos/bulk-delete`
- **Uploads:** `POST /v1/events/:id/uploads`, `PUT /v1/uploads/:uploadId/files/:photoId/parts/:n`,
  `POST /v1/events/:id/uploads/:uploadId/complete`, `GET /v1/media/*` (dev media)
- **People/films/guests:** `GET /v1/events/:id/people`, `GET|POST /v1/events/:id/films`, `DELETE /v1/films/:id`,
  `GET /v1/events/:id/guests`, `GET /v1/events/:id/access-requests`, `POST /v1/access-requests/:id/resolve`
- **Business:** `GET /v1/activity`, `GET /v1/orders`, `GET /v1/ledger`, `GET /v1/prices`
- **Tools:** `GET|POST /v1/cameras`, `GET|POST /v1/qrs`, `PATCH /v1/qrs/:id`, `GET|POST /v1/broadcasts`,
  `GET|POST /v1/tickets`, `POST /v1/tickets/:id/messages`, `GET /v1/enquiries`
- **Realtime:** `GET /v1/realtime` (WebSocket)
- **Public:** `GET /v1/public/events/:shortId`, `POST …/access`, `GET …/albums`, `GET …/photos`,
  `POST …/selfie`, `POST …/access-requests`, `POST /v1/public/studios/:handle/enquiries`
