import { useMemo } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import type { Photo } from '@frameline/shared'
import { EmptyState, PhotoTile, Screen, SectionHeader, Txt } from '@/components'
import { useLocal, type Favourite } from '@/lib/local'
import { usePublicEvent } from '@/lib/queries'
import { useTheme } from '@/theme'

/**
 * Favourites across galleries. Each heart is sent with setFavourite (the studio sees the picks), but the contract has
 * no "list my favourites" endpoint, so this tab shows the photo snapshots kept on the phone.
 */
export default function Favourites() {
  const { c } = useTheme()
  const favs = useLocal((s) => s.favourites)

  const groups = useMemo(() => {
    const map = new Map<string, { shortId?: string; photos: Photo[] }>()
    for (const f of favs as Favourite[]) {
      if (!f.photo) continue
      const g = map.get(f.eventId) ?? { shortId: f.shortId, photos: [] }
      g.photos.push(f.photo)
      map.set(f.eventId, g)
    }
    return [...map.entries()]
  }, [favs])

  if (!groups.length) {
    return <Screen><EmptyState icon="heart" title="No favourites yet" body="Tap the heart on any photo to keep it here. The studio sees your picks too." action="Go to my events" onAction={() => router.navigate('/events')} /></Screen>
  }
  return (
    <Screen>
      {groups.map(([eventId, g]) => <FavGroup key={eventId} eventId={eventId} shortId={g.shortId} photos={g.photos} />)}
      <Txt v="small" center color={c.ink3}>Favourites are kept on this phone.</Txt>
    </Screen>
  )
}

function FavGroup({ eventId, shortId, photos }: { eventId: string; shortId?: string; photos: Photo[] }) {
  const { data: event } = usePublicEvent(shortId)
  const { width } = useWindowDimensions()
  const size = Math.floor((width - 32 - 8) / 3)
  return (
    <View style={{ gap: 8 }}>
      <SectionHeader title={event?.name ?? 'Event'} count={String(photos.length)} action={shortId ? 'Open' : undefined}
        onAction={shortId ? () => router.push({ pathname: '/event/[id]', params: { id: shortId } }) : undefined} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {photos.map((p) => (
          <PhotoTile key={p.id} photo={p} size={size} radius={6} favourite label={p.filename}
            onPress={() => router.push({ pathname: '/viewer', params: { eventId, shortId: shortId ?? '', scope: 'favourites', start: p.id } })} />
        ))}
      </View>
    </View>
  )
}
