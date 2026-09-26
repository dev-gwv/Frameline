# Kamero Admin Dashboard: Analysis & Build Plan

Source: live walkthrough of `https://login.kamero.ai` (test account), 2026-09-26.
Test data created during analysis: album **"Test Ceremony"** with 4 uploaded test photos in the "Free Trial Event" (ID `6402F9F`).

---

## 1. What the product is

Kamero is a **photo-delivery SaaS for event photographers** (weddings, corporate events). The photographer:

1. Creates an **Event**, which is a gallery with an ID like `6402F9F`.
2. Uploads photos into **Albums** inside the event, from the browser, the desktop app, FTP from the camera ("Kam-Sync"), or Google Drive import.
3. **Shares** the event with guests through a web link (`kamero.ai/<eventId>`), a QR code, a PIN, or the mobile app.
4. Guests take a **selfie**, and **AI face recognition** filters the gallery down to the photos they appear in.
5. The photographer can **sell photos**, **watermark** them, **brand** the gallery, capture **leads/enquiries**, and publish a **studio website**.

It's billed through prepaid credits (1 credit = ₹1), per-event photo packs, and yearly or quarterly subscriptions.

---

## 2. Observed tech stack (from the live bundle)

| Concern | What Kamero uses |
|---|---|
| Frontend | React SPA built with **Vite** (single bundle `/assets/index-<hash>.js`, ~300 KB), client-side routing (react-router style) |
| UI kit | **Ant Design** (antd) + **lucide** icons, **Inter** font |
| API | REST at `https://apis.kamero.ai/v1/...`. Admin endpoints end in `_ad` |
| Auth | JWT **access and refresh tokens in localStorage** (`kam_access_token`, `kam_refresh_token`, `kam_token_expiry`), a zustand-style `auth-storage`, Google login, email OTP, and Cloudflare **Turnstile** captcha |
| Storage | Google Cloud Storage via **signed-URL direct upload**, then `POST /v1/notify_gcs_upload_complete`; served from `cdn.kamero.ai` and `assets.kamero.ai` |
| Side services | `watermarks.kamero.ai`, `geonames.kamero.ai` (location autocomplete), `geoip.kamero.ai`, `l.kamero.ai` (link shortener), FTP `ftp.kamero.ai:21` |
| Analytics | PostHog (self-proxied at `t.kamero.ai`), Microsoft Clarity, GA4, Meta Pixel, Cloudflare Insights |
| Payments | `/checkout/:gateway/:id` plus `/payment/callback` (multi-gateway, likely Razorpay for INR and Stripe for USD) |
| Desktop | Separate Mac/Windows apps distributed via GitHub releases (for large uploads) |

---

## 3. Visual design system

- **Primary:** purple `rgb(111,72,152)` (`#6F4898`), used for the top nav bar, primary buttons, and active tabs.
- **Accent:** amber/yellow (`#FBBF24`-ish), used for the active nav pill, "Most Popular" CTA, "Contact for Subscription", and the Original Upload zone.
- **Surfaces:** light grey page background (`#F5F5F5`), white rounded cards (~8–12px radius), subtle borders and shadows.
- **Danger:** red "Action Needed" card and "Counts as 2x" tag.
- **Layout A (most pages):** full-width **purple top navbar**. Left side: logo, Home, Events, Sell Photos, then an icon-only group (Posts, Watermark, Orders, Kam-Sync, Common QR, Your Website, Custom Domain), then Profile, Subscription, Support. Right side: avatar menu. The page content sits in a centred container.
- **Layout B (event workspace):** **no top nav**. It has a back arrow, event title and meta, a right-aligned action toolbar, a **left sidebar** (albums and stats), and a main photo grid.
- **Common patterns:** toggle-switch settings rows (icon, title, description, switch), empty states (circle icon, title, text, CTA), stat cards with an icon tile, modals with nested tabs, toasts at top centre, a floating upload-progress panel at bottom right, and a phone-mockup live preview (profile builder).

---

## 4. Route map (extracted from the router)

### Top-level
| Route | Page |
|---|---|
| `/login`, `/signup` | Auth |
| `/dashboard` | Home: credits, follow code, onboarding, support, packs |
| `/events` | My Events grid |
| `/events/create` | Create event (from purchased pack) |
| `/events/:eventId` | **Event workspace** (`?album=<albumId>`) |
| `/events/:eventId/:albumIndex/:index` | Photo viewer / lightbox |
| `/events/:eventId/settings` | Event settings |
| `/events/:eventId/watermark` | Event-specific watermark |
| `/events/:eventId/branding` | Event branding |
| `/events/:eventId/who-favorited` | Guest favorites / selections |
| `/sell-photos` (+ `/create`, `/settings`, `/business-settings`, `/watermark-settings`, `/subscription`, `/dashboard`, `/:eventId`, `/:eventId/settings`) | Photo-selling module |
| `/posts` | Push-notification posts to app users |
| `/orders`, `/wallet-ledger`, `/commission-ledger` | Orders & ledgers |
| `/setwatermark`, `/dynamicwatermark` | Account watermark (standard / rule-based "original") |
| `/kam-sync`, `/about/kam-sync`, `/how-kam-sync-works` | FTP camera sync |
| `/common-qr` | Reusable QR that can be re-pointed to any event |
| `/website`, `/website/enquiries` | Studio website builder + leads |
| `/custom-domain` | Paid custom domain |
| `/profile/create` | 6-step profile wizard |
| `/subscription`, `/subscription-renewal` | Plans |
| `/support` | Support tickets |
| `/account-settings` (+ `/renewal-pricing`, `/enquiry-emails`, `/set-password`, `/email-notifications`, `/billing-details`) | Account settings |
| `/usage-report`, `/events-report` | Reports |
| `/ai-enhancement`, `/ai-enhancement-tutorial` | AI photo enhancement |
| `/app-features`, `/help/google-drive-import` | Help |
| `/checkout/:gateway/:id`, `/checkout/success`, `/payment/callback`, `/paymentservice` | Payments |

---

## 5. Page-by-page breakdown

### 5.1 Dashboard (`/dashboard`)
- **Available Credits** card: balance, an "Amount in INR" input with Buy Credits, and a coupon-code redeem field.
- **Follow All Your Events on App** card: follow code (e.g. `FA-KCGWHY`) with copy, Follow Link, and Show QR Code.
- A row of four cards:
  - **Branding onboarding** (0% ring, "0/6 steps complete", "Complete profile")
  - **Support** (Create Ticket, WhatsApp, Community)
  - **Important Information**
  - **Build my website** promo
- Desktop-app download links.
- **My Event Packs** table: Pack, Photos, Validity, Cost, and an "Add to Cart" button per row, with Total and Buy Now at the bottom. Packs run from 100 photos for ₹100 up to 10,000 photos for ₹3,500, each valid for 12 months.

### 5.2 My Events (`/events`)
- Header with "My Events", a search box ("name or event id") with a Search button, and Create Event.
- Event cards show a cover image (or placeholder), a photo-count badge `0/1000`, a "Valid up to" badge, a plan tag ("Free Trial"), the name, the ID (editable), and edit/delete icons.

### 5.3 Event workspace (`/events/:id`), the core screen
- **Header:** back button, name, `Photos: n/950`, and ID. Actions: Admin Request, Share, Face Detection Active, Increase Photo Limit, Import (Google Drive), Favorites, and a Settings gear.
- **Left sidebar:**
  - Albums (n), with an add-album input and **drag-to-reorder** list (edit/delete per album)
  - **Guest Uploads** pseudo-album
  - Enable Highlight (auto-highlight album)
  - **Event Views** stats (views, unique app views, Android, iOS)
  - **Videos** (name + link list)
  - **Sort Photos By** (Capture Time / Name / Name Sequence)
  - **Favorites** selections
- **Upload zones** appear once an album exists:
  - **Standard Upload:** drag-and-drop, capacity counter, Standard Watermark settings, and an "Add Watermark?" toggle
  - **Original Upload:** stores originals, has its own watermark, and counts as 2x capacity
- **Upload flow:** clicking an upload button opens a modal listing the selected files, with "Run Advanced Duplicate Detection", Add More, Cancel, **Fast Upload**, and **Standard Upload**. After that you get per-file progress, an overall progress bar, and a minimisable floating panel at the bottom right. Photos appear after a **Refresh**, because processing happens asynchronously.
- **Photo grid:** thumbnails with Select (multi-select to move or delete) and a "Use Pages" pagination toggle. Lists load 32 per page (`photo_list_by_album_admin_ad?skip=0&limit=32`).
- **Share modal** has five tabs:
  - **Message:** customisable WhatsApp/email template, a shortened-links toggle, and the web gallery link `kamero.ai/<id>`
  - **QR Codes**
  - **PIN**
  - **Advanced Links**
  - **VIP Links**

### 5.4 Event settings (`/events/:id/settings`)
The page is laid out as a two-column grid of setting cards. The event PIN (e.g. `5211`, with copy and reset) sits in the header. The cards are:

| Card | Settings |
|---|---|
| **Face Recognition** | Face Recognition, Face-recognition-based privacy (guests see only their own photos), Anonymous "My Photos" access, Refresh indexing |
| **Guest Registration** | Require email and mobile to view |
| **Original Watermark** | Turn off original watermark; event-specific watermark (Set up) |
| **Event Branding** | Blocked until account branding is complete |
| **Guest Uploads** | Enable, guest photo limit (reserved separately), watermark guest photos |
| **Edit Event Details** | Name, ID, date |
| **Download Options** | Allow all / Personal only / Disable; anonymous downloads; prevent original quality (2K max); "Download All Photos" emailed link; download logs |
| **Web Gallery** | Skip the app-download landing page |
| **Event Status** | Disable, Delete |
| **Event Hosts** | Manage co-admins |
| **Website** | Show this event on the studio site |
| **Enquiry** | Allow leads |

### 5.5 Other pages
- **Sell Photos:** empty state, Seller Dashboard, Settings, and Create Sell Photos Event. The **Seller Dashboard** has INR and USD balances, completed and pending orders, a revenue chart, and tabs for Wallet Ledger, Photo Orders, and Payment Pending Orders.
- **Posts:** create posts that appear in the mobile app's Posts tab and trigger push notifications.
- **Watermark:** a tabbed choice between Standard (applied at upload) and Original (rule-based). Position picker (4 corners), Text or Image type, a "Bigger watermark" toggle, and a live preview carousel on sample images.
- **Orders:** empty state, with Wallet Ledger, Commission Ledger, and Add Billing Details (for GST invoices).
- **Kam-Sync (Beta):** a 3-step explainer, FTP host, up to 10 FTP accounts, each linked to an event and album.
- **Common QR:** a single reusable poster QR that can be re-pointed to any event.
- **Your Website:** Draft/Publish with tabbed sections (Address, Design, About, Services, Testimonials, Questions, Galleries, Contact, Location, Social). It includes a subdomain reservation (`<name>.kamero.ai`), 6 templates (Classic, Editorial, Minimal, Bold, Showcase, Portfolio), brand colour, logo and cover (inherited from the profile), FAQ presets, and a live preview pane.
- **Custom Domain:** a 4-step explainer and a pricing radio (₹799/month or yearly).
- **Profile (create):** a 6-step wizard (Company Info, Contact Info, Color Theme, Photos, Social Links, Portfolio) with a progress bar and a **phone-mockup live preview**.
- **Subscription:** a feature chip grid and a Yearly/Quarterly toggle. Plans run from Starter (₹8,490/yr, 50k photos) through Basic, Pro (most popular), and Business, up to Enterprise (₹84,990/yr, 1M photos). The page also has FAQs and sales contacts.
- **Support:** a new-ticket form (subject, related event picker, description, platform chips, contact number, attachments up to 5) and a Past Tickets tab.
- **Account Settings:** a card grid (Custom Renewal Pricing, Enquiry Emails, Set Password, Email Notifications, Billing Details).

---

## 6. API surface (observed)

Base: `https://apis.kamero.ai/v1`

- **Auth:** `signup`, `google-login`, `login/token`, `logout`, `refresh_token`, `register`, `send_otp`, `forgot_password`, `reset_password`, `verify_session_ad`
- **Events:** `create_event_ad`, `event_ad?eventDocId`, `event_home_ad`, `event_list_by_user_ad`, `event_count_by_user_ad`, `search_events_for_user_ad`, `event_names_by_user_ad`, `archive_event_ad`, `set_event_cover_ad`, `expired_events_ad`, `event/:id/uploads-left`, `event/pin_ad`, `event/reset_pin_ad`
- **Albums:** `album_list_ad`, `album_list_simple_ad`, `album_home_ad`, `reorder_albums_ad`, `set_album_cover_ad`, `delete_highlight_album_ad`, `guest_upload_album_ad`, `edit_event_guest_upload_ad`
- **Photos:** `upload_photos_ad`, `notify_gcs_upload_complete`, `photo_list_by_album_admin_ad`, `photo_count_by_album_ad`, `photo_count_by_events_ad`, `delete_photo_ad`, `delete_photos_ad`, `move_photos_ad`, `filter_dup_photos_ad`, `photos/:id/faces_ad`, `photos/:id/enhance-background`
- **Faces:** `events/:id/refresh-face-indexing_ad`, `events/:id/face-indexing-insights_ad`, `expired_faces_ad`
- **Sharing and guests:** `share_detail_ad`, `share_message_template_ad`, `registrations_ad`, `list_admin_permission_requests_ad`, `admin_permission_ad`, `zip_subscribe_ad`
- **Profile:** `update_profile_ad`, `update_phone_ad`, `public/affiliate-brand`
- **Public (guest side):** `public/…`, `event/public/…`, `photo/public/…`, `photo/purchase/status/:id`

**IDs:** events use a UUID `eventDocId` plus a short public 7-character hex ID. Albums use UUIDs, and the guest album is `<eventId>-GUESTALBUM`.

---

## 7. Data model (inferred)

```
User(id, email, phone, name, company, subdomain, brandColor, logo, cover, social[], credits, followCode)
Subscription(userId, plan, period, photoQuota, used, renewsAt, status)
EventPack(userId, photos, validityMonths, cost, consumedByEventId?)
Event(id uuid, shortId, userId, name, date, coverPhotoId, photoLimit, validUntil, pin,
      faceRecognition, facePrivacy, anonymousMyPhotos, requireRegistration,
      guestUploads{enabled, limit, watermark}, download{mode, anonymous, noOriginal},
      skipAppLanding, showOnWebsite, allowEnquiry, disabled, archived, highlightEnabled)
Album(id, eventId, name, order, coverPhotoId, isGuest, isHighlight)
Photo(id, eventId, albumId, uploaderType(admin|guest|ftp), storageKey, originalKey?,
      thumbKey, watermarkedKey, width, height, captureTime, filename, hash, faceIndexed)
Face(id, photoId, eventId, bbox, embedding / externalFaceId)
Video(id, eventId, name, url)
EventHost(eventId, userId/email, permissions) / AdminPermissionRequest
GuestRegistration(eventId, name, email, phone, createdAt)
Favorite(eventId, guestId, photoId)  // "who-favorited"
EventView(eventId, platform, deviceId, at)
Watermark(userId|eventId, type(text|image), text, subtitle, imageKey, position, large, rules?)
KamSyncAccount(id, userId, eventId, albumId, ftpUser, ftpPass)
CommonQR(id, userId, slug, targetEventId)
Post(id, userId, title, body, image, pushedAt)
SellEvent / PhotoOrder / WalletLedger / CommissionLedger / Payout
Website(userId, subdomain, template, sections JSON, published) / Enquiry(...)
SupportTicket(id, userId, eventId?, subject, body, platform, phone, attachments[])
```

---

## 8. How to build it (recommended stack)

| Layer | Recommendation | Why |
|---|---|---|
| Admin frontend | **React + Vite + TypeScript + Ant Design 5**, lucide-react, react-router, **TanStack Query**, Zustand | Matches Kamero's own stack, and antd gives tables, forms, modals, and uploads out of the box |
| Public gallery | **Next.js** (SSR for SEO/OG previews on `kamero.ai/<id>` and studio websites on subdomains) | Link previews in WhatsApp need server-rendered meta tags |
| Backend API | Node (**NestJS** or Fastify) + **PostgreSQL** (Prisma/Drizzle) | Relational data (events, albums, orders, ledgers) |
| Object storage | **S3 / R2 / GCS** with **presigned PUT** direct from the browser, then a "notify complete" call | This is the same pattern Kamero uses, and it keeps large files off your API |
| Processing | **BullMQ + Redis** workers using **sharp** for thumbnails (e.g. 400px and 2K), watermark compositing, and EXIF capture-time extraction; dedupe by perceptual hash | Upload is async. The UI polls or refreshes |
| Face recognition | Start with **AWS Rekognition** (one collection per event: IndexFaces on upload, SearchFacesByImage for the selfie). Self-hosted alternative: InsightFace/ArcFace embeddings in **pgvector** | This is the core feature, and a managed service gets it working fastest |
| Auth | JWT access + refresh, Google OAuth, email OTP, Turnstile on signup | Mirrors Kamero |
| Payments | **Razorpay** (INR) + Stripe (USD); credits wallet + ledger tables | Credits, packs, subscriptions, and photo sales |
| FTP ingest (Kam-Sync) | **SFTPGo** (supports FTP + per-user virtual folders + upload webhooks) → pushes to the same processing queue | Avoids writing an FTP server |
| Link shortener / QR | Small redirect service + `qrcode` lib | Common QR = mutable redirect |
| Mobile app (later) | React Native / Expo sharing the public API | Guest selfie search + downloads |

### Phased roadmap
1. **MVP (core loop):** auth, events CRUD, albums (reorder), presigned upload + thumbnail worker, photo grid with pagination/select/move/delete, public web gallery with a share link and PIN.
2. **AI faces:** index on upload, selfie search on the public gallery, face-privacy mode, refresh indexing.
3. **Controls:** event settings page (downloads, guest registration, guest uploads), standard watermark with live preview, favorites/"who favorited", view stats.
4. **Monetisation:** credits wallet, event packs cart, subscriptions, checkout + callback, orders/ledgers, GST billing details.
5. **Growth features:** profile wizard + branding, studio website builder (templates + subdomains), enquiries, custom domain, Common QR, Posts/push.
6. **Pro workflow:** Kam-Sync FTP, Google Drive import, desktop uploader (Electron/Tauri), duplicate detection, Sell Photos module, AI enhancement.

### Suggested frontend structure
```
src/
  layouts/AppLayout.tsx          # purple top nav (Layout A)
  layouts/EventWorkspaceLayout.tsx  # sidebar + toolbar (Layout B)
  pages/dashboard, events, events/[id], events/[id]/settings, sell-photos, posts,
        orders, watermark, kam-sync, common-qr, website, custom-domain, profile,
        subscription, support, account-settings
  components/EmptyState, SettingRow (icon+title+desc+Switch), StatCard,
        UploadModal, UploadProgressDock, ShareModal (tabs), PhotoGrid, AlbumList (dnd-kit)
  api/ (typed client per resource) · stores/auth.ts · theme.ts (antd ConfigProvider: colorPrimary #6F4898)
```

---

## 9. Gaps not yet explored
- Public guest gallery (`kamero.ai/<id>`): the browser extension isn't permitted on that domain. Allow it and it can be analysed next (selfie flow, download UX).
- Checkout and payment flows were deliberately not exercised (they spend real money).
- Interiors of the Share → QR/PIN/Advanced/VIP tabs, the Import (Google Drive) flow, and the Sell Photos create wizard weren't opened.
