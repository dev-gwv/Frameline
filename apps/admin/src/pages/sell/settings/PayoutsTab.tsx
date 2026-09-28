import { useState } from 'react'
import { Eye, EyeOff, Info, RefreshCw } from 'lucide-react'
import type { PayoutCheck } from '@frameline/shared'
import { Button, Card, Chip, Field, Input } from '@frameline/ui'
import { useApi } from '../../../lib/api'
import { useAction } from '../../../lib/queries'
import type { PayoutState } from '../lib'
import type { StoreSettingsData, TabProps } from './model'

export const maskAccount = (last4: string) => (last4 ? `····${last4}` : '')

export function PayoutStatusChip({ state }: { state: PayoutState }) {
  if (state === 'verified') return <Chip tone="ok">Verified</Chip>
  if (state === 'checking') return <Chip tone="accent">Checking</Chip>
  if (state === 'mismatch') return <Chip tone="bad">Name doesn’t match</Chip>
  if (state === 'failed') return <Chip tone="bad">Couldn’t verify</Chip>
  return <Chip tone="warn">Not added</Chip>
}

/** Payout bank account. Saving a new number or IFSC runs the ₹1 check on the server; "Check again" re-runs it. */
export function PayoutsTab({ data, set, errors, state, legalName, check }: TabProps & { state: PayoutState; legalName: string; check?: PayoutCheck }) {
  const p = data.payout
  const api = useApi()
  const [show, setShow] = useState(false)
  const recheck = useAction(() => api.verifyPayoutAccount(), {
    success: (c) => (c.status === 'verified' ? 'Account verified' : c.status === 'name_mismatch' ? 'Checked: the name doesn’t match' : c.status === 'failed' ? 'Checked: the bank didn’t accept it' : 'Checking the account'),
  })
  const change = (patch: Partial<StoreSettingsData['payout']>) => set('payout', 'account' in patch || 'ifsc' in patch ? { ...patch, status: 'unverified' } : patch)
  const edited = !!p.account || (p.status === 'unverified' && !!p.accountLast4)
  return (
    <Card className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-sans text-[15px] font-extrabold">Payout account</h2>
        {!edited && <PayoutStatusChip state={state} />}
      </div>
      {!edited && (state === 'mismatch' || state === 'failed') && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control bg-bad-soft px-3 py-2.5 text-[13px] text-bad">
          <p className="min-w-0 flex-1">
            {state === 'mismatch'
              ? <>The bank has this account under <b>{check?.nameAtBank ?? p.holder}</b>{check?.bankName ? ` (${check.bankName})` : ''}, but your business is <b>{legalName}</b>. Use an account in the business name, or fix the name in Business details.</>
              : check?.message ?? 'The bank didn’t accept the ₹1 test. Check the account number and IFSC.'}
          </p>
          <Button size="sm" icon={<RefreshCw size={13} />} loading={recheck.isPending} onClick={() => recheck.mutate(undefined)}>Check again</Button>
        </div>
      )}
      {!edited && state === 'verified' && check?.nameAtBank && (
        <p className="text-[13px] text-ink-2">The bank has this account under <b className="text-ink">{check.nameAtBank}</b>{check.bankName ? ` at ${check.bankName}` : ''}.</p>
      )}
      <Field label="Account holder" error={errors['payouts.holder']} hint="Exactly as on your cheque or passbook" htmlFor="po-holder">
        <Input id="po-holder" value={p.holder} onChange={(e) => change({ holder: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <Field label={p.accountLast4 ? 'New account number' : 'Account number'} error={errors['payouts.account']}
          hint={p.accountLast4 ? `Saved account ends in ${p.accountLast4}. Leave empty to keep it.` : undefined} htmlFor="po-acc">
          <Input
            id="po-acc" className="tnum" inputMode="numeric" autoComplete="off" maxLength={18}
            type={show ? 'text' : 'password'} value={p.account} placeholder={p.accountLast4 ? `····${p.accountLast4}` : undefined}
            onChange={(e) => change({ account: e.target.value.replace(/\D/g, '') })}
            suffix={
              <button type="button" aria-label={show ? 'Hide account number' : 'Show account number'} onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-1 text-[12px] font-bold text-ink-3 hover:text-ink">
                {show ? <EyeOff size={14} /> : <Eye size={14} />}{show ? 'Hide' : 'Show'}
              </button>
            }
          />
        </Field>
        <Field label="IFSC" error={errors['payouts.ifsc']} htmlFor="po-ifsc">
          <Input id="po-ifsc" className="uppercase" maxLength={11} value={p.ifsc} onChange={(e) => change({ ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bank" error={errors['payouts.bank']} htmlFor="po-bank"><Input id="po-bank" value={p.bank} onChange={(e) => change({ bank: e.target.value })} /></Field>
        <Field label="Branch (optional)" htmlFor="po-branch"><Input id="po-branch" value={p.branch} onChange={(e) => change({ branch: e.target.value })} /></Field>
      </div>
      <div className="flex items-start gap-2 rounded-control bg-sunk px-3.5 py-3 text-[13px] text-ink-2">
        <Info size={15} className="mt-0.5 shrink-0" />
        {state === 'checking' && !edited
          ? <span>We’ve sent ₹1 to this account to check it. It takes about a minute, and this page updates by itself.</span>
          : <span>We send ₹1 to check the account. It takes about a minute. Payouts go every Tuesday once it’s verified.</span>}
      </div>
    </Card>
  )
}
