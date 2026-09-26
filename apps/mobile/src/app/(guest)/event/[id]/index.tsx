import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as WebBrowser from 'expo-web-browser'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { EVENT_TYPE_LABELS, fmt, hash, tone, type Album, type PublicBlockReason, type PublicEvent, type Tone } from '@frameline/shared'
import { Button, Card, EmptyState, ErrorState, Icon, IconButton, LoadingList, PhotoTile, SectionHeader, SettingRow, Sheet, ToneView, Txt } from '@/components'
import { PinGate, RegistrationGate } from '@/components/gates'
import { EnquiryPrompt, InfoCard } from '@/components/guest'
import { useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { useGuestAccessGuard } from '@/lib/guest'
import { eventLink } from '@/lib/links'
import { actions, useLocal } from '@/lib/local'
import { useHighlights, useMyPhotos, usePublicEvent, usePublicPhotos } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { font, radius, useTheme } from '@/theme'

const BLOCKED: Record<PublicBlockReason, { icon: 'clock' | 'lock' | 'archive'; title: string; body: (studio: string) => string }> = {
  empty: { icon: 'clock', title: 'Photos aren’t ready yet', body: (s) => `${s} hasn’t added photos to this gallery. You’ll be able to see it here as soon as they do.` },
  disabled: { icon: 'lock', title: 'This gallery is closed', body: (s) => `${s} has turned this gallery off. Contact them if you need your photos.` },
  archived: { icon: 'archive', title: 'This gallery is archived', body: (s) => `Ask ${s} to restore it.` },
  expired: { icon: 'clock', title: 'This gallery has expired', body: (s) => `Ask ${s} to renew it so you can see the photos again.` },
}

/** Guest gallery. The route param is the event short id (public endpoints are keyed by it). */
export default function GuestEvent() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { id: shortId } = useLocalSearchParams<{ id: string }>()
  const { data: event, error, refetch, isLoading } = usePublicEvent(shortId)
  const unlocked = useLocal((s) => s.unlocked.includes(event?.id ?? ''))
  const registered = useLocal((s) => !!s.registrations[event?.id ?? ''])

  const back = (
    <View style={{ position: 'absolute', top: insets.top + 6, left: 10, zIndex: 5 }}>
      <IconButton icon="arrow-left" label="Back" tone="overlay" onPress={() => (router.canGoBack() ? router.back() : router.replace('/events'))} />
    </View>
  )

  if (isLoading) return <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top }}><LoadingList /></View>
  if (error || !event) return <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top + 40 }}>{back}<ErrorState error={error} onRetry={refetch} /></View>
  if (event.blocked) {
    const b = BLOCKED[event.blocked]
    return <View style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center' }}>{back}<EmptyState icon={b.icon} title={b.title} body={b.body(event.studio.name)} /></View>
  }
  if (event.settings.access === 'link-pin' && !unlocked) return <View style={{ flex: 1, backgroundColor: c.paper }}>{back}<PinGate event={event} /></View>
  if ((event.settings.requireRegistration || event.settings.access === 'registered') && !registered) return <View style={{ flex: 1, backgroundColor: c.paper }}>{back}<RegistrationGate event={event} /></View>
  return <Landing event={event} back={back} />
}

function Landing({ event, back }: { event: PublicEvent; back: React.ReactNode }) {
  const { c } = useTheme()
  const api = useApi()
  const qc = useQueryClient()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const eventId = event.id
  const shortId = event.shortId
  const studio = event.studio
  const s = event.settings
  const joined = useLocal((st) => st.joined.find((j) => j.eventId === eventId))
  const reg = useLocal((st) => st.registrations[eventId])
  const selfie = useLocal((st) => st.selfie[eventId])
  const seeAll = useLocal((st) => st.seeAll.includes(eventId))
  const following = useLocal((st) => st.following.includes(studio.followCode))
  // Face privacy: without a typed PIN / VIP "all", the server only returns the photos the guest is in.
  const privateGallery = s.facePrivacy && s.faceSearch && !seeAll
  const { data: mine } = useMyPhotos(shortId, eventId)
  const { data: highlights, error: hlError } = useHighlights(shortId, event.highlights && !privateGallery)
  const { data: preview, error: previewError } = usePublicPhotos(shortId, { limit: 12 }, !privateGallery)
  useGuestAccessGuard(eventId, previewError, hlError)
  const [filmsOpen, setFilmsOpen] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)

  const visibleAlbums = useMemo(() => event.albums.filter((a) => a.kind === 'album' || (a.kind === 'guest' && a.photoCount > 0)), [event.albums])
  const welcome = joined?.welcomeName ?? reg?.name?.split(' ')[0]
  const tileW = Math.floor((width - 32 - 10) / 2)
  const films = event.films

  const openAlbum = (a: Album) => {
    if (privateGallery && !selfie) { router.push({ pathname: '/event/[id]/selfie', params: { id: shortId } }); return }
    router.push({ pathname: '/event/[id]/photos', params: { id: shortId, scope: privateGallery ? 'mine' : 'album', albumId: a.id } })
  }

  const toggleFollow = async () => {
    if (following) {
      actions.unfollow(studio.followCode)
      api.unfollowStudio(studio.followCode).then(() => qc.invalidateQueries({ queryKey: ['studio-profile'] }), () => {})
      toast.info(`Unfollowed ${studio.name}`)
      return
    }
    setFollowBusy(true)
    try {
      await api.followStudio(studio.followCode)
      actions.follow(studio.followCode)
      qc.invalidateQueries({ queryKey: ['studio-profile'] })
      toast.success(`Following ${studio.name}`)
    } catch (e) {
      const f = friendlyError(e)
      toast.error(f.title, f.detail)
    } finally { setFollowBusy(false) }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      {back}
      <View style={{ position: 'absolute', top: insets.top + 6, right: 10, zIndex: 5 }}>
        <IconButton icon="share" label="Share gallery link" tone="overlay" onPress={() => Share.share({ message: `${event.name} — photos by ${studio.name}: ${eventLink(event)}` })} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <ToneView tone={event.coverTones[0]} style={{ height: 330 + insets.top, justifyContent: 'flex-end', padding: 20 }}>
          {event.coverUrl ? <Image source={{ uri: event.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
          <LinearGradient colors={['rgba(12,10,8,0.15)', 'transparent', 'rgba(12,10,8,0.55)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
          <Txt style={[styles.studioMark, { top: insets.top + 20 }]}>{(studio.name.split(' ')[0] ?? '').toUpperCase()}</Txt>
          {welcome ? <Txt style={styles.heroSmall}>Welcome, {welcome}</Txt> : null}
          <Txt style={styles.heroTitle} accessibilityRole="header">{event.name}</Txt>
          <Txt style={styles.heroSmall}>{EVENT_TYPE_LABELS[event.type]} · {fmt.dateRange(event.date, event.endDate)} · {event.city}</Txt>
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
                    <Txt v="h3">{mine.length ? `We found you in ${mine.length} photos` : 'We didn’t find you yet'}</Txt>
                    <Txt v="small">{mine.length ? `Across ${new Set(mine.map((p) => p.albumId)).size} albums` : 'Try a clearer selfie in good light'}</Txt>
                  </View>
                </View>
                {mine.length ? <Button label="See your photos" variant="primary" size="lg" icon="smile" onPress={() => router.push({ pathname: '/event/[id]/photos', params: { id: shortId, scope: 'mine' } })} /> : null}
                <Button label="Retake selfie" variant="ghost" size="sm" onPress={() => router.push({ pathname: '/event/[id]/selfie', params: { id: shortId } })} />
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                <Button label="Find my photos" variant="primary" size="lg" icon="face" onPress={() => router.push({ pathname: '/event/[id]/selfie', params: { id: shortId } })} />
                <Txt v="small" center color={c.ink2}>Your selfie is only used to match you and is deleted after 30 days.</Txt>
              </View>
            )
          ) : null}

          <SectionHeader title="Albums" count={`${fmt.count(event.photoCount)} photos${films.length ? ` · ${films.length} films` : ''}`} />
          {privateGallery && !selfie ? <Txt v="small" style={{ marginTop: -8 }}>This is a private gallery: each guest sees the photos they’re in. Take a selfie to open the albums.</Txt> : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {event.highlights && highlights?.length ? (
              <AlbumTile width={tileW} name="Highlights" count={highlights.length} tone={highlights[0]!.tone} icon="star"
                onPress={() => router.push({ pathname: '/event/[id]/photos', params: { id: shortId, scope: 'highlights' } })} />
            ) : null}
            {visibleAlbums.map((a) => {
              const own = mine?.filter((p) => p.albumId === a.id).length
              return <AlbumTile key={a.id} width={tileW} name={a.name} count={privateGallery ? (own ?? 0) : a.photoCount} tone={tone(hash(a.id))} icon={a.kind === 'guest' ? 'users' : privateGallery && !selfie ? 'lock' : undefined} onPress={() => openAlbum(a)} />
            })}
            {films.length ? <AlbumTile width={tileW} name="Films" count={films.length} tone={tone(hash(eventId) + 5)} icon="film" onPress={() => setFilmsOpen(true)} /> : null}
          </View>

          {!privateGallery && preview?.items.length ? (
            <Pressable accessibilityRole="button" accessibilityLabel="See all photos" onPress={() => router.push({ pathname: '/event/[id]/photos', params: { id: shortId, scope: 'album' } })}
              style={{ flexDirection: 'row', gap: 4 }}>
              {preview.items.slice(0, 4).map((p) => <PhotoTile key={p.id} photo={p} size={(width - 32 - 12) / 4} radius={6} />)}
            </Pressable>
          ) : null}

          {s.guestUploads ? (
            <InfoCard icon="upload-cloud" title="Were you taking photos too?" body={`Add up to ${s.guestUploadLimit} of your shots to the Guest uploads album.`} action="Add" onAction={() => router.push({ pathname: '/guest-upload', params: { shortId } })} />
          ) : null}

          {s.allowEnquiries ? <EnquiryPrompt shortId={shortId} studioName={studio.name} source={`${event.name} gallery (app)`} /> : null}

          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 11, backgroundColor: studio.brandColor, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {studio.logoUrl ? <Image source={{ uri: studio.logoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Txt style={{ fontFamily: font.display, color: '#fff', fontSize: 20 }}>{studio.name[0]}</Txt>}
            </View>
            <Pressable style={{ flex: 1 }} accessibilityRole="button" onPress={() => router.push({ pathname: '/studio/[code]', params: { code: studio.followCode } })}>
              <Txt weight="bold">Photos by {studio.name}</Txt>
              <Txt v="small">{following ? 'You follow this studio' : 'Follow to see their new galleries'}</Txt>
            </Pressable>
            <Button label={following ? 'Following' : 'Follow'} size="sm" icon={following ? 'check' : 'plus'} loading={followBusy} onPress={toggleFollow} />
          </Card>
        </View>
      </ScrollView>

      <Sheet open={filmsOpen} onClose={() => setFilmsOpen(false)} title="Films">
        <View style={{ paddingHorizontal: 16 }}>
          {films.map((f, i) => (
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
