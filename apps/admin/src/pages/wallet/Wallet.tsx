import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Landmark, Receipt } from 'lucide-react'
import { ApiError, fmt, type LedgerEntry, type StoreSettings } from '@frameline/shared'
import { Button, Card, Chip, DarkCard, Field, Input, Modal, PageHeader, Skeleton, StatCard, TabBar, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { QueryError } from '../system'
import { BillingForm, validateBilling } from './BillingForm'
import { BILLING_KEY, DEFAULT_BILLING, readLocal, round2, writeLocal, type Billing } from './lib'
import { useWallet } from './useWallet'
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
  const [fresh, setFresh] = useState<string | null>(null)
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p }, { replace: true })

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
                <div className="mt-1 text-[12px] text-side-ink-2">{w.destination} · automatic payout every Tuesday</div>
              </DarkCard>
              <StatCard label="Earned this month" value={fmt.rupees(Math.round(w.earned))} trend="sales + renewal markups" />
              <StatCard label="Pending (refund window)" value={fmt.rupees(Math.round(w.pending))} sub={w.pending ? `releases in ${w.releaseDays} ${w.releaseDays === 1 ? 'day' : 'days'}` : 'nothing on hold'} />
            </>}
          </div>
        )}
        <Card padded={false}>
          <div className="px-4 pt-3"><TabBar value={tab} onChange={setTab} tabs={TABS} /></div>
          {tab === 'ledger' && <LedgerTab ledger={w.ledger} loading={w.isLoading} highlight={fresh} />}
          {tab === 'orders' && <OrdersTab />}
          {tab === 'plans' && <PlanPurchasesTab />}
          {tab === 'commission' && <CommissionTab />}
          {tab === 'invoices' && <InvoicesTab />}
        </Card>
      </div>
      <WithdrawModal open={withdrawOpen} onOpenChange={setWithdrawOpen} balance={w.balance} payout={w.payout} destination={w.destination}
        onDone={(e) => { setFresh(e.id); setTab('ledger') }} />
      <BillingModal open={billingOpen} onOpenChange={setBillingOpen} />
    </div>
  )
}

function WithdrawModal({ open, onOpenChange, balance, payout, destination, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; balance: number; payout?: StoreSettings['payout']; destination: string; onDone: (e: LedgerEntry) => void
}) {
  const api = useApi()
  const [amount, setAmount] = useState('')
  const [serverError, setServerError] = useState('')
  const n = Number(amount)
  const error = serverError || (!amount ? '' : !Number.isFinite(n) || n <= 0 ? 'Enter an amount in rupees' : n < 100 ? 'Minimum withdrawal is ₹100' : n > balance ? `You can withdraw up to ${fmt.rupees(balance, true)}` : '')
  const unverified = !payout?.verified
  const withdraw = useAction((v: number) => api.requestPayout(v), { errorToast: false,
    success: (e) => `Payout of ${fmt.rupees(-e.amount, true)} requested · reaches ${destination} within 1 working day`,
    onSuccess: (e) => { setAmount(''); onOpenChange(false); onDone(e) },
    onError: (err) => setServerError(err instanceof ApiError && err.code === 'payout_account_unverified' ? '' : errorMessage(err)),
  })
  return (
    <Modal open={open} onOpenChange={(v) => { if (!v) { setAmount(''); setServerError('') } onOpenChange(v) }} title="Withdraw to your bank" width={440}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={!amount || !!error || unverified} loading={withdraw.isPending} onClick={() => withdraw.mutate(round2(n))}>Withdraw {amount && !error ? fmt.rupees(round2(n), true) : ''}</Button></>}>
      <div className="flex flex-col gap-3 px-6 py-4">
        <Field label="Amount" error={error} hint={`Available ${fmt.rupees(balance, true)}`} htmlFor="wd-amount">
          <Input id="wd-amount" inputMode="decimal" autoFocus className="font-mono" icon={<span className="font-mono">₹</span>} value={amount}
            onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setServerError('') }}
            suffix={<button type="button" className="text-[12px] font-bold text-accent-text" onClick={() => setAmount(String(Math.floor(balance * 100) / 100))}>All</button>} />
        </Field>
        <div className="flex items-center gap-3 rounded-control border border-line p-3">
          <span className="grid size-[30px] place-items-center rounded-control bg-accent-soft text-accent-text"><Landmark size={15} /></span>
          <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-bold">{payout?.holder || 'Payout account'}</div><div className="font-mono text-[12px] text-ink-2">{destination}{payout?.branch ? ` · ${payout.branch}` : ''}</div></div>
          {payout && (payout.verified ? <Chip tone="ok" dot>Verified</Chip> : <Chip tone="warn" dot>Not verified</Chip>)}
        </div>
        {unverified ? (
          <p className="rounded-control bg-warn-soft px-3 py-2 text-[12px] text-warn">
            {payout?.accountLast4 ? 'Your bank account is still being verified.' : 'Add your bank account first.'} Payouts start once it’s verified. <Link to="/store/settings?tab=payouts" className="font-bold underline">Open payout settings</Link>
          </p>
        ) : <p className="text-[12px] text-ink-3">No fee. To change the account, go to <Link to="/store/settings?tab=payouts" className="font-bold text-accent-text hover:underline">Store settings → Payouts</Link>.</p>}
      </div>
    </Modal>
  )
}

/** Billing & GST details for Frameline's invoices. The API has no field for these yet, so they stay in this browser. */
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
