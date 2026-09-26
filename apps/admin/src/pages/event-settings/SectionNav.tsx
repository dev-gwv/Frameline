import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@frameline/ui'

export const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'access', label: 'Access' },
  { id: 'faces', label: 'Faces' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'guest-uploads', label: 'Guest uploads' },
  { id: 'watermark', label: 'Watermark' },
  { id: 'branding', label: 'Branding' },
  { id: 'store', label: 'Store' },
  { id: 'hosts', label: 'Hosts' },
  { id: 'website', label: 'Website & leads' },
  { id: 'danger', label: 'Danger zone' },
] as const
export type SectionId = (typeof SECTIONS)[number]['id']

export const sectionDomId = (id: SectionId) => `settings-${id}`

/** The app shell scrolls <main>, not the window. */
const scrollRoot = () => document.querySelector('main')

/** Tracks which section is in view inside the shell's scroll container. */
export function useScrollSpy(ready: boolean) {
  const [active, setActive] = useState<SectionId>('general')
  const lockUntil = useRef(0)

  useEffect(() => {
    if (!ready) return
    const root = scrollRoot()
    const visible = new Map<string, boolean>()
    const pick = () => {
      if (Date.now() < lockUntil.current) return
      if (root && root.scrollTop + root.clientHeight >= root.scrollHeight - 4) { setActive(SECTIONS[SECTIONS.length - 1].id); return }
      const first = SECTIONS.find((s) => visible.get(sectionDomId(s.id)))
      if (first) setActive(first.id)
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((en) => visible.set(en.target.id, en.isIntersecting))
      pick()
    }, { root, rootMargin: '-12% 0px -62% 0px' })
    SECTIONS.forEach((s) => { const el = document.getElementById(sectionDomId(s.id)); if (el) obs.observe(el) })
    root?.addEventListener('scroll', pick, { passive: true })
    return () => { obs.disconnect(); root?.removeEventListener('scroll', pick) }
  }, [ready])

  const jump = useCallback((id: SectionId) => {
    lockUntil.current = Date.now() + 700
    setActive(id)
    document.getElementById(sectionDomId(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return { active, jump }
}

/** Vertical sticky list on wide screens. */
export function SectionNavDesktop({ active, onJump }: { active: SectionId; onJump: (id: SectionId) => void }) {
  return (
    <nav aria-label="Settings sections" className="sticky top-6 hidden flex-col gap-px self-start xl:flex">
      {SECTIONS.map((s) => (
        <button
          key={s.id} type="button" onClick={() => onJump(s.id)} aria-current={active === s.id ? 'true' : undefined}
          className={cn('rounded-[7px] px-2.5 py-1.5 text-left text-[13px] font-bold transition-colors',
            active === s.id ? 'bg-accent-soft text-accent-text' : 'text-ink-2 hover:bg-sunk hover:text-ink',
            s.id === 'danger' && active !== s.id && 'text-bad')}
        >
          {s.label}
        </button>
      ))}
    </nav>
  )
}

/** Horizontal chip row that sticks to the top on phones and tablets. */
export function SectionNavMobile({ active, onJump }: { active: SectionId; onJump: (id: SectionId) => void }) {
  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const row = rowRef.current
    const chip = row?.querySelector<HTMLElement>(`[data-id="${active}"]`)
    if (row && chip) row.scrollTo({ left: chip.offsetLeft - 16, behavior: 'smooth' })
  }, [active])
  return (
    <nav aria-label="Settings sections" className="sticky top-0 z-10 mb-3 border-b border-line bg-paper xl:hidden">
      <div ref={rowRef} className="flex gap-1.5 overflow-x-auto px-4 py-2 scrollbar-thin sm:px-7">
        {SECTIONS.map((s) => (
          <button
            key={s.id} data-id={s.id} type="button" onClick={() => onJump(s.id)} aria-current={active === s.id ? 'true' : undefined}
            className={cn('shrink-0 rounded-full border px-3 py-1 text-[12px] font-bold transition-colors',
              active === s.id ? 'border-transparent bg-accent-soft text-accent-text' : 'border-line bg-surface text-ink-2')}
          >
            {s.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
