import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type {
  EventHost, EventSettings, Exif, Tone, WatermarkSettings, WebsiteSection,
} from '@frameline/shared'

/**
 * D1 schema. Conventions:
 * - ids are prefixed random strings; timestamps are ISO-8601 UTC strings (sortable as text)
 * - money is integer minor units (paise) in columns suffixed `_paise`
 * - JSON columns hold small nested value objects that are always read with their row
 */

const ts = (name: string) => text(name)
const bool = (name: string) => integer(name, { mode: 'boolean' })
const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>()

// ── Identity ────────────────────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  googleSub: text('google_sub'),
  emailVerifiedAt: ts('email_verified_at'),
  createdAt: ts('created_at').notNull(),
  lastActiveAt: ts('last_active_at'),
}, (t) => [uniqueIndex('users_email_uq').on(t.email), uniqueIndex('users_google_uq').on(t.googleSub)])

export const otpCodes = sqliteTable('otp_codes', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: ts('created_at').notNull(),
  expiresAt: ts('expires_at').notNull(),
  consumedAt: ts('consumed_at'),
  ip: text('ip'),
}, (t) => [index('otp_email_idx').on(t.email, t.createdAt)])

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  familyId: text('family_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: ts('created_at').notNull(),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  revokedReason: text('revoked_reason'),
  replacedBy: text('replaced_by'),
  userAgent: text('user_agent'),
  ip: text('ip'),
}, (t) => [uniqueIndex('refresh_hash_uq').on(t.tokenHash), index('refresh_family_idx').on(t.familyId), index('refresh_user_idx').on(t.userId)])

// ── Studios & team ──────────────────────────────────────────────────────────
export const studios = sqliteTable('studios', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  handle: text('handle').notNull(),
  logoUrl: text('logo_url'),
  brandColor: text('brand_color').notNull().default('#8C2F39'),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  website: text('website'),
  instagram: text('instagram'),
  city: text('city').notNull().default(''),
  followCode: text('follow_code').notNull(),
  about: text('about'),
  // plan & usage
  planId: text('plan_id', { enum: ['starter', 'studio', 'pro', 'agency'] }).notNull().default('starter'),
  planPeriod: text('plan_period', { enum: ['yearly', 'quarterly'] }).notNull().default('yearly'),
  validTill: ts('valid_till').notNull(),
  photosUsed: integer('photos_used').notNull().default(0),
  photosLimit: integer('photos_limit').notNull().default(50_000),
  guestReserved: integer('guest_reserved').notNull().default(0),
  walletPaise: integer('wallet_paise').notNull().default(0),
  renewalMultiplier: real('renewal_multiplier').notNull().default(2),
  createdAt: ts('created_at').notNull(),
}, (t) => [uniqueIndex('studios_handle_uq').on(t.handle)])

export const memberships = sqliteTable('memberships', {
  id: text('id').primaryKey(),
  studioId: text('studio_id').notNull().references(() => studios.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'editor', 'uploader'] }).notNull(),
  /** Uploaders only: events they may upload to. */
  eventIds: json<string[]>('event_ids').notNull().default(sql`'[]'`),
  createdAt: ts('created_at').notNull(),
  lastActiveAt: ts('last_active_at'),
}, (t) => [uniqueIndex('memberships_uq').on(t.studioId, t.userId), index('memberships_user_idx').on(t.userId)])

export const teamInvites = sqliteTable('team_invites', {
  id: text('id').primaryKey(),
  studioId: text('studio_id').notNull().references(() => studios.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role', { enum: ['owner', 'editor', 'uploader'] }).notNull(),
  eventIds: json<string[]>('event_ids').notNull().default(sql`'[]'`),
  invitedBy: text('invited_by').notNull(),
  createdAt: ts('created_at').notNull(),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
}, (t) => [index('invites_email_idx').on(t.email), index('invites_studio_idx').on(t.studioId)])

// ── Events, albums, photos ──────────────────────────────────────────────────
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  studioId: text('studio_id').notNull().references(() => studios.id, { onDelete: 'cascade' }),
  shortId: text('short_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  date: ts('date').notNull(),
  endDate: ts('end_date'),
  city: text('city').notNull().default(''),
  status: text('status', { enum: ['live', 'uploading', 'expiring', 'draft', 'archived'] }).notNull().default('draft'),
  photoCount: integer('photo_count').notNull().default(0),
  photoLimit: integer('photo_limit').notNull().default(2000),
  visits: json<{ web: number; android: number; ios: number }>('visits').notNull(),
  faceMatches: integer('face_matches').notNull().default(0),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull(),
  coverTones: json<[Tone, Tone, Tone]>('cover_tones').notNull(),
  coverPhotoId: text('cover_photo_id'),
  settings: json<EventSettings>('settings').notNull(),
  hosts: json<EventHost[]>('hosts').notNull().default(sql`'[]'`),
  highlights: bool('highlights').notNull().default(true),
  plan: text('plan', { enum: ['subscription', 'pack', 'trial'] }).notNull().default('subscription'),
}, (t) => [uniqueIndex('events_short_uq').on(t.shortId), index('events_studio_idx').on(t.studioId, t.createdAt)])

export const albums = sqliteTable('albums', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  studioId: text('studio_id').notNull(),
  name: text('name').notNull(),
  order: integer('sort_order').notNull().default(0),
  photoCount: integer('photo_count').notNull().default(0),
  kind: text('kind', { enum: ['album', 'guest', 'store'] }).notNull().default('album'),
  coverPhotoId: text('cover_photo_id'),
  firstCapture: ts('first_capture'),
  lastCapture: ts('last_capture'),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('albums_event_idx').on(t.eventId, t.order)])

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  albumId: text('album_id').notNull(),
  studioId: text('studio_id').notNull(),
  filename: text('filename').notNull(),
  index: integer('seq').notNull(),
  capturedAt: ts('captured_at').notNull(),
  tone: json<Tone>('tone').notNull(),
  url: text('url'),
  r2Key: text('r2_key'),
  status: text('status', { enum: ['ready', 'processing'] }).notNull().default('processing'),
  hidden: bool('hidden').notNull().default(false),
  favourites: integer('favourites').notNull().default(0),
  downloads: integer('downloads').notNull().default(0),
  /** Denormalised copy of `faces` rows for single-read photo payloads. */
  faces: json<{ personId: string; box: [number, number, number, number] }[]>('faces').notNull().default(sql`'[]'`),
  exif: json<Exif>('exif').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  source: text('source', { enum: ['web', 'camera', 'drive', 'guest', 'desktop'] }).notNull().default('web'),
  quality: text('quality', { enum: ['web', 'original'] }).notNull().default('web'),
  createdAt: ts('created_at').notNull(),
}, (t) => [
  index('photos_event_capture_idx').on(t.eventId, t.capturedAt, t.id),
  index('photos_album_capture_idx').on(t.albumId, t.capturedAt, t.id),
  index('photos_album_name_idx').on(t.albumId, t.filename, t.id),
  index('photos_album_seq_idx').on(t.albumId, t.index, t.id),
  index('photos_event_status_idx').on(t.eventId, t.status),
])

export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name'),
  photoCount: integer('photo_count').notNull().default(0),
  tone: json<Tone>('tone').notNull(),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('people_event_idx').on(t.eventId)])

export const faces = sqliteTable('faces', {
  id: text('id').primaryKey(),
  photoId: text('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull(),
  personId: text('person_id'),
  box: json<[number, number, number, number]>('box').notNull(),
  /** Id of the vector in Vectorize (namespace = event id). */
  vectorId: text('vector_id'),
}, (t) => [index('faces_person_idx').on(t.personId, t.photoId), index('faces_photo_idx').on(t.photoId)])

export const films = sqliteTable('films', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('films_event_idx').on(t.eventId)])

export const uploads = sqliteTable('uploads', {
  id: text('id').primaryKey(),
  studioId: text('studio_id').notNull(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  albumId: text('album_id').notNull(),
  userId: text('user_id').notNull(),
  quality: text('quality', { enum: ['web', 'original'] }).notNull(),
  mode: text('mode', { enum: ['s3', 'proxy'] }).notNull(),
  files: json<UploadFileRecord[]>('files').notNull(),
  status: text('status', { enum: ['pending', 'completed', 'aborted'] }).notNull().default('pending'),
  createdAt: ts('created_at').notNull(),
  expiresAt: ts('expires_at').notNull(),
})

export interface UploadFileRecord {
  photoId: string
  filename: string
  size: number
  contentType: string
  key: string | null
  multipartId: string | null
  partSize: number
  partCount: number
  width?: number
  height?: number
  capturedAt?: string
  url?: string
}

// ── Guests ──────────────────────────────────────────────────────────────────
export const guests = sqliteTable('guests', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  role: text('role', { enum: ['guest', 'host', 'client'] }).notNull().default('guest'),
  favourites: json<string[]>('favourites').notNull().default(sql`'[]'`),
  lastActive: ts('last_active').notNull(),
  registeredAt: ts('registered_at').notNull(),
}, (t) => [index('guests_event_idx').on(t.eventId, t.lastActive)])

export const accessRequests = sqliteTable('access_requests', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  note: text('note').notNull().default(''),
  status: text('status', { enum: ['pending', 'approved', 'declined'] }).notNull().default('pending'),
  createdAt: ts('created_at').notNull(),
  resolvedAt: ts('resolved_at'),
  resolvedBy: text('resolved_by'),
}, (t) => [index('access_event_idx').on(t.eventId, t.status)])

// ── Business ────────────────────────────────────────────────────────────────
export const activity = sqliteTable('activity', {
  id: text('id').primaryKey(),
  studioId: text('studio_id').notNull(),
  kind: text('kind', { enum: ['face', 'order', 'camera', 'guest-upload', 'registration', 'enquiry'] }).notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull().default(''),
  at: ts('at').notNull(),
}, (t) => [index('activity_studio_idx').on(t.studioId, t.at)])

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  studioId: text('studio_id').notNull(),
  number: integer('number').notNull(),
  buyer: text('buyer').notNull(),
  eventId: text('event_id').notNull(),
  eventName: text('event_name').notNull(),
  items: text('items').notNull(),
  paidPaise: integer('paid_paise').notNull(),
  currency: text('currency', { enum: ['INR', 'USD'] }).notNull().default('INR'),
  sharePaise: integer('share_paise').notNull(),
  status: text('status', { enum: ['paid', 'printing', 'refunded', 'pending', 'paid-direct'] }).notNull(),
  providerRef: text('provider_ref'),
  at: ts('at').notNull(),
}, (t) => [index('orders_studio_idx').on(t.studioId, t.at), uniqueIndex('orders_number_uq').on(t.studioId, t.number)])

export const ledgerEntries = sqliteTable('ledger_entries', {
  id: text('id').primaryKey(),
  studioId: text('studio_id').notNull(),
  at: ts('at').notNull(),
  description: text('description').notNull(),
  type: text('type', { enum: ['sale', 'payout', 'refund', 'renewal-markup', 'credits-used', 'credits-added'] }).notNull(),
  amountPaise: integer('amount_paise').notNull(),
  balancePaise: integer('balance_paise').notNull(),
}, (t) => [index('ledger_studio_idx').on(t.studioId, t.at)])

export const prices = sqliteTable('prices', {
  studioId: text('studio_id').notNull(),
  id: text('id').notNull(),
  label: text('label').notNull(),
  detail: text('detail').notNull(),
  pricePaise: integer('price_paise').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.studioId, t.id] })])

// ── Tools ───────────────────────────────────────────────────────────────────
export const cameras = sqliteTable('cameras', {
  id: text('id').primaryKey(),
  studioId: text('studio_id').notNull(),
  label: text('label').notNull(),
  eventId: text('event_id').notNull(),
  albumId: text('album_id').notNull(),
  mode: text('mode', { enum: ['live-2k', 'review-first', 'originals'] }).notNull(),
  ftpUser: text('ftp_user').notNull(),
  status: text('status', { enum: ['receiving', 'idle', 'offline'] }).notNull().default('offline'),
  today: integer('today').notNull().default(0),
  lastFile: text('last_file'),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('cameras_studio_idx').on(t.studioId), uniqueIndex('cameras_ftp_uq').on(t.ftpUser)])

export const smartQrs = sqliteTable('smart_qrs', {
  id: text('id').primaryKey(),
  studioId: text('studio_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  eventId: text('event_id').notNull(),
  target: text('target', { enum: ['web', 'app', 'smart'] }).notNull().default('web'),
  scans: integer('scans').notNull().default(0),
  color: text('color').notNull().default('#1B1712'),
  createdAt: ts('created_at').notNull(),
}, (t) => [uniqueIndex('qrs_slug_uq').on(t.studioId, t.slug)])

export const broadcasts = sqliteTable('broadcasts', {
  id: text('id').primaryKey(),
  studioId: text('studio_id').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  audience: text('audience').notNull(),
  sentAt: ts('sent_at'),
  scheduledAt: ts('scheduled_at'),
  openRate: real('open_rate'),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('broadcasts_studio_idx').on(t.studioId, t.createdAt)])

export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey(),
  studioId: text('studio_id').notNull(),
  subject: text('subject').notNull(),
  eventId: text('event_id'),
  platform: text('platform', { enum: ['web-gallery', 'app', 'admin', 'desktop'] }).notNull(),
  status: text('status', { enum: ['open', 'answered', 'waiting', 'closed'] }).notNull().default('open'),
  createdBy: text('created_by'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
}, (t) => [index('tickets_studio_idx').on(t.studioId, t.updatedAt)])

export const ticketMessages = sqliteTable('ticket_messages', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  from: text('sender', { enum: ['me', 'support'] }).notNull(),
  body: text('body').notNull(),
  at: ts('at').notNull(),
}, (t) => [index('ticket_messages_idx').on(t.ticketId, t.at)])

export const watermarks = sqliteTable('watermarks', {
  studioId: text('studio_id').primaryKey(),
  settings: json<WatermarkSettings>('settings').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const websites = sqliteTable('websites', {
  studioId: text('studio_id').primaryKey(),
  published: bool('published').notNull().default(false),
  template: text('template', { enum: ['classic', 'editorial', 'minimal', 'bold', 'showcase', 'portfolio'] }).notNull().default('editorial'),
  headline: text('headline').notNull().default(''),
  sections: json<WebsiteSection[]>('sections').notNull(),
  customDomain: text('custom_domain'),
  updatedAt: ts('updated_at').notNull(),
})

export const enquiries = sqliteTable('enquiries', {
  id: text('id').primaryKey(),
  studioId: text('studio_id').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  message: text('message').notNull(),
  source: text('source').notNull(),
  note: text('note'),
  at: ts('at').notNull(),
}, (t) => [index('enquiries_studio_idx').on(t.studioId, t.at)])

// ── Platform ────────────────────────────────────────────────────────────────
export const idempotencyKeys = sqliteTable('idempotency_keys', {
  /** `${userOrIp}:${method}:${path}:${key}` */
  scopeKey: text('scope_key').primaryKey(),
  requestHash: text('request_hash').notNull(),
  state: text('state', { enum: ['in_progress', 'done'] }).notNull(),
  statusCode: integer('status_code'),
  responseBody: text('response_body'),
  responseType: text('response_type'),
  createdAt: ts('created_at').notNull(),
  expiresAt: ts('expires_at').notNull(),
}, (t) => [index('idem_expires_idx').on(t.expiresAt)])

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  studioId: text('studio_id'),
  userId: text('user_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  meta: json<Record<string, unknown>>('meta'),
  ip: text('ip'),
  requestId: text('request_id'),
  at: ts('at').notNull(),
}, (t) => [index('audit_studio_idx').on(t.studioId, t.at)])
