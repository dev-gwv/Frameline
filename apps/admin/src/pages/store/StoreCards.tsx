import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, MessageCircle, Store as StoreIcon } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Button, Card, CardHeader, DarkCard, EmptyState, Field, Input, Modal, Skeleton, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents, usePrices } from '../../lib/queries'
import { useLocalState } from '../wallet/lib'

type Price = { id: string; label: string; detail: string; price: number }
export const PRICES_KEY = 'frameline.prices'

/** Prices from the API with local overrides. The API has no updatePrices yet, so edits live in localStorage. */
export function useEffectivePrices() {
  const q = usePrices()
  const [overrides, setOverrides] = useLocalState<Record<string, number>>(PRICES_KEY, {})
  const prices = useMemo(() => q.data?.map((p) => ({ ...p, price: overrides[p.id] ?? p.price })), [q.data, overrides])
  return { ...q, prices, setOverrides }
}

export function PricesCard() {
  const { prices, isLoading, setOverrides } = useEffectivePrices()
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <CardHeader title="Default prices" action={<Button size="sm" variant="ghost" onClick={() => setOpen(true)} disabled={!prices}>Edit</Button>} />
      {isLoading || !prices ? <Skeleton className="h-40" /> : prices.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 border-t border-line py-2">
          <div><div className="text-[13px] font-bold">{p.label}</div><div className="text-[11.5px] text-ink-3">{p.detail}</div></div>
          <span className="font-mono font-bold tnum">{fmt.rupees(p.price)}</span>
        </div>
      ))}
      <p className="mt-1 text-[11.5px] text-ink-3">Every event that sells uses these. Guests see prices incl. GST.</p>
      {prices && <EditPricesModal open={open} onOpenChange={setOpen} prices={prices} onSave={(map) => setOverrides(map)} />}
    </Card>
  )
}

function EditPricesModal({ open, onOpenChange, prices, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; prices: Price[]; onSave: (m: Record<string, number>) => void }) {
  const toast = useToast()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const value = (p: Price) => draft[p.id] ?? String(p.price)
  const errors = Object.fromEntries(prices.map((p) => {
    const n = Number(value(p))
    return [p.id, !value(p) || !Number.isFinite(n) ? 'Enter a price in rupees' : n < 10 ? 'Minimum price is ₹10' : n > 100000 ? 'Maximum is ₹1,00,000' : '']
  }))
  const invalid = Object.values(errors).some(Boolean)
  const save = () => {
    onSave(Object.fromEntries(prices.map((p) => [p.id, Math.round(Number(value(p)))])))
    toast.success('Prices saved', 'New orders use these prices.')
    setDraft({}); onOpenChange(false)
  }
  return (
    <Modal open={open} onOpenChange={(v) => { if (!v) setDraft({}); onOpenChange(v) }} title="Edit default prices" description="What guests pay, including GST. You receive the price minus 10% commission." width={480}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={invalid} onClick={save}>Save prices</Button></>}>
      <div className="flex flex-col gap-3 px-6 py-4">
        {prices.map((p) => (
          <Field key={p.id} label={p.label} hint={`${p.detail} · you receive ${fmt.rupees(Math.round((Number(value(p)) || 0) * 0.9))}`} error={errors[p.id]} htmlFor={`price-${p.id}`}>
            <Input id={`price-${p.id}`} inputMode="numeric" icon={<span className="font-mono text-[13px]">₹</span>} value={value(p)}
              onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value.replace(/[^\d]/g, '') }))} className="font-mono" />
          </Field>
        ))}
        <p className="text-[11.5px] text-ink-3">Saved in this browser for now; prices sync to all devices once the store API supports editing.</p>
      </div>
    </Modal>
  )
}

export function CartsCard({ count }: { count: number }) {
  const toast = useToast()
  const [sent, setSent] = useLocalState<string | null>('frameline.carts.remindedAt', null)
  const left = sent ? 0 : count
  return (
    <DarkCard>
      <div className="font-bold">{left ? `${left} carts to recover` : 'All carts reminded'}</div>
      <div className="mb-2.5 mt-1 text-[12px] text-side-ink-2">
        {left ? 'Guests who added photos but didn’t pay. Send a reminder on WhatsApp.' : `Reminders sent ${fmt.ago(sent!)}. New abandoned carts show up here.`}
      </div>
      {left ? (
        <Button size="sm" variant="primary" icon={<MessageCircle size={13} />} onClick={() => { setSent(new Date().toISOString()); toast.success(`Reminders sent to ${count} guests`, 'They get a WhatsApp message with a link back to their cart.') }}>Send reminders</Button>
      ) : (
        <Button size="sm" variant="side" icon={<Check size={13} />} onClick={() => setSent(null)}>Undo</Button>
      )}
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
