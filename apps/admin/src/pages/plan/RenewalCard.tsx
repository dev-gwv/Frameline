import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Copy, Link2, MessageCircle, ScanFace } from 'lucide-react'
import { BASE_RENEWAL, fmt, RENEWAL_CREDIT_DISCOUNT, type RenewalLink } from '@frameline/shared'
import { Button, Card, CardHeader, ConfirmDialog, Input, Select, Skeleton, Tip, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents } from '../../lib/queries'
import { QueryError } from '../system'
import { copyText } from '../wallet/lib'

/**
 * Client renewal link (api.createRenewalLink) + renew-with-credits (api.renewEvent).
 * URL: ?renew=<eventId|shortId> preselects the event, ?pay=now opens the renew-with-credits confirm,
 * ?faces=1 explains face-data retention.
 */
export function RenewalCard({ multiplier, credits }: { multiplier: number; credits: number }) {
  const api = useApi()
  const toast = useToast()
  const events = useEvents()
  const [params, setParams] = useSearchParams()
  const [eventId, setEventId] = useState('')
  const [link, setLink] = useState<RenewalLink | null>(null)
  const [confirm, setConfirm] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const faces = params.get('faces') === '1'

  const list = (events.data ?? []).filter((e) => e.status !== 'draft').sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
  useEffect(() => {
    if (eventId || !events.data) return
    const want = params.get('renew')
    const hit = want && events.data.find((e) => e.id === want || e.shortId.toLowerCase() === want.toLowerCase())
    setEventId(hit ? hit.id : list[0]?.id ?? '')
    if (want || faces) card.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (hit && params.get('pay') === 'now') {
      setConfirm(true)
      // Don't reopen the confirm on refresh.
      setParams((p) => { p.delete('pay'); return p }, { replace: true })
    }
  }, [events.data, params, eventId, list, faces, setParams])
  const ev = events.data?.find((e) => e.id === eventId)
  const clientPrice = Math.round(BASE_RENEWAL * multiplier)
  const creditPrice = Math.round(BASE_RENEWAL * (1 - RENEWAL_CREDIT_DISCOUNT))
  const discountPct = Math.round(RENEWAL_CREDIT_DISCOUNT * 100)

  const renew = useAction((id: string) => api.renewEvent(id, { payWith: 'credits' }), {
    success: (r) => `${r.event.name} renewed till ${fmt.date(r.event.expiresAt)} · ${fmt.rupees(r.charged)} credits used`,
  })
  const create = useAction((id: string) => api.createRenewalLink(id), { onSuccess: (l) => setLink(l) })
  const share = link && ev ? `Hi! Your photo gallery "${ev.name}" expires on ${fmt.date(ev.expiresAt)}. Keep it online for another year for ${fmt.rupees(link.price)}: ${link.url}` : ''

  return (
    <div ref={card}>
      <Card className="flex flex-col gap-2.5">
        <CardHeader title="Renewal link for a client" className="mb-0" />
        {faces && (
          <div className="flex gap-2.5 rounded-control bg-accent-soft p-3 text-[12.5px] text-ink">
            <ScanFace size={16} className="mt-0.5 shrink-0 text-accent-text" />
            <div>
              <b>Face data follows the gallery.</b> Face search data for an event is kept while its gallery is online. When the gallery expires,
              guests can’t search by selfie, and after the 7-day grace period the face data is deleted with the photos. Renew the event to keep
              face search working for another year; nothing needs re-indexing.
            </div>
          </div>
        )}
        <p className="text-[12.5px] text-ink-2">Send the school or couple a link to extend their event themselves. They pay your price ({fmt.rupees(clientPrice)}); the markup lands in your wallet. You can also renew at {discountPct}% off with credits.</p>
        {events.isError ? <QueryError error={events.error} retry={() => events.refetch()} /> : events.isLoading ? <Skeleton className="h-9" /> : !list.length ? (
          <p className="text-[12.5px] text-ink-3">No published events to renew yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Event to renew" className="min-w-0 flex-1 basis-48" value={eventId} onChange={(e) => { setEventId(e.target.value); setLink(null) }}>
              {list.map((e) => <option key={e.id} value={e.id}>{e.name} · expires {fmt.date(e.expiresAt)}</option>)}
            </Select>
            <Button variant="dark" icon={<Link2 size={14} />} disabled={!ev} loading={create.isPending} onClick={() => ev && create.mutate(ev.id)}>Create link</Button>
          </div>
        )}
        {link && (
          <div className="flex flex-col gap-2 rounded-control bg-sunk p-2.5">
            <div className="flex gap-2">
              <Input readOnly value={link.url} aria-label="Renewal link" className="font-mono text-[12px]" onFocus={(e) => e.target.select()} />
              <Tip label="Copy link">
                <Button size="icon" aria-label="Copy link" onClick={async () => (await copyText(link.url)) ? toast.success('Link copied') : toast.error('Couldn’t copy', 'Select the link and copy it by hand.')}><Copy size={14} /></Button>
              </Tip>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11.5px] text-ink-3">Client pays <b className="font-mono text-ink">{fmt.rupees(link.price)}</b> · link works till {fmt.date(link.expiresAt)}</span>
              <Button size="sm" icon={<MessageCircle size={13} />} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(share)}`, '_blank', 'noopener')}>Share on WhatsApp</Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-[12.5px]">
          <span className="text-ink-2">Or renew it yourself for <b className="font-mono text-ink">{fmt.rupees(creditPrice)}</b> <span className="text-ink-3">({discountPct}% off, from credits)</span></span>
          <Button size="sm" disabled={!ev} loading={renew.isPending} onClick={() => setConfirm(true)}>Renew with credits</Button>
        </div>
        <ConfirmDialog open={confirm && !!ev} onOpenChange={setConfirm} title="Renew with credits?" confirmLabel={`Use ${fmt.rupees(creditPrice)} credits`}
          body={<>Extends <b>{ev?.name}</b> by 12 months (now expires {ev ? fmt.date(ev.expiresAt) : ''}). {fmt.rupees(creditPrice)} comes from your wallet credits (you have {fmt.rupees(credits)}).
            {credits < creditPrice && <span className="mt-2 block font-semibold text-bad">You need {fmt.rupees(creditPrice - credits)} more in credits. Add credits first.</span>}</>}
          onConfirm={() => ev && renew.mutate(ev.id)} />
      </Card>
    </div>
  )
}
