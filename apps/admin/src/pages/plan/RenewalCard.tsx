import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Copy, Link2, MessageCircle } from 'lucide-react'
import { DEMO_NOW, fmt, hash } from '@frameline/shared'
import { Button, Card, CardHeader, ConfirmDialog, Input, Select, Skeleton, Tip, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents } from '../../lib/queries'
import { copyText } from '../wallet/lib'
import { usePurchases } from '../wallet/purchases'
import { BASE_RENEWAL } from './usePlanState'

/** Client renewal link + renew-with-credits. Pre-selects ?renew=<eventId>. */
export function RenewalCard({ multiplier, credits }: { multiplier: number; credits: number }) {
  const api = useApi()
  const toast = useToast()
  const events = useEvents()
  const { add } = usePurchases()
  const [params] = useSearchParams()
  const [eventId, setEventId] = useState('')
  const [link, setLink] = useState('')
  const [confirm, setConfirm] = useState(false)

  const list = (events.data ?? []).filter((e) => e.status !== 'draft').sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
  useEffect(() => {
    if (eventId || !events.data) return
    const want = params.get('renew')
    const hit = want && events.data.find((e) => e.id === want || e.shortId.toLowerCase() === want.toLowerCase())
    setEventId(hit ? hit.id : list[0]?.id ?? '')
  }, [events.data, params, eventId, list])
  const ev = events.data?.find((e) => e.id === eventId)
  const clientPrice = Math.round(BASE_RENEWAL * multiplier)
  const creditPrice = Math.round(BASE_RENEWAL * 0.5)

  const renew = useAction(async () => {
    if (!ev) throw new Error('Pick an event')
    if (credits < creditPrice) throw new Error(`You need ${fmt.rupees(creditPrice)} in credits; you have ${fmt.rupees(credits)}. Add credits first.`)
    await api.addCredits(-creditPrice)
    const from = Math.max(new Date(ev.expiresAt).getTime(), DEMO_NOW)
    const expiresAt = new Date(from + 365 * 86_400_000).toISOString()
    await api.updateEvent(ev.id, { expiresAt, status: ev.status === 'expiring' ? 'live' : ev.status })
    add({ item: `Event renewal · ${ev.name} (50% off with credits)`, kind: 'renewal', amount: creditPrice, gst: 0, paidWith: 'Wallet credits' })
    return expiresAt
  }, { success: (exp) => `${ev?.name} renewed till ${fmt.date(exp)}` })

  const create = () => {
    if (!ev) return
    const code = (hash(ev.id + multiplier) >>> 0).toString(36).slice(0, 6)
    setLink(`https://frameline.in/renew/${ev.shortId.toLowerCase()}?c=${code}`)
  }
  const share = `Hi! Your photo gallery "${ev?.name}" expires on ${ev ? fmt.date(ev.expiresAt) : ''}. Keep it online for another year for ${fmt.rupees(clientPrice)}: ${link}`

  return (
    <Card className="flex flex-col gap-2.5">
      <CardHeader title="Renewal link for a client" className="mb-0" />
      <p className="text-[12.5px] text-ink-2">Send the school or couple a link to extend their event themselves. They pay your price ({fmt.rupees(clientPrice)}); the markup lands in your wallet. You can also renew at 50% off with credits.</p>
      {events.isLoading ? <Skeleton className="h-9" /> : (
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Event to renew" className="min-w-0 flex-1 basis-48" value={eventId} onChange={(e) => { setEventId(e.target.value); setLink('') }}>
            {list.map((e) => <option key={e.id} value={e.id}>{e.name} · expires {fmt.date(e.expiresAt)}</option>)}
          </Select>
          <Button variant="dark" icon={<Link2 size={14} />} disabled={!ev} onClick={create}>Create link</Button>
        </div>
      )}
      {link && (
        <div className="flex flex-col gap-2 rounded-control bg-sunk p-2.5">
          <div className="flex gap-2">
            <Input readOnly value={link} aria-label="Renewal link" className="font-mono text-[12px]" onFocus={(e) => e.target.select()} />
            <Tip label="Copy link">
              <Button size="icon" aria-label="Copy link" onClick={async () => (await copyText(link)) ? toast.success('Link copied') : toast.error('Couldn’t copy', 'Select the link and copy it by hand.')}><Copy size={14} /></Button>
            </Tip>
          </div>
          <Button size="sm" className="self-start" icon={<MessageCircle size={13} />} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(share)}`, '_blank', 'noopener')}>Share on WhatsApp</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-[12.5px]">
        <span className="text-ink-2">Or renew it yourself for <b className="font-mono text-ink">{fmt.rupees(creditPrice)}</b> <span className="text-ink-3">(50% off, from credits)</span></span>
        <Button size="sm" disabled={!ev} loading={renew.isPending} onClick={() => setConfirm(true)}>Renew with credits</Button>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Renew with credits?" confirmLabel={`Use ${fmt.rupees(creditPrice)} credits`}
        body={<>Extends <b>{ev?.name}</b> by 12 months. {fmt.rupees(creditPrice)} comes from your wallet credits (you have {fmt.rupees(credits)}).</>}
        onConfirm={() => renew.mutate(undefined)} />
    </Card>
  )
}
