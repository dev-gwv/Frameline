import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronDown, CircleSlash, Folder, HardDriveDownload, XCircle } from 'lucide-react'
import { fmt, type Album, type PhotoEvent } from '@frameline/shared'
import { Button, Chip, EmptyState, Field, Input, Meter, Modal, RadioCardGroup, TabBar, Toggle, cn } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { DRIVE_RE, cancelImport, previewFolder, previouslyImported, startImport, useImports, type ImportFolder } from './importStore'
import { photosLabel } from './lib'

type Tab = 'new' | 'running' | 'past'

/**
 * ?modal=import — paste a Drive folder link, check what's inside (each folder becomes an album, renameable),
 * choose Standard or Original, import. Imports keep running after the modal closes (Running / Past tabs).
 * Simulated until the Drive API is wired: the folder contents are derived from the folder ID (importStore).
 */
export function ImportModal({ open, onOpenChange, event, albums }: { open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent; albums: Album[] }) {
  const api = useApi()
  const { active, history } = useImports(event.id)
  const [tab, setTab] = useState<Tab>('new')
  const [link, setLink] = useState('')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [quality, setQuality] = useState<'web' | 'original'>('web')
  const [more, setMore] = useState(false)
  const [merge, setMerge] = useState(true)
  const [watermark, setWatermark] = useState(true)
  const [names, setNames] = useState<Record<string, string>>({})
  const regular = albums.filter((a) => a.kind === 'album')

  const match = link.trim().match(DRIVE_RE)
  const linkError = link.trim() && !match ? 'That isn’t a Google Drive folder link. It looks like drive.google.com/drive/folders/1Qx…' : ''
  useEffect(() => {
    setFolderId(null)
    if (!match) return
    setLoading(true)
    const t = setTimeout(() => { setFolderId(match[1]); setNames({}); setLoading(false) }, 700)
    return () => { clearTimeout(t); setLoading(false) }
  }, [match?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => (folderId ? previewFolder(folderId, event.name, albums, { createAlbums: true, merge }) : null), [folderId, event.name, albums, merge])
  // Apply renames: a name that matches an existing album adds to it.
  const folders: ImportFolder[] = useMemo(() => (preview?.folders ?? []).map((f) => {
    const name = (names[f.path] ?? f.target).trim() || f.target
    const a = regular.find((x) => x.name.toLowerCase() === name.toLowerCase())
    return a ? { ...f, target: a.name, albumId: a.id, action: 'existing' as const } : { ...f, target: name, albumId: undefined, action: f.action === 'merged' ? 'merged' as const : 'new' as const }
  }), [preview, names, regular])
  const total = folders.reduce((s, f) => s + f.count, 0)
  const skip = folderId ? Math.min(total, previouslyImported(event.id, folderId)) : 0
  const toImport = Math.max(0, total - skip)
  const weight = quality === 'original' ? 2 : 1
  const over = event.photoCount + toImport * weight - event.photoLimit

  const begin = () => {
    if (!preview || !folderId || toImport <= 0 || over > 0) return
    startImport(api, { eventId: event.id, folderId, rootName: preview.rootName, folders, skip, quality, watermark })
    setLink(''); setFolderId(null); setNames({})
    setTab('running')
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Import from Google Drive" width={600}
      footer={tab === 'new' ? <>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" disabled={!preview || toImport <= 0 || over > 0} onClick={begin}>{preview ? `Import ${photosLabel(toImport)}` : 'Import photos'}</Button>
      </> : undefined}>
      <TabBar<Tab> value={tab} onChange={setTab} className="-mt-1" tabs={[
        { value: 'new', label: 'New import' },
        { value: 'running', label: 'Running', count: active.length || undefined },
        { value: 'past', label: 'Past' },
      ]} />

      {tab === 'new' && (
        <>
          <Field label="Folder link" error={linkError || undefined} hint={linkError ? undefined : 'Share the folder as “Anyone with the link”.'}>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="drive.google.com/drive/folders/…" icon={<HardDriveDownload size={15} />} aria-label="Google Drive folder link" autoFocus />
          </Field>
          {loading && <div className="rounded-[10px] border border-line px-3.5 py-3 text-[13px] text-ink-2">Looking inside the folder…</div>}
          {preview && !loading && (
            <div className="rounded-[10px] border border-line px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="inline-flex items-center gap-1.5 text-[13.5px]"><Folder size={15} className="text-ink-3" />{preview.rootName}</b>
                <span className="text-[12.5px] text-ink-3 tnum">{folders.length} folders · {photosLabel(total)}</span>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {folders.map((f) => (
                  <li key={f.path} className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-[13px]">
                    <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold"><Folder size={13} className="shrink-0 text-ink-3" /><span className="truncate">{f.path}</span></span>
                    <span className="text-ink-3">→ album</span>
                    <input value={names[f.path] ?? f.target} onChange={(e) => setNames((n) => ({ ...n, [f.path]: e.target.value }))} aria-label={`Album for ${f.path}`}
                      className="h-8 w-[150px] min-w-0 rounded-control border border-line-2 bg-surface px-2 text-[13px] outline-none focus:border-accent" />
                    {f.action === 'existing' && <span className="text-[12px] text-ink-3">adds to it</span>}
                    <span className="ml-auto text-[12.5px] text-ink-3 tnum">{fmt.count(f.count)}</span>
                  </li>
                ))}
              </ul>
              {skip > 0 && <p className="mt-2 text-[12.5px] text-ink-2">{photosLabel(skip)} came in with an earlier import and will be skipped.</p>}
            </div>
          )}
          <RadioCardGroup<'web' | 'original'> label="Quality" columns={2} value={quality} onChange={setQuality} options={[
            { value: 'web', title: 'Standard', description: 'Counts as 1 photo each' },
            { value: 'original', title: 'Original files', description: 'Full quality. Counts as 2 photos each' },
          ]} />
          <div>
            <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)} className="inline-flex min-h-[32px] items-center gap-1 text-[13px] font-bold text-accent-text">
              More options: watermark, subfolders <ChevronDown size={13} className={cn('transition-transform', more && 'rotate-180')} />
            </button>
            {more && (
              <div className="mt-1.5 flex flex-col divide-y divide-line rounded-[10px] border border-line">
                <label className="flex items-center gap-3 px-3 py-2.5"><span className="flex-1 text-[13.5px] font-bold">Add my watermark</span><Toggle label="Add my watermark" checked={watermark} onCheckedChange={setWatermark} /></label>
                <label className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1"><b className="block text-[13.5px]">Put subfolders in their parent’s album</b><span className="text-[12.5px] text-ink-2">Off: each subfolder becomes its own album.</span></span>
                  <Toggle label="Put subfolders in their parent’s album" checked={merge} onCheckedChange={setMerge} />
                </label>
              </div>
            )}
          </div>
          {preview && over > 0 && (
            <p className="rounded-[10px] bg-warn-soft px-3 py-2.5 text-[12.5px] text-warn">
              That’s {photosLabel(over)} more than this event can hold. Choose Standard, or add photos to the event first. <Link to="/plan" className="font-bold underline">See plans</Link>
            </p>
          )}
        </>
      )}

      {tab === 'running' && (!active.length ? (
        <EmptyState icon={<HardDriveDownload size={22} />} title="Nothing importing right now" body="Imports keep going after you close this window." action={<Button onClick={() => setTab('new')}>Start an import</Button>} />
      ) : active.map((j) => (
        <div key={j.id} className="rounded-[10px] border border-line px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-[13.5px]">{j.rootName}</b>
            <Button size="sm" variant="danger" onClick={() => cancelImport(j.id)}>Stop import</Button>
          </div>
          <Meter value={j.done} max={j.total || 1} className="my-2" label={`${j.done} of ${j.total} imported`} />
          <div className="text-[12.5px] text-ink-2 tnum">
            {fmt.count(j.done)} of {fmt.count(j.total)} · {j.quality === 'original' ? 'Original files' : 'Standard'}{j.albumsCreated ? ` · ${j.albumsCreated} new album${j.albumsCreated === 1 ? '' : 's'}` : ''}{j.skipped ? ` · ${fmt.count(j.skipped)} skipped` : ''}
          </div>
        </div>
      )))}

      {tab === 'past' && (!history.length ? (
        <EmptyState icon={<HardDriveDownload size={22} />} title="No finished imports yet" body="Finished, stopped and failed imports show here." />
      ) : (
        <ul className="divide-y divide-line rounded-[10px] border border-line">
          {history.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 text-[13px]">
              {j.status === 'done' ? <CheckCircle2 size={15} className="text-ok" /> : j.status === 'cancelled' ? <CircleSlash size={15} className="text-ink-3" /> : <XCircle size={15} className="text-bad" />}
              <div className="min-w-0 flex-1">
                <b className="block truncate">{j.rootName}</b>
                <span className="text-[12px] text-ink-2">{fmt.dateTime(new Date(j.finishedAt ?? j.startedAt).toISOString())} · {photosLabel(j.done)}{j.error ? ` · ${j.error}` : ''}</span>
              </div>
              <Chip tone={j.status === 'done' ? 'ok' : j.status === 'failed' ? 'bad' : 'neutral'}>{j.status === 'done' ? 'Done' : j.status === 'failed' ? 'Failed' : 'Stopped'}</Chip>
            </li>
          ))}
        </ul>
      ))}
    </Modal>
  )
}
