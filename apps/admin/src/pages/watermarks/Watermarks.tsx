import { useEffect, useRef, useState } from 'react'
import { useBlocker, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import type { WatermarkSettings } from '@frameline/shared'
import { Button, Chip, cn, Modal, Page, Skeleton } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useWatermark } from '../../lib/queries'
import { QueryError } from '../system'
import { useLocalState, useWatermarkFonts, type WmDraft } from './lib'
import { SimpleSettings } from './SimpleSettings'
import { PreviewPanel } from './PreviewPanel'
import { AdvancedRules } from './AdvancedRules'
import { ADVANCED_KEY, DEFAULT_ADVANCED, type AdvancedState } from './advanced'

const same = (a?: WmDraft, b?: WmDraft) => JSON.stringify(a) === JSON.stringify(b)

export default function Watermarks() {
  useWatermarkFonts()
  const api = useApi()
  const qc = useQueryClient()
  const query = useWatermark()
  const [params, setParams] = useSearchParams()
  // ?event=<id> (from event settings) or ?mode=advanced opens the advanced section.
  const focusEventId = params.get('event') ?? undefined
  const advancedOpen = params.get('mode') === 'advanced' || !!focusEventId
  const toggleAdvanced = () => setParams((p) => {
    if (advancedOpen) { p.delete('mode'); p.delete('event') } else p.set('mode', 'advanced')
    return p
  }, { replace: true })

  const [advanced, setAdvanced, advancedPersisted] = useLocalState<AdvancedState>(ADVANCED_KEY, DEFAULT_ADVANCED)
  const [base, setBase] = useState<WmDraft>()
  const [draft, setDraft] = useState<WmDraft>()

  useEffect(() => {
    if (query.data && !base) { const d = query.data; setBase(d); setDraft(d) }
  }, [query.data, base])

  const dirty = !!draft && !!base && !same(draft, base)
  const invalid = !!draft && (draft.mode === 'text' ? !draft.text.trim() : !draft.logoUrl)

  const save = useAction((w: WatermarkSettings) => api.updateWatermark(w), {
    success: 'Watermark saved',
    onSuccess: (data) => {
      qc.setQueryData(['watermark'], data)
      const d = data
      setBase(d); setDraft(d)
    },
  })
  const doSave = () => { if (draft && !invalid) return save.mutateAsync(draft) }

  // Leaving with unsaved changes: "Save or discard?"
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])
  const leaving = blocker.state === 'blocked'
  const leaveSaving = useRef(false)

  return (
    <Page
      title="Watermark"
      subtitle="Added to photos when you upload with “Add my watermark” on."
      actions={<>
        {dirty && <Chip tone="warn">Unsaved changes</Chip>}
        {dirty && <Button variant="ghost" onClick={() => setDraft(base)}>Discard</Button>}
        <Button variant="primary" disabled={!dirty || invalid} loading={save.isPending} onClick={() => void doSave()}>Save</Button>
      </>}
    >
      {query.isError ? <QueryError error={query.error} retry={() => query.refetch()} /> : !draft ? (
        <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
          <Skeleton className="h-[300px] sm:h-[520px]" />
        </div>
      ) : (
        <>
          <div className="grid items-start gap-5 lg:grid-cols-[420px_1fr]">
            <div className="flex min-w-0 flex-col gap-3">
              <SimpleSettings wm={draft} onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))} />
              {draft.mode === 'logo' && !draft.logoUrl && <p className="px-1 text-[12px] font-semibold text-bad">Upload your logo, or switch back to “My name”, before saving.</p>}
            </div>
            <div className="min-w-0 lg:sticky lg:top-[72px]"><PreviewPanel wm={draft} /></div>
          </div>

          <button type="button" aria-expanded={advancedOpen} onClick={toggleAdvanced}
            className="mt-5 flex min-h-[40px] items-center gap-1.5 rounded-control text-left text-[13.5px] font-bold text-accent-text hover:underline">
            Advanced: different marks for originals, sale photos and events
            <ChevronDown size={14} className={cn('shrink-0 transition-transform', advancedOpen && 'rotate-180')} />
          </button>
          {advancedOpen && (
            <div className="mt-2 animate-[fl-fade-in_150ms_ease-out]">
              <AdvancedRules state={advanced} setState={setAdvanced} wm={draft} persisted={advancedPersisted} focusEventId={focusEventId} />
            </div>
          )}
        </>
      )}

      <Modal
        open={leaving} width={460}
        onOpenChange={(v) => { if (!v && blocker.state === 'blocked' && !leaveSaving.current) blocker.reset() }}
        title="Save or discard?"
        footer={<>
          <Button variant="ghost" onClick={() => blocker.state === 'blocked' && blocker.reset()}>Keep editing</Button>
          <Button onClick={() => blocker.state === 'blocked' && blocker.proceed()}>Discard changes</Button>
          <Button variant="primary" disabled={invalid} loading={save.isPending} onClick={async () => {
            leaveSaving.current = true
            try { await doSave(); if (blocker.state === 'blocked') blocker.proceed() } catch { /* toast shown */ } finally { leaveSaving.current = false }
          }}>Save and leave</Button>
        </>}
      >
        <p className="text-[14px] text-ink-2">
          Your watermark changes aren’t saved yet. Save them for your next uploads, or discard them and leave.
          {invalid && <span className="mt-2 block font-semibold text-bad">{draft?.mode === 'logo' ? 'Upload your logo first to save.' : 'Type your studio name first to save.'}</span>}
        </p>
      </Modal>
    </Page>
  )
}
