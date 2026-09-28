import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FileImage, FileVideo, MessageCircle, MessageSquare, Paperclip, PlayCircle, Search, Send, Ticket as TicketIcon, X } from 'lucide-react'
import { fmt, type Ticket } from '@frameline/shared'
import { Button, Card, Chip, cn, EmptyState, Field, Input, Modal, Page, Segmented, Select, Skeleton, Textarea, type ChipTone } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents, useStudio, useTickets } from '../../lib/queries'
import { useParamState } from '../../lib/url'
import { QueryError } from '../system'
import { articleForTopic, searchArticles } from './articles'

const WHATSAPP = '+91 80 4718 2200'
const WA_LINK = `https://wa.me/${WHATSAPP.replace(/\D/g, '')}`
const STATUS: Record<Ticket['status'], { label: string; tone: ChipTone }> = {
  open: { label: 'Open', tone: 'accent' }, answered: { label: 'Answered', tone: 'ok' }, waiting: { label: 'Waiting', tone: 'warn' }, closed: { label: 'Closed', tone: 'neutral' },
}
const PLATFORM_LABEL: Record<Ticket['platform'], string> = { admin: 'This website', 'web-gallery': 'Guest gallery', app: 'Phone app', desktop: 'Desktop uploader' }

/** /support "Help": WhatsApp, Ask the team (new request), Guides and videos; then your requests. ?new=1, ?request=<id>, ?topic=<article>. */
export default function Support() {
  const tickets = useTickets()
  const [params, set] = useParamState()
  const topic = params.get('topic')
  const cards = [
    { icon: <MessageCircle size={16} />, title: 'WhatsApp us', body: WHATSAPP, cta: 'Open chat', onClick: () => window.open(WA_LINK, '_blank', 'noopener') },
    { icon: <TicketIcon size={16} />, title: 'Ask the team', body: 'For anything that needs a screenshot', cta: 'New request', onClick: () => set({ new: '1' }) },
    { icon: <PlayCircle size={16} />, title: 'Guides and videos', body: 'English and हिन्दी', cta: 'Browse', onClick: () => set({ topic: 'all' }) },
  ]
  const list = tickets.data ?? []
  const open = list.find((t) => t.id === params.get('request')) ?? null
  return (
    <Page title="Help" subtitle="We usually reply on WhatsApp within an hour, 9 am to 9 pm.">
      <div className="mb-5 grid gap-3.5 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.title} className="flex flex-col items-start gap-2">
            <span className="grid size-8 place-items-center rounded-control bg-accent-soft text-accent-text">{c.icon}</span>
            <b className="text-[15px]">{c.title}</b>
            <span className="text-[13.5px] text-ink-2">{c.body}</span>
            <Button size="sm" className="mt-auto max-sm:h-[44px]" onClick={c.onClick}>{c.cta}</Button>
          </Card>
        ))}
      </div>
      <h2 className="mb-2.5 font-sans text-[15px] font-extrabold">Your requests</h2>
      <Card padded={false} className="overflow-hidden">
        {tickets.isError ? <QueryError error={tickets.error} retry={() => tickets.refetch()} what="your requests" /> : tickets.isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : !list.length ? (
          <EmptyState icon={<MessageSquare size={22} />} title="No requests yet" body="When you ask the team something, the conversation shows up here." action={<Button onClick={() => set({ new: '1' })}>New request</Button>} />
        ) : (
          <ul>
            {list.map((t) => {
              const last = t.messages[t.messages.length - 1]
              return (
                <li key={t.id} className="border-t border-line first:border-t-0">
                  <button type="button" onClick={() => set({ request: t.id })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunk">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{t.subject}</b>
                      <span className="block truncate text-[12.5px] text-ink-3">#{t.id.toUpperCase()} · {last.from === 'support' ? 'Support replied' : 'You wrote'} {fmt.ago(last.at)}</span>
                    </span>
                    <Chip tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Chip>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <RequestModal open={params.get('new') === '1'} onOpenChange={(v) => set({ new: v ? '1' : undefined })} onCreated={(t) => set({ new: undefined, request: t.id })} />
      <ThreadModal ticket={open} onClose={() => set({ request: undefined })} />
      <GuidesModal topic={topic} onClose={() => set({ topic: undefined })} />
    </Page>
  )
}

/* ---------------- New request ---------------- */
const MAX_FILES = 5
function RequestModal({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (t: Ticket) => void }) {
  const api = useApi()
  const events = useEvents()
  const studio = useStudio()
  const fileRef = useRef<HTMLInputElement>(null)
  const [what, setWhat] = useState('')
  const [eventId, setEventId] = useState('')
  const [platform, setPlatform] = useState<Ticket['platform']>('admin')
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState('')
  const [tried, setTried] = useState(false)
  useEffect(() => { if (open) { setWhat(''); setEventId(''); setPlatform('admin'); setFiles([]); setFileError(''); setTried(false) } }, [open])
  const error = what.trim().length < 10 ? 'Tell us what happened in a sentence or two' : ''

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next = [...files], problems: string[] = []
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) { problems.push(`Up to ${MAX_FILES} files; ${f.name} was left out.`); continue }
      const img = f.type.startsWith('image/'), vid = f.type.startsWith('video/')
      if (!img && !vid) problems.push(`${f.name} isn’t a screenshot or video.`)
      else if (img && f.size > 100 * 1048576) problems.push(`${f.name} is over 100 MB.`)
      else if (vid && f.size > 1024 * 1048576) problems.push(`${f.name} is over 1 GB.`)
      else next.push(f)
    }
    setFiles(next); setFileError(problems.join(' '))
  }
  const send = useAction(() => {
    const ev = events.data?.find((e) => e.id === eventId)
    const text = what.trim()
    const subject = text.split(/[.\n!?]/)[0].slice(0, 80) || 'Help request'
    const extra = [
      studio.data?.phone && `Contact: ${studio.data.phone}`,
      ev && `Event: ${ev.name} (${ev.shortId})`,
      files.length && `Screenshots: ${files.map((f) => `${f.name} (${fmt.bytes(f.size)})`).join(', ')}`,
    ].filter(Boolean).join('\n')
    return api.createTicket({ subject, eventId: eventId || undefined, platform, body: text + (extra ? `\n\n${extra}` : '') })
  }, { success: 'Sent · we usually reply within an hour', onSuccess: onCreated })

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Ask the team" description="A real person reads this. We reply here and on WhatsApp." width={560}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={send.isPending} onClick={() => { setTried(true); if (!error) send.mutate(undefined) }}>Send request</Button></>}>
      <Field label="What happened?" error={tried ? error : ''} htmlFor="req-what">
        <Textarea id="req-what" rows={4} autoFocus placeholder="Guests say the selfie finds no photos in the Riya & Kabir gallery…" value={what} onChange={(e) => setWhat(e.target.value)} />
      </Field>
      <Field label="Which event?" htmlFor="req-event">
        <Select id="req-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">Not about one event</option>
          {events.data?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </Field>
      <Field label="Where does it happen?">
        <div className="-mx-1 overflow-x-auto px-1 scrollbar-none">
          <Segmented value={platform} onChange={setPlatform} options={(Object.keys(PLATFORM_LABEL) as Ticket['platform'][]).map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))} />
        </div>
      </Field>
      <div className="flex flex-col gap-1.5">
        {files.map((f, i) => (
          <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-control bg-sunk px-2.5 py-1.5 text-[13px]">
            {f.type.startsWith('video/') ? <FileVideo size={14} className="text-ink-3" /> : <FileImage size={14} className="text-ink-3" />}
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="text-[12px] text-ink-3 tnum">{fmt.bytes(f.size)}</span>
            <button type="button" aria-label={`Remove ${f.name}`} className="grid size-7 place-items-center rounded text-ink-3 hover:bg-surface hover:text-ink" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}><X size={14} /></button>
          </div>
        ))}
        {fileError && <span className="text-[12px] font-semibold text-bad">{fileError}</span>}
        <Button size="sm" className="self-start" icon={<Paperclip size={13} />} disabled={files.length >= MAX_FILES} onClick={() => fileRef.current?.click()}>Add screenshots ({files.length} of {MAX_FILES})</Button>
        <input ref={fileRef} type="file" hidden multiple accept="image/*,video/*" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      </div>
    </Modal>
  )
}

/* ---------------- One request ---------------- */
function ThreadModal({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const api = useApi()
  const [reply, setReply] = useState('')
  useEffect(() => setReply(''), [ticket?.id])
  const send = useAction((body: string) => api.replyTicket(ticket!.id, body), { success: 'Reply sent', onSuccess: () => setReply('') })
  if (!ticket) return null
  const submit = () => reply.trim() && send.mutate(reply.trim())
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} width={600} title={ticket.subject}
      description={<span className="inline-flex flex-wrap items-center gap-2">#{ticket.id.toUpperCase()} · {PLATFORM_LABEL[ticket.platform]} <Chip tone={STATUS[ticket.status].tone}>{STATUS[ticket.status].label}</Chip></span>}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" icon={<Send size={14} />} disabled={!reply.trim()} loading={send.isPending} onClick={submit}>Send reply</Button></>}>
      <div className="flex flex-col gap-2 text-[13.5px]">
        {ticket.messages.map((m, i) => (
          <div key={i} className={cn('max-w-[85%] whitespace-pre-line rounded-[10px] px-3 py-2', m.from === 'support' ? 'ml-auto bg-accent-soft' : 'bg-sunk')}>
            {m.from === 'support' && <b className="block text-[12px] text-accent-text">Frameline support</b>}
            {m.body}
            <div className="mt-1 text-[11.5px] text-ink-3">{fmt.dateTime(m.at)}</div>
          </div>
        ))}
      </div>
      {ticket.status === 'closed' && <p className="text-[13px] text-ink-3">This request is closed. Replying opens it again.</p>}
      <Textarea aria-label="Your reply" rows={3} placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }} />
    </Modal>
  )
}

/* ---------------- Guides and videos ---------------- */
function GuidesModal({ topic, onClose }: { topic: string | null; onClose: () => void }) {
  const linked = articleForTopic(topic)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  useEffect(() => { setQuery(''); setExpanded(linked?.id ?? null) }, [topic]) // eslint-disable-line react-hooks/exhaustive-deps
  const results = linked && !query ? [linked, ...searchArticles('').filter((a) => a.id !== linked.id)] : searchArticles(query)
  return (
    <Modal open={!!topic} onOpenChange={(v) => !v && onClose()} title="Guides and videos" description="Short answers, with videos in English and हिन्दी." width={640}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" icon={<MessageCircle size={14} />} onClick={() => window.open(WA_LINK, '_blank', 'noopener')}>Still stuck? WhatsApp us</Button></>}>
      <Input icon={<Search size={16} />} aria-label="Search guides" placeholder="Search, e.g. “change PIN”" value={query} onChange={(e) => { setQuery(e.target.value); setExpanded(null) }}
        suffix={query ? <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="text-ink-3 hover:text-ink"><X size={15} /></button> : undefined} />
      {!results.length ? <p className="text-[13.5px] text-ink-2">Nothing matches “{query}”. Try fewer words, or ask the team.</p> : (
        <ul className="-mx-[22px]">
          {results.map((a) => {
            const on = expanded === a.id
            return (
              <li key={a.id} className="border-t border-line">
                <button type="button" aria-expanded={on} onClick={() => setExpanded(on ? null : a.id)} className="flex min-h-[44px] w-full items-center gap-3 px-[22px] py-2.5 text-left hover:bg-sunk">
                  <span className="flex-1 text-[14px] font-bold">{a.title}</span>
                  {a.video && <span className="inline-flex items-center gap-1 text-[12px] font-bold text-ink-3"><PlayCircle size={13} />Video</span>}
                  <ChevronDown size={15} className={cn('shrink-0 text-ink-3 transition', on && 'rotate-180')} />
                </button>
                {on && (
                  <div className="px-[22px] pb-3 text-[13.5px] text-ink-2">
                    <p>{a.answer}</p>
                    {a.video && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a href={a.video.en} target="_blank" rel="noreferrer" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-control border border-line-2 px-3 text-[13px] font-bold text-ink hover:bg-sunk"><PlayCircle size={14} />Watch in English</a>
                        <a href={a.video.hi} target="_blank" rel="noreferrer" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-control border border-line-2 px-3 text-[13px] font-bold text-ink hover:bg-sunk"><PlayCircle size={14} />हिन्दी में देखें</a>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
