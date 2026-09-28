import { useEffect, useState } from 'react'
import { Copy, Send, Truck } from 'lucide-react'
import { fmt, type Order, type PaymentMethod } from '@frameline/shared'
import { Avatar, Button, ConfirmDialog, Field, Input, Modal, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useRefundOrder } from '../../lib/queries'
import { copyText } from '../wallet/lib'
import { isPrint, money, ORDER_STATUS, orderBreakdown, orderStatusNote, refundable } from './lib'

const REFUND_TO: Record<PaymentMethod, string> = { upi: 'UPI', card: 'card', netbanking: 'bank account', international: 'payment method' }
const first = (name: string) => name.split(/\s+/)[0] || name

/** Order details as a modal (/sell/orders/:id or /sell?order=:id), with Refund and Resend download link. */
export function OrderModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const toast = useToast()
  const refund = useRefundOrder()
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const api = useApi()
  const [trackDraft, setTrackDraft] = useState('')
  const [resent, setResent] = useState(false)
  useEffect(() => { setAsking(false); setReason(''); setReasonError(''); setResent(false); setTrackDraft(order?.trackingNumber ?? '') }, [order?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const saveTracking = useAction((v: { id: string; trackingNumber: string }) => api.updateOrder(v.id, { trackingNumber: v.trackingNumber }), {
    success: (o) => (o.trackingNumber ? 'Tracking saved' : 'Tracking number removed'),
  })
  const resend = useAction((id: string) => api.resendDownloadLink(id), {
    onSuccess: (r) => { setResent(true); toast.success('Download link sent', `${first(r.order.buyer)} gets a fresh link at ${r.sentTo}.`) },
    error: 'Couldn’t send the link',
  })

  const o = order
  if (!o) return null
  const b = orderBreakdown(o)
  const st = ORDER_STATUS[o.status]
  const email = o.buyerEmail ?? ''
  const canResend = o.status === 'paid' || o.status === 'printing' || o.status === 'paid-direct'
  const print = isPrint(o)
  const phone = o.shipping?.phone
  const amount = money(o.paid, o.currency)

  const doRefund = async () => {
    const why = reason.trim()
    if (!why) { setReasonError('Say why, in a few words. The buyer sees this.'); throw new Error('reason') }
    await refund.mutateAsync({ orderId: o.id, reason: why })
    onClose()
  }

  return (
    <>
      <Modal open={!!order} onOpenChange={(v) => !v && onClose()} width={560}
        title={`Order #${o.number}`}
        description={`${st.label} · ${fmt.dateTime(o.at)} · ${o.eventName}`}
        footer={<>
          {refundable(o) && <Button variant="ghost" className="mr-auto text-bad hover:bg-bad-soft hover:text-bad" onClick={() => setAsking(true)}>Refund</Button>}
          {canResend && (
            <Button icon={<Send size={14} />} disabled={resent || !email} loading={resend.isPending} title={email ? undefined : 'No email on this order'} onClick={() => resend.mutate(o.id)}>
              {resent ? 'Link sent' : 'Resend download link'}
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>Done</Button>
        </>}>
        <div className="flex items-center gap-3">
          <Avatar name={o.buyer} className="size-10" />
          <div className="min-w-0 flex-1">
            <b className="block truncate">{o.buyer}</b>
            <span className="block truncate text-[12.5px] text-ink-3">{[email || 'No email on this order', phone].filter(Boolean).join(' · ')}</span>
          </div>
          <Button size="sm" icon={<Copy size={13} />} disabled={!email}
            onClick={async () => ((await copyText(email)) ? toast.success('Email copied', email) : toast.error('Couldn’t copy', 'Select the email and copy it by hand.'))}>Copy email</Button>
        </div>

        <div className="rounded-card border border-line px-3.5 text-[14px]">
          <Row label={o.items} value={money(b.price, o.currency, true)} />
          {o.status === 'paid-direct' ? <Row label="Frameline fee" value="None" /> : <>
            <Row label="Frameline fee (10%)" value={`− ${money(b.fee, o.currency, true)}`} />
            <Row label="Payment fee" value={b.paymentFee ? `− ${money(b.paymentFee, o.currency, true)}` : 'Included'} />
          </>}
          <Row label="You get" value={money(b.youGet, o.currency, true)} strong />
        </div>
        <p className="text-[13px] text-ink-2">{orderStatusNote(o)}</p>

        {print && (
          <div className="flex flex-col gap-3 rounded-card border border-line p-3.5">
            <div className="flex items-center gap-2 text-[14px] font-extrabold"><Truck size={15} className="text-ink-2" />Deliver to</div>
            {o.shipping ? (
              <address className="text-[13.5px] not-italic text-ink-2">
                <b className="text-ink">{o.shipping.name}</b><br />
                {o.shipping.line1}{o.shipping.line2 ? `, ${o.shipping.line2}` : ''}<br />
                {o.shipping.city}, {o.shipping.state} {o.shipping.postal}<br />
                {o.shipping.phone}
              </address>
            ) : <p className="text-[13px] text-ink-3">The buyer didn’t give an address with this order. Ask them by email.</p>}
            <Field label="Courier tracking number" htmlFor="track" hint={o.trackingNumber ? `Saved: ${o.trackingNumber}. ${first(o.buyer)} sees it on their order.` : 'Add it when the print is sent.'}>
              <div className="flex gap-2">
                <Input id="track" value={trackDraft} placeholder="e.g. DTDC Z12345678" onChange={(e) => setTrackDraft(e.target.value)} />
                <Button disabled={trackDraft.trim() === (o.trackingNumber ?? '')} loading={saveTracking.isPending}
                  onClick={() => saveTracking.mutate({ id: o.id, trackingNumber: trackDraft.trim() })}>Save</Button>
              </div>
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={asking} onOpenChange={setAsking} danger
        title={`Refund ${amount} to ${first(o.buyer)}?`} confirmLabel={`Refund ${amount}`}
        body={<>The money goes back to {first(o.buyer)}’s {REFUND_TO[o.method ?? 'upi']} in 5–7 days. {money(o.share, o.currency, true)} comes out of your wallet, and the download link stops working.</>}
        onConfirm={doRefund}>
        <Field label={`Reason (${first(o.buyer)} sees this)`} error={reasonError} htmlFor="refund-reason">
          <Input id="refund-reason" autoFocus maxLength={300} placeholder="Duplicate order" value={reason} onChange={(e) => { setReason(e.target.value); setReasonError('') }} />
        </Field>
      </ConfirmDialog>
    </>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 border-t border-line py-2.5 first:border-t-0 ${strong ? 'font-extrabold' : ''}`}>
      <span className="min-w-0">{label}</span><span className="shrink-0 tnum">{value}</span>
    </div>
  )
}
