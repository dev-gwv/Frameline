import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, ShoppingBag } from 'lucide-react'
import { fmt, TONES, toneCss, type Order } from '@frameline/shared'
import { Button, Card, ChecklistSteps, ConfirmDialog, Page, Skeleton, StatCard, TabBar } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useCarts, useEvents, useLedger, useOrders, useStoreSettings, useWalletBalance } from '../../lib/queries'
import { useParamState } from '../../lib/url'
import { useAuth } from '../../lib/auth'
import { QueryError } from '../system'
import { setupState } from './lib'
import { OrderModal } from './OrderModal'
import { ReportModal } from './ReportModal'
import { monthTotals } from './revenue'
import { SellFromEventModal } from './SellFromEventModal'
import { EventsTab, OrdersTab, PayoutsTab } from './SellTabs'
import { DefaultPrices } from './Prices'
import { WithdrawModal } from './WithdrawModal'

type Tab = 'orders' | 'events' | 'prices' | 'payouts' | 'business'
const TABS: { value: Tab; label: string }[] = [
  { value: 'orders', label: 'Orders' }, { value: 'events', label: 'Selling events' }, { value: 'prices', label: 'Prices' },
  { value: 'payouts', label: 'Payouts' }, { value: 'business', label: 'Business details' },
]
const TAB_ALIASES: Record<string, Tab> = { ledger: 'payouts', wallet: 'payouts', selling: 'events' }

/**
 * /sell: first-run checklist until selling is set up, then the dashboard (3 numbers + tabs).
 * Deep links: ?tab=orders|events|prices|payouts, ?order=<id> or /sell/orders/:orderId, ?sell=1 (Sell from an event), ?withdraw=1.
 */
export default function Sell() {
  const navigate = useNavigate()
  const { orderId: routeOrder } = useParams()
  const [params, set] = useParamState()
  const { user } = useAuth()
  const owner = !user || user.role === 'owner'
  const settings = useStoreSettings()
  const events = useEvents()
  const orders = useOrders()
  const ledger = useLedger()
  const wallet = useWalletBalance(owner)
  const carts = useCarts()

  const rawTab = params.get('tab') ?? 'orders'
  const tab: Tab = TAB_ALIASES[rawTab] ?? (TABS.some((t) => t.value === rawTab) ? rawTab as Tab : 'orders')
  const orderKey = routeOrder ?? params.get('order')
  const openOrder = orderKey ? orders.data?.find((o) => o.id === orderKey || String(o.number) === orderKey) ?? null : null
  const sellingCount = (events.data ?? []).filter((e) => e.settings.storeEnabled).length
  const setup = setupState(settings.data, sellingCount)

  const [report, setReport] = useState(false)
  const [remind, setRemind] = useState(false)
  const setTab = (t: Tab) => (t === 'business' ? navigate('/sell/settings/business') : set({ tab: t === 'orders' ? undefined : t }, true))
  const openOrderModal = (o: Order) => set({ order: o.id })
  const closeOrder = () => (routeOrder ? navigate(`/sell${tab !== 'orders' ? `?tab=${tab}` : ''}`, { replace: true }) : set({ order: undefined }))
  const sellOpen = params.get('sell') === '1'
  const withdrawOpen = params.get('withdraw') === '1'

  const modals = <>
    <SellFromEventModal open={sellOpen} onOpenChange={(v) => set({ sell: v ? '1' : undefined })} onStarted={() => setup.live && set({ tab: 'events', sell: undefined })} />
    <OrderModal order={openOrder} onClose={closeOrder} />
    <WithdrawModal open={withdrawOpen} onOpenChange={(v) => set({ withdraw: v ? '1' : undefined })} wallet={wallet.data} settings={settings.data} onDone={() => set({ tab: 'payouts', withdraw: undefined })} />
  </>

  if (settings.isError) return <Page title="Sell photos"><QueryError error={settings.error} retry={() => settings.refetch()} what="selling" /></Page>
  if (settings.isLoading || events.isLoading || orders.isLoading) return (
    <Page title="Sell photos"><div className="grid gap-3.5 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[96px] rounded-card" />)}</div><Skeleton className="mt-5 h-72 rounded-card" /></Page>
  )
  if (!setup.live && !orders.data?.length) return <FirstRun setup={setup} onSell={() => set({ sell: '1' })}>{modals}</FirstRun>

  const month = monthTotals(orders.data ?? [], ledger.data)
  const cartList = carts.data ?? []
  const toRemind = cartList.filter((c) => c.reminders < 3)
  return (
    <Page title="Sell photos" subtitle="Guests buy downloads and prints. Money goes to your wallet."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => set({ sell: '1' })}>Sell from an event</Button>}>
      {!setup.live && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-warn/40 bg-warn-soft">
          <span className="text-[13.5px]"><b>Finish setting up selling.</b> {!setup.business ? 'Add your business details.' : !setup.payout ? 'Add the bank account payouts go to.' : 'Pick an event to sell from.'}</span>
          <Button size="sm" onClick={() => (!setup.business ? navigate('/sell/settings/business') : !setup.payout ? navigate('/sell/settings/payouts') : set({ sell: '1' }))}>Finish set-up</Button>
        </Card>
      )}
      <div className="mb-5 grid gap-3.5 sm:grid-cols-3">
        <StatCard label="In your wallet"
          value={!owner ? '—' : wallet.data ? fmt.rupees(Math.round(wallet.data.balance)) : <Skeleton className="h-7 w-28" />}
          sub={!owner ? 'Only the owner sees the wallet' : wallet.data ? `${fmt.rupees(Math.floor(wallet.data.withdrawable))} can go to your bank` : undefined}
          action={owner ? <Button size="sm" disabled={!wallet.data} onClick={() => set({ withdraw: '1' })}>Withdraw</Button> : undefined} />
        <StatCard label="Sold this month" value={fmt.rupees(Math.round(month.revenue))} sub={`${fmt.count(month.orders)} ${month.orders === 1 ? 'order' : 'orders'}`}
          action={<Button size="sm" onClick={() => setReport(true)}>Report</Button>} />
        <StatCard label="Unpaid carts" value={carts.isLoading ? <Skeleton className="h-7 w-10" /> : fmt.count(cartList.length)}
          sub={cartList.length ? `${fmt.rupees(cartList.reduce((n, c) => n + c.amount, 0))} left in carts` : 'Nobody left without paying'}
          action={<Button size="sm" disabled={!toRemind.length} onClick={() => setRemind(true)}>Send reminders</Button>} />
      </div>

      <TabBar className="mb-4" value={tab} onChange={setTab} tabs={TABS} />
      {tab === 'orders' && <OrdersTab orders={orders.data} loading={orders.isLoading} error={orders.error} retry={() => orders.refetch()} onOpen={openOrderModal} onSell={() => set({ sell: '1' })} />}
      {tab === 'events' && <EventsTab events={events.data} orders={orders.data} loading={events.isLoading} onSell={() => set({ sell: '1' })} />}
      {tab === 'prices' && <DefaultPrices />}
      {tab === 'payouts' && (owner
        ? <PayoutsTab ledger={ledger.data} wallet={wallet.data} settings={settings.data} loading={ledger.isLoading} error={ledger.error} retry={() => ledger.refetch()} onWithdraw={() => set({ withdraw: '1' })} />
        : <Card><p className="text-[14px] text-ink-2">Only the studio owner can see payouts and the wallet.</p></Card>)}

      <ReportModal open={report} onOpenChange={setReport} orders={orders.data ?? []} ledger={ledger.data} />
      <RemindDialog open={remind} onOpenChange={setRemind} ids={toRemind.map((c) => c.orderId)} names={toRemind.map((c) => c.buyer)} />
      {modals}
    </Page>
  )
}

function RemindDialog({ open, onOpenChange, ids, names }: { open: boolean; onOpenChange: (v: boolean) => void; ids: string[]; names: string[] }) {
  const api = useApi()
  const send = useAction((v: string[]) => api.remindCarts(v), { success: (r) => `Reminder sent to ${r.reminded} ${r.reminded === 1 ? 'guest' : 'guests'}` })
  const n = ids.length
  return (
    <ConfirmDialog open={open} onOpenChange={onOpenChange} title={`Send ${n} ${n === 1 ? 'reminder' : 'reminders'}?`} confirmLabel={`Send ${n} ${n === 1 ? 'reminder' : 'reminders'}`}
      body={<>{names.slice(0, 3).join(', ')}{n > 3 ? ` and ${n - 3} more` : ''} get an email with a link back to their cart. Each guest gets at most 3 reminders.</>}
      onConfirm={() => send.mutateAsync(ids)} />
  )
}

function FirstRun({ setup, onSell, children }: { setup: ReturnType<typeof setupState>; onSell: () => void; children: React.ReactNode }) {
  const navigate = useNavigate()
  const next = !setup.business ? 0 : !setup.payout ? 1 : 2
  const btn = (i: number, label: string, onClick: () => void) => <Button size="sm" variant={i === next ? 'primary' : 'secondary'} onClick={onClick}>{label}</Button>
  return (
    <Page title="Sell photos" subtitle="Guests buy their photos and prints. You keep 90%; payouts go to your bank weekly.">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <ChecklistSteps title="Start selling in 3 steps" steps={[
            { title: 'Business details', description: 'PAN and GST, needed by law to pay you', done: setup.business, action: btn(0, 'Add details', () => navigate('/sell/settings/business')) },
            { title: 'Payout bank account', description: 'Where your money goes', done: setup.payout, action: btn(1, 'Add account', () => navigate('/sell/settings/payouts')) },
            { title: 'Prices and events', description: 'Choose what to sell and for how much', done: setup.prices, action: btn(2, 'Set prices', onSell) },
          ]} />
        </Card>
        <Card padded={false} className="overflow-hidden">
          <div className="relative h-[170px]" style={{ background: toneCss(TONES[8 % TONES.length]) }}>
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[12.5px] font-extrabold text-[#1B1712] shadow-card"><ShoppingBag size={13} />Buy · ₹149</span>
          </div>
          <div className="p-[18px]">
            <b className="block">What guests see</b>
            <p className="text-[13.5px] text-ink-2">A “Buy” button on each photo, and an “All your photos” bundle after they take a selfie.</p>
          </div>
        </Card>
      </div>
      {children}
    </Page>
  )
}
