import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CircleSlash, Folder, FolderTree, HardDriveDownload, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { fmt, type Album, type ID, type PhotoEvent } from '@frameline/shared'
import { Button, Chip, EmptyState, Field, Input, Meter, Modal, Segmented, Select, TabBar, Toggle, cn } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { DRIVE_RE, cancelImport, clearHistory, previewFolder, previouslyImported, startImport, useImports } from './importStore'

type Tab = 'import' | 'active' | 'history'

export function ImportModal({ open, onOpenChange, event, albums, albumId }: { open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent; albums: Album[]; albumId?: ID }) {
  const api = useApi()
  const { active, history } = useImports(event.id)
  const [tab, setTab] = useState<Tab>('import')
  const [link, setLink] = useState('')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [linkError, setLinkError] = useState('')
  const [loading, setLoading] = useState(false)
  const [createAlbums, setCreateAlbums] = useState(true)
  const [merge, setMerge] = useState(true)
  const [watermark, setWatermark] = useState(true)
  const [quality, setQuality] = useState<'web' | 'original'>('web')
  const regular = albums.filter((a) => a.kind === 'album').sort((a, b) => a.order - b.order)
  const [fallbackId, setFallbackId] = useState<ID>(albumId && regular.some((a) => a.id === albumId) ? albumId : regular[0]?.id ?? '')
  useEffect(() => { if (!fallbackId && regular[0]) setFallbackId(regular[0].id) }, [regular, fallbackId])
  const fallback = regular.find((a) => a.id === fallbackId)

  const preview = useMemo(
    () => (folderId ? previewFolder(folderId, event.name, albums, { createAlbums, merge, fallback }) : null),
    [folderId, event.name, albums, createAlbums, merge, fallback],
  )
  const skip = folderId ? Math.min(preview?.total ?? 0, previouslyImported(event.id, folderId)) : 0
  const toImport = Math.max(0, (preview?.total ?? 0) - skip)
  const weight = quality === 'original' ? 2 : 1
  const over = event.photoCount + toImport * weight > event.photoLimit

  const runPreview = () => {
    const m = link.trim().match(DRIVE_RE)
    if (!m) {
      setFolderId(null)
      setLinkError('That isn’t a Google Drive folder link. It should look like drive.google.com/drive/folders/1Qx…Ra')
      return
    }
    setLinkError('')
    setLoading(true)
    setTimeout(() => { setFolderId(m[1]); setLoading(false) }, 700)
  }

  const begin = () => {
    if (!preview || !folderId || toImport <= 0) return
    if (!createAlbums && !fallback) return
    startImport(api, { eventId: event.id, folderId, rootName: preview.rootName, folders: preview.folders, skip, quality, watermark })
    setLink(''); setFolderId(null)
    setTab('active')
  }

  const newCount = preview?.folders.filter((f) => f.action === 'new').length ?? 0

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Import from Google Drive" description="Paste a folder shared as “Anyone with the link”." width={880}>
      <div className="px-5 pt-3 sm:px-6">
        <TabBar<Tab> value={tab} onChange={setTab} tabs={[
          { value: 'import', label: 'Import' },
          { value: 'active', label: active.length ? `Active · ${active.length}` : 'Active' },
          { value: 'history', label: 'History', count: history.length || undefined },
        ]} />
      </div>

      {tab === 'import' && (
        <div className="grid gap-5 px-5 py-4 sm:px-6 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <Field error={linkError} hint="Right-click the folder in Drive → Share → General access: Anyone with the link.">
              <div className="flex gap-2">
                <Input className="min-w-0 flex-1 font-mono text-[12px]" icon={<HardDriveDownload size={14} />} value={link} aria-label="Google Drive folder link"
                  onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runPreview()} placeholder="drive.google.com/drive/folders/…" />
                <Button onClick={runPreview} loading={loading}>Preview</Button>
              </div>
            </Field>
            {preview ? (
              <div className="rounded-card border border-line p-3.5">
                <div className="eyebrow mb-1.5">{preview.rootName} · {fmt.count(preview.total)} photos</div>
                {preview.folders.map((f) => (
                  <div key={f.path} className="flex items-center gap-2.5 border-t border-line py-1.5 text-[13px]">
                    <Folder size={14} className="shrink-0 text-ink-3" />
                    <span className="min-w-0 truncate font-semibold">{f.path}</span>
                    <span className="font-mono text-[11.5px] text-ink-3">{f.count}</span>
                    <Chip tone={f.action === 'new' ? 'accent' : 'neutral'} className="ml-auto">
                      {f.action === 'new' ? 'New album' : f.action === 'merged' ? `Merged into ${f.target}` : createAlbums ? 'Adds to existing' : `Adds to ${f.target}`}
                    </Chip>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState className="rounded-card border border-dashed border-line-2 py-8" icon={<FolderTree size={22} />} title="Preview the folder first"
                body="You’ll see which albums get created, merged or added to before anything is imported." />
            )}
            {preview && (
              <div className="text-[12px] text-ink-2">
                {skip > 0 ? <><b className="text-ink">{fmt.count(skip)} photos</b> were imported before and will be skipped.</> : 'None of these photos were imported before.'}
                {newCount > 0 && ` ${newCount} new album${newCount === 1 ? '' : 's'} will be created.`}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2.5">
            <ToggleRow label="Create albums from subfolders" checked={createAlbums} onChange={setCreateAlbums} />
            {!createAlbums && (
              <Field label="Put every photo into" htmlFor="import-album">
                <Select id="import-album" value={fallbackId} onChange={(e) => setFallbackId(e.target.value)}>
                  {regular.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
            )}
            <ToggleRow label="Merge nested subfolders into the parent album" checked={merge} onChange={setMerge} disabled={!createAlbums} />
            <ToggleRow label="Apply watermark" checked={watermark} onChange={setWatermark} />
            <div>
              <div className="mb-1.5 text-[12px] font-bold text-ink-2">Quality</div>
              <Segmented value={quality} onChange={setQuality} options={[{ value: 'web', label: 'Web-ready 2K' }, { value: 'original', label: 'Originals (2×)' }]} />
            </div>
            <div className="rounded-card bg-sunk p-3 text-[12px] text-ink-2">
              If Google limits the folder, we pause and retry automatically after 24 hours. Photos already imported are kept.{' '}
              <Link to="/support?topic=google-drive-import" className="font-bold text-accent-text underline">Import FAQ</Link>
            </div>
            {over && preview && <div className="rounded-card bg-bad-soft p-3 text-[12px] text-bad">This import goes over the event’s {fmt.count(event.photoLimit)}-photo limit. Increase the limit in Plan & usage, or import web-ready.</div>}
            <Button variant="primary" size="lg" className="mt-auto justify-center" disabled={!preview || toImport <= 0 || over || (!createAlbums && !fallback)} onClick={begin}>
              {preview ? `Import ${fmt.count(toImport)} photos` : 'Import photos'}
            </Button>
          </div>
        </div>
      )}

      {tab === 'active' && (
        <div className="flex flex-col gap-3 px-5 py-4 sm:px-6">
          {!active.length ? (
            <EmptyState icon={<HardDriveDownload size={22} />} title="Nothing importing right now" body="Imports keep running if you close this window."
              action={<Button onClick={() => setTab('import')}>Start an import</Button>} />
          ) : active.map((j) => (
            <div key={j.id} className="rounded-card border border-line p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="inline-flex items-center gap-2 text-[13px]"><Loader2 size={14} className="animate-spin text-accent-text" />{j.rootName}</b>
                <Button size="sm" variant="danger" onClick={() => cancelImport(j.id)}>Stop import</Button>
              </div>
              <Meter value={j.done} max={j.total || 1} className="my-2" />
              <div className="flex flex-wrap justify-between gap-2 text-[12px] text-ink-2">
                <span className="font-mono">{fmt.count(j.done)} / {fmt.count(j.total)}</span>
                <span>{j.quality === 'original' ? 'Originals' : 'Web-ready 2K'}{j.watermark ? ' · watermarked' : ''}{j.albumsCreated ? ` · ${j.albumsCreated} album${j.albumsCreated === 1 ? '' : 's'} created` : ''}{j.skipped ? ` · ${fmt.count(j.skipped)} skipped` : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div className="flex flex-col gap-2 px-5 py-4 sm:px-6">
          {!history.length ? (
            <EmptyState icon={<RotateCcw size={22} />} title="No finished imports yet" body="Finished, stopped and failed imports are listed here." />
          ) : (
            <>
              <ul className="divide-y divide-line rounded-card border border-line">
                {history.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 text-[13px]">
                    {j.status === 'done' ? <CheckCircle2 size={15} className="text-ok" /> : j.status === 'cancelled' ? <CircleSlash size={15} className="text-ink-3" /> : <XCircle size={15} className="text-bad" />}
                    <div className="min-w-0 flex-1">
                      <b className="block truncate">{j.rootName}</b>
                      <span className="text-[12px] text-ink-2">{fmt.dateTime(new Date(j.finishedAt ?? j.startedAt).toISOString())} · {j.quality === 'original' ? 'Originals' : 'Web-ready'}{j.error ? ` · ${j.error}` : ''}</span>
                    </div>
                    <span className="font-mono text-[12px] tnum">{fmt.count(j.done)} imported{j.skipped ? ` · ${fmt.count(j.skipped)} skipped` : ''}</span>
                    <Chip tone={j.status === 'done' ? 'ok' : j.status === 'failed' ? 'bad' : 'neutral'}>{j.status === 'done' ? 'Done' : j.status === 'failed' ? 'Failed' : 'Stopped'}</Chip>
                  </li>
                ))}
              </ul>
              <Button variant="ghost" size="sm" className="self-end" onClick={() => clearHistory(event.id)}>Clear history</Button>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

function ToggleRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn('flex items-center justify-between gap-3 py-1 text-[13px] font-semibold', disabled && 'opacity-50')}>
      {label}
      <Toggle label={label} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  )
}
