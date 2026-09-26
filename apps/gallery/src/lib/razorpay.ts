import type { Order, OrderPayment } from '@frameline/shared'

/** Razorpay Checkout is only used when a key is configured; otherwise orders go through the API's simulated payment. */
export const RAZORPAY_KEY = (import.meta.env.VITE_RAZORPAY_KEY as string | undefined)?.trim() || undefined

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

interface RazorpayResponse { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface RazorpayInstance { open(): void; on(event: 'payment.failed', fn: (r: { error?: { description?: string } }) => void): void }
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance

let loading: Promise<RazorpayCtor> | null = null

/** Loads checkout.js on demand (never at startup, so the gallery and its offline shell don't depend on it). */
function loadRazorpay(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor }
  if (w.Razorpay) return Promise.resolve(w.Razorpay)
  loading ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error('Razorpay didn’t load.')))
    s.onerror = () => { loading = null; s.remove(); reject(new Error('We couldn’t reach the payment page. Check your connection and try again.')) }
    document.head.appendChild(s)
  })
  return loading
}

/** Opens Razorpay Checkout for a pending order and resolves with the payment to send to api.confirmOrder. */
export async function payWithRazorpay(order: Order, opts: { name: string; description: string; buyer: { name: string; email: string; phone?: string }; color?: string }): Promise<OrderPayment> {
  const checkout = order.checkout
  if (!checkout) throw new Error('This order has nothing to pay.')
  const Razorpay = await loadRazorpay()
  return new Promise<OrderPayment>((resolve, reject) => {
    const rz = new Razorpay({
      key: checkout.keyId || RAZORPAY_KEY,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: opts.name,
      description: opts.description,
      prefill: { name: opts.buyer.name, email: opts.buyer.email, contact: opts.buyer.phone },
      theme: opts.color ? { color: opts.color } : undefined,
      handler: (r: RazorpayResponse) => resolve({ providerOrderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
      modal: { ondismiss: () => reject(new Error('Payment was cancelled. Your order is saved — tap Pay now to try again.')) },
    })
    rz.on('payment.failed', (r) => reject(new Error(r.error?.description ?? 'The payment failed. Try again or use another method.')))
    rz.open()
  })
}
