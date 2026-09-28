import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@frameline/ui'

export interface SideItem { id: string; label: ReactNode; to: string; /** Small status after the label (e.g. a red dot for errors). */ badge?: ReactNode }

/**
 * Settings pattern shared by account Settings and Selling settings: a left list (200px) and the chosen
 * section on the right. On phones the list becomes a row of pills that scrolls sideways.
 */
export function SideList({ items, value, children, label }: { items: SideItem[]; value: string; children: ReactNode; label: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)] md:gap-[22px]">
      <nav aria-label={label} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0">
        {items.map((it) => {
          const on = it.id === value
          return (
            <Link key={it.id} to={it.to} replace aria-current={on ? 'page' : undefined}
              className={cn(
                'flex min-h-[40px] shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-control px-3 text-[13.5px] transition md:min-h-[36px] md:px-2.5',
                'max-md:rounded-full max-md:border',
                on ? 'bg-accent-soft font-extrabold text-accent-text max-md:border-accent' : 'font-semibold text-ink-2 hover:bg-sunk hover:text-ink max-md:border-line-2 max-md:bg-surface',
              )}>
              {it.label}
              {it.badge}
            </Link>
          )
        })}
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Section heading inside a settings panel: 16px bold title + one line. */
export function SectionTitle({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-sans text-[16px] font-extrabold">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}
