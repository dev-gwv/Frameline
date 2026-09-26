import { useSyncExternalStore } from 'react'
import type { ID, Tone } from '@frameline/shared'

/**
 * Everything the guest does on this device: PIN unlocks, registration, selfie match, favourites,
 * Download-all uses, orders, enquiries, follows and recently opened events.
 *
 * The FramelineApi contract has no guest-side write endpoints yet, so this state is local
 * (see README "Needs from lead"). It is keyed by the event's shortId (upper-case).
 */
const KEY = 'frameline.guest.v1'

export interface VipFlags { skipLogin: boolean; pin: boolean; all: boolean }

export interface EventSession {
  /** Name shown in "Welcome, <name>" (personal link or registration). */
  greeting?: string
  registration?: { name: string; email: string; phone: string; at: string }
  /** How the PIN gate was passed: typed by the guest, or embedded in a VIP link. */
  pin?: 'typed' | 'embedded'
  pinTries: number
  pinLockedUntil?: number
  /** Guest chose "Continue on web" on the app interstitial. */
  webChosen?: boolean
  vip?: VipFlags
  match?: { personId: ID; thumb?: string; at: string; via: 'selfie' | 'link' }
  favourites: ID[]
  downloadAllUses: number
  purchased: ID[]
  uploads: number
}

export interface GuestOrder {
  id: string; number: number; shortId: string; eventName: string; items: string; photoIds: ID[]
  amount: number; method: 'upi' | 'card'; at: string
}
export interface GuestEnquiry { id: string; shortId?: string; name: string; phone: string; message: string; at: string }
export interface RecentEvent { shortId: string; name: string; date: string; city: string; tone: Tone; at: string }

export interface GuestState {
  guestId: string
  events: Record<string, EventSession>
  recent: RecentEvent[]
  follows: string[]
  orders: GuestOrder[]
  enquiries: GuestEnquiry[]
}

const empty = (): GuestState => ({
  guestId: `gst_${Math.random().toString(36).slice(2, 10)}`, events: {}, recent: [], follows: [], orders: [], enquiries: [],
})

export const emptySession = (): EventSession => ({ pinTries: 0, favourites: [], downloadAllUses: 0, purchased: [], uploads: 0 })

function load(): GuestState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const s = JSON.parse(raw) as GuestState; if (s && s.events) return { ...empty(), ...s } }
  } catch { /* unavailable or corrupt */ }
  return empty()
}

let state: GuestState = load()
const listeners = new Set<() => void>()

function commit(next: GuestState) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* private mode */ }
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
}

export function useGuest<T>(select: (s: GuestState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state))
}

const EMPTY = emptySession()
export function useSession(shortId: string): EventSession {
  return useGuest((s) => s.events[shortId.toUpperCase()] ?? EMPTY)
}

export function rememberEvent(e: Omit<RecentEvent, 'at'>) {
  guest.update((s) => ({
    ...s,
    recent: [{ ...e, shortId: e.shortId.toUpperCase(), at: new Date().toISOString() }, ...s.recent.filter((r) => r.shortId !== e.shortId.toUpperCase())].slice(0, 6),
  }))
}

export function toggleFollow(code: string) {
  const c = code.toUpperCase()
  guest.update((s) => ({ ...s, follows: s.follows.includes(c) ? s.follows.filter((x) => x !== c) : [...s.follows, c] }))
}

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`
