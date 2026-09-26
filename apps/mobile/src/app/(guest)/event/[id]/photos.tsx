import { useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fmt } from '@frameline/shared'
import { Button, Chip, EmptyState, ErrorState, LoadingList, PhotoGrid, Txt } from '@/components'
import { DownloadSheet } from '@/components/DownloadSheet'
import { useGuestAccessGuard } from '@/lib/guest'
import { useLocal } from '@/lib/local'
import { usePhotoList, type PhotoScope } from '@/lib/photoList'
import { usePublicEvent } from '@/lib/queries'
import { CaptureHost, type CaptureHandle } from '@/lib/save'
import { font, useTheme } from '@/theme'

/** Guest photo grid. `id` is the gallery short id. */
export default function EventPhotos() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ id: string; scope?: PhotoScope; albumId?: string }>()
  const shortId = params.id
  const scope: PhotoScope = params.scope ?? 'album'
  const [albumId, setAlbumId] = useState<string | undefined>(params.albumId || undefined)
  const { data: event } = usePublicEvent(shortId)
  // For "mine" the chips filter locally; for albums the query itself is per album.
  const { photos, all, isLoading, error } = usePhotoList(scope, { shortId, eventId: event?.id, albumId })
  useGuestAccessGuard(event?.id, error)
  const favs = useLocal((s) => s.favourites)
  const favSet = useMemo(() => new Set(favs.map((f) => f.photoId)), [favs])
  const [downloadOpen, setDownloadOpen] = useState(false)
  const capture = useRef<CaptureHandle>(null)

  const chipAlbums = useMemo(() => {
    const list = (event?.albums ?? []).filter((a) => a.kind === 'album' || (a.kind === 'guest' && a.photoCount > 0))
    if (scope === 'mine') return list.map((a) => ({ a, n: all.filter((p) => p.albumId === a.id).length })).filter((x) => x.n > 0)
    return list.map((a) => ({ a, n: a.photoCount }))
  }, [event?.albums, all, scope])

  if (!event) return <LoadingList />
  const s = event.settings
  const studio = event.studio
  const canDownload = s.downloads === 'all' || (s.downloads === 'own' && scope === 'mine')
  const title = scope === 'mine' ? `We found you in ${all.length} photos` : scope === 'highlights' ? 'Highlights' : albumId ? event.albums.find((a) => a.id === albumId)?.name ?? 'Album' : 'All photos'
  const barH = 68 + insets.bottom

  const header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 10 }}>
      <Txt style={{ fontFamily: font.display, letterSpacing: 3, fontSize: 11, color: studio.brandColor ?? c.accentText }}>{(studio.name.split(' ')[0] ?? '').toUpperCase()}</Txt>
      <Txt v="h2">{title}</Txt>
      {scope !== 'highlights' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginHorizontal: -16 }}>
          <View style={{ width: 10 }} />
          <Chip label="All" count={scope === 'mine' ? all.length : fmt.count(event.photoCount)} selected={!albumId} onPress={() => setAlbumId(undefined)} />
          {chipAlbums.map(({ a, n }) => <Chip key={a.id} label={a.name} count={n} selected={albumId === a.id} onPress={() => setAlbumId(a.id)} />)}
          <View style={{ width: 10 }} />
        </ScrollView>
      ) : null}
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <Stack.Screen options={{ title: event.name }} />
      {isLoading && !photos.length ? <LoadingList /> : error && !photos.length ? <ErrorState error={error} onRetry={() => router.back()} /> : (
        <PhotoGrid
          photos={photos}
          header={header}
          favourites={favSet}
          bottomInset={barH + 12}
          empty={<EmptyState icon="image" title="No photos here yet" body={scope === 'mine' ? 'You’re not in any photos in this album. Try All.' : 'The studio is still adding photos. Check back soon.'} />}
          onPress={(p) => router.push({ pathname: '/viewer', params: { shortId: event.shortId, eventId: event.id, scope, albumId: albumId ?? '', start: p.id } })}
        />
      )}

      <View style={[styles.bar, { height: barH, paddingBottom: insets.bottom + 10 }]}>
        <CaptureHost ref={capture} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line }]} />
        {s.storeEnabled ? <Button label="Buy" icon="shopping-bag" style={{ flex: 1 }} disabled={!photos.length} onPress={() => router.push({ pathname: '/buy', params: { shortId: event.shortId, eventId: event.id, scope, albumId: albumId ?? '' } })} /> : null}
        {canDownload
          ? <Button label={`Download ${photos.length}`} icon="download" variant="primary" style={{ flex: 1.4 }} disabled={!photos.length} onPress={() => setDownloadOpen(true)} />
          : <View style={{ flex: 1.4, justifyContent: 'center' }}><Txt v="small" center>{s.downloads === 'none' ? 'Downloads are off for this gallery' : 'Find yourself to download your photos'}</Txt></View>}
      </View>

      <DownloadSheet open={downloadOpen} onClose={() => setDownloadOpen(false)} photos={photos} event={event} host={capture} />
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, overflow: 'hidden' },
})
