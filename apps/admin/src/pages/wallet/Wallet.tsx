import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Landmark, Receipt } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Button, Card, DarkCard, Field, Input, Modal, PageHeader, Skeleton, StatCard, TabBar, useToast } from '@frameline/ui'
import { QueryError } from '../system'
import { BillingForm, validateBilling } from './BillingForm'
import { BILLING_KEY, DEFAULT_BILLING, readLocal, round2, writeLocal, type Billing } from './lib'
import { PAYOUT_DEST, useWallet } from './useWallet'
import { CommissionTab, InvoicesTab, LedgerTab, OrdersTab, PlanPurchasesTab } from './WalletTabs'

type Tab = 'ledger' | 'orders' | 'plans' | 'commission' | 'invoices'
const TABS: { value: Tab; label: string }[] = [
  { value: 'ledger', label: 'Wallet ledger' }, { value: 'orders', label: 'Photo orders' }, { value: 'plans', label: 'Plan purchases' },
  { value: 'commission', label: 'Commission' }, { value: 'invoices', label: 'Invoices' },
]

export default function Wallet() {
  const w = useWallet()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'ledger') as Tab
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)

  return (
    <div className="pb-10">
      <PageHeader title="Orders & wallet" subtitle="Every rupee in and out, with a running balance."
        actions={<Button icon={<Receipt size={14} />} onClick={() => setBillingOpen(true)}>Billing & GST details</Button>} />
      <div className="flex flex-col gap-3 px-4 sm:px-7">
        {w.isError ? <Card><QueryError error={w.error} retry={() => w.refetch()} /></Card> : (
          <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr] [&>*]:min-w-0">
            {w.isLoading ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[110px]" />) : <>
              <DarkCard>
                <div className="eyebrow !text-side-ink-2">Wallet balance</div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-gold font-display text-[32px] font-semibold leading-tight tnum">{fmt.rupees(w.balance, true)}</span>
                  <Button variant="primary" disabled={w.balance <= 0} onClick={() => setWithdrawOpen(true)}>Withdraw</Button>
                </div>
                <div className="mt-1 text-[12px] text-side-ink-2">{PAYOUT_DEST} · automatic payout every Tuesday · usable as credits</div>
              </DarkCard>
              <StatCard label="Earned this month" value={fmt.rupees(Math.round(w.earned))} trend="sales + renewal markups" />
              <StatCard label="Pending (refund window)" value={fmt.rupees(Math.round(w.pending))} sub={w.pending ? `releases in ${w.releaseDays} ${w.releaseDays === 1 ? 'day' : 'days'}` : 'nothing on hold'} />
            </>}
          </div>
        )}
        <Card padded={false}>
          <div className="px-4 pt-3"><TabBar value={tab} onChange={(t) => setParams((p) => { p.set('tab', t); return p }, { replace: true })} tabs={TABS} /></div>
          {tab === 'ledger' && <LedgerTab ledger={w.ledger} loading={w.isLoading} />}
          {tab === 'orders' && <OrdersTab />}
          {tab === 'plans' && <PlanPurchasesTab />}
          {tab === 'commission' && <CommissionTab />}
          {tab === 'invoices' && <InvoicesTab />}
        </Card>
      </div>
      <WithdrawModal open={withdrawOpen} onOpenChange={setWithdrawOpen} balance={w.balance} onConfirm={w.withdraw} />
      <BillingModal open={billingOpen} onOpenChange={setBillingOpen} />
    </div>
  )
}

function WithdrawModal({ open, onOpenChange, balance, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; balance: number; onConfirm: (n: number) => void }) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const n = Number(amount)
  const error = !amount ? '' : !Number.isFinite(n) || n <= 0 ? 'Enter an amount in rupees' : n < 100 ? 'Minimum withdrawal is ₹100' : n > balance ? `You can withdraw up to ${fmt.rupees(balance, true)}` : ''
  const confirm = () => {
    onConfirm(round2(n))
    toast.success(`Payout of ${fmt.rupees(round2(n), true)} requested`, `It reaches ${PAYOUT_DEST} within 1 working day.`)
    setAmount(''); onOpenChange(false)
  }
  return (
    <Modal open={open} onOpenChange={(v) => { if (!v) setAmount(''); onOpenChange(v) }} title="Withdraw to your bank" width={440}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={!amount || !!error} onClick={confirm}>Withdraw {amount && !error ? fmt.rupees(round2(n), true) : ''}</Button></>}>
      <div className="flex flex-col gap-3 px-6 py-4">
        <Field label="Amount" error={error} hint={`Available ${fmt.rupees(balance, true)}`} htmlFor="wd-amount">
          <Input id="wd-amount" inputMode="decimal" autoFocus className="font-mono" icon={<span className="font-mono">₹</span>} value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            suffix={<button type="button" className="text-[12px] font-bold text-accent-text" onClick={() => setAmount(String(Math.floor(balance * 100) / 100))}>All</button>} />
        </Field>
        <div className="flex items-center gap-3 rounded-control border border-line p-3">
          <span className="grid size-[30px] place-items-center rounded-control bg-accent-soft text-accent-text"><Landmark size={15} /></span>
          <div className="flex-1"><div className="text-[13px] font-bold">Northlight Studio LLP</div><div className="font-mono text-[12px] text-ink-2">{PAYOUT_DEST} · HDFC Bank</div></div>
        </div>
        <p className="text-[12px] text-ink-3">No fee. To change the account, go to Store settings → Payouts.</p>
      </div>
    </Modal>
  )
}

function BillingModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const toast = useToast()
  const [value, setValue] = useState<Billing>(() => readLocal(BILLING_KEY, DEFAULT_BILLING))
  const [showErrors, setShowErrors] = useState(false)
  useEffect(() => { if (open) { setValue(readLocal(BILLING_KEY, DEFAULT_BILLING)); setShowErrors(false) } }, [open])
  const save = () => {
    if (Object.keys(validateBilling(value)).length) { setShowErrors(true); return }
    writeLocal(BILLING_KEY, value)
    toast.success('Billing details saved', 'New invoices use these details.')
    onOpenChange(false)
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange}
      title="Billing & GST details" description="Printed on your tax invoices for plans, packs and commission." width={520}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save details</Button></>}>
      <div className="px-6 py-4"><BillingForm value={value} onChange={setValue} showErrors={showErrors} /></div>
    </Modal>
  )
}
