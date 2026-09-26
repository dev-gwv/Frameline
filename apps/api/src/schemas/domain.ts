import { z } from '@hono/zod-openapi'

/** Zod mirrors of `@frameline/shared` types. They drive validation and the OpenAPI document. */

export const Id = z.string().min(1).max(128)
export const IsoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Must be an ISO-8601 date').openapi({ format: 'date-time', example: '2026-09-12T00:00:00.000Z' })
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour like #8C2F39')

export const Tone = z.object({
  stops: z.tuple([z.string(), z.string(), z.string()]),
  angle: z.number(),
}).openapi('Tone')

export const EventStatus = z.enum(['live', 'uploading', 'expiring', 'draft', 'archived'])
export const EventType = z.enum(['wedding', 'engagement', 'couple', 'family', 'baby', 'birthday', 'corporate', 'school', 'sports', 'product', 'real-estate', 'themed', 'other'])
export const PresetId = z.enum(['private-family', 'open-corporate', 'race'])
export const Role = z.enum(['owner', 'editor', 'uploader'])

export const Studio = z.object({
  id: Id,
  name: z.string(),
  handle: z.string(),
  logoUrl: z.string().optional(),
  brandColor: z.string(),
  phone: z.string(),
  email: z.string(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  city: z.string(),
  followCode: z.string(),
  about: z.string().optional(),
  coverUrl: z.string().optional(),
  studioType: z.string().optional(),
  referralSource: z.string().optional(),
  services: z.array(z.object({ id: z.string(), name: z.string(), price: z.string(), description: z.string() })),
  testimonials: z.array(z.object({ id: z.string(), quote: z.string(), name: z.string(), photoUrl: z.string().optional(), detail: z.string().optional() })),
  faq: z.array(z.object({ id: z.string(), q: z.string(), a: z.string() })),
  socialLinks: z.array(z.object({ platform: z.string(), url: z.string() })),
  portfolioLinks: z.array(z.string()),
  app: z.object({ featuredEventIds: z.array(z.string()), showServices: z.boolean(), showFaq: z.boolean(), showPrivate: z.boolean() }),
  followers: z.number().int(),
}).openapi('Studio')

const ItemId = z.string().trim().min(1).max(64)

export const StudioPatch = z.object({
  name: z.string().trim().min(1).max(120),
  handle: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Use 3–40 lowercase letters, numbers or dashes'),
  logoUrl: z.url().max(2048),
  brandColor: HexColor,
  phone: z.string().max(40),
  email: z.email().max(254),
  website: z.string().max(2048),
  instagram: z.string().max(80),
  city: z.string().max(120),
  about: z.string().max(4000),
  coverUrl: z.string().max(2048),
  studioType: z.string().max(60),
  referralSource: z.string().max(120),
  services: z.array(z.object({ id: ItemId, name: z.string().trim().min(1).max(120), price: z.string().max(60), description: z.string().max(500) })).max(30),
  testimonials: z.array(z.object({ id: ItemId, quote: z.string().trim().min(1).max(1000), name: z.string().trim().min(1).max(120), photoUrl: z.string().max(2048).optional(), detail: z.string().max(120).optional() })).max(30),
  faq: z.array(z.object({ id: ItemId, q: z.string().trim().min(1).max(300), a: z.string().trim().min(1).max(2000) })).max(50),
  socialLinks: z.array(z.object({ platform: z.string().max(30), url: z.string().max(2048) })).max(20),
  portfolioLinks: z.array(z.string().max(2048)).max(20),
  app: z.object({ featuredEventIds: z.array(z.string().max(128)).max(24), showServices: z.boolean(), showFaq: z.boolean(), showPrivate: z.boolean() }).partial(),
}).partial().strict().openapi('StudioPatch')

export const Usage = z.object({
  planId: z.enum(['starter', 'studio', 'pro', 'agency']),
  period: z.enum(['yearly', 'quarterly']),
  validTill: z.string(),
  photosUsed: z.number().int(),
  photosLimit: z.number().int(),
  guestReserved: z.number().int(),
  walletCredits: z.number(),
  renewalMultiplier: z.number(),
}).openapi('Usage')

export const EventSettings = z.object({
  access: z.enum(['link', 'link-pin', 'registered']),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits'),
  requireRegistration: z.boolean(),
  skipAppLanding: z.boolean(),
  faceSearch: z.boolean(),
  facePrivacy: z.boolean(),
  anonymousSelfie: z.boolean(),
  downloads: z.enum(['all', 'own', 'none']),
  originalDownloads: z.boolean(),
  anonymousDownloads: z.boolean(),
  guestUploads: z.boolean(),
  guestUploadLimit: z.number().int().min(0).max(100_000),
  watermarkGuestUploads: z.boolean(),
  reviewGuestUploads: z.boolean(),
  watermarkOff: z.boolean(),
  showOnWebsite: z.boolean(),
  allowEnquiries: z.boolean(),
  storeEnabled: z.boolean(),
  disabled: z.boolean(),
  shortLinks: z.boolean(),
}).openapi('EventSettings')

export const EventHost = z.object({
  id: Id, name: z.string().max(120), email: z.string().max(254), phone: z.string().max(40).optional(), role: z.enum(['client', 'host']),
}).openapi('EventHost')

export const PhotoEvent = z.object({
  id: Id,
  shortId: z.string(),
  name: z.string(),
  type: EventType,
  date: z.string(),
  endDate: z.string().optional(),
  city: z.string(),
  status: EventStatus,
  photoCount: z.number().int(),
  photoLimit: z.number().int(),
  visits: z.object({ web: z.number().int(), android: z.number().int(), ios: z.number().int() }),
  faceMatches: z.number().int(),
  expiresAt: z.string(),
  createdAt: z.string(),
  coverTones: z.tuple([Tone, Tone, Tone]),
  settings: EventSettings,
  hosts: z.array(EventHost),
  highlights: z.boolean(),
  plan: z.enum(['subscription', 'pack', 'trial']),
  coverPhotoId: z.string().optional(),
}).openapi('PhotoEvent')

export const NewEventInput = z.object({
  name: z.string().trim().min(1, 'Give the event a name').max(160),
  date: IsoDate,
  city: z.string().trim().max(120).default(''),
  type: EventType,
  preset: PresetId,
  host: z.object({ email: z.email().max(254), phone: z.string().max(40).optional() }).optional(),
  guestUploadLimit: z.number().int().min(0).max(100_000).default(300),
}).strict().openapi('NewEventInput')

export const EventPatch = z.object({
  name: z.string().trim().min(1).max(160),
  type: EventType,
  date: IsoDate,
  endDate: IsoDate,
  city: z.string().trim().max(120),
  status: EventStatus,
  photoLimit: z.number().int().min(0).max(1_000_000),
  expiresAt: IsoDate,
  coverTones: z.tuple([Tone, Tone, Tone]),
  hosts: z.array(EventHost).max(20),
  highlights: z.boolean(),
  plan: z.enum(['subscription', 'pack', 'trial']),
}).partial().strict().openapi('EventPatch')

export const EventSettingsPatch = EventSettings.partial().strict().openapi('EventSettingsPatch')

export const Album = z.object({
  id: Id, eventId: Id, name: z.string(), order: z.number().int(), photoCount: z.number().int(),
  kind: z.enum(['album', 'guest', 'store']), firstCapture: z.string().optional(), lastCapture: z.string().optional(),
  coverPhotoId: z.string().optional(),
}).openapi('Album')

export const Film = z.object({ id: Id, eventId: Id, name: z.string(), url: z.string() }).openapi('Film')

export const Exif = z.object({
  camera: z.string().optional(), lens: z.string().optional(), exposure: z.string().optional(),
  width: z.number().int(), height: z.number().int(), sizeBytes: z.number().int(),
}).openapi('Exif')

export const Box = z.tuple([z.number(), z.number(), z.number(), z.number()])

export const Photo = z.object({
  id: Id, eventId: Id, albumId: Id, filename: z.string(), index: z.number().int(), capturedAt: z.string(), tone: Tone,
  url: z.string().optional(), status: z.enum(['ready', 'processing']), hidden: z.boolean(), favourites: z.number().int(),
  downloads: z.number().int(), faces: z.array(z.object({ personId: Id, box: Box })), exif: Exif, uploadedBy: z.string(),
  source: z.enum(['web', 'camera', 'drive', 'guest', 'desktop']),
  reviewStatus: z.enum(['pending', 'approved']).optional(), enhancedFrom: z.string().optional(),
}).openapi('Photo')

export const Person = z.object({ id: Id, eventId: Id, name: z.string().optional(), photoCount: z.number().int(), tone: Tone }).openapi('Person')

export const Guest = z.object({
  id: Id, eventId: Id, name: z.string(), email: z.string(), phone: z.string(), role: z.enum(['guest', 'host', 'client']),
  favourites: z.array(Id), lastActive: z.string(), registeredAt: z.string(),
}).openapi('Guest')

export const AccessRequest = z.object({ id: Id, eventId: Id, name: z.string(), email: z.string(), note: z.string(), createdAt: z.string() }).openapi('AccessRequest')

export const ActivityItem = z.object({
  id: Id, kind: z.enum(['face', 'order', 'camera', 'guest-upload', 'registration', 'enquiry']), title: z.string(), detail: z.string(), at: z.string(),
}).openapi('ActivityItem')

export const Order = z.object({
  id: Id, number: z.number().int(), buyer: z.string(), eventId: Id, eventName: z.string(), items: z.string(),
  paid: z.number().openapi({ description: 'Major units (rupees); stored as paise.' }), currency: z.enum(['INR', 'USD']),
  share: z.number(), status: z.enum(['paid', 'printing', 'refunded', 'pending', 'paid-direct']), at: z.string(),
  photoIds: z.array(z.string()).optional(), buyerEmail: z.string().optional(), method: z.enum(['upi', 'card', 'netbanking', 'international']).optional(),
  checkout: z.object({ provider: z.literal('razorpay'), orderId: z.string(), keyId: z.string(), amount: z.number(), currency: z.literal('INR') }).optional(),
}).openapi('Order')

export const LedgerEntry = z.object({
  id: Id, at: z.string(), description: z.string(),
  type: z.enum(['sale', 'payout', 'refund', 'renewal-markup', 'credits-used', 'credits-added']),
  amount: z.number(), balance: z.number(),
}).openapi('LedgerEntry')

export const Price = z.object({ id: z.string(), label: z.string(), detail: z.string(), price: z.number() }).openapi('Price')

export const CameraMode = z.enum(['live-2k', 'review-first', 'originals'])
export const Camera = z.object({
  id: Id, label: z.string(), eventId: Id, albumId: Id, mode: CameraMode, ftpUser: z.string(),
  status: z.enum(['receiving', 'idle', 'offline']), today: z.number().int(), lastFile: z.string().optional(),
  password: z.string().optional().openapi({ description: 'Only on create and password reset.' }),
}).openapi('Camera')

export const CameraUpload = z.object({
  id: z.string(), cameraId: z.string(), filename: z.string(), at: z.string(), sizeBytes: z.number().int(),
  status: z.enum(['uploaded', 'failed', 'skipped']), photoId: z.string().optional(), error: z.string().optional(),
}).openapi('CameraUpload')

export const SmartQR = z.object({
  id: Id, name: z.string(), slug: z.string(), eventId: Id, target: z.enum(['web', 'app', 'smart']), scans: z.number().int(), color: z.string(),
  scheduledEventId: z.string().optional(), scheduledAt: z.string().optional(), dotStyle: z.enum(['square', 'rounded', 'dots']).optional(), logoUrl: z.string().optional(),
}).openapi('SmartQR')

export const Broadcast = z.object({
  id: Id, title: z.string(), body: z.string(), audience: z.string(), sentAt: z.string().optional(), scheduledAt: z.string().optional(), openRate: z.number().optional(),
  imageUrl: z.string().optional(), cancelledAt: z.string().optional(),
}).openapi('Broadcast')

export const TicketPlatform = z.enum(['web-gallery', 'app', 'admin', 'desktop'])
export const Ticket = z.object({
  id: Id, subject: z.string(), eventId: Id.optional(), platform: TicketPlatform, status: z.enum(['open', 'answered', 'waiting', 'closed']),
  messages: z.array(z.object({ from: z.enum(['me', 'support']), body: z.string(), at: z.string() })),
}).openapi('Ticket')

export const TeamMember = z.object({
  id: Id, name: z.string(), email: z.string(), role: Role, access: z.string(), lastActive: z.string(),
  eventIds: z.array(z.string()).optional(), pending: z.boolean().optional(),
}).openapi('TeamMember')

export const WatermarkSettings = z.object({
  mode: z.enum(['text', 'logo']),
  text: z.string().max(80),
  subtitle: z.string().max(80),
  position: z.enum(['tl', 'tr', 'bl', 'br']),
  size: z.enum(['subtle', 'normal', 'bold']),
  opacity: z.number().int().min(0).max(100),
  font: z.string().max(60),
  applyTo: z.object({ previews: z.boolean(), downloads: z.boolean(), guestUploads: z.boolean(), originals: z.boolean() }),
  logoUrl: z.string().max(2048).optional(),
  edgeOffset: z.number().min(0).max(20),
}).openapi('WatermarkSettings')

export const WatermarkPatch = WatermarkSettings.extend({
  applyTo: WatermarkSettings.shape.applyTo.partial(),
}).partial().strict().openapi('WatermarkPatch')

export const WebsiteSection = z.object({ id: z.string().max(40), label: z.string().max(80), enabled: z.boolean() })
export const Website = z.object({
  published: z.boolean(),
  template: z.enum(['classic', 'editorial', 'minimal', 'bold', 'showcase', 'portfolio']),
  headline: z.string(),
  sections: z.array(WebsiteSection),
  customDomain: z.string().optional(),
}).openapi('Website')

export const WebsitePatch = z.object({
  published: z.boolean(),
  template: Website.shape.template,
  headline: z.string().max(200),
  sections: z.array(WebsiteSection).max(30),
  customDomain: z.string().max(253).regex(/^[a-z0-9.-]+$/i, 'Enter a domain like photos.example.com'),
}).partial().strict().openapi('WebsitePatch')

export const Enquiry = z.object({
  id: Id, name: z.string(), phone: z.string(), email: z.string(), message: z.string(), source: z.string(), at: z.string(), note: z.string().optional(),
  status: z.enum(['new', 'replied']), eventId: z.string().optional(),
}).openapi('Enquiry')

export const User = z.object({ id: Id, email: z.string(), name: z.string(), hasPassword: z.boolean() }).openapi('User')
export const MembershipView = z.object({
  studioId: Id, studioName: z.string(), role: Role, eventIds: z.array(Id),
}).openapi('Membership')

// ── Added with contract v2 ──────────────────────────────────────────────────
export const Purchase = z.object({
  id: Id, at: z.string(), description: z.string(), kind: z.enum(['plan', 'pack', 'credits', 'renewal', 'enhance', 'coupon']),
  amount: z.number(), method: z.enum(['card', 'upi', 'credits', 'coupon']), invoiceNumber: z.string(),
}).openapi('Purchase')

const Address = z.object({ street: z.string().max(200), city: z.string().max(120), state: z.string().max(120), postal: z.string().max(12) })
const KycDocument = z.object({ kind: z.enum(['pan', 'id', 'gst', 'cheque']), status: z.enum(['verified', 'review', 'needed']), fileName: z.string().max(255) })
const SaleWatermark = z.object({
  template: z.enum(['forsale', 'centre']), text: z.string().max(80), orientation: z.enum(['diagonal', 'vertical', 'horizontal']),
  size: z.number().min(0).max(10), opacity: z.number().int().min(0).max(100), color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #FFFFFF'),
})
const International = z.object({
  enabled: z.boolean(), plan: z.enum(['starter', 'growth', 'pro']).optional(), paymentLink: z.string().max(2048).optional(),
  upiQrUrl: z.string().max(4096).optional(), upiQrName: z.string().max(255).optional(), email: z.string().max(254).optional(), whatsapp: z.string().max(40).optional(),
})
export const StoreSettings = z.object({
  kyc: z.object({ legalName: z.string(), pan: z.string(), gstRegistered: z.boolean(), gstin: z.string(), address: Address, documents: z.array(KycDocument) }),
  payout: z.object({ holder: z.string(), accountLast4: z.string(), ifsc: z.string(), bank: z.string(), branch: z.string(), verified: z.boolean() }),
  saleWatermark: SaleWatermark,
  international: International,
  terms: z.string(),
}).openapi('StoreSettings')

export const StoreSettingsPatch = z.object({
  kyc: z.object({
    legalName: z.string().max(200),
    pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN is 10 characters, e.g. AAKFN4521Q'),
    gstRegistered: z.boolean(),
    gstin: z.string().regex(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, 'GSTIN is 15 characters, e.g. 27AAKFN4521Q1Z8'),
    address: Address.partial(),
    documents: z.array(KycDocument).max(10),
  }).partial().strict(),
  payout: z.object({
    holder: z.string().max(200), accountNumber: z.string().regex(/^\d{9,18}$/, 'Account number is 9 to 18 digits'),
    ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC is 11 characters, e.g. HDFC0001234'), bank: z.string().max(120), branch: z.string().max(120),
  }).partial().strict(),
  saleWatermark: SaleWatermark.partial().strict(),
  international: International.partial().strict(),
  terms: z.string().min(1).max(20_000),
}).partial().strict().openapi('StoreSettingsPatch')

export const NotificationPrefs = z.object({
  enquiryEmails: z.array(z.email().max(254)).max(10), eventExpiry: z.boolean(), planExpiry: z.boolean(), weeklySummary: z.boolean(),
}).openapi('NotificationPrefs')

export const ZipRequest = z.object({
  id: Id, eventId: Id, albumId: z.string().optional(), email: z.string(), photoCount: z.number().int(),
  status: z.enum(['queued', 'ready', 'failed']), requestedAt: z.string(), readyAt: z.string().optional(), url: z.string().optional(),
}).openapi('ZipRequest')

export const UsageReport = z.object({
  id: Id, status: z.enum(['processing', 'ready']), requestedAt: z.string(), readyAt: z.string().optional(), csv: z.string().optional(),
}).openapi('UsageReport')

export const UsageBreakdown = z.object({
  limit: z.number().int(), used: z.number().int(), guestReserved: z.number().int(), available: z.number().int(), rules: z.array(z.string()),
  events: z.array(z.object({ eventId: z.string(), name: z.string(), webPhotos: z.number().int(), originals: z.number().int(), guestUploads: z.number().int(), counted: z.number().int() })),
}).openapi('UsageBreakdown')

export const PublicStudio = z.object({
  id: Id, name: z.string(), handle: z.string(), logoUrl: z.string().optional(), brandColor: z.string(), phone: z.string(), email: z.string(),
  website: z.string().optional(), instagram: z.string().optional(), city: z.string(), followCode: z.string(),
}).openapi('PublicStudio')

export const PublicEvent = z.object({
  id: Id, shortId: z.string(), name: z.string(), type: EventType, date: z.string(), endDate: z.string().optional(), city: z.string(),
  status: EventStatus, photoCount: z.number().int(), expiresAt: z.string(), coverTones: z.tuple([Tone, Tone, Tone]),
  coverPhotoId: z.string().optional(), coverUrl: z.string().optional(), highlights: z.boolean(),
  settings: EventSettings.omit({ pin: true }), albums: z.array(Album), films: z.array(Film), studio: PublicStudio,
  blocked: z.enum(['disabled', 'archived', 'expired', 'empty']).optional(),
}).openapi('PublicEvent')

export const GuestSession = z.object({
  token: z.string(), expiresIn: z.number().int(), eventId: Id, shortId: z.string(), guestId: z.string().optional(), seeAll: z.boolean(),
}).openapi('GuestSession')

export const StudioProfile = z.object({
  studio: PublicStudio.extend({
    about: z.string().optional(), coverUrl: z.string().optional(), followers: z.number().int(),
    services: Studio.shape.services, testimonials: Studio.shape.testimonials, faq: Studio.shape.faq,
    socialLinks: Studio.shape.socialLinks, portfolioLinks: Studio.shape.portfolioLinks,
  }),
  featured: z.array(z.object({
    id: Id, shortId: z.string(), name: z.string(), type: EventType, date: z.string(), city: z.string(),
    coverTones: z.tuple([Tone, Tone, Tone]), photoCount: z.number().int(), coverPhotoId: z.string().optional(),
  })),
}).openapi('StudioProfile')

export const GuestLinkPayload = z.object({
  v: z.literal(1).optional(),
  e: z.string().regex(/^[0-9A-Za-z]{4,12}$/),
  n: z.string().max(40).optional(),
  album: z.string().max(128).optional(),
  me: z.boolean().optional(),
  p: z.string().max(128).optional(),
  vip: z.object({ skipLogin: z.boolean().optional(), pin: z.boolean().optional(), all: z.boolean().optional() }).optional(),
}).openapi('GuestLinkPayload')

export const LedgerEntrySchema = LedgerEntry
