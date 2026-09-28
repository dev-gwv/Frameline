import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Droplet } from 'lucide-react'
import { fmt, type ID } from '@frameline/shared'
import { Button, Field, Modal, Select, SettingRow, Skeleton, Toggle } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents, usePrices } from '../../lib/queries'
import { PriceRows, pricesValid } from './Prices'

/** Pick an event that doesn't sell yet, check its prices, start selling (turns on the event's store). */
export function SellFromEventModal({ open, onOpenChange, onStarted }: { open: boolean; onOpenChange: (v: boolean) => void; onStarted?: (eventId: ID) => void }) {
  const api = useApi()
  const events = useEvents()
  const prices = usePrices()
  const candidates = (events.data ?? []).filter((e) => !e.settings.storeEnabled && e.status !== 'archived')
  const [eventId, setEventId] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [watermark, setWatermark] = useState(true)
  useEffect(() => {
    if (!open) return
    setDraft({}); setWatermark(true)
    setEventId(candidates.find((e) => e.status === 'live')?.id ?? candidates[0]?.id ?? '')
  }, [open, events.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const ev = candidates.find((e) => e.id === eventId)

  const start = useAction(async (id: ID) => {
    // Prices changed here apply to this event only (settings.priceOverrides); guests of this event pay them.
    const priceOverrides = Object.fromEntries((prices.data ?? []).filter((p) => draft[p.id] !== undefined && Number(draft[p.id]) !== p.price).map((p) => [p.id, Number(draft[p.id])]))
    return api.updateEventSettings(id, { storeEnabled: true, priceOverrides, forSaleWatermark: watermark })
  }, {
    success: (e) => `${e.name} is selling · guests see a Buy button on each photo`,
    onSuccess: (e) => { onOpenChange(false); onStarted?.(e.id) },
  })

  const loading = events.isLoading || prices.isLoading
  const none = !loading && !candidates.length
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Sell photos from an event" width={580}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>{none ? 'Close' : 'Cancel'}</Button>
        {!none && <Button variant="primary" disabled={!ev || !prices.data || !pricesValid(prices.data, draft)} loading={start.isPending} onClick={() => ev && start.mutate(ev.id)}>Start selling</Button>}
      </>}>
      {loading ? <Skeleton className="h-64" /> : none ? (
        <div className="py-4 text-center">
          <b className="block text-[16px]">Every event already sells</b>
          <p className="mt-1 text-[14px] text-ink-2">New events can sell too. Create one, then come back here.</p>
          <Link to="/events?new=1" className="mt-3 inline-flex font-bold text-accent-text hover:underline" onClick={() => onOpenChange(false)}>Create an event</Link>
        </div>
      ) : <>
        <Field label="Event" htmlFor="sfe-event" hint={ev ? `${fmt.date(ev.date)} · ${ev.city} · ${fmt.count(ev.photoCount)} photos` : undefined}>
          <Select id="sfe-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {candidates.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-[12.5px] font-bold text-ink-2">Prices</span>
          <div className="rounded-card border border-line px-3.5">
            {prices.data && <PriceRows prices={prices.data} value={draft} onChange={(id, v) => setDraft((d) => ({ ...d, [id]: v }))} />}
          </div>
          <span className="text-[12px] text-ink-3">Your default prices. Change them for this event only.</span>
        </div>
        <SettingRow icon={<Droplet size={15} />} title="“For sale” watermark on previews" description="Removed from bought photos"
          control={<Toggle label="“For sale” watermark on previews" checked={watermark} onCheckedChange={setWatermark} />} />
      </>}
    </Modal>
  )
}
