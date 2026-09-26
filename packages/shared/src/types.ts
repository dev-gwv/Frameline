/** Domain model shared by the API, admin web app, guest gallery and mobile app. */

export type ID = string

/** A photo swatch used until real renditions exist: 3-stop gradient at an angle. */
export interface Tone {
  stops: [string, string, string]
  angle: number
}

export type EventStatus = 'live' | 'uploading' | 'expiring' | 'draft' | 'archived'
export type EventType =
  | 'wedding' | 'engagement' | 'couple' | 'family' | 'baby' | 'birthday'
  | 'corporate' | 'school' | 'sports' | 'product' | 'real-estate' | 'themed' | 'other'
export type PresetId = 'private-family' | 'open-corporate' | 'race'
export type AccessMode = 'link' | 'link-pin' | 'registered'
export type DownloadMode = 'all' | 'own' | 'none'
export type UploadQuality = 'web' | 'original'

export interface Studio {
  id: ID
  name: string
  handle: string // northlight → northlight.frameline.in
  logoUrl?: string
  brandColor: string
  phone: string
  email: string
  website?: string
  instagram?: string
  city: string
  followCode: string
  about?: string
  /** Cover photo for the website / studio app header. */
  coverUrl?: string
  /** What the studio mostly shoots (from onboarding), e.g. "wedding". */
  studioType?: string
  /** How they heard about Frameline (from onboarding). */
  referralSource?: string
  services: StudioService[]
  testimonials: StudioTestimonial[]
  faq: StudioFaq[]
  socialLinks: SocialLink[]
  portfolioLinks: string[]
  /** Studio app / public profile configuration. */
  app: StudioAppConfig
  followers: number
  /** Billing & GST details printed on Frameline invoices. */
  billing?: StudioBilling
}

export interface StudioBilling { name: string; gstin?: string; address: string; state: string; invoiceEmail: string }

export interface StudioService { id: ID; name: string; /** Display price, e.g. "From ₹1,50,000". */ price: string; description: string }
export interface StudioTestimonial { id: ID; quote: string; name: string; photoUrl?: string; /** e.g. "Udaipur, 2026" */ detail?: string }
export interface StudioFaq { id: ID; q: string; a: string }
export interface SocialLink { platform: string; url: string }
export interface StudioAppConfig { featuredEventIds: ID[]; showServices: boolean; showFaq: boolean; showPrivate: boolean }

export interface Plan {
  id: 'starter' | 'studio' | 'pro' | 'agency'
  name: string
  pricePerYear: number
  photos: number
  seats: number
}

export interface Usage {
  planId: Plan['id']
  period: 'yearly' | 'quarterly'
  validTill: string
  photosUsed: number
  photosLimit: number
  guestReserved: number
  walletCredits: number
  renewalMultiplier: number
}

export interface EventSettings {
  access: AccessMode
  pin: string
  requireRegistration: boolean
  skipAppLanding: boolean
  faceSearch: boolean
  facePrivacy: boolean
  anonymousSelfie: boolean
  downloads: DownloadMode
  originalDownloads: boolean
  anonymousDownloads: boolean
  guestUploads: boolean
  guestUploadLimit: number
  watermarkGuestUploads: boolean
  reviewGuestUploads: boolean
  watermarkOff: boolean
  showOnWebsite: boolean
  allowEnquiries: boolean
  storeEnabled: boolean
  disabled: boolean
  shortLinks: boolean
}

export interface EventHost { id: ID; name: string; email: string; phone?: string; role: 'client' | 'host' }

export interface PhotoEvent {
  id: ID
  shortId: string // 6402F9F
  name: string
  type: EventType
  date: string // ISO start date
  endDate?: string
  city: string
  status: EventStatus
  photoCount: number
  photoLimit: number
  visits: { web: number; android: number; ios: number }
  faceMatches: number
  expiresAt: string
  createdAt: string
  coverTones: [Tone, Tone, Tone]
  settings: EventSettings
  hosts: EventHost[]
  highlights: boolean
  plan: 'subscription' | 'pack' | 'trial'
  /** Photo chosen as the event cover (setCover scope 'event'). */
  coverPhotoId?: ID
  /** Set while the event is in the trash (listDeletedEvents); purged 30 days later. */
  deletedAt?: string
}

export interface Album {
  id: ID
  eventId: ID
  name: string
  order: number
  photoCount: number
  kind: 'album' | 'guest' | 'store'
  firstCapture?: string
  lastCapture?: string
  /** Photo chosen as the album cover (setCover scope 'album'). */
  coverPhotoId?: ID
}

export interface Film { id: ID; eventId: ID; name: string; url: string }

export interface Exif {
  camera?: string
  lens?: string
  exposure?: string
  width: number
  height: number
  sizeBytes: number
}

export interface Photo {
  id: ID
  eventId: ID
  albumId: ID
  filename: string
  index: number
  capturedAt: string
  tone: Tone
  /** Object URL / CDN URL once a real file exists. */
  url?: string
  status: 'ready' | 'processing'
  hidden: boolean
  favourites: number
  downloads: number
  faces: { personId: ID; box: [number, number, number, number] }[]
  exif: Exif
  uploadedBy: string
  source: 'web' | 'camera' | 'drive' | 'guest' | 'desktop'
  /** Guest uploads awaiting review are 'pending' and hidden from the gallery until 'approved'. */
  reviewStatus?: 'pending' | 'approved'
  /** Set on AI-enhanced copies. */
  enhancedFrom?: ID
}

export interface Person { id: ID; eventId: ID; name?: string; photoCount: number; tone: Tone }

export interface Guest {
  id: ID
  eventId: ID
  name: string
  email: string
  phone: string
  role: 'guest' | 'host' | 'client'
  favourites: ID[]
  lastActive: string
  registeredAt: string
}

export interface AccessRequest { id: ID; eventId: ID; name: string; email: string; note: string; createdAt: string }

export interface ActivityItem {
  id: ID
  kind: 'face' | 'order' | 'camera' | 'guest-upload' | 'registration' | 'enquiry'
  title: string
  detail: string
  at: string
}

export interface Order {
  id: ID
  number: number
  buyer: string
  eventId: ID
  eventName: string
  items: string
  paid: number
  currency: 'INR' | 'USD'
  share: number
  status: 'paid' | 'printing' | 'refunded' | 'pending' | 'paid-direct'
  at: string
  photoIds?: ID[]
  buyerEmail?: string
  method?: PaymentMethod
  /** Delivery address for print orders. */
  shipping?: ShippingAddress
  /** Present while payment is pending with a provider (real API with Razorpay keys). */
  checkout?: { provider: 'razorpay'; orderId: string; keyId: string; amount: number; currency: 'INR' }
}

export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'international'

export interface ShippingAddress { name: string; phone: string; line1: string; line2?: string; city: string; state: string; postal: string; country?: string }

/** A guest checkout that was started but not paid (pending for more than 30 minutes). */
export interface AbandonedCart {
  orderId: ID; number: number; buyer: string; buyerEmail?: string; eventId: ID; eventName: string; items: string
  amount: number; startedAt: string; reminders: number; remindedAt?: string
}

export interface LedgerEntry {
  id: ID
  at: string
  description: string
  type: 'sale' | 'payout' | 'refund' | 'renewal-markup' | 'credits-used' | 'credits-added'
  amount: number
  balance: number
}

export interface Camera {
  id: ID
  label: string
  eventId: ID
  albumId: ID
  mode: 'live-2k' | 'review-first' | 'originals'
  ftpUser: string
  status: 'receiving' | 'idle' | 'offline'
  today: number
  lastFile?: string
  /** FTP password: only returned by createCamera and resetCameraPassword. */
  password?: string
}

export interface CameraUpload { id: ID; cameraId: ID; filename: string; at: string; sizeBytes: number; status: 'uploaded' | 'failed' | 'skipped'; photoId?: ID; error?: string }

export interface SmartQR {
  id: ID; name: string; slug: string; eventId: ID; target: 'web' | 'app' | 'smart'; scans: number; color: string
  /** Switch the QR to this event at `scheduledAt`. */
  scheduledEventId?: ID
  scheduledAt?: string
  dotStyle?: 'square' | 'rounded' | 'dots'
  logoUrl?: string
}

export interface Broadcast {
  id: ID; title: string; body: string; audience: 'all' | ID; sentAt?: string; scheduledAt?: string; openRate?: number
  imageUrl?: string
  /** Set when a scheduled broadcast was cancelled. */
  cancelledAt?: string
}

export interface Ticket {
  id: ID
  subject: string
  eventId?: ID
  platform: 'web-gallery' | 'app' | 'admin' | 'desktop'
  status: 'open' | 'answered' | 'waiting' | 'closed'
  messages: { from: 'me' | 'support'; body: string; at: string }[]
}

export interface TeamMember {
  id: ID; name: string; email: string; role: 'owner' | 'editor' | 'uploader'; access: string; lastActive: string
  /** Uploaders: events they may upload to. */
  eventIds?: ID[]
  /** True while the invite hasn't been accepted. */
  pending?: boolean
}

export interface WatermarkSettings {
  mode: 'text' | 'logo'
  text: string
  subtitle: string
  position: 'tl' | 'tr' | 'bl' | 'br'
  size: 'subtle' | 'normal' | 'bold'
  opacity: number
  font: string
  applyTo: { previews: boolean; downloads: boolean; guestUploads: boolean; originals: boolean }
  logoUrl?: string
  /** Distance from the edge, in % of the short side (default 3). */
  edgeOffset: number
}

export interface Enquiry {
  id: ID; name: string; phone: string; email: string; message: string; source: string; at: string; note?: string
  status: 'new' | 'replied'
  /** Event the enquiry came from (gallery enquiries). */
  eventId?: ID
}

export interface WebsiteSection { id: string; label: string; enabled: boolean }
export interface Website {
  published: boolean
  template: 'classic' | 'editorial' | 'minimal' | 'bold' | 'showcase' | 'portfolio'
  headline: string
  sections: WebsiteSection[]
  customDomain?: string
}

// ── Money & billing ─────────────────────────────────────────────────────────
export interface Price { id: string; label: string; detail: string; price: number }

/** Something the studio bought from Frameline (plan, pack, credits, renewal, AI enhance, coupon). */
export interface Purchase {
  id: ID
  at: string
  description: string
  kind: 'plan' | 'pack' | 'credits' | 'renewal' | 'enhance' | 'coupon'
  /** Rupees charged (0 for coupons). */
  amount: number
  method: 'card' | 'upi' | 'credits' | 'coupon'
  invoiceNumber: string
}

export type KycDocKind = 'pan' | 'id' | 'gst' | 'cheque'
export interface KycDocument { kind: KycDocKind; status: 'verified' | 'review' | 'needed'; fileName: string; /** From uploadAsset('kyc-document', …). */ assetId?: ID }

export type AssetKind = 'studio-logo' | 'studio-cover' | 'event-cover' | 'watermark-logo' | 'broadcast-image' | 'qr-logo' | 'testimonial-photo' | 'kyc-document'
/** A file uploaded with uploadAsset; `url` can be stored in the matching field (logoUrl, coverUrl, imageUrl…). */
export interface Asset { id: ID; kind: AssetKind; url: string; contentType: string; size: number; fileName: string; createdAt: string }

export interface StoreSettings {
  kyc: {
    legalName: string
    pan: string
    gstRegistered: boolean
    gstin: string
    address: { street: string; city: string; state: string; postal: string }
    documents: KycDocument[]
  }
  payout: { holder: string; accountLast4: string; ifsc: string; bank: string; branch: string; verified: boolean }
  saleWatermark: { template: 'forsale' | 'centre'; text: string; orientation: 'diagonal' | 'vertical' | 'horizontal'; size: number; opacity: number; color: string }
  international: {
    enabled: boolean; plan?: 'starter' | 'growth' | 'pro'; paymentLink?: string; upiQrUrl?: string; upiQrName?: string; email?: string; whatsapp?: string
  }
  terms: string
}

/** Patch for updateStoreSettings: sections are merged; `payout.accountNumber` is write-only (kept as last 4 digits). */
export interface StoreSettingsPatch {
  kyc?: Partial<Omit<StoreSettings['kyc'], 'address'>> & { address?: Partial<StoreSettings['kyc']['address']> }
  payout?: Partial<Omit<StoreSettings['payout'], 'verified' | 'accountLast4'>> & { accountNumber?: string }
  saleWatermark?: Partial<StoreSettings['saleWatermark']>
  international?: Partial<StoreSettings['international']>
  terms?: string
}

export interface NotificationPrefs { enquiryEmails: string[]; eventExpiry: boolean; planExpiry: boolean; weeklySummary: boolean }

export interface ZipRequest {
  id: ID; eventId: ID; albumId?: ID; email: string; photoCount: number
  status: 'queued' | 'ready' | 'failed'; requestedAt: string; readyAt?: string; url?: string
}

export interface UsageReport { id: ID; status: 'processing' | 'ready'; requestedAt: string; readyAt?: string; /** CSV text once ready. */ csv?: string }

export interface UsageBreakdown {
  limit: number
  used: number
  guestReserved: number
  available: number
  /** Plain-language rules for how capacity is counted. */
  rules: string[]
  events: { eventId: ID; name: string; webPhotos: number; originals: number; guestUploads: number; counted: number }[]
}

// ── Guest side ──────────────────────────────────────────────────────────────
export interface PublicStudio {
  id: ID; name: string; handle: string; logoUrl?: string; brandColor: string; phone: string; email: string
  website?: string; instagram?: string; city: string; followCode: string
}

export type PublicBlockReason = 'disabled' | 'archived' | 'expired' | 'empty'

/** What a guest may see about an event (no PIN, no host contacts). */
export interface PublicEvent {
  id: ID; shortId: string; name: string; type: EventType; date: string; endDate?: string; city: string
  status: EventStatus; photoCount: number; expiresAt: string; coverTones: [Tone, Tone, Tone]; coverPhotoId?: ID; coverUrl?: string
  highlights: boolean
  settings: Omit<EventSettings, 'pin'>
  albums: Album[]
  films: Film[]
  studio: PublicStudio
  /** Why the gallery can't be opened, if it can't. */
  blocked?: PublicBlockReason
}

/** Returned by verifyPin / registerGuest; the HTTP client keeps the token for later guest calls. */
export interface GuestSession {
  token: string
  expiresIn: number
  eventId: ID
  shortId: string
  guestId?: ID
  /** True when the guest may browse every photo (typed PIN or VIP "all"). */
  seeAll: boolean
}

export interface StudioProfile {
  studio: PublicStudio & Pick<Studio, 'about' | 'coverUrl' | 'services' | 'testimonials' | 'faq' | 'socialLinks' | 'portfolioLinks' | 'followers'>
  featured: Pick<PublicEvent, 'id' | 'shortId' | 'name' | 'type' | 'date' | 'city' | 'coverTones' | 'photoCount' | 'coverPhotoId'>[]
}

export interface OrderItemInput {
  /** A price id from listPrices: 'single' | 'multi' | 'all' | 'print812' … */
  priceId: string
  photoIds: ID[]
  quantity?: number
}

/** The watermark guests' downloads must carry (enabled = false when the event has watermarkOff). */
export interface PublicWatermark { enabled: boolean; settings: WatermarkSettings }

/** "Download all" uses left for this guest (5 per guest per gallery). */
export interface DownloadAllowance { remaining: number; limit: number }

/** A gallery this guest/device has opened. */
export interface PublicEventSummary {
  id: ID; shortId: string; name: string; type: EventType; date: string; city: string; coverTones: [Tone, Tone, Tone]
  photoCount: number; studioName: string; lastOpenedAt: string
}
