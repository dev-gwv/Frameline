import { useEffect, useRef } from 'react'
import type { Studio, StudioBilling } from '@frameline/shared'
import { useApi } from '../../lib/api'
import { useAction, useStudio } from '../../lib/queries'
import type { Billing } from '../wallet/lib'

/** Billing & GST details live on the Studio (Studio.billing, saved with api.updateStudio). */
const LEGACY_KEY = 'frameline.billing'

export const toBilling = (studio: Studio): Billing => {
  const b = studio.billing
  return b
    ? { name: b.name, gstin: b.gstin ?? '', address: b.address, state: b.state, email: b.invoiceEmail }
    : { name: studio.name, gstin: '', address: '', state: '', email: studio.email }
}
export const fromBilling = (b: Billing): StudioBilling => ({
  name: b.name.trim(), address: b.address.trim(), state: b.state, invoiceEmail: b.email.trim(), ...(b.gstin ? { gstin: b.gstin } : {}),
})

/**
 * The studio's billing details, plus `save`. Once per browser, a value from the old localStorage
 * stand-in (frameline.billing) is moved onto the Studio if the Studio has none yet.
 */
export function useBilling() {
  const api = useApi()
  const studio = useStudio()
  const save = useAction((b: Billing) => api.updateStudio({ billing: fromBilling(b) }), { success: 'Billing details saved · new invoices use them' })
  const migrated = useRef(false)
  useEffect(() => {
    if (!studio.data || migrated.current) return
    migrated.current = true
    let legacy: Billing | null = null
    try { const raw = localStorage.getItem(LEGACY_KEY); legacy = raw ? (JSON.parse(raw) as Billing) : null } catch { /* ignore */ }
    if (!legacy) return
    const drop = () => { try { localStorage.removeItem(LEGACY_KEY) } catch { /* ignore */ } }
    if (studio.data.billing || !legacy.name) { drop(); return }
    api.updateStudio({ billing: fromBilling({ ...toBilling(studio.data), ...legacy }) }).then(drop, () => { /* try again next visit */ })
  }, [studio.data, api])
  return { ...studio, billing: studio.data ? toBilling(studio.data) : undefined, hasBilling: !!studio.data?.billing, save }
}
