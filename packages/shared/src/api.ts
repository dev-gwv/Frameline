import { createSeed, generatePhotos, PRESETS, defaultSettings, tone, hash, type SeedState } from './seed'
import type {
  Album, Broadcast, Camera, EventSettings, EventType, Film, ID, Photo, PhotoEvent, PresetId, SmartQR, Studio,
  TeamMember, Ticket, WatermarkSettings, Website,
} from './types'

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

/** Change notifications let screens update live (the real API uses a Durable Object WebSocket). */
export type ChangeTopic = 'events' | 'albums' | 'photos' | 'studio' | 'usage' | 'guests' | 'activity' | 'misc'

/**
 * The contract every screen uses. `createMockApi` implements it in memory;
 * `apps/api` (Hono on Cloudflare Workers) will implement it over HTTP.
 */
export interface FramelineApi {
  subscribe(fn: (topic: ChangeTopic) => void): () => void

  getStudio(): Promise<Studio>
  updateStudio(patch: Partial<Studio>): Promise<Studio>
  getUsage(): Promise<SeedState['usage']>

  listEvents(): Promise<PhotoEvent[]>
  getEvent(id: ID): Promise<PhotoEvent>
  createEvent(input: NewEventInput): Promise<PhotoEvent>
  updateEvent(id: ID, patch: Partial<Omit<PhotoEvent, 'settings'>>): Promise<PhotoEvent>
  updateEventSettings(id: ID, patch: Partial<EventSettings>): Promise<PhotoEvent>
  resetPin(id: ID): Promise<string>
  deleteEvent(id: ID): Promise<void>

  listAlbums(eventId: ID): Promise<Album[]>
  createAlbum(eventId: ID, name: string): Promise<Album>
  renameAlbum(id: ID, name: string): Promise<Album>
  deleteAlbum(id: ID): Promise<void>
  reorderAlbums(eventId: ID, orderedIds: ID[]): Promise<void>

  listPhotos(eventId: ID, q?: ListPhotosQuery): Promise<{ total: number; items: Photo[] }>
  getPhoto(id: ID): Promise<Photo>
  updatePhotos(ids: ID[], patch: Partial<Pick<Photo, 'hidden' | 'albumId'>>): Promise<void>
  deletePhotos(ids: ID[]): Promise<void>
  setCover(eventId: ID, photoId: ID, scope: 'event' | 'album'): Promise<void>
  /** Adds files as `processing`; they switch to `ready` shortly after (simulated pipeline). */
  uploadPhotos(eventId: ID, albumId: ID, files: UploadFile[], opts: { quality: 'web' | 'original'; skipIds?: string[] }): Promise<Photo[]>

  listPeople(eventId: ID): Promise<SeedState['people']>
  listFilms(eventId: ID): Promise<Film[]>
  addFilm(eventId: ID, name: string, url: string): Promise<Film>
  deleteFilm(id: ID): Promise<void>

  listGuests(eventId: ID): Promise<SeedState['guests']>
  listAccessRequests(eventId: ID): Promise<SeedState['accessRequests']>
  resolveAccessRequest(id: ID, approve: boolean): Promise<void>

  listActivity(): Promise<SeedState['activity']>
  listOrders(): Promise<SeedState['orders']>
  listLedger(): Promise<SeedState['ledger']>
  listPrices(): Promise<SeedState['prices']>

  listCameras(): Promise<Camera[]>
  createCamera(input: Pick<Camera, 'label' | 'eventId' | 'albumId' | 'mode'>): Promise<Camera>
  listQRs(): Promise<SmartQR[]>
  updateQR(id: ID, patch: Partial<SmartQR>): Promise<SmartQR>
  createQR(name: string, eventId: ID): Promise<SmartQR>
  listBroadcasts(): Promise<Broadcast[]>
  sendBroadcast(input: Pick<Broadcast, 'title' | 'body' | 'audience' | 'scheduledAt'>): Promise<Broadcast>
  listTickets(): Promise<Ticket[]>
  createTicket(input: Pick<Ticket, 'subject' | 'eventId' | 'platform'> & { body: string }): Promise<Ticket>
  replyTicket(id: ID, body: string): Promise<Ticket>
  listTeam(): Promise<TeamMember[]>
  inviteMember(email: string, role: TeamMember['role']): Promise<TeamMember>
  getWatermark(): Promise<WatermarkSettings>
  updateWatermark(patch: Partial<WatermarkSettings>): Promise<WatermarkSettings>
  getWebsite(): Promise<Website>
  updateWebsite(patch: Partial<Website>): Promise<Website>
  listEnquiries(): Promise<SeedState['enquiries']>
  addCredits(amount: number): Promise<number>
}

export interface Persistence { load(): string | null; save(data: string): void }

interface Stored { seed: SeedState; photoPatches: Record<ID, Partial<Photo>>; deleted: ID[]; added: Photo[] }

const clone = <T,>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)))
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms))
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`

export function createMockApi(persist?: Persistence, opts: { latency?: number } = {}): FramelineApi {
  const latency = opts.latency ?? 120
  let state: Stored
  try {
    const raw = persist?.load()
    state = raw ? (JSON.parse(raw) as Stored) : { seed: createSeed(), photoPatches: {}, deleted: [], added: [] }
    if (!state.seed?.events) throw new Error('bad state')
  } catch {
    state = { seed: createSeed(), photoPatches: {}, deleted: [], added: [] }
  }
  const listeners = new Set<(t: ChangeTopic) => void>()
  const photoCache = new Map<ID, Photo[]>()

  const save = () => { try { persist?.save(JSON.stringify(state)) } catch { /* storage full or unavailable */ } }
  const emit = (...topics: ChangeTopic[]) => { save(); topics.forEach((t) => listeners.forEach((l) => l(t))) }
  const s = () => state.seed
  const findEvent = (id: ID) => { const e = s().events.find((x) => x.id === id || x.shortId.toLowerCase() === id.toLowerCase()); if (!e) throw new Error(`Event ${id} not found`); return e }
  const findAlbum = (id: ID) => { const a = s().albums.find((x) => x.id === id); if (!a) throw new Error(`Album ${id} not found`); return a }

  function albumPhotos(album: Album): Photo[] {
    if (!photoCache.has(album.id)) {
      const event = findEvent(album.eventId)
      const base = generatePhotos({ ...album, photoCount: baseCount(album) }, event)
      photoCache.set(album.id, base)
    }
    const deleted = new Set(state.deleted)
    const all = [...photoCache.get(album.id)!, ...state.added.filter((p) => p.albumId === album.id || state.photoPatches[p.id]?.albumId === album.id)]
    // photos moved into this album from elsewhere
    const movedIn = Object.entries(state.photoPatches).filter(([, p]) => p.albumId === album.id).map(([id]) => id)
    const extra: Photo[] = []
    for (const id of movedIn) {
      if (all.some((p) => p.id === id)) continue
      const src = findPhotoRaw(id)
      if (src) extra.push(src)
    }
    return [...all, ...extra]
      .filter((p) => !deleted.has(p.id))
      .map((p) => ({ ...p, ...state.photoPatches[p.id] }))
      .filter((p) => p.albumId === album.id)
  }

  /** The generated count is the album's count at seed time; later changes are tracked via patches. */
  const seedCounts = new Map<ID, number>(createSeed().albums.map((a) => [a.id, a.photoCount]))
  const baseCount = (a: Album) => seedCounts.get(a.id) ?? 0

  function findPhotoRaw(id: ID): Photo | undefined {
    const added = state.added.find((p) => p.id === id)
    if (added) return added
    const albumId = id.replace(/_p\d+$/, '')
    const album = s().albums.find((a) => a.id === albumId)
    if (!album) return undefined
    if (!photoCache.has(album.id)) albumPhotos(album)
    return photoCache.get(album.id)!.find((p) => p.id === id)
  }

  function recount(eventId: ID) {
    const ev = findEvent(eventId)
    let total = 0
    for (const a of s().albums.filter((x) => x.eventId === eventId)) {
      a.photoCount = albumPhotos(a).length
      if (a.kind !== 'store') total += a.photoCount
    }
    ev.photoCount = total
  }

  const api: FramelineApi = {
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },

    async getStudio() { await wait(latency); return clone(s().studio) },
    async updateStudio(patch) { await wait(latency); Object.assign(s().studio, patch); emit('studio'); return clone(s().studio) },
    async getUsage() { await wait(latency); return clone(s().usage) },

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
        expiresAt: new Date(new Date(input.date).getTime() + 365 * 86_400_000).toISOString(), createdAt: new Date().toISOString(),
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
    async deleteEvent(id) { await wait(latency); s().events = s().events.filter((e) => e.id !== id); s().albums = s().albums.filter((a) => a.eventId !== id); emit('events', 'albums') },

    async listAlbums(eventId) { await wait(latency); return clone(s().albums.filter((a) => a.eventId === eventId).sort((a, b) => a.order - b.order)) },
    async createAlbum(eventId, name) {
      await wait(latency)
      const order = Math.max(-1, ...s().albums.filter((a) => a.eventId === eventId && a.kind === 'album').map((a) => a.order)) + 1
      const album: Album = { id: uid(`${eventId}_al`), eventId, name, order, photoCount: 0, kind: 'album' }
      s().albums.push(album); emit('albums'); return clone(album)
    },
    async renameAlbum(id, name) { await wait(latency); findAlbum(id).name = name; emit('albums'); return clone(findAlbum(id)) },
    async deleteAlbum(id) { await wait(latency); const a = findAlbum(id); s().albums = s().albums.filter((x) => x.id !== id); recount(a.eventId); emit('albums', 'events', 'photos') },
    async reorderAlbums(eventId, ids) { await wait(latency / 2); ids.forEach((id, i) => { const a = s().albums.find((x) => x.id === id && x.eventId === eventId); if (a) a.order = i }); emit('albums') },

    async listPhotos(eventId, q = {}) {
      await wait(latency)
      const albums = s().albums.filter((a) => a.eventId === eventId && (q.albumId ? a.id === q.albumId : a.kind === 'album'))
      let items = albums.flatMap(albumPhotos)
      if (q.filter === 'hidden') items = items.filter((p) => p.hidden)
      else if (q.filter === 'favourites') items = items.filter((p) => p.favourites > 0)
      else if (q.filter === 'people') items = items.filter((p) => p.faces.length > 0)
      if (q.personId) items = items.filter((p) => p.faces.some((f) => f.personId === q.personId))
      const sort = q.sort ?? 'capture'
      items.sort((a, b) => sort === 'name' ? a.filename.localeCompare(b.filename) : sort === 'sequence' ? a.index - b.index : a.capturedAt.localeCompare(b.capturedAt))
      const offset = q.offset ?? 0
      return { total: items.length, items: clone(items.slice(offset, q.limit ? offset + q.limit : undefined)) }
    },
    async getPhoto(id) { await wait(latency / 2); const p = findPhotoRaw(id); if (!p) throw new Error('Photo not found'); return clone({ ...p, ...state.photoPatches[id] }) },
    async updatePhotos(ids, patch) {
      await wait(latency)
      const events = new Set<ID>()
      ids.forEach((id) => { state.photoPatches[id] = { ...state.photoPatches[id], ...patch }; const p = findPhotoRaw(id); if (p) events.add(p.eventId) })
      events.forEach(recount); emit('photos', 'albums', 'events')
    },
    async deletePhotos(ids) {
      await wait(latency)
      const events = new Set<ID>()
      ids.forEach((id) => { const p = findPhotoRaw(id); if (p) events.add(p.eventId); state.deleted.push(id) })
      events.forEach(recount); emit('photos', 'albums', 'events')
    },
    async setCover(eventId, photoId, scope) {
      await wait(latency)
      const p = findPhotoRaw(photoId)
      if (p && scope === 'event') { const e = findEvent(eventId); e.coverTones = [p.tone, e.coverTones[1], e.coverTones[2]] }
      emit('events', 'albums')
    },
    async uploadPhotos(eventId, albumId, files, opts) {
      await wait(latency)
      const album = findAlbum(albumId)
      const start = albumPhotos(album).length
      const created: Photo[] = files.map((f, i) => ({
        id: uid(`${albumId}_up`), eventId, albumId, filename: f.filename, index: start + i + 1,
        capturedAt: new Date().toISOString(), tone: tone(hash(f.filename)), url: f.url, status: 'processing', hidden: false,
        favourites: 0, downloads: 0, faces: [],
        exif: { width: f.width ?? 6000, height: f.height ?? 4000, sizeBytes: f.size },
        uploadedBy: 'You', source: 'web',
      }))
      state.added.push(...created)
      const ev = findEvent(eventId)
      if (ev.status === 'draft') ev.status = 'uploading'
      s().usage.photosUsed += created.length * (opts.quality === 'original' ? 2 : 1)
      recount(eventId)
      emit('photos', 'albums', 'events', 'usage')
      created.forEach((p, i) => setTimeout(() => {
        const stored = state.added.find((x) => x.id === p.id)
        if (stored) stored.status = 'ready'
        if (i === created.length - 1 && ev.status === 'uploading') ev.status = 'live'
        emit('photos', ...(i === created.length - 1 ? (['events'] as ChangeTopic[]) : []))
      }, 900 + i * 260))
      return clone(created)
    },

    async listPeople(eventId) { await wait(latency); return clone(s().people.filter((p) => p.eventId === eventId)) },
    async listFilms(eventId) { await wait(latency); return clone(s().films.filter((f) => f.eventId === eventId)) },
    async addFilm(eventId, name, url) { await wait(latency); const f = { id: uid('f'), eventId, name, url }; s().films.push(f); emit('misc'); return clone(f) },
    async deleteFilm(id) { await wait(latency); s().films = s().films.filter((f) => f.id !== id); emit('misc') },

    async listGuests(eventId) { await wait(latency); return clone(s().guests.filter((g) => g.eventId === eventId)) },
    async listAccessRequests(eventId) { await wait(latency); return clone(s().accessRequests.filter((a) => a.eventId === eventId)) },
    async resolveAccessRequest(id) { await wait(latency); s().accessRequests = s().accessRequests.filter((a) => a.id !== id); emit('guests') },

    async listActivity() { await wait(latency); return clone(s().activity) },
    async listOrders() { await wait(latency); return clone(s().orders) },
    async listLedger() { await wait(latency); return clone(s().ledger) },
    async listPrices() { await wait(latency); return clone(s().prices) },

    async listCameras() { await wait(latency); return clone(s().cameras) },
    async createCamera(input) {
      await wait(latency)
      const cam: Camera = { ...input, id: uid('c'), ftpUser: `nl_${input.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 14)}`, status: 'offline', today: 0 }
      s().cameras.push(cam); emit('misc'); return clone(cam)
    },
    async listQRs() { await wait(latency); return clone(s().qrs) },
    async updateQR(id, patch) { await wait(latency); const q = s().qrs.find((x) => x.id === id)!; Object.assign(q, patch); emit('misc'); return clone(q) },
    async createQR(name, eventId) {
      await wait(latency)
      const q: SmartQR = { id: uid('q'), name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 16), eventId, target: 'web', scans: 0, color: '#1B1712' }
      s().qrs.push(q); emit('misc'); return clone(q)
    },
    async listBroadcasts() { await wait(latency); return clone(s().broadcasts) },
    async sendBroadcast(input) {
      await wait(latency)
      const b: Broadcast = { ...input, id: uid('b'), sentAt: input.scheduledAt ? undefined : new Date().toISOString() }
      s().broadcasts.unshift(b); emit('misc'); return clone(b)
    },
    async listTickets() { await wait(latency); return clone(s().tickets) },
    async createTicket({ body, ...rest }) {
      await wait(latency)
      const t: Ticket = { ...rest, id: uid('t'), status: 'open', messages: [{ from: 'me', body, at: new Date().toISOString() }] }
      s().tickets.unshift(t); emit('misc'); return clone(t)
    },
    async replyTicket(id, body) {
      await wait(latency)
      const t = s().tickets.find((x) => x.id === id)!
      t.messages.push({ from: 'me', body, at: new Date().toISOString() }); t.status = 'waiting'; emit('misc'); return clone(t)
    },
    async listTeam() { await wait(latency); return clone(s().team) },
    async inviteMember(email, role) {
      await wait(latency)
      const m: TeamMember = { id: uid('u'), name: email.split('@')[0], email, role, access: role === 'uploader' ? 'Assigned events only' : 'All events', lastActive: '' }
      s().team.push(m); emit('misc'); return clone(m)
    },
    async getWatermark() { await wait(latency); return clone(s().watermark) },
    async updateWatermark(patch) { await wait(latency); Object.assign(s().watermark, patch); emit('misc'); return clone(s().watermark) },
    async getWebsite() { await wait(latency); return clone(s().website) },
    async updateWebsite(patch) { await wait(latency); Object.assign(s().website, patch); emit('misc'); return clone(s().website) },
    async listEnquiries() { await wait(latency); return clone(s().enquiries) },
    async addCredits(amount) { await wait(latency); s().usage.walletCredits += amount; emit('usage'); return s().usage.walletCredits },
  }
  return api
}
