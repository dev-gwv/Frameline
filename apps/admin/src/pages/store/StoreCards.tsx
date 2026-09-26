import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Store as StoreIcon } from 'lucide-react'
import { fmt, STORE_COMMISSION, type Price } from '@frameline/shared'
import { Button, Card, CardHeader, DarkCard, EmptyState, Field, Input, Modal, Skeleton } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents, usePrices } from '../../lib/queries'
import { QueryError } from '../system'

/** Default store prices, saved with api.updatePrices (every selling event uses them). */
export function PricesCard() {
  const prices = usePrices()
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <CardHeader title="Default prices" action={<Button size="sm" variant="ghost" onClick={() => setOpen(true)} disabled={!prices.data}>Edit</Button>} />
      {prices.isError ? <QueryError error={prices.error} retry={() => prices.refetch()} />
        : prices.isLoading || !prices.data ? <Skeleton className="h-40" />
        : !prices.data.length ? <p className="py-3 text-[13px] text-ink-3">No prices set yet.</p>
        : prices.data.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 border-t border-line py-2">
            <div><div className="text-[13px] font-bold">{p.label}</div><div className="text-[11.5px] text-ink-3">{p.detail}</div></div>
            <span className="font-mono font-bold tnum">{fmt.rupees(p.price)}</span>
          </div>
        ))}
      <p className="mt-1 text-[11.5px] text-ink-3">Every event that sells uses these. Guests see prices incl. GST.</p>
      {prices.data && <EditPricesModal open={open} onOpenChange={setOpen} prices={prices.data} />}
    </Card>
  )
}

function EditPricesModal({ open, onOpenChange, prices }: { open: boolean; onOpenChange: (v: boolean) => void; prices: Price[] }) {
  const api = useApi()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const value = (p: Price) => draft[p.id] ?? String(p.price)
  const errors = Object.fromEntries(prices.map((p) => {
    const n = Number(value(p))
    return [p.id, !value(p) || !Number.isFinite(n) ? 'Enter a price in rupees' : n < 10 ? 'Minimum price is ₹10' : n > 100000 ? 'Maximum is ₹1,00,000' : '']
  }))
  const invalid = Object.values(errors).some(Boolean)
  const save = useAction((next: Price[]) => api.updatePrices(next), {
    success: 'Prices saved · new orders use them',
    onSuccess: () => { setDraft({}); onOpenChange(false) },
  })
  const keep = Math.round((1 - STORE_COMMISSION) * 100)
  return (
    <Modal open={open} onOpenChange={(v) => { if (!v) setDraft({}); onOpenChange(v) }} title="Edit default prices" description={`What guests pay, including GST. You receive ${keep}% (Frameline keeps ${Math.round(STORE_COMMISSION * 100)}% commission).`} width={480}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={invalid} loading={save.isPending} onClick={() => save.mutate(prices.map((p) => ({ ...p, price: Math.round(Number(value(p))) })))}>Save prices</Button></>}>
      <div className="flex flex-col gap-3 px-6 py-4">
        {prices.map((p) => (
          <Field key={p.id} label={p.label} hint={`${p.detail} · you receive ${fmt.rupees(Math.round((Number(value(p)) || 0) * (1 - STORE_COMMISSION)))}`} error={errors[p.id]} htmlFor={`price-${p.id}`}>
            <Input id={`price-${p.id}`} inputMode="numeric" icon={<span className="font-mono text-[13px]">₹</span>} value={value(p)}
              onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value.replace(/[^\d]/g, '') }))} className="font-mono" />
          </Field>
        ))}
      </div>
    </Modal>
  )
}

/**
 * Abandoned carts. The API doesn't track unpaid carts yet, so this card only explains the feature
 * (no invented counts, no fake reminders).
 */
export function CartsCard() {
  return (
    <DarkCard>
      <div className="flex items-center gap-2 font-bold"><MessageCircle size={14} /> Carts to recover</div>
      <div className="mt-1 text-[12px] text-side-ink-2">
        Coming soon: guests who add photos to their cart but don’t pay will be listed here, with a one-tap WhatsApp reminder that links back to their cart.
      </div>
    </DarkCard>
  )
}

export function SellFromEventModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const api = useApi()
  const navigate = useNavigate()
  const events = useEvents()
  const [picked, setPicked] = useState<string[]>([])
  const candidates = (events.data ?? []).filter((e) => !e.settings.storeEnabled && e.status !== 'archived')
  const selling = (events.data ?? []).filter((e) => e.settings.storeEnabled)
  const enable = useAction(async (ids: string[]) => { for (const id of ids) await api.updateEventSettings(id, { storeEnabled: true }) }, {
    success: (_, ids) => `Store on for ${ids.length} ${ids.length === 1 ? 'event' : 'events'}`,
    onSuccess: () => { setPicked([]); onOpenChange(false) },
  })
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Sell from an event" description="Guests of the events you pick can buy downloads and prints at your default prices." width={560}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={!picked.length} loading={enable.isPending} onClick={() => enable.mutate(picked)}>Turn on store{picked.length ? ` · ${picked.length}` : ''}</Button></>}>
      <div className="px-6 py-4">
        {events.isLoading ? <Skeleton className="h-40" /> : !candidates.length ? (
          <EmptyState icon={<StoreIcon size={22} />} title="Every event already sells" body="Create a new event and switch the store on in its settings." action={<Button onClick={() => navigate('/events')}>Go to events</Button>} />
        ) : (
          <div className="flex flex-col gap-1.5">
            {candidates.map((e) => {
              const on = picked.includes(e.id)
              return (
                <label key={e.id} className={`flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2 ${on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunk'}`}>
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={on} onChange={() => setPicked((l) => on ? l.filter((x) => x !== e.id) : [...l, e.id])} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold">{e.name}</div>
                    <div className="text-[11.5px] text-ink-3"><span className="font-mono">{e.shortId}</span> · {fmt.date(e.date)} · {fmt.count(e.photoCount)} photos</div>
                  </div>
                </label>
              )
            })}
          </div>
        )}
        {!!selling.length && <p className="mt-3 text-[12px] text-ink-3">Already selling: {selling.map((e) => e.name).join(', ')}.</p>}
      </div>
    </Modal>
  )
}
