import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { CalendarDays, Plus, RefreshCcw, Search, Share2, Upload, UserPlus, Users, Zap } from 'lucide-react'
import { fmt, NEEDS_YOU_EXPIRY_DAYS, type PhotoEvent } from '@frameline/shared'
import { cn } from '@frameline/ui'
import { ALL_PAGES } from './nav'
import { useEvents } from '../lib/queries'

type Group = 'Events' | 'Actions' | 'Pages'
interface Cmd { id: string; group: Group; label: string; sub?: string; icon: ReactNode; to: string; keywords: string }

const statusWord = (e: PhotoEvent, days: number) =>
  e.status === 'archived' ? 'Archived' : e.status === 'draft' ? 'Draft' : e.status === 'uploading' ? 'Uploading'
    : days < 0 ? 'Expired' : days <= NEEDS_YOU_EXPIRY_DAYS ? (days === 0 ? 'Expires today' : `Expires in ${days} days`) : 'Live'

/**
 * Search (⌘K / Ctrl K, or the magnifier in the top bar): finds events, pages and common actions.
 * Results are grouped Events · Actions · Pages. Typing an event name also offers actions for it
 * (Renew, Share, Upload to, Guests of). Pages come from nav.ts, so new tools show up automatically.
 *
 * Deep links used here (owners must support them): /events?new=1, /events?f=trash, /?upload=1,
 * /plan?renew=<eventId>, /events/<id>?modal=share|upload, /events/<id>/guests, /settings/team?invite=1.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const events = useEvents().data
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const { base, perEvent } = useMemo(() => {
    const list = (events ?? []).filter((e) => !e.deletedAt)
    const now = Date.now()
    const days = (e: PhotoEvent) => fmt.daysUntil(e.expiresAt, now)
    const expiring = list.filter((e) => e.status !== 'archived' && days(e) <= NEEDS_YOU_EXPIRY_DAYS && days(e) >= -7)
    const eventCmds: Cmd[] = [...list].sort((a, b) => b.date.localeCompare(a.date)).map((e) => ({
      id: `ev-${e.id}`, group: 'Events', label: e.name, sub: [statusWord(e, days(e)), fmt.dayMonth(e.date), e.city].filter(Boolean).join(' · '),
      icon: <CalendarDays size={16} />, to: `/events/${e.id}`, keywords: `${e.shortId} ${e.city} ${e.type}`,
    }))
    const actions: Cmd[] = [
      { id: 'new-event', group: 'Actions', label: 'New event', icon: <Plus size={16} />, to: '/events?new=1', keywords: 'create add gallery' },
      { id: 'upload', group: 'Actions', label: 'Upload photos', sub: 'Choose the event next', icon: <Upload size={16} />, to: '/?upload=1', keywords: 'add photos' },
      ...expiring.map((e): Cmd => ({ id: `renew-${e.id}`, group: 'Actions', label: `Renew ${e.name}`, sub: statusWord(e, days(e)), icon: <Zap size={16} />, to: `/plan?renew=${e.id}`, keywords: `renew extend expire ${e.shortId}` })),
      { id: 'invite', group: 'Actions', label: 'Invite someone to your team', icon: <UserPlus size={16} />, to: '/settings/team?invite=1', keywords: 'team member add editor uploader second shooter' },
    ]
    const pages: Cmd[] = ALL_PAGES.map((p) => ({ id: `page-${p.to}`, group: 'Pages', label: p.label, sub: p.description, icon: <p.icon size={16} />, to: p.to, keywords: p.keywords ?? '' }))
    // Actions for one event, offered when the query matches it.
    const perEvent = (e: PhotoEvent): Cmd[] => [
      ...(expiring.includes(e) ? [] : e.status !== 'archived' && days(e) <= 60 ? [{ id: `renew-${e.id}`, group: 'Actions' as const, label: `Renew ${e.name}`, icon: <RefreshCcw size={16} />, to: `/plan?renew=${e.id}`, keywords: '' }] : []),
      { id: `share-${e.id}`, group: 'Actions', label: `Share ${e.name}`, icon: <Share2 size={16} />, to: `/events/${e.id}?modal=share`, keywords: '' },
      { id: `up-${e.id}`, group: 'Actions', label: `Upload to ${e.name}`, icon: <Upload size={16} />, to: `/events/${e.id}?modal=upload`, keywords: '' },
      { id: `guests-${e.id}`, group: 'Actions', label: `Guests of ${e.name}`, icon: <Users size={16} />, to: `/events/${e.id}/guests`, keywords: '' },
    ]
    return { base: { eventCmds, actions, pages, list }, perEvent }
  }, [events])

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return [...base.eventCmds.slice(0, 4), ...base.actions.slice(0, 5), ...base.pages.slice(0, 6)]
    const hit = (c: Cmd) => `${c.label} ${c.sub ?? ''} ${c.keywords}`.toLowerCase().includes(t)
    const ev = base.eventCmds.filter(hit).slice(0, 5)
    const matchedEvents = base.list.filter((e) => ev.some((c) => c.id === `ev-${e.id}`)).slice(0, 2)
    const acts = [...base.actions.filter(hit), ...matchedEvents.flatMap(perEvent)]
      .filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i).slice(0, 6)
    return [...ev, ...acts, ...base.pages.filter(hit).slice(0, 6)]
  }, [q, base, perEvent])

  useEffect(() => { setActive(0) }, [q])
  useEffect(() => { if (!open) setQ('') }, [open])
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])

  const run = (c?: Cmd) => { if (!c) return; onOpenChange(false); navigate(c.to) }
  let lastGroup: Group | null = null

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(18,14,9,.45)] animate-[fl-fade-in_150ms_ease-out]" />
        <Dialog.Content className="fixed inset-x-2 top-2 z-50 mx-auto flex max-h-[calc(100dvh-16px)] max-w-[600px] flex-col overflow-hidden rounded-modal bg-surface shadow-float outline-none animate-[fl-slide-up_160ms_ease-out] sm:top-[12vh] sm:max-h-[70vh]">
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Dialog.Description className="sr-only">Find events, pages and actions</Dialog.Description>
          <div className="flex h-[54px] shrink-0 items-center gap-2.5 border-b border-line px-4">
            <Search size={17} className="shrink-0 text-ink-3" aria-hidden />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, pages and actions"
              role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={results[active] ? `cmd-${active}` : undefined}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
                if (e.key === 'Enter') { e.preventDefault(); run(results[active]) }
              }}
            />
            <Dialog.Close className="shrink-0 rounded-md px-2 py-1 text-[12.5px] font-bold text-ink-2 hover:bg-sunk sm:hidden">Cancel</Dialog.Close>
          </div>
          <div ref={listRef} id="palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
            {results.length === 0 && (
              <div className="px-3 py-10 text-center text-[13.5px] text-ink-2">
                Nothing matches “{q}”. Try an event name, a city, or a page like “Watermark”.
              </div>
            )}
            {results.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null
              lastGroup = c.group
              return (
                <div key={c.id}>
                  {header && <div className="px-2.5 pb-1 pt-2 text-[12px] font-extrabold text-ink-3" role="presentation">{header}</div>}
                  <button type="button" id={`cmd-${i}`} data-i={i} role="option" aria-selected={i === active}
                    onMouseMove={() => setActive(i)} onClick={() => run(c)}
                    className={cn('flex w-full items-center gap-[11px] rounded-control px-2.5 py-2 text-left', i === active && 'bg-sunk')}>
                    <span className="shrink-0 text-ink-2">{c.icon}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px]">{c.label}</b>
                      {c.sub && <span className="block truncate text-[12px] text-ink-3">{c.sub}</span>}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
          <div className="hidden shrink-0 items-center gap-3.5 border-t border-line px-4 py-2.5 text-[12px] text-ink-3 sm:flex">
            <span>↑↓ move</span><span>↵ open</span><span>esc close</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
