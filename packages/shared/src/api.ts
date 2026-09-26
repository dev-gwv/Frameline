import {
  BASE_RENEWAL, COUPONS, ENHANCE_COST, PERIOD_DAYS, PLANS, PRESETS, RENEWAL_CREDIT_DISCOUNT, STORE_COMMISSION,
  createSeed, defaultSettings, generatePhotos, hash, planPrice, tone, type SeedState,
} from './seed'
import type {
  Album, Broadcast, Camera, CameraUpload, Enquiry, EventSettings, EventType, Film, Guest, GuestSession, ID, LedgerEntry,
  NotificationPrefs, Order, OrderItemInput, PaymentMethod, Photo, PhotoEvent, Plan, PresetId, Price, PublicEvent, PublicStudio,
  Purchase, SmartQR, StoreSettings, StoreSettingsPatch, Studio, StudioProfile, TeamMember, Ticket, Usage, UsageBreakdown,
  UsageReport, WatermarkSettings, Website, ZipRequest,
} from './types'
import { cleanGuestLinkPayload, decodeGuestLink, encodeGuestToken, guestLinkKind, type GuestLinkKind, type GuestLinkPayload } from './links'
import { ApiError } from './http'

export type PhotoSort = 'capture' | 'name' | 'sequence'
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
export interface PlanChange { usage: Usage; charged: number; credit: number; purchase: Purchase | null }
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
}
export interface FaceSearchResult { personId: ID | null; photoIds: ID[] }

export interface EnquiryInput { name: string; phone: string; email: string; message: string; source?: string }
/** Where an enquiry goes: from an event gallery, or straight to a studio (handle or follow code). */
export type EnquiryTarget = { shortId: string } | { studio: string }

export interface OrderInput { items: OrderItemInput[]; method: PaymentMethod; buyer: { name: string; email: string; phone?: string } }

export type MemberPatch = { role?: TeamMember['role']; eventIds?: ID[] }
export type CameraPatch = Partial<Pick<Camera, 'label' | 'eventId' | 'albumId' | 'mode'>>
export type RegisterGuestInput = { name: string; email: string; phone?: string }

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
  deleteEvent(id: ID): Promise<void>
  renewEvent(eventId: ID, opts: { payWith: 'credits' | 'card' }): Promise<RenewalResult>
  createRenewalLink(eventId: ID): Promise<RenewalLink>
  createGuestLink(eventId: ID, payload: Omit<GuestLinkPayload, 'e'>): Promise<GuestLinkResult>

  // ── Albums & photos ───────────────────────────────────────────────────────
  listAlbums(eventId: ID): Promise<Album[]>
  createAlbum(eventId: ID, name: string): Promise<Album>
  renameAlbum(id: ID, name: string): Promise<Album>
  deleteAlbum(id: ID): Promise<void>
  reorderAlbums(eventId: ID, orderedIds: ID[]): Promise<void>

  listPhotos(eventId: ID, q?: ListPhotosQuery): Promise<{ total: number; items: Photo[] }>
  /** Every matching id (for select-all and the viewer's next/previous). */
  listPhotoIds(eventId: ID, q?: PhotoIdsQuery): Promise<ID[]>
  getPhoto(id: ID): Promise<Photo>
  updatePhotos(ids: ID[], patch: Partial<Pick<Photo, 'hidden' | 'albumId'>>): Promise<void>
  deletePhotos(ids: ID[]): Promise<void>
  copyPhotosToAlbum(ids: ID[], albumId: ID): Promise<Photo[]>
  setPhotoReview(ids: ID[], status: 'approved' | 'pending'): Promise<void>
  /** Stores coverPhotoId on the event or on the photo's album. */
  setCover(eventId: ID, photoId: ID, scope: 'event' | 'album'): Promise<void>
  /** Adds files as `processing`; they switch to `ready` shortly after. */
  uploadPhotos(eventId: ID, albumId: ID, files: UploadFile[], opts: UploadOptions): Promise<Photo[]>
  /** Debits ENHANCE_COST credits (ledger 'credits-used') and returns the new or updated photo. */
  enhancePhoto(photoId: ID, opts: EnhanceOptions): Promise<Photo>
  reindexFaces(eventId: ID): Promise<{ queued: number }>
  requestZip(eventId: ID, email: string, opts?: { albumId?: ID; photoIds?: ID[] }): Promise<ZipRequest>
  listZipRequests(eventId: ID): Promise<ZipRequest[]>

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
  changePlan(planId: Plan['id'], period: 'yearly' | 'quarterly'): Promise<PlanChange>
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
  deleteQR(id: ID): Promise<void>
  listBroadcasts(): Promise<Broadcast[]>
  sendBroadcast(input: Pick<Broadcast, 'title' | 'body' | 'audience' | 'scheduledAt'> & { imageUrl?: string }): Promise<Broadcast>
  cancelBroadcast(id: ID): Promise<Broadcast>
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
  registerGuest(shortId: string, input: RegisterGuestInput): Promise<GuestSession & { guest: Guest }>
  /** Excludes hidden, processing and pending-review photos. */
  listPublicPhotos(shortId: string, q?: PublicPhotosQuery): Promise<{ total: number; items: Photo[] }>
  searchFaces(shortId: string, selfie: FaceSearchInput): Promise<FaceSearchResult>
  setFavourite(photoId: ID, on: boolean, shortId?: string): Promise<{ favourites: number }>
  createEnquiry(target: EnquiryTarget, input: EnquiryInput): Promise<Enquiry>
  createOrder(shortId: string, input: OrderInput): Promise<Order>
  recordDownload(photoIds: ID[], shortId?: string): Promise<void>
  getStudioProfile(followCode: string): Promise<StudioProfile>
  followStudio(followCode: string): Promise<{ followers: number }>
  resolveGuestLink(code: string): Promise<ResolvedGuestLink>
}

export interface Persistence { load(): string | null; save(data: string): void }

/** Mock-only state that isn't part of the seed. */
interface MockExtra {
  coupons: string[]
  usageReport: UsageReport | null
  /** eventId → guest id registered on this device. */
  guestIds: Record<ID, ID>
}

interface Stored { seed: SeedState; photoPatches: Record<ID, Partial<Photo>>; deleted: ID[]; added: Photo[]; extra: MockExtra }

const clone = <T,>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)))
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms))
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`
const DAY = 86_400_000
const GALLERY_ORIGIN = 'https://frameline.in'
const round2 = (n: number) => Math.round(n * 100) / 100
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
  return {
    seed,
    photoPatches: stored.photoPatches ?? {},
    deleted: stored.deleted ?? [],
    added: stored.added ?? [],
    extra: { coupons: [], usageReport: null, guestIds: {}, ...(stored.extra ?? {}) },
  }
}

/** JSON replacer: object URLs only live for this page session, so never persist them. */
const dropBlobUrls = (key: string, value: unknown) => (key === 'url' && typeof value === 'string' && value.startsWith('blob:') ? undefined : value)

export function createMockApi(persist?: Persistence, opts: { latency?: number } = {}): FramelineApi {
  const latency = opts.latency ?? 120
  let state: Stored
  try {
    const raw = persist?.load()
    state = raw ? upgrade(JSON.parse(raw) as Partial<Stored>) : upgrade({})
    if (!state.seed?.events) throw new Error('bad state')
  } catch {
    state = upgrade({})
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
  const save = () => { try { persist?.save(JSON.stringify(state, dropBlobUrls)) } catch { /* storage full or unavailable */ } }
  const emit = (...topics: ChangeTopic[]) => { invalidate(); save(); new Set(topics).forEach((t) => listeners.forEach((l) => l(t))) }
  const s = () => state.seed
  const findEvent = (id: ID) => {
    const e = s().events.find((x) => x.id === id || x.shortId.toLowerCase() === id.toLowerCase())
    if (!e) fail(404, 'not_found', `Event ${id} was not found.`)
    return e!
  }
  const findAlbum = (id: ID) => { const a = s().albums.find((x) => x.id === id); if (!a) fail(404, 'not_found', `Album ${id} was not found.`); return a! }
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
    deletedSet ??= new Set(state.deleted)
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
    if ((deletedSet ??= new Set(state.deleted)).has(id)) return undefined
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
    for (const a of s().albums.filter((x) => x.eventId === eventId)) {
      const ps = albumPhotos(a)
      a.photoCount = ps.length
      const caps = ps.map((p) => p.capturedAt).sort()
      a.firstCapture = caps[0]
      a.lastCapture = caps[caps.length - 1]
      if (a.kind !== 'store') total += a.photoCount
    }
    ev.photoCount = total
  }

  function filterPhotos(eventId: ID, q: PhotoIdsQuery): Photo[] {
    const albums = s().albums.filter((a) => a.eventId === eventId && (q.albumId ? a.id === q.albumId : a.kind === 'album'))
    let items = albums.flatMap(albumPhotos)
    if (q.filter === 'hidden') items = items.filter((p) => p.hidden)
    else if (q.filter === 'favourites') items = items.filter((p) => p.favourites > 0)
    else if (q.filter === 'people') items = items.filter((p) => p.faces.length > 0)
    if (q.personId) items = items.filter((p) => p.faces.some((f) => f.personId === q.personId))
    const sort = q.sort ?? 'capture'
    return [...items].sort((a, b) => sort === 'name' ? a.filename.localeCompare(b.filename) : sort === 'sequence' ? a.index - b.index : a.capturedAt.localeCompare(b.capturedAt))
  }

  // ── Money helpers ─────────────────────────────────────────────────────────
  const balance = () => s().ledger[0]?.balance ?? 0
  function ledger(type: LedgerEntry['type'], description: string, amount: number, movesBalance: boolean): LedgerEntry {
    const entry: LedgerEntry = { id: uid('l'), at: new Date().toISOString(), description, type, amount: round2(amount), balance: round2(balance() + (movesBalance ? amount : 0)) }
    s().ledger.unshift(entry)
    return entry
  }
  function debitWallet(amount: number, description: string) {
    if (s().usage.walletCredits < amount) fail(402, 'insufficient_credits', `You need ${amount} credits but have ${s().usage.walletCredits}. Add credits and try again.`, { required: amount, available: s().usage.walletCredits })
    s().usage.walletCredits = round2(s().usage.walletCredits - amount)
    return ledger('credits-used', description, -amount, false)
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
    return { id: st.id, name: st.name, handle: st.handle, logoUrl: st.logoUrl, brandColor: st.brandColor, phone: st.phone, email: st.email, website: st.website, instagram: st.instagram, city: st.city, followCode: st.followCode }
  }
  const blockedReason = (e: PhotoEvent): PublicEvent['blocked'] =>
    e.settings.disabled ? 'disabled' : e.status === 'archived' ? 'archived' : Date.parse(e.expiresAt) < Date.now() ? 'expired' : e.status === 'draft' && e.photoCount === 0 ? 'empty' : undefined
  const visibleToGuests = (p: Photo) => !p.hidden && p.status === 'ready' && p.reviewStatus !== 'pending'
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
    return s().albums.filter((a) => a.eventId === e.id && a.kind !== 'store').sort((a, b) => a.order - b.order)
  }

  const api: FramelineApi = {
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },

    // ── Studio ──────────────────────────────────────────────────────────────
    async getStudio() { await wait(latency); return clone(s().studio) },
    async updateStudio(patch) {
      await wait(latency)
      const { id: _id, followCode: _fc, followers: _f, ...rest } = patch
      Object.assign(s().studio, rest)
      emit('studio')
      return clone(s().studio)
    },
    async getUsage() { await wait(latency); return clone(s().usage) },
    async getUsageBreakdown() {
      await wait(latency)
      const u = s().usage
      const events = s().events.map((e) => {
        const albums = s().albums.filter((a) => a.eventId === e.id)
        const guestUploads = albums.filter((a) => a.kind === 'guest').reduce((n, a) => n + a.photoCount, 0)
        const originals = state.added.filter((p) => p.eventId === e.id && (p as Photo & { quality?: string }).quality === 'original').length
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
    async listEvents() { await wait(latency); return clone(s().events) },
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
        hosts: input.host?.email ? [{ id: uid('h'), name: input.host.email.split('@')[0], email: input.host.email, phone: input.host.phone, role: 'client' }] : [],
        highlights: true, plan: 'subscription',
      }
      s().events.unshift(event)
      s().albums.push({ id: `${id}_guest`, eventId: id, name: 'Guest uploads', order: 99, photoCount: 0, kind: 'guest' })
      emit('events', 'albums')
      return clone(event)
    },
    async updateEvent(id, patch) { await wait(latency); Object.assign(findEvent(id), patch); emit('events'); return clone(findEvent(id)) },
    async updateEventSettings(id, patch) { await wait(latency / 2); Object.assign(findEvent(id).settings, patch); emit('events'); return clone(findEvent(id)) },
    async resetPin(id) { await wait(latency); const pin = String(1000 + Math.floor(Math.random() * 9000)); findEvent(id).settings.pin = pin; emit('events'); return pin },
    async deleteEvent(id) {
      await wait(latency)
      s().events = s().events.filter((e) => e.id !== id)
      s().albums = s().albums.filter((a) => a.eventId !== id)
      state.added = state.added.filter((p) => p.eventId !== id)
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
    async listAlbums(eventId) { await wait(latency); return clone(s().albums.filter((a) => a.eventId === eventId).sort((a, b) => a.order - b.order)) },
    async createAlbum(eventId, name) {
      await wait(latency)
      const order = Math.max(-1, ...s().albums.filter((a) => a.eventId === eventId && a.kind === 'album').map((a) => a.order)) + 1
      const album: Album = { id: uid(`${eventId}_al`), eventId, name, order, photoCount: 0, kind: 'album' }
      s().albums.push(album); emit('albums'); return clone(album)
    },
    async renameAlbum(id, name) { await wait(latency); findAlbum(id).name = name; emit('albums'); return clone(findAlbum(id)) },
    async deleteAlbum(id) {
      await wait(latency)
      const a = findAlbum(id)
      albumPhotos(a).forEach((p) => state.deleted.push(p.id))
      s().albums = s().albums.filter((x) => x.id !== id)
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
      ids.forEach((id) => { const p = getPhotoMerged(id); if (p) events.add(p.eventId); state.deleted.push(id) })
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
        copies.push({ ...clone(p), id: uid(`${albumId}_cp`), albumId, index: ++next, favourites: 0, downloads: 0 })
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
        ...(opts.quality === 'original' ? { quality: 'original' } : {}),
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
        result = { ...clone(p!), id: uid(`${p!.albumId}_en`), index: next, filename: p!.filename.replace(/(\.[^.]+)?$/, '-enhanced$1'), tone: shifted, favourites: 0, downloads: 0, enhancedFrom: photoId }
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
      setTimeout(() => emit('photos'), 1500)
      return { queued: e.photoCount }
    },
    async requestZip(eventId, email, o = {}) {
      await wait(latency)
      const e = findEvent(eventId)
      const count = o.photoIds?.length ?? (o.albumId ? findAlbum(o.albumId).photoCount : e.photoCount)
      const z: ZipRequest = { id: uid('zip'), eventId: e.id, albumId: o.albumId, email, photoCount: count, status: 'queued', requestedAt: new Date().toISOString() }
      s().zipRequests.unshift(z)
      emit('misc')
      setTimeout(() => {
        Object.assign(z, { status: 'ready', readyAt: new Date().toISOString(), url: `${GALLERY_ORIGIN}/zip/${z.id}` })
        emit('misc')
      }, 1500)
      return clone(z)
    },
    async listZipRequests(eventId) { await wait(latency); return clone(s().zipRequests.filter((z) => z.eventId === eventId)) },

    async listPeople(eventId) { await wait(latency); return clone(s().people.filter((p) => p.eventId === eventId)) },
    async listFilms(eventId) { await wait(latency); return clone(s().films.filter((f) => f.eventId === eventId)) },
    async addFilm(eventId, name, url) { await wait(latency); const f = { id: uid('f'), eventId, name, url }; s().films.push(f); emit('misc'); return clone(f) },
    async updateFilm(id, patch) { await wait(latency); const f = byId(s().films, id, 'Film'); Object.assign(f, patch); emit('misc'); return clone(f) },
    async deleteFilm(id) { await wait(latency); s().films = s().films.filter((f) => f.id !== id); emit('misc') },

    async listGuests(eventId) { await wait(latency); return clone(s().guests.filter((g) => g.eventId === eventId)) },
    async listAccessRequests(eventId) { await wait(latency); return clone(s().accessRequests.filter((a) => a.eventId === eventId)) },
    async resolveAccessRequest(id, approve) {
      await wait(latency)
      const req = s().accessRequests.find((a) => a.id === id)
      s().accessRequests = s().accessRequests.filter((a) => a.id !== id)
      if (req && approve) {
        const now = new Date().toISOString()
        s().guests.push({ id: uid('g'), eventId: req.eventId, name: req.name, email: req.email, phone: '', role: 'guest', favourites: [], lastActive: now, registeredAt: now })
      }
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
        const bankChanged = !!accountNumber || (rest.ifsc !== undefined && rest.ifsc !== cur.payout.ifsc)
        Object.assign(cur.payout, rest)
        if (accountNumber) cur.payout.accountLast4 = accountNumber.slice(-4)
        if (bankChanged) {
          cur.payout.verified = false
          // Simulated penny-drop verification.
          setTimeout(() => { if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cur.payout.ifsc)) { cur.payout.verified = true; emit('misc') } }, 1500)
        }
      }
      if (patch.saleWatermark) Object.assign(cur.saleWatermark, patch.saleWatermark)
      if (patch.international) Object.assign(cur.international, patch.international)
      if (patch.terms !== undefined) cur.terms = patch.terms
      emit('misc')
      return clone(cur)
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
    async changePlan(planId, period) {
      await wait(latency)
      const u = s().usage
      const current = PLANS.find((p) => p.id === u.planId)!
      const next = PLANS.find((p) => p.id === planId)
      if (!next) fail(422, 'validation_failed', `Unknown plan ${planId}.`)
      if (u.planId === planId && u.period === period) fail(409, 'same_plan', 'You are already on this plan.')
      const remainingDays = Math.max(0, (Date.parse(u.validTill) - Date.now()) / DAY)
      const credit = Math.round(planPrice(current, u.period) * Math.min(1, remainingDays / PERIOD_DAYS[u.period]))
      const charged = Math.max(0, planPrice(next!, period) - credit)
      Object.assign(u, { planId, period, photosLimit: next!.photos, validTill: new Date(Date.now() + PERIOD_DAYS[period] * DAY).toISOString() })
      const p = purchase({ description: `${next!.name} plan · ${period}${credit ? ` (₹${credit} credit for unused time)` : ''}`, kind: 'plan', amount: charged, method: 'card' })
      emit('usage', 'misc')
      return { usage: clone(u), charged, credit, purchase: clone(p) }
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
      purchase({ description: `Wallet credits · ₹${amount}`, kind: 'credits', amount, method: 'card' })
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
      purchase({ description: `Coupon ${c} · ${credits} credits`, kind: 'coupon', amount: 0, method: 'coupon' })
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
    async listQRs() { await wait(latency); return clone(s().qrs) },
    async updateQR(id, patch) { await wait(latency); const q = byId(s().qrs, id, 'QR code'); const { id: _id, scans: _sc, ...rest } = patch; Object.assign(q, rest); emit('misc'); return clone(q) },
    async createQR(name, eventId) {
      await wait(latency)
      const q: SmartQR = { id: uid('q'), name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 16), eventId, target: 'web', scans: 0, color: '#1B1712' }
      s().qrs.push(q); emit('misc'); return clone(q)
    },
    async deleteQR(id) { await wait(latency); s().qrs = s().qrs.filter((q) => q.id !== id); emit('misc') },
    async listBroadcasts() { await wait(latency); return clone(s().broadcasts) },
    async sendBroadcast(input) {
      await wait(latency)
      const b: Broadcast = { ...input, id: uid('b'), sentAt: input.scheduledAt ? undefined : new Date().toISOString() }
      s().broadcasts.unshift(b); emit('misc'); return clone(b)
    },
    async cancelBroadcast(id) {
      await wait(latency)
      const b = byId(s().broadcasts, id, 'Broadcast')
      if (b.sentAt || !b.scheduledAt) fail(409, 'already_sent', 'This broadcast was already sent, so it can’t be cancelled.')
      if (b.cancelledAt) fail(409, 'already_cancelled', 'This broadcast was already cancelled.')
      b.cancelledAt = new Date().toISOString()
      emit('misc')
      return clone(b)
    },
    async deleteBroadcast(id) { await wait(latency); s().broadcasts = s().broadcasts.filter((b) => b.id !== id); emit('misc') },
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
      return session(e, true, state.extra.guestIds[e.id])
    },
    async registerGuest(shortId, input) {
      await wait(latency)
      const e = findEvent(shortId)
      if (!input.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) fail(422, 'validation_failed', 'Enter your name and a valid email.')
      const now = new Date().toISOString()
      const email = input.email.trim().toLowerCase()
      let g = s().guests.find((x) => x.eventId === e.id && x.email.toLowerCase() === email)
      if (g) Object.assign(g, { name: input.name.trim(), phone: input.phone ?? g.phone, lastActive: now })
      else {
        g = { id: uid('g'), eventId: e.id, name: input.name.trim(), email, phone: input.phone ?? '', role: 'guest', favourites: [], lastActive: now, registeredAt: now }
        s().guests.push(g)
        s().activity.unshift({ id: uid('a'), kind: 'registration', title: `${g.name} registered`, detail: e.name, at: now })
      }
      state.extra.guestIds[e.id] = g.id
      emit('guests', 'activity')
      return { ...session(e, e.settings.access !== 'link-pin' && !e.settings.facePrivacy, g.id), guest: clone(g) }
    },
    async listPublicPhotos(shortId, q = {}) {
      await wait(latency)
      const e = findEvent(shortId)
      const albums = publicAlbums(e).filter((a) => (q.albumId ? a.id === q.albumId : a.kind === 'album'))
      let items = albums.flatMap(albumPhotos).filter(visibleToGuests)
      if (q.personId) items = items.filter((p) => p.faces.some((f) => f.personId === q.personId))
      const sort = q.sort ?? 'capture'
      items = [...items].sort((a, b) => q.highlights ? b.favourites - a.favourites || a.id.localeCompare(b.id)
        : sort === 'name' ? a.filename.localeCompare(b.filename) : sort === 'sequence' ? a.index - b.index : a.capturedAt.localeCompare(b.capturedAt))
      const offset = q.offset ?? 0
      return { total: items.length, items: clone(items.slice(offset, q.limit ? offset + q.limit : undefined)) }
    },
    async searchFaces(shortId, selfie) {
      await wait(latency * 4)
      const e = findEvent(shortId)
      if (!e.settings.faceSearch) fail(403, 'face_search_disabled', 'Face search is turned off for this gallery.')
      const people = s().people.filter((p) => p.eventId === e.id)
      const pool = people.filter((p) => !p.name).length ? people.filter((p) => !p.name) : people
      const photos = publicAlbums(e).filter((a) => a.kind === 'album').flatMap(albumPhotos).filter(visibleToGuests)
      if (!pool.length) {
        const ids = photos.filter((p) => hash(`${p.id}:${selfie.key}`) % 8 === 0).map((p) => p.id)
        return { personId: null, photoIds: ids }
      }
      const personId = pool[hash(selfie.key) % pool.length].id
      e.faceMatches++
      emit('events')
      return { personId, photoIds: photos.filter((p) => p.faces.some((f) => f.personId === personId)).map((p) => p.id) }
    },
    async setFavourite(photoId, on, shortId) {
      await wait(latency / 2)
      const p = getPhotoMerged(photoId)
      if (!p) fail(404, 'not_found', `Photo ${photoId} was not found.`)
      const eventId = shortId ? findEvent(shortId).id : p!.eventId
      const g = s().guests.find((x) => x.id === state.extra.guestIds[eventId])
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
      let paid = 0
      const labels: string[] = []
      const photoIds = new Set<ID>()
      for (const item of input.items) {
        const price = s().prices.find((p) => p.id === item.priceId)
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
        photoIds: [...photoIds], buyerEmail: input.buyer.email, method: input.method,
      }
      s().orders.unshift(order)
      ledger('sale', `Order #${number} · ${e.name}`, share, true)
      s().activity.unshift({ id: uid('a'), kind: 'order', title: `Order #${number} · ₹${order.paid.toLocaleString('en-IN')}`, detail: e.name, at })
      emit('misc', 'activity')
      return clone(order)
    },
    async recordDownload(photoIds) {
      await wait(latency / 2)
      photoIds.forEach((id) => { const p = getPhotoMerged(id); if (p) patchPhoto(id, { downloads: p.downloads + 1 }) })
      emit('photos')
    },
    async getStudioProfile(followCode) {
      await wait(latency)
      const st = studioFor(followCode)
      const featured = st.app.featuredEventIds
        .map((id) => s().events.find((e) => e.id === id))
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
    async followStudio(followCode) { await wait(latency); const st = studioFor(followCode); st.followers++; emit('studio'); return { followers: st.followers } },
    async resolveGuestLink(code) {
      await wait(latency / 2)
      const payload = decodeGuestLink(code)
      if (!payload) fail(404, 'not_found', 'This link is broken or has expired. Ask the photographer for a new one.')
      const kind = guestLinkKind(payload!)
      const e = findEvent(payload!.e)
      const vip = kind === 'v' ? payload!.vip : undefined
      return { kind, payload: payload!, ...(vip?.pin || vip?.all ? { session: session(e, !!vip.all || !e.settings.facePrivacy, state.extra.guestIds[e.id]) } : {}) }
    },
  }
  return api
}
