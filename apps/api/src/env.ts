import type { Membership } from './services/access'

/** Worker bindings (see wrangler.jsonc) and secrets (see .dev.vars.example). */
export interface Env {
  // ── Bindings ────────────────────────────────────────────────────────────
  DB: D1Database
  MEDIA: R2Bucket
  KV: KVNamespace
  PHOTO_QUEUE: Queue<PhotoJob>
  EVENT_HUB: DurableObjectNamespace<import('./do/event-hub').EventHub>
  RATE_LIMITER: DurableObjectNamespace<import('./do/rate-limiter').RateLimiter>
  FACES?: VectorizeIndex
  /** Workers Rate Limiting bindings (optional; the Durable Object limiter is used when absent). */
  RL_GLOBAL?: RateLimit
  RL_PUBLIC?: RateLimit
  RL_WRITE?: RateLimit

  // ── Vars ────────────────────────────────────────────────────────────────
  ENVIRONMENT: 'development' | 'test' | 'staging' | 'production'
  API_VERSION: string
  BUILD_SHA: string
  CORS_ORIGINS: string
  APP_URL: string
  GALLERY_URL: string
  API_PUBLIC_URL?: string
  MAIL_FROM: string
  R2_BUCKET_NAME: string
  R2_ACCOUNT_ID?: string
  PUBLIC_MEDIA_BASE?: string
  PROCESSOR_URL?: string
  /** Set to "1" in dev when Vectorize runs as a remote binding (`wrangler dev --remote` or `remote: true`). */
  VECTORIZE_REMOTE?: string
  /** Set to "1" to disable the global per-IP limiter (e.g. load tests). */
  RATE_LIMIT_DISABLED?: string

  // ── Secrets ─────────────────────────────────────────────────────────────
  JWT_SECRET: string
  OTP_PEPPER: string
  RESEND_API_KEY?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /** Comma-separated absolute redirect URIs native apps may use for Google sign-in (default frameline://sign-in). */
  GOOGLE_NATIVE_REDIRECTS?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  PROCESSOR_TOKEN?: string
  RAZORPAY_KEY_ID?: string
  RAZORPAY_KEY_SECRET?: string
  RAZORPAY_WEBHOOK_SECRET?: string
}

export interface AuthUser { id: string; email: string; name: string; familyId?: string }

export interface GuestClaims { eventId: string; guestId?: string; studioId: string; /** May browse every photo (typed PIN / VIP). */ all?: boolean; /** PIN embedded in a VIP link. */ vp?: boolean }

/** Per-request context variables. */
export interface Variables {
  requestId: string
  startedAt: number
  user?: AuthUser
  membership?: Membership
  guest?: GuestClaims
}

export type AppEnv = { Bindings: Env; Variables: Variables }

/** Messages on the photo queue. */
export type PhotoJob = ProcessPhotoJob | BuildZipJob

export interface ProcessPhotoJob {
  kind: 'process-photo'
  photoId: string
  eventId: string
  studioId: string
  key: string | null
  quality: 'web' | 'original'
  /** AI enhance request (preset or prompt) for the processor. */
  enhance?: { preset?: string; prompt?: string }
  /** Face re-index only: keep renditions, redo detection/embeddings. */
  reindex?: boolean
  /** Burn the studio watermark into the rendition (guest uploads with watermarkGuestUploads). */
  watermark?: boolean
}

export interface BuildZipJob { kind: 'build-zip'; zipId: string; studioId: string }
