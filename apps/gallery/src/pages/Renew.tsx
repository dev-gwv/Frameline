import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarClock, CheckCircle2, Link2Off, Lock } from 'lucide-react'
import { fmt, type PublicRenewal } from '@frameline/shared'
import { useApi } from '../lib/api'
import { friendlyError, isNotFound } from '../lib/errors'
import { payCheckout } from '../lib/razorpay'
import { PrimaryButton, StatePage } from '../components/common'

/**
 * /renew/:id — the renewal link a studio sends its client (POST /v1/events/:id/renewal-link). The client pays
 * here; the API renews the event for a year once Razorpay proves the payment (confirm or webhook).
 */
export function Renew() {
  const { id = '' } = useParams()
  const api = useApi()
  const [link, setLink] = useState<PublicRenewal | null>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.getRenewal(id)
      .then((r) => { if (!cancelled) setLink(r) })
      .catch((err) => { if (!cancelled) { if (isNotFound(err)) setMissing(true); else setError(friendlyError(err).body) } })
    return () => { cancelled = true }
  }, [api, id])

  const pay = async () => {
    if (!link) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.payRenewal(id)
      if ('renewal' in r) setLink(r.renewal)
      else {
        const payment = await payCheckout(r.payment.checkout, { name: link.studioName, description: `Keep ${link.eventName} online for another year` })
        setLink(await api.confirmRenewal(id, payment))
      }
    } catch (err) {
      setError(friendlyError(err, 'The payment didn’t go through').body)
    } finally {
      setBusy(false)
    }
  }

  if (missing) {
    return <StatePage icon={<Link2Off size={24} />} tone="neutral" title="We couldn’t find this payment link" body="It may have been removed. Ask your photographer to send a new one." />
  }
  if (!link) {
    return (
      <StatePage icon={<CalendarClock size={24} />} tone="gold" title="Renew your gallery" body={error ?? 'Loading…'} />
    )
  }
  if (link.paid) {
    return (
      <StatePage icon={<CheckCircle2 size={24} />} tone="ok" title="Thank you! Your gallery is renewed"
        body={`${link.eventName} stays online until ${fmt.date(link.eventExpiresAt)}. ${link.studioName} has been told.`} />
    )
  }
  const expired = Date.parse(link.linkExpiresAt) < Date.now()
  return (
    <StatePage icon={<CalendarClock size={24} />} tone="gold" title={`Keep ${link.eventName} online`}
      body={expired
        ? 'This payment link has expired. Ask your photographer for a new one.'
        : `${link.studioName} asked you to renew this gallery for another year, until ${fmt.date(new Date(Math.max(Date.now(), Date.parse(link.eventExpiresAt)) + 365 * 86_400_000).toISOString())}.`}>
      {!expired && (
        <>
          <PrimaryButton onClick={() => void pay()} disabled={busy}>{busy ? 'Opening payment…' : `Pay ${fmt.rupees(link.price)}`}</PrimaryButton>
          {error && <p role="alert" className="text-[13.5px] font-semibold text-bad">{error}</p>}
          <p className="flex items-center justify-center gap-1.5 text-[12px] text-ink-3"><Lock size={12} />UPI, card or netbanking · Secured by Razorpay</p>
        </>
      )}
    </StatePage>
  )
}
