import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, FileText, ImageIcon, Mail, UserX } from 'lucide-react'
import type { DownloadMode, PhotoEvent, ZipRequest } from '@frameline/shared'
import { fmt } from '@frameline/shared'
import { Button, Chip, EmptyState, Field, Input, Modal, Segmented, Skeleton, Toggle } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useStudio, useZipRequests } from '../../lib/queries'
import { QueryError } from '../system'
import { Row, SectionCard } from './parts'
import type { SectionProps } from './SectionsPrivacy'

const PHOTOS_PER_ZIP = 500
const zipsFor = (n: number) => Math.max(1, Math.ceil(n / PHOTOS_PER_ZIP))
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const MODES: { value: DownloadMode; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'own', label: 'Their photos' },
  { value: 'none', label: 'Nothing' },
]

export function DownloadsSection({ event, set }: SectionProps) {
  const studioEmail = useStudio().data?.email ?? ''
  const s = event.settings
  const [zipOpen, setZipOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)

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
      <ZipRequestModal open={zipOpen} onOpenChange={setZipOpen} event={event} defaultEmail={studioEmail} />
      <DownloadLogModal open={logOpen} onOpenChange={setLogOpen} eventId={event.id} />
    </SectionCard>
  )
}

function ZipRequestModal({ open, onOpenChange, event, defaultEmail }: {
  open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent; defaultEmail: string
}) {
  const api = useApi()
  const qc = useQueryClient()
  const [email, setEmail] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const value = email ?? defaultEmail
  const error = touched && !EMAIL_RE.test(value) ? 'Enter a full email address, like name@studio.in' : null
  const zips = zipsFor(event.photoCount)
  const request = useAction((to: string) => api.requestZip(event.id, to), {
    success: (z) => `ZIP request sent. We’ll email ${zipsFor(z.photoCount)} download link${zipsFor(z.photoCount) > 1 ? 's' : ''} to ${z.email} when they’re ready.`,
    error: 'Couldn’t request the ZIP files',
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['zips', event.id] }); onOpenChange(false); setEmail(null); setTouched(false) },
  })
  const submit = () => {
    setTouched(true)
    if (!EMAIL_RE.test(value)) return
    request.mutate(value.trim())
  }
  return (
    <Modal
      open={open} onOpenChange={onOpenChange} width={460} title="Email every photo as ZIP files"
      description={`${fmt.count(event.photoCount)} photos in ${zips} ZIP file${zips > 1 ? 's' : ''} of up to ${PHOTOS_PER_ZIP} photos. Links work for 7 days.`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" icon={<Mail size={14} />} loading={request.isPending} onClick={submit}>Send ZIP links</Button></>}
    >
      <form className="px-5 py-4 sm:px-6" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Send the links to" htmlFor="zip-email" error={error} hint="Use the client's email to hand over the full set.">
          <Input id="zip-email" type="email" icon={<Mail size={14} />} value={value} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} autoFocus />
        </Field>
      </form>
    </Modal>
  )
}

const STATUS: Record<ZipRequest['status'], { label: string; tone: 'accent' | 'ok' | 'bad' }> = {
  queued: { label: 'Preparing', tone: 'accent' },
  ready: { label: 'Ready', tone: 'ok' },
  failed: { label: 'Failed', tone: 'bad' },
}

function DownloadLogModal({ open, onOpenChange, eventId }: { open: boolean; onOpenChange: (v: boolean) => void; eventId: string }) {
  const q = useZipRequests(open ? eventId : undefined)
  const rows = q.data ?? []
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Download log" description="Every “email me all photos” request for this event." width={800}>
      {q.error ? <div className="p-5"><QueryError error={q.error} retry={() => q.refetch()} /></div>
      : q.isLoading ? <div className="flex flex-col gap-2 p-5">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>
      : rows.length === 0 ? (
        <EmptyState icon={<FileText size={22} />} title="No ZIP requests yet" body="Requests appear here once someone asks for every photo by email." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11.5px] text-ink-3">
                <th className="px-5 py-2 font-bold">Request ID</th><th className="px-3 py-2 font-bold">Email</th><th className="px-3 py-2 font-bold">Requested at</th>
                <th className="px-3 py-2 text-right font-bold">Photos</th><th className="px-3 py-2 text-right font-bold">ZIP files</th><th className="px-5 py-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-mono text-[12px]">{r.id.toUpperCase()}</td>
                  <td className="px-3 py-2.5">{r.email}</td>
                  <td className="px-3 py-2.5 text-ink-2">{fmt.dateTime(r.requestedAt)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tnum">{fmt.count(r.photoCount)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tnum">{zipsFor(r.photoCount)}</td>
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-2">
                      <Chip tone={STATUS[r.status].tone} dot={r.status === 'queued'}>{STATUS[r.status].label}</Chip>
                      {r.status === 'ready' && r.url && (
                        <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-bold text-accent-text hover:underline">Open<ExternalLink size={11} /></a>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
