# Google Drive plan

Written 28 Oct 2026 for the owner. The client wants Camtom-style Google Drive support. Camtom
(camtom.in, privacy policy) is "a software layer on top of Google Drive": it signs the studio in with Google,
creates album folders in the studio's own Drive and uploads there. Its face matching runs on its own Google Cloud
servers, reading photos from Drive. Google Photos isn't involved. Its low price (₹1,299–1,999 a year) works because
the studio pays Google for storage.

## Status (30 Oct 2026): switched on in production

The client's Google Cloud project ("IPC Ads Automation", 946264784405) now holds the OAuth client for sign-in and
Drive, plus the Picker key. All keys are Cloudflare secrets. Still to do: restrict the Picker key, confirm the
consent screen is "In production", run `/drive-test.html`, and brand verification once the real domain exists.

## Status (28 Oct 2026): both phases built, switched off until Google is set up

Both phases below are built and tested against a fake Google (17 tests in `apps/api/test/drive.test.ts`). The
admin was also tried on sample data. Nothing has been tried against the real Google yet.

The server hides all of it until it has `DRIVE_TOKEN_KEY` and the Google keys (`/v1/meta` `features.drive`,
`features.driveImport`). To switch it on:

1. Do the Google Cloud setup and verification steps below. The real domain comes first.
2. Run the checks on `/drive-test.html` (admin site) with your own Google account. If the folder check says no,
   imports still work: studios open the folder in Google's window and select the photos. If the upload check
   (step B) says no, Drive uploads need the slower fallback through the Worker. That isn't built.
3. Set the keys: `GOOGLE_PICKER_API_KEY` and `GOOGLE_PROJECT_NUMBER` as wrangler vars, and
   `wrangler secret put DRIVE_TOKEN_KEY --env production` (32 random bytes, base64).
4. Try it live: connect Drive, import a 300-photo folder, then switch one event to keep originals in Drive and
   upload to it.

**Not built:**

- RAW import (RAW files are skipped and listed as skipped);
- video;
- moving existing photos into Drive;
- the Worker fallback for Drive uploads;
- watermarked full-size downloads of Drive photos, which render from the 2048 px web copy.

**Pricing:** Drive photos still count on the plan. That's the owner's call.

Two phases:

1. **Import from Google Drive.** The studio picks photos in Google's own file picker and Frameline copies them in.
   This replaces today's simulated import (`FEATURES.driveImport`, off because it made empty `DRV_*.JPG` rows).
2. **Keep originals in my Drive.** Per event, full-size files live in the studio's Drive. Frameline keeps only the
   2048 px web copy (R2) for viewing. Guests never touch Drive directly.

Face finding needs nothing Drive-specific in either phase. The processor reads the R2 web copy (phase 2) or the
imported original (phase 1). It still needs the processor hosted (`AI_FEATURES` on).

## Step 0: one Google permission, and a 2-day test first

**Scope: `https://www.googleapis.com/auth/drive.file` only.** Google classes it as *non-sensitive*. It covers files
the user picks in the Google Picker plus files Frameline creates. That is enough for both phases, and it avoids a
security audit.

Never ask for `drive.readonly` or `drive`. Google classes both as *restricted*, which means restricted-scope review
plus a yearly CASA Tier 2 security assessment by an outside lab (vendor list prices around US$540–720 a year, plus
weeks of back and forth). Restricted scopes are also meant for backup, productivity and reporting apps, so a photo
gallery may be refused outright.

**Unknown (test this before building).** Google's docs don't say whether picking a *folder* in the Picker with
`drive.file` gives access to the files inside it. Developer reports disagree, and one says `files.list` returned
nothing. Spend half a day with a test page on a real Drive folder:

- **Folder pick lists its children:** the studio picks folders, and each subfolder becomes an album (the UI the old
  simulated modal already has).
- **It doesn't:** the Picker opens inside the folder and the studio selects all (multi-select). The files land in
  one album the studio chooses, or one album per Picker round.
- **Last resort, needs no Google review:** "Paste a link to a folder shared as *Anyone with the link*". The Drive
  API reads public folders with a plain API key. It's worse for privacy (the studio has to make the shoot public)
  and big files can hit Drive's "download quota exceeded".

Test two more things on the same page:

- whether a resumable-upload session URI created by the Worker can be PUT to from the browser (phase 2 needs this);
- whether `thumbnailLink` with `=s2048` gives a usable 2048 px copy (phase 1 web copies).

## Google Cloud setup and verification (owner's steps, about 1–2 weeks of elapsed time)

Use the Google Cloud project that already holds `GOOGLE_CLIENT_ID` for sign-in.

1. **APIs:** enable the *Google Drive API* and the *Google Picker API*.
2. **Picker key:** create an API key restricted to the Picker API, with HTTP referrers limited to the admin site.
   Note the project number, which the Picker uses as `appId`.
3. **OAuth client:** add the new redirect URI `https://<api>/v1/drive/callback` to the existing web client.
4. **Branding (OAuth consent screen):** app name Frameline, logo, support email, home page, Privacy Policy URL and
   Terms URL. All of them must sit on a domain the company owns and has verified in Google Search Console.
   **Blocker:** `*.pages.dev` addresses are a poor fit, so the real domain (already pending) has to come first.
5. **Data access:** add the `drive.file` scope, with a one-line reason for each feature ("lets the studio pick photos
   from Drive to add to a gallery; stores the studio's original photos in a Frameline folder in their Drive").
6. **Privacy policy:** add a Google user data section. Say what is read and written (only files the studio picks or
   Frameline creates), that Google data isn't sold or used for ads or AI training, and the required statement:
   *"Frameline's use and transfer of information received from Google APIs will adhere to the Google API Services
   User Data Policy, including the Limited Use requirements."* `privacy.html` is still a draft awaiting legal
   review, so add this in the same pass.
7. **Submit for verification.** With only a non-sensitive scope this is brand verification, usually a few working
   days. Have a short screen recording of the Connect and Picker flow ready in case Google asks.
8. **Until verified:** set the publishing status to *Testing* and add pilot studios (up to 100) as test users. They
   see an "unverified app" warning. **Gotcha:** in Testing, Google refresh tokens expire after 7 days, so Drive
   connections drop weekly. That's fine for phase 1. Phase 2 must not reach real studios before verification.
9. **Secrets:** add `GOOGLE_PICKER_API_KEY` (wrangler var, it's public) and `DRIVE_TOKEN_KEY` (Cloudflare secret, a
   32-byte key used to encrypt stored refresh tokens). Neither goes in a file.

Sign-in keeps asking only for `openid email profile`. Drive is asked for separately, when the studio first presses
Connect Google Drive (incremental consent), so nobody signing in sees a Drive prompt.

## Shared piece: Connect Google Drive (built in phase 1, reused in phase 2)

- `GET /v1/drive/connect` → Google OAuth code flow with PKCE, `scope=drive.file`, `access_type=offline`,
  `include_granted_scopes=true`, `prompt=consent`. Owner and admins only.
- `GET /v1/drive/callback` stores the connection. **Table `drive_connections`:** `studio_id`, `google_sub`, `email`,
  `refresh_token_enc` (AES-GCM with `DRIVE_TOKEN_KEY`), `scope`, `root_folder_id`, `status`
  (`ok` | `revoked` | `error`), `connected_at`, `connected_by`.
- `GET /v1/drive/token` gives a short-lived access token for the Picker. The refresh token never leaves the Worker.
- `services/drive.ts`: `accessToken(studioId)` (cached in KV until about 5 minutes before expiry), `getFile`,
  `download` (stream), `createFolder`, `startResumableUpload`, plus error mapping. `invalid_grant` marks the
  connection `revoked`. 403 `rateLimitExceeded` and 429 retry with backoff. 403 `storageQuotaExceeded` is shown
  as "your Drive is full".
- Admin Settings → Integrations → Google Drive: Connected as x@gmail.com · Disconnect. Disconnect also revokes the
  token at Google.
- Mock API (`packages/shared/src/api.ts`): a fake connected Drive, so the sample studio shows the flow.

## Phase 1: Import from Google Drive (about 1.5–2 weeks after the test)

**Flow.** Event → ⋯ → Import from Google Drive (the existing `ImportModal`):

1. Connect, if not connected yet.
2. Choose from Google Drive opens the Picker: photos only, multi-select, folders if the test allowed it.
3. A preview shows what will come in: folders → albums, counts, total size, and skipped items (RAW, video, already
   imported, over the plan).
4. Import. The import keeps going on the server after the tab closes. The Running and Past tabs stay as they are.

**API.**

- `POST /v1/events/:id/drive-imports` `{ items: [{ fileId, albumId | newAlbumName }], quality, watermark }` →
  stores a `drive_imports` row (status and counts) plus `drive_import_items` rows, and checks plan capacity up
  front, like an upload. `GET` lists imports and `DELETE` cancels one.
- New queue message kind `drive-import`, batched about 10 files per message: `getFile` (size, mime, md5) → stream
  `alt=media` into R2 at the normal `objectKey` (`FixedLengthStream`, since the size is known) → create the photo
  row with `source: 'drive'`. Move photo-row creation out of `completeUploadSession` into a helper that takes files
  already stored, so imports and uploads share the quota, recount, audit, partner-notice and photo-queue code.
- **Web copy:** browser uploads make their 2048 px copy in the studio's browser, but nobody's browser is in the loop
  here. Use Drive's `thumbnailLink` at `=s2048` if the test shows it works. If not, the processor makes it once it's
  hosted, and until then imported photos show their originals.
- **No double imports:** a new `photos.drive_file_id` column, so an import skips files already in the event. This
  replaces today's `localStorage` history in `importStore.ts`.
- **Limits:** 200 MB per file (same as upload). JPG, PNG, HEIC and WebP only, with RAW and video listed as
  skipped. The Drive queue runs at `max_concurrency` 3, so one big import can't starve photo processing.

**Admin.** Rewrite `importStore.ts` against the real API: progress from realtime events, Running and Past from
`GET drive-imports`. Remove the fake `previewFolder` and the `DRV_` file names. Rewrite the help guide `drive` (it
promises "5,000 photos or 50 GB per import", which nothing enforces). The assistant repeats guides word for word,
so the text must be true.

**Done when:** the gate passes; tests cover the import route, quota refusal, duplicate skip, cancel, the
revoked-token path and a fake Drive (mocked `fetch`); a real 300-photo folder imports live from a test studio;
`FEATURES.driveImport` is turned on.

## Phase 2: Keep originals in my Drive (about 3 weeks)

**Setting.** Per event, *Originals: Frameline storage | My Google Drive*, with a studio default in Settings. Only
offered while Drive is connected. Existing photos stay where they are (no migration in this phase).

**Folder layout in the studio's Drive.** `Frameline / <Event name> (<date>) / <Album>/`, created by Frameline, so
`drive.file` covers them for good. Folder IDs are kept on `events.drive_folder_id` and `albums.drive_folder_id`.

**Upload.**

1. `POST /events/:id/uploads` on a Drive event: for each file, the Worker opens a Drive resumable upload into the
   album folder and returns its session URI in place of the R2 part URLs.
2. The browser PUTs the file straight to Drive. The bytes never go through the Worker.
3. The browser makes and sends the 2048 px web copy to R2 as today (`PUT /photos/:id/web`).
4. On complete, the Worker checks each file with `files.get` (size, md5) and creates rows with `storage: 'drive'`
   and `drive_file_id`.

`UploadDock` gets the new mode next to `s3` and `proxy`. If the test shows the browser can't PUT to a session URI,
the fallback is to send the file through the Worker in 90 MB chunks, which is slower.

**Reading originals. One helper, `openOriginal(env, photo)`, returns a stream from R2 or Drive.** Every place that
now does `MEDIA.get(r2Key)` for an original goes through it:

- `/v1/media` for full-size downloads (signed as today; the Worker streams from Drive);
- ZIPs (`routes/public.ts` `fileFor`, `services/zips.ts`);
- processor download renditions and watermark burn-in (a new internal route streams the original to the processor
  with `PROCESSOR_TOKEN`).

Face finding uses the R2 web copy, so `PhotoJob.key` points at the web copy for Drive photos.

**When Drive goes away.** If the token is revoked, the file is deleted in Drive, or the Drive is full:

- guests still browse, because web copies are in R2;
- full-size downloads fall back to web size with a note;
- the studio sees a red "Reconnect Google Drive" banner;
- uploads to Drive events stop until the studio reconnects or switches the event to Frameline storage.

A daily cron spot-checks a sample of `drive_file_id`s per event and flags missing ones.

**Deleting.** Deleting a photo or event in Frameline leaves the Drive copy alone. It's the studio's archive, and
Settings says so. Owner to confirm.

**Done when:** the gate passes; tests cover `openOriginal` both ways, the revoked and missing paths, and ZIPs mixing
R2 and Drive photos; a live wedding-size event (2,000+ photos) uploads to Drive and downloads full size as a guest
on a phone.

## Owner decisions before phase 2

- **Pricing.** Photos kept in Drive cost Frameline far less, so should they count less (or not at all) against the
  plan's photo allowance? This is the Camtom price argument.
- **Deleting.** Leave the Drive copy alone (recommended), or move it to Drive's trash?
- **Video.** Drive is the natural home for films. That's out of scope here, but it's the next obvious ask.

## Order of work

1. Owner: steps 1–6 of the Google setup (the domain first).
2. Test page (half a day): folder children with `drive.file`, browser PUT to a session URI, `thumbnailLink=s2048`.
3. Connect Google Drive + phase 1. Pilot studios as test users while Google verifies the app.
4. Phase 2, after verification (because of the 7-day refresh tokens in Testing).
