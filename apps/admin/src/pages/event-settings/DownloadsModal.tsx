import { useEffect, useState } from 'react'
import { ChevronRight, ExternalLink, FileText, Mail } from 'lucide-react'
import type { DownloadMode, PhotoEvent, ZipRequest } from '@frameline/shared'
import { fmt } from '@frameline/shared'
import { Button, Chip, EmptyState, Input, Modal, RadioCardGroup, SettingRow, Skeleton, Toggle } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useStudio, useZipRequests } from '../../lib/queries'
import { QueryError } from '../system'
import type { SaveSettings } from './useEventSaver'

const PHOTOS_PER_ZIP = 500
const zipsFor = (n: number) => Math.max(1, Math.ceil(n / PHOTOS_PER_ZIP))
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** 'set-dl': What can guests download? (+ ZIP email and the download log, which opens in its own dialog). */
export function DownloadsModal({ open, onOpenChange, event, set, onLog, session }: {
  open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent; set: SaveSettings; onLog: () => void
  /** Changes each time the dialog is opened fresh (not when coming back from the log), which resets the choices. */
  session: number
}) {
  const api = useApi()
  const s = event.settings
  const studioEmail = useStudio().data?.email ?? ''
  const logCount = useZipRequests(open ? event.id : undefined).data?.length
  const [mode, setMode] = useState<DownloadMode>(s.downloads)
  const [anon, setAnon] = useState(s.anonymousDownloads)
  const [zipOpen, setZipOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [tried, setTried] = useState(false)
  useEffect(() => {
    setMode(s.downloads); setAnon(s.anonymousDownloads); setZipOpen(false); setEmail(''); setTried(false)
    // Reset only when the dialog is opened fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const zip = useAction((to: string) => api.requestZip(event.id, to), {
    success: (z) => `Sending ${zipsFor(z.photoCount)} ZIP link${zipsFor(z.photoCount) > 1 ? 's' : ''} to ${z.email} when they’re ready`,
    error: 'Couldn’t send the ZIP files',
    onSuccess: () => setZipOpen(false),
  })
  const emailError = tried && !EMAIL_RE.test(email.trim()) ? 'Enter a full email address, like name@gmail.com' : null
  const send = () => { setTried(true); if (EMAIL_RE.test(email.trim())) zip.mutate(email.trim()) }
  const save = () => {
    const patch = { ...(mode !== s.downloads ? { downloads: mode } : {}), ...(anon !== s.anonymousDownloads ? { anonymousDownloads: anon } : {}) }
    if (Object.keys(patch).length) set(patch)
    onOpenChange(false)
  }
  const zips = zipsFor(event.photoCount)

  return (
    <Modal open={open} onOpenChange={onOpenChange} width={520} title="What can guests download?"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <RadioCardGroup<DownloadMode> label="What guests can download" value={mode} onChange={setMode} options={[
        { value: 'all', title: 'Everything', description: 'Any photo in the gallery' },
        { value: 'own', title: 'Only photos they’re in', description: s.faceSearch ? 'Found with their selfie' : 'Found with their selfie (turn on selfie search in Faces)' },
        { value: 'none', title: 'Nothing', description: s.storeEnabled ? 'View only; they can still buy photos' : 'View only; they can still buy if selling is on' },
      ]} />
      <div className="border-t border-line">
        <SettingRow title="Allow downloads without signing up" description={mode === 'none' ? 'Downloads are off' : 'Guests save photos without leaving their name'}
          control={<Toggle label="Allow downloads without signing up" checked={mode !== 'none' && anon} disabled={mode === 'none'} onCheckedChange={setAnon} />} />
        <SettingRow title="Email every photo as ZIP files"
          description={event.photoCount ? `For the client, after the event · ${fmt.count(event.photoCount)} photos in ${zips} ZIP file${zips > 1 ? 's' : ''}` : 'Upload photos first'}
          control={!zipOpen && <Button size="sm" disabled={!event.photoCount} onClick={() => { setZipOpen(true); if (!email) setEmail(studioEmail) }}>Send</Button>} />
        {zipOpen && (
          <form className="flex flex-col gap-1.5 pb-3" onSubmit={(e) => { e.preventDefault(); send() }}>
            <div className="flex gap-2">
              <Input aria-label="Send the ZIP links to" type="email" icon={<Mail size={14} />} value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="client@gmail.com" className="flex-1" autoFocus aria-invalid={!!emailError} />
              <Button type="submit" loading={zip.isPending}>Send links</Button>
            </div>
            {emailError ? <span className="text-[12px] text-bad">{emailError}</span> : <span className="text-[12px] text-ink-3">Links work for 7 days.</span>}
          </form>
        )}
      </div>
      <button type="button" onClick={onLog} className="inline-flex items-center gap-1 self-start text-[13px] font-bold text-accent-text hover:underline">
        See download log{logCount !== undefined && <span className="tnum"> ({fmt.count(logCount)})</span>}<ChevronRight size={13} aria-hidden />
      </button>
    </Modal>
  )
}

const STATUS: Record<ZipRequest['status'], { label: string; tone: 'accent' | 'ok' | 'bad' }> = {
  queued: { label: 'Preparing', tone: 'accent' },
  ready: { label: 'Ready', tone: 'ok' },
  failed: { label: 'Failed', tone: 'bad' },
}

export function DownloadLogModal({ open, onOpenChange, eventId, onBack }: { open: boolean; onOpenChange: (v: boolean) => void; eventId: string; onBack: () => void }) {
  const q = useZipRequests(open ? eventId : undefined)
  const rows = q.data ?? []
  return (
    <Modal open={open} onOpenChange={onOpenChange} width={620} title="Download log" description="Every “email me all the photos” request for this event."
      bodyClassName="p-0 gap-0" footer={<Button variant="ghost" onClick={onBack}>Back</Button>}>
      {q.error ? <div className="p-5"><QueryError error={q.error} retry={() => q.refetch()} /></div>
        : q.isLoading ? <div className="flex flex-col gap-2 p-5">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
          : rows.length === 0 ? (
            <EmptyState className="py-10" icon={<FileText size={22} />} title="No downloads yet" body="When you or a guest asks for every photo by email, the ZIP files show up here." />
          ) : (
            <ul>
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-[22px] py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold">{r.email}</div>
                    <div className="text-[12.5px] text-ink-2 tnum">{fmt.count(r.photoCount)} photos · {zipsFor(r.photoCount)} ZIP file{zipsFor(r.photoCount) > 1 ? 's' : ''} · {fmt.dateTime(r.requestedAt)}</div>
                  </div>
                  <span className="flex items-center gap-2">
                    <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip>
                    {r.status === 'ready' && r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 text-[12.5px] font-bold text-accent-text hover:underline">Open<ExternalLink size={12} aria-hidden /></a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
    </Modal>
  )
}
