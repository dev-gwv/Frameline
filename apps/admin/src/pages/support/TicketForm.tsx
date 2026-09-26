import { useRef, useState } from 'react'
import { FileImage, FileVideo, Paperclip, X } from 'lucide-react'
import { fmt, type Ticket } from '@frameline/shared'
import { Button, Card, Field, Input, Segmented, Select, Textarea, Tip } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents } from '../../lib/queries'

const MAX_FILES = 5
const MAX_IMAGE = 100 * 1024 * 1024
const MAX_VIDEO = 1024 * 1024 * 1024
export const PLATFORM_LABEL: Record<Ticket['platform'], string> = { 'web-gallery': 'Web gallery', app: 'App', admin: 'Admin', desktop: 'Desktop' }

export function TicketForm({ onCreated, initialPhone }: { onCreated: (t: Ticket) => void; initialPhone?: string }) {
  const api = useApi()
  const events = useEvents()
  const fileRef = useRef<HTMLInputElement>(null)
  const [subject, setSubject] = useState('')
  const [eventId, setEventId] = useState('')
  const [platform, setPlatform] = useState<Ticket['platform']>('web-gallery')
  const [phone, setPhone] = useState(initialPhone ?? '')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState('')
  const [tried, setTried] = useState(false)

  const errors = {
    subject: !subject.trim() ? 'Add a short subject, like “Selfie finds no photos”' : '',
    body: body.trim().length < 10 ? 'Describe the steps, what you expected and what you saw' : '',
    phone: phone && !/^\+?[\d\s-]{10,15}$/.test(phone) ? 'Enter a 10-digit mobile number, with +91 if you like' : '',
  }
  const invalid = Object.values(errors).some(Boolean)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const problems: string[] = []
    const next = [...files]
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) { problems.push(`Only ${MAX_FILES} files per request; ${f.name} was skipped.`); continue }
      const isImg = f.type.startsWith('image/'), isVid = f.type.startsWith('video/')
      if (!isImg && !isVid) problems.push(`${f.name} isn’t an image or video.`)
      else if (isImg && f.size > MAX_IMAGE) problems.push(`${f.name} is over 100 MB (images).`)
      else if (isVid && f.size > MAX_VIDEO) problems.push(`${f.name} is over 1 GB (videos).`)
      else next.push(f)
    }
    setFiles(next); setFileError(problems.join(' '))
  }

  const send = useAction(() => {
    const ev = events.data?.find((e) => e.id === eventId)
    const extra = [
      phone && `Contact: ${phone}`,
      ev && `Event: ${ev.name} (${ev.shortId})`,
      files.length && `Attachments: ${files.map((f) => `${f.name} (${fmt.bytes(f.size)})`).join(', ')}`,
    ].filter(Boolean).join('\n')
    return api.createTicket({ subject: subject.trim(), eventId: eventId || undefined, platform, body: body.trim() + (extra ? `\n\n${extra}` : '') })
  }, {
    success: 'Sent to support · usual reply under 2 hours',
    onSuccess: (t) => { setSubject(''); setBody(''); setFiles([]); setTried(false); setFileError(''); onCreated(t) },
  })

  const submit = () => { setTried(true); if (!invalid) send.mutate(undefined) }
  const show = (k: keyof typeof errors) => (tried ? errors[k] : k === 'phone' ? errors.phone : '')

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[15px] font-semibold">Ask the team</h3>
        <span className="text-[12px] text-ink-3">Usual reply: under 2 hours</span>
      </div>
      <Field label="Subject" error={show('subject')} htmlFor="t-subject">
        <Input id="t-subject" maxLength={120} placeholder="Guests say the selfie finds no photos" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Event" htmlFor="t-event">
          <Select id="t-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Not about one event</option>
            {events.data?.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.shortId}</option>)}
          </Select>
        </Field>
        <Field label="Contact number" error={show('phone')} htmlFor="t-phone">
          <Input id="t-phone" type="tel" placeholder="+91 98200 41177" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <Field label="Where does it happen?">
        <div className="overflow-x-auto">
          <Segmented value={platform} onChange={setPlatform} options={(Object.keys(PLATFORM_LABEL) as Ticket['platform'][]).map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))} />
        </div>
      </Field>
      <Field label="Details" error={show('body')} htmlFor="t-body">
        <Textarea id="t-body" rows={4} placeholder="Steps, what you expected, what you saw" value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      {!!files.length && (
        <ul className="flex flex-col gap-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-control bg-sunk px-2.5 py-1.5 text-[12.5px]">
              {f.type.startsWith('video/') ? <FileVideo size={14} className="text-ink-3" /> : <FileImage size={14} className="text-ink-3" />}
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="font-mono text-[11px] text-ink-3">{fmt.bytes(f.size)}</span>
              <Tip label="Remove">
                <button type="button" aria-label={`Remove ${f.name}`} className="rounded p-0.5 text-ink-3 hover:bg-surface hover:text-ink" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}><X size={13} /></button>
              </Tip>
            </li>
          ))}
        </ul>
      )}
      {fileError && <p className="text-[11.5px] font-semibold text-bad">{fileError}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" icon={<Paperclip size={12} />} disabled={files.length >= MAX_FILES} onClick={() => fileRef.current?.click()}>Screenshots or video ({files.length}/{MAX_FILES})</Button>
        <input ref={fileRef} type="file" hidden multiple accept="image/*,video/*" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        <Button variant="primary" loading={send.isPending} onClick={submit}>Send to support</Button>
      </div>
      <p className="text-[11px] text-ink-3">Images up to 100 MB, videos up to 1 GB, 5 files at most.</p>
    </Card>
  )
}
