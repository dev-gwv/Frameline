import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Lock, Minus, Plus } from 'lucide-react'
import { Field, Input, PhotoTile, Skeleton } from '@frameline/ui'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { fmt, type Order, type OrderItemInput, type Photo, type PublicEvent, type PublicStudio, type ShippingAddress } from '@frameline/shared'
import { payWithRazorpay, RAZORPAY_KEY } from '../lib/razorpay'
import { isLiveApi, useApi } from '../lib/api'
import { usePrices } from '../lib/queries'
import { guest, useGuest, type EventSession } from '../lib/guest'
import { friendlyError } from '../lib/errors'
import { validPhone } from './Gates'
import { RadioCard, Sheet } from './Sheet'
import { LoadError, linkBtn, PrimaryButton, StateBlock, TextButton, WideButton } from './common'

interface Option { id: string; priceId: string; label: string; detail: ReactNode; total: number; qty: number; photos: Photo[]; digital: boolean; best?: boolean }
type Stage = 'choose' | 'pay' | 'processing' | 'checkout' | 'pending' | 'done'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
/** Demo checkout only (no Razorpay key): these test values show the failed and pending payment states. */
const DECLINE_CARD = '4000000000000002'
const isDecline = (method: 'upi' | 'card', upi: string, card: string) => (method === 'upi' ? /@fail$/i.test(upi.trim()) : card.replace(/\s/g, '') === DECLINE_CARD)
const isSlowUpi = (method: 'upi' | 'card', upi: string) => method === 'upi' && /@pending$/i.test(upi.trim())

/**
 * Buy: Choose (this photo / a print with quantity / all your photos) → Pay (name, email, address for prints,
 * UPI or card) → processing → Payment done, or Payment pending. A failed payment keeps the sheet open on Pay with
 * the reason and "Try again". Prices come from api.listPublicPrices; api.createOrder places the order. With
 * VITE_RAZORPAY_KEY set and an order that has `checkout`, Razorpay Checkout collects the payment and
 * api.confirmOrder completes it; otherwise the API's simulated payment is used.
 */
export function BuySheet({ open, onOpenChange, photos, mode, event, studio, session, allMine, onDownload }: {
  open: boolean; onOpenChange: (v: boolean) => void; photos: Photo[]; mode: 'photo' | 'mine'
  event: PublicEvent; studio: PublicStudio; session: EventSession
  /** The guest's matched photos, to offer "All your N photos" from the viewer. */
  allMine?: Photo[]
  /** "Download all" on the success screen. */
  onDownload?: (bought: Photo[]) => void
}) {
  const api = useApi()
  const qc = useQueryClient()
  const pricesQ = usePrices(event.shortId)
  const profile = useGuest((s) => s.profile)
  const [stage, setStage] = useState<Stage>('choose')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [choice, setChoice] = useState('')
  const [printQty, setPrintQty] = useState(1)
  const [method, setMethod] = useState<'upi' | 'card'>('upi')
  const knownEmail = [session.registration?.email, profile?.email].find((e) => !!e) ?? ''
  const [form, setForm] = useState({
    name: session.registration?.name ?? profile?.name ?? session.greeting ?? '', phone: session.registration?.phone ?? profile?.phone ?? '',
    email: knownEmail, upi: '', card: '', exp: '', cvc: '', line1: '', line2: '', city: '', state: '', postal: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [payError, setPayError] = useState<string | null>(null)
  const [order, setOrder] = useState<Order | null>(null)

  const options = useMemo<Option[]>(() => {
    const p = Object.fromEntries((pricesQ.data ?? []).map((x) => [x.id, x]))
    if (!p.single) return []
    const out: Option[] = []
    const mine = mode === 'mine' ? photos : allMine ?? []
    if (mode === 'photo') {
      out.push({ id: 'single', priceId: 'single', label: 'This photo, full size', detail: fmt.rupees(p.single.price), total: p.single.price, qty: 1, photos, digital: true })
      if (p.print812) out.push({ id: 'print812', priceId: 'print812', label: '8×12 print', detail: `${fmt.rupees(p.print812.price)} each · delivered in 5 days`, total: p.print812.price * printQty, qty: printQty, photos, digital: false })
    } else {
      const n = photos.length
      const each = n >= 3 && p.multi ? p.multi : p.single
      out.push({ id: 'each', priceId: each.id, label: `${fmt.count(n)} ${n === 1 ? 'photo' : 'photos'}, full size`, detail: `${fmt.rupees(each.price)} each`, total: each.price * n, qty: n, photos, digital: true })
    }
    if (p.all && mine.length > 1) {
      const perPhoto = mine.length * (mine.length >= 3 && p.multi ? p.multi.price : p.single.price)
      const best = p.all.price < perPhoto
      out.push({
        id: 'all', priceId: 'all', label: `All ${fmt.count(mine.length)} of your photos`, total: p.all.price, qty: 1, photos: mine, digital: true, best,
        detail: <>{fmt.rupees(p.all.price)} · plus any added later{best && <> · <b className="text-accent-text">Best value</b></>}</>,
      })
    }
    return out
  }, [pricesQ.data, mode, photos, allMine, printQty])

  useEffect(() => {
    if (open) { setStage('choose'); setErrors({}); setPayError(null); setPrintQty(1); setOrder(null); setChoice('') }
  }, [open])
  useEffect(() => {
    if (open && options.length && !options.some((o) => o.id === choice)) setChoice((options.find((o) => o.best) ?? options[0]).id)
  }, [open, options, choice])

  const selected = options.find((o) => o.id === choice)
  const isPrint = !!selected && !selected.digital
  const amount = selected ? fmt.rupees(selected.total) : ''

  function validate() {
    const errs: Record<string, string> = {}
    if (form.name.trim().length < 2) errs.name = 'Enter your name.'
    if (!EMAIL.test(form.email.trim())) errs.email = 'Enter an email for the receipt, like name@example.com.'
    if (!RAZORPAY_KEY && method === 'upi' && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(form.upi.trim())) errs.upi = 'Enter a UPI ID like name@okhdfc.'
    if (!RAZORPAY_KEY && method === 'card') {
      if (form.card.replace(/\s/g, '').length < 15) errs.card = 'Enter the 16-digit card number.'
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(form.exp.trim())) errs.exp = 'Use MM/YY.'
      if (!/^\d{3,4}$/.test(form.cvc.trim())) errs.cvc = '3 digits on the back.'
    }
    if (isPrint) {
      if (!validPhone(form.phone)) errs.phone = 'Enter a 10-digit mobile number for the courier.'
      if (form.line1.trim().length < 3) errs.line1 = 'Enter the house number and street.'
      if (form.city.trim().length < 2) errs.city = 'Enter the city.'
      if (form.state.trim().length < 2) errs.state = 'Enter the state.'
      if (!/^\d{6}$/.test(form.postal.trim())) errs.postal = 'Enter the 6-digit PIN code.'
    }
    return errs
  }

  async function pay(e?: FormEvent) {
    e?.preventDefault()
    if (!selected) return
    const errs = validate()
    setErrors(errs); setPayError(null)
    if (Object.keys(errs).length) { document.getElementById(`buy-${Object.keys(errs)[0]}`)?.focus(); return }
    setStage('processing')
    if (!RAZORPAY_KEY && isDecline(method, form.upi, form.card)) {
      await new Promise((r) => setTimeout(r, 1500))
      setPayError(method === 'upi' ? 'Your UPI app declined the payment. No money was taken.' : 'Your bank declined this card. No money was taken. Try another card or UPI.')
      setStage('pay')
      return
    }
    const ids = selected.photos.map((p) => p.id)
    const item: OrderItemInput = selected.id === 'all' ? { priceId: 'all', photoIds: ids }
      : selected.id === 'print812' ? { priceId: 'print812', photoIds: ids, quantity: printQty }
      : { priceId: selected.priceId, photoIds: ids, quantity: selected.qty }
    const buyer = { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() }
    const shipping: ShippingAddress | undefined = isPrint ? {
      name: buyer.name, phone: buyer.phone, line1: form.line1.trim(), ...(form.line2.trim() ? { line2: form.line2.trim() } : {}),
      city: form.city.trim(), state: form.state.trim(), postal: form.postal.trim(), country: 'IN',
    } : undefined
    try {
      const [placed] = await Promise.all([
        api.createOrder(event.shortId, { items: [item], method, buyer, ...(shipping ? { shipping } : {}) }),
        new Promise((r) => setTimeout(r, 900)),
      ])
      guest.setProfile({ name: buyer.name, email: buyer.email, ...(buyer.phone ? { phone: buyer.phone } : {}) })
      if (RAZORPAY_KEY && placed.checkout) return finish(placed, 'checkout')
      finish(placed, placed.status === 'pending' || (!RAZORPAY_KEY && isSlowUpi(method, form.upi)) ? 'pending' : 'done')
    } catch (err) {
      const f = friendlyError(err, 'Payment didn’t go through')
      setPayError(`${f.title}. ${f.body}`)
      setStage('pay')
    }
  }

  function finish(placed: Order, next: Stage) {
    const paid = placed.status === 'paid' || placed.status === 'paid-direct'
    if (paid && selected?.digital) guest.patchSession(event.shortId, (s) => ({ purchased: [...new Set([...s.purchased, ...selected.photos.map((p) => p.id)])] }))
    void qc.invalidateQueries({ queryKey: ['orders', event.shortId.toUpperCase()] })
    setOrder(placed)
    setStage(next)
  }

  /** Payment pending: asks the API for the order again. */
  async function checkAgain() {
    if (!order) return
    setChecking(true)
    try {
      const fresh = (await api.listMyOrders(event.shortId)).find((o) => o.id === order.id) ?? order
      if (fresh.status === 'pending') setPayError('Still waiting for the payment. We’ll email you as soon as it’s done.')
      else finish(fresh, 'done')
    } catch (err) {
      const f = friendlyError(err, 'We couldn’t check the payment')
      setPayError(`${f.title}. ${f.body}`)
    } finally { setChecking(false) }
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
  const ordersHref = `/${event.shortId.toLowerCase()}/orders`
  const secured = <p className="flex items-center justify-center gap-1.5 text-[12px] text-ink-3"><Lock size={12} />Secured by Razorpay</p>
  const bought = selected?.photos ?? []
  const n = bought.length

  const footer = stage === 'choose' && selected ? (
    // Distinct keys: reusing the same <button> as the submit button would submit the empty form on this click.
    <PrimaryButton key="continue" onClick={() => setStage('pay')}>Continue · {amount}</PrimaryButton>
  ) : stage === 'pay' && selected ? (
    <>
      <PrimaryButton key="pay" type="submit" form="buy-form">{payError ? `Try again · ${amount}` : RAZORPAY_KEY ? `Continue to pay ${amount}` : `Pay ${amount}`}</PrimaryButton>
      {secured}
    </>
  ) : stage === 'checkout' && order ? (
    <>
      <PrimaryButton loading={checkoutBusy} onClick={() => void payNow()}>{payError ? 'Try again' : 'Pay'} · {fmt.rupees(order.paid)}</PrimaryButton>
      {secured}
    </>
  ) : undefined

  const busy = stage === 'processing' || checkoutBusy
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v) }} hideClose={busy} footer={footer}
      title={stage === 'pay' || stage === 'checkout' ? `Pay ${stage === 'checkout' && order ? fmt.rupees(order.paid) : amount}`
        : stage === 'processing' ? 'Paying…' : stage === 'done' && order ? `Order ${order.number}` : stage === 'pending' ? 'Payment pending'
        : mode === 'photo' ? 'Buy this photo' : 'Buy your photos'}
      description={stage === 'choose' ? `From ${studio.name}` : undefined}>
      {stage === 'choose' && (
        pricesQ.isLoading ? <div className="flex flex-col gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : pricesQ.isError || !options.length ? (
          <LoadError error={pricesQ.error} title="Prices didn’t load" onRetry={() => void pricesQ.refetch()} />
        ) : (
          <div className="flex flex-col gap-3">
            {mode === 'photo' && photos[0] && <PhotoTile tone={photos[0].tone} url={photos[0].url} rotation={photos[0].rotation} aspect="16 / 9" rounded="rounded-[10px]" alt={photos[0].filename} />}
            <div role="radiogroup" aria-label="What to buy" className="flex flex-col gap-2">
              {options.map((o) => (
                <RadioCard key={o.id} checked={choice === o.id} onSelect={() => setChoice(o.id)} title={o.label} detail={o.detail}>
                  {o.id === 'print812' && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-line-2 bg-surface p-0.5" onClick={(e) => e.stopPropagation()}>
                      <button type="button" aria-label="One fewer print" className="grid size-9 place-items-center rounded-full hover:bg-sunk disabled:opacity-40" disabled={printQty <= 1} onClick={() => { setChoice('print812'); setPrintQty((q) => Math.max(1, q - 1)) }}><Minus size={15} /></button>
                      <span className="w-14 text-center text-[13px] font-bold tnum" aria-live="polite">{printQty} {printQty === 1 ? 'print' : 'prints'}</span>
                      <button type="button" aria-label="One more print" className="grid size-9 place-items-center rounded-full hover:bg-sunk disabled:opacity-40" disabled={printQty >= 20} onClick={() => { setChoice('print812'); setPrintQty((q) => Math.min(20, q + 1)) }}><Plus size={15} /></button>
                    </span>
                  )}
                </RadioCard>
              ))}
            </div>
          </div>
        )
      )}
      {stage === 'pay' && selected && (
        <form id="buy-form" onSubmit={(e) => void pay(e)} className="flex flex-col gap-3" noValidate>
          <div className="flex items-center justify-between gap-3 rounded-card bg-sunk px-3.5 py-2.5 text-[13.5px]">
            <span className="min-w-0 truncate">{selected.id === 'print812' ? `8×12 print × ${printQty}` : selected.label}</span>
            <b className="tnum">{amount}</b>
          </div>
          <TextButton className="-mt-1 self-start px-0 text-[13px]" onClick={() => { setPayError(null); setStage('choose') }}><ArrowLeft size={14} />Change what you’re buying</TextButton>
          {payError && (
            <div role="alert" className="flex gap-2.5 rounded-card bg-bad-soft p-3 text-[13px] text-bad">
              <AlertCircle size={17} className="mt-px shrink-0" /><div><b className="block">Payment didn’t go through</b>{payError}</div>
            </div>
          )}
          <Field label="Name" htmlFor="buy-name" error={errors.name}><Input id="buy-name" autoComplete="name" value={form.name} onChange={set('name')} className="h-11 text-[15px]" /></Field>
          <Field label="Email" htmlFor="buy-email" error={errors.email} hint="For the receipt and your download link."><Input id="buy-email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} className="h-11 text-[15px]" /></Field>
          {isPrint && (
            <fieldset className="flex min-w-0 flex-col gap-2.5 rounded-card border border-line p-3">
              <legend className="px-1 text-[13px] font-extrabold">Deliver to</legend>
              <Field label="Mobile for the courier" htmlFor="buy-phone" error={errors.phone}><Input id="buy-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} className="h-11 text-[15px]" /></Field>
              <Field label="House number and street" htmlFor="buy-line1" error={errors.line1}><Input id="buy-line1" autoComplete="address-line1" value={form.line1} onChange={set('line1')} className="h-11 text-[15px]" /></Field>
              <Field label="Area or landmark (optional)" htmlFor="buy-line2"><Input id="buy-line2" autoComplete="address-line2" value={form.line2} onChange={set('line2')} className="h-11 text-[15px]" /></Field>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="City" htmlFor="buy-city" error={errors.city}><Input id="buy-city" autoComplete="address-level2" value={form.city} onChange={set('city')} className="h-11 text-[15px]" /></Field>
                <Field label="State" htmlFor="buy-state" error={errors.state}><Input id="buy-state" autoComplete="address-level1" value={form.state} onChange={set('state')} className="h-11 text-[15px]" /></Field>
              </div>
              <Field label="PIN code" htmlFor="buy-postal" error={errors.postal}><Input id="buy-postal" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.postal} onChange={set('postal')} className="h-11 text-[15px]" /></Field>
            </fieldset>
          )}
          {!RAZORPAY_KEY && (
            <>
              <div className="text-[12.5px] font-bold text-ink-2">Pay with</div>
              <div role="radiogroup" aria-label="Pay with" className="flex flex-col gap-2">
                <RadioCard checked={method === 'upi'} onSelect={() => setMethod('upi')} title="UPI" detail="GPay, PhonePe, Paytm" />
                <RadioCard checked={method === 'card'} onSelect={() => setMethod('card')} title="Card" detail="Debit or credit" />
              </div>
              {method === 'upi' ? (
                <Field label="UPI ID" htmlFor="buy-upi" error={errors.upi} hint="You’ll approve the payment in your UPI app.">
                  <Input id="buy-upi" autoComplete="off" autoCapitalize="none" placeholder="name@okhdfc" value={form.upi} onChange={set('upi')} className="h-11 text-[15px]" />
                </Field>
              ) : (
                <div className="grid grid-cols-[1fr_84px_72px] gap-2">
                  <Field label="Card number" htmlFor="buy-card" error={errors.card}><Input id="buy-card" inputMode="numeric" autoComplete="cc-number" placeholder="4111 1111 1111 1111" value={form.card} onChange={(e) => set('card')({ target: { value: e.target.value.replace(/[^\d]/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ') } })} className="h-11" /></Field>
                  <Field label="Expiry" htmlFor="buy-exp" error={errors.exp}><Input id="buy-exp" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={form.exp} onChange={set('exp')} className="h-11" /></Field>
                  <Field label="CVC" htmlFor="buy-cvc" error={errors.cvc}><Input id="buy-cvc" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={form.cvc} onChange={set('cvc')} className="h-11" /></Field>
                </div>
              )}
              <p className="text-[12px] text-ink-3">{isLiveApi ? 'Test payments: no money is taken yet.' : 'Demo checkout: no money is taken.'}</p>
            </>
          )}
          {RAZORPAY_KEY && <p className="text-[13px] text-ink-2">You’ll choose UPI, card or netbanking on Razorpay’s secure page next.</p>}
        </form>
      )}
      {stage === 'processing' && (
        <div className="flex flex-col items-center gap-3 py-10 text-center" role="status" aria-live="polite">
          <span className="size-9 animate-spin rounded-full border-[3px] border-accent border-r-transparent" aria-hidden />
          <b className="text-[15px]">{RAZORPAY_KEY ? 'Saving your order…' : method === 'upi' ? 'Waiting for your UPI app…' : 'Confirming with your bank…'}</b>
          <p className="text-[13px] text-ink-2">Don’t close this page.</p>
        </div>
      )}
      {stage === 'checkout' && order && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-card bg-sunk px-3.5 py-2.5 text-[13.5px]">
            <span>Order #{order.number} · {order.items}</span><b className="tnum">{fmt.rupees(order.paid)}</b>
          </div>
          <p className="text-[13.5px] text-ink-2">Your order is saved. Pay with UPI, card or netbanking on Razorpay’s secure page.</p>
          {payError && <p role="alert" className="rounded-card bg-bad-soft p-3 text-[13px] font-semibold text-bad">{payError}</p>}
        </div>
      )}
      {stage === 'pending' && order && (
        <StateBlock className="py-4" icon={<Clock size={26} />} tone="warn" title={`Order ${order.number} is saved`}
          body={order.status === 'pending' && !isSlowUpi(method, form.upi)
            ? `Online payment isn’t switched on here yet. ${studio.name} will send you a payment link.`
            : 'We’re waiting for your UPI app to confirm. This can take a few minutes. We’ll email you when it’s done.'}>
          {payError && <p role="status" className="text-[13px] text-ink-2">{payError}</p>}
          <PrimaryButton loading={checking} onClick={() => void checkAgain()}>Check again</PrimaryButton>
          <Link to={ordersHref} className={linkBtn()} onClick={() => onOpenChange(false)}>See your orders</Link>
        </StateBlock>
      )}
      {stage === 'done' && order && (
        <StateBlock className="py-4" icon={<CheckCircle2 size={28} />} tone="ok" title={isPrint ? 'Order placed' : 'Payment done'}
          body={isPrint
            ? `${studio.name} will print and ship ${printQty === 1 ? 'your print' : `your ${printQty} prints`} to ${order.shipping?.city ?? 'you'} in about 5 days. We’ve emailed the receipt.`
            : `${n === 1 ? 'Your photo is' : `Your ${fmt.count(n)} photos are`} ready in full size. We’ve also emailed the link to ${order.buyerEmail ?? form.email.trim()}.`}>
          {!isPrint && onDownload
            ? <PrimaryButton onClick={() => { onOpenChange(false); onDownload(bought) }}>{n === 1 ? 'Download photo' : 'Download all'}</PrimaryButton>
            : <WideButton onClick={() => onOpenChange(false)}>Done</WideButton>}
          <Link to={ordersHref} onClick={() => onOpenChange(false)} className="inline-flex min-h-11 items-center justify-center text-[13.5px] font-extrabold text-accent-text hover:underline">See your orders</Link>
        </StateBlock>
      )}
    </Sheet>
  )
}
