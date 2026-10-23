import { fmt, type Purchase, type Seller } from '@frameline/shared'
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

/** GST state codes (the first two digits of a GSTIN), for the seller's state. */
const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland',
  '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '25': 'Dadra and Nagar Haveli and Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh',
}
export const sellerState = (s: Seller) => GST_STATES[s.gstin.slice(0, 2)]

/**
 * A printable tax invoice (HTML) for one purchase, billed to the studio's Billing and GST details. The seller is the
 * company set on the server (SELLER_* vars, GET /v1/meta); with none set there are no invoices at all.
 */
export function invoiceHtml(p: Purchase, raw: Billing, seller: Seller) {
  const b: Billing = { name: esc(raw.name), gstin: esc(raw.gstin), address: esc(raw.address), state: esc(raw.state), email: esc(raw.email) }
  const { net, gst, total } = purchaseTotals(p)
  const intra = !!sellerState(seller) && raw.state === sellerState(seller)
  const r = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const tax = !gst ? '<tr><td>GST (paid when the money was added to the wallet)</td><td class="r">₹0.00</td></tr>'
    : intra ? `<tr><td>CGST 9%</td><td class="r">${r(gst / 2)}</td></tr><tr><td>SGST 9%</td><td class="r">${r(gst / 2)}</td></tr>` : `<tr><td>IGST 18%</td><td class="r">${r(gst)}</td></tr>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(p.invoiceNumber)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;color:#1B1712}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{padding:8px;border-bottom:1px solid #EAE2D3;text-align:left}.r{text-align:right}h1{font-family:Georgia,serif}</style></head><body>
<h1>Tax invoice</h1>
<p><b>${esc(seller.name)}</b><br>GSTIN ${esc(seller.gstin)}${seller.address ? ` · ${esc(seller.address)}` : ''}</p>
<p>Invoice <b>${esc(p.invoiceNumber)}</b> · ${fmt.date(p.at)}</p>
<p><b>Billed to</b><br>${b.name}<br>${b.address}<br>${b.state}${b.gstin ? `<br>GSTIN ${b.gstin}` : ''}</p>
<table><tr><th>Item</th><th class="r">Amount</th></tr>
<tr><td>${esc(p.description)}</td><td class="r">${r(net)}</td></tr>
${tax}
<tr><th>Total</th><th class="r">${r(total)}</th></tr></table>
<p>Paid with ${PURCHASE_METHOD[p.method]}. SAC 998314.</p></body></html>`
}

export const downloadInvoice = (p: Purchase, billing: Billing, seller: Seller) => downloadFile(`${p.invoiceNumber}.html`, invoiceHtml(p, billing, seller), 'text/html;charset=utf-8')

/** Said wherever an invoice would be offered while no seller is set. */
export const INVOICES_SOON = 'Tax invoices will be available here soon.'
