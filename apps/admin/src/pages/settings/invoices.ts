import { fmt, type Purchase } from '@frameline/shared'
import { downloadFile, round2, type Billing } from '../wallet/lib'

/**
 * Net, GST and total for one Frameline purchase.
 * Plan changes (contract v5) are charged with GST on the server, so `amount` already is the total: split the 18% back out.
 * Everything else: 18% on top of card/UPI payments; none on coupons or wallet payments (GST was paid when the money was added).
 */
export function purchaseTotals(p: Purchase) {
  if (p.kind === 'plan') { const net = round2(p.amount / 1.18); return { net, gst: round2(p.amount - net), total: p.amount } }
  const gst = p.method === 'card' || p.method === 'upi' ? round2(p.amount * 0.18) : 0
  return { net: p.amount, gst, total: round2(p.amount + gst) }
}
export const purchaseGst = (p: Purchase) => purchaseTotals(p).gst
export const PURCHASE_METHOD: Record<Purchase['method'], string> = { card: 'Card', upi: 'UPI', credits: 'Wallet', coupon: 'Code' }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<string, string>)[c])

/** A printable tax invoice (HTML) for one purchase, billed to the studio's Billing and GST details. */
export function invoiceHtml(p: Purchase, raw: Billing) {
  const b: Billing = { name: esc(raw.name), gstin: esc(raw.gstin), address: esc(raw.address), state: esc(raw.state), email: esc(raw.email) }
  const { net, gst, total } = purchaseTotals(p)
  const intra = raw.state === 'Maharashtra'
  const r = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const tax = !gst ? '<tr><td>GST (paid when the money was added to the wallet)</td><td class="r">₹0.00</td></tr>'
    : intra ? `<tr><td>CGST 9%</td><td class="r">${r(gst / 2)}</td></tr><tr><td>SGST 9%</td><td class="r">${r(gst / 2)}</td></tr>` : `<tr><td>IGST 18%</td><td class="r">${r(gst)}</td></tr>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(p.invoiceNumber)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;color:#1B1712}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{padding:8px;border-bottom:1px solid #EAE2D3;text-align:left}.r{text-align:right}h1{font-family:Georgia,serif}</style></head><body>
<h1>Tax invoice</h1>
<p><b>Frameline Technologies Pvt. Ltd.</b><br>GSTIN 27AAFCF1234K1Z2 · Mumbai, Maharashtra</p>
<p>Invoice <b>${esc(p.invoiceNumber)}</b> · ${fmt.date(p.at)}</p>
<p><b>Billed to</b><br>${b.name}<br>${b.address}<br>${b.state}${b.gstin ? `<br>GSTIN ${b.gstin}` : ''}</p>
<table><tr><th>Item</th><th class="r">Amount</th></tr>
<tr><td>${esc(p.description)}</td><td class="r">${r(net)}</td></tr>
${tax}
<tr><th>Total</th><th class="r">${r(total)}</th></tr></table>
<p>Paid with ${PURCHASE_METHOD[p.method]}. SAC 998314.</p></body></html>`
}

export const downloadInvoice = (p: Purchase, billing: Billing) => downloadFile(`${p.invoiceNumber}.html`, invoiceHtml(p, billing), 'text/html;charset=utf-8')
