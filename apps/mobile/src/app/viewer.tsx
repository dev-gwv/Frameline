import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Share, StyleSheet, Text, View, useWindowDimensions, type ViewToken } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { fmt, palette, type EventSettings, type Photo } from '@frameline/shared'
import { Icon, IconButton, PhotoFill, Sheet, SettingRow, WatermarkOverlay, type IconName } from '@/components'
import { EnquiryPrompt } from '@/components/guest'
import { Zoomable } from '@/components/Zoomable'
import { useApi } from '@/lib/api'
import { eventLink } from '@/lib/links'
import { recordDownloads, useToggleFavourite } from '@/lib/guest'
import { useLocal } from '@/lib/local'
import { usePhotoList, type PhotoScope } from '@/lib/photoList'
import { useAction, useEvent, usePublicEvent, usePublicWatermark } from '@/lib/queries'
import { CaptureHost, PermissionError, savePhotos, sharePhoto, type CaptureHandle } from '@/lib/save'
import { toast } from '@/lib/toast'
import { font } from '@/theme'

/** The viewer is always dark (like the design), using the dark palette regardless of OS appearance. */
const D = palette.dark

export default function Viewer() {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const api = useApi()
  const params = useLocalSearchParams<{ eventId?: string; shortId?: string; scope: PhotoScope; albumId?: string; start?: string }>()
  const scope = params.scope ?? 'album'
  const studioMode = scope === 'studio'
  const shortId = params.shortId || undefined
  // Studio viewer reads the studio event; guests read the public gallery (no PIN, no host details).
  const { data: studioEvent } = useEvent(studioMode ? params.eventId : undefined)
  const { data: publicEvent } = usePublicEvent(studioMode ? undefined : shortId)
  const event: { id: string; shortId: string; name: string; coverPhotoId?: string; settings: Omit<EventSettings, 'pin'> } | undefined = studioMode ? studioEvent : publicEvent
  const studioName = publicEvent?.studio.name
  const { photos } = usePhotoList(scope, { eventId: params.eventId || publicEvent?.id, shortId, albumId: params.albumId || undefined })
  const toggleFavourite = useToggleFavourite()
  const { data: watermark } = usePublicWatermark(studioMode ? undefined : shortId)
  const startIndex = Math.max(0, photos.findIndex((p) => p.id === params.start))
  const [picked, setIndex] = useState<number | null>(null)
  const index = picked ?? startIndex
  const [zoomed, setZoomed] = useState(false)
  const [chrome, setChrome] = useState(true)
  const [infoOpen, setInfoOpen] = useState(false)
  const [busy, setBusy] = useState<'download' | 'share' | null>(null)
  const favs = useLocal((s) => s.favourites)
  const [host, setHost] = useState<CaptureHandle | null>(null)
  const photo = photos[index]
  const isFav = !!photo && favs.some((f) => f.photoId === photo.id)

  const hide = useAction((p: Photo) => api.updatePhotos([p.id], { hidden: !p.hidden }), { success: (_, p) => (p.hidden ? 'Photo visible to guests' : 'Photo hidden from guests') })
  const cover = useAction((v: { p: Photo; scope: 'event' | 'album' }) => api.setCover(v.p.eventId, v.p.id, v.scope), { success: (_, v) => (v.scope === 'event' ? 'Set as event cover' : 'Set as album cover') })

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<Photo>[] }) => {
    const first = viewableItems[0]
    if (first?.index != null) setIndex(first.index)
  }, [])

  const download = async () => {
    if (!photo || !event) return
    if (!studioMode && event.settings.downloads === 'none') { toast.info('Downloads are off for this gallery', 'You can still buy a print or the full-resolution photo'); return }
    setBusy('download')
    try {
      await savePhotos([photo], host)
      if (!studioMode) recordDownloads(api, [photo], event.shortId)
      toast.success('Saved to your photos')
    } catch (e) {
      if (e instanceof PermissionError) toast.error('Can’t save yet', e.message)
      else toast.info('Downloads available for real photos', 'This sample photo is a placeholder')
    } finally { setBusy(null) }
  }

  const share = async () => {
    if (!photo || !event) return
    setBusy('share')
    try {
      const ok = await sharePhoto(photo, host).catch(() => false)
      if (!ok) await Share.share({ message: `A photo from ${event.name}: ${eventLink(event)}` })
    } finally { setBusy(null) }
  }

  const renderItem = useCallback(({ item }: { item: Photo }) => {
    const ratio = item.exif.height / item.exif.width
    const h = Math.min(height * 0.72, width * ratio)
    const w = h / ratio
    return (
      <View style={{ width, height: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Zoomable width={width} height={height * 0.8} zoomed={zoomed} onZoomChange={setZoomed} onTap={() => setChrome((v) => !v)}>
          <View style={{ width: w, height: h }} accessible accessibilityRole="image" accessibilityLabel={`${item.filename}, ${fmt.dateTime(item.capturedAt)}`}>
            <PhotoFill photo={item} contentFit="contain" />
            {studioMode ? null : <WatermarkOverlay wm={watermark} width={w} height={h} />}
          </View>
        </Zoomable>
      </View>
    )
  }, [width, height, zoomed, watermark, studioMode])

  const guestActions: { icon: IconName; label: string; on: () => void; active?: boolean; loading?: boolean }[] = studioMode ? [] : [
    { icon: 'heart', label: isFav ? 'Favourited' : 'Favourite', active: isFav, on: () => { if (photo) toggleFavourite(photo, event?.shortId ?? shortId) } },
    { icon: 'download', label: 'Download', loading: busy === 'download', on: download },
    { icon: 'share', label: 'Share', loading: busy === 'share', on: share },
    ...(event?.settings.storeEnabled ? [{ icon: 'shopping-bag' as const, label: 'Buy print', on: () => { if (photo && event) router.push({ pathname: '/buy', params: { shortId: event.shortId, eventId: event.id, photoId: photo.id } }) } }] : []),
  ]

  const studioActions: typeof guestActions = photo && studioMode ? [
    { icon: photo.hidden ? 'eye' : 'eye-off', label: photo.hidden ? 'Show' : 'Hide', on: () => hide.mutate(photo) },
    { icon: 'image', label: event?.coverPhotoId === photo.id ? 'Cover ✓' : 'Set cover', active: event?.coverPhotoId === photo.id, loading: cover.isPending && cover.variables?.scope === 'event', on: () => cover.mutate({ p: photo, scope: 'event' }) },
    ...(params.albumId ? [{ icon: 'folder' as const, label: 'Album cover', loading: cover.isPending && cover.variables?.scope === 'album', on: () => cover.mutate({ p: photo, scope: 'album' }) }] : []),
    { icon: 'share', label: 'Share', loading: busy === 'share', on: share },
    { icon: 'download', label: 'Save', loading: busy === 'download', on: download },
  ] : []

  const list = studioMode ? studioActions : guestActions

  return (
    <View style={{ flex: 1, backgroundColor: D.paper }}>
      <StatusBar style="light" hidden={!chrome} />
      {photos.length ? <FlatList
        data={photos}
        keyExtractor={(p) => p.id}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={startIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={renderItem}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
      /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={D.accent} /></View>}

      {chrome ? (
        <>
          <View style={[styles.top, { paddingTop: insets.top + 4 }]}>
            <IconButton icon="arrow-left" label="Close photo" color={D.ink} onPress={() => router.back()} />
            <Text style={styles.counter} accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}>{photos.length ? `${index + 1} / ${photos.length}` : ''}</Text>
            <IconButton icon="info" label="Photo details" color={D.ink} onPress={() => setInfoOpen(true)} />
          </View>
          <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
            <CaptureHost ref={setHost} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: D.paper }]} />
            <View style={styles.actions}>
              {list.map((a) => (
                <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={a.label} accessibilityState={{ selected: !!a.active, busy: !!a.loading }} onPress={a.on} disabled={a.loading}
                  style={({ pressed }) => [styles.action, { opacity: pressed || a.loading ? 0.6 : 1 }]}>
                  <Icon name={a.icon} size={22} color={a.active ? '#F2D38A' : D.ink2} />
                  <Text style={[styles.actionLabel, a.active && { color: '#F2D38A' }]}>{a.loading ? 'Working…' : a.label}</Text>
                </Pressable>
              ))}
            </View>
            {!studioMode && event?.settings.allowEnquiries ? <View style={{ paddingHorizontal: 12 }}><EnquiryPrompt dark shortId={event.shortId} studioName={studioName} source={`${event.name} photo viewer`} /></View> : null}
          </View>
        </>
      ) : null}

      <Sheet open={infoOpen} onClose={() => setInfoOpen(false)} title="Photo details">
        {photo ? (
          <View style={{ paddingHorizontal: 16 }}>
            <SettingRow first icon="image" title={photo.filename} detail={`${photo.exif.width} × ${photo.exif.height} · ${fmt.bytes(photo.exif.sizeBytes)}`} />
            <SettingRow icon="clock" title="Taken" detail={fmt.fullDateTime(photo.capturedAt)} />
            {photo.exif.camera ? <SettingRow icon="camera" title={photo.exif.camera} detail={[photo.exif.lens, photo.exif.exposure].filter(Boolean).join(' · ')} /> : null}
            <SettingRow icon="user" title={`Uploaded by ${photo.uploadedBy}`} detail={`${photo.favourites} favourites · ${photo.downloads} downloads`} />
          </View>
        ) : null}
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, backgroundColor: 'rgba(12,10,8,0.55)' },
  counter: { fontFamily: font.mono, fontSize: 13, color: D.ink2 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 10, overflow: 'hidden' },
  actions: { flexDirection: 'row', paddingTop: 10, paddingHorizontal: 8 },
  action: { flex: 1, alignItems: 'center', gap: 4, minHeight: 52, justifyContent: 'center' },
  actionLabel: { fontFamily: font.bodySemi, fontSize: 11.5, color: D.ink2 },
})
