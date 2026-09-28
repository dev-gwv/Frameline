import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { DEMO_NOW, fmt, type Guest, type ID, type Photo, type PhotoEvent } from '@frameline/shared'
import { useApi } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { useLocal } from '@/lib/local'
import { useAccessRequests, useAction, useEventStats, useGuests, usePendingGuestPhotos, usePhotos } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { actWithUndo, useHiddenIds } from '@/lib/undo'
import { radius, useTheme } from '@/theme'
import { Sheet } from '../overlays'
import { PhotoTile } from '../photo'
import { Avatar, Button, Card, Chip, EmptyState, IconButton, LoadingList, Txt } from '../primitives'

export type GuestFilter = 'all' | 'picks' | 'requests' | 'uploads'
const ROLE: Record<Guest['role'], string> = { guest: 'Guest', host: 'Host', client: 'Client' }
const plural = (n: number, one = 'photo') => `${fmt.count(n)} ${n === 1 ? one : `${one}s`}`

/** Guests tab: four numbers, then Everyone / Picks / Requests / Uploads, each with one kind of action. */
export function GuestsTab({ event, initial = 'all' }: { event: PhotoEvent; initial?: GuestFilter }) {
  const { c } = useTheme()
  const api = useApi()
  const [f, setF] = useState<GuestFilter>(initial)
  const hidden = useHiddenIds()
  const guests = useGuests(event.id)
  const requestsQ = useAccessRequests(event.id)
  const pendingQ = usePendingGuestPhotos(event.id)
  const requests = (requestsQ.data ?? []).filter((r) => !hidden.has(`access-request:${r.id}`))
  const pending = (pendingQ.data ?? []).filter((p) => !hidden.has(p.id))
  const all = (guests.data ?? []).filter((g) => !hidden.has(g.id))
  const { data: stats } = useEventStats(event.id)
  const pickers = all.filter((g) => g.favourites.length > 0)
  const [picksOf, setPicksOf] = useState<Guest | null>(null)

  const resolve = (r: { id: ID; name: string }, approve: boolean) => actWithUndo({
    ids: [`access-request:${r.id}`],
    title: approve ? `${r.name} can now see the photos` : `Declined ${r.name}`,
    run: () => api.resolveAccessRequest(r.id, approve),
    undo: () => api.reopenAccessRequest(r.id),
  })
  const approve = useAction((ids: ID[]) => api.setPhotoReview(ids, 'approved'), {
    onSuccess: (_, ids) => toast.undo(`${plural(ids.length)} added to the gallery`, () => { api.setPhotoReview(ids, 'pending').catch(() => {}) }),
  })
  // Rejected guest photos are never shown to guests (contract v5); Undo puts them back in review.
  const reject = (ids: ID[]) => actWithUndo({ ids, title: `${plural(ids.length)} rejected`, run: () => api.setPhotoReview(ids, 'rejected'), undo: () => api.setPhotoReview(ids, 'pending') })
  const removeGuest = (g: Guest) => actWithUndo({ ids: [g.id], title: `${g.name} can no longer open the gallery`, run: () => api.removeGuest(g.id), undo: () => api.restoreGuest(g.id) })

  const filters: { value: GuestFilter; label: string; count: number; attention?: boolean }[] = [
    { value: 'all', label: 'Everyone', count: all.length },
    { value: 'picks', label: 'Picks', count: pickers.length },
    { value: 'requests', label: 'Requests', count: requests.length, attention: true },
    { value: 'uploads', label: 'Uploads', count: pending.length, attention: true },
  ]

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[[stats?.visits ?? event.visits.web + event.visits.android + event.visits.ios, 'Visits'], [stats?.guests ?? all.length, 'Signed up'], [stats?.faceSearches ?? event.faceMatches, 'Found themselves'], [stats?.downloads ?? 0, 'Downloads']].map(([n, l]) => (
          <Card key={String(l)} style={{ flex: 1, padding: 10, gap: 0 }}>
            <Txt weight="heavy" style={{ fontSize: 17, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{fmt.count(Number(n))}</Txt>
            <Txt v="small" numberOfLines={2} style={{ fontSize: 11.5, lineHeight: 15 }}>{l}</Txt>
          </Card>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginHorizontal: -16 }}>
        <View style={{ width: 10 }} />
        {filters.map((x) => <Chip key={x.value} label={x.label} count={x.count} attention={x.attention} selected={f === x.value} onPress={() => setF(x.value)} />)}
        <View style={{ width: 10 }} />
      </ScrollView>

      {f === 'all' || f === 'picks' ? (
        guests.isLoading ? <LoadingList rows={3} /> : (f === 'all' ? all : pickers).length ? (
          <Card padded={false} style={{ paddingHorizontal: 14 }}>
            {(f === 'all' ? all : pickers).map((g, i) => (
              <View key={g.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
                <Avatar name={g.name} size={38} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Txt weight="bold">{g.name} <Txt v="small" weight="bold" color={g.role === 'guest' ? c.ink3 : c.accentText}>{ROLE[g.role]}</Txt></Txt>
                  <Txt v="small" numberOfLines={1}>{g.favourites.length ? `Picked ${plural(g.favourites.length)}` : `Signed up ${fmt.dayMonth(g.registeredAt)}`} · {fmt.ago(g.lastActive, DEMO_NOW)}</Txt>
                </View>
                {g.favourites.length ? <Button label="View picks" size="sm" onPress={() => setPicksOf(g)} /> : null}
                {f === 'all' && g.role === 'guest' ? <Button label="Remove" size="sm" variant="ghost" onPress={() => removeGuest(g)} /> : null}
              </View>
            ))}
          </Card>
        ) : (
          <EmptyState icon={f === 'all' ? 'users' : 'heart'} title={f === 'all' ? 'No one has signed up yet' : 'No picks yet'}
            body={f === 'all' ? 'Guests appear here when they open the gallery and give their name.' : 'When guests heart photos, their picks show here. Clients use it to choose album photos.'} />
        )
      ) : null}

      {f === 'requests' ? (
        requestsQ.isLoading ? <LoadingList rows={2} /> : requests.length ? (
          <Card padded={false} style={{ paddingHorizontal: 14 }}>
            {requests.map((r, i) => (
              <View key={r.id} style={[styles.row, { flexWrap: 'wrap' }, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
                <Avatar name={r.name} size={38} />
                <View style={{ flex: 1, gap: 1, minWidth: 180 }}>
                  <Txt weight="bold">{r.name}</Txt>
                  <Txt v="small">{r.note ? `“${r.note}”` : 'No message'} · {r.email}</Txt>
                  <Txt v="small" color={c.ink3}>{fmt.ago(r.createdAt, DEMO_NOW)}</Txt>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
                  <Button label="Decline" size="sm" variant="ghost" onPress={() => resolve(r, false)} />
                  <Button label="Approve" size="sm" onPress={() => resolve(r, true)} />
                </View>
              </View>
            ))}
          </Card>
        ) : <EmptyState icon="user-check" title="No requests waiting" body="When someone without the PIN asks to see the photos, you approve or decline them here." />
      ) : null}

      {f === 'uploads' ? (
        pendingQ.isLoading ? <LoadingList rows={2} /> : !event.settings.guestUploads && !pending.length ? (
          <EmptyState icon="upload" title="Guest uploads are off" body="Turn them on in Settings to let guests add their own photos." />
        ) : pending.length ? (
          <UploadsReview photos={pending} reviewOn={event.settings.reviewGuestUploads} onApprove={(ids) => approve.mutate(ids)} onReject={reject} />
        ) : <EmptyState icon="check-circle" title="Nothing to review" body={event.settings.reviewGuestUploads ? 'Guest photos wait here until you approve them.' : 'Review is off: guest photos go straight into the Guest uploads album.'} />
      ) : null}

      <PicksSheet event={event} guest={picksOf} onClose={() => setPicksOf(null)} />
    </ScrollView>
  )
}

function UploadsReview({ photos, reviewOn, onApprove, onReject }: { photos: Photo[]; reviewOn: boolean; onApprove: (ids: ID[]) => void; onReject: (ids: ID[]) => void }) {
  const { c } = useTheme()
  const { width } = useWindowDimensions()
  const size = Math.floor((width - 32 - 28 - 16) / 3)
  const people = new Set(photos.map((p) => p.uploadedBy)).size
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Txt weight="heavy">{plural(photos.length)} from {people === 1 ? '1 guest' : `${people} guests`}</Txt>
        <Txt v="small">{reviewOn ? 'Shown to everyone once you approve.' : 'Already in the gallery. Remove any you don’t want.'}</Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Reject all" size="sm" variant="ghost" style={{ flex: 1 }} onPress={() => onReject(photos.map((p) => p.id))} />
        {reviewOn ? <Button label={`Approve all ${photos.length}`} size="sm" style={{ flex: 1.4 }} onPress={() => onApprove(photos.map((p) => p.id))} /> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((p) => (
          <View key={p.id} style={{ width: size, gap: 2 }}>
            <PhotoTile photo={p} size={size} radius={6} label={`Photo from ${p.uploadedBy}`} />
            <Txt v="small" numberOfLines={1} style={{ fontSize: 11.5 }}>{p.uploadedBy}</Txt>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <IconButton icon="x" label={`Reject photo from ${p.uploadedBy}`} color={c.bad} size={36} onPress={() => onReject([p.id])} />
              {reviewOn ? <IconButton icon="check" label={`Approve photo from ${p.uploadedBy}`} color={c.ok} size={36} onPress={() => onApprove([p.id])} /> : null}
            </View>
          </View>
        ))}
      </View>
    </Card>
  )
}

/** A guest's picks: see them, email a ZIP, copy file names, or make an album from them. */
function PicksSheet({ event, guest, onClose }: { event: PhotoEvent; guest: Guest | null; onClose: () => void }) {
  const api = useApi()
  const { width } = useWindowDimensions()
  const { data } = usePhotos(guest ? event.id : undefined)
  const email = useLocal((s) => s.studioSession?.email)
  const [busy, setBusy] = useState<'album' | 'zip' | null>(null)
  const picks = useMemo(() => { const ids = new Set(guest?.favourites ?? []); return (data?.items ?? []).filter((p) => ids.has(p.id)) }, [data, guest])
  const size = Math.floor((width - 32 - 12) / 4)
  if (!guest) return null
  const fail = (e: unknown) => { const f = friendlyError(e); toast.error(f.title, f.detail) }

  const makeAlbum = async () => {
    setBusy('album')
    try {
      const album = await api.createAlbum(event.id, `${guest.name.split(' ')[0]}’s picks`)
      await api.copyPhotosToAlbum(picks.map((p) => p.id), album.id)
      toast.success(`Album “${album.name}” made with ${plural(picks.length)}`)
      onClose()
    } catch (e) { fail(e) } finally { setBusy(null) }
  }
  const zip = async () => {
    if (!email) return
    setBusy('zip')
    try { await api.requestZip(event.id, email, { photoIds: picks.map((p) => p.id) }); toast.success('ZIP on its way', `We’ll email ${email} in a few minutes`) } catch (e) { fail(e) } finally { setBusy(null) }
  }

  return (
    <Sheet open={!!guest} onClose={onClose} title={`${guest.name}’s picks`}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8 }}>
        <Txt v="small">{plural(guest.favourites.length)} · {ROLE[guest.role]} · last picked {fmt.ago(guest.lastActive, DEMO_NOW)}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {picks.slice(0, 24).map((p) => <PhotoTile key={p.id} photo={p} size={size} radius={radius.control - 2} label={p.filename} />)}
        </View>
        {picks.length > 24 ? <Txt v="small">Showing 24 of {picks.length}</Txt> : null}
        <Button label="Make an album from these" variant="primary" size="lg" loading={busy === 'album'} disabled={!picks.length} onPress={makeAlbum} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Email a ZIP" icon="download" style={{ flex: 1 }} loading={busy === 'zip'} disabled={!email || !picks.length} onPress={zip} />
          <Button label="Copy file names" icon="copy" style={{ flex: 1 }} disabled={!picks.length} onPress={async () => { await Clipboard.setStringAsync(picks.map((p) => p.filename).join('\n')); toast.success('File names copied', 'Paste them into Lightroom to find the picks') }} />
        </View>
      </ScrollView>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, minHeight: 60 },
})
