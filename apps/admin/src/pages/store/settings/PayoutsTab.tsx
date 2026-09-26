import { useState } from 'react'
import { Eye, EyeOff, Landmark } from 'lucide-react'
import { Card, Chip, DarkCard, Field, Input, Tip } from '@frameline/ui'
import type { StoreSettingsData, TabProps } from './model'

export const maskAccount = (a: string) => (a ? `•••• ${a.slice(-4)}` : '—')

export function PayoutStatusChip({ status }: { status: StoreSettingsData['payout']['status'] }) {
  return status === 'verified' ? <Chip tone="ok" dot>Verified</Chip> : status === 'verifying' ? <Chip tone="accent" dot>Verifying</Chip> : <Chip tone="warn" dot>Not verified</Chip>
}

export function PayoutsTab({ data, set, errors }: TabProps) {
  const p = data.payout
  const [show, setShow] = useState(false)
  // Any change to bank details needs a fresh penny-drop check.
  const change = (patch: Partial<StoreSettingsData['payout']>) => set('payout', { ...patch, status: 'unverified' })
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
      <Card className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-[15px] font-semibold">Payout account</h3>
          <PayoutStatusChip status={p.status} />
        </div>
        <Field label="Account holder" error={errors['payouts.holder']} hint="Exactly as on the cheque or passbook" htmlFor="po-holder">
          <Input id="po-holder" value={p.holder} onChange={(e) => change({ holder: e.target.value })} />
        </Field>
        <Field label="Account number" error={errors['payouts.account']} hint={!show ? `Shown as ${maskAccount(p.account)}` : undefined} htmlFor="po-acc">
          <Input
            id="po-acc" className="font-mono" inputMode="numeric" autoComplete="off" maxLength={18}
            type={show ? 'text' : 'password'} value={p.account}
            onChange={(e) => change({ account: e.target.value.replace(/\D/g, '') })}
            suffix={
              <Tip label={show ? 'Hide number' : 'Show number'}>
                <button type="button" aria-label={show ? 'Hide account number' : 'Show account number'} onClick={() => setShow((v) => !v)} className="text-ink-3 hover:text-ink">
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </Tip>
            }
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="IFSC" error={errors['payouts.ifsc']} htmlFor="po-ifsc">
            <Input id="po-ifsc" className="font-mono uppercase" maxLength={11} value={p.ifsc} onChange={(e) => change({ ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
          </Field>
          <Field label="Bank" error={errors['payouts.bank']} htmlFor="po-bank"><Input id="po-bank" value={p.bank} onChange={(e) => change({ bank: e.target.value })} /></Field>
          <Field label="Branch" htmlFor="po-branch"><Input id="po-branch" value={p.branch} onChange={(e) => change({ branch: e.target.value })} /></Field>
        </div>
        {p.status === 'unverified' && <p className="rounded-control bg-warn-soft px-3 py-2 text-[12px] text-warn">After you save, we send ₹1 to this account to confirm it. Payouts pause until it’s verified (usually a few minutes).</p>}
      </Card>
      <DarkCard className="flex flex-col gap-2 self-start">
        <span className="grid size-[30px] place-items-center rounded-control bg-side-2 text-side-gold"><Landmark size={15} /></span>
        <div className="font-bold">Payouts every Tuesday</div>
        <p className="text-[12px] text-side-ink-2">Your wallet balance goes to <span className="font-mono text-side-ink">{maskAccount(p.account)}</span> · {p.bank || 'your bank'} automatically. Money from an order is held 3 days for refunds first.</p>
        <p className="text-[12px] text-side-ink-2">You can also withdraw any time from Orders & wallet.</p>
      </DarkCard>
    </div>
  )
}
