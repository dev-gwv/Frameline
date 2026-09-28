import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Droplet, MoreHorizontal, Palette, Plus, ShoppingBag, Tag, Trash2, Upload, UserCog } from 'lucide-react'
import { fmt, type EventHost, type HostAccess } from '@frameline/shared'
import { Avatar, Button, Chip, ConfirmDialog, Meter, Modal, SettingRow, Skeleton, Toggle, Menu, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { usePrices, useStoreSettings } from '../../lib/queries'
import { PriceRows, pricesValid } from '../sell/Prices'
import { AddHostModal } from './HostModal'
import { SettingsCard, TextLink, ToggleRow, type CardProps } from './parts'

export function LookCard({ event, set }: CardProps) {
  const navigate = useNavigate()
  const s = event.settings
  return (
    <SettingsCard id="watermark" title="Watermark and look">
      <SettingRow
        icon={<Droplet size={15} />} title="Watermark"
        description={s.watermarkOff ? 'Off: guests see clean photos' : <>Your studio watermark · <TextLink onClick={() => navigate(`/watermark?event=${event.id}`)}>Use a different one</TextLink></>}
        control={<Toggle label="Watermark" checked={!s.watermarkOff} onCheckedChange={(v) => set({ watermarkOff: !v })} />}
      />
      <SettingRow
        icon={<Palette size={15} />} title="Cover and colours" description="Uses your studio look"
        control={<Button size="sm" className="max-sm:h-10" onClick={() => navigate('/settings/profile')}>Edit</Button>}
      />
    </SettingsCard>
  )
}

export function SellingCard({ event, set }: CardProps) {
  const navigate = useNavigate()
  const [pricing, setPricing] = useState(false)
  const store = useStoreSettings()
  const s = event.settings
  const ready = !!store.data?.payout.verified
  return (
    <SettingsCard id="selling" title="Selling">
      {ready || s.storeEnabled ? (
        <SettingRow
          icon={<ShoppingBag size={15} />} title="Sell photos from this event"
          description={s.storeEnabled ? <>On: guests can buy photos and prints · <TextLink onClick={() => navigate('/sell')}>Prices and orders</TextLink></> : 'Off: nothing is for sale'}
          control={<Toggle label="Sell photos from this event" checked={s.storeEnabled} onCheckedChange={(v) => set({ storeEnabled: v })} />}
        />
      ) : (
        <SettingRow
          icon={<ShoppingBag size={15} />} title="Sell photos from this event"
          description={store.isLoading ? 'Checking…' : 'Off · set up selling first'}
          control={<Button size="sm" className="max-sm:h-10" disabled={store.isLoading} onClick={() => navigate('/sell')}>Set up</Button>}
        />
      )}
      {s.storeEnabled && (
        <>
          <SettingRow
            icon={<Tag size={15} />} title="Prices"
            description={Object.keys(s.priceOverrides ?? {}).length ? 'Own prices for this event' : 'Your default prices'}
            control={<Button size="sm" className="max-sm:h-10" onClick={() => setPricing(true)}>Change</Button>}
          />
          <ToggleRow
            icon={<Droplet size={15} />} title="“For sale” watermark on previews" checked={s.forSaleWatermark ?? true}
            onChange={(v) => set({ forSaleWatermark: v })}
            description={(s.forSaleWatermark ?? true) ? 'Removed from bought photos' : 'Off: previews show your normal watermark'}
          />
        </>
      )}
      <EventPricesModal open={pricing} onOpenChange={setPricing} overrides={s.priceOverrides ?? {}} onSave={(priceOverrides) => set({ priceOverrides })} />
    </SettingsCard>
  )
}

/** This event's prices (settings.priceOverrides): starts from the studio's price list; only changed prices are stored. */
function EventPricesModal({ open, onOpenChange, overrides, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void; overrides: Record<string, number>; onSave: (o: Record<string, number>) => void
}) {
  const prices = usePrices()
  const [draft, setDraft] = useState<Record<string, string>>({})
  useEffect(() => { if (open) setDraft(Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)]))) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = prices.data ?? []
  const save = () => {
    onSave(Object.fromEntries(list.filter((p) => draft[p.id] !== undefined && Number(draft[p.id]) !== p.price).map((p) => [p.id, Number(draft[p.id])])))
    onOpenChange(false)
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Prices for this event" width={540}
      description="Starts from your default prices. Changes here apply to this event only."
      footer={<>
        <Button variant="ghost" className="mr-auto" onClick={() => setDraft({})}>Use default prices</Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" disabled={!prices.data || !pricesValid(list, draft)} onClick={save}>Save prices</Button>
      </>}>
      {prices.isLoading ? <Skeleton className="h-48" /> : <div className="rounded-card border border-line px-3.5"><PriceRows prices={list} value={draft} onChange={(id, v) => setDraft((d) => ({ ...d, [id]: v }))} /></div>}
    </Modal>
  )
}

export function HostsCard({ event, update }: CardProps) {
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const remove = (h: EventHost) => {
    const before = event.hosts
    void update({ hosts: before.filter((x) => x.id !== h.id) })
    toast.undo(`${h.name} removed as host`, () => void update({ hosts: before }))
  }
  const access = (h: EventHost): HostAccess => h.access ?? 'full'
  const setAccess = (h: EventHost, a: HostAccess) => {
    void update({ hosts: event.hosts.map((x) => (x.id === h.id ? { ...x, access: a } : x)) }).then((err) => {
      if (!err) toast.success(a === 'full' ? `${h.name} can now see everything` : `${h.name} can now only upload photos`)
    })
  }
  return (
    <SettingsCard id="hosts" title="Hosts">
      {event.hosts.length === 0 && <p className="py-2 text-[13px] text-ink-2">No hosts yet. Add the couple or the planner so they can see everything, or a second shooter to upload.</p>}
      {event.hosts.map((h) => (
        <div key={h.id} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
          <Avatar name={h.name} tone="neutral" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] font-bold">{h.name}{h.status === 'invited' && <Chip tone="accent">Invite sent</Chip>}</div>
            <div className="text-[12.5px] text-ink-2">{access(h) === 'upload' ? 'Can only upload photos' : 'Can upload and change settings'}</div>
          </div>
          <Menu width={280} items={[
            access(h) === 'upload'
              ? { label: 'Let them see everything', description: 'And change settings', icon: <UserCog size={15} />, onSelect: () => setAccess(h, 'full') }
              : { label: 'Only let them upload', description: 'For a second shooter', icon: <Upload size={15} />, onSelect: () => setAccess(h, 'upload') },
            'separator',
            { label: 'Remove host', icon: <Trash2 size={15} />, danger: true, onSelect: () => remove(h) },
          ]} trigger={<Button variant="ghost" size="icon" aria-label={`More for ${h.name}`} className="max-sm:size-11"><MoreHorizontal size={16} /></Button>} />
        </div>
      ))}
      <div className="border-t border-line py-3 first:border-t-0">
        <Button size="sm" icon={<Plus size={13} />} className="max-sm:h-10" onClick={() => setAdding(true)}>Add a host</Button>
      </div>
      <AddHostModal open={adding} onOpenChange={setAdding} existing={event.hosts}
        onAdd={(h) => {
          void update({ hosts: [...event.hosts, h] }).then((err) => { if (!err) toast.success(`Invite sent to ${h.email || h.phone}`) })
        }} />
    </SettingsCard>
  )
}

export function LimitCard({ event, onAdd, onDetails }: CardProps & { onAdd: () => void; onDetails: () => void }) {
  const used = event.photoLimit ? event.photoCount / event.photoLimit : 0
  return (
    <SettingsCard id="photo-limit" title="Photo limit" className="pb-4">
      <div className="mb-1.5 mt-2 flex flex-wrap justify-between gap-x-3 text-[13px]">
        <span className="tnum"><b>{fmt.count(event.photoCount)}</b> of {fmt.count(event.photoLimit)} photos</span>
        <span className="text-ink-3">Expires {fmt.date(event.expiresAt)}</span>
      </div>
      <Meter value={event.photoCount} max={event.photoLimit || 1} tone={used >= 1 ? 'bad' : used >= 0.9 ? 'warn' : 'gold'} label="Photos used" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" className="max-sm:h-10" onClick={onAdd}>Add photos</Button>
        <Button size="sm" variant="ghost" className="max-sm:h-10" onClick={onDetails}>Change date or name</Button>
      </div>
    </SettingsCard>
  )
}

export function TurnOffCard({ event, set }: CardProps) {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const [askOff, setAskOff] = useState(false)
  const off = event.settings.disabled
  const del = async () => {
    try {
      await api.deleteEvent(event.id)
      navigate('/events', { replace: true })
      toast.undo(`${event.name} moved to trash`, () => {
        api.restoreEvent(event.id).then(() => toast.success(`${event.name} is back`), (e) => toast.error('Couldn’t restore the event', errorMessage(e)))
      }, 'It’s deleted for good after 30 days.')
    } catch (e) {
      toast.error('Couldn’t delete the event', errorMessage(e))
    }
  }
  return (
    <section id="turn-off" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-[18px] sm:flex-row sm:items-center sm:gap-3.5 md:col-span-2">
      <div className="min-w-0 flex-1">
        <h2 className="font-sans text-[15px] font-extrabold">Turn off or delete</h2>
        <p className="text-[13px] text-ink-2">
          {off ? 'The gallery is off: guests see a “paused” message. Turn it back on any time. ' : 'Turning off hides the gallery until you turn it back on. '}
          Deleting moves the event to trash for 30 days.
        </p>
      </div>
      <div className="flex gap-2">
        {off
          ? <Button className="max-sm:h-11 max-sm:flex-1" onClick={() => { set({ disabled: false }); toast.success('The gallery is on again') }}>Turn on</Button>
          : <Button className="max-sm:h-11 max-sm:flex-1" onClick={() => setAskOff(true)}>Turn off</Button>}
        <Button variant="danger" className="max-sm:h-11 max-sm:flex-1" onClick={() => void del()}>Delete event</Button>
      </div>
      <ConfirmDialog open={askOff} onOpenChange={setAskOff} title="Turn off this gallery?" confirmLabel="Turn off"
        onConfirm={() => set({ disabled: true })}
        body="Guests will see a “this gallery is paused” message until you turn it back on. Nothing is deleted, and your links keep working afterwards." />
    </section>
  )
}
