import { useEffect, useState } from 'react'
import { CheckCircle2, Download } from 'lucide-react'
import { fmt, PACKS, type PhotoEvent, type Plan, type PlanChange, type Usage } from '@frameline/shared'
import { Button, Field, Modal, RadioCardGroup, Select, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents } from '../../lib/queries'
import { round2, type Billing } from '../wallet/lib'
import { BillingForm, validateBilling } from '../settings/BillingForm'
import { useBilling } from '../settings/billing'
import { downloadInvoice } from '../settings/invoices'
import { PayMethods, type PayWith } from './PlanModals'
import { GST_RATE, planChangeQuote, type Period } from './usePlanState'

const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex justify-between gap-3 border-t border-line py-2.5 first:border-t-0 ${strong ? 'font-extrabold' : ''}`}><span>{label}</span><span className="tnum">{value}</span></div>
)

/**
 * Checkout for a plan change (api.changePlan): every line of the price (unused time, GST 18%), how to pay
 * (UPI / Card / Wallet), the GST invoice details (inline form when missing), and "Pay ₹X".
 * One call: api.changePlan(plan, { billing, payWith }) — the server adds GST and, for the wallet, takes the total
 * (added money first, then sales) before switching the plan.
 */
export function CheckoutModal({ target, period, usage, wallet, onClose, onPaid }: {
  target: Plan | null; period: Period; usage: Usage; wallet?: number; onClose: () => void; onPaid: (r: PlanChange, plan: Plan) => void
}) {
  const api = useApi()
  const bill = useBilling()
  const [pay, setPay] = useState<PayWith>('upi')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Billing | null>(null)
  const [tried, setTried] = useState(false)
  useEffect(() => { if (target) { setPay('upi'); setEditing(false); setTried(false); setForm(null) } }, [target])
  useEffect(() => { if (target && !form && bill.billing) setForm(bill.billing) }, [target, form, bill.billing])
  const needForm = !bill.hasBilling || editing

  const q = target ? planChangeQuote(usage, target, period) : null
  const gst = q ? round2(q.charged * GST_RATE) : 0
  const total = q ? round2(q.charged + gst) : 0

  const checkout = useAction(async (t: Plan) => {
    if (needForm && form) await api.updateStudio({ billing: { name: form.name.trim(), address: form.address.trim(), state: form.state, invoiceEmail: form.email.trim(), ...(form.gstin ? { gstin: form.gstin } : {}) } })
    return api.changePlan(t.id, { billing: period, payWith: total > 0 ? pay : undefined })
  }, { onSuccess: (r, t) => onPaid(r, t) })

  if (!target || !q) return null
  const lower = target.pricePerYear < q.current.pricePerYear
  const title = target.id === q.current.id ? `Switch to ${period} billing` : lower ? `Switch to ${target.name}` : `Upgrade to ${target.name}`
  const submit = () => {
    setTried(true)
    if (needForm && (!form || Object.keys(validateBilling(form)).length)) return
    checkout.mutate(target)
  }
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} width={540} title={title}
      description={`${fmt.count(target.photos)} photos a ${period === 'yearly' ? 'year' : 'quarter'} · ${target.seats} team seats`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={checkout.isPending} onClick={submit}>{total ? `Pay ${fmt.rupees(total, true)}` : 'Switch now'}</Button></>}>
      <div className="rounded-card border border-line px-3.5 text-[14px]">
        <Line label={`${target.name}, ${period}`} value={fmt.rupees(q.price)} />
        {q.credit > 0 && <Line label={`Unused ${q.current.name} time`} value={`− ${fmt.rupees(Math.min(q.credit, q.price))}`} />}
        <Line label="GST 18%" value={fmt.rupees(gst, true)} />
        <Line label="Pay today" value={fmt.rupees(total, true)} strong />
      </div>
      {q.wasted > 0 && <p className="text-[13px] text-ink-2">Your unused time is worth more than the new price. The extra {fmt.rupees(q.wasted)} isn’t refunded.</p>}
      {needForm && form && (
        <div className="flex flex-col gap-2 rounded-card border border-line p-3.5">
          <b className="text-[14px]">GST invoice details</b>
          <BillingForm value={form} onChange={setForm} showErrors={tried} />
        </div>
      )}
      {total > 0 && <PayMethods value={pay} onChange={setPay} wallet={wallet} needed={total} />}
      {!needForm && bill.billing && (
        <p className="text-[13px] text-ink-3">GST invoice to {bill.billing.name}{bill.billing.gstin ? ` · GSTIN ${bill.billing.gstin}` : ''} · <button type="button" className="font-bold text-accent-text hover:underline" onClick={() => setEditing(true)}>Change</button></p>
      )}
      <p className="text-[12.5px] text-ink-3">A new {period} period starts today and runs till {fmt.date(q.validTill)}.{pay === 'wallet' ? ' From your wallet: added money first, then sales.' : ''}</p>
    </Modal>
  )
}

/** "You're on Pro": the clear ending with the receipt. */
export function PaidModal({ result, plan, onClose }: { result: PlanChange | null; plan: Plan | null; onClose: () => void }) {
  const toast = useToast()
  const { billing } = useBilling()
  if (!result || !plan) return null
  const p = result.purchase
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={`You’re on ${plan.name}`} width={460}
      footer={<>
        {p && <Button variant="ghost" icon={<Download size={14} />} disabled={!billing} onClick={() => { downloadInvoice(p, billing!); toast.success('Invoice downloaded', 'Open it and print to PDF if you need a PDF.') }}>Download invoice</Button>}
        <Button variant="primary" onClick={onClose}>Done</Button>
      </>}>
      <div className="flex items-start gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"><CheckCircle2 size={24} /></span>
        <p className="text-[14px] text-ink-2">
          {fmt.count(result.usage.photosLimit)} photos a {result.usage.period === 'yearly' ? 'year' : 'quarter'}, starting now, till {fmt.date(result.usage.validTill)}.
          {' '}{result.total > 0
            ? <>You paid <b className="text-ink tnum">{fmt.rupees(result.total, true)}</b> ({fmt.rupees(result.charged, true)} + GST {fmt.rupees(result.gst, true)}){result.payWith === 'wallet' ? ' from your wallet' : result.payWith === 'upi' ? ' by UPI' : ' by card'}.</>
            : 'Nothing to pay: your unused time covered it.'}
          {p ? ' Your invoice is in Settings → Invoices, and we’ve emailed it.' : ''}
        </p>
      </div>
    </Modal>
  )
}

/* ---------------- Event pack ---------------- */
/** Buy an event pack (api.buyPack): pick the event and the pack, pay from the wallet or by card. */
export function PackModal({ open, onOpenChange, wallet }: { open: boolean; onOpenChange: (v: boolean) => void; wallet?: number }) {
  const api = useApi()
  const events = useEvents()
  const [eventId, setEventId] = useState('')
  const [size, setSize] = useState(String(PACKS[1].photos))
  const [pay, setPay] = useState<PayWith>('wallet')
  const list = (events.data ?? []).filter((e) => e.status !== 'archived')
  const pack = PACKS.find((p) => String(p.photos) === size) ?? PACKS[0]
  useEffect(() => {
    if (!open) return
    setEventId(list.find((e: PhotoEvent) => e.photoCount / e.photoLimit > 0.6)?.id ?? list[0]?.id ?? '')
    setSize(String(PACKS[1].photos))
  }, [open, events.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const canWallet = wallet !== undefined && wallet >= pack.price
  useEffect(() => { if (open) setPay(canWallet ? 'wallet' : 'upi') }, [open, canWallet])
  const ev = list.find((e) => e.id === eventId)
  const byWallet = pay === 'wallet'
  const gst = round2(pack.price * GST_RATE)
  const buy = useAction(() => api.buyPack(ev!.id, pack.photos, { payWith: byWallet ? 'credits' : 'card' }), {
    success: (r) => `${fmt.count(pack.photos)} photos added to ${r.event.name}`,
    onSuccess: () => onOpenChange(false),
  })
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Buy an event pack" description="More photos for one event, on top of your plan, for 12 months." width={540}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" disabled={!ev} loading={buy.isPending} onClick={() => buy.mutate(undefined)}>{byWallet ? `Pay ${fmt.rupees(pack.price)} from wallet` : `Pay ${fmt.rupees(round2(pack.price + gst), true)}`}</Button></>}>
      <Field label="Event" htmlFor="pack-event" hint={ev ? `${fmt.count(ev.photoCount)} of ${fmt.count(ev.photoLimit)} photos used → room for ${fmt.count(ev.photoLimit + pack.photos)}` : undefined}>
        <Select id="pack-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          {list.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-bold text-ink-2">Pack</span>
        <RadioCardGroup label="Pack" columns={3} value={size} onChange={setSize} options={PACKS.map((p) => ({ value: String(p.photos), title: `${fmt.count(p.photos)} photos`, description: fmt.rupees(p.price) }))} />
      </div>
      <PayMethods value={pay} onChange={setPay} wallet={wallet} needed={pack.price} />
      <p className="text-[12.5px] text-ink-3">{byWallet ? 'From your wallet: added money first, then sales. No extra GST.' : `Includes GST 18% (${fmt.rupees(gst, true)}).`}</p>
    </Modal>
  )
}
