import { useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as WebBrowser from 'expo-web-browser'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import { useQueryClient } from '@tanstack/react-query'
import { DEMO_NOW, fmt, hash, tone, type Album, type Photo, type PublicBlockReason, type PublicEvent, type Tone } from '@frameline/shared'
import { Button, Card, Chip, EmptyState, ErrorState, Icon, IconButton, Input, LinkText, LoadingList, PhotoTile, SettingRow, Sheet, ToneView, Txt, type IconName } from '@/components'
import { GalleryHero, PinGate, RegistrationGate } from '@/components/gates'
import { JoinForm } from '@/components/guest'
import { DownloadSheet } from '@/components/DownloadSheet'
import { useApi } from '@/lib/api'
import { errorCode, friendlyError } from '@/lib/errors'
import { useGuestAccessGuard } from '@/lib/guest'
import { eventLink } from '@/lib/links'
import { actions, lastRegistration, local, useLocal } from '@/lib/local'
import { useHighlights, useMyFavourites, useMyOrders, useMyPhotos, usePublicEvent, usePublicPhotos } from '@/lib/queries'
import { CaptureHost, type CaptureHandle } from '@/lib/save'
import { toast } from '@/lib/toast'
import { font, radius, shadow, useTheme } from '@/theme'

type GTab = 'event' | 'mine' | 'favourites' | 'orders'
const GTABS: { value: GTab; label: string; icon: IconName }[] = [
  { value: 'event', label: 'Event', icon: 'home' }, { value: 'mine', label: 'My photos', icon: 'face' },
  { value: 'favourites', label: 'Favourites', icon: 'heart' }, { value: 'orders', label: 'Orders', icon: 'shopping-bag' },
]

/** Guest gallery. The route param is the event short id (public endpoints are keyed by it). */
export default function GuestEvent() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { id: shortId, tab } = useLocalSearchParams<{ id: string; tab?: GTab }>()
  const { data: event, error, refetch, isLoading } = usePublicEvent(shortId)
  const unlocked = useLocal((s) => s.unlocked.includes(event?.id ?? ''))
  const registered = useLocal((s) => !!s.registrations[event?.id ?? ''])

  const back = (
    <View style={{ position: 'absolute', top: insets.top + 6, left: 10, zIndex: 5 }}>
      <IconButton icon="arrow-left" label="Back" tone="overlay" onPress={() => (router.canGoBack() ? router.back() : router.replace('/events'))} />
    </View>
  )

  if (isLoading) return <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top }}><LoadingList /></View>
  if (error || !event) {
    if (errorCode(error) === 'not_found') {
      return (
        <ScrollView style={{ flex: 1, backgroundColor: c.paper }} contentContainerStyle={{ paddingTop: insets.top + 56, padding: 16 }} keyboardShouldPersistTaps="handled">
          {back}
          <EmptyState icon="search" tone="warn" title="We couldn’t find this gallery" body={`No event uses the code ${String(shortId).toUpperCase()}. Check the code on your invite, or type it again.`} />
          <Card style={{ gap: 10 }}><JoinForm compact /></Card>
        </ScrollView>
      )
    }
    return <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top + 40 }}>{back}<ErrorState error={error} onRetry={refetch} /></View>
  }
  if (event.blocked) return <Blocked event={event} reason={event.blocked} back={back} />
  if (event.settings.access === 'link-pin' && !unlocked) return <View style={{ flex: 1 }}>{back}<PinGate event={event} /></View>
  if ((event.settings.requireRegistration || event.settings.access === 'registered') && !registered) return <View style={{ flex: 1 }}>{back}<RegistrationGate event={event} /></View>
  return <Landing event={event} back={back} initialTab={tab} />
}

/* ---------------- Closed / not ready: every dead end offers a way out ---------------- */

function Blocked({ event, reason, back }: { event: PublicEvent; reason: PublicBlockReason; back: React.ReactNode }) {
  const { c } = useTheme()
  const studio = event.studio
  const whatsapp = () => Linking.openURL(`https://wa.me/${(studio.whatsapp || studio.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Hi! Could you reopen the ${event.name} gallery? (${event.shortId})`)}`).catch(() => toast.error('Couldn’t open WhatsApp', studio.phone))
  const call = () => Linking.openURL(`tel:${studio.phone.replace(/\s/g, '')}`).catch(() => toast.error('Couldn’t start a call', studio.phone))
  const api = useApi()
  const qc = useQueryClient()
  const reg = useLocal(lastRegistration)
  const notified = useLocal((st) => st.notify[event.id])
  const [phone, setPhone] = useState(reg?.phone ?? '')
  const [busy, setBusy] = useState(false)
  /** requestNotify: the studio's system messages this number when the first photos go live. */
  const notify = async () => {
    if (phone.replace(/\D/g, '').length < 8) { toast.error('Add your mobile number', 'We send one message when the photos are here'); return }
    setBusy(true)
    try {
      await api.requestNotify(event.shortId, phone.trim())
      actions.join(event)
      actions.setNotify(event.id, phone.trim())
      toast.success('We’ll message you', `At ${phone.trim()} when the photos are here`)
    } catch (e) {
      if (errorCode(e) === 'already_live') { qc.invalidateQueries({ queryKey: ['public-event'] }); toast.success('The photos are here', 'Opening the gallery'); return }
      const f = friendlyError(e); toast.error(f.title, f.detail)
    } finally { setBusy(false) }
  }
  const stop = async () => {
    if (!notified) return
    setBusy(true)
    try { await api.cancelNotify(event.shortId, notified); actions.setNotify(event.id, null); toast.success('We won’t message you') } catch (e) { const f = friendlyError(e); toast.error(f.title, f.detail) } finally { setBusy(false) }
  }
  const copy: Record<PublicBlockReason, { icon: IconName; title: string; body: string }> = {
    expired: { icon: 'calendar', title: 'This gallery has closed', body: `${studio.name} can reopen it for you.` },
    disabled: { icon: 'lock', title: 'This gallery is turned off', body: `${studio.name} has turned it off for now. They can turn it back on.` },
    archived: { icon: 'archive', title: 'This gallery is archived', body: `${studio.name} can restore it for you.` },
    empty: { icon: 'image', title: 'Photos are on their way', body: 'The studio is still uploading. We’ll let you know when they’re here.' },
  }
  const b = copy[reason]
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.paper }}>
      {back}
      <GalleryHero event={event} small={reason !== 'expired'} />
      <View style={{ padding: 20 }}>
        {reason === 'empty' ? (
          notified ? (
            <EmptyState icon="check-circle" title="We’ll message you" body={`We’ll send one message to ${notified} when the photos are here.`} action="Stop" actionVariant="ghost" onAction={stop} />
          ) : (
            <EmptyState icon={b.icon} title={b.title} body={b.body}>
              <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 8 }}>
                <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="Your mobile, e.g. +91 98450 55012" accessibilityLabel="Your mobile number" />
                <Button label="Notify me" icon="bell" loading={busy} onPress={notify} />
              </View>
            </EmptyState>
          )
        ) : (
          <EmptyState icon={b.icon} tone="warn" title={b.title} body={b.body} action="Message on WhatsApp" icon2="message-circle" onAction={whatsapp} secondary="Call the studio" onSecondary={call} />
        )}
      </View>
    </ScrollView>
  )
}

/* ---------------- Landing with Event · My photos · Favourites · Orders ---------------- */

function Landing({ event, back, initialTab }: { event: PublicEvent; back: React.ReactNode; initialTab?: GTab }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<GTab>(initialTab ?? 'event')
  const [tipsOpen, setTipsOpen] = useState(false)
  const selfieAt = useLocal((st) => st.selfie[event.id]?.at)
  const first = useRef(selfieAt)
  // A new selfie match (from the selfie screen) lands on My photos.
  useEffect(() => { if (selfieAt && selfieAt !== first.current) { first.current = selfieAt; setTab('mine') } }, [selfieAt])

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      {tab === 'event' ? <EventHome event={event} back={back} onFind={() => setTipsOpen(true)} onMine={() => setTab('mine')} />
        : tab === 'mine' ? <MinePanel event={event} onFind={() => setTipsOpen(true)} />
          : tab === 'favourites' ? <FavouritesPanel event={event} />
            : <OrdersPanel event={event} />}

      <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: c.surface, borderTopColor: c.line, paddingBottom: insets.bottom + 4 }]}>
        {GTABS.map((t) => {
          const on = t.value === tab
          return (
            <Pressable key={t.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label} onPress={() => setTab(t.value)} style={styles.tab}>
              <Icon name={t.icon} size={21} color={on ? c.accentText : c.ink3} />
              <Txt style={{ fontFamily: font.bodyBold, fontSize: 11, color: on ? c.accentText : c.ink3 }}>{t.label}</Txt>
            </Pressable>
          )
        })}
      </View>
      <SelfieTips event={event} open={tipsOpen} onClose={() => setTipsOpen(false)} />
    </View>
  )
}

function EventHome({ event, back, onFind, onMine }: { event: PublicEvent; back: React.ReactNode; onFind: () => void; onMine: () => void }) {
  const { c } = useTheme()
  const api = useApi()
  const qc = useQueryClient()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const s = event.settings
  const studio = event.studio
  const eventId = event.id
  const shortId = event.shortId
  const joined = useLocal((st) => st.joined.find((j) => j.eventId === eventId))
  const reg = useLocal((st) => st.registrations[eventId])
  const selfie = useLocal((st) => st.selfie[eventId])
  const seeAll = useLocal((st) => st.seeAll.includes(eventId))
  const following = useLocal((st) => st.following.includes(studio.followCode))
  // Face privacy: without a typed PIN / VIP "all", the server only returns the photos the guest is in.
  const privateGallery = s.facePrivacy && s.faceSearch && !seeAll
  const { data: mine } = useMyPhotos(shortId, eventId)
  const { data: highlights, error: hlError } = useHighlights(shortId, event.highlights && !privateGallery)
  const { error: previewError } = usePublicPhotos(shortId, { limit: 1 }, !privateGallery)
  useGuestAccessGuard(eventId, previewError, hlError)
  const [filmsOpen, setFilmsOpen] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)

  const albums = useMemo(() => event.albums.filter((a) => a.kind === 'album' || (a.kind === 'guest' && a.photoCount > 0)), [event.albums])
  const welcome = joined?.welcomeName ?? reg?.name?.split(' ')[0]
  const tileW = Math.floor((width - 32 - 10) / 2)
  const locked = privateGallery && !selfie

  const openAlbum = (a: Album) => {
    if (locked) { toast.info('Find your photos first', 'Take a selfie and we’ll open the albums you’re in'); onFind(); return }
    router.push({ pathname: '/event/[id]/photos', params: { id: shortId, scope: privateGallery ? 'mine' : 'album', albumId: a.id } })
  }
  const toggleFollow = async () => {
    if (following) {
      actions.unfollow(studio.followCode)
      api.unfollowStudio(studio.followCode).then(() => qc.invalidateQueries({ queryKey: ['studio-profile'] }), () => {})
      toast.undo(`Unfollowed ${studio.name}`, () => { actions.follow(studio.followCode); api.followStudio(studio.followCode).catch(() => {}) })
      return
    }
    setFollowBusy(true)
    try {
      await api.followStudio(studio.followCode)
      actions.follow(studio.followCode)
      qc.invalidateQueries({ queryKey: ['studio-profile'] })
      toast.success(`Following ${studio.name}`)
    } catch (e) { const f = friendlyError(e); toast.error(f.title, f.detail) } finally { setFollowBusy(false) }
  }

  return (
    <>
      {back}
      <View style={{ position: 'absolute', top: insets.top + 6, right: 10, zIndex: 5 }}>
        <IconButton icon="share" label="Share gallery link" tone="overlay" onPress={() => Share.share({ message: `${event.name}, photos by ${studio.name}: ${eventLink(event)}` })} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <GalleryHero event={event} />
        <View style={{ padding: 16, gap: 12 }}>
          {welcome ? <Txt v="small">Welcome, {welcome}</Txt> : null}
          {s.faceSearch ? (
            selfie ? (
              <>
                <Button label={mine?.length ? `See your ${fmt.count(mine.length)} photos` : 'See your photos'} icon="face" variant="primary" size="lg" onPress={onMine} />
                <LinkText label="Not you? Take a new selfie" small onPress={onFind} />
              </>
            ) : <Button label="Find my photos" icon="face" variant="primary" size="lg" onPress={onFind} />
          ) : null}
          {!privateGallery ? (
            <Button label={`Browse all ${fmt.count(event.photoCount)}`} variant={s.faceSearch ? 'secondary' : 'primary'} size={s.faceSearch ? 'md' : 'lg'} onPress={() => router.push({ pathname: '/event/[id]/photos', params: { id: shortId, scope: 'album' } })} />
          ) : null}

          <Txt v="h3" style={{ marginTop: 6 }}>Albums</Txt>
          {locked ? <Txt v="small" style={{ marginTop: -6 }}>Each guest sees only the photos they’re in. Find your photos first to open the albums.</Txt> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {event.highlights && highlights?.length ? (
              <AlbumTile width={tileW} name="Highlights" count={highlights.length} tone={highlights[0]!.tone} icon="star"
                onPress={() => router.push({ pathname: '/event/[id]/photos', params: { id: shortId, scope: 'highlights' } })} />
            ) : null}
            {albums.map((a) => {
              const own = mine?.filter((p) => p.albumId === a.id).length
              return <AlbumTile key={a.id} width={tileW} name={a.kind === 'guest' ? 'Guest uploads' : a.name} count={privateGallery ? (own ?? 0) : a.photoCount} tone={tone(hash(a.id))} icon={locked ? 'lock' : a.kind === 'guest' ? 'users' : undefined} onPress={() => openAlbum(a)} />
            })}
            {event.films.length ? <AlbumTile width={tileW} name="Films" count={event.films.length} tone={tone(hash(eventId) + 5)} icon="film" onPress={() => setFilmsOpen(true)} /> : null}
          </View>

          {s.guestUploads ? (
            <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={[styles.icon, { backgroundColor: c.sunk }]}><Icon name="upload" size={18} color={c.ink2} /></View>
              <View style={{ flex: 1 }}>
                <Txt weight="bold">Were you taking photos too?</Txt>
                <Txt v="small">Add up to {s.guestUploadLimit} of yours{s.reviewGuestUploads ? '. The host checks them first.' : '.'}</Txt>
              </View>
              <Button label="Add" size="sm" onPress={() => router.push({ pathname: '/guest-upload', params: { shortId } })} />
            </Card>
          ) : null}

          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 11, backgroundColor: studio.brandColor, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {studio.logoUrl ? <Image source={{ uri: studio.logoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Txt style={{ fontFamily: font.bodyHeavy, color: '#fff', fontSize: 18 }}>{studio.name[0]}</Txt>}
            </View>
            <Pressable style={{ flex: 1, minHeight: 44, justifyContent: 'center' }} accessibilityRole="button" onPress={() => router.push({ pathname: '/studio/[code]', params: { code: studio.followCode } })}>
              <Txt weight="bold">Photos by {studio.name}</Txt>
              <Txt v="small">{following ? 'You follow this studio' : 'Follow to see their new events'}</Txt>
            </Pressable>
            <Button label={following ? 'Following' : 'Follow'} size="sm" icon={following ? 'check' : 'plus'} loading={followBusy} onPress={toggleFollow} />
          </Card>
        </View>
      </ScrollView>

      <Sheet open={filmsOpen} onClose={() => setFilmsOpen(false)} title="Films">
        <View style={{ paddingHorizontal: 16 }}>
          {event.films.map((f, i) => (
            <SettingRow key={f.id} first={i === 0} icon="film" title={f.name} detail="Opens in your browser"
              onPress={() => { WebBrowser.openBrowserAsync(f.url).catch(() => toast.error('Couldn’t open the film', 'Check your connection and try again')) }} />
          ))}
        </View>
      </Sheet>
    </>
  )
}

/** Selfie tips sheet (g-home): three tips, gold Take a selfie, or choose a photo. Then the selfie screen confirms. */
function SelfieTips({ event, open, onClose }: { event: PublicEvent; open: boolean; onClose: () => void }) {
  const { c } = useTheme()
  const go = (a: ImagePicker.ImagePickerAsset) => {
    onClose()
    router.push({ pathname: '/event/[id]/selfie', params: { id: event.shortId, uri: a.uri, name: a.fileName ?? a.uri.split('/').pop() ?? 'selfie.jpg', size: String(a.fileSize ?? a.width * a.height), w: String(a.width), h: String(a.height) } })
  }
  const take = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) { toast.error('Camera access is off', 'Allow the camera in Settings, or choose a photo of yourself'); return }
    try {
      const res = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, mediaTypes: ['images'], quality: 0.6 })
      if (!res.canceled && res.assets[0]) go(res.assets[0])
    } catch { toast.error('The camera isn’t available', 'Choose a photo of yourself instead') }
  }
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, selectionLimit: 1 })
    if (!res.canceled && res.assets[0]) go(res.assets[0])
  }
  return (
    <Sheet open={open} onClose={onClose} title="Find your photos with a selfie">
      <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}>
        {['Face the camera in good light', 'Take off sunglasses', 'Only used to find you in this event'].map((t) => (
          <View key={t} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Icon name="check" size={16} color={c.ok} />
            <Txt>{t}</Txt>
          </View>
        ))}
        <Button label="Take a selfie" icon="camera" variant="primary" size="lg" onPress={take} />
        <Button label="Choose a photo" icon="image" onPress={pick} />
      </View>
    </Sheet>
  )
}

/** My photos (g-mine): "You're in 42 photos", download all, album chips, grid; no match → Retake. */
function MinePanel({ event, onFind }: { event: PublicEvent; onFind: () => void }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const selfie = useLocal((st) => st.selfie[event.id])
  const favs = useLocal((st) => st.favourites)
  const { data: mine, isLoading, error, refetch } = useMyPhotos(event.shortId, event.id)
  const [albumId, setAlbumId] = useState<string>()
  const [dlOpen, setDlOpen] = useState(false)
  const capture = useRef<CaptureHandle>(null)
  useGuestAccessGuard(event.id, error)
  const list = (mine ?? []).filter((p) => !albumId || p.albumId === albumId)
  const chips = event.albums.map((a) => ({ a, n: (mine ?? []).filter((p) => p.albumId === a.id).length })).filter((x) => x.n > 0)
  const size = Math.floor((width - 6) / 3)
  const favSet = useMemo(() => new Set(favs.map((f) => f.photoId)), [favs])
  const canDownload = event.settings.downloads !== 'none'

  const top = (title: string, right?: React.ReactNode) => (
    <View style={[styles.top, { paddingTop: insets.top + 8, backgroundColor: c.surface, borderBottomColor: c.line }]}>
      <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/events'))} />
      <Txt v="h3" style={{ flex: 1, fontSize: 17 }}>{title}</Txt>
      {right}
    </View>
  )

  if (!event.settings.faceSearch) {
    return <View style={{ flex: 1 }}>{top('Your photos')}<EmptyState icon="image" title="Selfie search is off" body="This event doesn’t use face search. Browse the albums to find your photos." action="Browse all photos" onAction={() => router.push({ pathname: '/event/[id]/photos', params: { id: event.shortId, scope: 'album' } })} /></View>
  }
  if (!selfie) {
    return <View style={{ flex: 1 }}>{top('Your photos')}<EmptyState icon="face" title="Find your photos with a selfie" body={`We look through ${fmt.count(event.photoCount)} photos and show only the ones you’re in.`} action="Find my photos" onAction={onFind} /></View>
  }
  const retake = <LinkText label="Not you? Retake" small onPress={onFind} />
  if (isLoading) return <View style={{ flex: 1 }}>{top('Your photos', retake)}<LoadingList rows={3} /></View>
  if (error) return <View style={{ flex: 1 }}>{top('Your photos', retake)}<ErrorState error={error} onRetry={refetch} /></View>
  if (!mine?.length) {
    return <View style={{ flex: 1 }}>{top('Your photos')}<EmptyState icon="face" title="We couldn’t find you yet" body="Photos are still being added. Try again later, or retake the selfie in good light." action="Retake" actionVariant="secondary" onAction={onFind} /></View>
  }

  return (
    <View style={{ flex: 1 }}>
      {top('Your photos', retake)}
      <CaptureHost ref={capture} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ padding: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt weight="heavy" style={{ flex: 1, fontSize: 16 }}>You’re in {fmt.count(mine.length)} photos</Txt>
            {canDownload ? <Button label="All" icon="download" size="sm" onPress={() => setDlOpen(true)} /> : null}
          </View>
          {chips.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <Chip label="All" count={mine.length} selected={!albumId} onPress={() => setAlbumId(undefined)} />
              {chips.map(({ a, n }) => <Chip key={a.id} label={a.kind === 'guest' ? 'Guest uploads' : a.name} count={n} selected={albumId === a.id} onPress={() => setAlbumId(a.id)} />)}
            </ScrollView>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
          {list.map((p, i) => (
            <PhotoTile key={p.id} photo={p} size={size} favourite={favSet.has(p.id)} label={`Photo ${i + 1} of ${list.length}`}
              onPress={() => router.push({ pathname: '/viewer', params: { shortId: event.shortId, eventId: event.id, scope: 'mine', albumId: albumId ?? '', start: p.id } })} />
          ))}
        </View>
        <Txt v="small" center color={c.ink3} style={{ marginTop: 12 }}>Selfie taken {fmt.ago(selfie.at, Math.max(DEMO_NOW, Date.parse(selfie.at)))}. It’s only used for this event.</Txt>
      </ScrollView>
      <DownloadSheet open={dlOpen} onClose={() => setDlOpen(false)} photos={list} event={event} host={capture} personId={selfie.personId} />
    </View>
  )
}

/** Favourites (g-after): explains why it exists (the client proofing tool). */
function FavouritesPanel({ event }: { event: PublicEvent }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const registered = useLocal((st) => !!st.registrations[event.id])
  const { data: server } = useMyFavourites(event.shortId, registered)
  useEffect(() => {
    const have = new Set(local.get().favourites.map((f) => f.photoId))
    for (const p of server ?? []) if (!have.has(p.id)) actions.setFavourite(p, event.shortId, true)
  }, [server, event.shortId])
  const favs = useLocal((st) => st.favourites.filter((f) => f.eventId === event.id && f.photo).map((f) => f.photo as Photo))
  const size = Math.floor((width - 6) / 3)
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.top, { paddingTop: insets.top + 8, backgroundColor: c.surface, borderBottomColor: c.line }]}><Txt v="h3" style={{ fontSize: 17 }}>Favourites</Txt></View>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Txt v="small" style={{ padding: 14 }}>{event.studio.name} can see your favourites. Use them to tell them which ones you love.</Txt>
        {favs.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
            {favs.map((p, i) => <PhotoTile key={p.id} photo={p} size={size} favourite label={`Favourite ${i + 1}`} onPress={() => router.push({ pathname: '/viewer', params: { eventId: event.id, shortId: event.shortId, scope: 'favourites', start: p.id } })} />)}
          </View>
        ) : <EmptyState icon="heart" title="No favourites yet" body="Tap the heart on any photo to keep it here." />}
      </ScrollView>
    </View>
  )
}

const ORDER_STATUS: Record<string, { label: string; tone: 'ok' | 'accent' | 'warn' | 'neutral' }> = {
  paid: { label: 'Paid', tone: 'ok' }, printing: { label: 'Printing', tone: 'accent' }, refunded: { label: 'Refunded', tone: 'neutral' }, pending: { label: 'Payment pending', tone: 'warn' }, 'paid-direct': { label: 'Paid to studio', tone: 'ok' },
}

function OrdersPanel({ event }: { event: PublicEvent }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { data, isLoading, error, refetch } = useMyOrders(event.shortId)
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.top, { paddingTop: insets.top + 8, backgroundColor: c.surface, borderBottomColor: c.line }]}><Txt v="h3" style={{ fontSize: 17 }}>Orders</Txt></View>
      {isLoading ? <LoadingList rows={2} /> : error ? <ErrorState error={error} onRetry={refetch} /> : data?.length ? (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
          {data.map((o) => (
            <Card key={o.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt weight="bold" style={{ flex: 1 }}>{o.items}</Txt>
                <Txt weight="heavy" style={{ fontVariant: ['tabular-nums'] }}>{fmt.money(o.paid, o.currency)}</Txt>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt v="small" style={{ flex: 1 }}>Order #{o.number} · {fmt.ago(o.at, DEMO_NOW)}{o.shipping ? ` · to ${o.shipping.city}` : ''}</Txt>
                <Chip label={ORDER_STATUS[o.status]?.label ?? o.status} tone={ORDER_STATUS[o.status]?.tone ?? 'neutral'} />
              </View>
              {o.refundReason ? <Txt v="small" color={c.ink3}>Refunded: {o.refundReason}</Txt> : null}
            </Card>
          ))}
        </ScrollView>
      ) : (
        <EmptyState icon="shopping-bag" title="No orders yet" body={event.settings.storeEnabled ? 'Open any photo and tap Buy print, or buy all your photos in full size.' : 'This event isn’t selling photos.'} />
      )}
    </View>
  )
}

function AlbumTile({ name, count, tone: t, icon, onPress, width }: { name: string; count: number; tone: Tone; icon?: IconName; onPress: () => void; width: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${count} photos${icon === 'lock' ? ', find your photos first' : ''}`} onPress={onPress} style={({ pressed }) => ({ width, opacity: pressed ? 0.85 : 1 })}>
      <ToneView tone={t} style={{ height: width * 0.62, borderRadius: radius.card, padding: 10, justifyContent: 'flex-end', overflow: 'hidden' }}>
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0.3 }} end={{ x: 0.5, y: 1 }} />
        {icon ? <View style={styles.albumIcon}><Icon name={icon} size={13} color="#fff" /></View> : null}
        <Txt style={{ fontFamily: font.bodyHeavy, color: '#fff', fontSize: 14 }} numberOfLines={1}>{name}</Txt>
        <Txt style={{ fontFamily: font.bodySemi, color: 'rgba(255,255,255,0.88)', fontSize: 11.5, fontVariant: ['tabular-nums'] }}>{icon === 'lock' ? 'Find your photos first' : `${fmt.count(count)} photos`}</Txt>
      </ToneView>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 4, ...shadow.card },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 52 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, minHeight: 52 },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  albumIcon: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
})
