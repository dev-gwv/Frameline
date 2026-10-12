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

A full docs-against-code review was started on 12 Oct. Add its findings here
when it is redone.
