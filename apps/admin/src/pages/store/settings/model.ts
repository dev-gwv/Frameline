import { GSTIN_RE, IFSC_RE, PAN_RE, PIN_RE } from '../../wallet/lib'

export type DocId = 'pan' | 'id' | 'gst' | 'cheque'
export type DocStatus = 'verified' | 'review' | 'needed'
export interface DocState { file: string; status: DocStatus }

export interface StoreSettingsData {
  kyc: {
    legalName: string; pan: string; gst: 'yes' | 'no'; gstin: string
    docs: Record<DocId, DocState>
    street: string; city: string; state: string; postal: string
  }
  payout: { holder: string; account: string; ifsc: string; bank: string; branch: string; status: 'verified' | 'verifying' | 'unverified' }
  watermark: { template: 'forsale' | 'centre'; text: string; orientation: 'diagonal' | 'vertical' | 'horizontal'; size: number; opacity: number; color: string }
  intl: { enabled: boolean; plan: 'starter' | 'growth' | 'pro'; paymentLink: string; upiQrName: string; upiQrUrl: string; email: string; whatsapp: string }
  terms: string
}

export const STORE_SETTINGS_KEY = 'frameline.storeSettings'

export const DEFAULT_TERMS = `Photo-selling terms

1. What you buy. Digital downloads are full-resolution JPG files for personal use: sharing with family and friends and posting on social media with credit to the studio. Commercial use (ads, resale, publications) needs written permission from the studio.

2. Delivery. Downloads are available right after payment and stay in your account for 12 months. Prints ship within 5 working days of payment.

3. Refunds. You can ask for a refund within 3 days of purchase if a download is broken or a print arrives damaged. Refunds go back to the original payment method within 7 working days.

4. Watermarks. Preview photos carry a watermark. Purchased photos are delivered without it.

5. Privacy. Your email and phone number are used only to deliver your order and send its receipt.

6. Contact. Questions about an order go to the studio first; you can also reach Frameline support from your receipt.`

export const DEFAULT_STORE_SETTINGS: StoreSettingsData = {
  kyc: {
    legalName: 'Northlight Studio LLP', pan: 'AAKFN4521Q', gst: 'yes', gstin: '27AAKFN4521Q1Z8',
    docs: {
      pan: { file: 'pan-card.pdf', status: 'verified' },
      id: { file: 'aadhaar.jpg', status: 'verified' },
      gst: { file: 'gst-cert.pdf', status: 'review' },
      cheque: { file: '', status: 'needed' },
    },
    street: '14 Hill Road, Bandra West', city: 'Mumbai', state: 'Maharashtra', postal: '400050',
  },
  payout: { holder: 'Northlight Studio LLP', account: '50100234474471', ifsc: 'HDFC0001234', bank: 'HDFC Bank', branch: 'Andheri West', status: 'verified' },
  watermark: { template: 'forsale', text: 'FOR SALE · NORTHLIGHT', orientation: 'diagonal', size: 2, opacity: 35, color: '#FFFFFF' },
  intl: { enabled: false, plan: 'starter', paymentLink: '', upiQrName: '', upiQrUrl: '', email: 'studio@northlight.in', whatsapp: '+91 98200 41177' },
  terms: DEFAULT_TERMS,
}

export type TabId = 'kyc' | 'payouts' | 'watermark' | 'international' | 'terms'
export type Errors = Partial<Record<string, string>>

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
  if (!/^\d{9,18}$/.test(p.account)) e['payouts.account'] = 'Account number is 9 to 18 digits'
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
