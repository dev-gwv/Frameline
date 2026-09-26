import { useRef, useSyncExternalStore } from 'react'
import type { ID } from '@frameline/shared'
import { kv } from './storage'

/**
 * On-device state that is not part of the FramelineApi contract yet: which audience the phone is set up
 * for, the photographer session, and the guest's joined events, follows, favourites, registrations,
 * unlocked PINs and selfie matches. Persisted in kv-store and read synchronously.
 */
export type Mode = 'guest' | 'studio'

export interface JoinedEvent { eventId: ID; shortId: string; joinedAt: string; welcomeName?: string }
export interface Favourite { photoId: ID; eventId: ID; at: string }
export interface Registration { name: string; email: string; phone: string }
export interface SentEnquiry { id: string; name: string; phone: string; email: string; message: string; source: string; at: string }
export interface PlacedOrder { id: string; eventId: ID; item: string; amount: number; at: string }

export interface LocalState {
  mode: Mode | null
  studioSession: { email: string; signedInAt: string } | null
  joined: JoinedEvent[]
  following: string[] // studio follow codes
  favourites: Favourite[]
  registrations: Record<ID, Registration>
  unlocked: ID[] // event ids whose PIN was entered
  selfie: Record<ID, { uri?: string; at: string }> // event id → selfie taken
  enquiries: SentEnquiry[]
  orders: PlacedOrder[]
  guestUploads: Record<ID, number>
}

const KEY = 'frameline.local.v1'
const initial: LocalState = {
  mode: null, studioSession: null, joined: [], following: [], favourites: [], registrations: {}, unlocked: [], selfie: {},
  enquiries: [], orders: [], guestUploads: {},
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
  reset() { state = { ...initial, mode: state.mode }; kv.set(KEY, JSON.stringify(state)); listeners.forEach((l) => l()) },
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

/* ---------------- actions ---------------- */

export const actions = {
  setMode: (mode: Mode) => local.set({ mode }),
  signIn: (email: string) => local.set({ studioSession: { email, signedInAt: new Date().toISOString() }, mode: 'studio' }),
  signOut: () => local.set({ studioSession: null }),

  join(e: { id: ID; shortId: string }, welcomeName?: string) {
    local.set((s) => {
      const existing = s.joined.find((j) => j.eventId === e.id)
      const rest = s.joined.filter((j) => j.eventId !== e.id)
      const entry: JoinedEvent = { eventId: e.id, shortId: e.shortId, joinedAt: existing?.joinedAt ?? new Date().toISOString(), welcomeName: welcomeName ?? existing?.welcomeName }
      return { joined: [entry, ...rest] }
    })
  },
  leave: (eventId: ID) => local.set((s) => ({ joined: s.joined.filter((j) => j.eventId !== eventId) })),

  follow: (code: string) => local.set((s) => ({ following: s.following.includes(code) ? s.following : [...s.following, code] })),
  unfollow: (code: string) => local.set((s) => ({ following: s.following.filter((c) => c !== code) })),

  toggleFavourite(photoId: ID, eventId: ID) {
    local.set((s) => s.favourites.some((f) => f.photoId === photoId)
      ? { favourites: s.favourites.filter((f) => f.photoId !== photoId) }
      : { favourites: [{ photoId, eventId, at: new Date().toISOString() }, ...s.favourites] })
  },
  unlock: (eventId: ID) => local.set((s) => ({ unlocked: s.unlocked.includes(eventId) ? s.unlocked : [...s.unlocked, eventId] })),
  register: (eventId: ID, r: Registration) => local.set((s) => ({ registrations: { ...s.registrations, [eventId]: r } })),
  saveSelfie: (eventId: ID, uri?: string) => local.set((s) => ({ selfie: { ...s.selfie, [eventId]: { uri, at: new Date().toISOString() } } })),
  clearSelfie: (eventId: ID) => local.set((s) => { const next = { ...s.selfie }; delete next[eventId]; return { selfie: next } }),
  addEnquiry: (e: Omit<SentEnquiry, 'id' | 'at'>) => local.set((s) => ({ enquiries: [{ ...e, id: `enq_${Date.now()}`, at: new Date().toISOString() }, ...s.enquiries] })),
  addOrder: (o: Omit<PlacedOrder, 'id' | 'at'>) => {
    const id = `FL${String(Date.now()).slice(-6)}`
    local.set((s) => ({ orders: [{ ...o, id, at: new Date().toISOString() }, ...s.orders] }))
    return id
  },
  countGuestUpload: (eventId: ID, n: number) => local.set((s) => ({ guestUploads: { ...s.guestUploads, [eventId]: (s.guestUploads[eventId] ?? 0) + n } })),
}

/** The most recent registration, used to prefill forms. */
export const lastRegistration = (s: LocalState): Registration | undefined => Object.values(s.registrations).at(-1)
