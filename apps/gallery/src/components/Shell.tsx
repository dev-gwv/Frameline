import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Home, ScanFace, Share2, ShoppingBag } from 'lucide-react'
import { Button, cn, LogoMark, useToast } from '@frameline/ui'
import type { PublicEvent } from '@frameline/shared'
import { Container, OfflineBanner } from './common'

export type TabId = 'event' | 'me' | 'fav' | 'orders'

interface Tab { id: TabId; label: string; to: string; icon: ReactNode }

/** Event · My photos · Favourites · Orders. My photos needs face search; Orders only while the gallery sells photos. */
export function eventTabs(event: PublicEvent, base: string): Tab[] {
  const tabs: Tab[] = [{ id: 'event', label: 'Event', to: base, icon: <Home size={20} /> }]
  if (event.settings.faceSearch) tabs.push({ id: 'me', label: 'My photos', to: `${base}/me`, icon: <ScanFace size={20} /> })
  tabs.push({ id: 'fav', label: 'Favourites', to: `${base}/favourites`, icon: <Heart size={20} /> })
  if (event.settings.storeEnabled) tabs.push({ id: 'orders', label: 'Orders', to: `${base}/orders`, icon: <ShoppingBag size={20} /> })
  return tabs
}

export function useShareGallery(event: PublicEvent, base: string) {
  const { toast } = useToast()
  return async () => {
    const url = `${location.origin}${base}`
    try {
      if (navigator.share) await navigator.share({ title: event.name, text: `Photos from ${event.name}`, url })
      else { await navigator.clipboard.writeText(url); toast({ title: 'Link copied', body: 'Guests still need the gallery PIN if it has one.' }) }
    } catch { /* share sheet dismissed */ }
  }
}

/**
 * Frame for the event's main screens. Phones: page + bottom tab bar (44px+ targets). Desktop: a white top bar
 * with the studio name, the same four places as links, and Share.
 */
export function EventShell({ event, base, tab, children, offline }: { event: PublicEvent; base: string; tab?: TabId; children: ReactNode; offline?: boolean }) {
  const tabs = eventTabs(event, base)
  const share = useShareGallery(event, base)
  return (
    <div className="min-h-dvh bg-paper pb-tabs">
      <header className="sticky top-0 z-30 hidden border-b border-line bg-surface md:block">
        <Container className="flex h-14 items-center gap-2">
          <Link to={`/studio/${event.studio.followCode.toLowerCase()}`} className="mr-4 flex min-w-0 items-center gap-2 text-[14.5px] font-extrabold hover:underline">
            <LogoMark size={24} /><span className="truncate">{event.studio.name}</span>
          </Link>
          <nav aria-label="Gallery" className="flex h-full items-stretch">
            {tabs.map((t) => (
              <Link key={t.id} to={t.to} aria-current={t.id === tab ? 'page' : undefined}
                className={cn('relative flex items-center gap-2 px-3.5 text-[14px] font-bold transition-colors',
                  t.id === tab ? 'text-ink after:absolute after:inset-x-3.5 after:-bottom-px after:h-0.5 after:rounded after:bg-accent' : 'text-ink-2 hover:text-ink')}>
                <span className={t.id === tab ? 'text-accent-text' : undefined}>{t.icon}</span>{t.label}
              </Link>
            ))}
          </nav>
          <span className="flex-1" />
          <Button icon={<Share2 size={15} />} onClick={() => void share()}>Share</Button>
        </Container>
      </header>
      <OfflineBanner forced={offline} />
      {children}
      <nav aria-label="Gallery" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map((t) => {
            const on = t.id === tab
            return (
              <li key={t.id}>
                <Link to={t.to} aria-current={on ? 'page' : undefined}
                  className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-bold', on ? 'text-accent-text' : 'text-ink-3 hover:text-ink-2')}>
                  {t.icon}{t.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
