import { useEffect, useMemo } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import type { Photo } from '@frameline/shared'
import { EmptyState, PhotoTile, Screen, SectionHeader, Txt } from '@/components'
import { actions, local, useLocal, type Favourite } from '@/lib/local'
import { useMyFavourites, usePublicEvent } from '@/lib/queries'
import { useTheme } from '@/theme'

/**
 * Favourites across galleries. Hearts are sent with setFavourite. For galleries where this guest registered,
 * listMyFavourites brings back picks made on other devices; they're merged into the local snapshots, which also
 * keep favourites from galleries without registration (the server only lists them for registered guests).
 */
export default function Favourites() {
  const { c } = useTheme()
  const favs = useLocal((s) => s.favourites)
  const registered = useLocal((s) => s.joined.filter((j) => !!s.registrations[j.eventId]))

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

  const sync = registered.map((j) => <ServerFavourites key={j.eventId} shortId={j.shortId} />)
  if (!groups.length) {
    return <Screen>{sync}<EmptyState icon="heart" title="No favourites yet" body="Tap the heart on any photo to keep it here. The photographer can see your favourites, so use them to say which ones you love." action="Go to my events" onAction={() => router.navigate('/events')} /></Screen>
  }
  return (
    <Screen>
      {sync}
      <Txt v="small">The photographer can see your favourites. Use them to tell them which ones you love.</Txt>
      {groups.map(([eventId, g]) => <FavGroup key={eventId} eventId={eventId} shortId={g.shortId} photos={g.photos} />)}
      <Txt v="small" center color={c.ink3}>Register in a gallery to keep favourites across your devices.</Txt>
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

/** Merges a registered gallery's server favourites into the local list (renders nothing). */
function ServerFavourites({ shortId }: { shortId: string }) {
  const { data } = useMyFavourites(shortId)
  useEffect(() => {
    const have = new Set(local.get().favourites.map((f) => f.photoId))
    for (const p of data ?? []) if (!have.has(p.id)) actions.setFavourite(p, shortId, true)
  }, [data, shortId])
  return null
}
