import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, Copy, ExternalLink, MessageCircle, PlayCircle, Search, X } from 'lucide-react'
import { Button, Card, cn, Input, Modal, PageHeader, useToast } from '@frameline/ui'
import { useStudio } from '../../lib/queries'
import { articleForTopic, searchArticles, TOPICS } from './articles'
import { TicketForm } from './TicketForm'
import { Tickets } from './Tickets'

const WHATSAPP = '+91 6351 081 819'

export default function Support() {
  const studio = useStudio()
  const [params] = useSearchParams()
  // ?topic=google-drive-import (or an article id) opens that answer straight away.
  const linked = articleForTopic(params.get('topic'))
  const [query, setQuery] = useState(linked?.tags[0] ?? '')
  const [expanded, setExpanded] = useState<string | null>(linked?.id ?? null)
  const linkedRef = useRef<HTMLLIElement>(null)
  useEffect(() => { if (linked) linkedRef.current?.scrollIntoView({ block: 'center' }) }, [linked])
  const [waOpen, setWaOpen] = useState(false)
  const [openTicket, setOpenTicket] = useState<string | null>(null)
  const results = searchArticles(query)

  return (
    <div className="pb-10">
      <PageHeader title="Support" subtitle="Most answers take under a minute to find."
        actions={<Button icon={<MessageCircle size={14} />} onClick={() => setWaOpen(true)}>WhatsApp us</Button>} />
      <div className="flex flex-col gap-4 px-4 sm:px-7">
        <Input
          icon={<Search size={16} />} aria-label="Search help"
          className="h-12 text-[14px] [&_input]:text-[14px]"
          placeholder={'Search help, e.g. "guests can\'t find their photos"'}
          value={query} onChange={(e) => { setQuery(e.target.value); setExpanded(null) }}
          suffix={query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="text-ink-3 hover:text-ink"><X size={15} /></button>}
        />
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <button key={t.label} type="button" onClick={() => { setQuery(t.query); setExpanded(null) }}
              className={cn('rounded-full border px-2.5 py-1 text-[12px] font-bold transition', query === t.query ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-sunk text-ink-2 hover:text-ink')}>
              {t.label}
            </button>
          ))}
        </div>

        <Card padded={false}>
          <div className="flex items-baseline justify-between px-4 pb-1 pt-3.5">
            <h3 className="font-display text-[15px] font-semibold">{query ? `${results.length} ${results.length === 1 ? 'answer' : 'answers'}` : 'Popular answers'}</h3>
          </div>
          {!results.length ? (
            <p className="px-4 pb-4 text-[13px] text-ink-2">No answers match “{query}”. Try fewer words, or ask the team below; we usually reply within 2 hours.</p>
          ) : (
            <ul>
              {results.map((a) => {
                const open = expanded === a.id
                return (
                  <li key={a.id} ref={a.id === linked?.id ? linkedRef : undefined} className="border-t border-line">
                    <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : a.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunk">
                      {a.video ? <PlayCircle size={15} className="shrink-0 text-accent-text" /> : <span className="size-[15px] shrink-0" />}
                      <span className="flex-1 text-[13px] font-bold">{a.title}</span>
                      <ChevronDown size={15} className={cn('shrink-0 text-ink-3 transition', open && 'rotate-180')} />
                    </button>
                    {open && (
                      <div className="px-4 pb-3 pl-[43px] text-[13px] text-ink-2">
                        <p>{a.answer}</p>
                        {a.video && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <a href={a.video.en} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-control border border-line-2 px-2.5 py-1 text-[12px] font-bold text-ink hover:bg-sunk"><PlayCircle size={13} /> Watch in English</a>
                            <a href={a.video.hi} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-control border border-line-2 px-2.5 py-1 text-[12px] font-bold text-ink hover:bg-sunk"><PlayCircle size={13} /> हिन्दी में देखें</a>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] [&>*]:min-w-0">
          <TicketForm initialPhone={studio.data?.phone} onCreated={(t) => setOpenTicket(t.id)} />
          <Tickets openId={openTicket} setOpenId={setOpenTicket} />
        </div>
      </div>
      <WhatsAppModal open={waOpen} onOpenChange={setWaOpen} />
    </div>
  )
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

function WhatsAppModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const toast = useToast()
  const digits = WHATSAPP.replace(/\D/g, '')
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="WhatsApp us" description="Mon–Sat, 9 AM to 9 PM IST. Share your event ID so we can help faster." width={420}
      footer={<>
        <Button icon={<Copy size={14} />} onClick={async () => (await copyText(WHATSAPP)) ? toast.success('Number copied', WHATSAPP) : toast.error('Couldn’t copy', 'Select the number and copy it by hand.')}>Copy number</Button>
        <Button variant="primary" icon={<ExternalLink size={14} />} onClick={() => window.open(`https://wa.me/${digits}`, '_blank', 'noopener')}>Open WhatsApp</Button>
      </>}>
      <div className="px-6 py-5 text-center">
        <div className="select-all font-mono text-[24px] font-bold tnum">{WHATSAPP}</div>
        <p className="mt-2 text-[12.5px] text-ink-3">Also join the Frameline photographers’ community on WhatsApp for tips and updates.</p>
      </div>
    </Modal>
  )
}
