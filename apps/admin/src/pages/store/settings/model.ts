import { ApiError, type KycDocKind, type StoreSettings, type StoreSettingsPatch } from '@frameline/shared'
import { GSTIN_RE, IFSC_RE, PAN_RE, PIN_RE } from '../../wallet/lib'

export type DocId = KycDocKind
export type DocStatus = 'verified' | 'review' | 'needed'
export interface DocState { file: string; status: DocStatus; /** From uploadAsset('kyc-document'). */ assetId?: string }

/** Form shape for the store settings page (built from, and saved back to, the API's StoreSettings). */
export interface StoreSettingsData {
  kyc: {
    legalName: string; pan: string; gst: 'yes' | 'no'; gstin: string
    docs: Record<DocId, DocState>
    street: string; city: string; state: string; postal: string
  }
  /** `account` is write-only: empty means "keep the saved account" (shown as last 4 digits). */
  payout: { holder: string; account: string; accountLast4: string; ifsc: string; bank: string; branch: string; status: 'verified' | 'verifying' | 'unverified' }
  watermark: StoreSettings['saleWatermark']
  intl: { enabled: boolean; plan: 'starter' | 'growth' | 'pro'; paymentLink: string; upiQrName: string; upiQrUrl: string; email: string; whatsapp: string }
  terms: string
}

const DOC_IDS: DocId[] = ['pan', 'id', 'gst', 'cheque']

export function fromApi(s: StoreSettings): StoreSettingsData {
  const docs = Object.fromEntries(DOC_IDS.map((id) => {
    const d = s.kyc.documents.find((x) => x.kind === id)
    return [id, { file: d?.fileName ?? '', status: d?.status ?? 'needed', ...(d?.assetId ? { assetId: d.assetId } : {}) }]
  })) as Record<DocId, DocState>
  const i = s.international
  return {
    kyc: {
      legalName: s.kyc.legalName, pan: s.kyc.pan, gst: s.kyc.gstRegistered ? 'yes' : 'no', gstin: s.kyc.gstin, docs,
      street: s.kyc.address.street, city: s.kyc.address.city, state: s.kyc.address.state, postal: s.kyc.address.postal,
    },
    // Saved but not yet verified = the (simulated) penny-drop check is running.
    payout: { ...s.payout, account: '', status: s.payout.verified ? 'verified' : s.payout.accountLast4 ? 'verifying' : 'unverified' },
    watermark: { ...s.saleWatermark },
    intl: { enabled: i.enabled, plan: i.plan ?? 'starter', paymentLink: i.paymentLink ?? '', upiQrName: i.upiQrName ?? '', upiQrUrl: i.upiQrUrl ?? '', email: i.email ?? '', whatsapp: i.whatsapp ?? '' },
    terms: s.terms,
  }
}

/** Only the fields that changed, so untouched sections are never re-validated by the API. */
export function toPatch(saved: StoreSettingsData, d: StoreSettingsData): StoreSettingsPatch {
  const diff = <T extends object>(a: T, b: T, keys: (keyof T)[]) => {
    const out: Partial<T> = {}
    for (const k of keys) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = b[k]
    return out
  }
  const patch: StoreSettingsPatch = {}
  const k = d.kyc, sk = saved.kyc
  const kyc: NonNullable<StoreSettingsPatch['kyc']> = diff(
    { legalName: sk.legalName, pan: sk.pan, gstin: sk.gstin },
    { legalName: k.legalName.trim(), pan: k.pan, gstin: k.gst === 'yes' ? k.gstin : '' }, ['legalName', 'pan', 'gstin'])
  if (k.gst !== sk.gst) kyc.gstRegistered = k.gst === 'yes'
  const address = diff({ street: sk.street, city: sk.city, state: sk.state, postal: sk.postal }, { street: k.street.trim(), city: k.city.trim(), state: k.state, postal: k.postal }, ['street', 'city', 'state', 'postal'])
  if (Object.keys(address).length) kyc.address = address
  if (JSON.stringify(k.docs) !== JSON.stringify(sk.docs)) kyc.documents = DOC_IDS.map((id) => ({ kind: id, fileName: k.docs[id].file, status: k.docs[id].status, ...(k.docs[id].assetId ? { assetId: k.docs[id].assetId } : {}) }))
  if (Object.keys(kyc).length) patch.kyc = kyc

  const p = d.payout, sp = saved.payout
  const payout: NonNullable<StoreSettingsPatch['payout']> = diff(
    { holder: sp.holder, ifsc: sp.ifsc, bank: sp.bank, branch: sp.branch },
    { holder: p.holder.trim(), ifsc: p.ifsc, bank: p.bank.trim(), branch: p.branch.trim() }, ['holder', 'ifsc', 'bank', 'branch'])
  if (p.account) payout.accountNumber = p.account
  if (Object.keys(payout).length) patch.payout = payout

  const wm = diff(saved.watermark, d.watermark, ['template', 'text', 'orientation', 'size', 'opacity', 'color'])
  if (Object.keys(wm).length) patch.saleWatermark = wm
  const intl = diff(saved.intl, { ...d.intl, paymentLink: d.intl.paymentLink.trim() }, ['enabled', 'plan', 'paymentLink', 'upiQrName', 'upiQrUrl', 'email', 'whatsapp'])
  if (Object.keys(intl).length) patch.international = intl
  if (d.terms !== saved.terms) patch.terms = d.terms
  return patch
}

export type TabId = 'kyc' | 'payouts' | 'watermark' | 'international' | 'terms'
export type Errors = Partial<Record<string, string>>

/** Maps the API's 422 field paths (e.g. "kyc.address.city", "payout.accountNumber") to this form's "tab.field" keys. */
export function apiFieldErrors(err: unknown): Errors {
  if (!(err instanceof ApiError) || !err.fieldErrors.length) return {}
  const out: Errors = {}
  for (const f of err.fieldErrors) {
    const [section, ...rest] = f.field.split('.')
    const leaf = rest[rest.length - 1] ?? section
    const key = section === 'kyc' ? `kyc.${leaf}`
      : section === 'payout' ? `payouts.${leaf === 'accountNumber' ? 'account' : leaf}`
      : section === 'saleWatermark' ? `watermark.${leaf}`
      : section === 'international' ? `international.${leaf}`
      : section === 'terms' ? 'terms.terms' : f.field
    out[key] = f.message
  }
  return out
}

/** Field errors keyed "tab.field". */
export function validate(d: StoreSettingsData): Errors {
  const e: Errors = {}
  const k = d.kyc
  if (!k.legalName.trim()) e['kyc.legalName'] = 'Enter the name on your PAN or GST certificate'
  if (!PAN_RE.test(k.pan)) e['kyc.pan'] = 'PAN is 10 characters: 5 letters, 4 digits, 1 letter (e.g. AAKFN4521Q)'
  if (k.gst === 'yes' && !GSTIN_RE.test(k.gstin)) e['kyc.gstin'] = 'GSTIN is 15 characters, e.g. 27AAKFN4521Q1Z8'
  else if (k.gst === 'yes' && PAN_RE.test(k.pan) && k.gstin.slice(2, 12) !== k.pan) e['kyc.gstin'] = 'Characters 3–12 of the GSTIN must match your PAN'
  if (!k.street.trim()) e['kyc.street'] = 'Enter the street address'
  if (!k.city.trim()) e['kyc.city'] = 'Enter the city'
  if (!k.state) e['kyc.state'] = 'Pick a state'
  if (!PIN_RE.test(k.postal)) e['kyc.postal'] = 'Postal code is 6 digits and can’t start with 0'
  const p = d.payout
  if (!p.holder.trim()) e['payouts.holder'] = 'Enter the name on the bank account'
  if (p.account ? !/^\d{9,18}$/.test(p.account) : !p.accountLast4) e['payouts.account'] = 'Account number is 9 to 18 digits'
  if (!IFSC_RE.test(p.ifsc)) e['payouts.ifsc'] = 'IFSC is 11 characters: 4 letters, a 0, then 6 letters or digits (e.g. HDFC0001234)'
  if (!p.bank.trim()) e['payouts.bank'] = 'Enter the bank name'
  const w = d.watermark
  if (!w.text.trim()) e['watermark.text'] = 'Enter the watermark text'
  if (!/^#[0-9a-fA-F]{6}$/.test(w.color)) e['watermark.color'] = 'Use a 6-digit hex colour like #FFFFFF'
  const i = d.intl
  if (i.paymentLink && !/^https:\/\/\S+\.\S+/.test(i.paymentLink)) e['international.paymentLink'] = 'Link must start with https://'
  if (i.enabled && !i.paymentLink && !i.upiQrUrl) e['international.paymentLink'] = 'Add a payment link or a UPI QR before turning this on'
  if (!d.terms.trim()) e['terms.terms'] = 'Terms can’t be empty; reset to the default if unsure'
  return e
}

type Section = Exclude<keyof StoreSettingsData, 'terms'>
export interface TabProps {
  data: StoreSettingsData
  set: <K extends Section>(k: K, patch: Partial<StoreSettingsData[K]>) => void
  errors: Errors
}
