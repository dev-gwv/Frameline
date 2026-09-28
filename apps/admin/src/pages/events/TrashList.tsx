import { useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { fmt, type PhotoEvent } from '@frameline/shared'
import { Button, Card, ConfirmDialog, CoverMosaic, EmptyState, Skeleton, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useAction, useDeletedEvents } from '../../lib/queries'
import { QueryError } from '../system'
import { PURGE_DAYS, trashAge } from './lib'

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

/** Recently deleted: restore, or delete forever (the one red confirm). */
export function TrashList({ query, rows }: { query: ReturnType<typeof useDeletedEvents>; rows: PhotoEvent[] }) {
  const api = useApi()
  const toast = useToast()
  const [purging, setPurging] = useState<PhotoEvent | null>(null)
  const restore = useAction((e: PhotoEvent) => api.restoreEvent(e.id), { success: (_, e) => `${e.name} restored` })

  if (query.error) return <QueryError error={query.error} retry={() => query.refetch()} what="Recently deleted" />
  if (query.isLoading) return <div className="flex flex-col gap-2.5" aria-busy="true">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[84px] rounded-card" />)}</div>
  if (!rows.length) {
    return <EmptyState icon={<Trash2 size={24} />} title="Nothing here"
      body={`Events you move to trash wait here for ${PURGE_DAYS} days so you can bring them back.`} />
  }

  /** ConfirmDialog keeps itself open (spinner, then the error) when this throws. */
  const purge = async (e: PhotoEvent) => {
    try {
      await api.deleteEvent(e.id, { permanent: true })
      toast.success(`${e.name} deleted for good`)
    } catch (err) {
      toast.error(`Couldn’t delete ${e.name}`, errorMessage(err))
      throw err
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[13px] text-ink-2">Events here are deleted for good {PURGE_DAYS} days after you trash them. Guests can’t open them meanwhile.</p>
      {rows.map((e) => {
        const { since, left } = trashAge(e)
        return (
          <Card key={e.id} padded={false} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <CoverMosaic tones={e.coverTones} className="h-[60px] w-[90px] shrink-0 overflow-hidden rounded-lg" empty={e.photoCount === 0 ? ' ' : undefined} />
            <div className="min-w-[10rem] flex-1">
              <b className="block truncate text-[14px]">{e.name}</b>
              <span className="text-[12.5px] text-ink-2">
                Deleted {since === 0 ? 'today' : `${days(since)} ago`} · gone for good in {days(left)}
              </span>
              <span className="block text-[12px] text-ink-3 tnum">{fmt.count(e.photoCount)} photos</span>
            </div>
            <div className="flex gap-2 max-sm:w-full max-sm:[&>button]:h-11 max-sm:[&>button]:flex-1">
              <Button variant="ghost" className="text-bad hover:text-bad" onClick={() => setPurging(e)}>Delete forever</Button>
              <Button icon={<RotateCcw size={14} />} loading={restore.isPending && restore.variables?.id === e.id} onClick={() => restore.mutate(e)}>Restore</Button>
            </div>
          </Card>
        )
      })}
      <ConfirmDialog open={!!purging} onOpenChange={(v) => !v && setPurging(null)} danger
        title={`Delete ${purging?.name ?? 'this event'} forever?`} confirmLabel="Delete forever"
        body={<>Its {purging?.photoCount ? `${fmt.count(purging.photoCount)} photos` : 'photos'}, albums and guest favourites are removed now, and the gallery link stops working for good. This can’t be undone.</>}
        onConfirm={() => purging && purge(purging)} />
    </div>
  )
}
