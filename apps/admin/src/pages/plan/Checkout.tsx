import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { fmt, PACKS, planPrice, type Plan, type PlanChange, type Usage } from '@frameline/shared'
import { Button, Field, Modal, Select } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents } from '../../lib/queries'
import { round2 } from '../wallet/lib'
import { PayMethods, type PayWith } from './PlanModals'
import { GST_RATE, planChangeQuote, type Period } from './usePlanState'

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <>
    <span className={strong ? 'border-t border-line pt-1.5 font-bold' : 'text-ink-2'}>{label}</span>
    <span className={`text-right font-mono tnum ${strong ? 'border-t border-line pt-1.5 font-bold' : ''}`}>{value}</span>
  </>
)

/** Change plan or billing period with api.changePlan; shows the API's charged amount and credit afterwards. */
export function UpgradeModal({ target, period, usage, onClose }: { target: Plan | null; period: Period; usage: Usage; onClose: () => void }) {
  const api = useApi()
  const [pay, setPay] = useState<PayWith>('upi')
  const [done, setDone] = useState<PlanChange | null>(null)
  useEffect(() => { if (target) { setPay('upi'); setDone(null) } }, [target])
  const change = useAction((t: Plan) => api.changePlan(t.id, period), {
    success: (_, t) => `You’re on ${t.name} · ${period} now`,
    onSuccess: (r) => setDone(r),
  })
  if (!target) return null

  const q = planChangeQuote(usage, target, period)
  const lower = target.pricePerYear < q.current.pricePerYear
  const gst = round2(q.charged * GST_RATE)
  const title = lower ? `Switch to ${target.name}` : target.id === q.current.id ? `Switch to ${period} billing` : `Upgrade to ${target.name}`

  if (done) {
    const charged = done.charged
    return (
      <Modal open onOpenChange={(v) => !v && onClose()} title="Plan changed" width={480}
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="flex flex-col gap-3 px-6 py-4 text-[13px]">
          <div className="flex items-center gap-2 font-bold text-ok"><CheckCircle2 size={16} /> {target.name} · {done.usage.period}, valid till {fmt.date(done.usage.validTill)}</div>
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
            <Row label={`${target.name} · ${done.usage.period}`} value={fmt.rupees(planPrice(target, done.usage.period))} />
            {done.credit > 0 && <Row label="Credit for unused time" value={`− ${fmt.rupees(done.credit)}`} />}
            <Row label="Charged (before GST)" value={fmt.rupees(charged)} strong />
          </div>
          <p className="text-[12px] text-ink-3">{done.purchase ? <>Receipt <span className="font-mono">{done.purchase.invoiceNumber}</span> is in Orders & wallet → Invoices.</> : 'Nothing to pay: your unused credit covered it.'} Capacity is now {fmt.count(done.usage.photosLimit)} photos.</p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={title} description={`${fmt.count(target.photos)} photos · ${target.seats} team seats`} width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={change.isPending} onClick={() => change.mutate(target)}>{q.charged ? `Pay ${fmt.rupees(round2(q.charged + gst), true)}` : 'Switch now'}</Button></>}>
      <div className="flex flex-col gap-4 px-6 py-4 text-[13px]">
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
          <Row label={`${target.name} · ${period}`} value={fmt.rupees(q.price)} />
          {q.credit > 0 && <Row label={`Unused ${q.current.name} time (${q.remainingDays} days)`} value={`− ${fmt.rupees(q.credit)}`} />}
          <Row label="GST 18%" value={fmt.rupees(gst, true)} />
          <Row label="Total today" value={fmt.rupees(round2(q.charged + gst), true)} strong />
        </div>
        <p className="text-[12px] text-ink-3">
          A new {period} period starts today, valid till {fmt.date(q.validTill)}. The unused part of your current plan is credited against the new price.
          {q.wasted > 0 && <> Your unused credit ({fmt.rupees(q.credit)}) is more than the new price; the extra {fmt.rupees(q.wasted)} isn’t refunded.</>}
        </p>
        {q.charged > 0 && <PayMethods value={pay} onChange={setPay} />}
      </div>
    </Modal>
  )
}

/**
 * Buy a one-off event pack for one event with api.buyPack: from wallet credits (the pack price) or
 * by card (price + GST). The API raises the event's photo limit and records the purchase.
 */
export function PackModal({ pack, credits, onClose }: { pack: (typeof PACKS)[number] | null; credits: number; onClose: () => void }) {
  const api = useApi()
  const events = useEvents()
  const [eventId, setEventId] = useState('')
  const [pay, setPay] = useState<PayWith>('card')
  const price = pack?.price ?? 0
  const gst = round2(price * GST_RATE)
  const selectable = (events.data ?? []).filter((e) => e.status !== 'archived')
  useEffect(() => {
    if (!pack) return
    setPay(credits >= price ? 'credits' : 'card')
    setEventId(selectable.find((e) => e.status === 'expiring' || e.photoCount / e.photoLimit > 0.6)?.id ?? selectable[0]?.id ?? '')
  }, [pack, credits, price, events.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const ev = events.data?.find((e) => e.id === eventId)
  const byCredits = pay === 'credits'

  const buy = useAction(() => {
    if (!pack || !ev) throw new Error('Pick an event first')
    return api.buyPack(ev.id, pack.photos, { payWith: byCredits ? 'credits' : 'card' })
  }, {
    success: (r) => `${fmt.count(pack?.photos ?? 0)} photos added to ${r.event.name} · limit now ${fmt.count(r.event.photoLimit)}`,
    onSuccess: onClose,
  })

  return (
    <Modal open={!!pack} onOpenChange={(v) => !v && onClose()} title={pack ? `${fmt.count(pack.photos)}-photo event pack` : 'Event pack'} description="Adds capacity to one event for 12 months, beyond your plan." width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ev} loading={buy.isPending} onClick={() => buy.mutate(undefined)}>{byCredits ? `Pay ${fmt.rupees(price)} from credits` : `Pay ${fmt.rupees(round2(price + gst), true)}`}</Button></>}>
      {pack && (
        <div className="flex flex-col gap-4 px-6 py-4 text-[13px]">
          <Field label="Event" htmlFor="pack-event" hint={ev ? `Now ${fmt.count(ev.photoCount)} / ${fmt.count(ev.photoLimit)} photos → limit becomes ${fmt.count(ev.photoLimit + pack.photos)}` : undefined}>
            <Select id="pack-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              {selectable.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.shortId}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
            <Row label={`${fmt.count(pack.photos)} photos`} value={fmt.rupees(price, true)} />
            {byCredits
              ? <Row label="From wallet credits (GST was paid when you bought them)" value={fmt.rupees(price, true)} strong />
              : <><Row label="GST 18%" value={fmt.rupees(gst, true)} /><Row label="Total" value={fmt.rupees(round2(price + gst), true)} strong /></>}
          </div>
          <PayMethods value={pay} onChange={setPay} credits={credits} needed={price} />
        </div>
      )}
    </Modal>
  )
}
