import { Link } from 'react-router-dom'
import { Download, FileText } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Button, Card, EmptyState, Skeleton, useToast } from '@frameline/ui'
import { usePurchases } from '../../lib/queries'
import { downloadCsv } from '../wallet/lib'
import { QueryError } from '../system'
import { useBilling } from './billing'
import { downloadInvoice, PURCHASE_METHOD, purchaseTotals } from './invoices'
import { SectionTitle } from './SideList'

/** Tax invoices for everything bought from Frameline (plans, packs, money added, renewals, AI enhance). */
export function InvoicesTab() {
  const q = usePurchases()
  const toast = useToast()
  const { billing, hasBilling } = useBilling()
  const invoices = (q.data ?? []).filter((p) => p.method !== 'coupon' && p.amount > 0)
  return (
    <div>
      <SectionTitle title="Invoices" description={hasBilling ? 'Every purchase has a tax invoice with your Billing and GST details.' : <>Add your <Link to="/settings/billing" className="font-bold text-accent-text hover:underline">Billing and GST details</Link> so invoices show your address and GSTIN.</>}
        action={<Button size="sm" icon={<Download size={13} />} disabled={!invoices.length} onClick={() => downloadCsv(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, [
          ['Invoice', 'Date', 'For', 'Paid with', 'Amount', 'GST', 'Total'],
          ...invoices.map((p) => { const t = purchaseTotals(p); return [p.invoiceNumber, fmt.date(p.at), p.description, PURCHASE_METHOD[p.method], t.net, t.gst, t.total] }),
        ])}>Export CSV</Button>} />
      <Card padded={false} className="overflow-hidden">
        {q.isError ? <QueryError error={q.error} retry={() => q.refetch()} what="your invoices" /> : q.isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : !invoices.length ? (
          <EmptyState icon={<FileText size={22} />} title="No invoices yet" body="Every plan, pack or top-up you pay for gets a tax invoice here." action={<Link to="/plan" className="font-bold text-accent-text hover:underline">See plans</Link>} />
        ) : (
          <ul>
            {invoices.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <b className="block truncate">{p.description}</b>
                  <span className="block text-[12.5px] text-ink-3">{p.invoiceNumber} · {fmt.date(p.at)} · {PURCHASE_METHOD[p.method]}</span>
                </div>
                <b className="tnum">{fmt.rupees(purchaseTotals(p).total, true)}</b>
                <Button size="sm" icon={<FileText size={13} />} disabled={!billing}
                  onClick={() => { downloadInvoice(p, billing!); toast.success('Invoice downloaded', 'Open it and print to PDF if you need a PDF.') }}>Download</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
