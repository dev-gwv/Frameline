import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as WebBrowser from 'expo-web-browser'
import { LinearGradient } from 'expo-linear-gradient'
import { fmt, hash, tone, type Album, type Tone } from '@frameline/shared'
import { Button, Card, EmptyState, ErrorState, Icon, IconButton, LoadingList, PhotoTile, SectionHeader, SettingRow, Sheet, ToneView, Txt } from '@/components'
import { PinGate, RegistrationGate } from '@/components/gates'
import { EnquiryPrompt, InfoCard } from '@/components/guest'
import { eventLink } from '@/lib/links'
import { actions, useLocal } from '@/lib/local'
import { guestVisible, useAlbums, useEvent, useFilms, useHighlights, useMyPhotos, usePhotos, useStudio } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { font, radius, useTheme } from '@/theme'

export default function GuestEvent() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: event, error, refetch, isLoading } = useEvent(id)
  const { data: studio } = useStudio()
  const unlocked = useLocal((s) => s.unlocked.includes(event?.id ?? ''))
  const registered = useLocal((s) => !!s.registrations[event?.id ?? ''])

  const back = (
    <View style={{ position: 'absolute', top: insets.top + 6, left: 10, zIndex: 5 }}>
      <IconButton icon="arrow-left" label="Back" tone="overlay" onPress={() => (router.canGoBack() ? router.back() : router.replace('/events'))} />
    </View>
  )

  if (isLoading) return <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top }}><LoadingList /></View>
  if (error || !event) return <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top + 40 }}>{back}<ErrorState error={error} onRetry={refetch} /></View>
  if (event.settings.disabled || event.status === 'draft') {
    return <View style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center' }}>{back}<EmptyState icon="clock" title="Photos aren’t ready yet" body={`${studio?.name ?? 'The studio'} hasn’t opened this gallery. You’ll be able to see it here as soon as they do.`} /></View>
  }
  if (event.settings.access === 'link-pin' && !unlocked) return <View style={{ flex: 1, backgroundColor: c.paper }}>{back}<PinGate event={event} studio={studio} /></View>
  if ((event.settings.requireRegistration || event.settings.access === 'registered') && !registered) return <View style={{ flex: 1, backgroundColor: c.paper }}>{back}<RegistrationGate event={event} studio={studio} /></View>
  return <Landing eventId={event.id} back={back} />
}

function Landing({ eventId, back }: { eventId: string; back: React.ReactNode }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { data: event } = useEvent(eventId)
  const { data: studio } = useStudio()
  const { data: albums } = useAlbums(eventId)
  const { data: films } = useFilms(eventId)
  const { data: highlights } = useHighlights(event?.highlights ? eventId : undefined)
  const joined = useLocal((s) => s.joined.find((j) => j.eventId === eventId))
  const reg = useLocal((s) => s.registrations[eventId])
  const selfie = useLocal((s) => s.selfie[eventId])
  const following = useLocal((s) => (studio ? s.following.includes(studio.followCode) : false))
  const { data: mine } = useMyPhotos(eventId, !!selfie)
  const { data: preview } = usePhotos(eventId, { limit: 12 })
  const [filmsOpen, setFilmsOpen] = useState(false)

  const visibleAlbums = useMemo(() => (albums ?? []).filter((a) => a.kind === 'album' || (a.kind === 'guest' && a.photoCount > 0)), [albums])
  if (!event) return null
  const s = event.settings
  const welcome = joined?.welcomeName ?? reg?.name?.split(' ')[0]
  const privateGallery = s.facePrivacy && s.faceSearch
  const tileW = Math.floor((width - 32 - 10) / 2)

  const openAlbum = (a: Album) => {
    if (privateGallery && !selfie) { router.push({ pathname: '/event/[id]/selfie', params: { id: eventId } }); return }
    router.push({ pathname: '/event/[id]/photos', params: { id: eventId, scope: privateGallery ? 'mine' : 'album', albumId: a.id } })
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      {back}
      <View style={{ position: 'absolute', top: insets.top + 6, right: 10, zIndex: 5 }}>
        <IconButton icon="share" label="Share gallery link" tone="overlay" onPress={() => Share.share({ message: `${event.name} — photos by ${studio?.name ?? 'the studio'}: ${eventLink(event)}` })} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <ToneView tone={event.coverTones[0]} style={{ height: 330 + insets.top, justifyContent: 'flex-end', padding: 20 }}>
          <LinearGradient colors={['rgba(12,10,8,0.15)', 'transparent', 'rgba(12,10,8,0.55)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
          <Txt style={[styles.studioMark, { top: insets.top + 20 }]}>{(studio?.name.split(' ')[0] ?? '').toUpperCase()}</Txt>
          {welcome ? <Txt style={styles.heroSmall}>Welcome, {welcome}</Txt> : null}
          <Txt style={styles.heroTitle} accessibilityRole="header">{event.name}</Txt>
          <Txt style={styles.heroSmall}>{fmt.dateRange(event.date, event.endDate)} · {event.city}</Txt>
        </ToneView>

        <View style={{ padding: 16, gap: 16 }}>
          {s.faceSearch ? (
            selfie && mine ? (
              <Card style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flexDirection: 'row' }}>
                    {mine.slice(0, 3).map((p, i) => <View key={p.id} style={{ marginLeft: i ? -14 : 0, borderWidth: 2, borderColor: c.surface, borderRadius: 10 }}><PhotoTile photo={p} size={44} radius={8} /></View>)}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt v="h3">We found you in {mine.length} photos</Txt>
                    <Txt v="small">Across {new Set(mine.map((p) => p.albumId)).size} albums</Txt>
                  </View>
                </View>
                <Button label="See your photos" variant="primary" size="lg" icon="smile" onPress={() => router.push({ pathname: '/event/[id]/photos', params: { id: eventId, scope: 'mine' } })} />
                <Button label="Retake selfie" variant="ghost" size="sm" onPress={() => router.push({ pathname: '/event/[id]/selfie', params: { id: eventId } })} />
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                <Button label="Find my photos" variant="primary" size="lg" icon="face" onPress={() => router.push({ pathname: '/event/[id]/selfie', params: { id: eventId } })} />
                <Txt v="small" center color={c.ink2}>Your selfie is only used to match you and is deleted after 30 days.</Txt>
              </View>
            )
          ) : null}

          <SectionHeader title="Albums" count={`${fmt.count(event.photoCount)} photos${films?.length ? ` · ${films.length} films` : ''}`} />
          {privateGallery && !selfie ? <Txt v="small" style={{ marginTop: -8 }}>This is a private gallery: each guest sees the photos they’re in. Take a selfie to open the albums.</Txt> : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {event.highlights && highlights?.length ? (
              <AlbumTile width={tileW} name="Highlights" count={highlights.length} tone={highlights[0]!.tone} icon="star"
                onPress={() => router.push({ pathname: '/event/[id]/photos', params: { id: eventId, scope: 'highlights' } })} />
            ) : null}
            {visibleAlbums.map((a) => {
              const own = mine?.filter((p) => p.albumId === a.id).length
              return <AlbumTile key={a.id} width={tileW} name={a.name} count={privateGallery ? (own ?? 0) : a.photoCount} tone={tone(hash(a.id))} icon={a.kind === 'guest' ? 'users' : privateGallery && !selfie ? 'lock' : undefined} onPress={() => openAlbum(a)} />
            })}
            {films?.length ? <AlbumTile width={tileW} name="Films" count={films.length} tone={tone(hash(eventId) + 5)} icon="film" onPress={() => setFilmsOpen(true)} /> : null}
          </View>

          {!privateGallery && preview?.items.length ? (
            <Pressable accessibilityRole="button" accessibilityLabel="See all photos" onPress={() => router.push({ pathname: '/event/[id]/photos', params: { id: eventId, scope: 'album' } })}
              style={{ flexDirection: 'row', gap: 4 }}>
              {preview.items.filter(guestVisible).slice(0, 4).map((p) => <PhotoTile key={p.id} photo={p} size={(width - 32 - 12) / 4} radius={6} />)}
            </Pressable>
          ) : null}

          {s.guestUploads ? (
            <InfoCard icon="upload-cloud" title="Were you taking photos too?" body={`Add up to ${s.guestUploadLimit} of your shots to the Guest uploads album.`} action="Add" onAction={() => router.push({ pathname: '/guest-upload', params: { eventId } })} />
          ) : null}

          {s.allowEnquiries ? <EnquiryPrompt eventId={eventId} source={`${event.name} gallery (app)`} /> : null}

          {studio ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 11, backgroundColor: studio.brandColor, alignItems: 'center', justifyContent: 'center' }}>
                <Txt style={{ fontFamily: font.display, color: '#fff', fontSize: 20 }}>{studio.name[0]}</Txt>
              </View>
              <Pressable style={{ flex: 1 }} accessibilityRole="button" onPress={() => router.push({ pathname: '/studio/[code]', params: { code: studio.followCode } })}>
                <Txt weight="bold">Photos by {studio.name}</Txt>
                <Txt v="small">{following ? 'You follow this studio' : 'Follow to see their new galleries'}</Txt>
              </Pressable>
              <Button label={following ? 'Following' : 'Follow'} size="sm" icon={following ? 'check' : 'plus'}
                onPress={() => { if (following) actions.unfollow(studio.followCode); else { actions.follow(studio.followCode); toast.success(`Following ${studio.name}`) } }} />
            </Card>
          ) : null}
        </View>
      </ScrollView>

      <Sheet open={filmsOpen} onClose={() => setFilmsOpen(false)} title="Films">
        <View style={{ paddingHorizontal: 16 }}>
          {films?.map((f, i) => (
            <SettingRow key={f.id} first={i === 0} icon="film" title={f.name} detail="Opens in your browser"
              onPress={() => { WebBrowser.openBrowserAsync(f.url).catch(() => toast.error('Couldn’t open the film', 'Check your connection and try again')) }} />
          ))}
        </View>
      </Sheet>
    </View>
  )
}

function AlbumTile({ name, count, tone: t, icon, onPress, width }: { name: string; count: number; tone: Tone; icon?: 'star' | 'film' | 'users' | 'lock'; onPress: () => void; width: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${count}`} onPress={onPress} style={({ pressed }) => ({ width, opacity: pressed ? 0.85 : 1 })}>
      <ToneView tone={t} style={{ height: width * 0.72, borderRadius: radius.card, padding: 10, justifyContent: 'flex-end', overflow: 'hidden' }}>
        <LinearGradient colors={['transparent', 'rgba(12,10,8,0.6)']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0.3 }} end={{ x: 0.5, y: 1 }} />
        {icon ? <View style={styles.albumIcon}><Icon name={icon} size={13} color="#F2D38A" /></View> : null}
        <Txt style={{ fontFamily: font.bodyBold, color: '#fff', fontSize: 14 }} numberOfLines={1}>{name}</Txt>
        <Txt style={{ fontFamily: font.mono, color: 'rgba(255,255,255,0.85)', fontSize: 11 }}>{fmt.count(count)}</Txt>
      </ToneView>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  studioMark: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: font.display, letterSpacing: 4, fontSize: 12, color: '#fff' },
  heroSmall: { fontFamily: font.body, color: 'rgba(255,255,255,0.92)', fontSize: 13 },
  heroTitle: { fontFamily: font.display, color: '#fff', fontSize: 34, lineHeight: 38, marginVertical: 2 },
  albumIcon: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(12,10,8,0.5)', alignItems: 'center', justifyContent: 'center' },
})
