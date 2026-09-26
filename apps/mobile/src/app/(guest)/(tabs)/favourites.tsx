import { useMemo } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import type { ID, Photo } from '@frameline/shared'
import { EmptyState, LoadingList, PhotoTile, Screen, SectionHeader } from '@/components'
import { useLocal } from '@/lib/local'
import { useEvent, usePhotosById } from '@/lib/queries'

export default function Favourites() {
  const favs = useLocal((s) => s.favourites)
  const ids = useMemo(() => favs.map((f) => f.photoId), [favs])
  const { data: photos, isLoading } = usePhotosById(ids)

  const groups = useMemo(() => {
    const map = new Map<ID, Photo[]>()
    for (const f of favs) {
      const p = photos?.find((x) => x.id === f.photoId)
      if (!p) continue
      map.set(f.eventId, [...(map.get(f.eventId) ?? []), p])
    }
    return [...map.entries()]
  }, [favs, photos])

  if (!favs.length) {
    return <Screen><EmptyState icon="heart" title="No favourites yet" body="Tap the heart on any photo to keep it here. The studio sees your picks too." action="Go to my events" onAction={() => router.navigate('/events')} /></Screen>
  }
  if (isLoading && !photos) return <LoadingList />
  return (
    <Screen>
      {groups.map(([eventId, list]) => <FavGroup key={eventId} eventId={eventId} photos={list} />)}
    </Screen>
  )
}

function FavGroup({ eventId, photos }: { eventId: ID; photos: Photo[] }) {
  const { data: event } = useEvent(eventId)
  const { width } = useWindowDimensions()
  const size = Math.floor((width - 32 - 8) / 3)
  return (
    <View style={{ gap: 8 }}>
      <SectionHeader title={event?.name ?? 'Event'} count={String(photos.length)} action="Open" onAction={() => router.push({ pathname: '/event/[id]', params: { id: eventId } })} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {photos.map((p) => (
          <PhotoTile key={p.id} photo={p} size={size} radius={6} favourite label={p.filename}
            onPress={() => router.push({ pathname: '/viewer', params: { eventId, scope: 'favourites', start: p.id } })} />
        ))}
      </View>
    </View>
  )
}
