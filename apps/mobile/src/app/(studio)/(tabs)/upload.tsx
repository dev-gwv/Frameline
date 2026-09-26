import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { fmt, type UploadQuality } from '@frameline/shared'
import { Button, Card, Chip, EmptyState, Icon, Meter, Screen, Segmented, SettingRow, Sheet, ToneView, Txt } from '@/components'
import { useAlbums, useEvents, useUsage } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { uploads, useUploads, type UploadItem } from '@/lib/uploads'
import { radius, useTheme } from '@/theme'

export default function Upload() {
  const { c } = useTheme()
  const params = useLocalSearchParams<{ eventId?: string }>()
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data: albums } = useAlbums(eventId)
  const { items, paused } = useUploads()

  const event = choosable.find((e) => e.id === eventId)
  const albumChoices = (albums ?? []).filter((a) => a.kind === 'album')
  const albumId = albumChoices.some((a) => a.id === own.albumId) ? own.albumId : albumChoices[0]?.id

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
    toast.success(`${res.assets.length} photos added to the queue`, `Uploading to ${albumChoices.find((a) => a.id === albumId)?.name}`)
  }

  const done = items.filter((i) => i.status === 'done').length
  const pending = items.filter((i) => i.status !== 'done' && i.status !== 'error').length

  return (
    <Screen>
      <Card style={{ gap: 14 }}>
        <View style={{ gap: 6 }}>
          <Txt v="label">1 · Event</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel={`Event: ${event?.name ?? 'choose'}`} onPress={() => setPickerOpen(true)}
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
          <Txt v="label">2 · Album</Txt>
          {albumChoices.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {albumChoices.map((a) => <Chip key={a.id} label={a.name} count={a.photoCount} selected={a.id === albumId} onPress={() => setAlbumId(a.id)} />)}
            </ScrollView>
          ) : <Txt v="small">This event has no albums yet — create one on the web first.</Txt>}
        </View>
        <View style={{ gap: 6 }}>
          <Txt v="label">3 · Quality</Txt>
          <Segmented value={quality} onChange={setQuality} options={[{ value: 'web', label: 'Web-ready' }, { value: 'original', label: 'Originals 2×' }]} />
          <Txt v="small">{quality === 'web' ? 'Resized for fast viewing. Each photo counts once toward your plan.' : 'Full-size files for printing. Each photo counts twice toward your plan.'}</Txt>
        </View>
        <Button label="Choose photos" icon="image" variant="primary" size="lg" disabled={!event || !albumId} onPress={pick} />
        {usage ? (
          <View style={{ gap: 6 }}>
            <Meter value={usage.photosUsed} max={usage.photosLimit} />
            <Txt v="small"><Txt v="mono" style={{ fontSize: 12 }}>{fmt.count(usage.photosUsed)}</Txt> of <Txt v="mono" style={{ fontSize: 12 }}>{fmt.count(usage.photosLimit)}</Txt> photos used this plan year</Txt>
          </View>
        ) : null}
      </Card>

      {items.length ? (
        <Card padded={false}>
          <View style={styles.queueHead}>
            <View style={{ flex: 1 }}>
              <Txt v="h3">Uploads</Txt>
              <Txt v="small">{pending ? `${pending} left${paused ? ' · paused' : ''}` : 'All done'} · <Txt v="mono" style={{ fontSize: 12 }}>{done}/{items.length}</Txt></Txt>
            </View>
            {pending ? <Button label={paused ? 'Resume' : 'Pause'} icon={paused ? 'play' : 'pause'} size="sm" onPress={() => (paused ? uploads.resume() : uploads.pause())} /> : null}
            {done ? <Button label="Clear done" size="sm" variant="ghost" onPress={() => uploads.clearDone()} /> : null}
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            {items.slice().reverse().slice(0, 60).map((i, k) => <QueueRow key={i.id} item={i} first={k === 0} />)}
          </View>
          {done && !pending ? <View style={{ padding: 16, paddingTop: 0 }}><Button label="View event" onPress={() => router.push({ pathname: '/manage/[id]', params: { id: items[items.length - 1]!.eventId } })} /></View> : null}
        </Card>
      ) : (
        <EmptyState icon="upload-cloud" title="Nothing uploading" body="Pick photos from your phone and they’ll go straight into the album you chose. For 2,000+ photos, the desktop uploader is faster." />
      )}

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Upload to">
        <ScrollView style={{ paddingHorizontal: 16 }}>
          {choosable.map((e, i) => (
            <SettingRow key={e.id} first={i === 0} title={e.name} detail={`${fmt.dayMonth(e.date)} · ${e.city}`}
              right={e.id === eventId ? <Icon name="check" size={18} color={c.accentText} /> : null}
              onPress={() => { setEventId(e.id); setPickerOpen(false) }} />
          ))}
        </ScrollView>
      </Sheet>
    </Screen>
  )
}

function QueueRow({ item, first }: { item: UploadItem; first: boolean }) {
  const { c } = useTheme()
  const label = item.status === 'done' ? 'Uploaded' : item.status === 'error' ? 'Failed' : item.status === 'sending' ? 'Finishing…' : item.status === 'queued' ? 'Waiting' : `${Math.round(item.progress * 100)}%`
  return (
    <View style={[styles.row, !first && { borderTopWidth: 1, borderTopColor: c.line }]}>
      <Image source={{ uri: item.uri }} style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: c.sunk }} contentFit="cover" />
      <View style={{ flex: 1, gap: 5 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Txt v="small" numberOfLines={1} style={{ flex: 1, color: c.ink }}>{item.filename}</Txt>
          <Txt v="mono" style={{ fontSize: 11.5 }} color={item.status === 'error' ? c.bad : item.status === 'done' ? c.ok : c.ink2}>{label}</Txt>
        </View>
        {item.status === 'done' ? null : <Meter value={item.progress} max={1} height={4} />}
        {item.status === 'error' ? <Pressable accessibilityRole="button" onPress={() => uploads.retry(item.id)} hitSlop={10}><Txt v="small" color={c.accentText}>Retry</Txt></Pressable> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  select: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.control + 2, padding: 8, minHeight: 52 },
  queueHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
})
