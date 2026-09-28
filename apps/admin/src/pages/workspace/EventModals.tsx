import { ScanFace } from 'lucide-react'
import { fmt, type PhotoEvent } from '@frameline/shared'
import { Button, Meter, Modal } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useAlbums, useEventStats, usePeople } from '../../lib/queries'
import { useModalParam } from '../../lib/url'
import { FilmsModal } from './FilmsModal'
import { ImportModal } from './ImportModal'
import { ShareModal, parseShareTab } from './share/ShareModal'
import { UploadModal } from './UploadModal'

/**
 * Event-level modals, mounted once by EventLayout so they open from every event tab and from deep links:
 * `?modal=share[&tab=link|qr|message|special]`, `?modal=upload[&album=<id>]`, `?modal=import`, `?modal=films`, `?modal=faces`.
 */
export function EventModals({ event }: { event: PhotoEvent }) {
  const m = useModalParam()
  const albums = useAlbums(event.id).data ?? []
  const is = (name: string) => m.modal === name
  const albumId = m.params.get('album') ?? undefined

  return (
    <>
      <ShareModal open={is('share')} onOpenChange={(v) => !v && m.close()} event={event} albums={albums}
        tab={parseShareTab(m.params.get('tab'))} onTab={(t) => m.set({ tab: t }, true)} />
      <UploadModal open={is('upload')} onOpenChange={(v) => !v && m.close()} event={event} albums={albums} albumId={albumId} />
      <ImportModal open={is('import')} onOpenChange={(v) => !v && m.close()} event={event} albums={albums} />
      <FilmsModal eventId={event.id} open={is('films')} onOpenChange={(v) => !v && m.close()} />
      <FacesModal event={event} open={is('faces')} onOpenChange={(v) => !v && m.close()} />
    </>
  )
}

/** ⋯ → Face finding: what face search is doing for this event, and a way to run it again. */
function FacesModal({ event, open, onOpenChange }: { event: PhotoEvent; open: boolean; onOpenChange: (v: boolean) => void }) {
  const api = useApi()
  const people = usePeople(open ? event.id : undefined).data
  const faces = useEventStats(open ? event.id : undefined).data?.faces
  const reindex = useAction(() => api.reindexFaces(event.id), { success: (r) => `Finding faces again in ${fmt.count(r.queued)} photos` })
  const on = event.settings.faceSearch
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Face finding" width={480}
      description={on ? 'Guests take a selfie and see only their photos.' : 'Face search is off for this event.'}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        {on && <Button variant="primary" loading={reindex.isPending} onClick={() => reindex.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>Find faces again</Button>}
      </>}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent-text"><ScanFace size={20} /></span>
        <div className="text-[14px]">
          {on ? (
            <>
              <b className="block">{!faces ? 'Checking progress…' : faces.pending > 0 ? `Finding faces in ${fmt.count(faces.pending)} new ${faces.pending === 1 ? 'photo' : 'photos'}` : `Done for all ${fmt.count(faces.total)} photos`}</b>
              {faces && faces.pending > 0 && <Meter value={faces.ready} max={faces.total || 1} className="my-1.5 max-w-[260px]" label={`${fmt.count(faces.ready)} of ${fmt.count(faces.total)} photos ready`} />}
              <span className="text-ink-2">{people ? `${fmt.count(people.length)} people found` : 'Counting people…'} · {fmt.count(event.faceMatches)} selfie matches so far</span>
            </>
          ) : (
            <span className="text-ink-2">Turn it on in the Settings tab under Privacy if guests should find their photos with a selfie.</span>
          )}
        </div>
      </div>
      {on && <p className="text-[12.5px] text-ink-3">Run it again after you add or move lots of photos, or if someone says their photos are missing.</p>}
    </Modal>
  )
}
