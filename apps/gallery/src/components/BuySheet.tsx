import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, CreditCard, Minus, Plus, Smartphone } from 'lucide-react'
import { Button, Field, Input, Segmented, Skeleton, cn } from '@frameline/ui'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { fmt, type Order, type OrderItemInput, type Photo, type PublicEvent, type PublicStudio, type ShippingAddress } from '@frameline/shared'
import { payWithRazorpay, RAZORPAY_KEY } from '../lib/razorpay'
import { isLiveApi, useApi } from '../lib/api'
import { usePrices } from '../lib/queries'
import { guest, useGuest, type EventSession } from '../lib/guest'
import { friendlyError } from '../lib/errors'
import { validPhone } from './Gates'
import { Sheet } from './Sheet'
import { LoadError } from './common'

interface Option { id: string; label: string; detail: string; unit: number; qty: number; total: number; digital: boolean; badge?: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Buy photos (single / multiple / all my photos) or a print. Prices come from api.listPrices and the order is
 * placed with api.createOrder (priced by the API; prints send a shipping address). When the API answers with
 * `order.checkout` and VITE_RAZORPAY_KEY is set, "Pay now" opens Razorpay Checkout and api.confirmOrder completes
 * it. Without Razorpay the API's simulated payment marks the order paid; the UPI/card fields are only checked for
 * shape and never sent.
 */
export function BuySheet({ open, onOpenChange, photos, mode, event, studio, session }: {
  open: boolean; onOpenChange: (v: boolean) => void; photos: Photo[]; mode: 'photo' | 'mine'
  event: PublicEvent; studio: PublicStudio; session: EventSession
}) {
  const api = useApi()
  const qc = useQueryClient()
  const pricesQ = usePrices(event.shortId)
  const profile = useGuest((s) => s.profile)
  const [stage, setStage] = useState<'pick' | 'pay' | 'processing' | 'checkout' | 'done'>('pick')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [choice, setChoice] = useState<string>('')
  const [printQty, setPrintQty] = useState(1)
  const [method, setMethod] = useState<'upi' | 'card'>('upi')
  const [form, setForm] = useState({
    name: session.registration?.name ?? profile?.name ?? session.greeting ?? '', phone: session.registration?.phone ?? profile?.phone ?? '',
    email: session.registration?.email ?? profile?.email ?? '', upi: '', card: '', exp: '', cvc: '',
    line1: '', line2: '', city: '', state: '', postal: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [payError, setPayError] = useState<string | null>(null)
  const [order, setOrder] = useState<Order | null>(null)

  const n = photos.length
  const options = useMemo<Option[]>(() => {
    const p = Object.fromEntries((pricesQ.data ?? []).map((x) => [x.id, x]))
    if (!p.single) return []
    if (mode === 'photo') {
      const out: Option[] = [{ id: 'single', label: p.single.label, detail: p.single.detail, unit: p.single.price, qty: 1, total: p.single.price, digital: true }]
      if (p.print812) out.push({ id: 'print812', label: p.print812.label, detail: p.print812.detail, unit: p.print812.price, qty: printQty, total: p.print812.price * printQty, digital: false })
      return out
    }
    const each = n >= 3 && p.multi ? p.multi.price : p.single.price
    const perPhoto: Option = { id: n >= 3 ? 'multi' : 'single', label: `${n} ${n === 1 ? 'photo' : 'photos'}`, detail: `${fmt.rupees(each)} each · full resolution`, unit: each, qty: n, total: each * n, digital: true }
    const out: Option[] = []
    if (p.all) out.push({ id: 'all', label: p.all.label, detail: `${p.all.detail} · ${n} today, plus any added later`, unit: p.all.price, qty: 1, total: p.all.price, digital: true })
    out.push(perPhoto)
    const cheapest = [...out].sort((a, b) => a.total - b.total)[0]
    return out.map((o) => (o === cheapest && out.length > 1 ? { ...o, badge: 'Best value' } : o))
  }, [pricesQ.data, mode, n, printQty])

  useEffect(() => {
    if (open) { setStage('pick'); setErrors({}); setPayError(null); setPrintQty(1); setOrder(null) }
  }, [open])
  useEffect(() => {
    if (open && options.length && !options.some((o) => o.id === choice)) setChoice((options.find((o) => o.badge) ?? options[0]).id)
  }, [open, options, choice])

  const selected = options.find((o) => o.id === choice)

  async function pay(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    const errs: Record<string, string> = {}
    if (form.name.trim().length < 2) errs.name = 'Enter your name.'
    if (!validPhone(form.phone)) errs.phone = 'Enter a 10-digit mobile number.'
    if (!EMAIL.test(form.email.trim())) errs.email = 'Enter an email for the receipt, like name@example.com.'
    if (!RAZORPAY_KEY && method === 'upi' && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(form.upi.trim())) errs.upi = 'Enter a UPI ID like name@okhdfc.'
    if (!RAZORPAY_KEY && method === 'card') {
      if (form.card.replace(/\s/g, '').length < 15) errs.card = 'Enter the 16-digit card number.'
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(form.exp.trim())) errs.exp = 'Use MM/YY.'
      if (!/^\d{3,4}$/.test(form.cvc.trim())) errs.cvc = '3 digits on the back.'
    }
    const isPrint = selected.id.startsWith('print')
    if (isPrint) {
      if (form.line1.trim().length < 3) errs.line1 = 'Enter the house number and street.'
      if (form.city.trim().length < 2) errs.city = 'Enter the city.'
      if (form.state.trim().length < 2) errs.state = 'Enter the state.'
      if (!/^\d{6}$/.test(form.postal.trim())) errs.postal = 'Enter the 6-digit PIN code.'
    }
    setErrors(errs); setPayError(null)
    if (Object.keys(errs).length) return
    setStage('processing')
    const photoIds = photos.map((p) => p.id)
    const item: OrderItemInput = selected.id === 'all' ? { priceId: 'all', photoIds }
      : selected.id === 'print812' ? { priceId: 'print812', photoIds, quantity: printQty }
      : { priceId: selected.id, photoIds, quantity: selected.qty }
    const buyer = { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() }
    const shipping: ShippingAddress | undefined = isPrint ? {
      name: buyer.name, phone: buyer.phone, line1: form.line1.trim(), ...(form.line2.trim() ? { line2: form.line2.trim() } : {}),
      city: form.city.trim(), state: form.state.trim(), postal: form.postal.trim(), country: 'IN',
    } : undefined
    try {
      const placed = await api.createOrder(event.shortId, { items: [item], method, buyer, ...(shipping ? { shipping } : {}) })
      guest.setProfile(buyer)
      finish(placed, RAZORPAY_KEY && placed.checkout ? 'checkout' : 'done')
    } catch (err) {
      const f = friendlyError(err, 'Payment didn’t go through')
      setPayError(`${f.title}. ${f.body}`)
      setStage('pay')
    }
  }

  function finish(placed: Order, next: 'checkout' | 'done') {
    const paid = placed.status === 'paid' || placed.status === 'paid-direct'
    if (paid && selected?.digital) guest.patchSession(event.shortId, (s) => ({ purchased: [...new Set([...s.purchased, ...photos.map((p) => p.id)])] }))
    void qc.invalidateQueries({ queryKey: ['orders', event.shortId.toUpperCase()] })
    setOrder(placed)
    setStage(next)
  }

  /** Razorpay Checkout for a pending order, then api.confirmOrder with the signed payment. */
  async function payNow() {
    if (!order) return
    setCheckoutBusy(true); setPayError(null)
    try {
      const payment = await payWithRazorpay(order, {
        name: studio.name, description: `${event.name} · Order #${order.number}`,
        buyer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() }, color: studio.brandColor,
      })
      finish(await api.confirmOrder(order.id, payment), 'done')
    } catch (err) {
      const f = friendlyError(err, 'Payment didn’t go through')
      setPayError(f.code === 'unknown' ? f.body : `${f.title}. ${f.body}`)
    } finally { setCheckoutBusy(false) }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setErrors({ ...errors, [k]: '' }) }

  const footer = stage === 'pick' && selected ? (
    <Button variant="primary" size="lg" className="w-full justify-center" onClick={() => setStage('pay')}>Continue · {fmt.rupees(selected.total)}</Button>
  ) : undefined

  return (
    <Sheet open={open} onOpenChange={(v) => { if (stage !== 'processing' && !checkoutBusy) onOpenChange(v) }}
      title={stage === 'checkout' ? 'Pay for your order' : stage === 'done' ? 'Order placed' : mode === 'photo' ? 'Buy this photo' : 'Buy your photos'}
      description={stage === 'pick' ? `From ${studio.name} · paid securely` : undefined} footer={footer}>
      {stage === 'pick' && (
        pricesQ.isLoading ? <div className="flex flex-col gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>  : pricesQ.isError || !options.length ? (
          <LoadError error={pricesQ.error} title="Prices didn’t load" onRetry={() => void pricesQ.refetch()} />
        ) : (
          <div role="radiogroup" aria-label="What to buy" className="flex flex-col gap-2">
            {options.map((o) => (
              <div key={o.id}
                role="radio" aria-checked={choice === o.id} tabIndex={0}
                onClick={() => setChoice(o.id)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setChoice(o.id) } }}
                className={cn('flex cursor-pointer items-center gap-3 rounded-card border p-3.5 text-left transition', choice === o.id ? 'border-accent bg-accent-soft/60 ring-1 ring-accent' : 'border-line hover:bg-sunk')}>
                <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2', choice === o.id ? 'border-accent' : 'border-line-2')} aria-hidden>{choice === o.id && <span className="size-2.5 rounded-full bg-accent" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5"><b className="text-[14px]">{o.label}</b>{o.badge && <span className="rounded-full bg-gold px-1.5 py-px text-[10px] font-bold text-accent-ink">{o.badge}</span>}</span>
                  <span className="block text-[12px] text-ink-2">{o.detail}</span>
                  {o.id === 'print812' && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-line-2 bg-surface p-0.5" onClick={(e) => e.stopPropagation()}>
                      <button type="button" aria-label="Fewer prints" className="grid size-7 place-items-center rounded-full hover:bg-sunk disabled:opacity-40" disabled={printQty <= 1} onClick={() => { setChoice('print812'); setPrintQty((q) => Math.max(1, q - 1)) }}><Minus size={14} /></button>
                      <span className="w-6 text-center font-mono text-[13px] tnum" aria-live="polite" aria-label={`${printQty} prints`}>{printQty}</span>
                      <button type="button" aria-label="More prints" className="grid size-7 place-items-center rounded-full hover:bg-sunk disabled:opacity-40" disabled={printQty >= 20} onClick={() => { setChoice('print812'); setPrintQty((q) => Math.min(20, q + 1)) }}><Plus size={14} /></button>
                    </span>
                  )}
                </span>
                <span className="font-mono text-[14px] font-semibold tnum">{fmt.rupees(o.total)}</span>
              </div>
            ))}
          </div>
        )
      )}
      {stage === 'pay' && selected && (
        <form onSubmit={pay} className="flex flex-col gap-3" noValidate>
          <div className="flex items-center justify-between rounded-card bg-sunk px-3.5 py-2.5 text-[13px]">
            <span>{selected.id === 'print812' ? `Print 8×12 ×${printQty}` : selected.label}</span><b className="font-mono tnum">{fmt.rupees(selected.total)}</b>
          </div>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <Field label="Name" htmlFor="buy-name" error={errors.name}><Input id="buy-name" autoComplete="name" value={form.name} onChange={set('name')} className="h-11" /></Field>
            <Field label="Mobile" htmlFor="buy-phone" error={errors.phone}><Input id="buy-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} className="h-11" /></Field>
          </div>
          <Field label="Email for the receipt" htmlFor="buy-email" error={errors.email}><Input id="buy-email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} className="h-11" /></Field>
          {selected.id.startsWith('print') && (
            <fieldset className="flex min-w-0 flex-col gap-2.5 rounded-card border border-line p-3">
              <legend className="px-1 text-[12.5px] font-bold text-ink-2">Deliver to</legend>
              <Field label="House number and street" htmlFor="buy-line1" error={errors.line1}><Input id="buy-line1" autoComplete="address-line1" value={form.line1} onChange={set('line1')} className="h-11" /></Field>
              <Field label="Area or landmark (optional)" htmlFor="buy-line2"><Input id="buy-line2" autoComplete="address-line2" value={form.line2} onChange={set('line2')} className="h-11" /></Field>
              <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-3">
                <Field label="City" htmlFor="buy-city" error={errors.city}><Input id="buy-city" autoComplete="address-level2" value={form.city} onChange={set('city')} className="h-11" /></Field>
                <Field label="State" htmlFor="buy-state" error={errors.state}><Input id="buy-state" autoComplete="address-level1" value={form.state} onChange={set('state')} className="h-11" /></Field>
                <Field label="PIN code" htmlFor="buy-postal" error={errors.postal}><Input id="buy-postal" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.postal} onChange={set('postal')} className="h-11 font-mono" /></Field>
              </div>
            </fieldset>
          )}
          {!RAZORPAY_KEY && <>
          <Segmented stretch value={method} onChange={setMethod} options={[{ value: 'upi', label: 'UPI', icon: <Smartphone size={13} /> }, { value: 'card', label: 'Card', icon: <CreditCard size={13} /> }]} />
          {method === 'upi' ? (
            <Field label="UPI ID" htmlFor="buy-upi" error={errors.upi} hint="You'll approve the payment in your UPI app.">
              <Input id="buy-upi" autoComplete="off" autoCapitalize="none" placeholder="name@okhdfc" value={form.upi} onChange={set('upi')} className="h-11" />
            </Field>
          ) : (
            <div className="grid grid-cols-[1fr_88px_72px] gap-2">
              <Field label="Card number" htmlFor="buy-card" error={errors.card}><Input id="buy-card" inputMode="numeric" autoComplete="cc-number" placeholder="4111 1111 1111 1111" value={form.card} onChange={(e) => set('card')({ target: { value: e.target.value.replace(/[^\d]/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ') } })} className="h-11" /></Field>
              <Field label="Expiry" htmlFor="buy-exp" error={errors.exp}><Input id="buy-exp" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={form.exp} onChange={set('exp')} className="h-11" /></Field>
              <Field label="CVC" htmlFor="buy-cvc" error={errors.cvc}><Input id="buy-cvc" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={form.cvc} onChange={set('cvc')} className="h-11" /></Field>
            </div>
          )}
          </>}
          {payError && <p role="alert" className="rounded-card bg-bad-soft p-3 text-[13px] font-semibold text-bad">{payError}</p>}
          <div className="flex gap-2">
            <Button size="lg" onClick={() => setStage('pick')}>Back</Button>
            <Button type="submit" variant="primary" size="lg" className="flex-1 justify-center">{RAZORPAY_KEY ? 'Place order' : `Pay ${fmt.rupees(selected.total)}`}</Button>
          </div>
          <p className="text-center text-[11px] text-ink-3">{RAZORPAY_KEY ? 'You’ll pay securely with Razorpay next.' : isLiveApi ? 'Test payments — no money is taken yet.' : 'Demo checkout — no money is taken.'}</p>
        </form>
      )}
      {stage === 'processing' && (
        <div className="flex flex-col items-center gap-3 py-8" role="status" aria-live="polite">
          <span className="size-8 animate-spin rounded-full border-[3px] border-accent border-r-transparent" aria-hidden />
          <b>{RAZORPAY_KEY ? 'Placing your order…' : method === 'upi' ? 'Waiting for your UPI app…' : 'Confirming with your bank…'}</b>
        </div>
      )}
      {stage === 'checkout' && order && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-card bg-sunk px-3.5 py-2.5 text-[13px]">
            <span>Order <span className="font-mono">#{order.number}</span> · {order.items}</span><b className="font-mono tnum">{fmt.rupees(order.paid)}</b>
          </div>
          <p className="text-[13px] text-ink-2">Your order is saved. Pay with UPI, card or netbanking on Razorpay's secure page.</p>
          {payError && <p role="alert" className="rounded-card bg-bad-soft p-3 text-[13px] font-semibold text-bad">{payError}</p>}
          <Button variant="primary" size="lg" loading={checkoutBusy} className="w-full justify-center" onClick={() => void payNow()}>Pay now · {fmt.rupees(order.paid)}</Button>
        </div>
      )}
      {stage === 'done' && selected && order && order.status === 'pending' && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 size={40} className="text-warn" />
          <div className="font-mono text-[12px] text-ink-3">Order #{order.number}</div>
          <b className="font-display text-[20px]">Payment pending</b>
          <p className="max-w-xs text-[13px] text-ink-2">Your order is saved. Online payment isn't switched on in this gallery yet — {studio.name} will send you a payment link.</p>
          <div className="mt-2 flex gap-2"><Link to={`/${event.shortId.toLowerCase()}/orders`}><Button>My orders</Button></Link><Button onClick={() => onOpenChange(false)}>Done</Button></div>
        </div>
      )}
      {stage === 'done' && selected && order && order.status !== 'pending' && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 size={40} className="text-ok" />
          <div className="font-mono text-[12px] text-ink-3">Order #{order.number}</div>
          <b className="font-display text-[20px]">{fmt.rupees(order.paid)} paid</b>
          <p className="max-w-xs text-[13px] text-ink-2">
            {selected.digital
              ? `Your ${n === 1 ? 'photo is' : `${n} photos are`} unlocked for full-resolution download. A receipt is on its way to ${order.buyerEmail ?? form.email.trim()}.`
              : `${studio.name} will print and ship your photo to ${order.shipping?.city ?? 'you'} in about 5 days. We'll send tracking on WhatsApp.`}
          </p>
          <div className="mt-2 flex gap-2"><Link to={`/${event.shortId.toLowerCase()}/orders`}><Button>My orders</Button></Link><Button variant="primary" onClick={() => onOpenChange(false)}>Done</Button></div>
        </div>
      )}
    </Sheet>
  )
}
