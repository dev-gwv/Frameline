import type { ReactNode } from 'react'
import { Copy, Mail } from 'lucide-react'
import { fmt, STORE_COMMISSION, type Order, type PaymentMethod } from '@frameline/shared'
import { Button, Chip, Divider, Drawer, useToast } from '@frameline/ui'
import { copyText, money, ORDER_STATUS, orderBreakdown } from '../wallet/lib'

const METHOD: Record<PaymentMethod, string> = { upi: 'UPI', card: 'Card', netbanking: 'Net banking', international: 'International (paid to you directly)' }

/** Right-side details for one photo order (used by Store and Orders & wallet). */
export function OrderDrawer({ order, onClose, extraActions }: { order: Order | null; onClose: () => void; extraActions?: ReactNode }) {
  const toast = useToast()
  const o = order
  const b = o ? orderBreakdown(o) : null
  const email = o?.buyerEmail ?? ''
  const st = o ? ORDER_STATUS[o.status] : null
  return (
    <Drawer
      open={!!o} onOpenChange={(v) => !v && onClose()} width={460}
      title={o ? <>Order <span className="font-mono">#{o.number}</span></> : 'Order'}
      description={o ? `${fmt.fullDateTime(o.at)} · ${o.eventName}` : undefined}
      footer={o && <>
        {extraActions}
        <Button icon={<Copy size={14} />} disabled={!email} onClick={async () => { (await copyText(email)) ? toast.success('Buyer email copied', email) : toast.error('Couldn’t copy', 'Select the email and copy it by hand.') }}>Copy buyer email</Button>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </>}
    >
      {o && b && st && (
        <div className="flex flex-col gap-4 text-[13px]">
          <div className="flex items-center justify-between gap-3 rounded-card bg-sunk p-3">
            <div>
              <div className="eyebrow">Buyer</div>
              <div className="font-bold">{o.buyer}</div>
              <div className="flex items-center gap-1.5 text-[12px] text-ink-2"><Mail size={12} /> {email ? <span className="select-all">{email}</span> : <span className="text-ink-3">No email on this order</span>}</div>
            </div>
            <Chip tone={st.tone} dot>{st.label}</Chip>
          </div>
          <div>
            <div className="eyebrow mb-1">Items</div>
            <div className="flex justify-between"><span>{o.items}</span><span className="font-mono tnum">{money(o.paid, o.currency)}</span></div>
            <div className="text-[12px] text-ink-3">From {o.eventName}{o.method ? ` · paid by ${METHOD[o.method]}` : ''}</div>
          </div>
          <Divider />
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 tnum">
            <dt className="text-ink-2">Buyer paid</dt><dd className="text-right font-mono">{money(o.paid, o.currency, true)}</dd>
            {o.status === 'paid-direct' ? (
              <>
                <dt className="text-ink-2">Platform commission</dt><dd className="text-right font-mono">None · paid to you directly</dd>
              </>
            ) : (
              <>
                <dt className="text-ink-2">Platform commission ({Math.round(STORE_COMMISSION * 100)}%)</dt><dd className="text-right font-mono">− {money(b.commission, o.currency, true)}</dd>
                <dt className="pl-3 text-[12px] text-ink-3">incl. platform GST (18%)</dt><dd className="text-right font-mono text-[12px] text-ink-3">{money(b.platformGst, o.currency, true)}</dd>
                <dt className="text-ink-2">Seller GST inside the price (18%)</dt><dd className="text-right font-mono">{money(b.sellerGst, o.currency, true)}</dd>
              </>
            )}
            <dt className="border-t border-line pt-2 font-bold">Your share</dt>
            <dd className="border-t border-line pt-2 text-right font-mono font-bold text-ok">{money(o.share, o.currency, true)}</dd>
          </dl>
          <p className="text-[12px] text-ink-3">
            {o.status === 'refunded' ? 'This order was refunded; the share was taken back from your wallet.'
              : o.status === 'pending' ? 'The buyer started paying but the payment hasn’t cleared. Refresh the status from Orders & wallet.'
              : o.status === 'paid-direct' ? 'International buyer paid you by your own link or QR. Frameline takes no commission.'
              : 'Your share lands in your wallet after the 3-day refund window. You file the seller GST with your returns.'}
          </p>
        </div>
      )}
    </Drawer>
  )
}
