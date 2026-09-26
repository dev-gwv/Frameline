import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, Plus, Settings, ShoppingBag } from 'lucide-react'
import { fmt, STORE_COMMISSION, type Order } from '@frameline/shared'
import { Button, Card, CardHeader, Chip, EmptyState, PageHeader, Segmented, Skeleton, StatCard } from '@frameline/ui'
import { useLedger, useOrders } from '../../lib/queries'
import { QueryError } from '../system'
import { exportOrdersCsv, money, ORDER_STATUS, td, th } from '../wallet/lib'
import { OrderDrawer } from './OrderDrawer'
import { RevenueChart } from './RevenueChart'
import { monthTotals, revenueSeries } from './revenue'
import { CartsCard, PricesCard, SellFromEventModal } from './StoreCards'

export default function Store() {
  const orders = useOrders()
  const ledger = useLedger()
  const navigate = useNavigate()
  const [range, setRange] = useState<'30' | '90'>('30')
  const [sellOpen, setSellOpen] = useState(false)
  const [openOrder, setOpenOrder] = useState<Order | null>(null)

  const series = useMemo(() => (orders.data ? revenueSeries(orders.data) : []), [orders.data])
  const month = useMemo(() => monthTotals(orders.data ?? [], ledger.data), [orders.data, ledger.data])
  const shown = range === '30' ? series.slice(-30) : series
  const pending = orders.data?.filter((o) => o.status === 'pending').length ?? 0
  const salesDays = shown.filter((p) => p.orders || p.usd).length
  const shownOrders = shown.reduce((s, p) => s + p.orders, 0)
  const shownUsd = shown.reduce((s, p) => s + p.usd, 0)

  return (
    <div className="pb-10">
      <PageHeader
        title="Store"
        subtitle="Sell downloads and prints from any event. Money goes to your wallet."
        actions={<>
          <Button icon={<Settings size={14} />} onClick={() => navigate('/store/settings')}>Store settings</Button>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setSellOpen(true)}>Sell from an event</Button>
        </>}
      />
      <div className="grid gap-4 px-4 sm:px-7 lg:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
        <div className="flex min-w-0 flex-col gap-3">
          {orders.isError ? <Card><QueryError error={orders.error} retry={() => orders.refetch()} /></Card> : (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {orders.isLoading ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[84px]" />) : <>
                  <StatCard label={`Revenue · ${month.monthLabel}`} value={fmt.rupees(month.revenue)} sub="before commission" />
                  <StatCard label={`USD sales · ${month.monthLabel}`} value={`$${month.usd}`} sub="paid to you directly" />
                  <StatCard label="Orders · pending" value={<>{fmt.count(month.orders)} <span className="text-ink-3">·</span> {pending}</>} sub="this month · awaiting payment" />
                  <StatCard label={`You earned · ${month.monthLabel}`} value={ledger.isLoading ? '…' : fmt.rupees(Math.round(month.earned))} sub="sales + renewal markup − refunds" />
                </>}
              </div>

              <Card>
                <CardHeader title="Daily revenue" action={
                  <Segmented size="sm" value={range} onChange={setRange} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
                } />
                {orders.isLoading ? <Skeleton className="h-[180px]" /> : <RevenueChart points={shown} />}
                <div className="mt-1 flex flex-wrap justify-between gap-2 text-[12px] text-ink-3">
                  <span>Total <b className="font-mono text-ink tnum">{fmt.rupees(shown.reduce((s, p) => s + p.revenue, 0))}</b> · {fmt.count(shownOrders)} {shownOrders === 1 ? 'order' : 'orders'}{shownUsd ? <> · <span className="font-mono tnum">${shownUsd}</span> international</> : null}</span>
                  <span>{salesDays < 5 ? `Real orders only: sales on ${salesDays} of ${shown.length} days. The line is the 7-day average.` : 'Hover a bar for the day’s total · line is the 7-day average'}</span>
                </div>
              </Card>

              <Card padded={false}>
                <div className="flex items-center justify-between px-4 pb-1 pt-4">
                  <h3 className="font-display text-[15px] font-semibold">Recent orders</h3>
                  <Button size="sm" variant="ghost" icon={<Download size={12} />} disabled={!orders.data?.length} onClick={() => orders.data && exportOrdersCsv(orders.data)}>Export CSV</Button>
                </div>
                {orders.isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : !orders.data?.length ? (
                  <EmptyState icon={<ShoppingBag size={22} />} title="No orders yet" body="Turn the store on for an event and share the gallery. Orders appear here the moment a guest pays." action={<Button variant="primary" onClick={() => setSellOpen(true)}>Sell from an event</Button>} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-[13px]">
                      <thead><tr><th className={th}>Order</th><th className={th}>Buyer</th><th className={th}>Type</th><th className={`${th} text-right`}>Paid</th><th className={`${th} text-right`}>Your share</th><th className={th}>Status</th></tr></thead>
                      <tbody>
                        {orders.data.slice(0, 8).map((o) => (
                          <tr key={o.id} tabIndex={0} className="cursor-pointer hover:bg-sunk focus-visible:bg-sunk" onClick={() => setOpenOrder(o)} onKeyDown={(e) => e.key === 'Enter' && setOpenOrder(o)}>
                            <td className={`${td} font-mono`}>#{o.number}</td>
                            <td className={td}><div className="font-semibold">{o.buyer}</div><div className="text-[11.5px] text-ink-3">{o.eventName}</div></td>
                            <td className={td}>{o.items}</td>
                            <td className={`${td} text-right font-mono tnum`}>{money(o.paid, o.currency)}</td>
                            <td className={`${td} text-right font-mono tnum`}>{money(Math.round(o.share), o.currency)}</td>
                            <td className={td}><Chip tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Chip></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="px-4 py-2.5 text-[12px] text-ink-3">Your share is after GST and the {Math.round(STORE_COMMISSION * 100)}% commission. <Link to="/wallet?tab=orders" className="font-bold text-accent-text hover:underline">All orders →</Link></div>
              </Card>
            </>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <PricesCard />
          <CartsCard />
        </div>
      </div>
      <SellFromEventModal open={sellOpen} onOpenChange={setSellOpen} />
      <OrderDrawer order={openOrder} onClose={() => setOpenOrder(null)} />
    </div>
  )
}
