import { useMemo, useState } from 'react'
import { Download, FileText, ImageIcon, Mail, UserX } from 'lucide-react'
import type { DownloadMode, PhotoEvent } from '@frameline/shared'
import { DEMO_NOW, fmt, hash } from '@frameline/shared'
import { Button, Chip, EmptyState, Field, Input, Modal, Segmented, Toggle, useToast } from '@frameline/ui'
import { useStudio } from '../../lib/queries'
import { Row, SectionCard } from './parts'
import type { SectionProps } from './SectionsPrivacy'

interface LogRow { id: string; email: string; at: string; photos: number; zips: number; preparing?: boolean }

const PHOTOS_PER_ZIP = 500
const zipsFor = (n: number) => Math.max(1, Math.ceil(n / PHOTOS_PER_ZIP))
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Sample history so the log isn't empty in the demo; real requests are prepended. */
function sampleLog(event: PhotoEvent, fallbackEmail: string): LogRow[] {
  if (event.photoCount === 0) return []
  const h = hash(event.id)
  const email = event.hosts[0]?.email ?? fallbackEmail
  return [
    { id: `ZR-${event.shortId.slice(0, 3)}${(h % 900) + 100}`, email, at: new Date(DEMO_NOW - 3 * 86_400_000 - (h % 7) * 3_600_000).toISOString(), photos: event.photoCount, zips: zipsFor(event.photoCount) },
    { id: `ZR-${event.shortId.slice(0, 3)}${((h >> 4) % 900) + 100}`, email: fallbackEmail, at: new Date(DEMO_NOW - 9 * 86_400_000).toISOString(), photos: Math.max(1, Math.round(event.photoCount * 0.6)), zips: zipsFor(Math.round(event.photoCount * 0.6)) },
  ]
}

const MODES: { value: DownloadMode; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'own', label: 'Their photos' },
  { value: 'none', label: 'Nothing' },
]

export function DownloadsSection({ event, set }: SectionProps) {
  const studioEmail = useStudio().data?.email ?? 'studio@northlight.in'
  const s = event.settings
  const [zipOpen, setZipOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [requests, setRequests] = useState<LogRow[]>([])
  const log = useMemo(() => [...requests, ...sampleLog(event, studioEmail)], [requests, event, studioEmail])

  return (
    <SectionCard id="downloads" title="Downloads" action={<Button size="sm" icon={<FileText size={12} />} onClick={() => setLogOpen(true)}>Download log</Button>}>
      <Row
        icon={<Download size={15} />} title="What guests can download" description="Web gallery and app"
        control={<Segmented size="sm" value={s.downloads} onChange={(v) => set({ downloads: v })} options={MODES} />}
      />
      <Row
        icon={<ImageIcon size={15} />} title="Original quality"
        description={s.originalDownloads ? 'Guests get the full-size file' : 'Off: downloads are capped at 2048 px'}
        control={<Toggle label="Original quality" disabled={s.downloads === 'none'} checked={s.originalDownloads} onCheckedChange={(v) => set({ originalDownloads: v })} />}
      />
      <Row
        icon={<UserX size={15} />} title="Downloads without signing in" description="Guests can save photos without leaving their email"
        control={<Toggle label="Downloads without signing in" disabled={s.downloads === 'none'} checked={s.anonymousDownloads} onCheckedChange={(v) => set({ anonymousDownloads: v })} />}
      />
      <Row
        icon={<Mail size={15} />} title="Email me every photo as ZIP files" description="For your archive or the client's drive"
        control={<Button size="sm" onClick={() => setZipOpen(true)} disabled={event.photoCount === 0}>Request</Button>}
      />
      <ZipRequestModal
        open={zipOpen} onOpenChange={setZipOpen} event={event} defaultEmail={studioEmail}
        onRequested={(row) => setRequests((l) => [row, ...l])}
      />
      <DownloadLogModal open={logOpen} onOpenChange={setLogOpen} rows={log} />
    </SectionCard>
  )
}

function ZipRequestModal({ open, onOpenChange, event, defaultEmail, onRequested }: {
  open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent; defaultEmail: string; onRequested: (row: LogRow) => void
}) {
  const toast = useToast()
  const [email, setEmail] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const value = email ?? defaultEmail
  const error = touched && !EMAIL_RE.test(value) ? 'Enter a full email address, like name@studio.in' : null
  const zips = zipsFor(event.photoCount)
  const submit = () => {
    setTouched(true)
    if (!EMAIL_RE.test(value)) return
    onRequested({ id: `ZR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, email: value, at: new Date().toISOString(), photos: event.photoCount, zips, preparing: true })
    toast.success('ZIP request sent', `We’ll email ${zips} download link${zips > 1 ? 's' : ''} to ${value} when they’re ready.`)
    onOpenChange(false); setEmail(null); setTouched(false)
  }
  return (
    <Modal
      open={open} onOpenChange={onOpenChange} width={460} title="Email every photo as ZIP files"
      description={`${fmt.count(event.photoCount)} photos in ${zips} ZIP file${zips > 1 ? 's' : ''} of up to ${PHOTOS_PER_ZIP} photos. Links work for 7 days.`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" icon={<Mail size={14} />} onClick={submit}>Send ZIP links</Button></>}
    >
      <form className="px-5 py-4 sm:px-6" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Send the links to" htmlFor="zip-email" error={error} hint="Use the client's email to hand over the full set.">
          <Input id="zip-email" type="email" icon={<Mail size={14} />} value={value} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} autoFocus />
        </Field>
      </form>
    </Modal>
  )
}

function DownloadLogModal({ open, onOpenChange, rows }: { open: boolean; onOpenChange: (v: boolean) => void; rows: LogRow[] }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Download log" description="Every “email me all photos” request for this event." width={760}>
      {rows.length === 0 ? (
        <EmptyState icon={<FileText size={22} />} title="No ZIP requests yet" body="Requests appear here once someone asks for every photo by email." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11.5px] text-ink-3">
                <th className="px-5 py-2 font-bold">Request ID</th><th className="px-3 py-2 font-bold">Email</th><th className="px-3 py-2 font-bold">Requested at</th>
                <th className="px-3 py-2 text-right font-bold">Photos</th><th className="px-5 py-2 text-right font-bold">ZIP files</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-mono text-[12px]">{r.id}</td>
                  <td className="px-3 py-2.5">{r.email}</td>
                  <td className="px-3 py-2.5 text-ink-2">{fmt.dateTime(r.at)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tnum">{fmt.count(r.photos)}</td>
                  <td className="px-5 py-2.5 text-right font-mono tnum">{r.preparing ? <Chip tone="accent" dot>Preparing {r.zips}</Chip> : r.zips}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
