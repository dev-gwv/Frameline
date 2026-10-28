import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronDown, CircleSlash, Folder, HardDriveDownload, Image as ImageIcon, XCircle } from 'lucide-react'
import { SAMPLE_DRIVE, fmt, type Album, type DriveExpandResult, type DriveImportInput, type PhotoEvent } from '@frameline/shared'
import { Button, Chip, EmptyState, Meter, Modal, RadioCardGroup, TabBar, Toggle, cn, useToast } from '@frameline/ui'
import { errorMessage, useApi } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAction, useDrive, useDriveImports } from '../../lib/queries'
import { pickFromDrive } from './drivePicker'
import { photosLabel } from './lib'

type Tab = 'new' | 'running' | 'past'
/** Files picked one by one (not inside a picked folder) go to one album. */
const LOOSE = ''

/**
 * ?modal=import — pick folders or photos in Google's own picker, check what's inside (each folder becomes an album,
 * renameable), choose Standard or Original, import. The server copies the files; imports keep going after the
 * modal closes (Running / Past tabs). Sample data shows a stand-in picker (SAMPLE_DRIVE).
 */
export function ImportModal({ open, onOpenChange, event, albums }: { open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent; albums: Album[] }) {
  const api = useApi()
  const toast = useToast()
  const { user } = useAuth()
  const drive = useDrive(open)
  const imports = useDriveImports(event.id, open)
  const [tab, setTab] = useState<Tab>('new')
  const [picked, setPicked] = useState<DriveExpandResult | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [sample, setSample] = useState<string[] | null>(null)
  const [quality, setQuality] = useState<'web' | 'original'>('web')
  const [more, setMore] = useState(false)
  const [merge, setMerge] = useState(false)
  const [watermark, setWatermark] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const regular = albums.filter((a) => a.kind === 'album')
  const running = (imports.data ?? []).filter((i) => i.status === 'running')
  const past = (imports.data ?? []).filter((i) => i.status !== 'running')

  const expand = async (ids: string[]) => {
    if (!ids.length) return
    setPicked(await api.expandDriveItems(ids))
    setNames({})
  }
  const choose = async () => {
    setChoosing(true)
    try {
      const cfg = await api.getDrivePicker()
      if (cfg.accessToken === 'sample') { setSample([]); return }
      await expand(await pickFromDrive(cfg))
    } catch (e) {
      toast.error('Couldn’t open Google Drive', errorMessage(e))
    } finally {
      setChoosing(false)
    }
  }

  // Folders → albums: "Haldi/Candids" becomes "Haldi – Candids" (two Candids folders stay apart), or "Haldi" merged.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; target: string; count: number }>()
    for (const it of picked?.items ?? []) {
      if (!it.importable) continue
      const path = it.folderPath ?? LOOSE
      const key = path === LOOSE ? LOOSE : merge ? path.split('/')[0] : path
      const g = map.get(key) ?? { key, label: key === LOOSE ? 'Photos you picked' : key, target: key === LOOSE ? 'From Google Drive' : key.split('/').join(' – ').slice(0, 120), count: 0 }
      g.count++
      map.set(key, g)
    }
    return [...map.values()].map((g) => {
      const name = (names[g.key] ?? g.target).trim() || g.target
      const existing = regular.find((a) => a.name.toLowerCase() === name.toLowerCase())
      return { ...g, target: existing?.name ?? name, albumId: existing?.id }
    })
  }, [picked, merge, names, regular])
  const skipped = (picked?.items ?? []).filter((i) => !i.importable)
  const reasons = [...skipped.reduce((m, i) => m.set(i.reason ?? 'Not a photo', (m.get(i.reason ?? 'Not a photo') ?? 0) + 1), new Map<string, number>())]
  const toImport = groups.reduce((n, g) => n + g.count, 0)
  const over = event.photoCount + toImport - event.photoLimit

  const begin = useAction(async () => {
    const byKey = new Map(groups.map((g) => [g.key, g]))
    const items: DriveImportInput['items'] = (picked?.items ?? []).filter((i) => i.importable).map((i) => {
      const path = i.folderPath ?? LOOSE
      const g = byKey.get(path === LOOSE ? LOOSE : merge ? path.split('/')[0] : path)!
      return { fileId: i.id, name: i.name, size: i.size, mimeType: i.mimeType, ...(g.albumId ? { albumId: g.albumId } : { albumName: g.target }) }
    })
    const first = groups[0]?.label ?? 'Google Drive'
    return api.startDriveImport(event.id, { name: groups.length > 1 ? `${first} and ${groups.length - 1} more` : first, quality, watermark, items })
  }, {
    error: 'Couldn’t start the import',
    onSuccess: () => { setPicked(null); setNames({}); setTab('running') },
  })
  const stop = useAction((id: string) => api.cancelDriveImport(id), { success: 'Import stopped', error: 'Couldn’t stop the import' })

  const d = drive.data
  const notReady = d && (!d.connected || d.status === 'revoked')
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Import from Google Drive" width={620}
      footer={tab === 'new' && picked ? <>
        <Button variant="ghost" onClick={() => setPicked(null)}>Back</Button>
        <Button variant="primary" loading={begin.isPending} disabled={toImport <= 0 || over > 0} onClick={() => begin.mutate(undefined)}>Import {photosLabel(toImport)}</Button>
      </> : undefined}>
      <TabBar<Tab> value={tab} onChange={setTab} className="-mt-1" tabs={[
        { value: 'new', label: 'New import' },
        { value: 'running', label: 'Running', count: running.length || undefined },
        { value: 'past', label: 'Past' },
      ]} />

      {tab === 'new' && notReady && (
        <EmptyState icon={<HardDriveDownload size={22} />}
          title={d.status === 'revoked' ? 'Reconnect Google Drive' : 'Connect Google Drive first'}
          body={user?.role === 'owner' || !user ? 'It takes a minute, in Settings → Google Drive. Frameline only sees the files you pick.' : 'Ask the studio owner to connect it in Settings → Google Drive.'}
          action={user?.role === 'owner' || !user ? <Link to="/settings/drive"><Button variant="primary">Open Settings → Google Drive</Button></Link> : undefined} />
      )}

      {tab === 'new' && !notReady && !picked && sample === null && (
        <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-line-2 px-4 py-8 text-center">
          <HardDriveDownload size={26} className="text-ink-3" />
          <div>
            <b className="block text-[14px]">Pick folders or photos in your Drive</b>
            <span className="text-[12.5px] text-ink-2">Each folder becomes an album. You can rename them before importing.</span>
          </div>
          <Button variant="primary" loading={choosing || drive.isLoading} onClick={() => void choose()}>Choose from Google Drive</Button>
        </div>
      )}

      {tab === 'new' && !picked && sample !== null && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-line px-3.5 py-3">
          <b className="text-[13.5px]">Sample Drive</b>
          <p className="text-[12px] text-ink-3">With sample data this stands in for Google’s picker.</p>
          {SAMPLE_DRIVE.map((s) => (
            <label key={s.id} className="flex items-center gap-2.5 text-[13px]">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={sample.includes(s.id)} onChange={(e) => { const v = e.target.checked; setSample((cur) => (v ? [...(cur ?? []), s.id] : (cur ?? []).filter((x) => x !== s.id))) }} />
              {s.folder ? <Folder size={14} className="text-ink-3" /> : <ImageIcon size={14} className="text-ink-3" />}
              <span className="flex-1 font-semibold">{s.name}</span>
              {s.folder && <span className="text-[12px] text-ink-3 tnum">{fmt.count(s.count)} files</span>}
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSample(null)}>Cancel</Button>
            <Button variant="primary" disabled={!sample.length} onClick={() => { const ids = sample; setSample(null); void expand(ids).catch((e) => toast.error('Couldn’t read those', errorMessage(e))) }}>Select</Button>
          </div>
        </div>
      )}

      {tab === 'new' && picked && (
        <>
          <div className="rounded-[10px] border border-line px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-[13.5px]">What will come in</b>
              <span className="text-[12.5px] text-ink-3 tnum">{groups.length} album{groups.length === 1 ? '' : 's'} · {photosLabel(toImport)}</span>
            </div>
            {groups.length === 0 ? <p className="mt-2 text-[13px] text-ink-2">No photos Frameline can import in what you picked.</p> : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {groups.map((g) => (
                  <li key={g.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                    <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold">{g.key === LOOSE ? <ImageIcon size={13} className="shrink-0 text-ink-3" /> : <Folder size={13} className="shrink-0 text-ink-3" />}<span className="truncate">{g.label}</span></span>
                    <span className="text-ink-3">→ album</span>
                    <input value={names[g.key] ?? g.target} onChange={(e) => setNames((n) => ({ ...n, [g.key]: e.target.value }))} aria-label={`Album for ${g.label}`}
                      className="h-8 w-[160px] min-w-0 rounded-control border border-line-2 bg-surface px-2 text-[13px] outline-none focus:border-accent" />
                    {g.albumId && <span className="text-[12px] text-ink-3">adds to it</span>}
                    <span className="ml-auto text-[12.5px] text-ink-3 tnum">{fmt.count(g.count)}</span>
                  </li>
                ))}
              </ul>
            )}
            {reasons.length > 0 && (
              <p className="mt-2 text-[12.5px] text-ink-2">Left out: {reasons.map(([why, n]) => `${fmt.count(n)} · ${why}`).join('; ')}.</p>
            )}
          </div>
          {picked.closedFolders.length > 0 && (
            <p className="rounded-[10px] bg-warn-soft px-3 py-2.5 text-[12.5px] text-warn">
              Google didn’t let Frameline look inside {picked.closedFolders.map((f) => `“${f.name}”`).join(', ')}. Press Back, choose from Google Drive again, open the folder and select the photos in it (Ctrl+A selects them all).
            </p>
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
          {over > 0 && (
            <p className="rounded-[10px] bg-warn-soft px-3 py-2.5 text-[12.5px] text-warn">
              That’s {photosLabel(over)} more than this event can hold. Pick fewer, or add photos to the event first. <Link to="/plan" className="font-bold underline">See plans</Link>
            </p>
          )}
          <p className="text-[12px] text-ink-3">Photos already in this event are skipped. Imported photos count against your plan like uploads.</p>
        </>
      )}

      {tab === 'running' && (!running.length ? (
        <EmptyState icon={<HardDriveDownload size={22} />} title="Nothing importing right now" body="Imports keep going after you close this window." action={<Button onClick={() => setTab('new')}>Start an import</Button>} />
      ) : running.map((j) => (
        <div key={j.id} className="rounded-[10px] border border-line px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-[13.5px]">{j.name}</b>
            <Button size="sm" variant="danger" loading={stop.isPending && stop.variables === j.id} onClick={() => stop.mutate(j.id)}>Stop import</Button>
          </div>
          <Meter value={j.done + j.skipped + j.failed} max={j.total || 1} className="my-2" label={`${j.done} of ${j.total} imported`} />
          <div className="text-[12.5px] text-ink-2 tnum">
            {fmt.count(j.done)} of {fmt.count(j.total)} · {j.quality === 'original' ? 'Original files' : 'Standard'}{j.albumsCreated ? ` · ${j.albumsCreated} new album${j.albumsCreated === 1 ? '' : 's'}` : ''}{j.skipped ? ` · ${fmt.count(j.skipped)} skipped` : ''}{j.failed ? ` · ${fmt.count(j.failed)} failed` : ''}
          </div>
        </div>
      )))}

      {tab === 'past' && (!past.length ? (
        <EmptyState icon={<HardDriveDownload size={22} />} title="No finished imports yet" body="Finished, stopped and failed imports show here." />
      ) : (
        <ul className="divide-y divide-line rounded-[10px] border border-line">
          {past.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 text-[13px]">
              {j.status === 'done' ? <CheckCircle2 size={15} className="text-ok" /> : j.status === 'cancelled' ? <CircleSlash size={15} className="text-ink-3" /> : <XCircle size={15} className="text-bad" />}
              <div className="min-w-0 flex-1">
                <b className="block truncate">{j.name}</b>
                <span className="text-[12px] text-ink-2">{fmt.dateTime(j.finishedAt ?? j.createdAt)} · {photosLabel(j.done)}{j.skipped ? ` · ${fmt.count(j.skipped)} skipped` : ''}{j.failed ? ` · ${fmt.count(j.failed)} failed` : ''}{j.error ? ` · ${j.error}` : ''}</span>
              </div>
              <Chip tone={j.status === 'done' ? 'ok' : j.status === 'failed' ? 'bad' : 'neutral'}>{j.status === 'done' ? 'Done' : j.status === 'failed' ? 'Failed' : 'Stopped'}</Chip>
            </li>
          ))}
        </ul>
      ))}
    </Modal>
  )
}
