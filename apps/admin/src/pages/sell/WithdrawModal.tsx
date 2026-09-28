import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Landmark } from 'lucide-react'
import { ApiError, fmt, type StoreSettings, type WalletBalance } from '@frameline/shared'
import { Button, Field, Input, Modal } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { round2 } from '../wallet/lib'
import { PayoutStatusChip } from './settings/PayoutsTab'
import { payoutState } from './lib'

export const MIN_WITHDRAW = 100

/** Withdraw to the bank: amount (with "All"), at least ₹100, capped at what's withdrawable, to the verified account. */
export function WithdrawModal({ open, onOpenChange, wallet, settings, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; wallet?: WalletBalance; settings?: StoreSettings; onDone: () => void
}) {
  const api = useApi()
  const navigate = useNavigate()
  const [amount, setAmount] = useState('')
  const [serverError, setServerError] = useState('')
  useEffect(() => { if (open) { setAmount(''); setServerError('') } }, [open])
  const max = Math.floor((wallet?.withdrawable ?? 0) * 100) / 100
  const n = Number(amount)
  const error = serverError || (!amount ? '' : !Number.isFinite(n) || n <= 0 ? 'Enter an amount in rupees'
    : n < MIN_WITHDRAW ? `At least ${fmt.rupees(MIN_WITHDRAW)}` : n > max ? `You can withdraw up to ${fmt.rupees(max, true)}` : '')
  const state = payoutState(settings)
  const p = settings?.payout
  const verified = state === 'verified'

  const withdraw = useAction((v: number) => api.requestPayout(v), {
    errorToast: false,
    success: (e) => `${fmt.rupees(-e.amount, true)} is on its way · arrives in 1–2 working days`,
    onSuccess: () => { onOpenChange(false); onDone() },
    onError: (err) => setServerError(err instanceof ApiError && err.code === 'payout_account_unverified' ? 'Your account isn’t verified yet. Check it in Selling settings first.' : errorMessage(err)),
  })
  const heldBack = round2(Math.max(0, (wallet?.balance ?? 0) - max))

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Withdraw to your bank" width={480}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        {verified
          ? <Button variant="primary" disabled={!amount || !!error} loading={withdraw.isPending} onClick={() => withdraw.mutate(round2(n))}>Withdraw {amount && !error ? fmt.rupees(round2(n), true) : ''}</Button>
          : <Button variant="primary" onClick={() => navigate('/sell/settings/payouts')}>Verify your account first</Button>}
      </>}>
      <Field label="Amount" error={error} hint={`At least ${fmt.rupees(MIN_WITHDRAW)}. You can withdraw ${fmt.rupees(max, true)}.`} htmlFor="wd-amount">
        <Input id="wd-amount" inputMode="decimal" autoFocus className="h-[46px] text-[16px] tnum" icon={<span className="text-[15px]">₹</span>} value={amount}
          disabled={!verified}
          onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setServerError('') }}
          suffix={<button type="button" disabled={!verified || max <= 0} className="rounded-md px-2 py-1 text-[13px] font-extrabold text-accent-text hover:bg-accent-soft disabled:opacity-40" onClick={() => setAmount(String(max))}>All</button>} />
      </Field>
      <div className="flex items-center gap-3 rounded-card border border-line p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-sunk text-ink-2"><Landmark size={16} /></span>
        <div className="min-w-0 flex-1">
          <b className="block truncate">{p?.accountLast4 ? `${p.bank || 'Bank'} ····${p.accountLast4}` : 'No bank account yet'}</b>
          <span className="block truncate text-[12.5px] text-ink-3">{p?.holder || 'Add one in Selling settings'}</span>
        </div>
        <PayoutStatusChip state={state} />
      </div>
      {!verified && (
        <p className="rounded-control bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
          {state === 'checking' ? 'We’re still checking your account with ₹1. It takes about a minute.'
            : state === 'mismatch' ? 'The name on the account doesn’t match your business. Fix it before withdrawing.'
            : state === 'failed' ? 'The bank didn’t accept the ₹1 test. Check the account in Selling settings.'
            : 'Add the bank account your money should go to.'}
        </p>
      )}
      {verified && <p className="text-[13px] text-ink-3">Arrives in 1–2 working days.{heldBack > 0 ? ` The other ${fmt.rupees(heldBack, true)} in your wallet is money you added; it pays for packs, renewals and AI enhance.` : ''}</p>}
    </Modal>
  )
}
