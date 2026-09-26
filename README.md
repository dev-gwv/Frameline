# Frameline

Photo delivery for event photographers: upload a shoot, share one link, and guests find their own photos with a
selfie. "Frameline" is a working name.

The approved product design lives in [`docs/design/frameline-design.html`](docs/design/frameline-design.html)
(open it in a browser: Screens, Feature coverage, UX & flows, Tech stack, Design system). The reference-app
analysis is in [`docs/KAMERO_ANALYSIS.md`](docs/KAMERO_ANALYSIS.md).

## Repository

```
apps/
  admin/     Photographer web app — React 19, Vite, React Router, TanStack Query, Tailwind v4   :5173
  gallery/   Guest web gallery (installable PWA) opened from share links and QR codes          :5174
  mobile/    Expo (React Native) app — guest mode and photographer mode
  api/       Backend — Hono on Cloudflare Workers, D1, R2, Queues, Durable Objects, Vectorize   :8787
packages/
  shared/    Domain types, design tokens, sample data, FramelineApi contract, mock + HTTP clients
  ui/        "Gilt" web design system (Radix + Tailwind): buttons, fields, modals, photo tiles…
docs/        Design, analysis, build brief
```

Every client talks to data through one contract, `FramelineApi` (`packages/shared/src/api.ts`):

- `createMockApi()` keeps the apps fully usable offline with realistic sample data (persisted locally).
- `createHttpApi()` talks to `apps/api` over `/v1` with auth refresh, retries and live updates.

Set `VITE_API_URL` (web) or `EXPO_PUBLIC_API_URL` (mobile) to switch from sample data to the real API.

## Run it

Requires Node 22+ and pnpm 8+.

```bash
pnpm install
pnpm dev:admin        # http://localhost:5173 — starts signed in as the demo studio in development
pnpm --filter @frameline/gallery dev   # http://localhost:5174/6402F9F — the sample wedding (PIN 5211)
pnpm dev:mobile       # Expo dev server; scan the QR with Expo Go or a dev build
pnpm --filter @frameline/api dev       # http://localhost:8787/v1/docs — API reference
```

### Against the real API (local Cloudflare stack)

```bash
pnpm --filter @frameline/api db:migrate:local
pnpm --filter @frameline/api db:reset:local        # loads the sample studio into local D1
pnpm dev:api                                        # http://localhost:8787 (docs at /v1/docs)
VITE_API_URL=http://localhost:8787 pnpm dev:admin   # sign in as aarav@northlight.in; the dev code is shown on screen
VITE_API_URL=http://localhost:8787 pnpm dev:gallery
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8787 pnpm dev:mobile
```

Secrets go in `apps/api/.dev.vars` (see `.dev.vars.example`). Without `RESEND_API_KEY` sign-in codes are shown
in development instead of emailed; without Razorpay keys payments are simulated as paid.

Useful checks:

```bash
pnpm typecheck
pnpm --filter @frameline/api test
```

Sample data: studio "Northlight Studio", 8 events (the Riya & Kabir wedding has 1,248 photos in 4 albums).
To reset it in the browser, clear the site's local storage.

## Design system

Warm ivory (light) and obsidian (dark) neutrals, an espresso sidebar, and gold reserved for the one main action on a
screen and for selected photos. Fraunces for headings, Manrope for the interface, JetBrains Mono for IDs, counts and
money. Tokens live in `packages/shared/src/tokens.ts` (mobile) and `packages/ui/src/styles.css` (web).
