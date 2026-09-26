# Frameline build brief (read fully before coding)

Frameline is a photo-delivery platform for event photographers (a better Kamero). The approved design is
`docs/design/frameline-design.html`: open it and read the JS `add({id:'<screen>', ... render: ..., notes: ...})`
block for each screen you own. The `render` HTML is the visual spec (layout, copy, hierarchy); `notes.u` lists
UX decisions and `notes.r` lists reference-app features that MUST exist. The `F` array (Feature coverage) lists every
feature and the screen it belongs to — every row pointing at your screens must work. Also read `docs/KAMERO_ANALYSIS.md`.

## Monorepo
- pnpm workspace (`node-linker=hoisted`), Turborepo. Node 25, pnpm 8. Do NOT run `pnpm install` unless you add
  dependencies to your own app; if you must, run it at the repo root and say so in your report.
- `packages/shared` — pure TS: `types.ts` (domain model), `seed.ts` (sample data), `api.ts` (`FramelineApi`
  contract + `createMockApi`), `format.ts` (`fmt.*` helpers, `DEMO_NOW`), `tokens.ts` (design tokens).
- `packages/ui` — web React components (Tailwind v4 + Radix): Button, Chip, Card, CardHeader, DarkCard, Field, Input,
  Textarea, Select, Toggle, Segmented, TabBar, Meter, IconTile, Kbd, Avatar, Divider, StepBadge, Modal, Drawer,
  ConfirmDialog, Menu, Tip, ToastProvider/useToast, PhotoTile, CoverMosaic, Sparkline, StatCard, PageHeader, SettingRow,
  EmptyState, Skeleton, LogoMark, QRCode, EventStatusChip, cn. Read `packages/ui/src/*.tsx` before building.
- `apps/admin` — Vite + React 19 + React Router 7 + TanStack Query. Shell, routes, auth, upload queue already exist.

## Owned files — you may ONLY create/edit files you own
Shared files (`packages/*`, `apps/admin/src/lib/*`, `apps/admin/src/layout/*`, `routes.tsx`, `main.tsx`) are owned by
the lead. If you need something there, work around it locally (page-local helpers/hooks/state) and list the gap under
"Needs from lead" in your final report. Exception rules are stated in your task.

## Design rules (admin + gallery web)
- Tailwind tokens only: `bg-paper bg-surface bg-sunk text-ink text-ink-2 text-ink-3 border-line border-line-2
  bg-accent-soft text-accent-text bg-gold text-accent-ink bg-side text-side-ink text-side-ink-2 text-side-gold
  border-side-line bg-side-2 text-ok bg-ok-soft text-warn bg-warn-soft text-bad bg-bad-soft outline-marker`, fonts
  `font-display` (Fraunces headings, big numbers), `font-sans` (Manrope), `font-mono` (IDs, counts, money), `tnum`,
  `eyebrow`, `rounded-card rounded-control rounded-modal`, `shadow-card shadow-float`. Never hard-code UI colours
  (photo tones via `toneCss`/PhotoTile and brand-colour swatches are the only exceptions). Must look right in light
  AND dark (OS setting) — both come from tokens.
- Gold (`variant="primary"`, `bg-gold`) marks the ONE main action per screen and selection. Dark cards (`DarkCard`)
  for summary/premium callouts as in the design.
- Beginner-first: plain words, numbered steps where a sequence exists, advanced options folded under "More options",
  every icon-only button has `aria-label` + `Tip`.
- Responsive: must work at 390px wide with no horizontal page scroll (wide tables inside `overflow-x-auto`). Page
  padding: `px-4 sm:px-7`. Use `PageHeader` for page titles.
- States: loading (Skeleton), empty (EmptyState with a next action), error (`QueryError` from `apps/admin/src/pages/system.tsx`).
- Data: read via hooks in `apps/admin/src/lib/queries.ts`; write via `useApi()` + `useAction(fn, { success: 'Saved' })`
  (gives toasts on success/failure). Live updates arrive automatically (queries invalidate on change topics).
- Money/format: `fmt.rupees`, `fmt.count`, `fmt.date`, `fmt.ago(iso, DEMO_NOW)` from `@frameline/shared`.
- Never use `window.confirm/alert/prompt` — use `ConfirmDialog`/`Modal`. Real file downloads (CSV/SVG/PNG) via Blob + anchor.
- Interactions must actually work against the mock API (create, edit, delete, toggles persist). No dead buttons: if the
  backend part isn't possible yet, simulate it believably (e.g., "Report requested — we'll email you") and note it.
- Copy: active voice, name what happens ("Save changes" → toast "Saved"); errors say what went wrong and how to fix it.

## Verify before reporting
- `cd apps/admin && npx tsc -b` must pass with zero errors (other agents edit other pages concurrently; if an error is
  in a file you don't own, ignore it and mention it).
- Dev server: http://localhost:5173 is already running (auto-signed-in demo user). Don't start another on 5173.
- Final report: list screens/features done, anything simulated, and "Needs from lead".
