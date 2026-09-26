import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, FileImage, Info, ShoppingBag, Trash2 } from 'lucide-react'
import type { StoreSettings, WatermarkSettings } from '@frameline/shared'
import { Button, Card, Chip, cn, Field, IconTile, Input, Segmented, Select, Skeleton, Tip, Toggle } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents, useStoreSettings } from '../../lib/queries'
import { QueryError } from '../system'
import { AssetLibrary } from './AssetLibrary'
import { AssetMark, ORIGINAL_PRESETS, type AdvancedState, type OriginalsRule } from './advanced'
import { PhotoFrame, SAMPLES } from './samples'

function Slider({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) {
  const id = `sl-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <Field htmlFor={id} label={<span className="flex justify-between"><span>{label}</span><span className="font-mono text-ink-3">{value}{unit}</span></span>}>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
    </Field>
  )
}

function RuleCard({ icon, title, body, enabled, onToggle, badge, children }: {
  icon: ReactNode; title: string; body: string; enabled: boolean; onToggle?: (v: boolean) => void; badge?: ReactNode; children: ReactNode
}) {
  return (
    <Card className={cn(enabled && 'border-accent')}>
      <div className="flex items-start gap-3">
        <IconTile tone={enabled ? 'accent' : 'neutral'}>{icon}</IconTile>
        <div className="min-w-0 flex-1">
          <b className="text-[14px]">{title}</b>
          <div className="text-[12px] text-ink-2">{body}</div>
        </div>
        {badge}
        {onToggle && <Toggle label={title} checked={enabled} onCheckedChange={onToggle} />}
      </div>
      {enabled && <div className="mt-4 animate-[fl-fade-in_150ms_ease-out]">{children}</div>}
    </Card>
  )
}

export function AdvancedRules({ state, setState, wm, persisted, focusEventId }: {
  state: AdvancedState
  setState: (fn: (s: AdvancedState) => AdvancedState) => void
  wm: WatermarkSettings
  persisted: boolean
  /** From ?event=<id>: that event's override is listed and highlighted. */
  focusEventId?: string
}) {
  const o = state.originals
  const setO = (p: Partial<OriginalsRule>) => setState((s) => ({ ...s, originals: { ...s.originals, ...p } }))
  const originalsAsset = state.assets.find((a) => a.id === o.assetId)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-control bg-sunk px-3 py-2 text-[12px] text-ink-2">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Rules apply on top of your simple watermark and save automatically. The store mark and “No watermark” per event are saved to your
          account; the originals mark, custom per-event marks and assets are kept on this device for now
          {persisted ? '' : ' — and this browser’s storage is full, so they last for this session only'}.
        </span>
      </div>

      <RuleCard icon={<FileImage size={15} />} title="Originals" body="A separate mark for full-size files you upload as originals. Kept on this device for now." enabled={o.enabled} onToggle={(enabled) => setO({ enabled })}>
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,300px)]">
          <div className="flex flex-col gap-3">
            <Field label="Mark" htmlFor="or-asset" hint={state.assets.length ? undefined : 'Add a logo or text mark under Assets to use it here.'}>
              <Select id="or-asset" value={o.assetId} onChange={(e) => setO({ assetId: e.target.value })}>
                <option value="">Studio name ({wm.text || 'not set'})</option>
                {state.assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <div>
              <div className="mb-1.5 text-[12px] font-bold text-ink-2">Quick presets</div>
              <div className="flex flex-wrap gap-1.5">
                {ORIGINAL_PRESETS.map((p) => {
                  const on = p.x === o.x && p.y === o.y && p.size === o.size
                  return <Button key={p.label} size="sm" variant={on ? 'dark' : 'secondary'} onClick={() => setO({ x: p.x, y: p.y, size: p.size })}>{p.label}</Button>
                })}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Slider label="From left (X)" value={o.x} min={0} max={100} unit="%" onChange={(x) => setO({ x })} />
              <Slider label="From top (Y)" value={o.y} min={0} max={100} unit="%" onChange={(y) => setO({ y })} />
              <Slider label="Size" value={o.size} min={5} max={80} unit="% of width" onChange={(size) => setO({ size })} />
              <Slider label="Opacity" value={o.opacity} min={10} max={100} step={5} unit="%" onChange={(opacity) => setO({ opacity })} />
            </div>
          </div>
          <div className="flex h-[210px] items-center justify-center rounded-control bg-sunk p-2">
            <PhotoFrame sample={SAMPLES[3]} fit="width">
              <div className="absolute" style={{ left: `${o.x}%`, top: `${o.y}%`, transform: 'translate(-50%,-50%)', opacity: o.opacity / 100 }}>
                <AssetMark asset={originalsAsset} fallbackText={wm.text || 'Your studio'} fallbackFont={wm.font} width={o.size} />
              </div>
            </PhotoFrame>
          </div>
        </div>
      </RuleCard>

      <StoreRuleCard />

      <EventOverrides state={state} setState={setState} focusEventId={focusEventId} />

      <AssetLibrary
        assets={state.assets} studioName={wm.text}
        onAdd={(a) => setState((s) => ({ ...s, assets: [...s.assets, a] }))}
        onRemove={(id) => setState((s) => ({
          ...s,
          assets: s.assets.filter((a) => a.id !== id),
          originals: s.originals.assetId === id ? { ...s.originals, assetId: '' } : s.originals,
          overrides: Object.fromEntries(Object.entries(s.overrides).filter(([, v]) => v !== id)),
        }))}
      />
    </div>
  )
}

type SaleMark = StoreSettings['saleWatermark']

/** The store's "FOR SALE" mark is StoreSettings.saleWatermark (also editable in Store settings); edits save after a short pause. */
function StoreRuleCard() {
  const api = useApi()
  const settings = useStoreSettings()
  const [draft, setDraft] = useState<SaleMark>()
  const saved = useRef('')
  const save = useAction((w: SaleMark) => api.updateStoreSettings({ saleWatermark: w }), { error: 'Couldn’t save the store mark' })

  useEffect(() => {
    if (!settings.data) return
    const next = JSON.stringify(settings.data.saleWatermark)
    if (next !== saved.current) { saved.current = next; setDraft(settings.data.saleWatermark) }
  }, [settings.data])
  useEffect(() => {
    if (!draft || JSON.stringify(draft) === saved.current) return
    const t = setTimeout(() => { saved.current = JSON.stringify(draft); save.mutate(draft) }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const set = (p: Partial<SaleMark>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const badge = save.isPending ? <span className="self-center text-[11.5px] text-ink-3">Saving…</span> : <Chip tone="ok" dot>Always on</Chip>

  return (
    <RuleCard icon={<ShoppingBag size={15} />} title="Store “FOR SALE”" enabled badge={badge}
      body="Photos for sale show this until a guest buys them. Bought files come clean. Same setting as in Store settings.">
      {settings.error ? <QueryError error={settings.error} retry={() => settings.refetch()} /> : !draft ? <Skeleton className="h-[210px]" /> : (
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,300px)]">
          <div className="flex flex-col gap-3">
            <Field label="Text" htmlFor="sale-text">
              <Input id="sale-text" value={draft.text} maxLength={40} placeholder="FOR SALE" onChange={(e) => set({ text: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Layout">
                <Segmented stretch value={draft.template} onChange={(template) => set({ template })} options={[{ value: 'forsale', label: 'Pattern' }, { value: 'centre', label: 'Large centre' }]} />
              </Field>
              <Field label="Orientation">
                <Segmented stretch value={draft.orientation} onChange={(orientation) => set({ orientation })}
                  options={[{ value: 'diagonal', label: 'Diagonal' }, { value: 'horizontal', label: 'Straight' }, { value: 'vertical', label: 'Upright' }]} />
              </Field>
              <Slider label="Size" value={draft.size} min={1} max={5} unit="×" onChange={(size) => set({ size })} />
              <Slider label="Opacity" value={draft.opacity} min={10} max={90} step={5} unit="%" onChange={(opacity) => set({ opacity })} />
            </div>
            <Field label="Colour">
              <div className="flex gap-1.5">
                {['#FFFFFF', '#1B1712', '#E2B458', '#B23D2E'].map((c) => {
                  const on = draft.color.toUpperCase() === c
                  return (
                    <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={on} onClick={() => set({ color: c })}
                      className={cn('size-8 rounded-full border border-line-2', on && 'outline-2 outline-offset-2 outline-accent')} style={{ background: c }} />
                  )
                })}
              </div>
            </Field>
          </div>
          <div className="flex h-[210px] items-center justify-center rounded-control bg-sunk p-2">
            <PhotoFrame sample={SAMPLES[6]} fit="height"><ForSale mark={draft} /></PhotoFrame>
          </div>
        </div>
      )}
    </RuleCard>
  )
}

function ForSale({ mark }: { mark: SaleMark }) {
  const rot = mark.orientation === 'diagonal' ? 'rotate(-30deg)' : mark.orientation === 'vertical' ? 'rotate(-90deg)' : 'none'
  const text = mark.text.trim() || 'FOR SALE'
  const common = { color: mark.color, opacity: mark.opacity / 100, fontWeight: 800, letterSpacing: '.12em', whiteSpace: 'nowrap' as const, fontFamily: 'Manrope, system-ui, sans-serif' }
  if (mark.template === 'centre') {
    return <div className="absolute inset-0 grid place-items-center overflow-hidden"><span style={{ ...common, fontSize: `${6 + mark.size * 3}cqw`, transform: rot }}>{text}</span></div>
  }
  const n = Math.max(2, 7 - mark.size)
  return (
    <div className="absolute inset-[-30%] grid content-center" style={{ transform: rot, gridTemplateColumns: `repeat(${n},1fr)`, rowGap: `${4 + mark.size * 2}cqw` }}>
      {Array.from({ length: n * n * 2 }, (_, i) => <span key={i} className="text-center" style={{ ...common, fontSize: `${2 + mark.size * 1.3}cqw` }}>{text}</span>)}
    </div>
  )
}

/**
 * Listed events: any with the watermark off (EventSettings.watermarkOff, on the API), any with a custom
 * mark (this device), ones added in this visit, and the ?event=<id> one.
 */
function EventOverrides({ state, setState, focusEventId }: { state: AdvancedState; setState: (fn: (s: AdvancedState) => AdvancedState) => void; focusEventId?: string }) {
  const api = useApi()
  const events = useEvents()
  const [adding, setAdding] = useState('')
  const [added, setAdded] = useState<string[]>(() => (focusEventId ? [focusEventId] : []))
  const focusRef = useRef<HTMLDivElement>(null)
  const setOff = useAction(({ id, off }: { id: string; off: boolean }) => api.updateEventSettings(id, { watermarkOff: off }), {
    success: (_d, v) => (v.off ? 'Watermark turned off for this event' : 'Watermark back on for this event'),
  })

  useEffect(() => { if (focusEventId) setAdded((a) => (a.includes(focusEventId) ? a : [...a, focusEventId])) }, [focusEventId])
  const loaded = !!events.data
  useEffect(() => { if (loaded && focusEventId) focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [loaded, focusEventId])

  const list = (events.data ?? []).filter((e) => e.settings.watermarkOff || !!state.overrides[e.id] || added.includes(e.id))
  const rest = (events.data ?? []).filter((e) => !list.includes(e))
  const dropCustom = (id: string) => setState((s) => { const { [id]: _drop, ...overrides } = s.overrides; void _drop; return { ...s, overrides } })

  function choose(id: string, value: string, currentlyOff: boolean) {
    if (value === 'off') {
      if (!currentlyOff) setOff.mutate({ id, off: true })
      dropCustom(id)
      return
    }
    if (currentlyOff) setOff.mutate({ id, off: false })
    if (value === 'default') dropCustom(id)
    else setState((s) => ({ ...s, overrides: { ...s.overrides, [id]: value } }))
  }
  function remove(id: string, currentlyOff: boolean) {
    if (currentlyOff) setOff.mutate({ id, off: false })
    dropCustom(id)
    setAdded((a) => a.filter((x) => x !== id))
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <IconTile><CalendarDays size={15} /></IconTile>
        <div className="min-w-0 flex-1">
          <b className="text-[14px]">Per-event overrides</b>
          <div className="text-[12px] text-ink-2">Turn the watermark off for one event (saved on the event), or use a different mark there (this device only for now).</div>
        </div>
      </div>
      <div className="mt-3">
        {events.error ? <QueryError error={events.error} retry={() => events.refetch()} /> : !events.data ? <Skeleton className="h-24" /> : list.length === 0 ? (
          <p className="rounded-control bg-sunk px-3 py-3 text-[12px] text-ink-2">Every event uses your studio watermark. Add an event below to change it just there.</p>
        ) : list.map((e) => {
          const off = e.settings.watermarkOff
          const custom = state.overrides[e.id]
          const value = off ? 'off' : custom || 'default'
          const focused = e.id === focusEventId
          return (
            <div key={e.id} ref={focused ? focusRef : undefined}
              className={cn('flex flex-wrap items-center gap-2 border-t border-line py-2.5 first:border-t-0', focused && 'rounded-control bg-accent-soft px-2')}>
              <div className="min-w-0 flex-1">
                <Link to={`/events/${e.id}/settings`} className="block truncate text-[13px] font-bold hover:underline">{e.name}</Link>
                <div className="text-[11.5px] text-ink-3">{off ? 'No watermark on this event' : custom ? 'Custom mark (this device)' : 'Studio default'}</div>
              </div>
              <Select aria-label={`Watermark for ${e.name}`} className="w-full sm:w-52" value={value} disabled={setOff.isPending} onChange={(ev) => choose(e.id, ev.target.value, off)}>
                <option value="default">Studio default</option>
                <option value="off">No watermark</option>
                {state.assets.map((a) => <option key={a.id} value={a.id}>Use {a.name}</option>)}
              </Select>
              <Tip label="Remove override">
                <button type="button" aria-label={`Remove override for ${e.name}`} onClick={() => remove(e.id, off)} className="rounded-md p-1.5 text-ink-3 hover:bg-sunk hover:text-ink"><Trash2 size={14} /></button>
              </Tip>
            </div>
          )
        })}
      </div>
      {rest.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Select aria-label="Choose an event" className="min-w-0 flex-1" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Choose an event…</option>
            {rest.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          <Button disabled={!adding} onClick={() => { setAdded((a) => [...a, adding]); setAdding('') }}>Add override</Button>
        </div>
      )}
    </Card>
  )
}
