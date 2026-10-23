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
  /** Shared with Studio AutoPilot's server, which signs its sign-in links and gallery calls with it (32+ chars). */
  STUDIOAUTOPILOT_SECRET?: string
  /** Email over SMTP (Gmail / Workspace): the login and an App Password (secret). Used before RESEND_API_KEY. */
  SMTP_USER?: string
  SMTP_PASS?: string
  /** Defaults: smtp.gmail.com, 465 (implicit TLS). */
  SMTP_HOST?: string
  SMTP_PORT?: string
  /** A "Send mail as" alias the account owns, e.g. "Frameline <support@frameline.in>". */
  SMTP_FROM?: string
  /** The support assistant (services/support-ai.ts): an OpenAI-compatible chat API. Primary defaults to Groq, the
   *  fallback to NVIDIA NIM; base URL and model are optional. No key: every ticket is handed over to Book a call. */
  SUPPORT_AI_API_KEY?: string
  SUPPORT_AI_BASE_URL?: string
  SUPPORT_AI_MODEL?: string
  SUPPORT_AI_FALLBACK_API_KEY?: string
  SUPPORT_AI_FALLBACK_BASE_URL?: string
  SUPPORT_AI_FALLBACK_MODEL?: string
  /** Support's WhatsApp number, e.g. +91 98450 55012: the Help page shows a chat link only when it is set. */
  SUPPORT_WHATSAPP?: string
  /** Where Help's Book a call goes (the owner's booking page); the assistant's hand-over points there too. */
  SUPPORT_CALL_URL?: string
  /** `off` switches the AI features (face finding, selfie search) off everywhere; see lib/features.ts. */
  AI_FEATURES?: string
  /** Where gallery-changed notices go (Studio AutoPilot's /webhooks/frameline). Unset: no notices are queued. */
  STUDIOAUTOPILOT_WEBHOOK_URL?: string
  /** The company on studios' GST invoices. Name and GSTIN both unset: no invoices are offered (see GET /v1/meta). */
  SELLER_NAME?: string
  SELLER_GSTIN?: string
  SELLER_ADDRESS?: string
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
