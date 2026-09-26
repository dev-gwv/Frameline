import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import { Asset, requestPermissionsAsync } from 'expo-media-library'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import type { Photo } from '@frameline/shared'
import { ToneView } from '@/components/photo'

/**
 * Renders a placeholder tone offscreen-ish (behind an opaque bar) so it can be captured to a JPEG with
 * react-native-view-shot. Real photos (with `url`) skip this and use the file directly.
 */
export interface CaptureHandle { capture: (p: Pick<Photo, 'tone' | 'exif'>) => Promise<string> }

export const CaptureHost = forwardRef<CaptureHandle>(function CaptureHost(_, ref) {
  const view = useRef<View>(null)
  const [{ photo, n }, setPhoto] = useState<{ photo: Pick<Photo, 'tone' | 'exif'> | null; n: number }>({ photo: null, n: 0 })
  const pending = useRef<(() => void) | null>(null)

  useImperativeHandle(ref, () => ({
    capture: (p) => new Promise<string>((resolve, reject) => {
      pending.current = () => {
        requestAnimationFrame(() => {
          const portrait = p.exif.height > p.exif.width
          captureRef(view, { format: 'jpg', quality: 0.92, width: portrait ? 1200 : 1800, height: portrait ? 1800 : 1200, result: 'tmpfile' })
            .then(resolve, reject)
        })
      }
      setPhoto((prev) => ({ photo: p, n: prev.n + 1 }))
    }),
  }), [])

  const portrait = photo ? photo.exif.height > photo.exif.width : false
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, bottom: 0, width: portrait ? 80 : 120, height: 120 * (portrait ? 1 : 2 / 3), opacity: 1 }}>
      <View ref={view} collapsable={false} style={{ flex: 1 }} onLayout={() => { const f = pending.current; pending.current = null; f?.() }} key={n}>
        {photo ? <ToneView tone={photo.tone} style={{ flex: 1 }} /> : null}
      </View>
    </View>
  )
})

/** A local file URI for a photo: the real file, a downloaded copy, or a captured placeholder. */
export async function photoFile(p: Photo, host: CaptureHandle | null): Promise<string> {
  if (p.url) {
    if (/^https?:/i.test(p.url)) {
      const file = await File.downloadFileAsync(p.url, new File(Paths.cache, `${p.id}.jpg`), { idempotent: true })
      return file.uri
    }
    return p.url
  }
  if (!host) throw new Error('Downloads are available for real photos')
  return host.capture(p)
}

export class PermissionError extends Error {}

/** Saves photos to the device library. Returns how many were saved. */
export async function savePhotos(photos: Photo[], host: CaptureHandle | null, onProgress?: (done: number) => void): Promise<number> {
  const perm = await requestPermissionsAsync(true, ['photo'])
  if (!perm.granted) throw new PermissionError('Allow Frameline to add photos in Settings, then try again.')
  let done = 0
  for (const p of photos) {
    const uri = await photoFile(p, host)
    await Asset.create(uri)
    done++
    onProgress?.(done)
  }
  return done
}

/** Opens the system share sheet with the photo file. Returns false if file sharing isn't available. */
export async function sharePhoto(p: Photo, host: CaptureHandle | null): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false
  const uri = await photoFile(p, host)
  await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share photo', UTI: 'public.jpeg' })
  return true
}
