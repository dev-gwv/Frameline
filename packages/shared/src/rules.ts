import type { EventSettings, HandleCheck, PayoutCheck, Price, WatermarkPosition } from './types'

/*
 * Contract v5 business rules shared by the mock API and apps/api, so both answer the same way
 * (and a native client can show the same hints before it calls).
 */

/** Trashed photos, albums, events, QR codes and broadcasts are deleted for good after this many days. */
export const TRASH_DAYS = 30
/** GST added to Frameline's own charges (plans, card-paid packs). Wallet payments include it in the amount taken. */
export const GST_RATE = 0.18

/** Settings added in contract v5; older stored events are read with these defaults. */
export const EVENT_SETTINGS_V5_DEFAULTS: Pick<EventSettings, 'priceOverrides' | 'forSaleWatermark'> = { priceOverrides: {}, forSaleWatermark: true }
/** Fills settings fields a stored event may not have yet. */
export const withSettingsDefaults = (s: Omit<EventSettings, 'priceOverrides' | 'forSaleWatermark'> & Partial<EventSettings>): EventSettings =>
  ({ ...EVENT_SETTINGS_V5_DEFAULTS, ...s, priceOverrides: { ...(s.priceOverrides ?? {}) } })

/** The studio's price list with one event's overrides applied (what guests of that event pay). */
export function effectivePrices(prices: Price[], overrides: Record<string, number> | undefined): Price[] {
  if (!overrides) return prices.map((p) => ({ ...p }))
  return prices.map((p) => (typeof overrides[p.id] === 'number' && overrides[p.id] >= 0 ? { ...p, price: overrides[p.id] } : { ...p }))
}

/** Watermark positions, in grid order (top row, then bottom row). */
export const WATERMARK_POSITIONS: WatermarkPosition[] = ['tl', 'tc', 'tr', 'bl', 'bc', 'br']
/** Where a watermark sits: horizontal and vertical alignment for a position. */
export function watermarkAnchor(position: WatermarkPosition): { x: 'left' | 'center' | 'right'; y: 'top' | 'bottom' } {
  const x = position[1] === 'l' ? 'left' : position[1] === 'c' ? 'center' : 'right'
  return { x, y: position[0] === 't' ? 'top' : 'bottom' }
}

// ── Gallery address (studio handle) ────────────────────────────────────────
export const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
/** Addresses nobody can have. */
export const RESERVED_HANDLES = new Set(['frameline', 'admin', 'app', 'api', 'www', 'help', 'support', 'studio', 'photos', 'gallery', 'login', 'demo', 'test', 'mail', 'static', 'cdn', 'media', 'status', 'blog', 'about'])
/** Format and reserved-word check. Returns a HandleCheck for bad handles, null when the server still has to look it up. */
export function handleProblem(raw: string): HandleCheck | null {
  const handle = raw.trim().toLowerCase()
  if (!HANDLE_RE.test(handle)) return { handle, available: false, reason: 'invalid' }
  if (RESERVED_HANDLES.has(handle)) return { handle, available: false, reason: 'reserved' }
  return null
}

// ── Payout account check (simulated penny drop) ────────────────────────────
const normName = (n: string) => n.toLowerCase().replace(/\b(llp|pvt|private|ltd|limited|the|and|&|m\/s|ms)\b/g, '').replace(/[^a-z0-9]/g, '')
const IFSC_BANKS: Record<string, string> = {
  HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', SBIN: 'State Bank of India', UTIB: 'Axis Bank', KKBK: 'Kotak Mahindra Bank',
  YESB: 'Yes Bank', PUNB: 'Punjab National Bank', BARB: 'Bank of Baroda', CNRB: 'Canara Bank', IDFB: 'IDFC First Bank', INDB: 'IndusInd Bank',
}
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/

/**
 * Deterministic stand-in for the bank's ₹1 check (dev, tests and the mock; production asks the payout provider):
 * - IFSC must be valid and the account number known, else 'failed'
 * - the bank reports the business's legal name (KYC) as the account name when the holder matches it, else the holder
 *   as typed; if that doesn't match the legal name → 'name_mismatch'
 * - account numbers ending in 0000 simulate an account the bank can't reach → 'failed'
 */
export function simulatePayoutCheck(input: { holder: string; legalName: string; ifsc: string; accountLast4: string }, now = new Date()): PayoutCheck {
  const checkedAt = now.toISOString()
  const bankName = IFSC_BANKS[input.ifsc.slice(0, 4)] ?? (IFSC_RE.test(input.ifsc) ? `${input.ifsc.slice(0, 4)} bank` : undefined)
  if (!IFSC_RE.test(input.ifsc) || !input.accountLast4) {
    return { status: 'failed', bankName, checkedAt, message: 'We couldn’t reach this account. Check the account number and IFSC.' }
  }
  if (input.accountLast4 === '0000') return { status: 'failed', bankName, checkedAt, message: 'The bank didn’t accept the ₹1 test. Check the account number.' }
  const legal = normName(input.legalName)
  const holder = normName(input.holder)
  const matches = !legal || (!!holder && (legal.includes(holder) || holder.includes(legal)))
  const nameAtBank = (matches && input.legalName.trim() ? input.legalName : input.holder).trim().toUpperCase()
  if (!matches) {
    return { status: 'name_mismatch', nameAtBank, bankName, checkedAt, message: `The bank has this account under ${nameAtBank}, but your business is ${input.legalName.trim()}.` }
  }
  return { status: 'verified', nameAtBank, bankName, checkedAt, message: `Verified: the account is under ${nameAtBank}.` }
}

// ── Face search ────────────────────────────────────────────────────────────
/** A selfie smaller than this on its short side can't hold a face we could match. */
export const MIN_FACE_IMAGE_PX = 64

/** True when the input says there's no face to search with (client detector found none, or the image is too small). */
export function selfieHasNoFace(input: { faces?: number; image?: { width: number; height: number } }): boolean {
  if (input.faces === 0) return true
  if (input.image && Math.min(input.image.width, input.image.height) < MIN_FACE_IMAGE_PX) return true
  return false
}

/** Clockwise rotation after turning by `degrees` (any multiple of 90, negative turns left). */
export const addRotation = (current: number, degrees: number) => ((((current + degrees) % 360) + 360) % 360) as 0 | 90 | 180 | 270
