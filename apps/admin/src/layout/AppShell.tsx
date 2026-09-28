import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, CircleHelp, LogOut, Search } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Avatar, BottomSheet, LogoMark, Menu, Tip, cn, type MenuItem } from '@frameline/ui'
import { useAuth } from '../lib/auth'
import { useStudio, useUsage } from '../lib/queries'
import { CommandPalette } from './CommandPalette'
import { ACCOUNT_NAV, MORE_NAV, PHONE_MORE_NAV, PHONE_TABS, PRIMARY_NAV, isActive, isMorePage, uploadTarget } from './nav'
import { UploadDock } from './UploadDock'

const ROLE = { owner: 'Owner', editor: 'Editor', uploader: 'Uploader' } as const

/**
 * The admin shell (redesign v2): a white 56px top bar (Home · Events · Sell photos · More ▾, then search,
 * photos used, Help and the account menu) over the page. On phones (<768px): a compact top bar and a
 * bottom tab bar (Home · Events · Sell · More); More opens a sheet with the tools and account links.
 * Pages scroll with the window and should use `Page` / `PageBody` from @frameline/ui for the 1200px column.
 */
export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [moreSheet, setMoreSheet] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((v) => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => setMoreSheet(false), [location.pathname])

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:shadow-float">Skip to content</a>
      <TopBar onSearch={() => setPaletteOpen(true)} />
      <main id="main" className="flex min-w-0 flex-1 flex-col pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>
      <PhoneTabs onMore={() => setMoreSheet(true)} moreOpen={moreSheet} />
      <MoreSheet open={moreSheet} onOpenChange={setMoreSheet} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <UploadDock />
    </div>
  )
}

/* ---------------- Top bar ---------------- */
function TopBar({ onSearch }: { onSearch: () => void }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
      <div className="flex h-[52px] items-center gap-1 px-4 md:h-14 lg:px-7">
        <Link to="/" className="mr-4 flex shrink-0 items-center gap-[9px] font-display text-[17px] font-semibold md:mr-6 md:text-[18px]" aria-label="Frameline home">
          <LogoMark size={26} />
          <span>Frameline</span>
        </Link>
        <nav aria-label="Main" className="hidden h-full items-stretch md:flex">
          {PRIMARY_NAV.map((it) => <TopLink key={it.to} to={it.to} active={isActive(it, pathname)}>{it.label}</TopLink>)}
          <Menu
            align="start" width={600} columns={2}
            items={MORE_NAV.map((it): MenuItem => ({ label: it.label, description: it.description, icon: <it.icon size={17} />, onSelect: () => navigate(it.to) }))}
            trigger={
              <button type="button" className={topLinkCls(isMorePage(pathname))}>
                More <ChevronDown size={14} aria-hidden />
              </button>
            }
          />
        </nav>
        <div className="ml-auto flex items-center gap-1.5 md:gap-3">
          <Tip label="Search (⌘K)">
            <button type="button" onClick={onSearch} aria-label="Search" aria-keyshortcuts="Control+K Meta+K"
              className="grid size-10 place-items-center rounded-control text-ink-2 hover:bg-sunk hover:text-ink md:size-8">
              <Search size={18} />
            </button>
          </Tip>
          <PhotosPill />
          <Tip label="Help and support">
            <Link to="/support" aria-label="Help and support" className="hidden size-8 place-items-center rounded-control text-ink-2 hover:bg-sunk hover:text-ink md:grid">
              <CircleHelp size={19} />
            </Link>
          </Tip>
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}

const topLinkCls = (active: boolean) => cn(
  'relative flex items-center gap-1.5 px-[13px] text-[14px] font-bold outline-offset-[-2px] transition-colors',
  active ? 'text-ink after:absolute after:inset-x-[13px] after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent' : 'text-ink-2 hover:text-ink',
)
function TopLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return <NavLink to={to} end={to === '/'} className={topLinkCls(active)} aria-current={active ? 'page' : undefined}>{children}</NavLink>
}

/** "12,480 of 50,000 photos" with a small meter; opens Plan and billing. */
function PhotosPill() {
  const usage = useUsage().data
  if (!usage) return <span className="hidden h-[30px] w-[210px] rounded-full bg-sunk lg:block" aria-hidden />
  const pct = fmt.pct(usage.photosUsed, usage.photosLimit)
  return (
    <Link to="/plan" className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-[5px] text-[12px] font-bold text-ink-2 hover:border-line-2 hover:text-ink lg:inline-flex"
      aria-label={`${fmt.count(usage.photosUsed)} of ${fmt.count(usage.photosLimit)} photos used. Open plan and billing`}>
      <span className="h-[5px] w-[46px] overflow-hidden rounded-full bg-sunk" aria-hidden>
        <i className={cn('block h-full rounded-full', pct >= 90 ? 'bg-warn' : 'bg-accent')} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="tnum">{fmt.count(usage.photosUsed)} of {fmt.count(usage.photosLimit)} photos</span>
    </Link>
  )
}

function useSignOut() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return async () => { await signOut(); navigate('/login', { replace: true }) }
}

function AccountMenu() {
  const { user } = useAuth()
  const studio = useStudio().data
  const navigate = useNavigate()
  const signOut = useSignOut()
  const name = user?.name ?? 'You'
  return (
    <Menu
      width={290}
      header={
        <div>
          <b className="block text-[13.5px]">{studio?.name ?? 'Your studio'}</b>
          <span className="block truncate text-[12px] text-ink-3">{user?.email}{user ? ` · ${ROLE[user.role]}` : ''}</span>
        </div>
      }
      items={[
        ...ACCOUNT_NAV.map((it): MenuItem => ({ label: it.label, icon: <it.icon size={16} />, onSelect: () => navigate(it.to) })),
        'separator',
        { label: 'Sign out', icon: <LogOut size={16} />, onSelect: () => void signOut() },
      ]}
      trigger={
        <button type="button" aria-label={`Account: ${name}`} className="rounded-full outline-offset-2 max-md:grid max-md:size-10 max-md:place-items-center">
          <Avatar name={name} />
        </button>
      }
    />
  )
}

/* ---------------- Phone ---------------- */
function PhoneTabs({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const inMore = moreOpen || (!PHONE_TABS.some((t) => t.to && isActive(t, pathname)))
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {PHONE_TABS.map((t) => {
        const on = t.to ? isActive(t, pathname) && !moreOpen : t.action === 'more' && inMore
        const inner = <><t.icon size={20} aria-hidden /><span>{t.label}</span></>
        const cls = cn('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-bold', on ? 'text-accent-text' : 'text-ink-3')
        return t.to
          ? <NavLink key={t.label} to={t.to} end={t.to === '/'} className={cls} aria-current={on ? 'page' : undefined}>{inner}</NavLink>
          : t.action === 'upload'
            ? <button key={t.label} type="button" className={cls} onClick={() => navigate(uploadTarget(pathname, search))} aria-haspopup="dialog">{inner}</button>
            : <button key={t.label} type="button" className={cls} onClick={onMore} aria-haspopup="dialog" aria-expanded={moreOpen}>{inner}</button>
      })}
    </nav>
  )
}

function MoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth()
  const studio = useStudio().data
  const signOut = useSignOut()
  const row = 'flex min-h-[48px] items-center gap-3 rounded-control px-2 text-[14px] font-bold hover:bg-sunk'
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="More">
      <h2 className="px-2 pb-2 pt-1 font-sans text-[16px] font-extrabold">More</h2>
      <div className="grid grid-cols-2 gap-1">
        {PHONE_MORE_NAV.map((it) => (
          <Link key={it.to} to={it.to} onClick={() => onOpenChange(false)} className="flex min-h-[64px] items-start gap-2.5 rounded-control p-2 hover:bg-sunk">
            <span className="mt-0.5 text-ink-2"><it.icon size={18} /></span>
            <span className="min-w-0">
              <b className="block text-[13.5px] leading-tight">{it.label}</b>
              <span className="block text-[11.5px] leading-snug text-ink-3">{it.description}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="my-2 h-px bg-line" />
      <div className="px-2 py-1.5">
        <b className="block text-[13.5px]">{studio?.name ?? 'Your studio'}</b>
        <span className="block truncate text-[12px] text-ink-3">{user?.email}{user ? ` · ${ROLE[user.role]}` : ''}</span>
      </div>
      {ACCOUNT_NAV.filter((it) => it.to !== '/settings/team').map((it) => (
        <Link key={it.to} to={it.to} onClick={() => onOpenChange(false)} className={row}><it.icon size={18} className="text-ink-2" />{it.label}</Link>
      ))}
      <button type="button" onClick={() => { onOpenChange(false); void signOut() }} className={cn(row, 'w-full text-left')}><LogOut size={18} className="text-ink-2" />Sign out</button>
    </BottomSheet>
  )
}
