import { useState, type ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { fmt, type DownloadMode, type EventSettings, type PhotoEvent } from '@frameline/shared'
import { useApi } from '@/lib/api'
import { useAction, useEventStats } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { useTheme } from '@/theme'
import { Icon, type IconName } from '../Icon'
import { Sheet } from '../overlays'
import { Button, Card, CardTitle, Chip, Meter, RadioCards, SettingRow, SoftCard, Toggle, Txt } from '../primitives'
import { ConfirmSheet } from '../studio'

/** One sentence that says what guests can do (updates as settings change). */
export function guestsCan(e: PhotoEvent) {
  const s = e.settings
  const open = s.access === 'link-pin' ? `open the link with PIN ${s.pin}` : s.access === 'registered' ? 'open the link after signing up' : 'open the link'
  const reg = s.requireRegistration && s.access !== 'registered' ? ' and their name' : ''
  const see = s.faceSearch && s.facePrivacy ? 'see only photos they’re in' : s.faceSearch ? 'browse everything or find themselves with a selfie' : 'browse every photo'
  const dl = s.downloads === 'none' ? 'not download (view only)' : `download ${s.downloads === 'own' ? 'their own photos' : 'any photo'} ${s.originalDownloads ? 'in full size' : 'at web size'}`
  const up = s.guestUploads ? `add up to ${s.guestUploadLimit} photos${s.reviewGuestUploads ? ' for your review' : ''}` : null
  return [open + reg, see, dl, up].filter(Boolean).join(' · ')
}

const DOWNLOADS: { value: DownloadMode; title: string; description: string }[] = [
  { value: 'all', title: 'Everything', description: 'Any photo in the gallery' },
  { value: 'own', title: 'Only photos they’re in', description: 'Found with their selfie' },
  { value: 'none', title: 'Nothing', description: 'View only; they can still buy if selling is on' },
]

/** Settings tab: the "Guests can" line, then grouped toggle cards. Changes save straight away. */
export function SettingsTab({ event }: { event: PhotoEvent }) {
  const { c } = useTheme()
  const api = useApi()
  const s = event.settings
  const { data: stats } = useEventStats(event.id)
  const save = useAction((patch: Partial<EventSettings>) => api.updateEventSettings(event.id, patch), { success: 'Saved' })
  const set = (patch: Partial<EventSettings>) => save.mutate(patch)
  const [ask, setAsk] = useState<'pin' | 'off' | null>(null)
  const [dlOpen, setDlOpen] = useState(false)
  const [dl, setDl] = useState<DownloadMode>(s.downloads)
  const resetPin = useAction(() => api.resetPin(event.id), { success: (pin) => `New PIN ${pin}` })
  const del = useAction(() => api.deleteEvent(event.id), {
    onSuccess: () => {
      router.back()
      toast.undo(`${event.name} moved to trash`, () => { api.restoreEvent(event.id).then(() => toast.success('Event restored')).catch(() => toast.error('Couldn’t restore it', 'Restore it from Recently deleted on the web')) }, 'Restore it within 30 days.')
    },
  })

  const row = (icon: IconName, title: string, detail: string, value: boolean, onChange: (v: boolean) => void, first = false) => (
    <SettingRow first={first} icon={icon} title={title} detail={detail} right={<Toggle label={title} value={value} onChange={onChange} />} />
  )
  const group = (title: string, children: ReactNode) => (
    <Card style={{ paddingBottom: 6 }}>
      <CardTitle title={title} />
      <View style={{ marginTop: 4 }}>{children}</View>
    </Card>
  )

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
      <SoftCard>
        <Txt><Txt weight="heavy">Guests can: </Txt><Txt v="small" color={c.ink2}>{guestsCan(event)}</Txt></Txt>
      </SoftCard>

      {group('Who can open the gallery', <>
        {row('lock', 'Ask for a PIN', s.access === 'link-pin' ? `PIN ${s.pin}` : 'Anyone with the link can open it', s.access === 'link-pin', (v) => set({ access: v ? 'link-pin' : 'link' }), true)}
        {s.access === 'link-pin' ? <View style={{ paddingLeft: 46, marginTop: -6 }}><Button label="Make a new PIN" size="sm" variant="ghost" icon="refresh-cw" style={{ alignSelf: 'flex-start' }} onPress={() => setAsk('pin')} /></View> : null}
        {row('users', 'Ask for name and phone first', s.requireRegistration || s.access === 'registered' ? 'Guests sign up before they see photos' : 'Off', s.requireRegistration || s.access === 'registered', (v) => set(v ? { requireRegistration: true } : { requireRegistration: false, ...(s.access === 'registered' ? { access: 'link' } : {}) }))}
        {row('smartphone', 'Skip the “get the app” page', s.skipAppLanding ? 'Guests go straight to the photos' : 'Guests choose web or app first', s.skipAppLanding, (v) => set({ skipAppLanding: v }))}
      </>)}

      {group('Faces', <>
        {row('smile', 'Find photos with a selfie', s.faceSearch ? (stats ? `${fmt.count(stats.faces.ready)} of ${fmt.count(stats.faces.total)} photos ready` : 'Guests tap Find my photos') : 'Off', s.faceSearch, (v) => set({ faceSearch: v, ...(!v ? { facePrivacy: false } : {}) }), true)}
        {row('eye-off', 'Guests see only their own photos', s.facePrivacy ? 'Turn off to let everyone browse' : 'Everyone can browse every photo', s.facePrivacy, (v) => set({ facePrivacy: v, ...(v ? { faceSearch: true } : {}), ...(v && s.downloads === 'all' ? { downloads: 'own' } : {}) }))}
      </>)}

      {group('Downloads', <>
        <SettingRow first icon="download" title="What guests can download" detail={DOWNLOADS.find((d) => d.value === s.downloads)?.title ?? ''} right={<Button label="Change" size="sm" onPress={() => { setDl(s.downloads); setDlOpen(true) }} />} />
        {row('image', 'Full-size originals', s.originalDownloads ? 'On: full quality' : 'Off: web size only', s.originalDownloads, (v) => set({ originalDownloads: v }))}
      </>)}

      {group('Guest uploads', <>
        {row('upload', 'Let guests add photos', s.guestUploads ? `Up to ${s.guestUploadLimit} each${s.reviewGuestUploads ? ', you review first' : ''}` : 'Off', s.guestUploads, (v) => set({ guestUploads: v, ...(v && !s.guestUploadLimit ? { guestUploadLimit: 20 } : {}) }), true)}
        {s.guestUploads ? row('check-square', 'Review before everyone sees them', s.reviewGuestUploads ? 'On' : 'Off: they appear straight away', s.reviewGuestUploads, (v) => set({ reviewGuestUploads: v })) : null}
        {s.guestUploads ? row('droplet', 'Watermark guest photos', s.watermarkGuestUploads ? 'On' : 'Off', s.watermarkGuestUploads, (v) => set({ watermarkGuestUploads: v })) : null}
      </>)}

      {group('Selling', row('shopping-bag', 'Sell photos from this event', s.storeEnabled ? 'Guests can buy downloads and prints' : 'Off', s.storeEnabled, (v) => set({ storeEnabled: v }), true))}

      <Card style={{ paddingBottom: 6 }}>
        <CardTitle title="Hosts" description="People who help run this event. Add or remove hosts on the web." />
        <View style={{ marginTop: 4 }}>
          {event.hosts.length ? event.hosts.map((h, i) => (
            <SettingRow key={h.id} first={i === 0} icon="user" title={h.name || h.email}
              detail={[h.role === 'client' ? 'Client' : 'Host', h.access === 'upload' ? 'Can upload photos' : 'Can upload and change settings'].join(' · ')}
              right={<Chip label={h.status === 'invited' ? 'Invited' : 'Joined'} tone={h.status === 'invited' ? 'accent' : 'ok'} />} />
          )) : <Txt v="small" style={{ paddingVertical: 10 }}>No hosts yet.</Txt>}
        </View>
      </Card>

      <Card style={{ gap: 8 }}>
        <CardTitle title="Photo limit" />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}><Txt weight="heavy">{fmt.count(stats?.photos ?? event.photoCount)}</Txt> of {fmt.count(event.photoLimit)} photos</Txt>
          <Txt v="small" color={c.ink3}>Open till {fmt.date(event.expiresAt)}</Txt>
        </View>
        <Meter value={event.photoCount} max={event.photoLimit || 1} tone={event.photoLimit && event.photoCount / event.photoLimit > 0.9 ? 'warn' : undefined} />
        <Txt v="small" color={c.ink3}>Add photos to this event, change its date or name on the web.</Txt>
      </Card>

      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        <SettingRow first icon="power" title={s.disabled ? 'Turn the gallery back on' : 'Turn off the gallery'} detail={s.disabled ? 'Guests can’t open it right now' : 'Guests see “This gallery has closed”'}
          onPress={() => (s.disabled ? set({ disabled: false }) : setAsk('off'))} />
        <SettingRow icon="trash-2" danger title="Delete event" detail="Moves it to Recently deleted for 30 days" onPress={() => del.mutate(undefined)} />
      </Card>

      <ConfirmSheet open={ask === 'pin'} onClose={() => setAsk(null)} title="Make a new PIN?" body={`Guests who have the old PIN ${s.pin} can’t open the gallery until you send them the new one.`}
        confirmLabel="Make a new PIN" onConfirm={() => resetPin.mutateAsync(undefined)} />
      <ConfirmSheet open={ask === 'off'} onClose={() => setAsk(null)} title="Turn off the gallery?" body="Guests will see “This gallery has closed” until you turn it back on. Your photos stay safe."
        confirmLabel="Turn off" danger onConfirm={() => save.mutateAsync({ disabled: true })} />

      <Sheet open={dlOpen} onClose={() => setDlOpen(false)} title="What can guests download?">
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <RadioCards value={dl} onChange={setDl} options={DOWNLOADS} />
          {row('user-x', 'Allow downloads without signing up', s.anonymousDownloads ? 'On' : 'Off', s.anonymousDownloads, (v) => set({ anonymousDownloads: v }), true)}
          <Button label="Save" variant="primary" size="lg" onPress={() => { set({ downloads: dl }); setDlOpen(false) }} />
        </View>
      </Sheet>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="monitor" size={13} color={c.ink3} />
        <Txt v="small" color={c.ink3}>Watermark, hosts and cover are on the web.</Txt>
      </View>
    </ScrollView>
  )
}
