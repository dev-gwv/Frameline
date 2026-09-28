import type {
  AssetFile, PackPurchase,
  ChangeTopic, FramelineApi, GuestLinkResult, ListPhotosQuery, PlanChange, RenewalLink, RenewalResult, ResolvedGuestLink, UploadFile, UploadOptions,
} from './api'
import type {
  AbandonedCart, Asset, DownloadAllowance, DownloadEvent, PublicEventSummary, PublicStudio, PublicWatermark,
  Album, Broadcast, Camera, CameraUpload, Enquiry, EventSettings, Guest, GuestSession, LedgerEntry, NotificationPrefs, Order, Photo, PhotoEvent,
  Price, PublicEvent, Purchase, SmartQR, StoreSettings, Studio, StudioProfile, TeamMember, Ticket, Usage, UsageBreakdown, UsageReport,
  WatermarkSettings, Website, ZipRequest, WalletBalance, NeedsYouItem,
  AccessRequest, EventStats, HandleCheck, NotifyRequest, PayoutCheck, StudioStats,
} from './types'
import type { SeedState } from './seed'

/**
 * HTTP implementation of `FramelineApi` against apps/api (`/v1`).
 *
 *   const api = createHttpApi({ baseUrl: import.meta.env.VITE_API_URL, tokens: localStorageTokenStore() })
 *
 * - problem+json errors become `ApiError` (status, code, detail, requestId, fieldErrors)
 * - 401 → one single-flight refresh (`/v1/auth/refresh`) → retry once; failing that, tokens are cleared and `onUnauthorized` fires
 * - network errors / 502 / 503 / 504 are retried with exponential backoff + jitter for safe or idempotent requests
 * - 429 waits for `Retry-After` (up to `maxRetryAfterSeconds`) and retries
 * - creates, uploads and payments send an `Idempotency-Key` (reused across retries)
 * - `subscribe()` keeps one WebSocket to `/v1/realtime` with auto-reconnect
 */

// ── Tokens ───────────────────────────────────────────────────────────────────
export interface AuthTokens {
  accessToken: string
  refreshToken: string
  /** Epoch ms when the access token expires (used to refresh proactively). */
  expiresAt?: number
}

/** Where tokens live: localStorage on web, SecureStore on mobile. Methods may be sync or async. */
export interface TokenStore {
  get(): AuthTokens | null | Promise<AuthTokens | null>
  set(tokens: AuthTokens): void | Promise<void>
  clear(): void | Promise<void>
}

export function memoryTokenStore(initial: AuthTokens | null = null): TokenStore {
  let t = initial
  return { get: () => t, set: (v) => { t = v }, clear: () => { t = null } }
}

/** Web helper. Pass any Storage-like object (defaults to globalThis.localStorage). */
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function storageTokenStore(key = 'frameline.tokens', storage?: StorageLike): TokenStore {
  const s = (): StorageLike | undefined => storage ?? (globalThis as unknown as { localStorage?: StorageLike }).localStorage
  return {
    get: () => { try { const raw = s()?.getItem(key); return raw ? (JSON.parse(raw) as AuthTokens) : null } catch { return null } },
    set: (v) => { try { s()?.setItem(key, JSON.stringify(v)) } catch { /* storage unavailable */ } },
    clear: () => { try { s()?.removeItem(key) } catch { /* storage unavailable */ } },
  }
}

// ── Errors ───────────────────────────────────────────────────────────────────
export interface ApiFieldError { field: string; in: 'body' | 'query' | 'path' | 'header' | 'cookie'; message: string; code: string }

export interface ProblemDocument {
  type?: string; title?: string; status?: number; detail?: string; code?: string; requestId?: string; errors?: ApiFieldError[]
  [ext: string]: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail: string
  readonly title: string
  readonly requestId?: string
  readonly fieldErrors: ApiFieldError[]
  readonly retryAfter?: number
  readonly problem: ProblemDocument

  constructor(init: { status: number; code: string; detail: string; title?: string; requestId?: string; fieldErrors?: ApiFieldError[]; retryAfter?: number; problem?: ProblemDocument }) {
    super(init.detail)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.detail = init.detail
    this.title = init.title ?? init.code
    this.requestId = init.requestId
    this.fieldErrors = init.fieldErrors ?? []
    this.retryAfter = init.retryAfter
    this.problem = init.problem ?? {}
  }

  /** Field-error message for a form field (e.g. `err.fieldError('name')`). */
  fieldError(field: string): string | undefined {
    return this.fieldErrors.find((e) => e.field === field)?.message
  }

  get isNetworkError() { return this.status === 0 }

  static async fromResponse(res: Response): Promise<ApiError> {
    const retryAfter = parseRetryAfter(res.headers.get('retry-after'))
    let problem: ProblemDocument = {}
    const text = await res.text().catch(() => '')
    try { problem = text ? (JSON.parse(text) as ProblemDocument) : {} } catch { problem = { detail: text.slice(0, 300) } }
    return new ApiError({
      status: res.status,
      code: problem.code ?? `http_${res.status}`,
      title: problem.title ?? res.statusText,
      detail: problem.detail ?? (res.statusText || `Request failed with ${res.status}`),
      requestId: problem.requestId ?? res.headers.get('x-request-id') ?? undefined,
      fieldErrors: Array.isArray(problem.errors) ? problem.errors : [],
      retryAfter,
      problem,
    })
  }
}

function parseRetryAfter(v: string | null): number | undefined {
  if (!v) return undefined
  const n = Number(v)
  if (Number.isFinite(n)) return Math.max(0, n)
  const at = Date.parse(v)
  return Number.isNaN(at) ? undefined : Math.max(0, (at - Date.now()) / 1000)
}

// ── Options ──────────────────────────────────────────────────────────────────
/** Upload input: the contract's UploadFile plus the bytes (web `Blob`/`File`, or a React Native file `uri`). */
export type HttpUploadFile = UploadFile & { blob?: Blob; uri?: string; contentType?: string; capturedAt?: string }

export interface UploadProgress { photoId: string; filename: string; loaded: number; total: number }

/** The subset of WebSocket used here (same shape in browsers, React Native and Workers). */
export interface SocketLike {
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (ev: { data?: unknown }) => void): void
}
type WebSocketCtor = new (url: string, protocols?: string | string[]) => SocketLike

export interface HttpApiOptions {
  baseUrl: string
  tokens: TokenStore
  /** Called once refresh fails (session over): send the user to sign-in. */
  onUnauthorized?: () => void
  /** Studio to act on (X-Studio-Id). Defaults to the user's first studio. */
  studioId?: string | (() => string | undefined)
  fetch?: typeof fetch
  WebSocket?: WebSocketCtor
  /** Retries for network errors / 502-504 on safe or idempotent requests (default 3). */
  maxRetries?: number
  /** Longest Retry-After the client will wait automatically on 429 (default 20s). */
  maxRetryAfterSeconds?: number
  onUploadProgress?: (p: UploadProgress) => void
  /** Files uploaded in parallel (default 3). */
  uploadConcurrency?: number
  /** Where guest (gallery) session tokens are kept, per event short id. Defaults to memory. */
  guestTokens?: GuestTokenStore
  /**
   * Stable per-install id sent as `X-Guest-Device` on guest calls, so follows and "my galleries"
   * survive across events (e.g. a UUID kept in localStorage / SecureStore).
   */
  guestDeviceId?: string | (() => string | undefined)
}

/** Guest sessions per gallery (key = upper-case event short id). Sync so it can wrap localStorage / MMKV. */
export interface GuestTokenStore {
  get(shortId: string): string | null
  set(shortId: string, token: string): void
  clear(shortId: string): void
}

export function memoryGuestTokenStore(): GuestTokenStore {
  const m = new Map<string, string>()
  return { get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v) }, clear: (k) => { m.delete(k) } }
}

/** Web helper: guest tokens in localStorage under `${prefix}.${SHORTID}`. */
export function storageGuestTokenStore(prefix = 'frameline.guest', storage?: StorageLike): GuestTokenStore {
  const s = (): StorageLike | undefined => storage ?? (globalThis as unknown as { localStorage?: StorageLike }).localStorage
  return {
    get: (k) => { try { return s()?.getItem(`${prefix}.${k}`) ?? null } catch { return null } },
    set: (k, v) => { try { s()?.setItem(`${prefix}.${k}`, v) } catch { /* storage unavailable */ } },
    clear: (k) => { try { s()?.removeItem(`${prefix}.${k}`) } catch { /* storage unavailable */ } },
  }
}

export interface SessionResponse extends AuthTokensResponse {
  user: { id: string; email: string; name: string; hasPassword: boolean }
  isNewUser: boolean
}
interface AuthTokensResponse { tokenType: 'Bearer'; accessToken: string; expiresIn: number; refreshToken: string; refreshExpiresIn: number }

export interface MeResponse {
  user: { id: string; email: string; name: string; hasPassword: boolean }
  memberships: { studioId: string; studioName: string; role: TeamMember['role']; eventIds: string[] }[]
}

export interface FramelineHttpApi extends FramelineApi {
  auth: {
    requestOtp(email: string): Promise<{ sent: true; expiresIn: number; resendAfter: number; devCode?: string }>
    verifyOtp(email: string, code: string, extra?: { name?: string; studioName?: string }): Promise<SessionResponse>
    loginWithPassword(email: string, password: string): Promise<SessionResponse>
    setPassword(newPassword: string, currentPassword?: string): Promise<void>
    /** Forgot password: request a code with requestOtp(email), then set a new password with it (signs in). */
    resetPassword(email: string, code: string, newPassword: string): Promise<SessionResponse>
    /** Stores tokens from the Google redirect fragment (`#access_token=…&refresh_token=…&expires_in=…`). */
    acceptOAuthFragment(fragment: string): Promise<boolean>
    googleStartUrl(redirectPath?: string): string
    logout(opts?: { allDevices?: boolean }): Promise<void>
    me(): Promise<MeResponse>
    isSignedIn(): Promise<boolean>
  }
  /** Low-level escape hatch for endpoints not in `FramelineApi`. */
  request<T>(method: HttpMethod, path: string, opts?: RequestOptions): Promise<T>
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
interface RequestOptions {
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  /** Send Idempotency-Key (a fresh one is generated and reused across retries when `true`). */
  idempotent?: boolean | string
  /** Attach the bearer token and refresh on 401 (default true). */
  auth?: boolean
  /** Guest call for this gallery short id: sends its guest token instead of the studio session. */
  guest?: string
  /** Raw (non-JSON) body, e.g. a file for uploadAsset. */
  raw?: { body: Blob; contentType: string }
}

interface Page<T> { items: T[]; nextCursor: string | null }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const backoff = (attempt: number) => Math.min(8000, 300 * 2 ** attempt) * (0.5 + Math.random())
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`)
const pick = <T extends object, K extends keyof T>(o: T, keys: readonly K[]): Pick<T, K> => {
  const out = {} as Pick<T, K>
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k]
  return out
}
const chunks = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
const enc = encodeURIComponent
/** JSON.parse reviver: turns API-relative media paths into absolute URLs. */
let MEDIA_ORIGIN = ''
const absolutizeMedia = (_key: string, value: unknown) =>
  typeof value === 'string' && value.startsWith('/v1/media/') && MEDIA_ORIGIN ? MEDIA_ORIGIN + value : value
const LOCAL_URL = /^(blob|file|content|ph|assets-library|data):/i

const STUDIO_KEYS = ['name', 'handle', 'logoUrl', 'brandColor', 'phone', 'email', 'website', 'instagram', 'city', 'about'] as const
const EVENT_KEYS = ['shortId', 'name', 'type', 'date', 'endDate', 'city', 'status', 'photoLimit', 'expiresAt', 'coverTones', 'hosts', 'highlights', 'plan'] as const
const QR_KEYS = ['name', 'slug', 'eventId', 'target', 'color', 'scheduledEventId', 'scheduledAt', 'dotStyle', 'logoUrl'] as const
const STUDIO_PROFILE_KEYS = ['coverUrl', 'studioType', 'referralSource', 'services', 'testimonials', 'faq', 'socialLinks', 'portfolioLinks', 'app', 'billing'] as const
const WATERMARK_KEYS = ['mode', 'text', 'subtitle', 'position', 'size', 'opacity', 'font', 'applyTo', 'logoUrl', 'edgeOffset'] as const
const WEBSITE_KEYS = ['published', 'template', 'headline', 'sections', 'customDomain'] as const

export function createHttpApi(options: HttpApiOptions): FramelineHttpApi {
  MEDIA_ORIGIN = options.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
  const base = options.baseUrl.replace(/\/+$/, '')
  const fetchImpl: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const maxRetries = options.maxRetries ?? 3
  const maxRetryAfter = options.maxRetryAfterSeconds ?? 20
  const tokens = options.tokens
  const studioId = () => (typeof options.studioId === 'function' ? options.studioId() : options.studioId)
  const guestTokens = options.guestTokens ?? memoryGuestTokenStore()
  const deviceId = () => (typeof options.guestDeviceId === 'function' ? options.guestDeviceId() : options.guestDeviceId)
  /** Last gallery a guest call went to (for calls that only carry a photo id). */
  let lastGallery: string | undefined
  const rememberSession = (session: GuestSession) => {
    const k = session.shortId.toUpperCase()
    guestTokens.set(k, session.token)
    lastGallery = k
  }
  const g = (shortId: string) => { lastGallery = shortId.toUpperCase(); return lastGallery }

  // ── Session handling ──────────────────────────────────────────────────────
  let refreshing: Promise<boolean> | null = null

  async function saveTokens(t: AuthTokensResponse) {
    await tokens.set({ accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: Date.now() + t.expiresIn * 1000 })
  }

  /** Single-flight refresh: concurrent 401s share one /auth/refresh call (reuse would revoke the session). */
  function refreshOnce(): Promise<boolean> {
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const current = await tokens.get()
          if (!current?.refreshToken) return false
          const res = await fetchImpl(`${base}/v1/auth/refresh`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ refreshToken: current.refreshToken }),
          })
          if (res.ok) { await saveTokens((await res.json()) as AuthTokensResponse); return true }
          if (res.status === 401 || res.status === 403) await tokens.clear()
          return false
        } catch {
          return false
        } finally {
          refreshing = null
        }
      })()
    }
    return refreshing
  }

  async function accessToken(): Promise<string | null> {
    let t = await tokens.get()
    if (t?.expiresAt && t.refreshToken && t.expiresAt - Date.now() < 30_000) {
      await refreshOnce()
      t = await tokens.get()
    }
    return t?.accessToken ?? null
  }

  function url(path: string, query?: RequestOptions['query']) {
    const u = `${base}${path}`
    if (!query) return u
    const qs = Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${enc(k)}=${enc(String(v))}`).join('&')
    return qs ? `${u}?${qs}` : u
  }

  async function request<T>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
    const guestKey = opts.guest !== undefined ? opts.guest.toUpperCase() : undefined
    const auth = guestKey !== undefined ? false : (opts.auth ?? true)
    const idemKey = opts.idempotent === true ? uuid() : typeof opts.idempotent === 'string' ? opts.idempotent : undefined
    const retryable = method === 'GET' || method === 'PUT' || method === 'DELETE' || !!idemKey
    let attempt = 0
    let refreshed = false
    for (;;) {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (opts.raw) headers['Content-Type'] = opts.raw.contentType
      else if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
      const device = deviceId()
      if (device && (guestKey !== undefined || path.startsWith('/v1/public/'))) headers['X-Guest-Device'] = device
      if (idemKey) headers['Idempotency-Key'] = idemKey
      const sid = studioId()
      if (sid) headers['X-Studio-Id'] = sid
      if (auth) {
        const at = await accessToken()
        if (at) headers.Authorization = `Bearer ${at}`
      } else if (guestKey) {
        const gt = guestTokens.get(guestKey)
        if (gt) headers.Authorization = `Bearer ${gt}`
      }
      let res: Response
      try {
        res = await fetchImpl(url(path, opts.query), { method, headers, body: opts.raw ? opts.raw.body : opts.body !== undefined ? JSON.stringify(opts.body) : undefined })
      } catch (err) {
        if (retryable && attempt < maxRetries) { await sleep(backoff(attempt++)); continue }
        throw new ApiError({ status: 0, code: 'network_error', detail: 'Could not reach Frameline. Check your connection and try again.', problem: { detail: String(err) } })
      }
      if (res.status === 401 && auth && !refreshed) {
        refreshed = true
        if (await refreshOnce()) continue
        const e = await ApiError.fromResponse(res)
        await tokens.clear()
        options.onUnauthorized?.()
        throw e
      }
      if (res.status === 429 && attempt < maxRetries) {
        const wait = parseRetryAfter(res.headers.get('retry-after')) ?? 1
        if (wait <= maxRetryAfter) { await sleep(wait * 1000 + Math.random() * 250); attempt++; continue }
      }
      if ((res.status === 502 || res.status === 503 || res.status === 504) && retryable && attempt < maxRetries) {
        const ra = parseRetryAfter(res.headers.get('retry-after'))
        await sleep(Math.max(backoff(attempt++), (ra ?? 0) * 1000))
        continue
      }
      if (!res.ok) {
        const err = await ApiError.fromResponse(res)
        if (guestKey && (err.code === 'guest_token_expired' || err.code === 'invalid_guest_token')) guestTokens.clear(guestKey)
        throw err
      }
      if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
      const text = await res.text()
      // Media paths come back relative to the API ("/v1/media/…"); make them absolute so
      // <img src> works from any origin (admin, gallery, mobile).
      return (text ? JSON.parse(text, absolutizeMedia) : undefined) as T
    }
  }

  const get = <T,>(path: string, query?: RequestOptions['query']) => request<T>('GET', path, { query })

  /** Follows `nextCursor` until the last page. */
  async function listAll<T>(path: string, query: RequestOptions['query'] = {}): Promise<T[]> {
    const out: T[] = []
    let cursor: string | undefined
    for (let guard = 0; guard < 1000; guard++) {
      const page = await get<Page<T>>(path, { ...query, limit: 200, cursor })
      out.push(...page.items)
      if (!page.nextCursor) break
      cursor = page.nextCursor
    }
    return out
  }

  // ── Uploads ───────────────────────────────────────────────────────────────
  /** Bytes for a file: `blob`, a React Native `uri`, or a local `url` (blob:/file:/content:/data: as the apps pass today). */
  async function fileBytes(f: HttpUploadFile): Promise<Blob | null> {
    if (f.blob) return f.blob
    const local = f.uri ?? (f.url && LOCAL_URL.test(f.url) ? f.url : undefined)
    if (!local) return null
    try {
      return await (await fetchImpl(local)).blob()
    } catch {
      throw new ApiError({ status: 0, code: 'file_unreadable', detail: `Could not read ${f.filename}. It may have been moved or deleted.` })
    }
  }

  async function putPart(partUrl: string, body: Blob): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetchImpl(partUrl, { method: 'PUT', body })
        if (res.ok) {
          const etag = res.headers.get('etag') ?? ((await res.json().catch(() => null)) as { etag?: string } | null)?.etag
          if (!etag) throw new ApiError({ status: res.status, code: 'missing_etag', detail: 'Storage did not return an ETag (check the bucket CORS ExposeHeaders).' })
          return etag
        }
        if (res.status < 500 || attempt >= maxRetries) throw await ApiError.fromResponse(res)
      } catch (e) {
        if (e instanceof ApiError && e.status > 0 && e.status < 500) throw e
        if (attempt >= maxRetries) throw e instanceof ApiError ? e : new ApiError({ status: 0, code: 'network_error', detail: 'Upload interrupted. Check your connection and try again.' })
      }
      await sleep(backoff(attempt))
    }
  }

  interface UploadSession {
    uploadId: string; mode: 's3' | 'proxy'; partSize: number
    files: { photoId: string; filename: string; key: string | null; parts: { partNumber: number; url: string }[] }[]
  }

  interface UploadTarget { start: string; complete: (uploadId: string) => string; guest?: string }

  async function uploadBatch(eventId: string, albumId: string, files: HttpUploadFile[], opts: UploadOptions, target?: UploadTarget): Promise<Photo[]> {
    const quality = opts.quality
    const t: UploadTarget = target ?? { start: `/v1/events/${enc(eventId)}/uploads`, complete: (id) => `/v1/events/${enc(eventId)}/uploads/${enc(id)}/complete` }
    const blobs = await Promise.all(files.map(fileBytes))
    const session = await request<UploadSession>('POST', t.start, {
      idempotent: true, guest: t.guest,
      body: {
        albumId, quality, source: opts.source, uploadedBy: opts.uploadedBy, watermark: opts.watermark, fast: opts.fast,
        files: files.map((f, i) => ({
          filename: f.filename, size: blobs[i]?.size ?? f.size, contentType: f.contentType ?? (blobs[i]?.type || 'image/jpeg'),
          width: f.width, height: f.height, capturedAt: f.capturedAt,
          ...(blobs[i] ? {} : f.url && /^https?:/i.test(f.url) ? { url: f.url } : { external: true }),
        })),
      },
    })
    const results: { photoId: string; parts: { partNumber: number; etag: string }[] }[] = []
    const queue = session.files.map((sf, i) => ({ sf, blob: blobs[i] }))
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const { sf, blob } = item
        const parts: { partNumber: number; etag: string }[] = []
        if (blob && sf.parts.length) {
          let loaded = 0
          for (const p of sf.parts) {
            const slice = blob.slice((p.partNumber - 1) * session.partSize, p.partNumber * session.partSize)
            parts.push({ partNumber: p.partNumber, etag: await putPart(p.url, slice) })
            loaded += slice.size
            options.onUploadProgress?.({ photoId: sf.photoId, filename: sf.filename, loaded, total: blob.size })
          }
        }
        results.push({ photoId: sf.photoId, parts })
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, options.uploadConcurrency ?? 3) }, worker))
    const order = new Map(session.files.map((f, i) => [f.photoId, i]))
    results.sort((a, b) => order.get(a.photoId)! - order.get(b.photoId)!)
    const done = await request<{ items: Photo[] }>('POST', t.complete(session.uploadId), {
      idempotent: true, guest: t.guest, body: { files: results },
    })
    return done.items
  }

  // ── Realtime ──────────────────────────────────────────────────────────────
  const listeners = new Set<(t: ChangeTopic) => void>()
  let socket: SocketLike | null = null
  const detached = new WeakSet<SocketLike>()
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let reconnectAttempt = 0
  let hadConnection = false
  const ALL_TOPICS: ChangeTopic[] = ['events', 'albums', 'photos', 'studio', 'usage', 'guests', 'activity', 'misc']
  const WS: WebSocketCtor | undefined = options.WebSocket ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket

  function notify(topic: ChangeTopic) {
    for (const l of [...listeners]) { try { l(topic) } catch { /* listener errors must not break the stream */ } }
  }

  function scheduleReconnect() {
    if (!listeners.size || reconnectTimer) return
    const delay = Math.min(30_000, 1000 * 2 ** reconnectAttempt++) * (0.5 + Math.random())
    reconnectTimer = setTimeout(() => { reconnectTimer = null; void connect() }, delay)
  }

  async function connect() {
    if (!WS || socket || !listeners.size) return
    const token = await accessToken()
    if (!token) { scheduleReconnect(); return }
    const wsUrl = url('/v1/realtime', { studio: studioId() }).replace(/^http/, 'ws')
    let ws: SocketLike
    try { ws = new WS(wsUrl, ['frameline', `bearer.${token}`]) } catch { scheduleReconnect(); return }
    socket = ws
    ws.addEventListener('open', () => {
      reconnectAttempt = 0
      // After a reconnect we may have missed changes: ask every screen to refetch.
      if (hadConnection) ALL_TOPICS.forEach(notify)
      hadConnection = true
      pingTimer = setInterval(() => { try { ws.send('ping') } catch { /* closing */ } }, 25_000)
    })
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string' || ev.data === 'pong') return
      try {
        const msg = JSON.parse(ev.data) as { topic?: ChangeTopic }
        if (msg.topic) notify(msg.topic)
      } catch { /* ignore malformed frames */ }
    })
    ws.addEventListener('close', () => {
      if (detached.has(ws)) return
      if (pingTimer) clearInterval(pingTimer)
      pingTimer = null
      if (socket === ws) socket = null
      // A close before any successful open is usually an expired token: refresh first to avoid a tight loop.
      if (!hadConnection || reconnectAttempt > 0) void refreshOnce().finally(scheduleReconnect)
      else scheduleReconnect()
    })
    ws.addEventListener('error', () => { try { ws.close() } catch { /* already closed */ } })
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = null
    const ws = socket
    socket = null
    hadConnection = false
    if (ws) { detached.add(ws); try { ws.close(1000, 'unsubscribed') } catch { /* already closed */ } }
  }

  // ── The contract ──────────────────────────────────────────────────────────
  const api: FramelineHttpApi = {
    request,

    subscribe(fn) {
      listeners.add(fn)
      void connect()
      return () => {
        listeners.delete(fn)
        if (!listeners.size) disconnect()
      }
    },

    getStudio: () => get<Studio>('/v1/studio'),
    updateStudio: (patch) => request<Studio>('PATCH', '/v1/studio', { body: { ...pick(patch, STUDIO_KEYS), ...pick(patch, STUDIO_PROFILE_KEYS) } }),
    getUsage: () => get<SeedState['usage']>('/v1/studio/usage'),

    listEvents: () => listAll<PhotoEvent>('/v1/events'),
    getEvent: (id) => get<PhotoEvent>(`/v1/events/${enc(id)}`),
    createEvent: (input) => request<PhotoEvent>('POST', '/v1/events', { body: input, idempotent: true }),
    updateEvent: (id, patch) => request<PhotoEvent>('PATCH', `/v1/events/${enc(id)}`, { body: pick(patch, EVENT_KEYS) }),
    updateEventSettings: (id, patch: Partial<EventSettings>) => request<PhotoEvent>('PATCH', `/v1/events/${enc(id)}/settings`, { body: patch }),
    resetPin: async (id) => (await request<{ pin: string }>('POST', `/v1/events/${enc(id)}/pin/reset`, { idempotent: true })).pin,
    deleteEvent: (id, o = {}) => request<void>('DELETE', `/v1/events/${enc(id)}`, { query: o.permanent ? { permanent: 'true' } : undefined }),

    listAlbums: (eventId) => listAll<Album>(`/v1/events/${enc(eventId)}/albums`),
    createAlbum: (eventId, name) => request<Album>('POST', `/v1/events/${enc(eventId)}/albums`, { body: { name }, idempotent: true }),
    renameAlbum: (id, name) => request<Album>('PATCH', `/v1/albums/${enc(id)}`, { body: { name } }),
    deleteAlbum: (id) => request<void>('DELETE', `/v1/albums/${enc(id)}`),
    reorderAlbums: (eventId, ids) => request<void>('PUT', `/v1/events/${enc(eventId)}/albums/order`, { body: { ids } }),

    async listPhotos(eventId, q: ListPhotosQuery = {}) {
      const want = q.limit
      const items: Photo[] = []
      let total = 0
      let cursor: string | undefined
      for (let guard = 0; guard < 10_000; guard++) {
        const pageSize = Math.min(200, want !== undefined ? Math.max(1, want - items.length) : 200)
        const page = await get<Page<Photo> & { total: number }>(`/v1/events/${enc(eventId)}/photos`, {
          albumId: q.albumId, sort: q.sort, filter: q.filter, personId: q.personId, limit: pageSize,
          ...(cursor ? { cursor } : { offset: q.offset }),
        })
        total = page.total
        items.push(...page.items)
        if (!page.nextCursor || (want !== undefined && items.length >= want)) break
        cursor = page.nextCursor
      }
      return { total, items }
    },
    getPhoto: (id) => get<Photo>(`/v1/photos/${enc(id)}`),
    async updatePhotos(ids, patch) {
      for (const part of chunks(ids, 500)) await request('PATCH', '/v1/photos', { body: { ids: part, patch } })
    },
    async deletePhotos(ids) {
      for (const part of chunks(ids, 500)) await request('POST', '/v1/photos/bulk-delete', { body: { ids: part }, idempotent: true })
    },
    setCover: (eventId, photoId, scope) => request<void>('PUT', `/v1/events/${enc(eventId)}/cover`, { body: { photoId, scope } }),
    async uploadPhotos(eventId, albumId, files, opts) {
      const skip = new Set(opts.skipIds ?? [])
      const list = (files as HttpUploadFile[]).filter((f) => !skip.has(f.filename))
      const created: Photo[] = []
      for (const batch of chunks(list, 100)) created.push(...await uploadBatch(eventId, albumId, batch, opts))
      return created
    },

    listPeople: (eventId) => listAll<SeedState['people'][number]>(`/v1/events/${enc(eventId)}/people`),
    listFilms: (eventId) => listAll(`/v1/events/${enc(eventId)}/films`),
    addFilm: (eventId, name, filmUrl) => request('POST', `/v1/events/${enc(eventId)}/films`, { body: { name, url: filmUrl }, idempotent: true }),
    deleteFilm: (id) => request<void>('DELETE', `/v1/films/${enc(id)}`),

    listGuests: (eventId) => listAll(`/v1/events/${enc(eventId)}/guests`),
    listAccessRequests: (eventId) => listAll(`/v1/events/${enc(eventId)}/access-requests`),
    resolveAccessRequest: (id, approve) => request<void>('POST', `/v1/access-requests/${enc(id)}/resolve`, { body: { approve } }),

    listActivity: () => listAll('/v1/activity'),
    listOrders: () => listAll('/v1/orders'),
    listLedger: () => listAll('/v1/ledger'),
    listPrices: () => listAll('/v1/prices'),

    listCameras: () => listAll<Camera>('/v1/cameras'),
    createCamera: (input) => request<Camera>('POST', '/v1/cameras', { body: input, idempotent: true }),
    listQRs: () => listAll<SmartQR>('/v1/qrs'),
    updateQR: (id, patch) => request<SmartQR>('PATCH', `/v1/qrs/${enc(id)}`, { body: pick(patch, QR_KEYS) }),
    createQR: (name, eventId) => request<SmartQR>('POST', '/v1/qrs', { body: { name, eventId }, idempotent: true }),
    listBroadcasts: () => listAll<Broadcast>('/v1/broadcasts'),
    sendBroadcast: (input) => request<Broadcast>('POST', '/v1/broadcasts', { body: pick(input, ['title', 'body', 'audience', 'scheduledAt', 'imageUrl'] as const), idempotent: true }),
    listTickets: () => listAll<Ticket>('/v1/tickets'),
    createTicket: (input) => request<Ticket>('POST', '/v1/tickets', { body: pick(input, ['subject', 'eventId', 'platform', 'body'] as const), idempotent: true }),
    replyTicket: (id, body) => request<Ticket>('POST', `/v1/tickets/${enc(id)}/messages`, { body: { body }, idempotent: true }),
    listTeam: async () => (await get<Page<TeamMember>>('/v1/team')).items,
    inviteMember: (email, role, eventIds) => request<TeamMember>('POST', '/v1/team/invites', { body: { email, role, eventIds }, idempotent: true }),
    getWatermark: () => get<WatermarkSettings>('/v1/watermark'),
    updateWatermark: (patch) => request<WatermarkSettings>('PATCH', '/v1/watermark', { body: pick(patch, WATERMARK_KEYS) }),
    getWebsite: () => get<Website>('/v1/website'),
    updateWebsite: (patch) => request<Website>('PATCH', '/v1/website', { body: pick(patch, WEBSITE_KEYS) }),
    listEnquiries: () => listAll('/v1/enquiries'),
    addCredits: async (amount) => (await request<{ walletCredits: number }>('POST', '/v1/studio/credits', { body: { amount }, idempotent: true })).walletCredits,

    // ── Studio: usage, billing ──────────────────────────────────────────────
    getUsageBreakdown: () => get<UsageBreakdown>('/v1/studio/usage/breakdown'),
    requestUsageReport: () => request<UsageReport>('POST', '/v1/studio/usage/report', { idempotent: true }),
    getUsageReport: async () => (await get<{ report: UsageReport | null }>('/v1/studio/usage/report')).report,
    updatePrices: async (prices) => (await request<{ items: Price[] }>('PUT', '/v1/prices', { body: { items: prices.map((p) => pick(p, ['id', 'label', 'detail', 'price'] as const)) } })).items,
    getStoreSettings: () => get<StoreSettings>('/v1/store/settings'),
    updateStoreSettings: (patch) => request<StoreSettings>('PATCH', '/v1/store/settings', { body: patch }),
    requestPayout: (amount) => request<LedgerEntry>('POST', '/v1/payouts', { body: { amount }, idempotent: true }),
    listPurchases: () => listAll<Purchase>('/v1/purchases'),
    changePlan: (planId, o) => request<PlanChange>('POST', '/v1/studio/plan', { body: { planId, billing: o.billing, payWith: o.payWith ?? 'card' }, idempotent: true }),
    setRenewalMultiplier: (multiplier) => request<Usage>('PUT', '/v1/studio/renewal-multiplier', { body: { multiplier } }),
    redeemCoupon: (code) => request<{ credits: number; walletCredits: number }>('POST', '/v1/studio/coupons', { body: { code }, idempotent: true }),
    spendCredits: (amount, description) => request<{ walletCredits: number; entry: LedgerEntry }>('POST', '/v1/studio/credits/spend', { body: { amount, description }, idempotent: true }),

    // ── Events: renewals, links ────────────────────────────────────────────
    renewEvent: (eventId, opts) => request<RenewalResult>('POST', `/v1/events/${enc(eventId)}/renew`, { body: { payWith: opts.payWith }, idempotent: true }),
    createRenewalLink: (eventId) => request<RenewalLink>('POST', `/v1/events/${enc(eventId)}/renewal-link`, { idempotent: true }),
    createGuestLink: (eventId, payload) => request<GuestLinkResult>('POST', `/v1/events/${enc(eventId)}/guest-links`, { body: payload, idempotent: true }),

    // ── Photos ─────────────────────────────────────────────────────────────
    listPhotoIds: async (eventId, q = {}) => (await get<{ ids: string[] }>(`/v1/events/${enc(eventId)}/photo-ids`, { albumId: q.albumId, sort: q.sort, filter: q.filter, personId: q.personId })).ids,
    async copyPhotosToAlbum(ids, albumId) {
      const out: Photo[] = []
      for (const part of chunks(ids, 500)) out.push(...(await request<{ items: Photo[] }>('POST', '/v1/photos/copy', { body: { ids: part, albumId }, idempotent: true })).items)
      return out
    },
    async setPhotoReview(ids, status) {
      for (const part of chunks(ids, 500)) await request('POST', '/v1/photos/review', { body: { ids: part, status } })
    },
    enhancePhoto: (photoId, opts) => request<Photo>('POST', `/v1/photos/${enc(photoId)}/enhance`, { body: opts, idempotent: true }),
    reindexFaces: (eventId) => request<{ queued: number }>('POST', `/v1/events/${enc(eventId)}/faces/reindex`, { idempotent: true }),
    requestZip: (eventId, email, opts = {}) => request<ZipRequest>('POST', `/v1/events/${enc(eventId)}/zips`, { body: { email, ...opts }, idempotent: true }),
    listZipRequests: (eventId) => listAll<ZipRequest>(`/v1/events/${enc(eventId)}/zips`),
    listDownloadEvents: (eventId) => listAll<DownloadEvent>(`/v1/events/${enc(eventId)}/downloads`),
    updateFilm: (id, patch) => request('PATCH', `/v1/films/${enc(id)}`, { body: pick(patch, ['name', 'url'] as const) }),

    // ── Tools ──────────────────────────────────────────────────────────────
    updateCamera: (id, patch) => request<Camera>('PATCH', `/v1/cameras/${enc(id)}`, { body: pick(patch, ['label', 'eventId', 'albumId', 'mode'] as const) }),
    deleteCamera: (id) => request<void>('DELETE', `/v1/cameras/${enc(id)}`),
    resetCameraPassword: (id) => request<Camera>('POST', `/v1/cameras/${enc(id)}/password`, { idempotent: true }),
    listCameraUploads: (cameraId) => listAll<CameraUpload>(`/v1/cameras/${enc(cameraId)}/uploads`),
    clearCameraUploads: (cameraId) => request<void>('DELETE', `/v1/cameras/${enc(cameraId)}/uploads`),
    deleteQR: (id) => request<void>('DELETE', `/v1/qrs/${enc(id)}`),
    cancelBroadcast: (id) => request<Broadcast>('POST', `/v1/broadcasts/${enc(id)}/cancel`, { idempotent: true }),
    deleteBroadcast: (id) => request<void>('DELETE', `/v1/broadcasts/${enc(id)}`),
    updateMember: (id, patch) => request<TeamMember>('PATCH', `/v1/team/${enc(id)}`, { body: patch }),
    removeMember: (id) => request<void>('DELETE', `/v1/team/${enc(id)}`),
    getNotificationPrefs: () => get<NotificationPrefs>('/v1/me/notifications'),
    updateNotificationPrefs: (patch) => request<NotificationPrefs>('PUT', '/v1/me/notifications', { body: patch }),
    updateEnquiry: (id, patch) => request<Enquiry>('PATCH', `/v1/enquiries/${enc(id)}`, { body: pick(patch, ['status', 'note'] as const) }),

    // ── Guest side ─────────────────────────────────────────────────────────
    getPublicEvent: (shortId) => request<PublicEvent>('GET', `/v1/public/events/${enc(shortId)}`, { guest: g(shortId) }),
    async verifyPin(shortId, pin) {
      const session = await request<GuestSession>('POST', `/v1/public/events/${enc(shortId)}/pin`, { body: { pin }, guest: g(shortId) })
      rememberSession(session)
      return session
    },
    async registerGuest(shortId, input) {
      const session = await request<GuestSession & { guest: Guest }>('POST', `/v1/public/events/${enc(shortId)}/register`, { body: input, guest: g(shortId) })
      rememberSession(session)
      return session
    },
    async listPublicPhotos(shortId, q = {}) {
      const key = g(shortId)
      const want = q.limit
      const items: Photo[] = []
      let total = 0
      let cursor: string | undefined
      for (let guard = 0; guard < 10_000; guard++) {
        const pageSize = Math.min(200, want !== undefined ? Math.max(1, want - items.length) : 200)
        const page = await request<Page<Photo> & { total: number }>('GET', `/v1/public/events/${enc(shortId)}/photos`, {
          guest: key,
          query: { albumId: q.albumId, personId: q.personId, sort: q.sort, highlights: q.highlights ? 'true' : undefined, limit: pageSize, ...(cursor ? { cursor } : { offset: q.offset }) },
        })
        total = page.total
        items.push(...page.items)
        if (!page.nextCursor || (want !== undefined && items.length >= want)) break
        cursor = page.nextCursor
      }
      return { total, items }
    },
    searchFaces: (shortId, selfie) => request('POST', `/v1/public/events/${enc(shortId)}/faces/search`, { body: selfie, guest: g(shortId) }),
    setFavourite: (photoId, on, shortId) => request<{ favourites: number }>('POST', `/v1/public/photos/${enc(photoId)}/favourite`, { body: { on }, guest: shortId ? g(shortId) : (lastGallery ?? '') }),
    createEnquiry: (target, input) => 'shortId' in target
      ? request<Enquiry>('POST', `/v1/public/events/${enc(target.shortId)}/enquiries`, { body: input, guest: g(target.shortId) })
      : request<Enquiry>('POST', `/v1/public/studios/${enc(target.studio)}/enquiries`, { body: input, auth: false }),
    createOrder: (shortId, input) => request<Order>('POST', `/v1/public/events/${enc(shortId)}/orders`, { body: input, guest: g(shortId), idempotent: true }),
    async recordDownload(photoIds, shortId) {
      for (const part of chunks(photoIds, 500)) await request<void>('POST', '/v1/public/downloads', { body: { photoIds: part }, guest: shortId ? g(shortId) : (lastGallery ?? '') })
    },
    getStudioProfile: (followCode) => request<StudioProfile>('GET', `/v1/public/studios/${enc(followCode)}`, { auth: false }),
    followStudio: (followCode) => request<{ followers: number }>('POST', `/v1/public/studios/${enc(followCode)}/follow`, { guest: lastGallery ?? '' }),
    async resolveGuestLink(code) {
      const r = await request<ResolvedGuestLink>('GET', `/v1/public/links/${enc(code)}`, { auth: false })
      if (r.session) rememberSession(r.session)
      return r
    },

    // ── Contract v3 ─────────────────────────────────────────────────────────
    listDeletedEvents: () => listAll<PhotoEvent>('/v1/trash/events'),
    restoreEvent: (id) => request<PhotoEvent>('POST', `/v1/events/${enc(id)}/restore`, { idempotent: true }),
    buyPack: (eventId, photos, opts) => request<PackPurchase>('POST', `/v1/events/${enc(eventId)}/packs`, { body: { photos, payWith: opts.payWith }, idempotent: true }),
    matchFaceForLink: (eventId, selfie) => request('POST', `/v1/events/${enc(eventId)}/faces/match`, { body: selfie }),
    async uploadAsset(kind, file: AssetFile) {
      const blob = file.blob ?? (file.uri ? await (await fetchImpl(file.uri)).blob() : null)
      if (!blob) throw new ApiError({ status: 0, code: 'file_unreadable', detail: `Could not read ${file.filename}.` })
      const contentType = file.contentType ?? (blob.type || 'application/octet-stream')
      return request<Asset>('POST', '/v1/assets', { query: { kind, filename: file.filename }, raw: { body: blob, contentType }, idempotent: true })
    },
    listCarts: () => listAll<AbandonedCart>('/v1/carts'),
    remindCarts: (orderIds) => request<{ reminded: number }>('POST', '/v1/carts/remind', { body: { orderIds }, idempotent: true }),

    listPublicPrices: async (shortId) => (await request<{ items: Price[] }>('GET', `/v1/public/events/${enc(shortId)}/prices`, { guest: g(shortId) })).items,
    getPublicWatermark: (shortId) => request<PublicWatermark>('GET', `/v1/public/events/${enc(shortId)}/watermark`, { guest: g(shortId) }),
    async uploadGuestPhotos(shortId, files, o = {}) {
      const key = g(shortId)
      const created: Photo[] = []
      for (const batch of chunks(files as HttpUploadFile[], 100)) {
        created.push(...await uploadBatch('', '', batch, { quality: 'web', source: 'guest', uploadedBy: o.uploadedBy }, {
          start: `/v1/public/events/${enc(shortId)}/uploads`,
          complete: (id) => `/v1/public/events/${enc(shortId)}/uploads/${enc(id)}/complete`,
          guest: key,
        }))
      }
      return created
    },
    requestPublicZip: (shortId, email, o = {}) => request<ZipRequest>('POST', `/v1/public/events/${enc(shortId)}/zips`, { body: { email, ...o }, guest: g(shortId), idempotent: true }),
    verifyDownloadPin: (shortId, pin) => request<DownloadAllowance>('POST', `/v1/public/events/${enc(shortId)}/download-pin`, { body: pin ? { pin } : {}, guest: g(shortId) }),
    listMyFavourites: async (shortId) => (await request<{ items: Photo[] }>('GET', `/v1/public/events/${enc(shortId)}/me/favourites`, { guest: g(shortId) })).items,
    listMyOrders: async (shortId) => (await request<{ items: Order[] }>('GET', `/v1/public/events/${enc(shortId)}/me/orders`, { guest: g(shortId) })).items,
    confirmOrder: (orderId, payment) => request<Order>('POST', `/v1/public/orders/${enc(orderId)}/confirm`, { body: payment, guest: lastGallery ?? '' }),
    requestAccess: (shortId, input) => request<{ received: true }>('POST', `/v1/public/events/${enc(shortId)}/access-requests`, { body: { note: '', ...input }, guest: g(shortId) }),
    unfollowStudio: (followCode) => request<{ followers: number }>('DELETE', `/v1/public/studios/${enc(followCode)}/follow`, { guest: lastGallery ?? '' }),
    listFollowedStudios: async () => (await request<{ items: PublicStudio[] }>('GET', '/v1/public/me/follows', { guest: lastGallery ?? '' })).items,
    listMyGalleries: async () => (await request<{ items: PublicEventSummary[] }>('GET', '/v1/public/me/galleries', { guest: lastGallery ?? '' })).items,
    async getPhotoDownloadUrl(photoId, o = {}) {
      const key = o.shortId ? g(o.shortId) : lastGallery
      const token = key ? guestTokens.get(key) : null
      const u = url(`/v1/public/photos/${enc(photoId)}/download`, { size: o.size ?? 2048, token: token ?? undefined })
      try {
        const res = await fetchImpl(u, { method: 'HEAD' })
        return res.ok ? u : null
      } catch {
        return null
      }
    },

    // ── Contract v4 (redesign) ───────────────────────────────────────────────
    getWallet: () => get<WalletBalance>('/v1/wallet'),
    listNeedsYou: async () => (await get<{ items: NeedsYouItem[] }>('/v1/needs-you')).items,
    refundOrder: (orderId, reason) => request<Order>('POST', `/v1/orders/${enc(orderId)}/refund`, { body: { reason }, idempotent: true }),

    // ── Contract v5 ─────────────────────────────────────────────────────────
    async restorePhotos(ids) {
      let restored = 0
      for (const part of chunks(ids, 500)) restored += (await request<{ restored: number }>('POST', '/v1/photos/restore', { body: { ids: part }, idempotent: true })).restored
      return { restored }
    },
    restoreAlbum: (id) => request<Album>('POST', `/v1/albums/${enc(id)}/restore`, { idempotent: true }),
    restoreQR: (id) => request<SmartQR>('POST', `/v1/qrs/${enc(id)}/restore`, { idempotent: true }),
    restoreBroadcast: (id) => request<Broadcast>('POST', `/v1/broadcasts/${enc(id)}/restore`, { idempotent: true }),
    async rotatePhotos(ids, degrees) {
      let updated = 0
      for (const part of chunks(ids, 500)) updated += (await request<{ updated: number }>('POST', '/v1/photos/rotate', { body: { ids: part, degrees }, idempotent: true })).updated
      return { updated }
    },
    removeGuest: (guestId) => request<void>('DELETE', `/v1/guests/${enc(guestId)}`),
    restoreGuest: (guestId) => request<Guest>('POST', `/v1/guests/${enc(guestId)}/restore`, { idempotent: true }),
    reopenAccessRequest: (id) => request<AccessRequest>('POST', `/v1/access-requests/${enc(id)}/reopen`, { idempotent: true }),
    getEventStats: (eventId) => get<EventStats>(`/v1/events/${enc(eventId)}/stats`),
    getStudioStats: (o = {}) => get<StudioStats>('/v1/studio/stats', { month: o.month }),
    updateOrder: (orderId, patch) => request<Order>('PATCH', `/v1/orders/${enc(orderId)}`, { body: pick(patch, ['trackingNumber'] as const) }),
    resendDownloadLink: (orderId) => request<{ sentTo: string; order: Order }>('POST', `/v1/orders/${enc(orderId)}/resend-link`, { idempotent: true }),
    verifyPayoutAccount: () => request<PayoutCheck>('POST', '/v1/store/payout/verify', { idempotent: true }),
    checkHandle: (handle) => get<HandleCheck>('/v1/studio/handle-check', { handle }),
    async recordPhotoViews(photoIds, shortId) {
      for (const part of chunks([...new Set(photoIds)], 500)) await request<void>('POST', '/v1/public/views', { body: { photoIds: part }, guest: shortId ? g(shortId) : (lastGallery ?? '') })
    },
    requestNotify: (shortId, phone) => request<NotifyRequest>('POST', `/v1/public/events/${enc(shortId)}/notify`, { body: { phone }, guest: g(shortId), idempotent: true }),
    cancelNotify: (shortId, phone) => request<void>('POST', `/v1/public/events/${enc(shortId)}/notify/cancel`, { body: { phone }, guest: g(shortId), idempotent: true }),



    auth: {
      requestOtp: (email) => request('POST', '/v1/auth/otp/request', { body: { email }, auth: false }),
      async verifyOtp(email, code, extra = {}) {
        const s = await request<SessionResponse>('POST', '/v1/auth/otp/verify', { body: { email, code, ...extra }, auth: false })
        await saveTokens(s)
        return s
      },
      async loginWithPassword(email, password) {
        const s = await request<SessionResponse>('POST', '/v1/auth/password/login', { body: { email, password }, auth: false })
        await saveTokens(s)
        return s
      },
      setPassword: (newPassword, currentPassword) => request<void>('POST', '/v1/auth/password', { body: { newPassword, currentPassword } }),
      async resetPassword(email, code, newPassword) {
        const s = await request<SessionResponse>('POST', '/v1/auth/password/reset', { body: { email, code, newPassword }, auth: false })
        await saveTokens(s)
        return s
      },
      async acceptOAuthFragment(fragment) {
        const p = new URLSearchParams(fragment.replace(/^#/, ''))
        const at = p.get('access_token')
        const rt = p.get('refresh_token')
        if (!at || !rt) return false
        await tokens.set({ accessToken: at, refreshToken: rt, expiresAt: Date.now() + Number(p.get('expires_in') ?? 900) * 1000 })
        return true
      },
      googleStartUrl: (redirectPath) => url('/v1/auth/google/start', { redirect: redirectPath }),
      async logout(opts = {}) {
        const t = await tokens.get()
        disconnect()
        try {
          await request<void>('POST', '/v1/auth/logout', { body: { refreshToken: t?.refreshToken, allDevices: opts.allDevices }, auth: false })
        } catch { /* signing out locally is what matters */ }
        await tokens.clear()
      },
      me: () => get<MeResponse>('/v1/me'),
      isSignedIn: async () => !!(await tokens.get())?.refreshToken,
    },
  }
  return api
}
