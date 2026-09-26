import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { fmt, type EventSettings } from '@frameline/shared'
import { Button, Card, Chip, CoverMosaic, EmptyState, ErrorState, EventStatusChip, IconButton, LoadingList, PhotoGrid, SettingRow, Toggle, Txt } from '@/components'
import { useApi } from '@/lib/api'
import { usePhotoList } from '@/lib/photoList'
import { useAction, useAlbums, useEvent } from '@/lib/queries'
import { radius, useTheme } from '@/theme'

export default function ManageEvent() {
  const { c } = useTheme()
  const api = useApi()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: event, error, refetch } = useEvent(id)
  const { data: albums } = useAlbums(id)
  const [albumId, setAlbumId] = useState<string>()
  const { photos, isLoading } = usePhotoList(id, 'studio', albumId)

  const settings = useAction((patch: Partial<EventSettings>) => api.updateEventSettings(id, patch), { success: 'Saved' })

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!event) return <LoadingList />
  const s = event.settings
  const processing = photos.filter((p) => p.status === 'processing').length
  const visits = event.visits.web + event.visits.android + event.visits.ios

  const header = (
    <View style={{ padding: 16, gap: 14 }}>
      <View style={{ borderRadius: radius.card, overflow: 'hidden' }}><CoverMosaic tones={event.coverTones} height={140} /></View>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <EventStatusChip status={event.status} />
          <Txt v="mono" color={c.ink3} style={{ fontSize: 12 }}>{event.shortId}</Txt>
        </View>
        <Txt v="h2">{event.name}</Txt>
        <Txt v="small">{fmt.dateRange(event.date, event.endDate)} · {event.city} · expires {fmt.date(event.expiresAt)}</Txt>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[['Photos', fmt.count(event.photoCount)], ['Visits', fmt.count(visits)], ['Face matches', fmt.count(event.faceMatches)]].map(([l, v]) => (
          <Card key={l} style={{ flex: 1, padding: 12, gap: 2 }}>
            <Txt v="small" numberOfLines={1}>{l}</Txt>
            <Txt v="mono" style={{ fontSize: 17 }}>{v}</Txt>
          </Card>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Share gallery" icon="share-2" variant="primary" style={{ flex: 1.3 }} onPress={() => router.push({ pathname: '/share/[id]', params: { id: event.id } })} />
        <Button label="Upload" icon="upload-cloud" style={{ flex: 1 }} onPress={() => router.navigate({ pathname: '/upload', params: { eventId: event.id } })} />
      </View>

      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        <SettingRow first icon="smile" title="Face privacy" detail={s.facePrivacy ? 'Each guest sees only the photos they’re in' : 'Everyone with access sees every photo'}
          right={<Toggle label="Face privacy" value={s.facePrivacy} onChange={(v) => settings.mutate({ facePrivacy: v, ...(v && s.downloads === 'all' ? { downloads: 'own' } : {}) })} />} />
        <SettingRow icon="download" title="Guest downloads" detail={s.downloads === 'none' ? 'Off — guests can view and buy' : s.downloads === 'own' ? 'Guests save photos they’re in' : 'Guests save any photo'}
          right={<Toggle label="Guest downloads" value={s.downloads !== 'none'} onChange={(v) => settings.mutate({ downloads: v ? (s.facePrivacy ? 'own' : 'all') : 'none' })} />} />
        <SettingRow icon="upload-cloud" title="Guest uploads" detail={s.guestUploads ? `Up to ${s.guestUploadLimit} per guest${s.reviewGuestUploads ? ', reviewed first' : ''}` : 'Off'}
          right={<Toggle label="Guest uploads" value={s.guestUploads} onChange={(v) => settings.mutate({ guestUploads: v })} />} />
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Chip label="All" count={fmt.count(event.photoCount)} selected={!albumId} onPress={() => setAlbumId(undefined)} />
        {(albums ?? []).filter((a) => a.kind !== 'store').map((a) => <Chip key={a.id} label={a.name} count={a.photoCount} selected={albumId === a.id} onPress={() => setAlbumId(a.id)} />)}
      </ScrollView>
      {processing ? <Txt v="small" color={c.accentText}>{processing} photos processing — they’ll be ready in a moment.</Txt> : null}
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <Stack.Screen options={{ title: event.name, headerRight: () => <IconButton icon="share-2" label="Share gallery" onPress={() => router.push({ pathname: '/share/[id]', params: { id: event.id } })} /> }} />
      <PhotoGrid
        photos={photos}
        header={header}
        bottomInset={32}
        empty={isLoading ? <LoadingList rows={2} /> : <EmptyState icon="upload-cloud" title="No photos in this album yet" body="Upload from your phone, or connect a camera for live sync." action="Upload photos" onAction={() => router.navigate({ pathname: '/upload', params: { eventId: event.id } })} />}
        onPress={(p) => router.push({ pathname: '/viewer', params: { eventId: event.id, scope: 'studio', albumId: albumId ?? '', start: p.id } })}
      />
    </View>
  )
}
