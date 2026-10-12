import type { OrderPayment, StudioCheckout } from '@frameline/shared'

/**
 * Razorpay Checkout for the studio's own purchases (wallet top-up, plan, renewal, photo pack). The API decides:
 * when it answers a card/UPI purchase with a pending payment, the shared client calls this and confirms the
 * signed result. The public key comes with the checkout, so the build needs no Razorpay setting.
 */
const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

interface RazorpayResponse { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface RazorpayInstance { open(): void; on(event: 'payment.failed', fn: (r: { error?: { description?: string } }) => void): void }
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance

let loading: Promise<RazorpayCtor> | null = null

/** Loads checkout.js only when a payment is actually made. */
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

export async function payStudioCheckout(checkout: StudioCheckout, info: { description: string; amount: number }): Promise<OrderPayment> {
  const Razorpay = await loadRazorpay()
  return new Promise<OrderPayment>((resolve, reject) => {
    const rz = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: Math.round(checkout.amount * 100),
      currency: checkout.currency,
      name: 'Frameline',
      description: info.description,
      handler: (r: RazorpayResponse) => resolve({ providerOrderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
      modal: { ondismiss: () => reject(new Error('Payment was cancelled. Nothing was charged.')) },
    })
    rz.on('payment.failed', (r) => reject(new Error(r.error?.description ?? 'The payment failed. Try again or use another method.')))
    rz.open()
  })
}
