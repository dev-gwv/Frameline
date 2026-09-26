import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, FileImage, Info, ShoppingBag, Trash2 } from 'lucide-react'
import type { WatermarkSettings } from '@frameline/shared'
import { Button, Card, cn, Field, IconTile, Segmented, Select, Skeleton, Tip, Toggle } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents } from '../../lib/queries'
import { AssetLibrary } from './AssetLibrary'
import { AssetMark, ORIGINAL_PRESETS, type AdvancedState, type OriginalsRule, type StoreRule } from './advanced'
import { PhotoFrame, SAMPLES } from './samples'

function Slider({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) {
  const id = `sl-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <Field htmlFor={id} label={<span className="flex justify-between"><span>{label}</span><span className="font-mono text-ink-3">{value}{unit}</span></span>}>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
    </Field>
  )
}

function RuleCard({ icon, title, body, enabled, onToggle, children }: { icon: ReactNode; title: string; body: string; enabled: boolean; onToggle: (v: boolean) => void; children: ReactNode }) {
  return (
    <Card className={cn(enabled && 'border-accent')}>
      <div className="flex items-start gap-3">
        <IconTile tone={enabled ? 'accent' : 'neutral'}>{icon}</IconTile>
        <div className="min-w-0 flex-1">
          <b className="text-[14px]">{title}</b>
          <div className="text-[12px] text-ink-2">{body}</div>
        </div>
        <Toggle label={title} checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && <div className="mt-4 animate-[fl-fade-in_150ms_ease-out]">{children}</div>}
    </Card>
  )
}

export function AdvancedRules({ state, setState, wm, persisted }: { state: AdvancedState; setState: (fn: (s: AdvancedState) => AdvancedState) => void; wm: WatermarkSettings; persisted: boolean }) {
  const o = state.originals
  const st = state.store
  const setO = (p: Partial<OriginalsRule>) => setState((s) => ({ ...s, originals: { ...s.originals, ...p } }))
  const setSt = (p: Partial<StoreRule>) => setState((s) => ({ ...s, store: { ...s.store, ...p } }))
  const originalsAsset = state.assets.find((a) => a.id === o.assetId)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-control bg-sunk px-3 py-2 text-[12px] text-ink-2">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>Rules apply on top of your simple watermark. Changes save automatically on this device{persisted ? '' : ' — but this browser’s storage is full, so they last for this session only'}.</span>
      </div>

      <RuleCard icon={<FileImage size={15} />} title="Originals" body="A separate mark for full-size files you upload as originals." enabled={o.enabled} onToggle={(enabled) => setO({ enabled })}>
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

      <RuleCard icon={<ShoppingBag size={15} />} title="Store “FOR SALE”" body="Photos for sale show this until a guest buys them. Bought files come clean." enabled={st.enabled} onToggle={(enabled) => setSt({ enabled })}>
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,300px)]">
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Layout">
                <Segmented stretch value={st.layout} onChange={(layout) => setSt({ layout })} options={[{ value: 'tiled', label: 'Pattern' }, { value: 'centre', label: 'Large centre' }]} />
              </Field>
              <Field label="Orientation">
                <Segmented stretch value={st.orientation} onChange={(orientation) => setSt({ orientation })} options={[{ value: 'diagonal', label: 'Diagonal' }, { value: 'horizontal', label: 'Straight' }]} />
              </Field>
              <Slider label="Size" value={st.scale} min={1} max={5} unit="×" onChange={(scale) => setSt({ scale })} />
              <Slider label="Opacity" value={st.opacity} min={10} max={90} step={5} unit="%" onChange={(opacity) => setSt({ opacity })} />
            </div>
            <Field label="Colour">
              <div className="flex gap-1.5">
                {['#FFFFFF', '#1B1712', '#E2B458', '#B23D2E'].map((c) => (
                  <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={st.color === c} onClick={() => setSt({ color: c })}
                    className={cn('size-8 rounded-full border border-line-2', st.color === c && 'outline-2 outline-offset-2 outline-accent')} style={{ background: c }} />
                ))}
              </div>
            </Field>
          </div>
          <div className="flex h-[210px] items-center justify-center rounded-control bg-sunk p-2">
            <PhotoFrame sample={SAMPLES[6]} fit="height"><ForSale rule={st} /></PhotoFrame>
          </div>
        </div>
      </RuleCard>

      <EventOverrides state={state} setState={setState} />

      <AssetLibrary
        assets={state.assets} studioName={wm.text}
        onAdd={(a) => setState((s) => ({ ...s, assets: [...s.assets, a] }))}
        onRemove={(id) => setState((s) => ({
          ...s,
          assets: s.assets.filter((a) => a.id !== id),
          originals: s.originals.assetId === id ? { ...s.originals, assetId: '' } : s.originals,
          overrides: Object.fromEntries(Object.entries(s.overrides).map(([k, v]) => [k, v === id ? '' : v])),
        }))}
      />
    </div>
  )
}

function ForSale({ rule }: { rule: StoreRule }) {
  const rot = rule.orientation === 'diagonal' ? 'rotate(-30deg)' : 'none'
  const common = { color: rule.color, opacity: rule.opacity / 100, fontWeight: 800, letterSpacing: '.12em', whiteSpace: 'nowrap' as const, fontFamily: 'Manrope, system-ui, sans-serif' }
  if (rule.layout === 'centre') {
    return <div className="absolute inset-0 grid place-items-center"><span style={{ ...common, fontSize: `${6 + rule.scale * 3}cqw`, transform: rot }}>FOR SALE</span></div>
  }
  const n = Math.max(2, 7 - rule.scale)
  return (
    <div className="absolute inset-[-30%] grid content-center" style={{ transform: rot, gridTemplateColumns: `repeat(${n},1fr)`, rowGap: `${4 + rule.scale * 2}cqw` }}>
      {Array.from({ length: n * n * 2 }, (_, i) => <span key={i} className="text-center" style={{ ...common, fontSize: `${2 + rule.scale * 1.3}cqw` }}>FOR SALE</span>)}
    </div>
  )
}

function EventOverrides({ state, setState }: { state: AdvancedState; setState: (fn: (s: AdvancedState) => AdvancedState) => void }) {
  const api = useApi()
  const events = useEvents()
  const [adding, setAdding] = useState('')
  const setOff = useAction(({ id, off }: { id: string; off: boolean }) => api.updateEventSettings(id, { watermarkOff: off }), {
    success: (_d, v) => (v.off ? 'Watermark turned off for this event' : 'Watermark back on for this event'),
  })
  const list = (events.data ?? []).filter((e) => e.settings.watermarkOff || e.id in state.overrides)
  const rest = (events.data ?? []).filter((e) => !list.includes(e))

  function choose(id: string, value: string, currentlyOff: boolean) {
    if (value === 'off') {
      if (!currentlyOff) setOff.mutate({ id, off: true })
      setState((s) => ({ ...s, overrides: { ...s.overrides, [id]: '' } }))
      return
    }
    if (currentlyOff) setOff.mutate({ id, off: false })
    setState((s) => ({ ...s, overrides: { ...s.overrides, [id]: value === 'default' ? '' : value } }))
  }
  function remove(id: string, currentlyOff: boolean) {
    if (currentlyOff) setOff.mutate({ id, off: false })
    setState((s) => { const { [id]: _drop, ...overrides } = s.overrides; void _drop; return { ...s, overrides } })
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <IconTile><CalendarDays size={15} /></IconTile>
        <div className="min-w-0 flex-1">
          <b className="text-[14px]">Per-event overrides</b>
          <div className="text-[12px] text-ink-2">Turn the watermark off for one event, or use a different mark there.</div>
        </div>
      </div>
      <div className="mt-3">
        {events.isLoading ? <Skeleton className="h-24" /> : list.length === 0 ? (
          <p className="rounded-control bg-sunk px-3 py-3 text-[12px] text-ink-2">Every event uses your studio watermark. Add an event below to change it just there.</p>
        ) : list.map((e) => {
          const off = e.settings.watermarkOff
          const value = off ? 'off' : state.overrides[e.id] || 'default'
          return (
            <div key={e.id} className="flex flex-wrap items-center gap-2 border-t border-line py-2.5 first:border-t-0">
              <div className="min-w-0 flex-1">
                <Link to={`/events/${e.id}/settings`} className="block truncate text-[13px] font-bold hover:underline">{e.name}</Link>
                <div className="text-[11.5px] text-ink-3">{off ? 'No watermark on this event' : state.overrides[e.id] ? 'Custom mark' : 'Studio default'}</div>
              </div>
              <Select aria-label={`Watermark for ${e.name}`} className="w-full sm:w-52" value={value} onChange={(ev) => choose(e.id, ev.target.value, off)}>
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
          <Button disabled={!adding} onClick={() => { setState((s) => ({ ...s, overrides: { ...s.overrides, [adding]: '' } })); setAdding('') }}>Add override</Button>
        </div>
      )}
    </Card>
  )
}
