import { useState } from 'react'
import { Film as FilmIcon, Plus, X } from 'lucide-react'
import type { Film, ID } from '@frameline/shared'
import { Button, Field, Input, Modal, Skeleton, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useFilms } from '../../lib/queries'

const YT = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]{6,}/i

/** ⋯ → Films: YouTube videos shown in the guest gallery next to the albums. A small list, like Add host. */
export function FilmsModal({ eventId, open, onOpenChange }: { eventId: ID; open: boolean; onOpenChange: (v: boolean) => void }) {
  const api = useApi()
  const toast = useToast()
  const films = useFilms(eventId)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!YT.test(url.trim())) return setError('Paste a YouTube link, like https://youtu.be/abc123. Unlisted videos work too.')
    setError('')
    setBusy(true)
    try {
      await api.addFilm(eventId, name.trim() || 'Film', url.trim())
      toast.success('Film added', 'Guests see it next to the albums.')
      setName(''); setUrl('')
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  const remove = async (f: Film) => {
    try {
      await api.deleteFilm(f.id)
      toast.undo(`${f.name} removed`, () => { api.addFilm(eventId, f.name, f.url).catch((e) => toast.error('Couldn’t put it back', errorMessage(e))) })
    } catch (e) { toast.error('Couldn’t remove the film', errorMessage(e)) }
  }
  const valid = YT.test(url.trim())

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Films" description="YouTube videos shown in the gallery, next to the albums." width={520}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button><Button variant="primary" icon={<Plus size={14} />} loading={busy} disabled={!url.trim()} onClick={() => void add()}>Add film</Button></>}>
      {films.isLoading ? <Skeleton className="h-16" /> : !films.data?.length ? (
        <div className="flex items-center gap-3 rounded-[10px] bg-sunk px-3.5 py-3 text-[13px] text-ink-2">
          <FilmIcon size={18} className="shrink-0 text-ink-3" />No films yet. Paste a YouTube link below, like the wedding film or a teaser.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-[10px] border border-line">
          {films.data.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2 pl-3.5 pr-1.5">
              <FilmIcon size={16} className="shrink-0 text-ink-3" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold">{f.name}</div>
                <a href={f.url} target="_blank" rel="noreferrer" className="block truncate text-[12px] text-ink-3 hover:underline">{f.url.replace(/^https?:\/\//, '')}</a>
              </div>
              <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => void remove(f)}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2.5 sm:grid-cols-[1fr_1.5fr]">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Wedding film" /></Field>
        <Field label="YouTube link" error={error || undefined}>
          <Input value={url} onChange={(e) => { setUrl(e.target.value); setError('') }} placeholder="https://youtu.be/…" onKeyDown={(e) => e.key === 'Enter' && valid && void add()} />
        </Field>
      </div>
    </Modal>
  )
}
