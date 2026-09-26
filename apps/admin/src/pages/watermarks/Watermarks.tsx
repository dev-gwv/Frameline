import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBlocker, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Settings2, Stamp } from 'lucide-react'
import type { WatermarkSettings } from '@frameline/shared'
import { Button, Chip, cn, ConfirmDialog, PageHeader, Skeleton } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents, useWatermark } from '../../lib/queries'
import { QueryError } from '../system'
import { useLocalState, useWatermarkFonts } from './lib'
import { SimpleSettings } from './SimpleSettings'
import { PreviewPanel } from './PreviewPanel'
import { AdvancedRules } from './AdvancedRules'
import { ADVANCED_KEY, DEFAULT_ADVANCED, localRuleCount, type AdvancedState } from './advanced'

function ModeCard({ selected, icon, title, body, badge, onClick }: { selected: boolean; icon: ReactNode; title: string; body: string; badge: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={selected}
      className={cn('flex items-center gap-3 rounded-card border bg-surface px-4 py-3 text-left transition',
        selected ? 'border-[1.5px] border-accent bg-gradient-to-r from-accent-soft to-surface' : 'border-line hover:border-line-2')}
    >
      <span className={cn('grid size-[30px] shrink-0 place-items-center rounded-control', selected ? 'bg-accent-soft text-accent-text' : 'bg-sunk text-ink-2')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <b className="block text-[14px]">{title}</b>
        <span className="block text-[12px] text-ink-2">{body}</span>
      </span>
      {badge}
    </button>
  )
}

export default function Watermarks() {
  useWatermarkFonts()
  const api = useApi()
  const qc = useQueryClient()
  const query = useWatermark()
  const [params, setParams] = useSearchParams()
  const events = useEvents()
  // ?event=<id> (from event settings) opens Advanced with that event's override highlighted.
  const focusEventId = params.get('event') ?? undefined
  const mode = params.get('mode') === 'advanced' || focusEventId ? 'advanced' : 'simple'
  const setMode = (m: 'simple' | 'advanced') => setParams((p) => { if (m === 'advanced') p.set('mode', 'advanced'); else { p.delete('mode'); p.delete('event') } return p }, { replace: true })

  const [advanced, setAdvanced, advancedPersisted] = useLocalState<AdvancedState>(ADVANCED_KEY, DEFAULT_ADVANCED)
  const [draft, setDraft] = useState<WatermarkSettings>()

  useEffect(() => { if (query.data && !draft) setDraft(query.data) }, [query.data, draft])

  const dirty = !!draft && !!query.data && JSON.stringify(draft) !== JSON.stringify(query.data)
  const invalid = !!draft && (draft.mode === 'text' ? !draft.text.trim() : !draft.logoUrl)

  const save = useAction((w: WatermarkSettings) => api.updateWatermark(w), {
    success: 'Saved',
    onSuccess: (data) => {
      qc.setQueryData(['watermark'], data)
      setDraft(data)
    },
  })

  // Ask before leaving with unsaved changes.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  const proceeding = useRef(false)
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  // Store mark is always on; plus local rules and events with the watermark turned off.
  const rules = 1 + localRuleCount(advanced) + (events.data ?? []).filter((e) => e.settings.watermarkOff && !advanced.overrides[e.id]).length

  return (
    <div className="pb-10">
      <PageHeader
        title="Watermarks"
        subtitle="Your name on every photo guests see. Set it once; new uploads use it automatically."
        actions={mode === 'simple' ? <>
          {dirty && <Chip tone="warn" dot>Unsaved changes</Chip>}
          {!dirty && draft && <span className="text-[12px] text-ink-3">All changes saved</span>}
          <Button variant="primary" disabled={!dirty || invalid} loading={save.isPending} onClick={() => draft && save.mutate(draft)}>Save changes</Button>
        </> : <span className="text-[12px] text-ink-3">Rules save automatically</span>}
      />

      <div className="flex flex-col gap-3 px-4 sm:px-7">
        <div className="grid gap-3 md:grid-cols-2">
          <ModeCard
            selected={mode === 'simple'} onClick={() => setMode('simple')} icon={<Stamp size={15} />} title="Simple watermark"
            body="Added when photos are uploaded. Right for most studios."
            badge={<Chip tone="accent" dot>In use</Chip>}
          />
          <ModeCard
            selected={mode === 'advanced'} onClick={() => setMode('advanced')} icon={<Settings2 size={15} />} title="Advanced rules"
            body="Different marks for originals, store previews or single events."
            badge={rules > 0 ? <Chip tone="ok" dot>{rules} {rules === 1 ? 'rule' : 'rules'}</Chip> : <span className="inline-flex h-7 items-center rounded-[7px] border border-line-2 bg-surface px-2.5 text-[12px] font-bold">Set up</span>}
          />
        </div>

        {query.isError ? <QueryError error={query.error} retry={() => query.refetch()} /> : !draft ? (
          <div className="grid gap-4 lg:grid-cols-[330px_1fr]">
            <div className="flex flex-col gap-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>
            <Skeleton className="h-[520px]" />
          </div>
        ) : mode === 'simple' ? (
          <div className="grid items-start gap-4 lg:grid-cols-[330px_1fr]">
            <div className="flex flex-col gap-2">
              <SimpleSettings wm={draft} onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))} />
              {draft.mode === 'logo' && !draft.logoUrl && <p className="px-1 text-[11.5px] font-semibold text-bad">Upload your logo, or switch back to “Your name”, before saving.</p>}
            </div>
            <div className="lg:sticky lg:top-4"><PreviewPanel wm={draft} /></div>
          </div>
        ) : (
          <AdvancedRules state={advanced} setState={setAdvanced} wm={draft} persisted={advancedPersisted} focusEventId={focusEventId} />
        )}
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(v) => { if (!v && !proceeding.current && blocker.state === 'blocked') blocker.reset(); proceeding.current = false }}
        title="Leave without saving?" confirmLabel="Leave without saving" danger
        body="Your watermark changes aren’t saved yet. Stay and press Save changes, or leave and lose them."
        onConfirm={() => { proceeding.current = true; if (blocker.state === 'blocked') blocker.proceed() }}
      />
    </div>
  )
}
