import { useEffect, useState, type ReactNode } from 'react'
import { CreditCard, Smartphone, Wallet } from 'lucide-react'
import { fmt, type Usage } from '@frameline/shared'
import { Button, cn, Field, Input, Meter, Modal, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { useLocalState } from '../wallet/lib'
import { usePurchases } from '../wallet/purchases'
import { BASE_RENEWAL, withGst } from './usePlanState'

type ModalProps = { open: boolean; onOpenChange: (v: boolean) => void }

/* ---------------- Payment method picker ---------------- */
export type PayWith = 'upi' | 'card' | 'credits'
export function PayMethods({ value, onChange, credits, needed }: { value: PayWith; onChange: (v: PayWith) => void; credits?: number; needed?: number }) {
  const opts: { value: PayWith; label: string; hint: string; icon: ReactNode; disabled?: boolean }[] = [
    { value: 'upi', label: 'UPI', hint: 'GPay, PhonePe, Paytm', icon: <Smartphone size={15} /> },
    { value: 'card', label: 'Card', hint: 'Credit or debit', icon: <CreditCard size={15} /> },
  ]
  if (credits !== undefined && needed !== undefined) opts.push({ value: 'credits', label: 'Wallet credits', hint: credits >= needed ? `${fmt.rupees(credits)} available` : `Only ${fmt.rupees(credits)} available`, icon: <Wallet size={15} />, disabled: credits < needed })
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

/* ---------------- Capacity explainer ---------------- */
export function CapacityModal({ open, onOpenChange, usage }: ModalProps & { usage: Usage }) {
  const free = Math.max(0, usage.photosLimit - usage.photosUsed - usage.guestReserved)
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="How upload capacity is calculated" width={520}
      footer={<Button variant="primary" onClick={() => onOpenChange(false)}>Got it</Button>}>
      <div className="flex flex-col gap-3 px-6 py-4 text-[13px]">
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 font-mono tnum">
          <span className="font-sans text-ink-2">Plan capacity this year</span><span className="text-right">{fmt.count(usage.photosLimit)}</span>
          <span className="font-sans text-ink-2">Slots used by your uploads</span><span className="text-right">− {fmt.count(usage.photosUsed)}</span>
          <span className="font-sans text-ink-2">Reserved for guest uploads</span><span className="text-right">− {fmt.count(usage.guestReserved)}</span>
          <span className="border-t border-line pt-1.5 font-sans font-bold">Free to upload</span><span className="border-t border-line pt-1.5 text-right font-bold">{fmt.count(free)}</span>
        </div>
        <Meter value={usage.photosUsed + usage.guestReserved} max={usage.photosLimit} height={8} />
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-ink-2">
          <li><b className="text-ink">One photo = one slot.</b> Original-quality uploads use 2 slots because they’re stored twice.</li>
          <li><b className="text-ink">Guest uploads are reserved up front.</b> Each event’s guest-upload limit is set aside so guests never hit a wall mid-party.</li>
          <li><b className="text-ink">Deleted photos free their slot</b> only if deleted within 7 days of upload. After that the slot stays used for the plan year, because the photo was already delivered.</li>
          <li><b className="text-ink">Slots reset</b> when your plan renews on {fmt.date(usage.validTill)}. Event packs add capacity to one event only.</li>
        </ul>
      </div>
    </Modal>
  )
}

/* ---------------- Add credits ---------------- */
const PRESETS = [500, 1000, 5000]
export function AddCreditsModal({ open, onOpenChange }: ModalProps) {
  const api = useApi()
  const { add } = usePurchases()
  const [amount, setAmount] = useState('1000')
  const [pay, setPay] = useState<PayWith>('upi')
  useEffect(() => { if (open) { setAmount('1000'); setPay('upi') } }, [open])
  const n = Number(amount)
  const error = !amount ? 'Enter an amount' : n < 100 ? 'Minimum is ₹100' : n > 200000 ? 'Maximum is ₹2,00,000 at a time' : ''
  const buy = useAction((v: number) => api.addCredits(v), {
    success: (bal, v) => `${fmt.rupees(v)} credits added · balance ${fmt.rupees(bal)}`,
    onSuccess: (_, v) => { add({ item: `Wallet credits · ${fmt.rupees(v)}`, kind: 'credits', amount: v, paidWith: pay === 'upi' ? 'UPI' : 'Card' }); onOpenChange(false) },
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

/* ---------------- Redeem code ---------------- */
const CODES: Record<string, number> = { WELCOME500: 500 }
export function RedeemModal({ open, onOpenChange }: ModalProps) {
  const api = useApi()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [used, setUsed] = useLocalState<string[]>('frameline.redeemed', [])
  useEffect(() => { if (open) { setCode(''); setError('') } }, [open])
  const redeem = useAction((v: number) => api.addCredits(v), {
    success: (bal, v) => `Code applied · ${fmt.rupees(v)} credits added (balance ${fmt.rupees(bal)})`,
    onSuccess: () => { setUsed((l) => [...l, code.trim().toUpperCase()]); onOpenChange(false) },
  })
  const submit = () => {
    const c = code.trim().toUpperCase()
    if (!c) return setError('Enter the code from your email or voucher.')
    if (used.includes(c)) return setError(`${c} was already used on this account.`)
    if (!(c in CODES)) return setError(`${c} isn’t a valid code. Check for typos; codes are letters and numbers only.`)
    setError(''); redeem.mutate(CODES[c])
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Redeem a code" width={420}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={redeem.isPending} onClick={submit}>Redeem</Button></>}>
      <form className="px-6 py-4" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Code" error={error} hint="Try WELCOME500" htmlFor="redeem-code">
          <Input id="redeem-code" autoFocus className="font-mono uppercase" value={code} onChange={(e) => { setCode(e.target.value); setError('') }} placeholder="WELCOME500" />
        </Field>
      </form>
    </Modal>
  )
}

/* ---------------- Renewal multiplier ---------------- */
export function MultiplierModal({ open, onOpenChange, value, onSave }: ModalProps & { value: number; onSave: (v: number) => void }) {
  const toast = useToast()
  const [v, setV] = useState(String(value))
  useEffect(() => { if (open) setV(value.toFixed(1)) }, [open, value])
  const n = Number(v)
  const error = !v || !Number.isFinite(n) ? 'Enter a number like 2.0' : n < 1 ? 'Minimum is 1.0 (the base price, no markup)' : n > 10 ? 'Maximum is 10.0' : ''
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Client renewal pricing" description="What clients pay when they renew an event with your renewal link." width={480}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={!!error} onClick={() => { onSave(Math.round(n * 10) / 10); toast.success('Renewal price saved', `Clients now pay ${n.toFixed(1)}× the base price.`); onOpenChange(false) }}>Save</Button></>}>
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
