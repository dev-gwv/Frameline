import { useEffect, useState, type ReactNode } from 'react'
import { CreditCard, Smartphone, Wallet } from 'lucide-react'
import { ApiError, BASE_RENEWAL, fmt } from '@frameline/shared'
import { Button, cn, Field, Input, Meter, Modal, Skeleton } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useAction, useUsageBreakdown } from '../../lib/queries'
import { QueryError } from '../system'
import { td, th } from '../wallet/lib'
import { withGst } from './usePlanState'

type ModalProps = { open: boolean; onOpenChange: (v: boolean) => void }

/* ---------------- Payment method picker ---------------- */
export type PayWith = 'upi' | 'card' | 'credits'
export function PayMethods({ value, onChange, credits, needed, only }: { value: PayWith; onChange: (v: PayWith) => void; credits?: number; needed?: number; only?: PayWith[] }) {
  let opts: { value: PayWith; label: string; hint: string; icon: ReactNode; disabled?: boolean }[] = [
    { value: 'upi', label: 'UPI', hint: 'GPay, PhonePe, Paytm', icon: <Smartphone size={15} /> },
    { value: 'card', label: 'Card', hint: 'Credit or debit', icon: <CreditCard size={15} /> },
  ]
  if (credits !== undefined && needed !== undefined) opts.push({ value: 'credits', label: 'Wallet credits', hint: credits >= needed ? `${fmt.rupees(credits)} available` : `Only ${fmt.rupees(credits)} available`, icon: <Wallet size={15} />, disabled: credits < needed })
  if (only) opts = opts.filter((o) => only.includes(o.value))
  return (
    <div role="radiogroup" aria-label="Pay with" className={cn('grid gap-2', opts.length === 3 ? 'sm:grid-cols-3' : 'grid-cols-2')}>
      {opts.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={o.disabled} onClick={() => onChange(o.value)}
          className={cn('flex items-start gap-2.5 rounded-control border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50', value === o.value ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunk')}>
          <span className="mt-0.5 text-accent-text">{o.icon}</span>
          <span><span className="block text-[13px] font-bold">{o.label}</span><span className="block text-[11.5px] text-ink-3">{o.hint}</span></span>
        </button>
      ))}
    </div>
  )
}

/* ---------------- Capacity explainer (api.getUsageBreakdown) ---------------- */
export function CapacityModal({ open, onOpenChange }: ModalProps) {
  const q = useUsageBreakdown(open)
  const b = q.data
  const events = b?.events.filter((e) => e.counted || e.guestUploads).sort((x, y) => y.counted - x.counted) ?? []
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="How upload capacity is calculated" width={600}
      footer={<Button variant="primary" onClick={() => onOpenChange(false)}>Got it</Button>}>
      <div className="flex flex-col gap-3 px-6 py-4 text-[13px]">
        {q.isError ? <QueryError error={q.error} retry={() => q.refetch()} /> : !b ? <Skeleton className="h-72" /> : <>
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 font-mono tnum">
            <span className="font-sans text-ink-2">Plan capacity</span><span className="text-right">{fmt.count(b.limit)}</span>
            <span className="font-sans text-ink-2">Used by your uploads</span><span className="text-right">− {fmt.count(b.used)}</span>
            <span className="font-sans text-ink-2">Reserved for guest uploads</span><span className="text-right">− {fmt.count(b.guestReserved)}</span>
            <span className="border-t border-line pt-1.5 font-sans font-bold">Free to upload</span><span className="border-t border-line pt-1.5 text-right font-bold">{fmt.count(b.available)}</span>
          </div>
          <Meter value={b.used + b.guestReserved} max={b.limit} height={8} />
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-ink-2">
            {b.rules.map((r) => <li key={r}>{r}</li>)}
          </ul>
          {!!events.length && (
            <div className="-mx-6 overflow-x-auto border-t border-line">
              <table className="w-full min-w-[480px] text-[12.5px] tnum">
                <thead><tr><th className={th}>Event</th><th className={`${th} text-right`}>Web</th><th className={`${th} text-right`}>Originals</th><th className={`${th} text-right`}>Guest</th><th className={`${th} text-right`}>Counted</th></tr></thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.eventId}>
                      <td className={td}>{e.name}</td>
                      <td className={`${td} text-right font-mono`}>{fmt.count(e.webPhotos)}</td>
                      <td className={`${td} text-right font-mono`}>{fmt.count(e.originals)}</td>
                      <td className={`${td} text-right font-mono text-ink-3`}>{fmt.count(e.guestUploads)}</td>
                      <td className={`${td} text-right font-mono font-bold`}>{fmt.count(e.counted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>}
      </div>
    </Modal>
  )
}

/* ---------------- Add credits ---------------- */
const PRESETS = [500, 1000, 5000]
export function AddCreditsModal({ open, onOpenChange }: ModalProps) {
  const api = useApi()
  const [amount, setAmount] = useState('1000')
  const [pay, setPay] = useState<PayWith>('upi')
  useEffect(() => { if (open) { setAmount('1000'); setPay('upi') } }, [open])
  const n = Number(amount)
  const error = !amount ? 'Enter an amount' : n < 100 ? 'Minimum is ₹100' : n > 200000 ? 'Maximum is ₹2,00,000 at a time' : ''
  const buy = useAction((v: number) => api.addCredits(v), {
    success: (bal, v) => `${fmt.rupees(v)} credits added · balance ${fmt.rupees(bal)}`,
    onSuccess: () => onOpenChange(false),
  })
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add wallet credits" description="1 credit = ₹1. Use credits for event packs, renewals and AI enhance." width={480}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={!!error} loading={buy.isPending} onClick={() => buy.mutate(n)}>Pay {error ? '' : fmt.rupees(withGst(n), true)}</Button></>}>
      <div className="flex flex-col gap-3 px-6 py-4">
        <Field label="Credits to add" error={amount && error} htmlFor="cr-amount">
          <Input id="cr-amount" autoFocus inputMode="numeric" className="font-mono" icon={<span className="font-mono">₹</span>} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <div className="flex gap-2">
          {PRESETS.map((p) => <Button key={p} size="sm" variant={n === p ? 'dark' : 'secondary'} onClick={() => setAmount(String(p))}>{fmt.rupees(p)}</Button>)}
        </div>
        {!error && (
          <div className="grid grid-cols-[1fr_auto] gap-y-1 rounded-control bg-sunk p-3 font-mono text-[12.5px] tnum">
            <span className="font-sans text-ink-2">Credits</span><span className="text-right">{fmt.rupees(n, true)}</span>
            <span className="font-sans text-ink-2">GST 18%</span><span className="text-right">{fmt.rupees(Math.round(n * 18) / 100, true)}</span>
            <span className="border-t border-line pt-1 font-sans font-bold">Total payable</span><span className="border-t border-line pt-1 text-right font-bold">{fmt.rupees(withGst(n), true)}</span>
          </div>
        )}
        <PayMethods value={pay} onChange={setPay} />
      </div>
    </Modal>
  )
}

/* ---------------- Redeem code (api.redeemCoupon) ---------------- */
const COUPON_ERRORS: Record<string, string> = {
  invalid_coupon: 'That code isn’t valid. Check for typos; codes are letters and numbers only.',
  coupon_used: 'This code was already used on your account.',
}
export function RedeemModal({ open, onOpenChange }: ModalProps) {
  const api = useApi()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setCode(''); setError('') } }, [open])
  const redeem = useAction((c: string) => api.redeemCoupon(c), { errorToast: false,
    success: (r) => `Code applied · ${fmt.rupees(r.credits)} credits added (balance ${fmt.rupees(r.walletCredits)})`,
    onSuccess: () => onOpenChange(false),
    // Known coupon problems are shown next to the field instead of a toast.
    error: 'Code not applied',
    onError: (err) => setError(err instanceof ApiError && COUPON_ERRORS[err.code] ? COUPON_ERRORS[err.code] : errorMessage(err)),
  })
  const submit = () => {
    const c = code.trim().toUpperCase()
    if (!c) return setError('Enter the code from your email or voucher.')
    setError(''); redeem.mutate(c)
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Redeem a code" width={420}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={redeem.isPending} onClick={submit}>Redeem</Button></>}>
      <form className="px-6 py-4" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Code" error={error} hint="Codes add wallet credits. Each code works once per studio." htmlFor="redeem-code">
          <Input id="redeem-code" autoFocus className="font-mono uppercase" value={code} onChange={(e) => { setCode(e.target.value); setError('') }} placeholder="WELCOME500" />
        </Field>
      </form>
    </Modal>
  )
}

/* ---------------- Renewal multiplier (api.setRenewalMultiplier) ---------------- */
export function MultiplierModal({ open, onOpenChange, value }: ModalProps & { value: number }) {
  const api = useApi()
  const [v, setV] = useState(String(value))
  useEffect(() => { if (open) setV(value.toFixed(1)) }, [open, value])
  const n = Number(v)
  const error = !v || !Number.isFinite(n) ? 'Enter a number like 2.0' : n < 1 ? 'Minimum is 1.0 (the base price, no markup)' : n > 10 ? 'Maximum is 10.0' : ''
  const save = useAction((m: number) => api.setRenewalMultiplier(m), {
    success: (u) => `Renewal price saved · clients now pay ${fmt.rupees(Math.round(BASE_RENEWAL * u.renewalMultiplier))}`,
    onSuccess: () => onOpenChange(false),
  })
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Client renewal pricing" description="What clients pay when they renew an event with your renewal link." width={480}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={!!error} loading={save.isPending} onClick={() => save.mutate(Math.round(n * 10) / 10)}>Save</Button></>}>
      <div className="flex flex-col gap-3 px-6 py-4 text-[13px]">
        <Field label="Multiplier" error={error} htmlFor="mult">
          <Input id="mult" inputMode="decimal" className="w-32 font-mono" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))} suffix={<span className="font-mono text-ink-3">×</span>} />
        </Field>
        <input type="range" min={1} max={5} step={0.1} value={Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 1} onChange={(e) => setV(e.target.value)} aria-label="Multiplier slider" className="accent-[var(--accent)]" />
        {!error && (
          <div className="rounded-control bg-sunk p-3">
            <b>Example:</b> base renewal {fmt.rupees(BASE_RENEWAL)} × {n.toFixed(1)} = client pays <b className="font-mono">{fmt.rupees(Math.round(BASE_RENEWAL * n))}</b>.
            {' '}You receive the markup of <b className="font-mono text-ok">{fmt.rupees(Math.round(BASE_RENEWAL * (n - 1)))}</b> in your wallet; Frameline keeps the base.
          </div>
        )}
      </div>
    </Modal>
  )
}
