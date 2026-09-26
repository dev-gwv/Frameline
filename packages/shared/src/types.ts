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
}

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
}

export interface SmartQR { id: ID; name: string; slug: string; eventId: ID; target: 'web' | 'app' | 'smart'; scans: number; color: string }

export interface Broadcast { id: ID; title: string; body: string; audience: 'all' | ID; sentAt?: string; scheduledAt?: string; openRate?: number }

export interface Ticket {
  id: ID
  subject: string
  eventId?: ID
  platform: 'web-gallery' | 'app' | 'admin' | 'desktop'
  status: 'open' | 'answered' | 'waiting' | 'closed'
  messages: { from: 'me' | 'support'; body: string; at: string }[]
}

export interface TeamMember { id: ID; name: string; email: string; role: 'owner' | 'editor' | 'uploader'; access: string; lastActive: string }

export interface WatermarkSettings {
  mode: 'text' | 'logo'
  text: string
  subtitle: string
  position: 'tl' | 'tr' | 'bl' | 'br'
  size: 'subtle' | 'normal' | 'bold'
  opacity: number
  font: string
  applyTo: { previews: boolean; downloads: boolean; guestUploads: boolean; originals: boolean }
}

export interface Enquiry { id: ID; name: string; phone: string; email: string; message: string; source: string; at: string; note?: string }

export interface WebsiteSection { id: string; label: string; enabled: boolean }
export interface Website {
  published: boolean
  template: 'classic' | 'editorial' | 'minimal' | 'bold' | 'showcase' | 'portfolio'
  headline: string
  sections: WebsiteSection[]
  customDomain?: string
}
