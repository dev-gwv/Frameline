import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { StoreSettingsPatch } from '@frameline/shared'
import { Button, cn, PageHeader, Skeleton, TabBar, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useStoreSettings } from '../../lib/queries'
import { QueryError } from '../system'
import { apiFieldErrors, fromApi, toPatch, validate, type Errors, type StoreSettingsData, type TabId, type TabProps } from './settings/model'
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
/** Which form tab each patch section belongs to (only changed sections are validated and sent). */
const SECTION_TAB: Record<keyof StoreSettingsPatch, TabId> = { kyc: 'kyc', payout: 'payouts', saleWatermark: 'watermark', international: 'international', terms: 'terms' }

/** Store settings: KYC, payout account, sale watermark, international selling and terms (api.getStoreSettings / updateStoreSettings). */
export default function StoreSettings() {
  const q = useStoreSettings()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'kyc') as TabId
  const setTab = (t: TabId) => setParams((p) => { p.set('tab', t); return p }, { replace: true })
  const saved = useMemo(() => (q.data ? fromApi(q.data) : null), [q.data])

  if (q.isError) return <div className="p-6"><QueryError error={q.error} retry={() => q.refetch()} /></div>
  if (!saved) return (
    <div className="flex flex-col gap-4 px-4 py-6 sm:px-7">
      <Skeleton className="h-10 w-64" /><Skeleton className="h-9" /><Skeleton className="h-[360px]" />
    </div>
  )
  return <StoreSettingsForm saved={saved} tab={tab} setTab={setTab} />
}

function StoreSettingsForm({ saved, tab, setTab }: { saved: StoreSettingsData; tab: TabId; setTab: (t: TabId) => void }) {
  const api = useApi()
  const toast = useToast()
  const [draft, setDraft] = useState<StoreSettingsData>(saved)
  const [showErrors, setShowErrors] = useState(false)
  const [serverErrors, setServerErrors] = useState<Errors>({})

  const patch = useMemo(() => toPatch(saved, draft), [saved, draft])
  const dirty = Object.keys(patch).length > 0
  const changedTabs = new Set((Object.keys(patch) as (keyof StoreSettingsPatch)[]).map((s) => SECTION_TAB[s]))
  const localErrors = useMemo(() => {
    const all = validate(draft)
    return Object.fromEntries(Object.entries(all).filter(([k]) => changedTabs.has(k.split('.')[0] as TabId)))
  }, [draft, patch]) // eslint-disable-line react-hooks/exhaustive-deps
  const errors: Errors = { ...(showErrors ? localErrors : {}), ...serverErrors }
  const errorTabs = new Set(Object.keys(errors).map((k) => k.split('.')[0]))

  // Live updates (e.g. the bank account finishing verification) refresh `saved`: pick up server-side
  // changes in sections the user isn't editing.
  useEffect(() => {
    setDraft((d) => {
      const next = { ...d }
      if (!patch.payout) next.payout = saved.payout
      if (!patch.kyc) next.kyc = saved.kyc
      return next
    })
  }, [saved]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const set: TabProps['set'] = (k, p) => {
    setDraft((d) => ({ ...d, [k]: { ...d[k], ...p } }))
    setServerErrors((e) => Object.fromEntries(Object.entries(e).filter(([key]) => !key.startsWith(k === 'intl' ? 'international' : k === 'payout' ? 'payouts' : k))))
  }

  const save = useAction(() => api.updateStoreSettings(patch), {
    success: (s) => (patch.payout && !s.payout.verified ? 'Saved · we’re sending ₹1 to verify your bank account' : 'Saved'),
    onSuccess: (s) => { setDraft(fromApi(s)); setShowErrors(false); setServerErrors({}) },
    onError: (err) => {
      const fe = apiFieldErrors(err)
      setServerErrors(fe)
      const first = Object.keys(fe)[0]
      if (first) setTab(first.split('.')[0] as TabId)
    },
  })

  const submit = () => {
    if (Object.keys(localErrors).length) {
      setShowErrors(true)
      setTab(Object.keys(localErrors)[0].split('.')[0] as TabId)
      const n = Object.keys(localErrors).length
      toast.error('Some details need fixing', `${n} ${n === 1 ? 'field has' : 'fields have'} a problem. They’re marked in red.`)
      return
    }
    save.mutate(undefined)
  }

  const props: TabProps = { data: draft, set, errors }
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        crumb={<Link to="/store" className="hover:text-ink">Store /</Link>}
        title="Store settings" subtitle="Needed once before your first payout."
        actions={<Button loading={save.isPending} disabled={!dirty} onClick={submit}>Save</Button>}
      />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-6 sm:px-7">
        <TabBar value={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, label: <>{t.label}{errorTabs.has(t.value) && <span className="size-1.5 rounded-full bg-bad" aria-label="has errors" />}</> }))} />
        {tab === 'kyc' && <KycTab {...props} />}
        {tab === 'payouts' && <PayoutsTab {...props} />}
        {tab === 'watermark' && <WatermarkTab {...props} />}
        {tab === 'international' && <InternationalTab {...props} />}
        {tab === 'terms' && <TermsTab terms={draft.terms} setTerms={(terms) => { setDraft((d) => ({ ...d, terms })); setServerErrors((e) => ({ ...e, 'terms.terms': undefined })) }} errors={errors} />}
      </div>
      <div className={cn('sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:px-7', !dirty && 'text-ink-3')}>
        <span className="mr-auto flex items-center gap-2 text-[12.5px]">
          <span className={cn('size-2 rounded-full', dirty ? 'bg-warn' : 'bg-ok')} aria-hidden />
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        {dirty && <Button variant="ghost" onClick={() => { setDraft(saved); setShowErrors(false); setServerErrors({}) }}>Discard</Button>}
        <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={submit}>Save changes</Button>
      </div>
    </div>
  )
}
