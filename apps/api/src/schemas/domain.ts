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
}).openapi('Studio')

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
}).openapi('Camera')

export const SmartQR = z.object({
  id: Id, name: z.string(), slug: z.string(), eventId: Id, target: z.enum(['web', 'app', 'smart']), scans: z.number().int(), color: z.string(),
}).openapi('SmartQR')

export const Broadcast = z.object({
  id: Id, title: z.string(), body: z.string(), audience: z.string(), sentAt: z.string().optional(), scheduledAt: z.string().optional(), openRate: z.number().optional(),
}).openapi('Broadcast')

export const TicketPlatform = z.enum(['web-gallery', 'app', 'admin', 'desktop'])
export const Ticket = z.object({
  id: Id, subject: z.string(), eventId: Id.optional(), platform: TicketPlatform, status: z.enum(['open', 'answered', 'waiting', 'closed']),
  messages: z.array(z.object({ from: z.enum(['me', 'support']), body: z.string(), at: z.string() })),
}).openapi('Ticket')

export const TeamMember = z.object({
  id: Id, name: z.string(), email: z.string(), role: Role, access: z.string(), lastActive: z.string(),
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
}).openapi('Enquiry')

export const User = z.object({ id: Id, email: z.string(), name: z.string(), hasPassword: z.boolean() }).openapi('User')
export const MembershipView = z.object({
  studioId: Id, studioName: z.string(), role: Role, eventIds: z.array(Id),
}).openapi('Membership')
