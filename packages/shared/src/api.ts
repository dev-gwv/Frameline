import {
  BASE_RENEWAL, COUPONS, ENHANCE_COST, PACKS, PERIOD_DAYS, PLANS, PRESETS, RENEWAL_CREDIT_DISCOUNT, STORE_COMMISSION,
  createSeed, defaultSettings, generatePhotos, hash, planPrice, tone, type SeedState,
} from './seed'
import type {
  AbandonedCart, Asset, AssetKind, DownloadAllowance, DownloadEvent, PublicEventSummary, PublicWatermark, ShippingAddress,
  Album, Broadcast, Camera, CameraUpload, Enquiry, EventSettings, EventType, Film, Guest, GuestSession, ID, LedgerEntry,
  NotificationPrefs, Order, OrderItemInput, PaymentMethod, Photo, PhotoEvent, Plan, PresetId, Price, PublicEvent, PublicStudio,
  Purchase, SmartQR, StoreSettings, StoreSettingsPatch, Studio, StudioProfile, TeamMember, Ticket, Usage, UsageBreakdown,
  UsageReport, WatermarkSettings, Website, ZipRequest, WalletBalance, NeedsYouItem,
  AccessRequest, EventHost, EventStats, HandleCheck, NotifyRequest, PayoutCheck, ReviewStatus, StatsTotals, StudioStats,
} from './types'
import { buildNeedsYou } from './needs-you'
import { cleanGuestLinkPayload, decodeGuestLink, encodeGuestToken, guestLinkKind, type GuestLinkKind, type GuestLinkPayload } from './links'
import { ApiError } from './http'
import {
  GST_RATE, TRASH_DAYS, addRotation, effectivePrices, handleProblem, selfieHasNoFace, simulatePayoutCheck, withSettingsDefaults,
} from './rules'

/** 'capture' = oldest first, 'newest' = latest capture first, 'name' = file name, 'sequence' = upload order. */
export type PhotoSort = 'capture' | 'newest' | 'name' | 'sequence'
export type PhotoFilter = 'all' | 'people' | 'favourites' | 'hidden'

export interface ListPhotosQuery {
  albumId?: ID // undefined = all albums
  sort?: PhotoSort
  filter?: PhotoFilter
  personId?: ID
  offset?: number
  limit?: number
}

/** Same filters as listPhotos, without paging (listPhotoIds returns every match). */
export type PhotoIdsQuery = Omit<ListPhotosQuery, 'offset' | 'limit'>

export interface NewEventInput {
  name: string
  date: string
  city: string
  type: EventType
  preset: PresetId
  host?: { email: string; phone?: string }
  guestUploadLimit: number
}

export interface UploadFile { filename: string; size: number; url?: string; width?: number; height?: number }

export interface UploadOptions {
  quality: 'web' | 'original'
  skipIds?: string[]
  /** Where the photos came from (default 'web'; 'guest' uploads go to review when the event asks for it). */
  source?: Photo['source']
  /** Name shown as the uploader (default: the signed-in user). */
  uploadedBy?: string
  /** Burn the studio watermark into these files (guest uploads with watermarkGuestUploads). */
  watermark?: boolean
  /** Skip the heavier processing steps (e.g. live camera sync). */
  fast?: boolean
}

export interface EnhanceOptions { preset?: string; prompt?: string; saveAs: 'new' | 'replace' }
/** How a plan change is paid: from the wallet (added money first, then sales) or by card / UPI (simulated capture without Razorpay keys). */
export type PlanPayWith = 'wallet' | 'card' | 'upi'
/** `charged` = new plan price − `credit` for unused time (before GST); `total` = charged + `gst`, what was paid. */
export interface PlanChange { usage: Usage; charged: number; credit: number; gst: number; total: number; payWith: PlanPayWith; purchase: Purchase | null }
export interface RenewalResult { event: PhotoEvent; charged: number; payWith: 'credits' | 'card' }
export interface RenewalLink { url: string; price: number; expiresAt: string }
export interface GuestLinkResult { code: string; kind: GuestLinkKind; path: string; url: string; payload: GuestLinkPayload }
export interface ResolvedGuestLink {
  kind: GuestLinkKind
  payload: GuestLinkPayload
  /** VIP links with an embedded PIN (or "see all") come with a ready guest session. */
  session?: GuestSession
}

export interface PublicPhotosQuery {
  albumId?: ID
  personId?: ID
  sort?: PhotoSort
  /** Most-favourited first (the gallery's Highlights). */
  highlights?: boolean
  offset?: number
  limit?: number
}

export interface FaceSearchInput {
  /** Stable key for the selfie (e.g. `${event.id}:${file.name}:${file.size}`): drives the deterministic dev match. */
  key: string
  /** Face embedding from the processor / on-device model (used by the real API when Vectorize is configured). */
  embedding?: number[]
  /** Faces the client's detector found in the selfie (0 → no face; omit when the client can't tell). */
  faces?: number
  /** Selfie size in pixels; images under MIN_FACE_IMAGE_PX on the short side count as "no face". */
  image?: { width: number; height: number }
}
/**
 * `faceFound: false` (with `reason: 'no_face'`) means the selfie had no usable face: ask for another one.
 * With a face but no match, `personId` is null and `photoIds` may be empty.
 */
export interface FaceSearchResult { faceFound: boolean; reason?: 'no_face'; personId: ID | null; photoIds: ID[] }

export interface EnquiryInput { name: string; phone: string; email: string; message: string; source?: string }
/** Where an enquiry goes: from an event gallery, or straight to a studio (handle or follow code). */
export type EnquiryTarget = { shortId: string } | { studio: string }

export interface OrderInput {
  items: OrderItemInput[]
  method: PaymentMethod
  buyer: { name: string; email: string; phone?: string }
  /** Required when any item is a print (price id starting with "print"). */
  shipping?: ShippingAddress
}

/** Razorpay Checkout's success payload (razorpay_order_id, razorpay_payment_id, razorpay_signature). */
export interface OrderPayment { providerOrderId: string; paymentId: string; signature: string }

export interface PackPurchase { event: PhotoEvent; charged: number; purchase: Purchase }

/** A file for uploadAsset: web passes a Blob/File, React Native a file uri. */
export interface AssetFile { filename: string; contentType?: string; size?: number; blob?: Blob; uri?: string }

/** Allowed types and sizes per asset kind (the server enforces the same). */
export const ASSET_RULES: Record<AssetKind, { types: string[]; maxBytes: number }> = (() => {
  const images = { types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], maxBytes: 10 * 1024 * 1024 }
  return {
    'studio-logo': images, 'studio-cover': images, 'event-cover': images, 'watermark-logo': { types: ['image/png', 'image/webp', 'image/jpeg'], maxBytes: images.maxBytes },
    'broadcast-image': images, 'qr-logo': images, 'testimonial-photo': images,
    'kyc-document': { types: ['application/pdf', 'image/jpeg', 'image/png'], maxBytes: 10 * 1024 * 1024 },
  }
})()

export const DOWNLOAD_ALL_LIMIT = 5

export type MemberPatch = { role?: TeamMember['role']; eventIds?: ID[] }
export type CameraPatch = Partial<Pick<Camera, 'label' | 'eventId' | 'albumId' | 'mode'>>
/** Name plus an email or a mobile number (at least one). Returning guests are matched by email, else phone. */
export type RegisterGuestInput = { name: string; email?: string; phone?: string }

/** Change notifications let screens update live (the real API uses a Durable Object WebSocket). */
export type ChangeTopic = 'events' | 'albums' | 'photos' | 'studio' | 'usage' | 'guests' | 'activity' | 'misc'

/**
 * The contract every screen uses. `createMockApi` implements it in memory;
 * `createHttpApi` (http.ts) implements it against apps/api.
 */
export interface FramelineApi {
  subscribe(fn: (topic: ChangeTopic) => void): () => void

  // ── Studio ────────────────────────────────────────────────────────────────
  getStudio(): Promise<Studio>
  updateStudio(patch: Partial<Studio>): Promise<Studio>
  getUsage(): Promise<SeedState['usage']>
  getUsageBreakdown(): Promise<UsageBreakdown>
  requestUsageReport(): Promise<UsageReport>
  getUsageReport(): Promise<UsageReport | null>

  // ── Events ────────────────────────────────────────────────────────────────
  listEvents(): Promise<PhotoEvent[]>
  getEvent(id: ID): Promise<PhotoEvent>
  createEvent(input: NewEventInput): Promise<PhotoEvent>
  updateEvent(id: ID, patch: Partial<Omit<PhotoEvent, 'settings'>>): Promise<PhotoEvent>
  updateEventSettings(id: ID, patch: Partial<EventSettings>): Promise<PhotoEvent>
  resetPin(id: ID): Promise<string>
  /** Moves the event to the trash (restoreEvent within TRASH_DAYS). `permanent: true` deletes a trashed event for good now ("Delete forever"). */
  deleteEvent(id: ID, opts?: { permanent?: boolean }): Promise<void>
  renewEvent(eventId: ID, opts: { payWith: 'credits' | 'card' }): Promise<RenewalResult>
  createRenewalLink(eventId: ID): Promise<RenewalLink>
  createGuestLink(eventId: ID, payload: Omit<GuestLinkPayload, 'e'>): Promise<GuestLinkResult>

  // ── Albums & photos ───────────────────────────────────────────────────────
  listAlbums(eventId: ID): Promise<Album[]>
  createAlbum(eventId: ID, name: string): Promise<Album>
  renameAlbum(id: ID, name: string): Promise<Album>
  /** Moves the album and its photos to the trash (restoreAlbum). */
  deleteAlbum(id: ID): Promise<void>
  reorderAlbums(eventId: ID, orderedIds: ID[]): Promise<void>

  listPhotos(eventId: ID, q?: ListPhotosQuery): Promise<{ total: number; items: Photo[] }>
  /** Every matching id (for select-all and the viewer's next/previous). */
  listPhotoIds(eventId: ID, q?: PhotoIdsQuery): Promise<ID[]>
  getPhoto(id: ID): Promise<Photo>
  updatePhotos(ids: ID[], patch: Partial<Pick<Photo, 'hidden' | 'albumId'>>): Promise<void>
  /** Moves photos to the trash (restorePhotos within TRASH_DAYS). */
  deletePhotos(ids: ID[]): Promise<void>
  copyPhotosToAlbum(ids: ID[], albumId: ID): Promise<Photo[]>
  /** Guest-upload review: 'approved' shows them, 'rejected' keeps them out of the gallery, 'pending' sends them back to review. */
  setPhotoReview(ids: ID[], status: ReviewStatus): Promise<void>
  /** Stores coverPhotoId on the event or on the photo's album. */
  setCover(eventId: ID, photoId: ID, scope: 'event' | 'album'): Promise<void>
  /** Adds files as `processing`; they switch to `ready` shortly after. */
  uploadPhotos(eventId: ID, albumId: ID, files: UploadFile[], opts: UploadOptions): Promise<Photo[]>
  /** Takes ENHANCE_COST rupees from the wallet (ledger 'credits-used') and returns the new or updated photo. */
  enhancePhoto(photoId: ID, opts: EnhanceOptions): Promise<Photo>
  reindexFaces(eventId: ID): Promise<{ queued: number }>
  requestZip(eventId: ID, email: string, opts?: { albumId?: ID; photoIds?: ID[]; /** Set by requestPublicZip for a guest-initiated export; admin callers omit it. */ guestId?: ID }): Promise<ZipRequest>
  listZipRequests(eventId: ID): Promise<ZipRequest[]>
  /** The event's download log (most recent first): every guest single-photo download, and one row per photo once a ZIP is ready. */
  listDownloadEvents(eventId: ID): Promise<DownloadEvent[]>

  listPeople(eventId: ID): Promise<SeedState['people']>
  listFilms(eventId: ID): Promise<Film[]>
  addFilm(eventId: ID, name: string, url: string): Promise<Film>
  updateFilm(id: ID, patch: Partial<Pick<Film, 'name' | 'url'>>): Promise<Film>
  deleteFilm(id: ID): Promise<void>

  listGuests(eventId: ID): Promise<SeedState['guests']>
  listAccessRequests(eventId: ID): Promise<SeedState['accessRequests']>
  resolveAccessRequest(id: ID, approve: boolean): Promise<void>

  // ── Business ──────────────────────────────────────────────────────────────
  listActivity(): Promise<SeedState['activity']>
  listOrders(): Promise<SeedState['orders']>
  listLedger(): Promise<SeedState['ledger']>
  listPrices(): Promise<SeedState['prices']>
  updatePrices(prices: Price[]): Promise<Price[]>
  getStoreSettings(): Promise<StoreSettings>
  updateStoreSettings(patch: StoreSettingsPatch): Promise<StoreSettings>
  requestPayout(amount: number): Promise<LedgerEntry>
  listPurchases(): Promise<Purchase[]>
  /**
   * Switches plan (owner), prorated, with GST. `payWith: 'wallet'` takes `total` from the wallet in the same call (402
   * `insufficient_credits` when short); 'card' / 'upi' record a card/UPI payment (simulated without Razorpay keys).
   */
  changePlan(planId: Plan['id'], opts: { billing: 'yearly' | 'quarterly'; payWith?: PlanPayWith }): Promise<PlanChange>
  setRenewalMultiplier(multiplier: number): Promise<Usage>
  addCredits(amount: number): Promise<number>
  redeemCoupon(code: string): Promise<{ credits: number; walletCredits: number }>
  spendCredits(amount: number, description: string): Promise<{ walletCredits: number; entry: LedgerEntry }>

  // ── Tools ─────────────────────────────────────────────────────────────────
  listCameras(): Promise<Camera[]>
  createCamera(input: Pick<Camera, 'label' | 'eventId' | 'albumId' | 'mode'>): Promise<Camera>
  updateCamera(id: ID, patch: CameraPatch): Promise<Camera>
  deleteCamera(id: ID): Promise<void>
  resetCameraPassword(id: ID): Promise<Camera>
  listCameraUploads(cameraId: ID): Promise<CameraUpload[]>
  clearCameraUploads(cameraId: ID): Promise<void>
  listQRs(): Promise<SmartQR[]>
  updateQR(id: ID, patch: Partial<SmartQR>): Promise<SmartQR>
  createQR(name: string, eventId: ID): Promise<SmartQR>
  /** Moves the QR code to the trash (restoreQR); its short link stops working meanwhile. */
  deleteQR(id: ID): Promise<void>
  listBroadcasts(): Promise<Broadcast[]>
  sendBroadcast(input: Pick<Broadcast, 'title' | 'body' | 'audience' | 'scheduledAt'> & { imageUrl?: string }): Promise<Broadcast>
  cancelBroadcast(id: ID): Promise<Broadcast>
  /** Moves the message to the trash (restoreBroadcast); a scheduled one isn't sent while trashed. */
  deleteBroadcast(id: ID): Promise<void>
  listTickets(): Promise<Ticket[]>
  createTicket(input: Pick<Ticket, 'subject' | 'eventId' | 'platform'> & { body: string }): Promise<Ticket>
  replyTicket(id: ID, body: string): Promise<Ticket>
  listTeam(): Promise<TeamMember[]>
  inviteMember(email: string, role: TeamMember['role'], eventIds?: ID[]): Promise<TeamMember>
  updateMember(id: ID, patch: MemberPatch): Promise<TeamMember>
  removeMember(id: ID): Promise<void>
  getNotificationPrefs(): Promise<NotificationPrefs>
  updateNotificationPrefs(patch: Partial<NotificationPrefs>): Promise<NotificationPrefs>
  getWatermark(): Promise<WatermarkSettings>
  updateWatermark(patch: Partial<WatermarkSettings>): Promise<WatermarkSettings>
  getWebsite(): Promise<Website>
  updateWebsite(patch: Partial<Website>): Promise<Website>
  listEnquiries(): Promise<SeedState['enquiries']>
  updateEnquiry(id: ID, patch: Partial<Pick<Enquiry, 'status' | 'note'>>): Promise<Enquiry>

  // ── Guest side (no studio session; guest tokens are handled by the client) ─
  getPublicEvent(shortId: string): Promise<PublicEvent>
  /** Wrong PIN: ApiError 401 `invalid_pin` (problem.attemptsRemaining); 5 wrong tries: 429 `pin_locked` for 15 minutes. */
  verifyPin(shortId: string, pin: string): Promise<GuestSession>
  /** 422 unless a name and an email or phone are given. */
  registerGuest(shortId: string, input: RegisterGuestInput): Promise<GuestSession & { guest: Guest }>
  /** Excludes hidden, processing and pending-review photos. */
  listPublicPhotos(shortId: string, q?: PublicPhotosQuery): Promise<{ total: number; items: Photo[] }>
  /** `faceFound: false` when the selfie has no usable face (see FaceSearchInput.faces / image). */
  searchFaces(shortId: string, selfie: FaceSearchInput): Promise<FaceSearchResult>
  setFavourite(photoId: ID, on: boolean, shortId?: string): Promise<{ favourites: number }>
  createEnquiry(target: EnquiryTarget, input: EnquiryInput): Promise<Enquiry>
  createOrder(shortId: string, input: OrderInput): Promise<Order>
  recordDownload(photoIds: ID[], shortId?: string): Promise<void>
  getStudioProfile(followCode: string): Promise<StudioProfile>
  followStudio(followCode: string): Promise<{ followers: number }>
  resolveGuestLink(code: string): Promise<ResolvedGuestLink>

  // ── Added in contract v3 ─────────────────────────────────────────────────
  /** Events in the trash (deleteEvent soft-deletes; purged after 30 days). */
  listDeletedEvents(): Promise<PhotoEvent[]>
  restoreEvent(id: ID): Promise<PhotoEvent>
  /** Adds a photo pack (see PACKS) to one event: raises its photoLimit and records a 'pack' purchase. */
  buyPack(eventId: ID, photos: number, opts: { payWith: 'credits' | 'card' }): Promise<PackPurchase>
  /** Studio-side face lookup (e.g. building a personal link from an uploaded photo). */
  matchFaceForLink(eventId: ID, selfie: FaceSearchInput): Promise<FaceSearchResult>
  /** Uploads a logo / cover / broadcast image / QR logo / KYC document; returns a URL for the matching field. */
  uploadAsset(kind: AssetKind, file: AssetFile): Promise<Asset>
  listCarts(): Promise<AbandonedCart[]>
  remindCarts(orderIds: ID[]): Promise<{ reminded: number }>

  listPublicPrices(shortId: string): Promise<Price[]>
  getPublicWatermark(shortId: string): Promise<PublicWatermark>
  /** Guest uploads into the event's "Guest uploads" album (needs settings.guestUploads; counts against guestUploadLimit). */
  uploadGuestPhotos(shortId: string, files: UploadFile[], opts?: { uploadedBy?: string }): Promise<Photo[]>
  /** Emailed ZIP for a guest, following the event's download policy. */
  requestPublicZip(shortId: string, email: string, opts?: { photoIds?: ID[]; albumId?: ID; personId?: ID }): Promise<ZipRequest>
  /** Checks the download PIN (works on galleries without a PIN gate) and uses one of the guest's DOWNLOAD_ALL_LIMIT "Download all" uses. */
  verifyDownloadPin(shortId: string, pin?: string): Promise<DownloadAllowance>
  listMyFavourites(shortId: string): Promise<Photo[]>
  listMyOrders(shortId: string): Promise<Order[]>
  /** Completes a pending order after Razorpay Checkout succeeds. */
  confirmOrder(orderId: ID, payment: OrderPayment): Promise<Order>
  requestAccess(shortId: string, input: { name: string; email: string; note?: string }): Promise<{ received: true }>
  unfollowStudio(followCode: string): Promise<{ followers: number }>
  listFollowedStudios(): Promise<PublicStudio[]>
  listMyGalleries(): Promise<PublicEventSummary[]>
  /** A downloadable (watermarked) rendition, or null when none exists yet. */
  getPhotoDownloadUrl(photoId: ID, opts?: { size?: 2048 | 3072; shortId?: string }): Promise<string | null>

  // ── Added in contract v4 (redesign) ──────────────────────────────────────
  /** The studio's money in one call (owner). Show `balance` as "Wallet"; Withdraw up to `withdrawable`. Don't derive it from the ledger. */
  getWallet(): Promise<WalletBalance>
  /** Home "Needs you": access requests, guest uploads awaiting review, events and face data expiring soon (editor+). */
  listNeedsYou(): Promise<NeedsYouItem[]>
  /**
   * Refunds a paid order in full (owner). Takes the studio's share back from earnings (ledger 'refund'),
   * marks the order 'refunded' and stops its download link. 409 `order_not_refundable` (problem.orderStatus) unless status is
   * 'paid' or 'printing'. The HTTP client sends an Idempotency-Key, so retries never refund twice.
   */
  refundOrder(orderId: ID, reason: string): Promise<Order>

  // ── Added in contract v5 (stage-2 gaps) ──────────────────────────────────
  /** Brings trashed photos back (and recounts their albums). Ids that aren't in the trash are ignored. */
  restorePhotos(ids: ID[]): Promise<{ restored: number }>
  /** Brings a trashed album back with the photos that were trashed with it. */
  restoreAlbum(id: ID): Promise<Album>
  restoreQR(id: ID): Promise<SmartQR>
  restoreBroadcast(id: ID): Promise<Broadcast>
  /** Turns photos clockwise by `degrees` (multiples of 90; −90 turns left). Stored as Photo.rotation. */
  rotatePhotos(ids: ID[], degrees: number): Promise<{ updated: number }>

  /** Removes a guest's access (they drop out of Guests; their session stops working). Undo with restoreGuest. */
  removeGuest(guestId: ID): Promise<void>
  restoreGuest(guestId: ID): Promise<Guest>
  /** Undoes resolveAccessRequest: the request is pending again and a guest added by approving it is removed. */
  reopenAccessRequest(id: ID): Promise<AccessRequest>

  /** Totals for the event page (visits, downloads, favourites, face finding progress…). */
  getEventStats(eventId: ID): Promise<EventStats>
  /** Studio totals for Reports: `month` ('YYYY-MM', default this month), the month before, and all time. */
  getStudioStats(opts?: { month?: string }): Promise<StudioStats>

  /** Sets or clears (empty string) the courier tracking number on a print order (owner). */
  updateOrder(orderId: ID, patch: { trackingNumber?: string }): Promise<Order>
  /** Emails the buyer a fresh download link (owner). 409 `order_not_deliverable` unless paid / printing / paid-direct; 422 when the order has no email. */
  resendDownloadLink(orderId: ID): Promise<{ sentTo: string; order: Order }>
  /** Runs the ₹1 bank check again (owner) and stores the result in StoreSettings.payout.check. */
  verifyPayoutAccount(): Promise<PayoutCheck>
  /** Is `<handle>.frameline.in` free? Checks format, reserved words and other studios. */
  checkHandle(handle: string): Promise<HandleCheck>

  // Guest side
  /** Counts gallery views of these photos (one per photo per call). */
  recordPhotoViews(photoIds: ID[], shortId?: string): Promise<void>
  /** "Notify me" on a gallery with no photos yet: we message this number when the first photos go live. 409 `already_live` if they're there. */
  requestNotify(shortId: string, phone: string): Promise<NotifyRequest>
  /** Stops a "Notify me" request for this number. */
  cancelNotify(shortId: string, phone: string): Promise<void>
}

/**
 * Where the mock keeps its data. `subscribe` (optional) reports writes by another tab/window so every copy of the app
 * stays in sync; see `localStoragePersistence`.
 */
export interface Persistence {
  load(): string | null
  save(data: string): void
  subscribe?(onChange: (raw: string | null) => void): () => void
}

/** Mock-only state that isn't part of the seed. */
interface MockExtra {
  coupons: string[]
  usageReport: UsageReport | null
  /** eventId → guest id registered on this device. */
  guestIds: Record<ID, ID>
  /** Events whose PIN this device typed (or got from a VIP link). */
  pinVerified: ID[]
  /** Events whose PIN came embedded in a VIP link (Download all needs no PIN). */
  vipPin: ID[]
  downloadUses: Record<ID, number>
  followed: ID[]
  /** eventId → last opened. */
  recent: Record<ID, string>
  myOrders: ID[]
  cartReminders: Record<ID, { count: number; at: string }>
  assets: Asset[]
  /** Guest id → when the studio removed their access. */
  removedGuests: Record<ID, string>
  /** Resolved access requests (for reopenAccessRequest): request id → the request, the decision and the guest it added. */
  resolvedRequests: Record<ID, { request: AccessRequest; approve: boolean; guestId?: ID }>
  /** "Notify me" requests. */
  notify: { eventId: ID; phone: string; createdAt: string; notifiedAt?: string }[]
  /** Face finding runs started by reindexFaces: eventId → start time and photo count (pending counts down). */
  faceScan: Record<ID, { startedAt: number; total: number }>
  /**
   * Copies made by copyPhotosToAlbum (e.g. a guest-picks album): copy photo id → the photo it was copied from.
   * Copies share the original file and are excluded from the event's photoCount/quota total (see recount).
   */
  copiedFrom: Record<ID, ID>
  /** The download log: one row per photo actually downloaded (see DownloadEvent). Source of truth for every
   * download count (getEventStats' `downloads`, the Guests tab stat) — nothing else increments separately. */
  downloadEvents: DownloadEvent[]
}

const EXTRA_DEFAULTS = (): MockExtra => ({
  coupons: [], usageReport: null, guestIds: {}, pinVerified: [], vipPin: [], downloadUses: {}, followed: [], recent: {}, myOrders: [], cartReminders: {}, assets: [],
  removedGuests: {}, resolvedRequests: {}, notify: [], faceScan: {}, copiedFrom: {}, downloadEvents: [],
})

/**
 * `deleted`: photos gone for good. `trashed`: photo id → when it went to the trash (restorePhotos brings it back).
 */
interface Stored { seed: SeedState; photoPatches: Record<ID, Partial<Photo>>; deleted: ID[]; trashed: Record<ID, string>; added: Photo[]; extra: MockExtra }

/** How long simulated face finding takes after reindexFaces. */
const FACE_SCAN_MS = 6000
/** Handles other (pretend) studios already use, so checkHandle can say "taken" in the demo. */
const TAKEN_HANDLES = new Set(['lumen', 'pixelwala', 'shutterbug', 'candid', 'weddingstory', 'studiolumen'])
const digits = (v: string | undefined) => (v ?? '').replace(/\D/g, '')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const clone = <T,>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)))
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms))
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`
const DAY = 86_400_000
const GALLERY_ORIGIN = 'https://frameline.in'
const round2 = (n: number) => Math.round(n * 100) / 100
/** Ledger descriptions name the wallet pot a spend came from (mock and apps/api use the same words). */
export const WALLET_POT_LABEL = { prepaid: 'from added money', earnings: 'from sales' } as const
const fail = (status: number, code: string, detail: string, ext: Record<string, unknown> = {}): never => {
  throw new ApiError({ status, code, detail, problem: { status, code, detail, ...ext } })
}

/** Fills fields added after a browser saved its state, so old localStorage keeps working. */
function upgrade(stored: Partial<Stored>): Stored {
  const fresh = createSeed()
  const seed = { ...fresh, ...(stored.seed ?? {}) } as SeedState
  seed.studio = { ...fresh.studio, ...seed.studio }
  seed.watermark = { ...fresh.watermark, ...seed.watermark, edgeOffset: seed.watermark?.edgeOffset ?? 3 }
  seed.enquiries = seed.enquiries.map((e) => ({ ...e, status: e.status ?? 'new' }))
  seed.storeSettings = { ...fresh.storeSettings, ...seed.storeSettings }
  const freshAlbums = new Map(fresh.albums.map((a) => [a.id, a]))
  seed.albums = seed.albums.map((a) => ({ ...a, firstCapture: a.firstCapture ?? freshAlbums.get(a.id)?.firstCapture, lastCapture: a.lastCapture ?? freshAlbums.get(a.id)?.lastCapture }))
  // Contract v5 fields on data saved by older versions.
  seed.events = seed.events.map((e) => ({
    ...e, settings: withSettingsDefaults(e.settings),
    hosts: (e.hosts ?? []).map((h) => ({ ...h, access: h.access ?? 'full', status: h.status ?? 'invited' })),
  }))
  const freshCams = new Map(fresh.cameras.map((c) => [c.id, c]))
  seed.cameras = seed.cameras.map((c) => ({ ...c, lastUploadAt: c.lastUploadAt ?? freshCams.get(c.id)?.lastUploadAt }))
  const added = (stored.added ?? []).map((p) => ({ ...p, quality: p.quality ?? 'web', views: p.views ?? 0, rotation: p.rotation ?? 0 }))
  return {
    seed,
    photoPatches: stored.photoPatches ?? {},
    deleted: stored.deleted ?? [],
    trashed: stored.trashed ?? {},
    added,
    extra: { ...EXTRA_DEFAULTS(), ...(stored.extra ?? {}) },
  }
}

/** JSON replacer: object URLs only live for this page session, so never persist them. */
const dropBlobUrls = (key: string, value: unknown) => (key === 'url' && typeof value === 'string' && value.startsWith('blob:') ? undefined : value)

export function createMockApi(persist?: Persistence, opts: { latency?: number } = {}): FramelineApi {
  const latency = opts.latency ?? 120
  let state: Stored
  /** The stored copy we last loaded or wrote: another tab's write shows up as a different string. */
  let lastRaw: string | null = null
  const parse = (raw: string | null | undefined): Stored => {
    try {
      const st = raw ? upgrade(JSON.parse(raw) as Partial<Stored>) : upgrade({})
      if (!st.seed?.events) throw new Error('bad state')
      return st
    } catch {
      return upgrade({})
    }
  }
  try { lastRaw = persist?.load() ?? null } catch { lastRaw = null }
  state = parse(lastRaw)
  // Processing finishes on timers that die with the page: photos still "processing" from an earlier visit are done.
  {
    const stale = Date.now() - 2 * 60_000
    state.added.forEach((p) => { if (p.status === 'processing' && Date.parse(p.capturedAt) < stale) p.status = 'ready' })
  }
  const listeners = new Set<(t: ChangeTopic) => void>()
  /** Generated seed photos per album: deterministic, so cached for the page's lifetime. */
  const baseCache = new Map<ID, Photo[]>()
  /** Materialised album contents (base + added + moves − deletes, patches applied). Cleared on every mutation. */
  const albumCache = new Map<ID, Photo[]>()
  let movedInto: Map<ID, ID[]> | null = null
  let deletedSet: Set<ID> | null = null
  const pinTries = new Map<string, { count: number; lockedUntil: number }>()

  const invalidate = () => { albumCache.clear(); movedInto = null; deletedSet = null }
  const save = () => {
    try {
      const raw = JSON.stringify(state, dropBlobUrls)
      persist?.save(raw)
      lastRaw = raw
    } catch { /* storage full or unavailable */ }
  }
  const emit = (...topics: ChangeTopic[]) => { invalidate(); save(); new Set(topics).forEach((t) => listeners.forEach((l) => l(t))) }
  const ALL_TOPICS: ChangeTopic[] = ['events', 'albums', 'photos', 'studio', 'usage', 'guests', 'activity', 'misc']
  /** Another tab wrote: take its copy and tell every screen to refetch. */
  const adopt = (raw: string | null) => {
    if (raw === lastRaw) return
    lastRaw = raw
    state = parse(raw)
    invalidate()
    purgeTrash()
    ALL_TOPICS.forEach((t) => listeners.forEach((l) => l(t)))
  }
  /** Re-reads the stored copy before acting, so a tab never overwrites what another tab just saved. */
  const refreshIfChanged = () => {
    if (!persist) return
    let raw: string | null
    try { raw = persist.load() } catch { return }
    if (raw !== null && raw !== lastRaw) adopt(raw)
  }
  persist?.subscribe?.((raw) => { if (raw !== null) adopt(raw) })
  const s = () => state.seed
  const findEvent = (id: ID, opts: { includeDeleted?: boolean } = {}) => {
    const e = s().events.find((x) => (x.id === id || x.shortId.toLowerCase() === id.toLowerCase()) && (opts.includeDeleted || !x.deletedAt))
    if (!e) fail(404, 'not_found', `Event ${id} was not found.`)
    return e!
  }
  /** Empties the trash of anything deleted more than TRASH_DAYS ago (the real API runs this from the daily cron). */
  function purgeTrash(now = Date.now()) {
    const cutoff = now - TRASH_DAYS * DAY
    const old = (at?: string) => !!at && Date.parse(at) < cutoff
    const purged = new Set(s().events.filter((e) => old(e.deletedAt)).map((e) => e.id))
    const goneAlbums = new Set(s().albums.filter((a) => purged.has(a.eventId) || old(a.deletedAt)).map((a) => a.id))
    let changed = purged.size > 0 || goneAlbums.size > 0
    if (purged.size) s().events = s().events.filter((e) => !purged.has(e.id))
    if (goneAlbums.size) s().albums = s().albums.filter((a) => !goneAlbums.has(a.id))
    state.added = state.added.filter((p) => !purged.has(p.eventId) && !goneAlbums.has(p.albumId))
    for (const [id, at] of Object.entries(state.trashed)) {
      if (old(at)) { delete state.trashed[id]; state.deleted.push(id); changed = true }
    }
    const qrs = s().qrs.filter((q) => !old(q.deletedAt))
    const bcs = s().broadcasts.filter((b) => !old(b.deletedAt))
    if (qrs.length !== s().qrs.length || bcs.length !== s().broadcasts.length) changed = true
    s().qrs = qrs
    s().broadcasts = bcs
    if (changed) invalidate()
    return changed
  }
  purgeTrash()
  /** Due Smart QR switches (the real API runs these from a Cron Trigger). */
  const applyQrSchedules = () => {
    let changed = false
    for (const q of s().qrs) {
      if (q.deletedAt) continue
      if (q.scheduledEventId && q.scheduledAt && Date.parse(q.scheduledAt) <= Date.now()) {
        q.eventId = q.scheduledEventId
        delete q.scheduledEventId
        delete q.scheduledAt
        changed = true
      }
    }
    if (changed) emit('misc')
  }
  const findAlbum = (id: ID) => { const a = s().albums.find((x) => x.id === id && !x.deletedAt); if (!a) fail(404, 'not_found', `Album ${id} was not found.`); return a! }
  const liveAlbums = () => s().albums.filter((a) => !a.deletedAt)
  const byId = <T extends { id: ID }>(list: T[], id: ID, what: string): T => { const x = list.find((i) => i.id === id); if (!x) fail(404, 'not_found', `${what} ${id} was not found.`); return x! }

  /** The generated count is the album's count at seed time; later changes are tracked via patches. */
  const seedCounts = new Map<ID, number>(createSeed().albums.map((a) => [a.id, a.photoCount]))
  const baseCount = (a: Album) => seedCounts.get(a.id) ?? 0

  function basePhotos(album: Album): Photo[] {
    let base = baseCache.get(album.id)
    if (!base) {
      const event = s().events.find((e) => e.id === album.eventId)
      base = event ? generatePhotos({ ...album, photoCount: baseCount(album) }, event) : []
      baseCache.set(album.id, base)
    }
    return base
  }

  function findPhotoRaw(id: ID): Photo | undefined {
    const added = state.added.find((p) => p.id === id)
    if (added) return added
    const m = /^(.*)_p(\d+)$/.exec(id)
    if (!m) return undefined
    const album = s().albums.find((a) => a.id === m[1])
    if (!album) return undefined
    return basePhotos(album)[Number(m[2])]
  }

  function albumPhotos(album: Album): Photo[] {
    const cached = albumCache.get(album.id)
    if (cached) return cached
    if (!movedInto) {
      movedInto = new Map()
      for (const [id, p] of Object.entries(state.photoPatches)) if (p.albumId) movedInto.set(p.albumId, [...(movedInto.get(p.albumId) ?? []), id])
    }
    deletedSet ??= new Set([...state.deleted, ...Object.keys(state.trashed)])
    const seen = new Set<ID>()
    const out: Photo[] = []
    const push = (p: Photo | undefined) => {
      if (!p || seen.has(p.id) || deletedSet!.has(p.id)) return
      seen.add(p.id)
      const merged = { ...p, ...state.photoPatches[p.id] }
      if (merged.albumId === album.id) out.push(merged)
    }
    basePhotos(album).forEach(push)
    state.added.forEach((p) => { if (p.albumId === album.id) push(p) })
    for (const id of movedInto.get(album.id) ?? []) push(findPhotoRaw(id))
    albumCache.set(album.id, out)
    return out
  }

  const getPhotoMerged = (id: ID): Photo | undefined => {
    if ((deletedSet ??= new Set([...state.deleted, ...Object.keys(state.trashed)])).has(id)) return undefined
    return getPhotoAny(id)
  }
  /** A photo whether or not it's in the trash (not if purged). */
  const getPhotoAny = (id: ID): Photo | undefined => {
    if (state.deleted.includes(id)) return undefined
    const raw = findPhotoRaw(id)
    return raw ? { ...raw, ...state.photoPatches[id] } : undefined
  }
  const patchPhoto = (id: ID, patch: Partial<Photo>) => {
    const added = state.added.find((p) => p.id === id)
    if (added) Object.assign(added, patch)
    else state.photoPatches[id] = { ...state.photoPatches[id], ...patch }
    albumCache.clear()
  }

  function recount(eventId: ID) {
    const ev = s().events.find((e) => e.id === eventId)
    if (!ev) return
    albumCache.clear()
    let total = 0
    for (const a of liveAlbums().filter((x) => x.eventId === eventId)) {
      const ps = albumPhotos(a)
      a.photoCount = ps.length
      const caps = ps.map((p) => p.capturedAt).sort()
      a.firstCapture = caps[0]
      a.lastCapture = caps[caps.length - 1]
      // Copies (copyPhotosToAlbum) share the original file: they count in their own album (a.photoCount, shown
      // above) but never a second time in the event total, which plan/event photo limits are checked against.
      if (a.kind !== 'store') total += ps.filter((p) => !state.extra.copiedFrom[p.id]).length
    }
    ev.photoCount = total
  }

  function filterPhotos(eventId: ID, q: PhotoIdsQuery): Photo[] {
    const albums = liveAlbums().filter((a) => a.eventId === eventId && (q.albumId ? a.id === q.albumId : a.kind === 'album'))
    let items = albums.flatMap(albumPhotos)
    if (q.filter === 'hidden') items = items.filter((p) => p.hidden)
    else if (q.filter === 'favourites') items = items.filter((p) => p.favourites > 0)
    else if (q.filter === 'people') items = items.filter((p) => p.faces.length > 0)
    if (q.personId) items = items.filter((p) => p.faces.some((f) => f.personId === q.personId))
    return sortPhotos(items, q.sort)
  }
  function sortPhotos(items: Photo[], sort: PhotoSort = 'capture') {
    return [...items].sort((a, b) => sort === 'name' ? a.filename.localeCompare(b.filename) || a.id.localeCompare(b.id)
      : sort === 'sequence' ? a.index - b.index
        : sort === 'newest' ? b.capturedAt.localeCompare(a.capturedAt) || b.id.localeCompare(a.id)
          : a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id))
  }

  // ── Money helpers ─────────────────────────────────────────────────────────
  const balance = () => s().ledger[0]?.balance ?? 0
  function ledger(type: LedgerEntry['type'], description: string, amount: number, movesBalance: boolean): LedgerEntry {
    const entry: LedgerEntry = { id: uid('l'), at: new Date().toISOString(), description, type, amount: round2(amount), balance: round2(balance() + (movesBalance ? amount : 0)) }
    s().ledger.unshift(entry)
    return entry
  }
  /**
   * Spends from the one "Wallet": prepaid (Add money, coupons) first, then positive store earnings. Each pot used
   * gets its own 'credits-used' line naming it (the earnings line moves the payout balance). Same rule as
   * apps/api services/billing.ts spendFromWallet. Returns the first line written.
   */
  function debitWallet(amount: number, description: string) {
    const prepaid = Math.max(0, s().usage.walletCredits)
    const earnings = Math.max(0, balance())
    const available = round2(prepaid + earnings)
    if (available < amount) fail(402, 'insufficient_credits', `You need ₹${amount} but your wallet has ₹${available}. Add money to your wallet and try again.`, { required: amount, available })
    const fromPrepaid = round2(Math.min(prepaid, amount))
    const fromEarnings = round2(amount - fromPrepaid)
    const lines: LedgerEntry[] = []
    if (fromPrepaid > 0) {
      s().usage.walletCredits = round2(s().usage.walletCredits - fromPrepaid)
      lines.push(ledger('credits-used', `${description} · ${WALLET_POT_LABEL.prepaid}`, -fromPrepaid, false))
    }
    if (fromEarnings > 0) lines.push(ledger('credits-used', `${description} · ${WALLET_POT_LABEL.earnings}`, -fromEarnings, true))
    return lines[0]
  }
  const invoice = () => `FL-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`
  function purchase(p: Omit<Purchase, 'id' | 'at' | 'invoiceNumber'>): Purchase {
    const full: Purchase = { ...p, id: uid('pu'), at: new Date().toISOString(), invoiceNumber: invoice() }
    s().purchases.unshift(full)
    return full
  }
  const randomPassword = () => Array.from({ length: 12 }, () => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 55)]).join('')
  const accessLabel = (m: Pick<TeamMember, 'role' | 'eventIds'>) => {
    if (m.role === 'owner') return 'All events, billing, payouts'
    if (m.role === 'editor') return 'All events'
    const names = (m.eventIds ?? []).map((id) => s().events.find((e) => e.id === id)?.name).filter(Boolean)
    return names.length ? `${names.join(', ')} only` : 'Assigned events only'
  }

  // ── Guest helpers ─────────────────────────────────────────────────────────
  const publicStudio = (): PublicStudio => {
    const st = s().studio
    return {
      id: st.id, name: st.name, handle: st.handle, logoUrl: st.logoUrl, brandColor: st.brandColor, phone: st.phone, email: st.email, website: st.website,
      instagram: st.instagram, city: st.city, followCode: st.followCode, whatsapp: st.whatsapp?.trim() || st.phone,
    }
  }
  const blockedReason = (e: PhotoEvent): PublicEvent['blocked'] =>
    e.settings.disabled ? 'disabled' : e.status === 'archived' ? 'archived' : Date.parse(e.expiresAt) < Date.now() ? 'expired' : e.status === 'draft' && e.photoCount === 0 ? 'empty' : undefined
  const visibleToGuests = (p: Photo) => !p.hidden && p.status === 'ready' && p.reviewStatus !== 'pending' && p.reviewStatus !== 'rejected'
  /** The guest this device signed up as for an event, unless the studio removed them. */
  const myGuest = (eventId: ID) => {
    const id = state.extra.guestIds[eventId]
    return id && !state.extra.removedGuests[id] ? s().guests.find((x) => x.id === id) : undefined
  }
  const liveGuests = () => s().guests.filter((g) => !state.extra.removedGuests[g.id])
  /** Tells everyone waiting on "Notify me" that the event's first photos are in (simulated message). */
  function notifyWaiting(eventId: ID) {
    const e = s().events.find((x) => x.id === eventId)
    const waiting = state.extra.notify.filter((n) => n.eventId === eventId && !n.notifiedAt)
    if (!e || !waiting.length) return
    const at = new Date().toISOString()
    for (const n of waiting) {
      n.notifiedAt = at
      console.info(`[frameline mock] SMS to ${n.phone}: The photos from ${e.name} are here: ${GALLERY_ORIGIN}/${e.shortId.toLowerCase()}`)
    }
    s().activity.unshift({ id: uid('a'), kind: 'registration', title: `Told ${waiting.length} ${waiting.length === 1 ? 'guest' : 'guests'} the photos are here`, detail: e.name, at })
  }
  const normHost = (h: EventHost, prev?: EventHost): EventHost => ({
    ...h, access: h.access ?? prev?.access ?? 'full', status: h.status ?? prev?.status ?? 'invited', invitedAt: h.invitedAt ?? prev?.invitedAt ?? new Date().toISOString(),
  })
  function session(e: PhotoEvent, seeAll: boolean, guestId?: ID): GuestSession {
    return { token: `mock.${e.id}.${guestId ?? ''}.${seeAll ? 1 : 0}`, expiresIn: 12 * 3600, eventId: e.id, shortId: e.shortId, guestId, seeAll }
  }
  function studioFor(code: string) {
    const st = s().studio
    const c = code.trim().toLowerCase()
    if (st.followCode.toLowerCase() !== c && st.handle.toLowerCase() !== c) fail(404, 'not_found', `Studio ${code} was not found.`)
    return st
  }
  function publicAlbums(e: PhotoEvent) {
    return liveAlbums().filter((a) => a.eventId === e.id && a.kind !== 'store').sort((a, b) => a.order - b.order)
  }
  /** Face finding progress for an event: photos still processing, plus a running reindexFaces scan. */
  function faceProgress(e: PhotoEvent) {
    // Copies (copyPhotosToAlbum) share the original's face data and status: counted once, under the original.
    const photos = liveAlbums().filter((a) => a.eventId === e.id && a.kind === 'album').flatMap(albumPhotos).filter((p) => !state.extra.copiedFrom[p.id])
    const total = photos.length
    const processing = photos.filter((p) => p.status === 'processing').length
    const scan = state.extra.faceScan[e.id]
    let scanning = 0
    if (scan) {
      const left = 1 - (Date.now() - scan.startedAt) / FACE_SCAN_MS
      if (left <= 0) delete state.extra.faceScan[e.id]
      else scanning = Math.min(total, Math.ceil(scan.total * left))
    }
    const pending = Math.min(total, Math.max(processing, scanning))
    return { photos, faces: { ready: total - pending, total, pending } }
  }
  const monthKey = (iso: string | number) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
  function statsFor(events: PhotoEvent[], orders: Order[]): StatsTotals {
    let downloads = 0, photoViews = 0, photosDelivered = 0
    for (const e of events) {
      for (const a of liveAlbums().filter((x) => x.eventId === e.id && x.kind !== 'store')) {
        for (const p of albumPhotos(a)) {
          downloads += p.downloads
          photoViews += p.views
          if (a.kind === 'album') photosDelivered++
        }
      }
    }
    const sales = orders.filter((o) => o.currency === 'INR' && (o.status === 'paid' || o.status === 'printing'))
    return {
      visits: events.reduce((n, e) => n + e.visits.web + e.visits.android + e.visits.ios, 0),
      downloads, faceSearches: events.reduce((n, e) => n + e.faceMatches, 0), photoViews, photosDelivered,
      sales: round2(sales.reduce((n, o) => n + o.paid, 0)), orders: sales.length,
    }
  }

  /** Runs the simulated ₹1 check against the saved payout details and stores the result. */
  function runPayoutCheck(): PayoutCheck {
    const st = s().storeSettings
    const check = simulatePayoutCheck({ holder: st.payout.holder, legalName: st.kyc.legalName, ifsc: st.payout.ifsc, accountLast4: st.payout.accountLast4 })
    st.payout.check = check
    st.payout.verified = check.status === 'verified'
    return check
  }

  const api: FramelineApi = {
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },

    // ── Studio ──────────────────────────────────────────────────────────────
    async getStudio() { await wait(latency); return clone(s().studio) },
    async updateStudio(patch) {
      await wait(latency)
      if (patch.handle !== undefined && patch.handle !== s().studio.handle) {
        const bad = handleProblem(patch.handle)
        if (bad?.reason === 'invalid') fail(422, 'validation_failed', 'Use 3–40 lowercase letters, numbers or dashes.', { errors: [{ field: 'handle', in: 'body', message: 'Use 3–40 lowercase letters, numbers or dashes', code: 'invalid_string' }] })
        if (bad || TAKEN_HANDLES.has(patch.handle.trim().toLowerCase())) fail(409, 'handle_taken', `The handle "${patch.handle}" is taken. Try another.`)
      }
      const { id: _id, followCode: _fc, followers: _f, ...rest } = patch
      Object.assign(s().studio, rest)
      emit('studio')
      return clone(s().studio)
    },
    async getUsage() { await wait(latency); return clone(s().usage) },
    async getUsageBreakdown() {
      await wait(latency)
      const u = s().usage
      const events = s().events.filter((e) => !e.deletedAt).map((e) => {
        const albums = liveAlbums().filter((a) => a.eventId === e.id)
        const guestUploads = albums.filter((a) => a.kind === 'guest').reduce((n, a) => n + a.photoCount, 0)
        const originals = state.added.filter((p) => p.eventId === e.id && p.quality === 'original' && !state.trashed[p.id]).length
        const webPhotos = albums.filter((a) => a.kind === 'album').reduce((n, a) => n + a.photoCount, 0) - originals
        return { eventId: e.id, name: e.name, webPhotos, originals, guestUploads, counted: webPhotos + originals * 2 }
      })
      return {
        limit: u.photosLimit, used: u.photosUsed, guestReserved: u.guestReserved, available: Math.max(0, u.photosLimit - u.photosUsed - u.guestReserved),
        rules: [
          'Each photo uploaded in web quality counts as 1.',
          'Each photo uploaded as an original counts as 2.',
          'Guest uploads use the space reserved for guests (the upload limit you set per event), not your photos.',
          'Deleting photos doesn’t give space back until the next billing period.',
          'Copies of a photo in another album don’t count again.',
        ],
        events,
      }
    },
    async requestUsageReport() {
      await wait(latency)
      const report: UsageReport = { id: uid('rep'), status: 'processing', requestedAt: new Date().toISOString() }
      state.extra.usageReport = report
      emit('usage')
      setTimeout(() => {
        const rows = [['Event', 'Short code', 'Date', 'Photos', 'Photo limit', 'Status'], ...s().events.map((e) => [e.name, e.shortId, e.date.slice(0, 10), String(e.photoCount), String(e.photoLimit), e.status])]
        const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
        state.extra.usageReport = { ...report, status: 'ready', readyAt: new Date().toISOString(), csv }
        emit('usage')
      }, 1200)
      return clone(report)
    },
    async getUsageReport() { await wait(latency / 2); return clone(state.extra.usageReport) },

    // ── Events ──────────────────────────────────────────────────────────────
    async listEvents() { await wait(latency); return clone(s().events.filter((e) => !e.deletedAt)) },
    async getEvent(id) { await wait(latency); return clone(findEvent(id)) },
    async createEvent(input) {
      await wait(latency)
      const shortId = (hash(input.name + Date.now()) >>> 0).toString(16).toUpperCase().slice(0, 7).padEnd(7, '0')
      const id = uid('ev')
      const t = hash(id)
      const event: PhotoEvent = {
        id, shortId, name: input.name, type: input.type, date: new Date(input.date).toISOString(), city: input.city,
        status: 'draft', photoCount: 0, photoLimit: 2000, visits: { web: 0, android: 0, ios: 0 }, faceMatches: 0,
        expiresAt: new Date(new Date(input.date).getTime() + 365 * DAY).toISOString(), createdAt: new Date().toISOString(),
        coverTones: [tone(t), tone(t + 3), tone(t + 7)],
        settings: defaultSettings({ ...PRESETS[input.preset].settings, guestUploadLimit: input.guestUploadLimit, pin: String(1000 + (t % 9000)) }),
        hosts: input.host?.email ? [normHost({ id: uid('h'), name: input.host.email.split('@')[0], email: input.host.email, phone: input.host.phone, role: 'client' })] : [],
        highlights: true, plan: 'subscription',
      }
      s().events.unshift(event)
      s().albums.push({ id: `${id}_guest`, eventId: id, name: 'Guest uploads', order: 99, photoCount: 0, kind: 'guest' })
      emit('events', 'albums')
      return clone(event)
    },
    async updateEvent(id, patch) {
      await wait(latency)
      const e = findEvent(id)
      if (patch.shortId !== undefined && patch.shortId.toUpperCase() !== e.shortId) {
        const next = patch.shortId.toUpperCase()
        if (!/^[A-Z0-9]{7}$/.test(next)) fail(422, 'validation_failed', 'The gallery code is 7 letters or digits.', { errors: [{ field: 'shortId', in: 'body', message: 'Use 7 letters or digits', code: 'invalid_string' }] })
        if (s().events.some((x) => x.id !== e.id && x.shortId === next)) fail(409, 'short_id_taken', `The gallery code ${next} is already used. Try another.`)
        patch = { ...patch, shortId: next }
      }
      if (patch.hosts) {
        const before = new Map(e.hosts.map((h) => [h.id, h]))
        patch = { ...patch, hosts: patch.hosts.map((h) => normHost(h, before.get(h.id))) }
        for (const h of patch.hosts!) if (!before.has(h.id)) console.info(`[frameline mock] Host invite to ${h.email || h.phone} for ${e.name}`)
      }
      Object.assign(e, patch)
      emit('events')
      return clone(e)
    },
    async updateEventSettings(id, patch) {
      await wait(latency / 2)
      if (patch.priceOverrides) {
        for (const [k, v] of Object.entries(patch.priceOverrides)) if (!(typeof v === 'number' && v >= 0)) fail(422, 'validation_failed', `The price for ${k} must be 0 or more.`)
      }
      Object.assign(findEvent(id).settings, patch)
      emit('events')
      return clone(findEvent(id))
    },
    async resetPin(id) { await wait(latency); const pin = String(1000 + Math.floor(Math.random() * 9000)); findEvent(id).settings.pin = pin; emit('events'); return pin },
    async deleteEvent(id, o = {}) {
      await wait(latency)
      if (o.permanent) {
        const e = findEvent(id, { includeDeleted: true })
        if (!e.deletedAt) fail(409, 'not_in_trash', 'Move the event to the trash first. Only events in Recently deleted can be deleted for good.')
        s().events = s().events.filter((x) => x.id !== e.id)
        s().albums = s().albums.filter((a) => a.eventId !== e.id)
        state.added = state.added.filter((p) => p.eventId !== e.id)
        s().cameras = s().cameras.filter((c) => c.eventId !== e.id)
        s().qrs = s().qrs.filter((q) => q.eventId !== e.id)
        emit('events', 'albums', 'photos', 'misc')
        return
      }
      findEvent(id).deletedAt = new Date().toISOString()
      emit('events', 'albums', 'photos')
    },
    async renewEvent(eventId, { payWith }) {
      await wait(latency)
      const e = findEvent(eventId)
      const charged = payWith === 'credits' ? BASE_RENEWAL * (1 - RENEWAL_CREDIT_DISCOUNT) : BASE_RENEWAL
      if (payWith === 'credits') debitWallet(charged, `Renewal · ${e.name} (+1 year)`)
      purchase({ description: `Event renewal · ${e.name}`, kind: 'renewal', amount: charged, method: payWith === 'credits' ? 'credits' : 'card' })
      e.expiresAt = new Date(Math.max(Date.now(), Date.parse(e.expiresAt)) + 365 * DAY).toISOString()
      if (e.status === 'expiring' || e.status === 'archived') e.status = 'live'
      emit('events', 'usage', 'misc')
      return { event: clone(e), charged, payWith }
    },
    async createRenewalLink(eventId) {
      await wait(latency)
      const e = findEvent(eventId)
      return { url: `${GALLERY_ORIGIN}/renew/${e.shortId.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`, price: BASE_RENEWAL * s().usage.renewalMultiplier, expiresAt: new Date(Date.now() + 30 * DAY).toISOString() }
    },
    async createGuestLink(eventId, payload) {
      await wait(latency / 2)
      const e = findEvent(eventId)
      const full = cleanGuestLinkPayload({ ...payload, e: e.shortId })
      const kind = guestLinkKind(full)
      const code = encodeGuestToken(full)
      return { code, kind, path: `/${kind}/${code}`, url: `${GALLERY_ORIGIN}/${kind}/${code}`, payload: full }
    },

    // ── Albums & photos ─────────────────────────────────────────────────────
    async listAlbums(eventId) { await wait(latency); return clone(liveAlbums().filter((a) => a.eventId === eventId).sort((a, b) => a.order - b.order)) },
    async createAlbum(eventId, name) {
      await wait(latency)
      const order = Math.max(-1, ...liveAlbums().filter((a) => a.eventId === eventId && a.kind === 'album').map((a) => a.order)) + 1
      const album: Album = { id: uid(`${eventId}_al`), eventId, name, order, photoCount: 0, kind: 'album' }
      s().albums.push(album); emit('albums'); return clone(album)
    },
    async renameAlbum(id, name) { await wait(latency); findAlbum(id).name = name; emit('albums'); return clone(findAlbum(id)) },
    async deleteAlbum(id) {
      await wait(latency)
      const a = findAlbum(id)
      const at = new Date().toISOString()
      albumPhotos(a).forEach((p) => { state.trashed[p.id] = at })
      a.deletedAt = at
      invalidate()
      recount(a.eventId)
      emit('albums', 'events', 'photos')
    },
    async reorderAlbums(eventId, ids) { await wait(latency / 2); ids.forEach((id, i) => { const a = s().albums.find((x) => x.id === id && x.eventId === eventId); if (a) a.order = i }); emit('albums') },

    async listPhotos(eventId, q = {}) {
      await wait(latency)
      const items = filterPhotos(eventId, q)
      const offset = q.offset ?? 0
      return { total: items.length, items: clone(items.slice(offset, q.limit ? offset + q.limit : undefined)) }
    },
    async listPhotoIds(eventId, q = {}) { await wait(latency / 2); return filterPhotos(eventId, q).map((p) => p.id) },
    async getPhoto(id) { await wait(latency / 2); const p = getPhotoMerged(id); if (!p) fail(404, 'not_found', `Photo ${id} was not found.`); return clone(p!) },
    async updatePhotos(ids, patch) {
      await wait(latency)
      const events = new Set<ID>()
      ids.forEach((id) => { const p = getPhotoMerged(id); if (p) { events.add(p.eventId); patchPhoto(id, patch) } })
      invalidate()
      events.forEach(recount); emit('photos', 'albums', 'events')
    },
    async deletePhotos(ids) {
      await wait(latency)
      const events = new Set<ID>()
      const at = new Date().toISOString()
      ids.forEach((id) => { const p = getPhotoMerged(id); if (p) { events.add(p.eventId); state.trashed[id] = at } })
      invalidate()
      events.forEach(recount); emit('photos', 'albums', 'events')
    },
    async copyPhotosToAlbum(ids, albumId) {
      await wait(latency)
      const album = findAlbum(albumId)
      let next = albumPhotos(album).reduce((m, p) => Math.max(m, p.index), 0)
      const copies: Photo[] = []
      for (const id of ids) {
        const p = getPhotoMerged(id)
        if (!p || p.eventId !== album.eventId) continue
        const copyId = uid(`${albumId}_cp`)
        copies.push({ ...clone(p), id: copyId, albumId, index: ++next, favourites: 0, downloads: 0, views: 0 })
        // Shares the original file and never counts a second time in the event's photoCount/quota (see recount).
        state.extra.copiedFrom[copyId] = id
      }
      state.added.push(...copies)
      invalidate()
      recount(album.eventId)
      emit('photos', 'albums', 'events')
      return clone(copies)
    },
    async setPhotoReview(ids, status) {
      await wait(latency / 2)
      ids.forEach((id) => { if (getPhotoMerged(id)) patchPhoto(id, { reviewStatus: status }) })
      emit('photos', 'albums')
    },
    async setCover(eventId, photoId, scope) {
      await wait(latency)
      const p = getPhotoMerged(photoId)
      if (!p) fail(404, 'not_found', `Photo ${photoId} was not found.`)
      if (scope === 'event') { const e = findEvent(eventId); e.coverPhotoId = photoId; e.coverTones = [p!.tone, e.coverTones[1], e.coverTones[2]] }
      else findAlbum(p!.albumId).coverPhotoId = photoId
      emit('events', 'albums')
    },
    async uploadPhotos(eventId, albumId, files, opts) {
      await wait(latency)
      const album = findAlbum(albumId)
      const ev = findEvent(eventId)
      const start = albumPhotos(album).reduce((m, p) => Math.max(m, p.index), 0)
      const source = opts.source ?? (album.kind === 'guest' ? 'guest' : 'web')
      const review = source === 'guest' && ev.settings.reviewGuestUploads
      const created: Photo[] = files.map((f, i) => ({
        id: uid(`${albumId}_up`), eventId, albumId, filename: f.filename, index: start + i + 1,
        capturedAt: new Date().toISOString(), tone: tone(hash(f.filename)), url: f.url, status: 'processing', hidden: false,
        favourites: 0, downloads: 0, faces: [],
        exif: { width: f.width ?? 6000, height: f.height ?? 4000, sizeBytes: f.size },
        uploadedBy: opts.uploadedBy ?? (source === 'guest' ? 'Guest' : 'You'), source,
        ...(review ? { reviewStatus: 'pending' as const } : source === 'guest' ? { reviewStatus: 'approved' as const } : {}),
        quality: opts.quality === 'original' ? 'original' : 'web', views: 0, rotation: 0,
      }))
      state.added.push(...created)
      if (ev.status === 'draft') ev.status = 'uploading'
      if (source === 'guest') s().usage.guestReserved = Math.max(0, s().usage.guestReserved)
      else s().usage.photosUsed += created.length * (opts.quality === 'original' ? 2 : 1)
      invalidate()
      recount(eventId)
      emit('photos', 'albums', 'events', 'usage')
      const step = opts.fast ? 80 : 260
      created.forEach((p, i) => setTimeout(() => {
        const stored = state.added.find((x) => x.id === p.id)
        if (stored) stored.status = 'ready'
        if (i === created.length - 1 && ev.status === 'uploading') ev.status = 'live'
        const live = source !== 'guest' || !review
        if (live && state.extra.notify.some((n) => n.eventId === eventId && !n.notifiedAt)) { notifyWaiting(eventId); emit('photos', 'events', 'activity'); return }
        emit('photos', ...(i === created.length - 1 ? (['events'] as ChangeTopic[]) : []))
      }, (opts.fast ? 200 : 900) + i * step))
      return clone(created)
    },
    async enhancePhoto(photoId, o) {
      await wait(latency * 3)
      const p = getPhotoMerged(photoId)
      if (!p) fail(404, 'not_found', `Photo ${photoId} was not found.`)
      const label = o.prompt ? `“${o.prompt.slice(0, 40)}”` : (o.preset ?? 'auto')
      debitWallet(ENHANCE_COST, `AI enhance · ${p!.filename} (${label})`)
      const shifted = tone(hash(`${photoId}:${label}`))
      let result: Photo
      if (o.saveAs === 'new') {
        const album = findAlbum(p!.albumId)
        const next = albumPhotos(album).reduce((m, x) => Math.max(m, x.index), 0) + 1
        result = { ...clone(p!), id: uid(`${p!.albumId}_en`), index: next, filename: p!.filename.replace(/(\.[^.]+)?$/, '-enhanced$1'), tone: shifted, favourites: 0, downloads: 0, views: 0, enhancedFrom: photoId }
        state.added.push(result)
        invalidate()
        recount(p!.eventId)
      } else {
        patchPhoto(photoId, { tone: shifted, enhancedFrom: photoId })
        result = getPhotoMerged(photoId)!
      }
      emit('photos', 'albums', 'usage', 'misc')
      return clone(result)
    },
    async reindexFaces(eventId) {
      await wait(latency)
      const e = findEvent(eventId)
      const total = faceProgress(e).faces.total
      state.extra.faceScan[e.id] = { startedAt: Date.now(), total }
      save()
      for (let t = 1000; t <= FACE_SCAN_MS + 500; t += 1000) setTimeout(() => emit('photos', 'events'), t)
      return { queued: total }
    },
    async requestZip(eventId, email, o = {}) {
      await wait(latency)
      const e = findEvent(eventId)
      const targetAlbum = o.albumId ? findAlbum(o.albumId) : undefined
      const ids = o.photoIds ?? (targetAlbum ? albumPhotos(targetAlbum) : liveAlbums().filter((a) => a.eventId === e.id && a.kind === 'album').flatMap(albumPhotos)).map((p) => p.id)
      const z: ZipRequest = { id: uid('zip'), eventId: e.id, albumId: o.albumId, email, photoCount: ids.length, status: 'queued', requestedAt: new Date().toISOString() }
      s().zipRequests.unshift(z)
      emit('misc')
      setTimeout(() => {
        Object.assign(z, { status: 'ready', readyAt: new Date().toISOString(), url: `${GALLERY_ORIGIN}/zip/${z.id}` })
        // One download_events row per photo the ZIP actually covers — the single source of truth for download counts.
        const at = new Date().toISOString()
        const rows: DownloadEvent[] = ids.map((id) => ({ id: uid('dl'), eventId: e.id, photoId: id, filename: getPhotoMerged(id)?.filename ?? id, guestId: o.guestId, kind: 'zip' as const, createdAt: at }))
        state.extra.downloadEvents.unshift(...rows)
        emit('misc')
      }, 1500)
      return clone(z)
    },
    async listZipRequests(eventId) { await wait(latency); return clone(s().zipRequests.filter((z) => z.eventId === eventId)) },
    async listDownloadEvents(eventId) {
      await wait(latency)
      const rows = state.extra.downloadEvents.filter((d) => d.eventId === eventId)
      return clone(rows.map((d) => ({ ...d, guestName: d.guestId ? liveGuests().find((g) => g.id === d.guestId)?.name : undefined })))
    },

    async listPeople(eventId) { await wait(latency); return clone(s().people.filter((p) => p.eventId === eventId)) },
    async listFilms(eventId) { await wait(latency); return clone(s().films.filter((f) => f.eventId === eventId)) },
    async addFilm(eventId, name, url) { await wait(latency); const f = { id: uid('f'), eventId, name, url }; s().films.push(f); emit('misc'); return clone(f) },
    async updateFilm(id, patch) { await wait(latency); const f = byId(s().films, id, 'Film'); Object.assign(f, patch); emit('misc'); return clone(f) },
    async deleteFilm(id) { await wait(latency); s().films = s().films.filter((f) => f.id !== id); emit('misc') },

    async listGuests(eventId) { await wait(latency); return clone(liveGuests().filter((g) => g.eventId === eventId)) },
    async listAccessRequests(eventId) { await wait(latency); return clone(s().accessRequests.filter((a) => a.eventId === eventId)) },
    async resolveAccessRequest(id, approve) {
      await wait(latency)
      const req = s().accessRequests.find((a) => a.id === id)
      if (!req) fail(state.extra.resolvedRequests[id] ? 409 : 404, state.extra.resolvedRequests[id] ? 'already_resolved' : 'not_found',
        state.extra.resolvedRequests[id] ? 'This request was already resolved.' : `Access request ${id} was not found.`)
      s().accessRequests = s().accessRequests.filter((a) => a.id !== id)
      let guestId: ID | undefined
      if (approve) {
        const now = new Date().toISOString()
        guestId = uid('g')
        s().guests.push({ id: guestId, eventId: req!.eventId, name: req!.name, email: req!.email, phone: '', role: 'guest', favourites: [], lastActive: now, registeredAt: now })
      }
      state.extra.resolvedRequests[id] = { request: clone(req!), approve, guestId }
      emit('guests')
    },

    // ── Business ────────────────────────────────────────────────────────────
    async listActivity() { await wait(latency); return clone(s().activity) },
    async listOrders() { await wait(latency); return clone(s().orders) },
    async listLedger() { await wait(latency); return clone(s().ledger) },
    async listPrices() { await wait(latency); return clone(s().prices) },
    async updatePrices(prices) {
      await wait(latency)
      for (const p of prices) if (!(p.price >= 0) || !p.label.trim()) fail(422, 'validation_failed', 'Every price needs a label and an amount of 0 or more.')
      s().prices = clone(prices)
      emit('misc')
      return clone(s().prices)
    },
    async getStoreSettings() { await wait(latency); return clone(s().storeSettings) },
    async updateStoreSettings(patch) {
      await wait(latency)
      const cur = s().storeSettings
      if (patch.kyc) {
        const { address, documents, ...rest } = patch.kyc
        Object.assign(cur.kyc, rest)
        if (address) cur.kyc.address = { ...cur.kyc.address, ...address }
        if (documents) cur.kyc.documents = documents.map((d) => ({ ...d, status: d.fileName && d.status === 'needed' ? 'review' : d.status }))
      }
      if (patch.payout) {
        const { accountNumber, ...rest } = patch.payout
        const bankChanged = !!accountNumber || (rest.ifsc !== undefined && rest.ifsc !== cur.payout.ifsc) || (rest.holder !== undefined && rest.holder !== cur.payout.holder)
        Object.assign(cur.payout, rest)
        if (accountNumber) cur.payout.accountLast4 = accountNumber.slice(-4)
        if (bankChanged) {
          // Simulated ₹1 penny drop: "checking" now, the result a moment later.
          cur.payout.verified = false
          cur.payout.check = { status: 'checking', checkedAt: new Date().toISOString(), message: 'We’ve sent ₹1 to this account to check it.' }
          setTimeout(() => { runPayoutCheck(); emit('misc') }, 1500)
        }
      }
      if (patch.saleWatermark) Object.assign(cur.saleWatermark, patch.saleWatermark)
      if (patch.international) Object.assign(cur.international, patch.international)
      if (patch.terms !== undefined) cur.terms = patch.terms
      emit('misc')
      return clone(cur)
    },
    async verifyPayoutAccount() {
      await wait(latency * 3)
      const check = runPayoutCheck()
      emit('misc')
      return clone(check)
    },
    async requestPayout(amount) {
      await wait(latency)
      const p = s().storeSettings.payout
      if (!p.verified) fail(409, 'payout_account_unverified', 'Verify your bank account in Store settings before requesting a payout.')
      if (!(amount > 0) || amount > balance()) fail(422, 'validation_failed', `You can withdraw up to ₹${balance()}.`, { available: balance() })
      const entry = ledger('payout', `Payout to ${p.bank} ••${p.accountLast4}`, -amount, true)
      emit('misc')
      return clone(entry)
    },
    async listPurchases() { await wait(latency); return clone(s().purchases) },
    async changePlan(planId, o) {
      await wait(latency)
      const period = o?.billing
      const payWith = o?.payWith ?? 'card'
      if (period !== 'yearly' && period !== 'quarterly') fail(422, 'validation_failed', 'Pick yearly or quarterly billing.', { errors: [{ field: 'billing', in: 'body', message: 'Pick yearly or quarterly', code: 'invalid_enum_value' }] })
      const u = s().usage
      const current = PLANS.find((p) => p.id === u.planId)!
      const next = PLANS.find((p) => p.id === planId)
      if (!next) fail(422, 'validation_failed', `Unknown plan ${planId}.`)
      if (u.planId === planId && u.period === period) fail(409, 'same_plan', 'You are already on this plan.')
      const remainingDays = Math.max(0, (Date.parse(u.validTill) - Date.now()) / DAY)
      const credit = Math.round(planPrice(current, u.period) * Math.min(1, remainingDays / PERIOD_DAYS[u.period]))
      const charged = Math.max(0, planPrice(next!, period) - credit)
      const gst = round2(charged * GST_RATE)
      const total = round2(charged + gst)
      const label = `${next!.name} plan · ${period}`
      // Pay first: a short wallet (402) leaves the plan as it was.
      if (payWith === 'wallet' && total > 0) debitWallet(total, label)
      Object.assign(u, { planId, period, photosLimit: next!.photos, validTill: new Date(Date.now() + PERIOD_DAYS[period] * DAY).toISOString() })
      const p = total > 0
        ? purchase({ description: `${label}${credit ? ` (₹${credit} off for unused time)` : ''}`, kind: 'plan', amount: total, method: payWith === 'wallet' ? 'credits' : payWith })
        : null
      emit('usage', 'misc')
      return { usage: clone(u), charged, credit, gst, total, payWith, purchase: p ? clone(p) : null }
    },
    async setRenewalMultiplier(multiplier) {
      await wait(latency)
      if (!(multiplier >= 1 && multiplier <= 10)) fail(422, 'validation_failed', 'The multiplier must be between 1 and 10.')
      s().usage.renewalMultiplier = multiplier
      emit('usage')
      return clone(s().usage)
    },
    async addCredits(amount) {
      await wait(latency)
      s().usage.walletCredits = round2(s().usage.walletCredits + amount)
      ledger('credits-added', `Wallet top-up · ₹${amount}`, amount, false)
      purchase({ description: `Money added to wallet · ₹${amount}`, kind: 'credits', amount, method: 'card' })
      emit('usage', 'misc')
      return s().usage.walletCredits
    },
    async redeemCoupon(code) {
      await wait(latency)
      const c = code.trim().toUpperCase()
      const credits = COUPONS[c]
      if (!credits) fail(404, 'invalid_coupon', 'That coupon code isn’t valid. Check the spelling and try again.')
      if (state.extra.coupons.includes(c)) fail(409, 'coupon_used', 'This coupon was already used on your account.')
      state.extra.coupons.push(c)
      s().usage.walletCredits = round2(s().usage.walletCredits + credits)
      ledger('credits-added', `Coupon ${c}`, credits, false)
      purchase({ description: `Coupon ${c} · ₹${credits} added to wallet`, kind: 'coupon', amount: 0, method: 'coupon' })
      emit('usage', 'misc')
      return { credits, walletCredits: s().usage.walletCredits }
    },
    async spendCredits(amount, description) {
      await wait(latency)
      if (!(amount > 0)) fail(422, 'validation_failed', 'Amount must be more than 0.')
      const entry = debitWallet(amount, description)
      emit('usage', 'misc')
      return { walletCredits: s().usage.walletCredits, entry: clone(entry) }
    },

    // ── Tools ───────────────────────────────────────────────────────────────
    async listCameras() { await wait(latency); return clone(s().cameras) },
    async createCamera(input) {
      await wait(latency)
      const cam: Camera = { ...input, id: uid('c'), ftpUser: `nl_${input.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 14)}`, status: 'offline', today: 0 }
      s().cameras.push(cam); emit('misc')
      return { ...clone(cam), password: randomPassword() }
    },
    async updateCamera(id, patch) { await wait(latency); const c = byId(s().cameras, id, 'Camera'); Object.assign(c, patch); emit('misc'); return clone(c) },
    async deleteCamera(id) {
      await wait(latency)
      s().cameras = s().cameras.filter((c) => c.id !== id)
      s().cameraUploads = s().cameraUploads.filter((u) => u.cameraId !== id)
      emit('misc')
    },
    async resetCameraPassword(id) { await wait(latency); const c = byId(s().cameras, id, 'Camera'); emit('misc'); return { ...clone(c), password: randomPassword() } },
    async listCameraUploads(cameraId) { await wait(latency); return clone(s().cameraUploads.filter((u) => u.cameraId === cameraId).sort((a, b) => b.at.localeCompare(a.at))) },
    async clearCameraUploads(cameraId) { await wait(latency); s().cameraUploads = s().cameraUploads.filter((u) => u.cameraId !== cameraId); emit('misc') },
    async listQRs() { await wait(latency); applyQrSchedules(); return clone(s().qrs.filter((q) => !q.deletedAt)) },
    async updateQR(id, patch) { await wait(latency); const q = byId(s().qrs, id, 'QR code'); const { id: _id, scans: _sc, ...rest } = patch; Object.assign(q, rest); emit('misc'); return clone(q) },
    async createQR(name, eventId) {
      await wait(latency)
      const q: SmartQR = { id: uid('q'), name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 16), eventId, target: 'web', scans: 0, color: '#1B1712' }
      s().qrs.push(q); emit('misc'); return clone(q)
    },
    async deleteQR(id) { await wait(latency); const q = byId(s().qrs, id, 'QR code'); q.deletedAt ??= new Date().toISOString(); emit('misc') },
    async listBroadcasts() { await wait(latency); return clone(s().broadcasts.filter((b) => !b.deletedAt)) },
    async sendBroadcast(input) {
      await wait(latency)
      const b: Broadcast = { ...input, id: uid('b'), sentAt: input.scheduledAt ? undefined : new Date().toISOString() }
      s().broadcasts.unshift(b); emit('misc'); return clone(b)
    },
    async cancelBroadcast(id) {
      await wait(latency)
      const b = byId(s().broadcasts.filter((x) => !x.deletedAt), id, 'Broadcast')
      if (b.sentAt || !b.scheduledAt) fail(409, 'already_sent', 'This broadcast was already sent, so it can’t be cancelled.')
      if (b.cancelledAt) fail(409, 'already_cancelled', 'This broadcast was already cancelled.')
      b.cancelledAt = new Date().toISOString()
      emit('misc')
      return clone(b)
    },
    async deleteBroadcast(id) { await wait(latency); const b = byId(s().broadcasts, id, 'Broadcast'); b.deletedAt ??= new Date().toISOString(); emit('misc') },
    async listTickets() { await wait(latency); return clone(s().tickets) },
    async createTicket({ body, ...rest }) {
      await wait(latency)
      const t: Ticket = { ...rest, id: uid('t'), status: 'open', messages: [{ from: 'me', body, at: new Date().toISOString() }] }
      s().tickets.unshift(t); emit('misc'); return clone(t)
    },
    async replyTicket(id, body) {
      await wait(latency)
      const t = byId(s().tickets, id, 'Ticket')
      t.messages.push({ from: 'me', body, at: new Date().toISOString() }); t.status = 'waiting'; emit('misc'); return clone(t)
    },
    async listTeam() { await wait(latency); return clone(s().team) },
    async inviteMember(email, role, eventIds = []) {
      await wait(latency)
      if (s().team.some((m) => m.email.toLowerCase() === email.toLowerCase())) fail(409, 'already_member', `${email} is already on the team.`)
      const m: TeamMember = { id: uid('u'), name: email.split('@')[0], email, role, access: '', lastActive: '', eventIds: role === 'uploader' ? eventIds : [], pending: true }
      m.access = accessLabel(m)
      s().team.push(m); emit('misc'); return clone(m)
    },
    async updateMember(id, patch) {
      await wait(latency)
      const m = byId(s().team, id, 'Team member')
      if (patch.role && patch.role !== 'owner' && m.role === 'owner' && s().team.filter((x) => x.role === 'owner').length === 1) fail(409, 'last_owner', 'A studio needs at least one owner. Make someone else owner first.')
      Object.assign(m, patch)
      if (m.role !== 'uploader') m.eventIds = []
      m.access = accessLabel(m)
      emit('misc')
      return clone(m)
    },
    async removeMember(id) {
      await wait(latency)
      const m = byId(s().team, id, 'Team member')
      if (m.role === 'owner' && s().team.filter((x) => x.role === 'owner').length === 1) fail(409, 'last_owner', 'You can’t remove the only owner.')
      s().team = s().team.filter((x) => x.id !== id)
      emit('misc')
    },
    async getNotificationPrefs() { await wait(latency); return clone(s().notificationPrefs) },
    async updateNotificationPrefs(patch) { await wait(latency); Object.assign(s().notificationPrefs, patch); emit('misc'); return clone(s().notificationPrefs) },
    async getWatermark() { await wait(latency); return clone(s().watermark) },
    async updateWatermark(patch) {
      await wait(latency)
      const w = s().watermark
      Object.assign(w, { ...patch, applyTo: { ...w.applyTo, ...(patch.applyTo ?? {}) } })
      emit('misc')
      return clone(w)
    },
    async getWebsite() { await wait(latency); return clone(s().website) },
    async updateWebsite(patch) { await wait(latency); Object.assign(s().website, patch); emit('misc'); return clone(s().website) },
    async listEnquiries() { await wait(latency); return clone(s().enquiries) },
    async updateEnquiry(id, patch) { await wait(latency); const e = byId(s().enquiries, id, 'Enquiry'); Object.assign(e, patch); emit('misc'); return clone(e) },

    // ── Guest side ──────────────────────────────────────────────────────────
    async getPublicEvent(shortId) {
      await wait(latency)
      const e = findEvent(shortId)
      state.extra.recent[e.id] = new Date().toISOString()
      save()
      const { pin: _pin, ...settings } = e.settings
      const cover = e.coverPhotoId ? getPhotoMerged(e.coverPhotoId) : undefined
      return clone({
        id: e.id, shortId: e.shortId, name: e.name, type: e.type, date: e.date, endDate: e.endDate, city: e.city, status: e.status,
        photoCount: e.photoCount, expiresAt: e.expiresAt, coverTones: e.coverTones, coverPhotoId: e.coverPhotoId, coverUrl: cover?.url,
        highlights: e.highlights, settings, albums: publicAlbums(e), films: s().films.filter((f) => f.eventId === e.id),
        studio: publicStudio(), blocked: blockedReason(e),
      })
    },
    async verifyPin(shortId, pin) {
      await wait(latency)
      const e = findEvent(shortId)
      if (e.settings.access !== 'link-pin') return session(e, true, state.extra.guestIds[e.id])
      const t = pinTries.get(e.id) ?? { count: 0, lockedUntil: 0 }
      if (t.lockedUntil > Date.now()) fail(429, 'pin_locked', 'Too many wrong PINs. Try again in 15 minutes, or ask the photographer.', { retryAfter: Math.ceil((t.lockedUntil - Date.now()) / 1000) })
      if (pin.trim() !== e.settings.pin) {
        t.count++
        if (t.count >= 5) { t.count = 0; t.lockedUntil = Date.now() + 15 * 60_000 }
        pinTries.set(e.id, t)
        if (t.lockedUntil > Date.now()) fail(429, 'pin_locked', 'Too many wrong PINs. Try again in 15 minutes, or ask the photographer.', { retryAfter: 900 })
        fail(401, 'invalid_pin', `That PIN is wrong. ${5 - t.count} ${5 - t.count === 1 ? 'try' : 'tries'} left.`, { attemptsRemaining: 5 - t.count })
      }
      pinTries.delete(e.id)
      if (!state.extra.pinVerified.includes(e.id)) { state.extra.pinVerified.push(e.id); save() }
      return session(e, true, state.extra.guestIds[e.id])
    },
    async registerGuest(shortId, input) {
      await wait(latency)
      const e = findEvent(shortId)
      const email = (input.email ?? '').trim().toLowerCase()
      const phone = (input.phone ?? '').trim()
      if (!input.name?.trim()) fail(422, 'validation_failed', 'Enter your name.', { errors: [{ field: 'name', in: 'body', message: 'Enter your name', code: 'required' }] })
      if (email && !EMAIL_RE.test(email)) fail(422, 'validation_failed', 'Enter a valid email, or leave it empty.', { errors: [{ field: 'email', in: 'body', message: 'Enter a valid email', code: 'invalid_string' }] })
      if (phone && (digits(phone).length < 10 || digits(phone).length > 13)) fail(422, 'validation_failed', 'Enter a 10-digit mobile number.', { errors: [{ field: 'phone', in: 'body', message: 'Enter a 10-digit mobile number', code: 'invalid_string' }] })
      if (!email && !phone) fail(422, 'validation_failed', 'Enter your email or mobile number.', { errors: [{ field: 'email', in: 'body', message: 'Enter an email or a mobile number', code: 'required' }] })
      const now = new Date().toISOString()
      const same = (x: Guest) => x.eventId === e.id && (email ? x.email.toLowerCase() === email : !!x.phone && digits(x.phone).slice(-10) === digits(phone).slice(-10))
      let g = s().guests.find(same)
      if (g && state.extra.removedGuests[g.id]) fail(403, 'guest_removed', 'The studio removed your access to this gallery. Ask them to add you again.')
      // A host opening the gallery with their email or phone accepts the invite.
      const host = e.hosts.find((h) => (email && h.email.toLowerCase() === email) || (phone && h.phone && digits(h.phone).slice(-10) === digits(phone).slice(-10)))
      if (host && host.status !== 'accepted') host.status = 'accepted'
      if (g) Object.assign(g, { name: input.name.trim(), phone: phone || g.phone, email: email || g.email, lastActive: now })
      else {
        g = { id: uid('g'), eventId: e.id, name: input.name.trim(), email, phone, role: host ? (host.role === 'client' ? 'client' : 'host') : 'guest', favourites: [], lastActive: now, registeredAt: now }
        s().guests.push(g)
        s().activity.unshift({ id: uid('a'), kind: 'registration', title: `${g.name} registered`, detail: e.name, at: now })
      }
      state.extra.guestIds[e.id] = g.id
      emit('guests', 'activity', ...(host ? (['events'] as ChangeTopic[]) : []))
      // Same rule as the server: a typed PIN keeps "see all"; otherwise only galleries without face privacy.
      const seeAll = state.extra.pinVerified.includes(e.id) || !e.settings.facePrivacy || !e.settings.faceSearch
      return { ...session(e, seeAll, g.id), guest: clone(g) }
    },
    async listPublicPhotos(shortId, q = {}) {
      await wait(latency)
      const e = findEvent(shortId)
      const albums = publicAlbums(e).filter((a) => (q.albumId ? a.id === q.albumId : a.kind === 'album'))
      let items = albums.flatMap(albumPhotos).filter(visibleToGuests)
      if (q.personId) items = items.filter((p) => p.faces.some((f) => f.personId === q.personId))
      items = q.highlights ? [...items].sort((a, b) => b.favourites - a.favourites || a.id.localeCompare(b.id)) : sortPhotos(items, q.sort)
      const offset = q.offset ?? 0
      return { total: items.length, items: clone(items.slice(offset, q.limit ? offset + q.limit : undefined)) }
    },
    async searchFaces(shortId, selfie) {
      await wait(latency * 4)
      const e = findEvent(shortId)
      if (!e.settings.faceSearch) fail(403, 'face_search_disabled', 'Face search is turned off for this gallery.')
      if (selfieHasNoFace(selfie)) return { faceFound: false, reason: 'no_face' as const, personId: null, photoIds: [] }
      const people = s().people.filter((p) => p.eventId === e.id)
      const pool = people.filter((p) => !p.name).length ? people.filter((p) => !p.name) : people
      const photos = publicAlbums(e).filter((a) => a.kind === 'album').flatMap(albumPhotos).filter(visibleToGuests)
      if (!pool.length) {
        const ids = photos.filter((p) => hash(`${p.id}:${selfie.key}`) % 8 === 0).map((p) => p.id)
        return { faceFound: true, personId: null, photoIds: ids }
      }
      const personId = pool[hash(selfie.key) % pool.length].id
      e.faceMatches++
      emit('events')
      return { faceFound: true, personId, photoIds: photos.filter((p) => p.faces.some((f) => f.personId === personId)).map((p) => p.id) }
    },
    async setFavourite(photoId, on, shortId) {
      await wait(latency / 2)
      const p = getPhotoMerged(photoId)
      if (!p) fail(404, 'not_found', `Photo ${photoId} was not found.`)
      const eventId = shortId ? findEvent(shortId).id : p!.eventId
      const g = myGuest(eventId)
      const had = g?.favourites.includes(photoId) ?? false
      if (g) g.favourites = on ? (had ? g.favourites : [...g.favourites, photoId]) : g.favourites.filter((id) => id !== photoId)
      const delta = g ? (on && !had ? 1 : !on && had ? -1 : 0) : on ? 1 : -1
      const favourites = Math.max(0, p!.favourites + delta)
      patchPhoto(photoId, { favourites })
      emit('photos', 'guests')
      return { favourites }
    },
    async createEnquiry(target, input) {
      await wait(latency)
      let eventId: ID | undefined
      let source = input.source
      if ('shortId' in target) { const e = findEvent(target.shortId); eventId = e.id; source ??= `${e.name} gallery` }
      else { studioFor(target.studio); source ??= 'Studio profile' }
      if (!input.name.trim() || !input.message.trim() || !(input.phone || input.email)) fail(422, 'validation_failed', 'Add your name, a message, and a phone number or email.')
      const at = new Date().toISOString()
      const enq: Enquiry = { id: uid('e'), name: input.name.trim(), phone: input.phone, email: input.email, message: input.message.trim(), source: source!, at, status: 'new', ...(eventId ? { eventId } : {}) }
      s().enquiries.unshift(enq)
      s().activity.unshift({ id: uid('a'), kind: 'enquiry', title: `New enquiry from ${enq.name}`, detail: enq.source, at })
      emit('misc', 'activity')
      return clone(enq)
    },
    async createOrder(shortId, input) {
      await wait(latency * 2)
      const e = findEvent(shortId)
      if (!e.settings.storeEnabled) fail(409, 'store_disabled', 'This gallery isn’t selling photos.')
      if (!input.items.length) fail(422, 'validation_failed', 'Add something to buy.')
      if (input.items.some((i) => i.priceId.startsWith('print')) && !input.shipping) {
        fail(422, 'validation_failed', 'Add a delivery address for prints.', { errors: [{ field: 'shipping', in: 'body', message: 'Add a delivery address for prints', code: 'required' }] })
      }
      let paid = 0
      const labels: string[] = []
      const photoIds = new Set<ID>()
      const prices = effectivePrices(s().prices, e.settings.priceOverrides)
      for (const item of input.items) {
        const price = prices.find((p) => p.id === item.priceId)
        if (!price) fail(422, 'validation_failed', `Unknown price ${item.priceId}.`)
        const qty = item.priceId === 'all' ? 1 : Math.max(1, item.quantity ?? item.photoIds.length)
        paid += price!.price * qty
        labels.push(item.priceId === 'all' ? price!.label : `${price!.label}${qty > 1 ? ` ×${qty}` : ''}`)
        item.photoIds.forEach((id) => photoIds.add(id))
      }
      const number = Math.max(0, ...s().orders.map((o) => o.number)) + 1
      const share = round2(paid * (1 - STORE_COMMISSION))
      const at = new Date().toISOString()
      const order: Order = {
        id: uid('o'), number, buyer: input.buyer.name, eventId: e.id, eventName: e.name, items: labels.join(', '), paid: round2(paid),
        currency: 'INR', share, status: input.method === 'international' ? 'paid-direct' : 'paid', at,
        photoIds: [...photoIds], buyerEmail: input.buyer.email, method: input.method, ...(input.shipping ? { shipping: input.shipping } : {}),
      }
      s().orders.unshift(order)
      state.extra.myOrders.push(order.id)
      ledger('sale', `Order #${number} · ${e.name}`, share, true)
      s().activity.unshift({ id: uid('a'), kind: 'order', title: `Order #${number} · ₹${order.paid.toLocaleString('en-IN')}`, detail: e.name, at })
      emit('misc', 'activity')
      return clone(order)
    },
    async recordDownload(photoIds) {
      await wait(latency / 2)
      const at = new Date().toISOString()
      const rows: DownloadEvent[] = []
      photoIds.forEach((id) => {
        const p = getPhotoMerged(id)
        if (!p) return
        patchPhoto(id, { downloads: p.downloads + 1 })
        rows.push({ id: uid('dl'), eventId: p.eventId, photoId: id, filename: p.filename, guestId: myGuest(p.eventId)?.id, kind: 'single', createdAt: at })
      })
      state.extra.downloadEvents.unshift(...rows)
      emit('photos')
    },
    async getStudioProfile(followCode) {
      await wait(latency)
      const st = studioFor(followCode)
      const featured = st.app.featuredEventIds
        .map((id) => s().events.find((e) => e.id === id && !e.deletedAt))
        .filter((e): e is PhotoEvent => !!e && !blockedReason(e) && (st.app.showPrivate || e.settings.access === 'link'))
        .map((e) => ({ id: e.id, shortId: e.shortId, name: e.name, type: e.type, date: e.date, city: e.city, coverTones: e.coverTones, photoCount: e.photoCount, coverPhotoId: e.coverPhotoId }))
      return clone({
        studio: {
          ...publicStudio(), about: st.about, coverUrl: st.coverUrl, followers: st.followers,
          services: st.app.showServices ? st.services : [], testimonials: st.testimonials, faq: st.app.showFaq ? st.faq : [],
          socialLinks: st.socialLinks, portfolioLinks: st.portfolioLinks,
        },
        featured,
      })
    },
    async followStudio(followCode) {
      await wait(latency)
      const st = studioFor(followCode)
      if (!state.extra.followed.includes(st.id)) { state.extra.followed.push(st.id); st.followers++; emit('studio') }
      return { followers: st.followers }
    },
    async resolveGuestLink(code) {
      await wait(latency / 2)
      const payload = decodeGuestLink(code)
      if (!payload) fail(404, 'not_found', 'This link is broken or has expired. Ask the photographer for a new one.')
      const kind = guestLinkKind(payload!)
      const e = findEvent(payload!.e)
      const vip = kind === 'v' ? payload!.vip : undefined
      if (vip?.pin) {
        if (!state.extra.pinVerified.includes(e.id)) state.extra.pinVerified.push(e.id)
        if (!state.extra.vipPin.includes(e.id)) state.extra.vipPin.push(e.id)
        save()
      }
      return { kind, payload: payload!, ...(vip?.pin || vip?.all ? { session: session(e, !!vip.all || !e.settings.facePrivacy, state.extra.guestIds[e.id]) } : {}) }
    },

    // ── Contract v3 ─────────────────────────────────────────────────────────
    async listDeletedEvents() { await wait(latency); return clone(s().events.filter((e) => e.deletedAt)) },
    async restoreEvent(id) {
      await wait(latency)
      const e = findEvent(id, { includeDeleted: true })
      delete e.deletedAt
      emit('events', 'albums', 'photos')
      return clone(e)
    },
    async buyPack(eventId, photos, { payWith }) {
      await wait(latency)
      const e = findEvent(eventId)
      const pack = PACKS.find((p) => p.photos === photos)
      if (!pack) fail(422, 'validation_failed', `Packs come in ${PACKS.map((p) => p.photos).join(', ')} photos.`)
      if (payWith === 'credits') debitWallet(pack!.price, `${pack!.photos.toLocaleString('en-IN')}-photo pack · ${e.name}`)
      const p = purchase({ description: `${pack!.photos.toLocaleString('en-IN')}-photo pack · ${e.name}`, kind: 'pack', amount: pack!.price, method: payWith === 'credits' ? 'credits' : 'card' })
      e.photoLimit += pack!.photos
      emit('events', 'usage', 'misc')
      return { event: clone(e), charged: pack!.price, purchase: clone(p) }
    },
    async matchFaceForLink(eventId, selfie) {
      const e = findEvent(eventId)
      return api.searchFaces(e.shortId, selfie)
    },
    async uploadAsset(kind, file) {
      await wait(latency)
      const rule = ASSET_RULES[kind]
      if (!rule) fail(422, 'validation_failed', `Unknown asset kind ${kind}.`)
      const type = file.contentType ?? file.blob?.type ?? ''
      const size = file.size ?? file.blob?.size ?? 0
      if (!rule.types.includes(type)) fail(415, 'unsupported_media_type', `Upload a ${rule.types.map((t) => t.split('/')[1].toUpperCase()).join(', ')} file.`)
      if (size > rule.maxBytes) fail(413, 'payload_too_large', `Files can be up to ${Math.round(rule.maxBytes / 1024 / 1024)} MB.`)
      let url = file.uri ?? ''
      if (file.blob) {
        // Small files become data URLs so they survive a reload; big ones stay session-only object URLs.
        if (file.blob.size <= 1024 * 1024) {
          const bytes = new Uint8Array(await file.blob.arrayBuffer())
          let bin = ''
          bytes.forEach((b) => { bin += String.fromCharCode(b) })
          url = `data:${type};base64,${btoa(bin)}`
        } else if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          url = URL.createObjectURL(file.blob)
        }
      }
      const asset: Asset = { id: uid('as'), kind, url, contentType: type, size, fileName: file.filename, createdAt: new Date().toISOString() }
      state.extra.assets.push({ ...asset, url: url.startsWith('blob:') ? '' : url })
      save()
      return asset
    },
    async listCarts() {
      await wait(latency)
      const cutoff = Date.now() - 30 * 60_000
      return clone(s().orders.filter((o) => o.status === 'pending' && Date.parse(o.at) < cutoff).map((o): AbandonedCart => {
        const r = state.extra.cartReminders[o.id]
        return {
          orderId: o.id, number: o.number, buyer: o.buyer, buyerEmail: o.buyerEmail, eventId: o.eventId, eventName: o.eventName, items: o.items,
          amount: o.paid, startedAt: o.at, reminders: r?.count ?? 0, ...(r ? { remindedAt: r.at } : {}),
        }
      }))
    },
    async remindCarts(orderIds) {
      await wait(latency)
      let reminded = 0
      for (const id of orderIds) {
        const o = s().orders.find((x) => x.id === id && x.status === 'pending')
        if (!o) continue
        const r = state.extra.cartReminders[id] ?? { count: 0, at: '' }
        state.extra.cartReminders[id] = { count: r.count + 1, at: new Date().toISOString() }
        reminded++
      }
      emit('misc')
      return { reminded }
    },

    async listPublicPrices(shortId) { await wait(latency); const e = findEvent(shortId); return effectivePrices(s().prices, e.settings.priceOverrides) },
    async getPublicWatermark(shortId) {
      await wait(latency)
      const e = findEvent(shortId)
      const sale = e.settings.storeEnabled && e.settings.forSaleWatermark ? { sale: clone(s().storeSettings.saleWatermark) } : {}
      return { enabled: !e.settings.watermarkOff, settings: clone(s().watermark), ...sale }
    },
    async uploadGuestPhotos(shortId, files, o = {}) {
      const e = findEvent(shortId)
      if (!e.settings.guestUploads) fail(403, 'guest_uploads_disabled', 'This gallery doesn’t take guest uploads.')
      const album = liveAlbums().find((a) => a.eventId === e.id && a.kind === 'guest')
      if (!album) fail(409, 'no_guest_album', 'This gallery has no guest uploads album.')
      const used = albumPhotos(album!).length
      if (used + files.length > e.settings.guestUploadLimit) {
        fail(409, 'guest_upload_limit', `This gallery takes ${e.settings.guestUploadLimit} guest photos and has room for ${Math.max(0, e.settings.guestUploadLimit - used)} more.`, { remaining: Math.max(0, e.settings.guestUploadLimit - used) })
      }
      const g = myGuest(e.id)
      return api.uploadPhotos(e.id, album!.id, files, { quality: 'web', source: 'guest', uploadedBy: o.uploadedBy ?? g?.name ?? 'Guest', watermark: e.settings.watermarkGuestUploads })
    },
    async requestPublicZip(shortId, email, o = {}) {
      await wait(latency)
      const e = findEvent(shortId)
      if (e.settings.downloads === 'none') fail(403, 'downloads_disabled', 'Downloads are turned off for this gallery.')
      if (e.settings.downloads === 'own' && !o.photoIds?.length) fail(403, 'downloads_own_only', 'You can download only the photos you’re in. Find yours with a selfie first.')
      return api.requestZip(e.id, email, { albumId: o.albumId, photoIds: o.photoIds, guestId: myGuest(e.id)?.id })
    },
    async verifyDownloadPin(shortId, pin) {
      await wait(latency)
      const e = findEvent(shortId)
      if (pin === undefined || pin === '') {
        if (!state.extra.vipPin.includes(e.id)) fail(401, 'pin_required', 'Enter the gallery PIN to download everything.')
      } else if (pin.trim() !== e.settings.pin) fail(401, 'invalid_pin', 'That PIN is wrong.')
      const used = state.extra.downloadUses[e.id] ?? 0
      if (used >= DOWNLOAD_ALL_LIMIT) fail(429, 'download_limit', `“Download all” can be used ${DOWNLOAD_ALL_LIMIT} times per guest. Download single photos instead.`, { remaining: 0 })
      state.extra.downloadUses[e.id] = used + 1
      save()
      return { remaining: DOWNLOAD_ALL_LIMIT - used - 1, limit: DOWNLOAD_ALL_LIMIT }
    },
    async listMyFavourites(shortId) {
      await wait(latency)
      const e = findEvent(shortId)
      const g = myGuest(e.id)
      if (!g) fail(401, 'registration_required', 'Register with your name and email to keep favourites.')
      return clone(g!.favourites.map(getPhotoMerged).filter((p): p is Photo => !!p && visibleToGuests(p)))
    },
    async listMyOrders(shortId) {
      await wait(latency)
      const e = findEvent(shortId)
      const g = myGuest(e.id)
      return clone(s().orders.filter((o) => o.eventId === e.id && (state.extra.myOrders.includes(o.id) || (!!g && !!g.email && o.buyerEmail?.toLowerCase() === g.email.toLowerCase()))))
    },
    async confirmOrder(orderId) {
      await wait(latency)
      const o = byId(s().orders, orderId, 'Order')
      if (o.status === 'pending') {
        o.status = 'paid'
        delete o.checkout
        ledger('sale', `Order #${o.number} · ${o.eventName}`, o.share, true)
        s().activity.unshift({ id: uid('a'), kind: 'order', title: `Order #${o.number} · ₹${o.paid.toLocaleString('en-IN')}`, detail: o.eventName, at: new Date().toISOString() })
        emit('misc', 'activity')
      }
      return clone(o)
    },
    async requestAccess(shortId, input) {
      await wait(latency)
      const e = findEvent(shortId)
      if (!input.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) fail(422, 'validation_failed', 'Enter your name and a valid email.')
      s().accessRequests.unshift({ id: uid('ar'), eventId: e.id, name: input.name.trim(), email: input.email.trim().toLowerCase(), note: input.note ?? '', createdAt: new Date().toISOString() })
      emit('guests')
      return { received: true as const }
    },
    async unfollowStudio(followCode) {
      await wait(latency)
      const st = studioFor(followCode)
      if (state.extra.followed.includes(st.id)) {
        state.extra.followed = state.extra.followed.filter((id) => id !== st.id)
        st.followers = Math.max(0, st.followers - 1)
        emit('studio')
      }
      return { followers: st.followers }
    },
    async listFollowedStudios() { await wait(latency); return state.extra.followed.includes(s().studio.id) ? [clone(publicStudio())] : [] },
    async listMyGalleries() {
      await wait(latency)
      return Object.entries(state.extra.recent)
        .map(([id, at]) => ({ e: s().events.find((x) => x.id === id && !x.deletedAt), at }))
        .filter((x): x is { e: PhotoEvent; at: string } => !!x.e)
        .sort((a, b) => b.at.localeCompare(a.at))
        .map(({ e, at }) => ({ id: e.id, shortId: e.shortId, name: e.name, type: e.type, date: e.date, city: e.city, coverTones: clone(e.coverTones), photoCount: e.photoCount, studioName: s().studio.name, lastOpenedAt: at }))
    },
    async getPhotoDownloadUrl(photoId) { await wait(latency / 2); return getPhotoMerged(photoId)?.url ?? null },

    // ── Contract v4 ─────────────────────────────────────────────────────────
    async getWallet() {
      await wait(latency / 2)
      const prepaid = round2(s().usage.walletCredits)
      const earnings = round2(balance())
      return { balance: round2(prepaid + earnings), withdrawable: Math.max(0, earnings), prepaid, earnings, currency: 'INR' as const, asOf: new Date().toISOString() }
    },
    async listNeedsYou() {
      await wait(latency)
      const pendingUploads = liveAlbums().filter((a) => a.kind === 'guest').map((a) => {
        const pending = albumPhotos(a).filter((p) => p.reviewStatus === 'pending')
        return { eventId: a.eventId, count: pending.length, latestAt: pending.map((p) => p.capturedAt).sort().pop() ?? new Date().toISOString() }
      })
      return buildNeedsYou({ events: s().events, accessRequests: s().accessRequests, pendingUploads })
    },
    async refundOrder(orderId, reason) {
      await wait(latency)
      const o = byId(s().orders, orderId, 'Order')
      const why = reason.trim()
      if (!why || why.length > 300) fail(422, 'validation_failed', 'Say why you’re refunding (up to 300 characters). The buyer sees it.')
      if (o.status !== 'paid' && o.status !== 'printing') {
        fail(409, 'order_not_refundable', o.status === 'refunded' ? `Order #${o.number} was already refunded.` : `Order #${o.number} can’t be refunded because it isn’t paid through Frameline.`, { orderStatus: o.status })
      }
      o.status = 'refunded'
      o.refundedAt = new Date().toISOString()
      o.refundReason = why
      ledger('refund', `Order #${o.number} refunded · ${why}`, -o.share, true)
      emit('misc')
      return clone(o)
    },

    // ── Contract v5 ─────────────────────────────────────────────────────────
    async restorePhotos(ids) {
      await wait(latency)
      const events = new Set<ID>()
      let restored = 0
      for (const id of ids) {
        if (!state.trashed[id]) continue
        const p = getPhotoAny(id)
        if (!p || !s().albums.some((a) => a.id === p.albumId && !a.deletedAt)) continue
        delete state.trashed[id]
        events.add(p.eventId)
        restored++
      }
      invalidate()
      events.forEach(recount)
      emit('photos', 'albums', 'events')
      return { restored }
    },
    async restoreAlbum(id) {
      await wait(latency)
      const a = s().albums.find((x) => x.id === id && s().events.some((e) => e.id === x.eventId))
      if (!a) fail(404, 'not_found', `Album ${id} was not found.`)
      if (!a!.deletedAt) fail(409, 'not_deleted', 'This album isn’t in the trash.')
      const at = a!.deletedAt
      for (const [pid, when] of Object.entries(state.trashed)) {
        if (when === at && getPhotoAny(pid)?.albumId === a!.id) delete state.trashed[pid]
      }
      delete a!.deletedAt
      invalidate()
      recount(a!.eventId)
      emit('albums', 'events', 'photos')
      return clone(a!)
    },
    async restoreQR(id) {
      await wait(latency)
      const q = byId(s().qrs, id, 'QR code')
      if (!q.deletedAt) fail(409, 'not_deleted', 'This QR code isn’t in the trash.')
      delete q.deletedAt
      emit('misc')
      return clone(q)
    },
    async restoreBroadcast(id) {
      await wait(latency)
      const b = byId(s().broadcasts, id, 'Broadcast')
      if (!b.deletedAt) fail(409, 'not_deleted', 'This message isn’t in the trash.')
      delete b.deletedAt
      emit('misc')
      return clone(b)
    },
    async rotatePhotos(ids, degrees) {
      await wait(latency / 2)
      if (!Number.isInteger(degrees) || degrees % 90 !== 0) fail(422, 'validation_failed', 'Turn photos by 90, 180 or 270 degrees.', { errors: [{ field: 'degrees', in: 'body', message: 'Use a multiple of 90', code: 'not_multiple_of' }] })
      let updated = 0
      for (const id of ids) {
        const p = getPhotoMerged(id)
        if (!p) continue
        patchPhoto(id, { rotation: addRotation(p.rotation ?? 0, degrees) })
        updated++
      }
      emit('photos')
      return { updated }
    },
    async removeGuest(guestId) {
      await wait(latency)
      byId(liveGuests(), guestId, 'Guest')
      state.extra.removedGuests[guestId] = new Date().toISOString()
      emit('guests')
    },
    async restoreGuest(guestId) {
      await wait(latency)
      const g = byId(s().guests, guestId, 'Guest')
      if (!state.extra.removedGuests[guestId]) fail(409, 'not_removed', 'This guest still has access.')
      delete state.extra.removedGuests[guestId]
      emit('guests')
      return clone(g)
    },
    async reopenAccessRequest(id) {
      await wait(latency)
      const r = state.extra.resolvedRequests[id]
      if (!r) {
        if (s().accessRequests.some((a) => a.id === id)) fail(409, 'not_resolved', 'This request is still waiting for you.')
        fail(404, 'not_found', `Access request ${id} was not found.`)
      }
      if (r.guestId) s().guests = s().guests.filter((g) => g.id !== r.guestId)
      delete state.extra.resolvedRequests[id]
      s().accessRequests.unshift(clone(r.request))
      emit('guests')
      return clone(r.request)
    },
    async getEventStats(eventId) {
      await wait(latency / 2)
      const e = findEvent(eventId)
      const { photos, faces } = faceProgress(e)
      const all = liveAlbums().filter((a) => a.eventId === e.id && a.kind !== 'store').flatMap(albumPhotos)
      return {
        eventId: e.id, visits: e.visits.web + e.visits.android + e.visits.ios,
        photoViews: photos.reduce((n, p) => n + p.views, 0), downloads: state.extra.downloadEvents.filter((d) => d.eventId === e.id).length,
        favourites: all.reduce((n, p) => n + p.favourites, 0), guests: liveGuests().filter((g) => g.eventId === e.id).length,
        faceSearches: e.faceMatches, photos: photos.length, processing: all.filter((p) => p.status === 'processing').length,
        faces, asOf: new Date().toISOString(),
      }
    },
    async getStudioStats(o = {}) {
      await wait(latency)
      const month = o.month && /^\d{4}-\d{2}$/.test(o.month) ? o.month : monthKey(Date.now())
      const [y, m] = month.split('-').map(Number)
      const prev = monthKey(new Date(y, m - 2, 1).getTime())
      const events = s().events.filter((e) => !e.deletedAt)
      const inMonth = (k: string) => ({ ev: events.filter((e) => monthKey(e.date) === k), or: s().orders.filter((x) => monthKey(x.at) === k) })
      const cur = inMonth(month), last = inMonth(prev)
      const all = statsFor(events, [])
      return {
        month, thisMonth: statsFor(cur.ev, cur.or), lastMonth: statsFor(last.ev, last.or),
        allTime: { visits: all.visits, downloads: all.downloads, faceSearches: all.faceSearches, photoViews: all.photoViews },
        asOf: new Date().toISOString(),
      }
    },
    async updateOrder(orderId, patch) {
      await wait(latency)
      const o = byId(s().orders, orderId, 'Order')
      if (patch.trackingNumber !== undefined) {
        const t = patch.trackingNumber.trim()
        if (t.length > 80) fail(422, 'validation_failed', 'Tracking numbers are up to 80 characters.')
        if (t) o.trackingNumber = t; else delete o.trackingNumber
      }
      emit('misc')
      return clone(o)
    },
    async resendDownloadLink(orderId) {
      await wait(latency)
      const o = byId(s().orders, orderId, 'Order')
      if (o.status !== 'paid' && o.status !== 'printing' && o.status !== 'paid-direct') {
        fail(409, 'order_not_deliverable', o.status === 'refunded' ? `Order #${o.number} was refunded, so its download link no longer works.` : `Order #${o.number} isn’t paid yet.`, { orderStatus: o.status })
      }
      if (!o.buyerEmail) fail(422, 'no_buyer_email', `Order #${o.number} has no email to send the link to.`)
      o.linkSentAt = new Date().toISOString()
      console.info(`[frameline mock] Email to ${o.buyerEmail}: your photos from ${o.eventName}`)
      emit('misc')
      return { sentTo: o.buyerEmail!, order: clone(o) }
    },
    async checkHandle(handle) {
      await wait(latency / 2)
      const h = handle.trim().toLowerCase()
      const bad = handleProblem(h)
      if (bad) return bad
      if (h === s().studio.handle) return { handle: h, available: true, reason: 'yours' as const }
      if (TAKEN_HANDLES.has(h)) return { handle: h, available: false, reason: 'taken' as const }
      return { handle: h, available: true }
    },
    async recordPhotoViews(photoIds) {
      await wait(latency / 2)
      new Set(photoIds).forEach((id) => { const p = getPhotoMerged(id); if (p) patchPhoto(id, { views: (p.views ?? 0) + 1 }) })
      emit('photos')
    },
    async requestNotify(shortId, phone) {
      await wait(latency)
      const e = findEvent(shortId)
      const d = digits(phone)
      if (d.length < 10 || d.length > 13) fail(422, 'validation_failed', 'Enter a 10-digit mobile number.', { errors: [{ field: 'phone', in: 'body', message: 'Enter a 10-digit mobile number', code: 'invalid_string' }] })
      const hasPhotos = publicAlbums(e).filter((a) => a.kind === 'album').some((a) => albumPhotos(a).some(visibleToGuests))
      if (hasPhotos) fail(409, 'already_live', 'The photos are already here. Open the gallery to see them.')
      let n = state.extra.notify.find((x) => x.eventId === e.id && digits(x.phone) === d && !x.notifiedAt)
      if (!n) { n = { eventId: e.id, phone: phone.trim(), createdAt: new Date().toISOString() }; state.extra.notify.push(n) }
      save()
      return { eventId: n.eventId, phone: n.phone, createdAt: n.createdAt }
    },
    async cancelNotify(shortId, phone) {
      await wait(latency / 2)
      const e = findEvent(shortId)
      const d = digits(phone)
      state.extra.notify = state.extra.notify.filter((x) => !(x.eventId === e.id && digits(x.phone) === d && !x.notifiedAt))
      save()
    },

  }
  if (persist) {
    for (const key of Object.keys(api) as (keyof FramelineApi)[]) {
      if (key === 'subscribe') continue
      const fn = api[key] as unknown as (...a: unknown[]) => unknown
      ;(api as unknown as Record<string, unknown>)[key] = (...args: unknown[]) => { refreshIfChanged(); return fn(...args) }
    }
  }
  return api
}
