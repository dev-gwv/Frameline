import { useMemo } from 'react'
import { Download } from 'lucide-react'
import { fmt, type LedgerEntry, type Order } from '@frameline/shared'
import { Button, Modal } from '@frameline/ui'
import { exportOrdersCsv } from './lib'
import { RevenueChart } from './RevenueChart'
import { counts, monthTotals, revenueSeries, storeNow } from './revenue'

/** "Sold this month" → Report: this month's numbers, daily sales for 30 days, and a CSV of the month's orders. */
export function ReportModal({ open, onOpenChange, orders, ledger }: { open: boolean; onOpenChange: (v: boolean) => void; orders: Order[]; ledger?: LedgerEntry[] }) {
  const month = useMemo(() => monthTotals(orders, ledger), [orders, ledger])
  const series = useMemo(() => revenueSeries(orders, 30), [orders])
  const now = new Date(storeNow(orders))
  const monthOrders = orders.filter((o) => { const d = new Date(o.at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() })
  const byEvent = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of monthOrders) if (counts(o) && o.currency === 'INR') m.set(o.eventName, (m.get(o.eventName) ?? 0) + o.paid)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [monthOrders])
  const monthName = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Sales in ${monthName}`} width={640}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        <Button variant="primary" icon={<Download size={14} />} disabled={!monthOrders.length} onClick={() => exportOrdersCsv(monthOrders, `orders-${now.toISOString().slice(0, 7)}`)}>Download {fmt.count(monthOrders.length)} orders (CSV)</Button>
      </>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [fmt.rupees(month.revenue), 'Sold'],
          [fmt.count(month.orders), month.orders === 1 ? 'Order' : 'Orders'],
          [fmt.rupees(Math.round(month.earned)), 'You earned'],
          [`$${month.usd}`, 'Paid directly abroad'],
        ].map(([v, l]) => (
          <div key={l} className="rounded-card bg-sunk px-3 py-2.5">
            <div className="text-[18px] font-extrabold tnum">{v}</div>
            <div className="text-[12.5px] text-ink-2">{l}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 text-[13px] font-bold text-ink-2">Daily sales, last 30 days</div>
        <RevenueChart points={series} />
      </div>
      {!!byEvent.length && (
        <div>
          <div className="mb-1 text-[13px] font-bold text-ink-2">Top events this month</div>
          {byEvent.map(([name, v]) => (
            <div key={name} className="flex justify-between gap-3 border-t border-line py-2 text-[13.5px] first:border-t-0"><span className="truncate">{name}</span><b className="tnum">{fmt.rupees(v)}</b></div>
          ))}
        </div>
      )}
      <p className="text-[12.5px] text-ink-3">“You earned” is after Frameline’s fee, refunds included.</p>
    </Modal>
  )
}
