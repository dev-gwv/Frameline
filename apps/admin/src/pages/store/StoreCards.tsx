import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Store as StoreIcon } from 'lucide-react'
import { fmt, STORE_COMMISSION, type Price } from '@frameline/shared'
import { Button, Card, CardHeader, DarkCard, EmptyState, Field, Input, Modal, Skeleton } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useAction, useCarts, useEvents, usePrices } from '../../lib/queries'
import { storeNow } from './revenue'
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

/** Abandoned carts (api.listCarts): guests who started paying but didn't finish. Reminders via api.remindCarts. */
export function CartsCard() {
  const api = useApi()
  const carts = useCarts()
  const [picked, setPicked] = useState<string[] | null>(null)
  const list = carts.data ?? []
  const selected = picked ?? list.filter((c) => !c.reminders).map((c) => c.orderId)
  const remind = useAction((ids: string[]) => api.remindCarts(ids), {
    success: (r) => `Reminder sent to ${r.reminded} ${r.reminded === 1 ? 'guest' : 'guests'}`,
    onSuccess: () => setPicked(null),
  })
  const toggle = (id: string) => setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const total = list.reduce((n, c) => n + c.amount, 0)
  return (
    <DarkCard>
      <div className="flex items-center gap-2 font-bold"><MessageCircle size={14} /> Carts to recover</div>
      {carts.isError ? <div className="mt-2 text-[12px] text-side-ink-2">Couldn’t load carts. {errorMessage(carts.error)} <button type="button" className="font-bold underline" onClick={() => carts.refetch()}>Try again</button></div>
        : carts.isLoading ? <Skeleton className="mt-2 h-20" />
        : !list.length ? <div className="mt-1 text-[12px] text-side-ink-2">No abandoned carts. Guests who add photos but don’t finish paying show up here after 30 minutes.</div>
        : <>
          <div className="mb-2 mt-1 text-[12px] text-side-ink-2">{list.length} {list.length === 1 ? 'guest' : 'guests'} left <span className="font-mono text-side-ink">{fmt.rupees(total)}</span> unpaid. Send a reminder with a link back to their cart.</div>
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {list.map((c) => {
              const on = selected.includes(c.orderId)
              return (
                <li key={c.orderId}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-control px-1.5 py-1.5 hover:bg-side-2">
                    <input type="checkbox" className="mt-0.5 size-4 accent-[var(--gold)]" checked={on} onChange={() => toggle(c.orderId)} aria-label={`Remind ${c.buyer}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-2 text-[12.5px] font-bold"><span className="truncate">{c.buyer}</span><span className="font-mono tnum">{fmt.rupees(c.amount)}</span></span>
                      <span className="block truncate text-[11px] text-side-ink-2">{c.items} · {c.eventName}</span>
                      <span className="block text-[11px] text-side-ink-2">Started {fmt.ago(c.startedAt, storeNow())}{c.reminders ? ` · reminded ${c.reminders}× (last ${fmt.ago(c.remindedAt ?? c.startedAt, storeNow())})` : ' · not reminded yet'}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <Button size="sm" variant="primary" className="mt-2" icon={<MessageCircle size={13} />} disabled={!selected.length} loading={remind.isPending} onClick={() => remind.mutate(selected)}>
            Send {selected.length ? `${selected.length} ` : ''}{selected.length === 1 ? 'reminder' : 'reminders'}
          </Button>
        </>}
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
