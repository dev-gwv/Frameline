import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fmt, type ID, type Photo, type PhotoEvent } from '@frameline/shared'
import { useApi } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { useLocal } from '@/lib/local'
import { useAlbums, usePhotos } from '@/lib/queries'
import { CaptureHost, PermissionError, savePhotos, type CaptureHandle } from '@/lib/save'
import { toast } from '@/lib/toast'
import { actWithUndo, useHiddenIds } from '@/lib/undo'
import { radius, shadow, useTheme } from '@/theme'
import { Icon, type IconName } from '../Icon'
import { Sheet } from '../overlays'
import { PhotoTile } from '../photo'
import { Button, Chip, EmptyState, ErrorState, IconButton, Input, LoadingList, SettingRow, Txt } from '../primitives'

const plural = (n: number) => (n === 1 ? '1 photo' : `${fmt.count(n)} photos`)
/** More than this many selected photos are emailed as a ZIP instead of saved one by one. */
const SAVE_LIMIT = 20

/** Photos tab: album chips over a 3-column grid; long-press to select, then Move, Hide, Download or Trash with Undo. */
export function PhotosTab({ event }: { event: PhotoEvent }) {
  const { c } = useTheme()
  const api = useApi()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [albumId, setAlbumId] = useState<ID>()
  const { data: albums } = useAlbums(event.id)
  const { data, isLoading, error, refetch } = usePhotos(event.id, albumId ? { albumId, sort: 'newest' } : { sort: 'newest' })
  const hidden = useHiddenIds()
  const photos = useMemo(() => (data?.items ?? []).filter((p) => !hidden.has(p.id)), [data, hidden])
  const [sel, setSel] = useState<Set<ID>>(new Set())
  const [moveOpen, setMoveOpen] = useState(false)
  const [newAlbum, setNewAlbum] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [host, setHost] = useState<CaptureHandle | null>(null)
  const email = useLocal((s) => s.studioSession?.email)

  const chips = (albums ?? []).filter((a) => a.kind !== 'store' && (a.kind === 'album' || a.photoCount > 0))
  const albumName = (id: ID) => (albums ?? []).find((a) => a.id === id)?.name ?? 'album'
  const selecting = sel.size > 0
  const chosen = photos.filter((p) => sel.has(p.id))
  const allHidden = chosen.length > 0 && chosen.every((p) => p.hidden)
  const processing = photos.filter((p) => p.status === 'processing').length
  const gap = 3
  const size = Math.floor((width - gap * 2) / 3)

  const toggle = (id: ID) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const clear = () => setSel(new Set())
  const fail = (e: unknown) => { const f = friendlyError(e); toast.error(f.title, f.detail) }

  /** Puts photos back where they were (grouped by the value they had). */
  const restore = async (before: Photo[], key: 'albumId' | 'hidden') => {
    const groups = new Map<string, ID[]>()
    for (const p of before) { const k = String(p[key]); groups.set(k, [...(groups.get(k) ?? []), p.id]) }
    try {
      for (const [k, ids] of groups) await api.updatePhotos(ids, key === 'albumId' ? { albumId: k } : { hidden: k === 'true' })
      toast.success('Undone')
    } catch (e) { fail(e) }
  }

  const move = async (target: ID, name: string) => {
    const before = chosen.map((p) => ({ ...p }))
    setMoveOpen(false); setBusy('move')
    try {
      await api.updatePhotos(before.map((p) => p.id), { albumId: target })
      clear()
      toast.undo(`${plural(before.length)} moved to ${name}`, () => restore(before, 'albumId'))
    } catch (e) { fail(e) } finally { setBusy(null) }
  }
  const moveToNew = async () => {
    const name = newAlbum.trim()
    if (!name) return
    try { const a = await api.createAlbum(event.id, name); setNewAlbum(''); await move(a.id, a.name) } catch (e) { fail(e) }
  }
  const hide = async () => {
    const before = chosen.map((p) => ({ ...p }))
    setBusy('hide')
    try {
      await api.updatePhotos(before.map((p) => p.id), { hidden: !allHidden })
      clear()
      toast.undo(allHidden ? `${plural(before.length)} shown to guests` : `${plural(before.length)} hidden from guests`, () => restore(before, 'hidden'))
    } catch (e) { fail(e) } finally { setBusy(null) }
  }
  const download = async () => {
    const list = chosen
    if (list.length > SAVE_LIMIT) {
      if (!email) { toast.error('Add an email to your account', 'We email large downloads as a ZIP'); return }
      setBusy('download')
      try {
        await api.requestZip(event.id, email, { photoIds: list.map((p) => p.id) })
        clear()
        toast.success(`We’ll email a ZIP of ${plural(list.length)}`, `To ${email}, in a few minutes`)
      } catch (e) { fail(e) } finally { setBusy(null) }
      return
    }
    setBusy('download')
    try {
      const n = await savePhotos(list, host)
      clear()
      toast.success(`Saved ${plural(n)} to your phone`)
    } catch (e) {
      if (e instanceof PermissionError) toast.error('Can’t save yet', e.message)
      else fail(e)
    } finally { setBusy(null) }
  }
  const trash = () => {
    const ids = chosen.map((p) => p.id)
    clear()
    actWithUndo({ ids, title: `${plural(ids.length)} moved to trash`, detail: 'Kept for 30 days', run: () => api.deletePhotos(ids), undo: () => api.restorePhotos(ids) })
  }

  const header = (
    <View style={{ paddingTop: 10, paddingBottom: 8, gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
        <Chip label="All" count={fmt.count(event.photoCount)} selected={!albumId} onPress={() => { setAlbumId(undefined); clear() }} />
        {chips.map((a) => <Chip key={a.id} label={a.kind === 'guest' ? 'Guest uploads' : a.name} count={fmt.count(a.photoCount)} selected={albumId === a.id} onPress={() => { setAlbumId(a.id); clear() }} />)}
      </ScrollView>
      {processing ? <Txt v="small" color={c.accentText} style={{ paddingHorizontal: 12 }}>{plural(processing)} still processing. They appear as they finish.</Txt> : null}
      {!selecting && photos.length ? <Txt v="small" color={c.ink3} style={{ paddingHorizontal: 12 }}>Press and hold a photo to select.</Txt> : null}
    </View>
  )

  if (error && !data) return <ErrorState error={error} onRetry={refetch} />

  const actions: { icon: IconName; label: string; on: () => void; danger?: boolean; key: string }[] = [
    { key: 'move', icon: 'folder', label: 'Move', on: () => setMoveOpen(true) },
    { key: 'hide', icon: allHidden ? 'eye' : 'eye-off', label: allHidden ? 'Show' : 'Hide', on: hide },
    { key: 'download', icon: 'download', label: chosen.length > SAVE_LIMIT ? 'Email ZIP' : 'Download', on: download },
    { key: 'trash', icon: 'trash-2', label: 'Trash', on: trash, danger: true },
  ]

  return (
    <View style={{ flex: 1 }}>
      <CaptureHost ref={setHost} />
      <FlashList
        data={photos}
        numColumns={3}
        extraData={sel}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: selecting ? 150 : 24 }}
        ListEmptyComponent={isLoading ? <LoadingList rows={2} /> : event.photoCount === 0 ? (
          <EmptyState icon="upload-cloud" title="Add your first photos" body="Choose photos from your phone, or connect your camera. Guests see “Photos are on their way” until then."
            action="Upload photos" actionVariant="secondary" onAction={() => router.navigate({ pathname: '/upload', params: { eventId: event.id } })}
            secondary="Connect your camera" onSecondary={() => router.push('/tools/camera-sync')} />
        ) : <EmptyState icon="image" title="No photos in this album yet" body="Move photos here from another album, or upload straight into it." action="Upload photos" actionVariant="secondary" onAction={() => router.navigate({ pathname: '/upload', params: { eventId: event.id, albumId: albumId ?? '' } })} />}
        renderItem={({ item, index }) => (
          <View style={{ paddingBottom: gap, alignItems: index % 3 === 0 ? 'flex-start' : index % 3 === 2 ? 'flex-end' : 'center' }}>
            <PhotoTile photo={item} size={size} selected={sel.has(item.id)} selecting={selecting} label={`Photo ${index + 1}, ${item.filename}${item.hidden ? ', hidden' : ''}`}
              onLongPress={() => toggle(item.id)}
              onPress={() => (selecting ? toggle(item.id) : router.push({ pathname: '/viewer', params: { eventId: event.id, scope: 'studio', albumId: albumId ?? '', start: item.id } }))} />
          </View>
        )}
      />

      {selecting ? (
        <View style={[styles.bar, { backgroundColor: c.surface, borderColor: c.line, bottom: Math.max(insets.bottom, 10) + 6 }, shadow.float]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt weight="heavy" style={{ flex: 1 }}>{sel.size} selected</Txt>
            {sel.size < photos.length ? <Button label={`Select all ${fmt.count(photos.length)}`} variant="ghost" size="sm" onPress={() => setSel(new Set(photos.map((p) => p.id)))} /> : null}
            <IconButton icon="x" label="Clear selection" onPress={clear} />
          </View>
          <View style={{ flexDirection: 'row' }}>
            {actions.map((a) => (
              <Pressable key={a.key} accessibilityRole="button" accessibilityLabel={a.label} disabled={!!busy} onPress={() => a.on()}
                style={({ pressed }) => [styles.action, { opacity: pressed || busy === a.key ? 0.5 : 1 }]}>
                <Icon name={a.icon} size={20} color={a.danger ? c.bad : c.ink} />
                <Txt v="small" weight="bold" color={a.danger ? c.bad : c.ink}>{busy === a.key ? 'Working…' : a.label}</Txt>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Sheet open={moveOpen} onClose={() => setMoveOpen(false)} title={`Move ${plural(sel.size)} to`}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
          {(albums ?? []).filter((a) => a.kind === 'album' && a.id !== albumId).map((a, i) => (
            <SettingRow key={a.id} first={i === 0} icon="folder" title={a.name} detail={plural(a.photoCount)} onPress={() => move(a.id, albumName(a.id))} />
          ))}
          <View style={{ gap: 8, paddingTop: 12 }}>
            <Txt v="label">New album</Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Input value={newAlbum} onChangeText={setNewAlbum} placeholder="Reception" onSubmitEditing={moveToNew} returnKeyType="done" /></View>
              <Button label="Create and move" disabled={!newAlbum.trim()} onPress={moveToNew} />
            </View>
          </View>
        </ScrollView>
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 10, right: 10, borderRadius: radius.card + 4, borderWidth: 1, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 56 },
})
