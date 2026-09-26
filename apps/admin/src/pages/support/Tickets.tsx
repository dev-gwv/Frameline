import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MessageSquare, Send } from 'lucide-react'
import { fmt, type Ticket } from '@frameline/shared'
import { Button, Card, Chip, cn, EmptyState, Skeleton, Textarea, type ChipTone } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useTickets } from '../../lib/queries'
import { QueryError } from '../system'
import { PLATFORM_LABEL } from './TicketForm'

const STATUS: Record<Ticket['status'], { label: string; tone: ChipTone }> = {
  open: { label: 'Open', tone: 'accent' }, answered: { label: 'Answered', tone: 'ok' }, waiting: { label: 'Waiting for support', tone: 'warn' }, closed: { label: 'Closed', tone: 'neutral' },
}

export function Tickets({ openId, setOpenId }: { openId: string | null; setOpenId: (id: string | null) => void }) {
  const q = useTickets()
  const ticket = q.data?.find((t) => t.id === openId)
  if (q.isError) return <Card><QueryError error={q.error} retry={() => q.refetch()} /></Card>
  if (ticket) return <Thread ticket={ticket} onBack={() => setOpenId(null)} />
  return (
    <Card padded={false}>
      <div className="flex items-baseline justify-between px-4 pb-2 pt-4">
        <h3 className="font-display text-[15px] font-semibold">Your requests</h3>
        {q.data && <span className="font-mono text-[11px] text-ink-3">{q.data.filter((t) => t.status !== 'closed').length} open</span>}
      </div>
      {q.isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : !q.data?.length ? (
        <EmptyState icon={<MessageSquare size={22} />} title="No requests yet" body="When you ask the team something, the conversation shows up here." />
      ) : (
        <ul>
          {q.data.map((t) => {
            const last = t.messages[t.messages.length - 1]
            return (
              <li key={t.id}>
                <button type="button" onClick={() => setOpenId(t.id)} className="flex w-full items-start gap-3 border-t border-line px-4 py-3 text-left hover:bg-sunk">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold">{t.subject}</div>
                    <div className="truncate text-[12px] text-ink-3">{last.from === 'support' ? 'Support: ' : 'You: '}{last.body}</div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-ink-3">{PLATFORM_LABEL[t.platform]} · {fmt.ago(last.at)} · {t.messages.length} {t.messages.length === 1 ? 'message' : 'messages'}</div>
                  </div>
                  <Chip tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Chip>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function Thread({ ticket, onBack }: { ticket: Ticket; onBack: () => void }) {
  const api = useApi()
  const [reply, setReply] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [ticket.messages.length])
  const send = useAction((body: string) => api.replyTicket(ticket.id, body), { success: 'Reply sent', onSuccess: () => setReply('') })
  const submit = () => reply.trim() && send.mutate(reply.trim())
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Button size="icon" variant="ghost" aria-label="Back to your requests" onClick={onBack}><ArrowLeft size={16} /></Button>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[15px] font-semibold">{ticket.subject}</h3>
          <div className="font-mono text-[11px] text-ink-3">#{ticket.id.toUpperCase()} · {PLATFORM_LABEL[ticket.platform]}</div>
        </div>
        <Chip tone={STATUS[ticket.status].tone}>{STATUS[ticket.status].label}</Chip>
      </div>
      <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto text-[12.5px] scrollbar-thin">
        {ticket.messages.map((m, i) => (
          <div key={i} className={cn('max-w-[85%] whitespace-pre-line rounded-[10px] px-2.5 py-2', m.from === 'support' ? 'ml-auto bg-accent-soft' : 'bg-sunk')}>
            {m.from === 'support' && <b className="block text-[11px] text-accent-text">Support team</b>}
            {m.body}
            <div className="mt-1 font-mono text-[10px] text-ink-3">{fmt.dateTime(m.at)}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {ticket.status === 'closed' ? (
        <p className="text-[12px] text-ink-3">This request is closed. Replying reopens it.</p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Textarea aria-label="Your reply" rows={2} placeholder="Add your reply…" value={reply} onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }} />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-ink-3">Ctrl + Enter to send</span>
          <Button variant="dark" size="sm" icon={<Send size={12} />} disabled={!reply.trim()} loading={send.isPending} onClick={submit}>Send reply</Button>
        </div>
      </div>
    </Card>
  )
}
