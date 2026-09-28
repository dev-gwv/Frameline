import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import type { StoreSettings, StoreSettingsPatch } from '@frameline/shared'
import { Button, Page, Skeleton, useToast } from '@frameline/ui'
import { useApi } from '../../../lib/api'
import { useAction, useEvents, useStoreSettings } from '../../../lib/queries'
import { BackLink } from '../../../lib/url'
import { QueryError } from '../../system'
import { SideList } from '../../settings/SideList'
import { payoutState, setupState } from '../lib'
import { DefaultPrices } from '../Prices'
import { apiFieldErrors, fromApi, toPatch, validate, type Errors, type StoreSettingsData, type TabId, type TabProps } from './model'
import { KycTab } from './KycTab'
import { PayoutsTab } from './PayoutsTab'
import { WatermarkTab } from './WatermarkTab'
import { InternationalTab } from './InternationalTab'
import { TermsTab } from './TermsTab'

type PageTab = 'business' | 'payouts' | 'prices' | 'watermark' | 'abroad' | 'terms'
const TABS: { id: PageTab; label: string; form?: TabId; section?: keyof StoreSettingsPatch }[] = [
  { id: 'business', label: 'Business details', form: 'kyc', section: 'kyc' },
  { id: 'payouts', label: 'Payout account', form: 'payouts', section: 'payout' },
  { id: 'prices', label: 'Prices' },
  { id: 'watermark', label: 'Watermark for sale photos', form: 'watermark', section: 'saleWatermark' },
  { id: 'abroad', label: 'Selling abroad', form: 'international', section: 'international' },
  { id: 'terms', label: 'Terms for buyers', form: 'terms', section: 'terms' },
]
/** Old tab names (Store settings) still open the right section. */
const ALIASES: Record<string, PageTab> = { kyc: 'business', international: 'abroad', payout: 'payouts', price: 'prices' }
const FORM_TAB: Record<TabId, PageTab> = { kyc: 'business', payouts: 'payouts', watermark: 'watermark', international: 'abroad', terms: 'terms' }

/** /sell/settings/:tab — selling settings as a left-list page (Business details, Payout account, Prices, Watermark, Abroad, Terms). */
export default function SellSettings() {
  const { tab: raw = 'business' } = useParams()
  const q = useStoreSettings()
  const events = useEvents()
  const saved = useMemo(() => (q.data ? fromApi(q.data) : null), [q.data])
  const tab = ALIASES[raw] ?? raw
  if (!TABS.some((t) => t.id === tab)) return <Navigate to="/sell/settings/business" replace />
  const setup = setupState(q.data, (events.data ?? []).filter((e) => e.settings.storeEnabled).length)

  return (
    <Page
      title="Selling settings"
      crumb={<BackLink to="/sell">{!q.data || !events.data || setup.live ? 'Sell photos' : 'Back to the checklist'}</BackLink>}
      subtitle="Needed once, before your first payout."
    >
      {q.isError ? <QueryError error={q.error} retry={() => q.refetch()} what="your selling settings" />
        : !saved || !q.data ? <div className="grid gap-4 md:grid-cols-[200px_1fr]"><Skeleton className="h-56" /><Skeleton className="h-[420px]" /></div>
        : <SettingsForm key="form" saved={saved} raw={q.data} tab={tab as PageTab} />}
    </Page>
  )
}

function SettingsForm({ saved, raw, tab }: { saved: StoreSettingsData; raw: StoreSettings; tab: PageTab }) {
  const api = useApi()
  const qc = useQueryClient()
  const toast = useToast()
  const [draft, setDraft] = useState<StoreSettingsData>(saved)
  const [showErrors, setShowErrors] = useState(false)
  const [serverErrors, setServerErrors] = useState<Errors>({})
  const meta = TABS.find((t) => t.id === tab)!

  const patch = useMemo(() => toPatch(saved, draft), [saved, draft])
  const dirtyTabs = new Set((Object.keys(patch) as (keyof StoreSettingsPatch)[]).map((s) => TABS.find((t) => t.section === s)!.id))
  const dirty = !!meta.section && meta.section in patch
  const tabErrors = useMemo(() => (meta.form ? Object.fromEntries(Object.entries(validate(draft)).filter(([k]) => k.startsWith(`${meta.form}.`))) : {}), [draft, meta.form])
  const errors: Errors = { ...(showErrors ? tabErrors : {}), ...serverErrors }

  // Live updates (e.g. the ₹1 check finishing) refresh `saved`: take them in for sections you aren't editing.
  useEffect(() => {
    setDraft((d) => {
      const next = { ...d }
      if (!patch.payout) next.payout = saved.payout
      if (!patch.kyc) next.kyc = saved.kyc
      return next
    })
  }, [saved]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setShowErrors(false) }, [tab])

  useEffect(() => {
    if (!Object.keys(patch).length) return
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [patch])

  const set: TabProps['set'] = (k, p) => {
    setDraft((d) => ({ ...d, [k]: { ...d[k], ...p } }))
    setServerErrors({})
  }

  const save = useAction((section: keyof StoreSettingsPatch) => api.updateStoreSettings({ [section]: patch[section] } as StoreSettingsPatch), {
    success: (s, section) => {
      if (section !== 'payout' || !s.payout.check) return 'Saved'
      const c = s.payout.check
      return c.status === 'verified' ? 'Saved · account verified with ₹1' : c.status === 'name_mismatch' ? 'Saved · the bank has a different name on this account' : c.status === 'failed' ? 'Saved · the bank didn’t accept the ₹1 test' : 'Saved · we’re sending ₹1 to check the account'
    },
    onSuccess: (s, section) => {
      qc.setQueryData(['orders', 'store-settings'], s)
      const fresh = fromApi(s)
      // Keep unsaved edits in other sections.
      const key = section === 'saleWatermark' ? 'watermark' : section === 'international' ? 'intl' : section === 'payout' ? 'payout' : section
      setDraft((d) => ({ ...d, [key]: fresh[key as keyof StoreSettingsData] }))
      setShowErrors(false); setServerErrors({})
    },
    onError: (err) => setServerErrors(apiFieldErrors(err)),
  })
  const submit = () => {
    if (!meta.section) return
    if (Object.keys(tabErrors).length) {
      setShowErrors(true)
      const n = Object.keys(tabErrors).length
      toast.error('Some details need fixing', `${n} ${n === 1 ? 'field has' : 'fields have'} a problem. They’re marked in red.`)
      return
    }
    save.mutate(meta.section)
  }
  const discard = () => {
    const key = meta.section === 'saleWatermark' ? 'watermark' : meta.section === 'international' ? 'intl' : meta.section
    if (key) setDraft((d) => ({ ...d, [key]: saved[key as keyof StoreSettingsData] }))
    setShowErrors(false); setServerErrors({})
  }

  const props: TabProps = { data: draft, set, errors }
  const errorTabs = new Set(Object.keys(serverErrors).map((k) => FORM_TAB[k.split('.')[0] as TabId]))
  return (
    <SideList label="Selling settings" value={tab} items={TABS.map((t) => ({
      id: t.id, to: `/sell/settings/${t.id}`, label: t.label,
      badge: errorTabs.has(t.id) ? <span className="size-2 shrink-0 rounded-full bg-bad" aria-label="has errors" /> : dirtyTabs.has(t.id) ? <span className="size-2 shrink-0 rounded-full bg-warn" aria-label="unsaved changes" /> : undefined,
    }))}>
      <div className="flex flex-col gap-4">
        {tab === 'business' && <KycTab {...props} />}
        {tab === 'payouts' && <PayoutsTab {...props} state={payoutState(raw)} legalName={raw.kyc.legalName} check={raw.payout.check} />}
        {tab === 'prices' && <DefaultPrices primary />}
        {tab === 'watermark' && <WatermarkTab {...props} />}
        {tab === 'abroad' && <InternationalTab {...props} />}
        {tab === 'terms' && <TermsTab terms={draft.terms} setTerms={(terms) => { setDraft((d) => ({ ...d, terms })); setServerErrors({}) }} errors={errors} />}
        {meta.section && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto flex items-center gap-2 text-[13px] text-ink-2">
              <span className={dirty ? 'size-2 rounded-full bg-warn' : 'size-2 rounded-full bg-ok'} aria-hidden />
              {dirty ? 'Unsaved changes' : 'All changes saved'}
            </span>
            {dirty && <Button variant="ghost" onClick={discard}>Discard</Button>}
            <Button variant="primary" className="max-sm:h-[46px] max-sm:flex-1" loading={save.isPending} disabled={!dirty} onClick={submit}>
              {tab === 'payouts' ? 'Save and check' : 'Save changes'}
            </Button>
          </div>
        )}
      </div>
    </SideList>
  )
}
