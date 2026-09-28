import { useEffect, useState } from 'react'
import { ApiError, BASE_RENEWAL, fmt } from '@frameline/shared'
import { Button, Field, Input, Meter, Modal, RadioCardGroup, Segmented, Skeleton } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useAction, useUsageBreakdown } from '../../lib/queries'
import { QueryError } from '../system'
import { withGst } from './usePlanState'

type ModalProps = { open: boolean; onOpenChange: (v: boolean) => void }

/* ---------------- How to pay ---------------- */
export type PayWith = 'upi' | 'card' | 'wallet'
/** UPI / Card / Wallet as radio cards. Wallet is disabled when it holds less than `needed`. */
export function PayMethods({ value, onChange, wallet, needed }: { value: PayWith; onChange: (v: PayWith) => void; wallet?: number; needed?: number }) {
  const withWallet = wallet !== undefined && needed !== undefined
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-bold text-ink-2">Pay with</span>
      <RadioCardGroup label="Pay with" value={value} onChange={onChange} columns={withWallet ? 3 : 2} options={[
        { value: 'upi', title: 'UPI', description: 'GPay, PhonePe, Paytm' },
        { value: 'card', title: 'Card', description: 'Credit or debit' },
        ...(withWallet ? [{ value: 'wallet' as const, title: 'Wallet', description: wallet! >= needed! ? `${fmt.rupees(Math.floor(wallet!))} in it` : `Only ${fmt.rupees(Math.floor(wallet!))}`, disabled: wallet! < needed! }] : []),
      ]} />
    </div>
  )
}

/* ---------------- How photos are counted (api.getUsageBreakdown) ---------------- */
export function CapacityModal({ open, onOpenChange }: ModalProps) {
  const q = useUsageBreakdown(open)
  const b = q.data
  const events = b?.events.filter((e) => e.counted || e.guestUploads).sort((x, y) => y.counted - x.counted) ?? []
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="How photos are counted" width={600}
      footer={<Button variant="primary" onClick={() => onOpenChange(false)}>Got it</Button>}>
      {q.isError ? <QueryError error={q.error} retry={() => q.refetch()} what="your photo count" /> : !b ? <Skeleton className="h-72" /> : <>
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[14px] tnum">
          <span className="text-ink-2">Photos in your plan</span><span className="text-right">{fmt.count(b.limit)}</span>
          <span className="text-ink-2">Used by your uploads</span><span className="text-right">− {fmt.count(b.used)}</span>
          <span className="text-ink-2">Kept free for guest uploads</span><span className="text-right">− {fmt.count(b.guestReserved)}</span>
          <span className="border-t border-line pt-1.5 font-extrabold">Left to upload</span><span className="border-t border-line pt-1.5 text-right font-extrabold">{fmt.count(b.available)}</span>
        </div>
        <Meter value={b.used + b.guestReserved} max={b.limit} height={8} label="Photos used" />
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] text-ink-2">
          {b.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
        {!!events.length && (
          <div className="-mx-[22px] overflow-x-auto border-t border-line">
            <table className="w-full min-w-[460px] text-[13px] tnum">
              <thead><tr className="text-left text-ink-3">{['Event', 'Web', 'Originals', 'Guest', 'Counted'].map((h, i) => <th key={h} className={`px-[22px] py-2 font-bold ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.eventId} className="border-t border-line">
                    <td className="px-[22px] py-2">{e.name}</td>
                    <td className="px-[22px] py-2 text-right">{fmt.count(e.webPhotos)}</td>
                    <td className="px-[22px] py-2 text-right">{fmt.count(e.originals)}</td>
                    <td className="px-[22px] py-2 text-right text-ink-3">{fmt.count(e.guestUploads)}</td>
                    <td className="px-[22px] py-2 text-right font-bold">{fmt.count(e.counted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}
    </Modal>
  )
}

/* ---------------- Add money ---------------- */
const PRESETS = [500, 1000, 5000]
export function AddMoneyModal({ open, onOpenChange }: ModalProps) {
  const api = useApi()
  const [amount, setAmount] = useState('1000')
  const [pay, setPay] = useState<PayWith>('upi')
  useEffect(() => { if (open) { setAmount('1000'); setPay('upi') } }, [open])
  const n = Number(amount)
  const error = !amount ? 'Enter an amount' : n < 100 ? 'At least ₹100' : n > 200000 ? 'Up to ₹2,00,000 at a time' : ''
  const buy = useAction((v: number) => api.addCredits(v), {
    success: (_, v) => `${fmt.rupees(v)} added to your wallet`,
    onSuccess: () => onOpenChange(false),
  })
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add money to your wallet" description="Pays for event packs, renewals and AI enhance." width={480}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={!!error} loading={buy.isPending} onClick={() => buy.mutate(n)}>Pay {error ? '' : fmt.rupees(withGst(n), true)}</Button></>}>
      <Field label="Amount" error={amount && error} htmlFor="add-amount">
        <Input id="add-amount" autoFocus inputMode="numeric" className="tnum" icon={<span>₹</span>} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <Segmented value={PRESETS.includes(n) ? String(n) : ''} onChange={(v) => setAmount(v)} options={PRESETS.map((p) => ({ value: String(p), label: fmt.rupees(p) }))} />
      {!error && (
        <div className="grid grid-cols-[1fr_auto] gap-y-1 rounded-control bg-sunk p-3 text-[13.5px] tnum">
          <span className="text-ink-2">Added to your wallet</span><span className="text-right">{fmt.rupees(n, true)}</span>
          <span className="text-ink-2">GST 18%</span><span className="text-right">{fmt.rupees(Math.round(n * 18) / 100, true)}</span>
          <span className="border-t border-line pt-1 font-extrabold">You pay</span><span className="border-t border-line pt-1 text-right font-extrabold">{fmt.rupees(withGst(n), true)}</span>
        </div>
      )}
      <PayMethods value={pay} onChange={setPay} />
    </Modal>
  )
}

/* ---------------- Redeem a code (api.redeemCoupon) ---------------- */
const COUPON_ERRORS: Record<string, string> = {
  invalid_coupon: 'That code isn’t valid. Check for typos; codes are letters and numbers only.',
  coupon_used: 'This code was already used on your account.',
}
export function RedeemModal({ open, onOpenChange }: ModalProps) {
  const api = useApi()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setCode(''); setError('') } }, [open])
  const redeem = useAction((c: string) => api.redeemCoupon(c), {
    errorToast: false,
    success: (r) => `Code applied · ${fmt.rupees(r.credits)} added to your wallet`,
    onSuccess: () => onOpenChange(false),
    onError: (err) => setError(err instanceof ApiError && COUPON_ERRORS[err.code] ? COUPON_ERRORS[err.code] : errorMessage(err)),
  })
  const submit = () => {
    const c = code.trim().toUpperCase()
    if (!c) return setError('Enter the code from your email or voucher.')
    setError(''); redeem.mutate(c)
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Redeem a code" width={440}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={redeem.isPending} onClick={submit}>Redeem code</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Code" error={error} hint="Codes add money to your wallet. Each code works once." htmlFor="redeem-code">
          <Input id="redeem-code" autoFocus className="uppercase" value={code} onChange={(e) => { setCode(e.target.value); setError('') }} placeholder="WELCOME500" />
        </Field>
      </form>
    </Modal>
  )
}

/* ---------------- What clients pay to renew (api.setRenewalMultiplier) ---------------- */
export function RenewalPriceModal({ open, onOpenChange, value }: ModalProps & { value: number }) {
  const api = useApi()
  const [v, setV] = useState(String(value))
  useEffect(() => { if (open) setV(String(Math.round(BASE_RENEWAL * value))) }, [open, value])
  const n = Number(v)
  const error = !v || !Number.isFinite(n) ? 'Enter a price in rupees' : n < BASE_RENEWAL ? `At least ${fmt.rupees(BASE_RENEWAL)} (our price, no markup)` : n > BASE_RENEWAL * 10 ? `Up to ${fmt.rupees(BASE_RENEWAL * 10)}` : ''
  const save = useAction((price: number) => api.setRenewalMultiplier(Math.round((price / BASE_RENEWAL) * 10) / 10), {
    success: (u) => `Saved · clients now pay ${fmt.rupees(Math.round(BASE_RENEWAL * u.renewalMultiplier))} to renew`,
    onSuccess: () => onOpenChange(false),
  })
  const rounded = Math.round((n / BASE_RENEWAL) * 10) / 10 * BASE_RENEWAL
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="What clients pay to renew" description="When you send a client a renewal link, they pay this for one more year." width={480}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={!!error} loading={save.isPending} onClick={() => save.mutate(n)}>Save price</Button></>}>
      <Field label="Client price for one year" error={error} hint={!error && rounded !== n ? `Saved as ${fmt.rupees(rounded)} (prices go in steps of ₹100).` : undefined} htmlFor="renew-price">
        <Input id="renew-price" inputMode="numeric" className="w-40 tnum" icon={<span>₹</span>} value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} />
      </Field>
      {!error && (
        <div className="grid grid-cols-[1fr_auto] gap-y-1 rounded-control bg-sunk p-3 text-[13.5px] tnum">
          <span className="text-ink-2">Client pays</span><span className="text-right">{fmt.rupees(rounded)}</span>
          <span className="text-ink-2">Frameline keeps</span><span className="text-right">{fmt.rupees(BASE_RENEWAL)}</span>
          <span className="border-t border-line pt-1 font-extrabold">You keep (to your wallet)</span><span className="border-t border-line pt-1 text-right font-extrabold text-ok">{fmt.rupees(Math.max(0, rounded - BASE_RENEWAL))}</span>
        </div>
      )}
    </Modal>
  )
}
