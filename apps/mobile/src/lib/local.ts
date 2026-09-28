import { useRef, useSyncExternalStore } from 'react'
import type { ID, Photo } from '@frameline/shared'
import { kv } from './storage'

/**
 * On-device state, persisted in kv-store and read synchronously. The data itself lives in the API; this keeps
 * only what the phone has to remember because the contract has no endpoint for it:
 *
 * - `mode` and the photographer's display session (tokens live in SecureStore in API mode)
 * - `joined`: galleries this phone opened (no guest "my galleries" endpoint)
 * - `following`: studios this phone follows (followStudio counts the follow; there's no list endpoint)
 * - `favourites`: photo snapshots for the Favourites tab (setFavourite records the pick; there's no list endpoint)
 * - `unlocked` / `seeAll` / `registrations`: which gates this phone passed (the guest token itself is in kv-store)
 * - `selfie`: the last searchFaces result per event, so "My photos" survives a restart
 * - `orders` / `enquiries` / `guestUploads`: receipts of what was sent, for Profile and the per-phone upload limit
 */
export type Mode = 'guest' | 'studio'

export interface JoinedEvent { eventId: ID; shortId: string; joinedAt: string; welcomeName?: string }
export interface Favourite { photoId: ID; eventId: ID; shortId?: string; at: string; photo?: Photo }
export interface Registration { name: string; email: string; phone: string }
export interface SentEnquiry { id: string; name: string; phone: string; email: string; message: string; source: string; at: string }
export interface PlacedOrder { id: string; number?: number; eventId: ID; item: string; amount: number; at: string; status?: string }
export interface SelfieMatch { uri?: string; at: string; key?: string; personId?: ID | null; photoIds?: ID[] }
export interface StudioSession { email: string; name?: string; studioName?: string; signedInAt: string }

export interface LocalState {
  mode: Mode | null
  studioSession: StudioSession | null
  joined: JoinedEvent[]
  following: string[] // studio follow codes
  favourites: Favourite[]
  registrations: Record<ID, Registration>
  unlocked: ID[] // event ids whose PIN was accepted
  seeAll: ID[] // event ids whose guest session may browse every photo (typed PIN / VIP "all")
  selfie: Record<ID, SelfieMatch>
  enquiries: SentEnquiry[]
  orders: PlacedOrder[]
  guestUploads: Record<ID, number>
  /** "Notify me" requests sent from this phone (event id → mobile number), so the screen can offer Stop. */
  notify: Record<ID, string>
}

const KEY = 'frameline.local.v1'
const initial: LocalState = {
  mode: null, studioSession: null, joined: [], following: [], favourites: [], registrations: {}, unlocked: [], seeAll: [], selfie: {},
  enquiries: [], orders: [], guestUploads: {}, notify: {},
}

function load(): LocalState {
  const raw = kv.get(KEY)
  if (!raw) return initial
  try { return { ...initial, ...(JSON.parse(raw) as Partial<LocalState>) } } catch { return initial }
}

let state: LocalState = load()
const listeners = new Set<() => void>()

export const local = {
  get: () => state,
  set(update: Partial<LocalState> | ((s: LocalState) => Partial<LocalState>)) {
    const patch = typeof update === 'function' ? update(state) : update
    state = { ...state, ...patch }
    kv.set(KEY, JSON.stringify(state))
    listeners.forEach((l) => l())
  },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
  /** Clears guest history; keeps the mode and the photographer session. */
  reset() { state = { ...initial, mode: state.mode, studioSession: state.studioSession }; kv.set(KEY, JSON.stringify(state)); listeners.forEach((l) => l()) },
}

/** Subscribe to a slice of local state. The selector may derive new arrays; results are cached per state version. */
export function useLocal<T>(select: (s: LocalState) => T): T {
  const cache = useRef<{ s: LocalState; v: T } | null>(null)
  const snap = () => {
    if (cache.current && cache.current.s === state) return cache.current.v
    const v = select(state)
    cache.current = { s: state, v }
    return v
  }
  return useSyncExternalStore(local.subscribe, snap, snap)
}

const addId = (list: ID[], id: ID) => (list.includes(id) ? list : [...list, id])

/* ---------------- actions ---------------- */

export const actions = {
  setMode: (mode: Mode) => local.set({ mode }),
  signIn: (email: string, extra: Omit<StudioSession, 'email' | 'signedInAt'> = {}) =>
    local.set({ studioSession: { email, ...extra, signedInAt: new Date().toISOString() }, mode: 'studio' }),
  /** Refreshes the display session (launch check) without touching the mode. */
  setSession: (s: Omit<StudioSession, 'signedInAt'>) => local.set((st) => ({ studioSession: { signedInAt: st.studioSession?.signedInAt ?? new Date().toISOString(), ...s } })),
  signOut: () => local.set({ studioSession: null }),

  join(e: { id: ID; shortId: string }, welcomeName?: string) {
    local.set((s) => {
      const existing = s.joined.find((j) => j.eventId === e.id)
      const rest = s.joined.filter((j) => j.eventId !== e.id)
      const entry: JoinedEvent = { eventId: e.id, shortId: e.shortId.toUpperCase(), joinedAt: existing?.joinedAt ?? new Date().toISOString(), welcomeName: welcomeName ?? existing?.welcomeName }
      return { joined: [entry, ...rest] }
    })
  },
  /** Adds galleries the server remembers for this device (listMyGalleries) without reordering the local list. */
  mergeJoined(list: { id: ID; shortId: string; lastOpenedAt?: string }[]) {
    const missing = list.filter((g) => !state.joined.some((j) => j.eventId === g.id))
    if (!missing.length) return
    local.set((s) => ({ joined: [...s.joined, ...missing.map((g) => ({ eventId: g.id, shortId: g.shortId.toUpperCase(), joinedAt: g.lastOpenedAt ?? new Date().toISOString() }))] }))
  },
  leave: (eventId: ID) => local.set((s) => ({ joined: s.joined.filter((j) => j.eventId !== eventId) })),

  follow: (code: string) => local.set((s) => ({ following: s.following.includes(code) ? s.following : [...s.following, code] })),
  unfollow: (code: string) => local.set((s) => ({ following: s.following.filter((c) => c !== code) })),

  /** Local half of a favourite: keeps a snapshot so the Favourites tab needs no list endpoint. Returns the new state. */
  setFavourite(photo: Photo, shortId: string | undefined, on: boolean) {
    local.set((s) => {
      const rest = s.favourites.filter((f) => f.photoId !== photo.id)
      return { favourites: on ? [{ photoId: photo.id, eventId: photo.eventId, shortId, at: new Date().toISOString(), photo }, ...rest] : rest }
    })
  },
  /** The guest passed the PIN (or a VIP link) for this event. */
  unlock: (eventId: ID, seeAll = false) => local.set((s) => ({ unlocked: addId(s.unlocked, eventId), seeAll: seeAll ? addId(s.seeAll, eventId) : s.seeAll })),
  /** The guest session ended (token expired / PIN required again). */
  lock: (eventId: ID) => local.set((s) => ({ unlocked: s.unlocked.filter((id) => id !== eventId), seeAll: s.seeAll.filter((id) => id !== eventId) })),
  register: (eventId: ID, r: Registration, seeAll = false) =>
    local.set((s) => ({ registrations: { ...s.registrations, [eventId]: r }, seeAll: seeAll ? addId(s.seeAll, eventId) : s.seeAll })),
  unregister: (eventId: ID) => local.set((s) => { const next = { ...s.registrations }; delete next[eventId]; return { registrations: next } }),
  saveSelfie: (eventId: ID, match: Omit<SelfieMatch, 'at'>) => local.set((s) => ({ selfie: { ...s.selfie, [eventId]: { ...match, at: new Date().toISOString() } } })),
  clearSelfie: (eventId: ID) => local.set((s) => { const next = { ...s.selfie }; delete next[eventId]; return { selfie: next } }),
  addEnquiry: (e: Omit<SentEnquiry, 'at'>) => local.set((s) => ({ enquiries: [{ ...e, at: new Date().toISOString() }, ...s.enquiries] })),
  addOrder: (o: PlacedOrder) => local.set((s) => ({ orders: [o, ...s.orders] })),
  setNotify: (eventId: ID, phone: string | null) => local.set((s) => { const next = { ...s.notify }; if (phone) next[eventId] = phone; else delete next[eventId]; return { notify: next } }),
  countGuestUpload: (eventId: ID, n: number) => local.set((s) => ({ guestUploads: { ...s.guestUploads, [eventId]: (s.guestUploads[eventId] ?? 0) + n } })),
}

/** The most recent registration, used to prefill forms. */
export const lastRegistration = (s: LocalState): Registration | undefined => Object.values(s.registrations).at(-1)
