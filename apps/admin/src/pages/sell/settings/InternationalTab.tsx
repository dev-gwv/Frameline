import { useRef, useState } from 'react'
import { Globe2, QrCode, Trash2, Upload } from 'lucide-react'
import { Button, Card, Chip, cn, Field, Input, SettingRow, Toggle } from '@frameline/ui'
import type { StoreSettingsData, TabProps } from './model'

type IntlPlan = StoreSettingsData['intl']['plan']
const PLANS: { id: IntlPlan; name: string; price: number; orders: number }[] = [
  { id: 'starter', name: 'Starter', price: 100, orders: 200 },
  { id: 'growth', name: 'Growth', price: 250, orders: 600 },
  { id: 'pro', name: 'Pro', price: 500, orders: 1500 },
]

export function InternationalTab({ data, set, errors }: TabProps) {
  const i = data.intl
  const qrRef = useRef<HTMLInputElement>(null)
  const [qrError, setQrError] = useState('')
  const onQr = (f?: File) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setQrError('Upload the QR as an image (PNG or JPG).')
    if (f.size > 2 * 1024 * 1024) return setQrError('QR image must be under 2 MB.')
    setQrError('')
    const reader = new FileReader()
    reader.onload = () => set('intl', { upiQrUrl: String(reader.result), upiQrName: f.name })
    reader.readAsDataURL(f)
  }
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SettingRow icon={<Globe2 size={15} />} title="Sell to buyers outside India"
          description={i.enabled ? `On · ${PLANS.find((p) => p.id === i.plan)!.name} plan. Buyers abroad see USD prices and pay you directly.` : 'Off. Buyers outside India can browse but can’t buy.'}
          control={<Toggle label="Sell internationally" checked={i.enabled} onCheckedChange={(v) => set('intl', { enabled: v })} />} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <Card className="flex flex-col gap-3">
          <h3 className="font-sans text-[15px] font-extrabold">How it works</h3>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13px] text-ink-2">
            <li>A buyer outside India picks photos and sees the price in US dollars.</li>
            <li>They pay you directly using your payment link or UPI QR. Frameline takes no commission.</li>
            <li>You mark the order paid; the buyer gets the photos without a watermark.</li>
          </ol>
          <div className="mt-1 text-[12px] font-bold text-ink-2">Pick a yearly plan</div>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
            {PLANS.map((p) => {
              const on = i.plan === p.id
              return (
                <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => set('intl', { plan: p.id })}
                  className={cn('rounded-card border p-3 text-left transition', on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunk')}>
                  <div className="flex items-center justify-between"><span className="text-[16px] font-extrabold">{p.name}</span>{p.id === 'growth' && <Chip tone="accent">Popular</Chip>}</div>
                  <div className="text-[20px] font-bold tnum">${p.price}<span className="font-sans text-[12px] font-normal text-ink-3"> /year</span></div>
                  <div className="text-[12px] text-ink-2">{p.orders.toLocaleString('en-IN')} orders a year</div>
                  <div className="text-[11px] text-ink-3">${(p.price / p.orders).toFixed(2)} per order</div>
                </button>
              )
            })}
          </div>
          <div className="rounded-control bg-sunk p-3 text-[12px] text-ink-2">
            <b className="text-ink">How orders are counted.</b> One checkout is one order, however many photos it has. Refunded orders don’t count. If you run out, extra orders cost $0.60 each, or you can move up a plan and pay only the difference.
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <h3 className="font-sans text-[15px] font-extrabold">How buyers pay you</h3>
          <Field label="Payment link" hint="PayPal.me, Stripe or Razorpay payment page" error={errors['international.paymentLink']} htmlFor="intl-link">
            <Input id="intl-link" placeholder="https://paypal.me/northlight" value={i.paymentLink} onChange={(e) => set('intl', { paymentLink: e.target.value.trim() })} />
          </Field>
          <Field label="UPI QR (for NRI buyers with Indian UPI)" error={qrError}>
            {i.upiQrUrl ? (
              <div className="flex items-center gap-3">
                <img src={i.upiQrUrl} alt="Your UPI QR" className="size-20 rounded-control border border-line bg-white object-contain p-1" />
                <div className="min-w-0 flex-1 truncate text-[11.5px] text-ink-3">{i.upiQrName}</div>
                <Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => set('intl', { upiQrUrl: '', upiQrName: '' })}>Remove</Button>
              </div>
            ) : (
              <Button icon={<QrCode size={14} />} onClick={() => qrRef.current?.click()}>Upload QR image</Button>
            )}
            <input ref={qrRef} type="file" hidden accept="image/*" onChange={(e) => { onQr(e.target.files?.[0]); e.target.value = '' }} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact email for buyers" htmlFor="intl-email"><Input id="intl-email" type="email" value={i.email} onChange={(e) => set('intl', { email: e.target.value })} /></Field>
            <Field label="WhatsApp" htmlFor="intl-wa"><Input id="intl-wa" value={i.whatsapp} onChange={(e) => set('intl', { whatsapp: e.target.value })} /></Field>
          </div>
          {i.upiQrUrl && <p className="flex items-center gap-1.5 text-[11.5px] text-ink-3"><Upload size={12} /> The QR is shown to buyers at checkout.</p>}
        </Card>
      </div>
    </div>
  )
}
