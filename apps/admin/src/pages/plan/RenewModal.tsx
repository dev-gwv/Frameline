import { useEffect, useState } from 'react'
import { Copy, MessageCircle, ScanFace } from 'lucide-react'
import { BASE_RENEWAL, EXPIRY_GRACE_DAYS, FACE_RETENTION_DAYS, fmt, RENEWAL_CREDIT_DISCOUNT, type PhotoEvent, type RenewalLink } from '@frameline/shared'
import { Button, Input, Modal, RadioCardGroup, Skeleton, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents, useUsage, useWalletBalance } from '../../lib/queries'
import { useAuth } from '../../lib/auth'
import { copyText } from '../wallet/lib'

const DAY = 86_400_000
/** Who the client is, in words: "the couple", "the school"… (from the event's client host, else the event type). */
function clientWord(e: PhotoEvent) {
  const client = e.hosts.find((h) => h.role === 'client')
  if (client?.name) return client.name.split(/\s+/)[0]
  const t = e.type
  return t === 'wedding' || t === 'engagement' || t === 'couple' ? 'the couple' : t === 'school' ? 'the school' : t === 'corporate' ? 'the company' : t === 'sports' ? 'the organiser' : 'your client'
}

/**
 * Renew one event for a year: renew it yourself from the wallet (or by UPI/card when the wallet is short),
 * or send the client a link to pay your price. Opened from Home "Needs you" / search with /plan?renew=<id>[&faces=1].
 * Exported so Home can mount it too.
 */
export function RenewModal({ eventId, faces, onClose }: { eventId: string | null; faces?: boolean; onClose: () => void }) {
  const api = useApi()
  const toast = useToast()
  const { user } = useAuth()
  const events = useEvents()
  const usage = useUsage()
  const wallet = useWalletBalance(!user || user.role === 'owner')
  const [mode, setMode] = useState<'self' | 'link'>('self')
  const [link, setLink] = useState<RenewalLink | null>(null)
  useEffect(() => { setMode('self'); setLink(null) }, [eventId])

  const ev = eventId ? events.data?.find((e) => e.id === eventId || e.shortId.toLowerCase() === eventId.toLowerCase()) : undefined
  const walletPrice = Math.round(BASE_RENEWAL * (1 - RENEWAL_CREDIT_DISCOUNT))
  const cardPrice = BASE_RENEWAL
  const clientPrice = Math.round(BASE_RENEWAL * (usage.data?.renewalMultiplier ?? 1))
  const balance = wallet.data?.balance ?? 0
  const short = !!wallet.data && balance < walletPrice
  const client = ev ? clientWord(ev) : 'your client'

  const renew = useAction((v: { id: string; payWith: 'credits' | 'card' }) => api.renewEvent(v.id, { payWith: v.payWith }), {
    success: (r) => `${r.event.name} renewed · guests can see it till ${fmt.date(r.event.expiresAt)}`,
    onSuccess: onClose,
  })
  const create = useAction((id: string) => api.createRenewalLink(id), { onSuccess: setLink })
  const message = link && ev ? `Hi! The photo gallery “${ev.name}” closes on ${fmt.date(ev.expiresAt)}. Keep it online for another year for ${fmt.rupees(link.price)}: ${link.url}` : ''

  const closes = ev ? new Date(Math.max(Date.parse(ev.expiresAt), Date.now())) : null
  const facesGone = ev ? new Date(Math.max(Date.parse(ev.expiresAt) + EXPIRY_GRACE_DAYS * DAY, Date.parse(ev.date) + FACE_RETENTION_DAYS * DAY)) : null
  const expired = ev ? Date.parse(ev.expiresAt) < Date.now() : false

  let primary
  if (mode === 'link') primary = link
    ? <Button variant="primary" onClick={onClose}>Done</Button>
    : <Button variant="primary" disabled={!ev} loading={create.isPending} onClick={() => ev && create.mutate(ev.id)}>Create the link</Button>
  else primary = short
    ? <Button variant="primary" disabled={!ev} loading={renew.isPending} onClick={() => ev && renew.mutate({ id: ev.id, payWith: 'card' })}>Pay {fmt.rupees(cardPrice)} by UPI or card</Button>
    : <Button variant="primary" disabled={!ev || !wallet.data} loading={renew.isPending} onClick={() => ev && renew.mutate({ id: ev.id, payWith: 'credits' })}>Renew for {fmt.rupees(walletPrice)}</Button>

  return (
    <Modal open={!!eventId} onOpenChange={(v) => !v && onClose()} width={600}
      title={ev ? `Renew ${ev.name}` : 'Renew an event'}
      description={ev && closes ? (faces
        ? `Face search data for this event is deleted on ${fmt.date(facesGone!.toISOString())} unless you renew.`
        : `${expired ? 'Guests lost access on' : 'Guests lose access on'} ${fmt.date(ev.expiresAt)}. Photos are deleted ${EXPIRY_GRACE_DAYS} days later.`) : undefined}
      footer={<><Button variant="ghost" onClick={onClose}>Not now</Button>{primary}</>}>
      {events.isLoading ? <Skeleton className="h-40" /> : !ev ? (
        <p className="text-[14px] text-ink-2">We couldn’t find that event. It may have been deleted. Pick it from Events and choose Renew from its ⋯ menu.</p>
      ) : <>
        {faces && (
          <div className="flex gap-2.5 rounded-control bg-accent-soft p-3 text-[13.5px]">
            <ScanFace size={17} className="mt-0.5 shrink-0 text-accent-text" />
            <span>Guests find their photos with a selfie using face data we keep for {FACE_RETENTION_DAYS} days after the event. Renewing keeps the gallery and face search working for another year; nothing needs to be set up again.</span>
          </div>
        )}
        <RadioCardGroup label="How to renew" columns={2} value={mode} onChange={setMode} options={[
          { value: 'self', title: 'Renew it myself', description: short ? `One more year · ${fmt.rupees(cardPrice)} by UPI or card` : `One more year · ${fmt.rupees(walletPrice)} from your wallet` },
          { value: 'link', title: `Send ${client} a link`, description: `They pay ${fmt.rupees(clientPrice)}. You keep ${fmt.rupees(Math.max(0, clientPrice - BASE_RENEWAL))}.` },
        ]} />
        {mode === 'self' && (
          <div className="rounded-control bg-sunk px-3.5 py-3 text-[14px]">
            <div className="flex justify-between gap-3"><span>Wallet</span><b className="tnum">{wallet.data ? fmt.rupees(Math.round(balance)) : wallet.isError ? '—' : '…'}</b></div>
            {short && <p className="mt-1 text-[13px] text-ink-2">Your wallet has less than {fmt.rupees(walletPrice)}, so you pay {fmt.rupees(cardPrice)} by UPI or card. Add money to renew for half.</p>}
          </div>
        )}
        {mode === 'link' && (link ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input readOnly value={link.url} aria-label="Renewal link" className="text-[13px]" onFocus={(e) => e.target.select()} />
              <Button icon={<Copy size={14} />} onClick={async () => ((await copyText(link.url)) ? toast.success('Link copied') : toast.error('Couldn’t copy', 'Select the link and copy it by hand.'))}>Copy</Button>
            </div>
            <Button className="self-start" icon={<MessageCircle size={14} />} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener')}>Send on WhatsApp</Button>
            <p className="text-[12.5px] text-ink-3">The link works till {fmt.date(link.expiresAt)}. Change your price under Plan and billing → What clients pay to renew.</p>
          </div>
        ) : <p className="text-[13px] text-ink-2">We make a payment link you can send on WhatsApp. When {client === 'your client' ? 'they pay' : `${client} pays`}, the event is renewed and {fmt.rupees(Math.max(0, clientPrice - BASE_RENEWAL))} comes to your wallet.</p>)}
      </>}
    </Modal>
  )
}
