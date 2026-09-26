import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu as MenuIcon, Search, X } from 'lucide-react'
import { fmt, PLANS } from '@frameline/shared'
import { cn, Kbd, LogoMark, Meter, Tip } from '@frameline/ui'
import { NAV } from './nav'
import { useUsage, useEvents } from '../lib/queries'
import { CommandPalette } from './CommandPalette'
import { UploadDock } from './UploadDock'

/**
 * Dark "espresso" sidebar + content. `collapsed` (icon-only) is used by the
 * full-bleed event workspace so photos get the room.
 */
function Sidebar({ collapsed, onSearch, onNavigate }: { collapsed?: boolean; onSearch: () => void; onNavigate?: () => void }) {
  const usage = useUsage().data
  const liveCount = useEvents().data?.filter((e) => e.status === 'live').length
  const plan = PLANS.find((p) => p.id === usage?.planId)
  return (
    <aside className={cn('flex h-full flex-col gap-px overflow-y-auto border-r border-side-line bg-side py-3.5 text-side-ink scrollbar-thin', collapsed ? 'w-[62px] items-center px-2' : 'w-[228px] px-2.5')}>
      <div className={cn('flex items-center gap-2.5 pb-3', collapsed ? 'justify-center' : 'px-1.5')}>
        <LogoMark />
        {!collapsed && <span className="font-display text-[18px] font-semibold">Frameline</span>}
      </div>
      {collapsed ? (
        <Tip label="Search (⌘K)" side="right">
          <button type="button" onClick={onSearch} className="mb-2 grid size-9 place-items-center rounded-control text-side-ink-2 hover:bg-side-2" aria-label="Search"><Search size={16} /></button>
        </Tip>
      ) : (
        <button type="button" onClick={onSearch} className="mb-2 flex items-center gap-2 rounded-control border border-side-line bg-side-2 px-2.5 py-1.5 text-[12.5px] text-side-ink-2 hover:text-side-ink">
          <Search size={14} /> Search or jump to…
          <Kbd className="ml-auto border-side-line text-side-ink-2">⌘K</Kbd>
        </button>
      )}
      {NAV.map((g, gi) => (
        <div key={gi} className={cn('flex flex-col gap-px', collapsed && 'items-center')}>
          {g.label && (collapsed ? <div className="h-2.5" /> : <div className="px-2 pb-1 pt-3 font-mono text-[9.5px] uppercase tracking-[.12em] text-[#7C7162]">{g.label}</div>)}
          {g.items.map((it) => {
            const link = (
              <NavLink
                key={it.to} to={it.to} end={it.to === '/'} onClick={onNavigate}
                className={({ isActive }) => cn(
                  'flex items-center gap-2.5 rounded-control text-[12.5px] font-semibold transition-colors',
                  collapsed ? 'size-9 justify-center' : 'px-2 py-[6px]',
                  isActive ? 'bg-[rgba(226,180,88,.13)] text-side-gold' : 'text-side-ink-2 hover:bg-side-2 hover:text-side-ink',
                )}
              >
                <it.icon size={15} strokeWidth={1.9} />
                {!collapsed && <span>{it.label}</span>}
                {!collapsed && it.to === '/events' && !!liveCount && <span className="ml-auto rounded bg-[rgba(226,180,88,.16)] px-1.5 font-mono text-[10px] text-side-gold">{liveCount} live</span>}
              </NavLink>
            )
            // Radix Slot can't merge NavLink's className function, so the tooltip wraps a span.
            return collapsed ? <Tip key={it.to} label={it.label} side="right"><span className="inline-flex">{link}</span></Tip> : link
          })}
        </div>
      ))}
      {!collapsed && usage && (
        <NavLink to="/plan" onClick={onNavigate} className="mt-auto block border-t border-side-line px-1.5 pt-3 text-[11.5px] text-side-ink-2 hover:text-side-ink">
          <div className="flex justify-between"><span>Photos this year</span><span className="font-mono">{fmt.pct(usage.photosUsed, usage.photosLimit)}%</span></div>
          <Meter value={usage.photosUsed} max={usage.photosLimit} height={5} className="my-1.5 bg-side-2" />
          <span className="font-mono">{fmt.count(usage.photosUsed)} / {fmt.count(usage.photosLimit)}</span> · {plan?.name}
        </NavLink>
      )}
    </aside>
  )
}

export function AppShell({ collapsed }: { collapsed?: boolean }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((v) => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => setMobileNav(false), [location.pathname])

  return (
    <div className="flex h-full min-h-0">
      <div className="hidden h-full shrink-0 md:block">
        <Sidebar collapsed={collapsed} onSearch={() => setPaletteOpen(true)} />
      </div>
      {mobileNav && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="h-full shadow-float"><Sidebar onSearch={() => { setMobileNav(false); setPaletteOpen(true) }} onNavigate={() => setMobileNav(false)} /></div>
          <button type="button" aria-label="Close menu" className="flex-1 bg-black/50" onClick={() => setMobileNav(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-side-line bg-side px-4 py-2.5 text-side-ink md:hidden" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
          <button type="button" aria-label="Open menu" onClick={() => setMobileNav(true)} className="rounded p-1 hover:bg-side-2">{mobileNav ? <X size={20} /> : <MenuIcon size={20} />}</button>
          <LogoMark size={24} />
          <span className="font-display text-[17px] font-semibold">Frameline</span>
          <button type="button" aria-label="Search" onClick={() => setPaletteOpen(true)} className="ml-auto rounded p-1 hover:bg-side-2"><Search size={18} /></button>
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <UploadDock />
    </div>
  )
}
