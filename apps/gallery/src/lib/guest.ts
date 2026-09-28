import { useSyncExternalStore } from 'react'
import type { GuestSession, ID, Photo, Tone } from '@frameline/shared'

/**
 * What this device remembers for the guest. The API is the source of truth for access (PIN / registration
 * sessions), face matches, favourites, orders, enquiries and follows; this store only keeps what the API has
 * no per-guest endpoint for, plus caches for instant UI:
 * - the guest session's meta (the token itself lives in the HTTP client's guest token store)
 * - favourites (ids + photo snapshots): instant cache; registered guests reload them from api.listMyFavourites
 * - photos bought (refreshed from api.listMyOrders), recent events, follows
 * Keyed by the event's shortId (upper-case).
 */
const KEY = 'frameline.guest.v2'
const LEGACY_KEY = 'frameline.guest.v1'

export interface VipFlags { skipLogin: boolean; pin: boolean; all: boolean }

/** Meta for the API guest session (verifyPin / registerGuest / VIP link). */
export interface GuestAuth { seeAll: boolean; guestId?: ID; expiresAt: number }

export interface FaceMatch {
  /** Person from face search (or from a face link). */
  personId?: ID
  /** Face-search key still to be resolved (face links without a person id). */
  key?: string
  /** Matched ids when face search returned no person (events without people). */
  photoIds?: ID[]
  thumb?: string
  at: string
  via: 'selfie' | 'link'
}

export interface EventSession {
  /** Name shown in "Welcome, <name>" (personal link or registration). */
  greeting?: string
  registration?: { name: string; email: string; phone: string; at: string }
  /** How the PIN gate was passed: typed by the guest, or embedded in a VIP link. */
  pin?: 'typed' | 'embedded'
  auth?: GuestAuth
  /** Display only: the API enforces the lock (429 pin_locked). */
  pinLockedUntil?: number
  /** Guest chose "Continue on web" on the app interstitial. */
  webChosen?: boolean
  vip?: VipFlags
  match?: FaceMatch
  favourites: ID[]
  /** Snapshots of favourited photos (for the Favourites page; no per-guest list endpoint). */
  favPhotos: Record<ID, Photo>
  /** Last "Download all" uses left reported by api.verifyDownloadPin (display only; the API counts). */
  downloadsLeft?: number
  purchased: ID[]
  uploads: number
  /** "Notify me" on a gallery with no photos yet: the number sent to api.requestNotify (cache of the server's request). */
  notify?: string
}

export interface RecentEvent { shortId: string; name: string; date: string; city: string; tone: Tone; at: string }
export interface GuestProfile { name: string; email: string; phone: string }

export interface GuestState {
  events: Record<string, EventSession>
  recent: RecentEvent[]
  /** Follow codes (upper-case) this device follows. */
  follows: string[]
  /** Last details the guest typed, to pre-fill forms. */
  profile?: GuestProfile
}

const empty = (): GuestState => ({ events: {}, recent: [], follows: [] })

export const emptySession = (): EventSession => ({ favourites: [], favPhotos: {}, purchased: [], uploads: 0 })

function read(key: string): Partial<GuestState> | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as Partial<GuestState>) : null } catch { return null }
}

/** Before contract v5 phone-only sign-ups stored a placeholder email; forget it. */
const PLACEHOLDER_EMAIL = /@mobile\.frameline\.in$/i
const realEmail = (e: string | undefined) => (e && !PLACEHOLDER_EMAIL.test(e) ? e : '')

function load(): GuestState {
  const cur = read(KEY)
  if (cur && cur.events) {
    const events = Object.fromEntries(Object.entries(cur.events).map(([k, v]) => {
      const s = { ...emptySession(), ...v }
      if (s.registration) s.registration = { ...s.registration, email: realEmail(s.registration.email) }
      return [k, s]
    }))
    return { ...empty(), ...cur, events, ...(cur.profile ? { profile: { ...cur.profile, email: realEmail(cur.profile.email) } } : {}) }
  }
  // Keep recent events and follows from the pre-API version; per-event sessions start fresh.
  const old = read(LEGACY_KEY)
  return { ...empty(), recent: Array.isArray(old?.recent) ? old.recent : [], follows: Array.isArray(old?.follows) ? old.follows : [] }
}

let state: GuestState = load()
const listeners = new Set<() => void>()

function commit(next: GuestState) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* private mode or full */ }
  listeners.forEach((l) => l())
}

// Keep tabs in sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); listeners.forEach((l) => l()) } })
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }

export const guest = {
  get: () => state,
  update(fn: (s: GuestState) => GuestState) { commit(fn(state)) },
  session(shortId: string): EventSession { return state.events[shortId.toUpperCase()] ?? emptySession() },
  patchSession(shortId: string, patch: Partial<EventSession> | ((s: EventSession) => Partial<EventSession>)) {
    const k = shortId.toUpperCase()
    const cur = state.events[k] ?? emptySession()
    const p = typeof patch === 'function' ? patch(cur) : patch
    commit({ ...state, events: { ...state.events, [k]: { ...cur, ...p } } })
  },
  setProfile(p: Partial<GuestProfile>) {
    const cur = state.profile ?? { name: '', email: '', phone: '' }
    const next = { ...cur, ...Object.fromEntries(Object.entries(p).filter(([, v]) => !!v)) }
    commit({ ...state, profile: next })
  },
}

/** Stores the meta of a session the API issued (verifyPin, registerGuest, VIP link). */
export function authFrom(session: GuestSession, prev?: GuestAuth): GuestAuth {
  return {
    // A typed PIN keeps "see all" even if a later registration answers with a narrower session.
    seeAll: session.seeAll || (!!prev?.seeAll && prev.expiresAt > Date.now()),
    guestId: session.guestId ?? prev?.guestId,
    expiresAt: Date.now() + session.expiresIn * 1000,
  }
}

export const authValid = (s: EventSession) => !!s.auth && s.auth.expiresAt > Date.now()

export function useGuest<T>(select: (s: GuestState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state))
}

const EMPTY = emptySession()
export function useSession(shortId: string): EventSession {
  return useGuest((s) => s.events[shortId.toUpperCase()] ?? EMPTY)
}

export function rememberEvent(e: Omit<RecentEvent, 'at'>) {
  const k = e.shortId.toUpperCase()
  if (state.recent[0]?.shortId === k && state.recent[0].name === e.name) return
  guest.update((s) => ({
    ...s,
    recent: [{ ...e, shortId: k, at: new Date().toISOString() }, ...s.recent.filter((r) => r.shortId !== k)].slice(0, 6),
  }))
}

export function setFollowing(code: string, on: boolean) {
  const c = code.toUpperCase()
  guest.update((s) => ({ ...s, follows: on ? [...new Set([...s.follows, c])] : s.follows.filter((x) => x !== c) }))
}

/** Keeps photo snapshots small enough for localStorage (big data: URLs from guest uploads are dropped). */
export function snapshot(p: Photo): Photo {
  return p.url && p.url.startsWith('data:') && p.url.length > 20_000 ? { ...p, url: undefined } : p
}
