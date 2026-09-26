import { useState } from 'react'
import { Film as FilmIcon, Pencil, Plus, Trash2, Youtube } from 'lucide-react'
import type { Film, ID } from '@frameline/shared'
import { Button, EmptyState, Field, Input, Modal, Skeleton, Tip } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useFilms } from '../../lib/queries'

const YT = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{6,}/i

/** Films are YouTube links shown in the guest gallery next to the albums. */
export function FilmsModal({ eventId, open, onOpenChange }: { eventId: ID; open: boolean; onOpenChange: (v: boolean) => void }) {
  const api = useApi()
  const films = useFilms(eventId)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [editing, setEditing] = useState<Film | null>(null)
  const [error, setError] = useState('')

  const save = useAction(async () => {
    if (editing) { await api.deleteFilm(editing.id) }
    return api.addFilm(eventId, name.trim(), url.trim())
  }, { success: () => (editing ? 'Film updated' : 'Film added'), onSuccess: () => { setName(''); setUrl(''); setEditing(null) } })
  const remove = useAction((id: ID) => api.deleteFilm(id), { success: 'Film removed' })

  const submit = () => {
    if (!name.trim()) return setError('Give the film a name guests will see, like “Wedding film”.')
    if (!YT.test(url.trim())) return setError('Paste a YouTube link, like https://youtu.be/abc123.')
    setError('')
    save.mutate(undefined)
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Films" description="YouTube videos shown in the guest gallery, next to the albums." width={560}>
      <div className="flex flex-col gap-4 px-5 py-4 sm:px-6">
        {films.isLoading ? <Skeleton className="h-24" /> : !films.data?.length ? (
          <EmptyState className="py-6" icon={<FilmIcon size={22} />} title="No films yet" body="Add a YouTube link below. Unlisted videos work too." />
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
            {films.data.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-control bg-bad-soft text-bad"><Youtube size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold">{f.name}</div>
                  <a href={f.url} target="_blank" rel="noreferrer" className="block truncate font-mono text-[11px] text-ink-3 hover:underline">{f.url}</a>
                </div>
                <Tip label="Edit"><button type="button" aria-label={`Edit ${f.name}`} className="rounded p-1.5 text-ink-2 hover:bg-sunk" onClick={() => { setEditing(f); setName(f.name); setUrl(f.url) }}><Pencil size={14} /></button></Tip>
                <Tip label="Remove"><button type="button" aria-label={`Remove ${f.name}`} className="rounded p-1.5 text-bad hover:bg-bad-soft" onClick={() => remove.mutate(f.id)}><Trash2 size={14} /></button></Tip>
              </li>
            ))}
          </ul>
        )}
        <div className="rounded-card border border-line bg-sunk p-3.5">
          <div className="mb-2 text-[13px] font-bold">{editing ? `Edit “${editing.name}”` : 'Add a film'}</div>
          <div className="grid gap-2.5 sm:grid-cols-[1fr_1.4fr]">
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Wedding film" /></Field>
            <Field label="YouTube link"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" onKeyDown={(e) => e.key === 'Enter' && submit()} /></Field>
          </div>
          {error && <div className="mt-2 text-[12px] font-semibold text-bad">{error}</div>}
          <div className="mt-3 flex justify-end gap-2">
            {editing && <Button variant="ghost" onClick={() => { setEditing(null); setName(''); setUrl('') }}>Cancel edit</Button>}
            <Button variant="primary" icon={editing ? undefined : <Plus size={14} />} loading={save.isPending} onClick={submit}>{editing ? 'Save film' : 'Add film'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
