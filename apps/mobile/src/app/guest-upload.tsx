import { useState } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { Button, Card, EmptyState, Icon, LoadingList, Screen, Txt } from '@/components'
import { useApi } from '@/lib/api'
import { actions, useLocal } from '@/lib/local'
import { useAlbums, useEvent } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { useTheme } from '@/theme'

/** Guest upload: pick photos → api.uploadPhotos into the event's Guest uploads album. */
export default function GuestUpload() {
  const { c } = useTheme()
  const api = useApi()
  const { width } = useWindowDimensions()
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const { data: event } = useEvent(eventId)
  const { data: albums } = useAlbums(eventId)
  const sentBefore = useLocal((s) => s.guestUploads[eventId] ?? 0)
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([])
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(0)

  if (!event || !albums) return <LoadingList />
  const album = albums.find((a) => a.kind === 'guest')
  const s = event.settings
  const remaining = Math.max(0, s.guestUploadLimit - sentBefore)
  if (!s.guestUploads || !album) return <Screen><EmptyState icon="upload-cloud" title="Guest uploads are off" body="The host isn’t collecting guest photos for this event." /></Screen>

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.min(remaining, 50), quality: 0.9, orderedSelection: true })
    if (!res.canceled) setAssets(res.assets)
  }

  const send = async () => {
    setBusy(true)
    try {
      await api.uploadPhotos(event.id, album.id, assets.map((a, i) => ({
        filename: a.fileName ?? `guest_${Date.now()}_${i}.jpg`, size: a.fileSize ?? 3_000_000, url: a.uri, width: a.width, height: a.height,
      })), { quality: 'web' })
      actions.countGuestUpload(event.id, assets.length)
      setSent(assets.length)
      setAssets([])
    } catch (e) {
      toast.error('Upload didn’t finish', e instanceof Error ? e.message : 'Check your connection and try again')
    } finally { setBusy(false) }
  }

  if (sent) {
    return (
      <Screen contentStyle={{ alignItems: 'center', paddingTop: 48, gap: 12 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.okSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={30} color={c.ok} /></View>
        <Txt v="h2" center>{sent} photos sent</Txt>
        <Txt v="small" center style={{ maxWidth: 300 }}>{s.reviewGuestUploads ? 'Sent for review. They’ll appear in Guest uploads once the host approves them.' : 'They’re now in the Guest uploads album.'}</Txt>
        <Button label="Done" variant="primary" size="lg" full style={{ marginTop: 12 }} onPress={() => router.back()} />
      </Screen>
    )
  }

  const size = Math.floor((width - 32 - 12) / 4)
  return (
    <Screen>
      <Txt v="small">Share the photos you took at {event.name}. Up to {remaining} more from this phone{s.watermarkGuestUploads ? '; the studio adds a watermark' : ''}.</Txt>
      {assets.length ? (
        <Card style={{ gap: 12 }}>
          <Txt weight="bold">{assets.length} selected</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {assets.slice(0, 16).map((a) => <Image key={a.uri} source={{ uri: a.uri }} style={{ width: size, height: size, borderRadius: 6 }} contentFit="cover" />)}
          </View>
          {assets.length > 16 ? <Txt v="small">+{assets.length - 16} more</Txt> : null}
          <Button label="Choose different photos" variant="ghost" onPress={pick} />
        </Card>
      ) : (
        <EmptyState icon="image" title="Pick your photos" body="Choose from your gallery. Originals stay on your phone." action="Choose photos" onAction={pick} />
      )}
      {assets.length ? <Button label={`Send ${assets.length} photos`} variant="primary" size="lg" loading={busy} onPress={send} /> : null}
      <Txt v="small" center color={c.ink3}>{s.reviewGuestUploads ? 'The host reviews guest photos before others can see them.' : 'Guest photos appear straight away.'}</Txt>
    </Screen>
  )
}
