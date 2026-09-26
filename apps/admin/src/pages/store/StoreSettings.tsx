import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, cn, PageHeader, TabBar, useToast } from '@frameline/ui'
import { readLocal, writeLocal } from '../wallet/lib'
import { DEFAULT_STORE_SETTINGS, STORE_SETTINGS_KEY, validate, type StoreSettingsData, type TabId, type TabProps } from './settings/model'
import { KycTab } from './settings/KycTab'
import { PayoutsTab } from './settings/PayoutsTab'
import { WatermarkTab } from './settings/WatermarkTab'
import { InternationalTab } from './settings/InternationalTab'
import { TermsTab } from './settings/TermsTab'

const TABS: { value: TabId; label: string }[] = [
  { value: 'kyc', label: 'Business & KYC' },
  { value: 'payouts', label: 'Payouts' },
  { value: 'watermark', label: 'Store watermark' },
  { value: 'international', label: 'International selling' },
  { value: 'terms', label: 'Terms' },
]

const load = (): StoreSettingsData => {
  const s = readLocal<StoreSettingsData>(STORE_SETTINGS_KEY, DEFAULT_STORE_SETTINGS)
  // Merge nested sections so older saved shapes still work.
  return {
    kyc: { ...DEFAULT_STORE_SETTINGS.kyc, ...s.kyc, docs: { ...DEFAULT_STORE_SETTINGS.kyc.docs, ...s.kyc?.docs } },
    payout: { ...DEFAULT_STORE_SETTINGS.payout, ...s.payout },
    watermark: { ...DEFAULT_STORE_SETTINGS.watermark, ...s.watermark },
    intl: { ...DEFAULT_STORE_SETTINGS.intl, ...s.intl },
    terms: s.terms ?? DEFAULT_STORE_SETTINGS.terms,
  }
}

/**
 * Store settings. The mock API has no store-settings endpoint yet, so this page keeps its data
 * in localStorage (key frameline.storeSettings) and simulates KYC review and bank verification.
 */
export default function StoreSettings() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'kyc') as TabId
  const setTab = (t: TabId) => setParams((p) => { p.set('tab', t); return p }, { replace: true })

  const [saved, setSaved] = useState<StoreSettingsData>(load)
  const [draft, setDraft] = useState<StoreSettingsData>(saved)
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft])
  const errors = useMemo(() => (showErrors ? validate(draft) : {}), [draft, showErrors])
  const errorTabs = new Set(Object.keys(errors).map((k) => k.split('.')[0]))

  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const set: TabProps['set'] = (k, patch) => setDraft((d) => ({ ...d, [k]: { ...d[k], ...patch } }))

  const save = async () => {
    const errs = validate(draft)
    if (Object.keys(errs).length) {
      setShowErrors(true)
      const first = Object.keys(errs)[0].split('.')[0] as TabId
      setTab(first)
      toast.error('Some details need fixing', `${Object.keys(errs).length} ${Object.keys(errs).length === 1 ? 'field has' : 'fields have'} a problem. They’re marked in red.`)
      return
    }
    setSaving(true)
    await new Promise((r) => setTimeout(r, 350))
    const needsVerify = draft.payout.status === 'unverified'
    const next: StoreSettingsData = needsVerify ? { ...draft, payout: { ...draft.payout, status: 'verifying' } } : draft
    writeLocal(STORE_SETTINGS_KEY, next)
    setSaved(next); setDraft(next); setSaving(false); setShowErrors(false)
    toast.success('Saved', needsVerify ? 'We’re sending ₹1 to your bank account to verify it.' : undefined)
    if (needsVerify) {
      setTimeout(() => {
        const verified = { ...next, payout: { ...next.payout, status: 'verified' as const } }
        writeLocal(STORE_SETTINGS_KEY, verified)
        setSaved(verified)
        setDraft((d) => (d.payout.status === 'verifying' ? { ...d, payout: { ...d.payout, status: 'verified' } } : d))
        toast.success('Bank account verified', 'Payouts are on.')
      }, 3000)
    }
  }

  const props: TabProps = { data: draft, set, errors }
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        crumb={<Link to="/store" className="hover:text-ink">Store /</Link>}
        title="Store settings" subtitle="Needed once before your first payout."
        actions={<Button loading={saving} disabled={!dirty} onClick={save}>Save</Button>}
      />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-6 sm:px-7">
        <TabBar value={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, label: <>{t.label}{errorTabs.has(t.value) && <span className="size-1.5 rounded-full bg-bad" aria-label="has errors" />}</> }))} />
        {tab === 'kyc' && <KycTab {...props} />}
        {tab === 'payouts' && <PayoutsTab {...props} />}
        {tab === 'watermark' && <WatermarkTab {...props} />}
        {tab === 'international' && <InternationalTab {...props} />}
        {tab === 'terms' && <TermsTab terms={draft.terms} setTerms={(terms) => setDraft((d) => ({ ...d, terms }))} errors={errors} />}
      </div>
      <div className={cn('sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:px-7', !dirty && 'text-ink-3')}>
        <span className="mr-auto flex items-center gap-2 text-[12.5px]">
          <span className={cn('size-2 rounded-full', dirty ? 'bg-warn' : 'bg-ok')} aria-hidden />
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        {dirty && <Button variant="ghost" onClick={() => { setDraft(saved); setShowErrors(false) }}>Discard</Button>}
        <Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>Save changes</Button>
      </div>
    </div>
  )
}
