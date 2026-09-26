import { useEffect, useState } from 'react'
import { DEMO_NOW, fmt, PACKS, type Plan, type Usage } from '@frameline/shared'
import { Button, Field, Modal, Select, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents } from '../../lib/queries'
import { round2 } from '../wallet/lib'
import { usePurchases } from '../wallet/purchases'
import { PayMethods, type PayWith } from './PlanModals'
import { GST_RATE, priceFor, type Period } from './usePlanState'

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <>
    <span className={strong ? 'border-t border-line pt-1.5 font-bold' : 'text-ink-2'}>{label}</span>
    <span className={`text-right font-mono tnum ${strong ? 'border-t border-line pt-1.5 font-bold' : ''}`}>{value}</span>
  </>
)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Upgrade (or switch period) checkout. The mock API has no plan endpoint, so the new plan is kept locally. */
export function UpgradeModal({ target, period, usage, current, onClose, onDone }: {
  target: Plan | null; period: Period; usage: Usage; current: Plan; onClose: () => void
  onDone: (planId: Plan['id'], period: Period, validTill: string) => void
}) {
  const toast = useToast()
  const { add } = usePurchases()
  const [pay, setPay] = useState<PayWith>('upi')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (target) setPay('upi') }, [target])
  if (!target) return null

  const samePeriod = period === usage.period
  const daysLeft = Math.max(0, fmt.daysUntil(usage.validTill, DEMO_NOW))
  const periodDays = usage.period === 'yearly' ? 365 : 91
  const fraction = Math.min(1, daysLeft / periodDays)
  const newPrice = priceFor(target, period)
  const credit = samePeriod ? round2(priceFor(current, usage.period) * fraction) : 0
  const base = samePeriod ? round2(newPrice * fraction) : newPrice
  const subtotal = Math.max(0, round2(base - credit))
  const gst = round2(subtotal * GST_RATE)
  const total = round2(subtotal + gst)
  const validTill = samePeriod ? usage.validTill : new Date(DEMO_NOW + (period === 'yearly' ? 365 : 91) * 86_400_000).toISOString()

  const confirm = async () => {
    setBusy(true)
    await wait(900)
    add({ item: `${target.name} ${period}${samePeriod ? ' · upgrade (prorated)' : ''}`, kind: 'plan', amount: subtotal, gst, paidWith: pay === 'upi' ? 'UPI' : 'Card' })
    onDone(target.id, period, validTill)
    setBusy(false)
    toast.success(`You’re on ${target.name} now`, `${fmt.count(target.photos)} photos a year, valid till ${fmt.date(validTill)}. Receipt is in Orders & wallet → Invoices.`)
    onClose()
  }

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={`Upgrade to ${target.name}`} description={`${fmt.count(target.photos)} photos a year · ${target.seats} team seats`} width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={confirm}>Pay {fmt.rupees(total, true)}</Button></>}>
      <div className="flex flex-col gap-4 px-6 py-4 text-[13px]">
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
          <Row label={`${target.name} · ${period}`} value={fmt.rupees(newPrice)} />
          {samePeriod && <Row label={`For the ${daysLeft} days left in your plan`} value={fmt.rupees(base, true)} />}
          {samePeriod && <Row label={`Unused ${current.name} credit`} value={`− ${fmt.rupees(credit, true)}`} />}
          <Row label="GST 18%" value={fmt.rupees(gst, true)} />
          <Row label="Total today" value={fmt.rupees(total, true)} strong />
        </div>
        <p className="text-[12px] text-ink-3">
          {samePeriod ? `Your renewal date stays ${fmt.date(usage.validTill)}. Extra capacity is available right away.` : `Switching to ${period} billing starts a new period today, valid till ${fmt.date(validTill)}.`}
        </p>
        <PayMethods value={pay} onChange={setPay} />
      </div>
    </Modal>
  )
}

/** Buy a one-off event pack for one event. Pays from wallet credits when there are enough. */
export function PackModal({ pack, credits, onClose }: { pack: (typeof PACKS)[number] | null; credits: number; onClose: () => void }) {
  const api = useApi()
  const events = useEvents()
  const { add } = usePurchases()
  const [eventId, setEventId] = useState('')
  const [pay, setPay] = useState<PayWith>('card')
  const price = pack?.price ?? 0
  const total = round2(price * (1 + GST_RATE))
  useEffect(() => {
    if (!pack) return
    setPay(credits >= total ? 'credits' : 'card')
    setEventId(events.data?.find((e) => e.status === 'expiring' || e.photoCount / e.photoLimit > 0.6)?.id ?? events.data?.[0]?.id ?? '')
  }, [pack, credits, total, events.data])
  const ev = events.data?.find((e) => e.id === eventId)

  const buy = useAction(async () => {
    if (!pack || !ev) throw new Error('Pick an event first')
    await wait(600)
    if (pay === 'credits') await api.addCredits(-total)
    await api.updateEvent(ev.id, { photoLimit: ev.photoLimit + pack.photos })
    add({ item: `${fmt.count(pack.photos)}-photo pack · ${ev.name}`, kind: 'pack', amount: price, paidWith: pay === 'credits' ? 'Wallet credits' : pay === 'upi' ? 'UPI' : 'Card' })
    return ev
  }, {
    success: (e) => `${fmt.count(pack?.photos ?? 0)} photos added to ${e.name}`,
    onSuccess: onClose,
  })

  return (
    <Modal open={!!pack} onOpenChange={(v) => !v && onClose()} title={pack ? `${fmt.count(pack.photos)}-photo event pack` : 'Event pack'} description="Adds capacity to one event for 12 months, beyond your plan." width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ev} loading={buy.isPending} onClick={() => buy.mutate()}>{pay === 'credits' ? `Pay ${fmt.rupees(total, true)} from credits` : `Pay ${fmt.rupees(total, true)}`}</Button></>}>
      {pack && (
        <div className="flex flex-col gap-4 px-6 py-4 text-[13px]">
          <Field label="Event" htmlFor="pack-event" hint={ev ? `Now ${fmt.count(ev.photoCount)} / ${fmt.count(ev.photoLimit)} photos → limit becomes ${fmt.count(ev.photoLimit + pack.photos)}` : undefined}>
            <Select id="pack-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              {events.data?.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.shortId}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
            <Row label={`${fmt.count(pack.photos)} photos`} value={fmt.rupees(price, true)} />
            <Row label="GST 18%" value={fmt.rupees(round2(price * GST_RATE), true)} />
            <Row label="Total" value={fmt.rupees(total, true)} strong />
          </div>
          <PayMethods value={pay} onChange={setPay} credits={credits} needed={total} />
        </div>
      )}
    </Modal>
  )
}
