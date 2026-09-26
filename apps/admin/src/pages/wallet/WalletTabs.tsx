import { useState, type ReactNode } from 'react'
import { Download, FileText, RefreshCw, Receipt } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fmt, STORE_COMMISSION, type LedgerEntry, type Order, type Purchase } from '@frameline/shared'
import { Button, Chip, cn, EmptyState, Skeleton, Tip, useToast } from '@frameline/ui'
import { errorMessage } from '../../lib/api'
import { useOrders, usePurchases } from '../../lib/queries'
import { QueryError } from '../system'
import { OrderDrawer } from '../store/OrderDrawer'
import { DEFAULT_BILLING, BILLING_KEY, downloadCsv, downloadFile, exportOrdersCsv, money, ORDER_STATUS, orderBreakdown, readLocal, round2, td, th, type Billing } from './lib'
import { LEDGER_TYPES, PURCHASE_METHOD, purchaseGst } from './useWallet'

const Table = ({ children, min = 640 }: { children: ReactNode; min?: number }) => (
  <div className="overflow-x-auto"><table className="w-full text-[13px] tnum" style={{ minWidth: min }}>{children}</table></div>
)
const Toolbar = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">{children}</div>
const stamp = () => new Date().toISOString().slice(0, 10)

/* ---------------- Ledger ---------------- */
type LedgerFilter = 'all' | 'in' | 'sale' | 'payout' | 'refund' | 'renewal-markup' | 'credits'
const FILTERS: { value: LedgerFilter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'in', label: 'Money in' }, { value: 'sale', label: 'Sales' }, { value: 'payout', label: 'Payouts' },
  { value: 'refund', label: 'Refunds' }, { value: 'renewal-markup', label: 'Renewal markups' }, { value: 'credits', label: 'Credits' },
]
const matches = (f: LedgerFilter, l: LedgerEntry) =>
  f === 'all' || (f === 'in' ? l.amount > 0 : f === 'credits' ? l.type.startsWith('credits') : l.type === f)

export function LedgerTab({ ledger, loading, highlight }: { ledger?: LedgerEntry[]; loading: boolean; highlight?: string | null }) {
  const [filter, setFilter] = useState<LedgerFilter>('all')
  const rows = ledger?.filter((l) => matches(filter, l)) ?? []
  return (
    <>
      <Toolbar>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter by type">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" role="radio" aria-checked={filter === f.value} onClick={() => setFilter(f.value)}
              className={cn('rounded-full border px-2.5 py-1 text-[12px] font-bold transition', filter === f.value ? 'border-accent bg-accent-soft text-accent-text' : 'border-line text-ink-2 hover:bg-sunk')}>
              {f.label}
            </button>
          ))}
        </div>
        <Button size="sm" icon={<Download size={12} />} disabled={!rows.length} onClick={() => downloadCsv(`wallet-ledger-${stamp()}.csv`, [
          ['Date & time', 'Description', 'Type', 'Amount (INR)', 'Balance (INR)'],
          ...rows.map((l) => [fmt.fullDateTime(l.at), l.description, LEDGER_TYPES[l.type].label, l.amount.toFixed(2), l.balance.toFixed(2)]),
        ])}>Export CSV</Button>
      </Toolbar>
      {loading ? <div className="px-4 pb-4"><Skeleton className="h-60" /></div> : !rows.length ? (
        <EmptyState icon={<Receipt size={22} />} title="Nothing here yet" body="No entries match this filter. Sales, payouts and credits show up the moment they happen." action={<Button onClick={() => setFilter('all')}>Show all</Button>} />
      ) : (
        <Table>
          <thead><tr><th className={th}>Date & time</th><th className={th}>Description</th><th className={th}>Type</th><th className={`${th} text-right`}>Amount</th><th className={`${th} text-right`}>Balance</th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className={highlight === l.id ? 'bg-accent-soft' : undefined}>
                <td className={`${td} whitespace-nowrap font-mono text-[11.5px] text-ink-2`}>{fmt.dateTime(l.at)}</td>
                <td className={td}>{l.description}{highlight === l.id && <Chip tone="accent" className="ml-2">Just now</Chip>}</td>
                <td className={td}><Chip tone={LEDGER_TYPES[l.type].tone}>{LEDGER_TYPES[l.type].label}</Chip></td>
                <td className={cn(td, 'whitespace-nowrap text-right font-mono', l.amount > 0 ? 'text-ok' : 'text-ink')}>{fmt.signedRupees(l.amount)}</td>
                <td className={`${td} whitespace-nowrap text-right font-mono`}>{fmt.rupees(l.balance, true)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}

/* ---------------- Photo orders ---------------- */
export function OrdersTab() {
  const q = useOrders()
  const toast = useToast()
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [open, setOpen] = useState<Order | null>(null)
  const orders = q.data

  // Re-reads the order from the API (payment providers update it there).
  const refresh = async (o: Order) => {
    setRefreshing(o.id)
    try {
      const r = await q.refetch()
      const now = r.data?.find((x) => x.id === o.id)
      if (!now) toast.error(`Order #${o.number} wasn’t found`, 'It may have been removed. The list is up to date.')
      else if (now.status !== o.status) toast.success(`Order #${o.number}: ${ORDER_STATUS[now.status].label}`, `Was ${ORDER_STATUS[o.status].label.toLowerCase()}.`)
      else toast.toast({ kind: 'info', title: `Order #${o.number} is up to date`, body: `Status: ${ORDER_STATUS[now.status].label}.` })
    } catch (err) {
      toast.error('Couldn’t refresh the order', errorMessage(err))
    } finally { setRefreshing(null) }
  }

  if (q.isError) return <QueryError error={q.error} retry={() => q.refetch()} />
  return (
    <>
      <Toolbar>
        <span className="text-[12px] text-ink-3">Click an order for the buyer, GST split and your share.</span>
        <Button size="sm" icon={<Download size={12} />} disabled={!orders?.length} onClick={() => orders && exportOrdersCsv(orders, 'photo-orders')}>Export CSV</Button>
      </Toolbar>
      {q.isLoading ? <div className="px-4 pb-4"><Skeleton className="h-60" /></div> : !orders?.length ? (
        <EmptyState icon={<Receipt size={22} />} title="No photo orders yet" body="Turn on the store for an event from the Store page. Orders appear here as guests pay." />
      ) : (
        <Table min={820}>
          <thead><tr><th className={th}>Order</th><th className={th}>Buyer</th><th className={th}>Event</th><th className={th}>Items</th><th className={`${th} text-right`}>Paid</th><th className={`${th} text-right`}>Your share</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} tabIndex={0} className="cursor-pointer hover:bg-sunk" onClick={() => setOpen(o)} onKeyDown={(e) => e.key === 'Enter' && setOpen(o)}>
                <td className={`${td} font-mono`}>#{o.number}<div className="font-mono text-[10.5px] text-ink-3">{fmt.dayMonth(o.at)}</div></td>
                <td className={`${td} font-semibold`}>{o.buyer}</td>
                <td className={`${td} text-ink-2`}>{o.eventName}</td>
                <td className={td}>{o.items}</td>
                <td className={`${td} text-right font-mono`}>{money(o.paid, o.currency)}</td>
                <td className={`${td} text-right font-mono`}>{money(o.share, o.currency, true)}</td>
                <td className={td}><Chip tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Chip></td>
                <td className={`${td} text-right`}>
                  <Tip label="Refresh status">
                    <Button size="sm" variant="ghost" aria-label={`Refresh status of order ${o.number}`} loading={refreshing === o.id}
                      icon={refreshing === o.id ? undefined : <RefreshCw size={12} />} onClick={(e) => { e.stopPropagation(); refresh(o) }}>Refresh</Button>
                  </Tip>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <OrderDrawer order={open} onClose={() => setOpen(null)} />
    </>
  )
}

/* ---------------- Plan purchases ---------------- */
export function PlanPurchasesTab() {
  const navigate = useNavigate()
  const q = usePurchases()
  const purchases = q.data ?? []
  if (q.isError) return <QueryError error={q.error} retry={() => q.refetch()} />
  return (
    <>
      <Toolbar>
        <span className="text-[12px] text-ink-3">Plans, event packs, credits, renewals and AI enhance you bought from Frameline.</span>
        <Button size="sm" icon={<Download size={12} />} disabled={!purchases.length} onClick={() => downloadCsv(`plan-purchases-${stamp()}.csv`, [
          ['Date', 'Item', 'Type', 'Amount', 'GST', 'Total', 'Paid with', 'Invoice'],
          ...purchases.map((p) => [fmt.date(p.at), p.description, p.kind, p.amount, purchaseGst(p), round2(p.amount + purchaseGst(p)), PURCHASE_METHOD[p.method], p.invoiceNumber]),
        ])}>Export CSV</Button>
      </Toolbar>
      {q.isLoading ? <div className="px-4 pb-4"><Skeleton className="h-40" /></div> : !purchases.length ? (
        <EmptyState icon={<Receipt size={22} />} title="No purchases yet" body="Plan payments, event packs and wallet top-ups show up here." action={<Button onClick={() => navigate('/plan')}>See plans</Button>} />
      ) : (
        <Table>
          <thead><tr><th className={th}>Date</th><th className={th}>Item</th><th className={th}>Paid with</th><th className={`${th} text-right`}>Amount</th><th className={`${th} text-right`}>GST 18%</th><th className={`${th} text-right`}>Total</th></tr></thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td className={`${td} whitespace-nowrap font-mono text-[11.5px] text-ink-2`}>{fmt.date(p.at)}</td>
                <td className={td}>{p.description}</td>
                <td className={td}>{p.method === 'credits' || p.method === 'coupon' ? <Chip tone="accent">{PURCHASE_METHOD[p.method]}</Chip> : PURCHASE_METHOD[p.method]}</td>
                <td className={`${td} text-right font-mono`}>{fmt.rupees(p.amount, true)}</td>
                <td className={`${td} text-right font-mono text-ink-2`}>{purchaseGst(p) ? fmt.rupees(purchaseGst(p), true) : '—'}</td>
                <td className={`${td} text-right font-mono font-bold`}>{fmt.rupees(round2(p.amount + purchaseGst(p)), true)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="px-4 py-2.5 text-[11.5px] text-ink-3">Purchases paid with wallet credits carry no extra GST: it was charged when you bought the credits.</p>
    </>
  )
}

/* ---------------- Commission ---------------- */
export function CommissionTab() {
  const q = useOrders()
  const rows = (q.data ?? []).filter((o) => o.currency === 'INR').map((o) => ({ o, ...orderBreakdown(o) }))
  const counted = rows.filter((r) => r.o.status !== 'refunded')
  const total = round2(counted.reduce((s, r) => s + r.commission, 0))
  const pctLabel = `${Math.round(STORE_COMMISSION * 100)}%`
  return (
    <>
      <Toolbar>
        <span className="text-[12px] text-ink-3">Frameline keeps {pctLabel} of each sale (GST included). International direct payments have no commission.</span>
        <span className="text-[12.5px]">Total this period <b className="font-mono">{fmt.rupees(total, true)}</b></span>
      </Toolbar>
      {q.isLoading ? <div className="px-4 pb-4"><Skeleton className="h-40" /></div> : (
        <Table>
          <thead><tr><th className={th}>Date</th><th className={th}>Order</th><th className={`${th} text-right`}>Sale</th><th className={`${th} text-right`}>Commission {pctLabel}</th><th className={`${th} text-right`}>of which GST</th><th className={`${th} text-right`}>You received</th></tr></thead>
          <tbody>
            {rows.map(({ o, commission, platformGst }) => (
              <tr key={o.id} className={o.status === 'refunded' ? 'text-ink-3' : ''}>
                <td className={`${td} whitespace-nowrap font-mono text-[11.5px] text-ink-2`}>{fmt.dateTime(o.at)}</td>
                <td className={td}><span className="font-mono">#{o.number}</span> · {o.eventName}{o.status === 'refunded' && <Chip tone="warn" className="ml-2">Refunded · reversed</Chip>}</td>
                <td className={`${td} text-right font-mono`}>{fmt.rupees(o.paid, true)}</td>
                <td className={`${td} text-right font-mono`}>− {fmt.rupees(commission, true)}</td>
                <td className={`${td} text-right font-mono text-ink-2`}>{fmt.rupees(platformGst, true)}</td>
                <td className={`${td} text-right font-mono`}>{fmt.rupees(o.share, true)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}

/* ---------------- Invoices ---------------- */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<string, string>)[c])
function invoiceHtml(p: Purchase, raw: Billing) {
  const b: Billing = { name: esc(raw.name), gstin: esc(raw.gstin), address: esc(raw.address), state: esc(raw.state), email: esc(raw.email) }
  const gst = purchaseGst(p)
  const intra = raw.state === 'Maharashtra'
  const total = round2(p.amount + gst)
  const r = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const tax = !gst ? '<tr><td>GST (charged when the credits were bought)</td><td class="r">₹0.00</td></tr>'
    : intra ? `<tr><td>CGST 9%</td><td class="r">${r(gst / 2)}</td></tr><tr><td>SGST 9%</td><td class="r">${r(gst / 2)}</td></tr>` : `<tr><td>IGST 18%</td><td class="r">${r(gst)}</td></tr>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(p.invoiceNumber)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;color:#1B1712}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{padding:8px;border-bottom:1px solid #EAE2D3;text-align:left}.r{text-align:right}h1{font-family:Georgia,serif}</style></head><body>
<h1>Tax invoice</h1>
<p><b>Frameline Technologies Pvt. Ltd.</b><br>GSTIN 27AAFCF1234K1Z2 · Mumbai, Maharashtra</p>
<p>Invoice <b>${esc(p.invoiceNumber)}</b> · ${fmt.date(p.at)}</p>
<p><b>Billed to</b><br>${b.name}<br>${b.address}<br>${b.state}${b.gstin ? `<br>GSTIN ${b.gstin}` : ''}</p>
<table><tr><th>Item</th><th class="r">Amount</th></tr>
<tr><td>${esc(p.description)}</td><td class="r">${r(p.amount)}</td></tr>
${tax}
<tr><th>Total</th><th class="r">${r(total)}</th></tr></table>
<p>Paid with ${PURCHASE_METHOD[p.method]}. SAC 998314.</p></body></html>`
}

/** One invoice per paid Frameline purchase (coupons are free, so they have none). */
export function InvoicesTab() {
  const q = usePurchases()
  const toast = useToast()
  const invoices = (q.data ?? []).filter((p) => p.method !== 'coupon' && p.amount > 0)
  const download = (p: Purchase) => {
    const b = readLocal<Billing>(BILLING_KEY, DEFAULT_BILLING)
    downloadFile(`${p.invoiceNumber}.html`, invoiceHtml(p, b), 'text/html;charset=utf-8')
    toast.success('Invoice downloaded', 'Open it in a browser and print to PDF if you need a PDF file.')
  }
  if (q.isError) return <QueryError error={q.error} retry={() => q.refetch()} />
  return (
    <>
      <Toolbar><span className="text-[12px] text-ink-3">Tax invoices use your Billing & GST details. Update them before downloading.</span></Toolbar>
      {q.isLoading ? <div className="px-4 pb-4"><Skeleton className="h-40" /></div> : !invoices.length ? (
        <EmptyState icon={<FileText size={22} />} title="No invoices yet" body="Every paid plan, pack or top-up gets a tax invoice here." />
      ) : (
        <Table min={560}>
          <thead><tr><th className={th}>Invoice</th><th className={th}>Date</th><th className={th}>For</th><th className={`${th} text-right`}>Total</th><th className={th}><span className="sr-only">Download</span></th></tr></thead>
          <tbody>
            {invoices.map((p) => (
              <tr key={p.id}>
                <td className={`${td} font-mono`}>{p.invoiceNumber}</td>
                <td className={`${td} whitespace-nowrap font-mono text-[11.5px] text-ink-2`}>{fmt.date(p.at)}</td>
                <td className={td}>{p.description}</td>
                <td className={`${td} text-right font-mono`}>{fmt.rupees(round2(p.amount + purchaseGst(p)), true)}</td>
                <td className={`${td} text-right`}><Button size="sm" icon={<FileText size={12} />} onClick={() => download(p)}>Download</Button></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}
