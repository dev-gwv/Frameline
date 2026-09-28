import { useState } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { Button, EmptyState, Icon, LoadingList, Screen, Txt } from '@/components'
import { ApiError } from '@frameline/shared'
import { useApi } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { actions, lastRegistration, useLocal } from '@/lib/local'
import { usePublicEvent } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { useTheme } from '@/theme'

/**
 * Guest upload: pick photos → uploadGuestPhotos(shortId, files, { uploadedBy }) into the Guest uploads album (the
 * server applies review and watermarking). The limit shown is a local estimate until the server answers
 * 409 `guest_upload_limit` with the real room left.
 */
export default function GuestUpload() {
  const { c } = useTheme()
  const api = useApi()
  const { width } = useWindowDimensions()
  const { shortId } = useLocalSearchParams<{ shortId: string }>()
  const { data: event } = usePublicEvent(shortId)
  const reg = useLocal(lastRegistration)
  const sentBefore = useLocal((s) => (event ? s.guestUploads[event.id] ?? 0 : 0))
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([])
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(0)
  const [serverRemaining, setServerRemaining] = useState<number>()

  if (!event) return <LoadingList />
  const album = event.albums.find((a) => a.kind === 'guest')
  const s = event.settings
  const remaining = serverRemaining ?? Math.max(0, s.guestUploadLimit - sentBefore)
  if (!s.guestUploads || !album) return <Screen><EmptyState icon="upload-cloud" title="Guest uploads are off" body="The host isn’t collecting guest photos for this event." action="Back to the event" actionVariant="secondary" onAction={() => router.back()} /></Screen>

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.min(remaining, 50), quality: 0.9, orderedSelection: true })
    if (!res.canceled) setAssets(res.assets)
  }

  const send = async () => {
    setBusy(true)
    try {
      await api.uploadGuestPhotos(event.shortId, assets.map((a, i) => ({
        filename: a.fileName ?? `guest_${Date.now()}_${i}.jpg`, size: a.fileSize ?? 3_000_000, url: a.uri, width: a.width, height: a.height,
      })), { uploadedBy: reg?.name })
      actions.countGuestUpload(event.id, assets.length)
      setSent(assets.length)
      setAssets([])
    } catch (e) {
      if (e instanceof ApiError && e.code === 'guest_upload_limit') {
        const left = Number(e.problem.remaining)
        if (Number.isFinite(left)) { setServerRemaining(left); if (left > 0) setAssets((xs) => xs.slice(0, left)) }
        toast.error('Too many photos', Number.isFinite(left) && left > 0 ? `This gallery has room for ${left} more. We kept the first ${left} you picked.` : 'This gallery can’t take more guest photos.')
      } else if (e instanceof ApiError && e.code === 'guest_uploads_disabled') {
        toast.error('Guest uploads are off', 'The host isn’t collecting guest photos for this event any more.')
      } else {
        const f = friendlyError(e)
        toast.error(f.title, f.detail)
      }
    } finally { setBusy(false) }
  }

  if (sent) {
    const review = s.reviewGuestUploads
    return (
      <Screen contentStyle={{ alignItems: 'center', paddingTop: 48, gap: 12 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.okSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={30} color={c.ok} /></View>
        <Txt weight="heavy" center style={{ fontSize: 20 }}>{review ? 'Sent for review' : 'Added to the gallery'}</Txt>
        <Txt v="small" center style={{ maxWidth: 300 }}>{review ? `${sent} photos sent. They appear in Guest uploads once ${event.studio.name} approves them.` : `${sent} photos are now in the Guest uploads album.`}</Txt>
        <Button label="Done" variant="primary" size="lg" full style={{ marginTop: 12 }} onPress={() => router.back()} />
        {remaining - sent > 0 ? <Button label="Send more" full onPress={() => { setSent(0); pick() }} /> : null}
      </Screen>
    )
  }

  const size = Math.floor((width - 32 - 12) / 4)
  return (
    <Screen>
      <Txt v="small">{s.reviewGuestUploads ? 'The host checks them before everyone can see them.' : 'Everyone at the event can see them straight away.'} Up to {s.guestUploadLimit} each{sentBefore ? `, ${remaining} left for you` : ''}.</Txt>
      {assets.length ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {assets.slice(0, 16).map((a) => <Image key={a.uri} source={{ uri: a.uri }} style={{ width: size, height: size, borderRadius: 6 }} contentFit="cover" />)}
          </View>
          {assets.length > 16 ? <Txt v="small">and {assets.length - 16} more</Txt> : null}
          <Button label={`Send ${assets.length} photo${assets.length === 1 ? '' : 's'}`} variant="primary" size="lg" loading={busy} onPress={send} />
          <Button label="Choose different photos" variant="ghost" onPress={pick} />
        </>
      ) : remaining > 0 ? (
        <EmptyState icon="image" title="Pick your photos" body="Choose from your gallery. Your originals stay on your phone." action="Choose photos" onAction={pick} />
      ) : (
        <EmptyState icon="check-circle" title="You’ve added all you can" body={`Each guest can add ${s.guestUploadLimit} photos to this event.`} action="Done" actionVariant="secondary" onAction={() => router.back()} />
      )}
      {s.watermarkGuestUploads ? <Txt v="small" center color={c.ink3}>The studio adds its watermark to guest photos.</Txt> : null}
    </Screen>
  )
}
