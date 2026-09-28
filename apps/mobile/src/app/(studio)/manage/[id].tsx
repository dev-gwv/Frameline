import { useState } from 'react'
import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as WebBrowser from 'expo-web-browser'
import { Button, ErrorState, EventStatusChip, IconButton, LinkText, LoadingList, SettingRow, Sheet, Txt } from '@/components'
import { GuestsTab, type GuestFilter } from '@/components/event/GuestsTab'
import { PhotosTab } from '@/components/event/PhotosTab'
import { SettingsTab } from '@/components/event/SettingsTab'
import { ShareSheet } from '@/components/ShareSheet'
import { UnderlineTabs, eventFacts } from '@/components/studio'
import { useApi } from '@/lib/api'
import { eventLink } from '@/lib/links'
import { useAccessRequests, useEvent, useEventStats, usePendingGuestPhotos } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { useHiddenIds } from '@/lib/undo'
import { useTheme } from '@/theme'

type Tab = 'photos' | 'guests' | 'settings'

/** Event screen: back, name + status, one facts line; Upload and gold Share; tabs Photos · Guests · Settings. */
export default function ManageEvent() {
  const { c } = useTheme()
  const api = useApi()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ id: string; tab?: Tab; f?: GuestFilter; share?: string }>()
  const id = params.id
  const { data: event, error, refetch } = useEvent(id)
  const { data: stats } = useEventStats(id)
  const [tab, setTab] = useState<Tab>(params.tab ?? 'photos')
  const [shareOpen, setShareOpen] = useState(params.share === '1')
  const [menuOpen, setMenuOpen] = useState(false)
  const hidden = useHiddenIds()
  const requests = useAccessRequests(id)
  const pending = usePendingGuestPhotos(id)
  const badge = (requests.data ?? []).filter((r) => !hidden.has(`access-request:${r.id}`)).length + (pending.data ?? []).filter((p) => !hidden.has(p.id)).length

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/studio-events'))

  if (error) return <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top }}><View style={{ paddingHorizontal: 8 }}><LinkText label="Events" icon="chevron-left" onPress={back} /></View><ErrorState error={error} onRetry={refetch} /></View>
  if (!event) return <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top }}><LoadingList /></View>

  const archived = event.status === 'archived'
  const archive = async () => {
    setMenuOpen(false)
    const before = event.status
    try {
      await api.updateEvent(event.id, { status: archived ? 'live' : 'archived' })
      if (archived) toast.success('Event restored', 'Guests can open it again')
      else toast.undo(`${event.name} archived`, () => { api.updateEvent(event.id, { status: before }).then(() => toast.success('Undone')).catch(() => {}) }, 'Guests can’t open it. Restore it any time.')
    } catch { toast.error('Couldn’t change the event', 'Check your connection and try again') }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: insets.top + 2, paddingHorizontal: 16, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: -4 }}>
          <LinkText label="Events" icon="chevron-left" color={c.ink2} small onPress={back} />
          <IconButton icon="more-horizontal" label="More for this event" onPress={() => setMenuOpen(true)} />
        </View>
        <View style={{ gap: 4, marginTop: -6 }}>
          <Txt v="h2" numberOfLines={2}>{event.name}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <EventStatusChip status={event.status} expiresAt={event.expiresAt} />
            <Txt v="small" style={{ flexShrink: 1, fontVariant: ['tabular-nums'] }} numberOfLines={2}>{eventFacts(event, stats)}</Txt>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Button label="Upload" icon="upload-cloud" size="sm" style={{ flex: 1 }} onPress={() => router.navigate({ pathname: '/upload', params: { eventId: event.id } })} />
          <Button label="Share" icon="share-2" size="sm" variant="primary" style={{ flex: 1 }} onPress={() => setShareOpen(true)} />
        </View>
        <UnderlineTabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'photos', label: 'Photos' }, { value: 'guests', label: 'Guests', badge }, { value: 'settings', label: 'Settings' }]} />
      </View>

      {tab === 'photos' ? <PhotosTab event={event} /> : tab === 'guests' ? <GuestsTab event={event} initial={params.f} /> : <SettingsTab event={event} />}

      <ShareSheet event={event} open={shareOpen} onClose={() => setShareOpen(false)} />
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={event.name}>
        <View style={{ paddingHorizontal: 16 }}>
          <SettingRow first icon="eye" title="Preview as a guest" detail="Opens the gallery the way guests see it"
            onPress={() => { setMenuOpen(false); WebBrowser.openBrowserAsync(eventLink(event)).catch(() => toast.error('Couldn’t open the gallery', 'Check your connection')) }} />
          <SettingRow icon="archive" title={archived ? 'Restore event' : 'Archive event'} detail={archived ? 'Guests can open it again' : 'Hides it from guests; restore any time'} onPress={archive} />
        </View>
      </Sheet>
    </View>
  )
}
