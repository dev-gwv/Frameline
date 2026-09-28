import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { fmt, type UploadQuality } from '@frameline/shared'
import { Button, Card, Chip, Icon, Meter, RadioCards, Screen, SettingRow, Sheet, ToneView, Txt } from '@/components'
import { StudioTopBar } from '@/components/studio'
import { useAlbums, useEvents, useUsage } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { uploads, useUploads, type UploadItem } from '@/lib/uploads'
import { radius, useTheme } from '@/theme'

/**
 * Upload tab: progress card, choose the event and album first, then the gold "Choose from your phone".
 * Camera sync is one tap away. Quality folds under More options.
 */
export default function Upload() {
  const { c } = useTheme()
  const params = useLocalSearchParams<{ eventId?: string; albumId?: string }>()
  const { data: events } = useEvents()
  const { data: usage } = useUsage()
  // A choice made here applies until a new event is passed in via params (e.g. "Upload" on an event).
  const [picked, setPicked] = useState<{ forParam?: string; eventId?: string; albumId?: string }>({})
  const own = picked.forParam === params.eventId ? picked : {}
  const choosable = (events ?? []).filter((e) => e.status !== 'archived')
  const eventId = own.eventId ?? params.eventId ?? choosable.find((e) => e.status === 'uploading')?.id ?? choosable[0]?.id
  const setEventId = (id: string) => setPicked({ forParam: params.eventId, eventId: id })
  const setAlbumId = (id: string) => setPicked({ forParam: params.eventId, eventId, albumId: id })
  const [quality, setQuality] = useState<UploadQuality>('web')
  const [more, setMore] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data: albums } = useAlbums(eventId)
  const { items, paused } = useUploads()

  const event = choosable.find((e) => e.id === eventId)
  const albumChoices = (albums ?? []).filter((a) => a.kind === 'album')
  const wantAlbum = own.albumId ?? (own.eventId ? undefined : params.albumId)
  const albumId = albumChoices.some((a) => a.id === wantAlbum) ? wantAlbum : albumChoices[0]?.id
  const album = albumChoices.find((a) => a.id === albumId)
  const left = usage ? usage.photosLimit - usage.photosUsed : undefined

  const pick = async () => {
    if (!event || !albumId) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { toast.error('Photo access is off', 'Allow Frameline to read your photos in Settings to upload'); return }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 200, quality: quality === 'original' ? 1 : 0.85, orderedSelection: true, exif: false })
    if (res.canceled || !res.assets.length) return
    uploads.add(res.assets.map((a, i) => ({
      uri: a.uri, filename: a.fileName ?? `IMG_${Date.now()}_${i}.jpg`, size: a.fileSize ?? 4_000_000, width: a.width, height: a.height,
      eventId: event.id, albumId, quality,
    })))
    toast.success(`Uploading ${res.assets.length} photos to ${album?.name ?? 'the album'}`)
  }

  const active = items.filter((i) => i.status !== 'done' && i.status !== 'error')
  const done = items.filter((i) => i.status === 'done').length
  const failed = items.filter((i) => i.status === 'error')
  const current = active[0] ?? items[items.length - 1]
  const currentAlbum = current ? (albums ?? []).find((a) => a.id === current.albumId)?.name ?? choosable.find((e) => e.id === current.eventId)?.name : undefined
  const minsLeft = Math.max(1, Math.round(active.length * 0.9 / 3))

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <StudioTopBar />
      <Screen>
        <Txt v="h1">Upload</Txt>

        {items.length ? (
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt weight="heavy" style={{ flex: 1, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                {currentAlbum ? `${currentAlbum} · ` : ''}{done} of {items.length}
              </Txt>
              <Txt v="small" color={c.ink3}>{active.length ? (paused ? 'Paused' : `About ${minsLeft} min`) : failed.length ? `${failed.length} didn’t upload` : 'All done'}</Txt>
            </View>
            <Meter value={done} max={items.length} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {active.length ? <Button label={paused ? 'Resume' : 'Pause'} icon={paused ? 'play' : 'pause'} size="sm" style={{ flex: 1 }} onPress={() => (paused ? uploads.resume() : uploads.pause())} /> : null}
              {failed.length ? <Button label={`Try ${failed.length} again`} icon="refresh-cw" size="sm" style={{ flex: 1 }} onPress={() => failed.forEach((f) => uploads.retry(f.id))} /> : null}
              {!active.length && done ? <Button label="See the photos" size="sm" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/manage/[id]', params: { id: items[items.length - 1]!.eventId } })} /> : null}
              {!active.length && done ? <Button label="Clear" size="sm" variant="ghost" onPress={() => uploads.clearDone()} /> : null}
            </View>
          </Card>
        ) : null}

        <Card style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Txt v="label">Upload to</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel={`Event: ${event?.name ?? 'choose'}. Change`} onPress={() => setPickerOpen(true)}
              style={({ pressed }) => [styles.select, { borderColor: c.line2, backgroundColor: c.surface, opacity: pressed ? 0.7 : 1 }]}>
              {event ? <ToneView tone={event.coverTones[0]} style={{ width: 36, height: 36, borderRadius: 6 }} /> : null}
              <View style={{ flex: 1 }}>
                <Txt weight="bold" numberOfLines={1}>{event?.name ?? 'Choose an event'}</Txt>
                {event ? <Txt v="small">{fmt.dayMonth(event.date)} · {fmt.count(event.photoCount)} photos</Txt> : null}
              </View>
              <Icon name="chevron-down" size={18} color={c.ink3} />
            </Pressable>
          </View>
          <View style={{ gap: 6 }}>
            <Txt v="label">Album</Txt>
            {albumChoices.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {albumChoices.map((a) => <Chip key={a.id} label={a.name} count={fmt.count(a.photoCount)} selected={a.id === albumId} onPress={() => setAlbumId(a.id)} />)}
              </ScrollView>
            ) : <Txt v="small">{event ? 'This event has no albums yet. Open the event to add one.' : 'Choose an event first.'}</Txt>}
          </View>

          <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(!more)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt weight="bold" color={c.accentText} style={{ flex: 1 }}>More options: {quality === 'web' ? 'Standard' : 'Original files'}</Txt>
            <Icon name={more ? 'chevron-up' : 'chevron-down'} size={17} color={c.accentText} />
          </Pressable>
          {more ? (
            <RadioCards<UploadQuality> value={quality} onChange={setQuality} options={[
              { value: 'web', title: 'Standard', description: 'Resized for the web and watermarked. Counts as 1 photo.' },
              { value: 'original', title: 'Original files', description: 'Full quality for download. Counts as 2 photos.' },
            ]} />
          ) : null}
        </Card>

        <Button label="Choose from your phone" icon="image" variant="primary" size="lg" disabled={!event || !albumId || (left !== undefined && left <= 0)} onPress={pick} />
        <Button label="Camera sync" icon="camera" onPress={() => router.push('/tools/camera-sync')} />
        {left !== undefined && left <= 0
          ? <Txt v="small" center color={c.warn}>Your plan is full. Add photos or upgrade in Plan and billing.</Txt>
          : <Txt v="small" center color={c.ink3}>Uploads keep going if you lock your phone.{left !== undefined ? ` ${fmt.count(left)} photos left in your plan.` : ''}</Txt>}

        {items.length ? (
          <Card padded={false} style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
            {items.slice().reverse().slice(0, 30).map((i, k) => <QueueRow key={i.id} item={i} first={k === 0} />)}
          </Card>
        ) : null}
      </Screen>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Upload to">
        <ScrollView style={{ paddingHorizontal: 16 }}>
          {choosable.map((e, i) => (
            <SettingRow key={e.id} first={i === 0} title={e.name} detail={`${fmt.dayMonth(e.date)} · ${e.city}`}
              right={e.id === eventId ? <Icon name="check" size={18} color={c.accentText} /> : null}
              onPress={() => { setEventId(e.id); setPickerOpen(false) }} />
          ))}
        </ScrollView>
      </Sheet>
    </View>
  )
}

function QueueRow({ item, first }: { item: UploadItem; first: boolean }) {
  const { c } = useTheme()
  const label = item.status === 'done' ? 'Uploaded' : item.status === 'error' ? 'Didn’t upload' : item.status === 'sending' ? 'Finishing…' : item.status === 'queued' ? 'Waiting' : `${Math.round(item.progress * 100)}%`
  return (
    <View style={[styles.row, !first && { borderTopWidth: 1, borderTopColor: c.line }]}>
      <Image source={{ uri: item.uri }} style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: c.sunk }} contentFit="cover" />
      <View style={{ flex: 1, gap: 5 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Txt v="small" numberOfLines={1} style={{ flex: 1, color: c.ink }}>{item.filename}</Txt>
          <Txt v="small" weight="bold" style={{ fontVariant: ['tabular-nums'] }} color={item.status === 'error' ? c.bad : item.status === 'done' ? c.ok : c.ink2}>{label}</Txt>
        </View>
        {item.status === 'done' ? null : <Meter value={item.progress} max={1} height={4} />}
        {item.status === 'error' ? <Pressable accessibilityRole="button" onPress={() => uploads.retry(item.id)} hitSlop={12} style={{ minHeight: 32, justifyContent: 'center' }}><Txt v="small" weight="bold" color={c.accentText}>Try again</Txt></Pressable> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  select: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.control + 2, padding: 8, minHeight: 52 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
})
