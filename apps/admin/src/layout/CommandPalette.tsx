import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { CalendarDays, CornerDownLeft, Plus, Search } from 'lucide-react'
import { cn, Kbd } from '@frameline/ui'
import { NAV } from './nav'
import { useEvents } from '../lib/queries'

interface Cmd { id: string; label: string; hint?: string; icon: React.ReactNode; run: () => void; keywords: string }

/** ⌘K: jump to any page or event, or start common actions. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const events = useEvents().data ?? []
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const cmds = useMemo<Cmd[]>(() => {
    const go = (to: string) => () => { navigate(to); onOpenChange(false) }
    return [
      { id: 'new-event', label: 'New event', hint: 'Action', icon: <Plus size={15} />, run: go('/events?new=1'), keywords: 'create add' },
      ...events.map((e) => ({ id: e.id, label: e.name, hint: `${e.shortId} · ${e.city}`, icon: <CalendarDays size={15} />, run: go(`/events/${e.id}`), keywords: `${e.shortId} ${e.city} event` })),
      ...NAV.flatMap((g) => g.items.map((it) => ({ id: it.to, label: it.label, hint: 'Page', icon: <it.icon size={15} />, run: go(it.to), keywords: it.keywords ?? '' }))),
    ]
  }, [events, navigate, onOpenChange])

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return cmds.slice(0, 12)
    return cmds.filter((c) => `${c.label} ${c.hint ?? ''} ${c.keywords}`.toLowerCase().includes(t)).slice(0, 12)
  }, [q, cmds])

  useEffect(() => { setActive(0) }, [q])
  useEffect(() => { if (!open) setQ('') }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(12,10,8,.55)]" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-modal border border-line bg-surface shadow-card outline-none animate-[fl-slide-up_160ms_ease-out]">
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Dialog.Description className="sr-only">Jump to a page or event</Dialog.Description>
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <Search size={16} className="text-ink-3" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, pages and actions"
              className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
                if (e.key === 'Enter') results[active]?.run()
              }}
            />
            <Kbd>Esc</Kbd>
          </div>
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5 scrollbar-thin">
            {results.length === 0 && <div className="px-3 py-8 text-center text-[13px] text-ink-3">Nothing matches “{q}”.</div>}
            {results.map((c, i) => (
              <button key={c.id} type="button" onMouseEnter={() => setActive(i)} onClick={c.run}
                className={cn('flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[13px] font-semibold', i === active ? 'bg-accent-soft text-accent-text' : 'text-ink')}>
                <span className={i === active ? 'text-accent-text' : 'text-ink-2'}>{c.icon}</span>
                <span className="flex-1 truncate">{c.label}</span>
                {c.hint && <span className="text-[11.5px] font-medium text-ink-3">{c.hint}</span>}
                {i === active && <CornerDownLeft size={13} />}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
