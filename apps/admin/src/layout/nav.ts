import {
  BarChart3, CalendarDays, Camera, CreditCard, Droplet, House, LayoutGrid, LifeBuoy, Megaphone, QrCode, Settings2, ShoppingBag,
  Smartphone, Trash2, Upload, UserRound, Users, WandSparkles, type LucideIcon,
} from 'lucide-react'

/**
 * Admin navigation (redesign v2). Top bar: PRIMARY_NAV + "More ▾" (MORE_NAV). Avatar menu: ACCOUNT_NAV.
 * Phone: PHONE_TABS at the bottom (Home · Events · Upload · More); "More" opens a sheet with Sell photos + MORE_NAV + ACCOUNT_NAV.
 * The ⌘K command palette searches all of these plus EXTRA_PAGES. Add a new tool to MORE_NAV (never a 4th top link).
 */
export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** One line under the name in the More menu / search results. */
  description?: string
  /** Extra words the command palette matches on. */
  keywords?: string
  /** Path prefixes that also mark this item active (e.g. /events/… for Events). */
  match?: string[]
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: House, description: 'Needs you, your events', keywords: 'dashboard overview start' },
  { to: '/events', label: 'Events', icon: CalendarDays, description: 'Every event and gallery', keywords: 'galleries albums photos', match: ['/events'] },
  { to: '/sell', label: 'Sell photos', icon: ShoppingBag, description: 'Orders, prices, wallet and payouts', keywords: 'store orders wallet payouts withdraw prices refund', match: ['/sell'] },
]

export const MORE_NAV: NavItem[] = [
  { to: '/watermark', label: 'Watermark', icon: Droplet, description: 'Your name or logo on photos', keywords: 'logo text copyright' },
  { to: '/camera-sync', label: 'Camera sync', icon: Camera, description: 'Photos from your camera while you shoot', keywords: 'ftp live tether wifi' },
  { to: '/qr', label: 'Smart QR', icon: QrCode, description: 'One printed QR code for every event', keywords: 'poster print scan' },
  { to: '/messages', label: 'Messages to guests', icon: Megaphone, description: 'Send news to people who follow you', keywords: 'broadcast push notification announce' },
  { to: '/enhance', label: 'AI enhance', icon: WandSparkles, description: 'Retouch one photo at a time', keywords: 'retouch edit ai improve', match: ['/enhance'] },
  { to: '/studio-app', label: 'Your studio app', icon: Smartphone, description: 'Follow code and featured galleries', keywords: 'follow code featured app profile' },
  { to: '/reports', label: 'Reports', icon: BarChart3, description: 'Events, usage and downloads', keywords: 'csv export usage statistics' },
  { to: '/settings/team', label: 'Team', icon: Users, description: 'Invite a second shooter or editor', keywords: 'members invite roles seats' },
]

export const ACCOUNT_NAV: NavItem[] = [
  { to: '/settings/profile', label: 'Studio profile', icon: UserRound, keywords: 'name logo brand contact' },
  { to: '/settings/team', label: 'Team', icon: Users, keywords: 'members invite roles' },
  { to: '/plan', label: 'Plan and billing', icon: CreditCard, keywords: 'subscription wallet add money renew packs invoices upgrade' },
  { to: '/settings', label: 'Settings', icon: Settings2, keywords: 'notifications security password billing gst invoices' },
  { to: '/support', label: 'Help and support', icon: LifeBuoy, keywords: 'help ticket whatsapp contact' },
]

/** Pages only reachable from inside other pages, listed so search can jump to them. */
export const EXTRA_PAGES: NavItem[] = [
  { to: '/events?f=trash', label: 'Recently deleted', icon: Trash2, description: 'Restore deleted events', keywords: 'trash bin restore' },
  { to: '/sell/settings/business', label: 'Selling settings', icon: Settings2, description: 'Business details, payout account, prices, terms', keywords: 'kyc pan gst bank payout terms abroad' },
  { to: '/settings/notifications', label: 'Notifications', icon: Settings2, description: 'Emails you get from Frameline', keywords: 'email alerts' },
  { to: '/settings/billing', label: 'Billing and GST', icon: CreditCard, description: 'Details printed on your invoices', keywords: 'gstin address invoice' },
  { to: '/settings/security', label: 'Security', icon: Settings2, description: 'Password and signed-in devices', keywords: 'password sessions sign out devices' },
]

/**
 * Phone bottom tabs (<768px), from the approved spec: Home · Events · Upload · More.
 * `action: 'upload'` opens the upload picker (`/?upload=1`), or inside an event that event's upload modal;
 * `action: 'more'` opens the More sheet (Sell photos is its first item).
 */
export const PHONE_TABS: { to: string | null; label: string; icon: LucideIcon; match?: string[]; action?: 'upload' | 'more' }[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/events', label: 'Events', icon: CalendarDays, match: ['/events'] },
  { to: null, label: 'Upload', icon: Upload, action: 'upload' },
  { to: null, label: 'More', icon: LayoutGrid, action: 'more' },
]

/** The More sheet's tools on a phone: Sell photos first (it has no bottom tab), then the More menu. */
export const PHONE_MORE_NAV: NavItem[] = [PRIMARY_NAV[2], ...MORE_NAV]

/** Where the phone Upload tab goes: the open event's upload modal, else the upload picker on Home. */
export function uploadTarget(pathname: string, search: string): string {
  const m = /^\/events\/([^/]+)/.exec(pathname)
  if (m && m[1] !== 'new') {
    const q = new URLSearchParams(search)
    q.set('modal', 'upload')
    // The photo viewer has no modals: go back to the event's Photos tab.
    const base = /^\/events\/[^/]+\/photos\//.test(pathname) ? `/events/${m[1]}` : pathname
    return `${base}?${q}`
  }
  return '/?upload=1'
}

/** Every page the palette can open, de-duplicated by path. */
export const ALL_PAGES: NavItem[] = [...PRIMARY_NAV, ...MORE_NAV, ...ACCOUNT_NAV, ...EXTRA_PAGES]
  .filter((it, i, all) => all.findIndex((x) => x.to === it.to) === i)

/** True when `pathname` belongs to this nav item. */
export function isActive(item: { to: string | null; match?: string[] }, pathname: string) {
  if (item.to === '/') return pathname === '/'
  if (item.match?.some((m) => pathname === m || pathname.startsWith(`${m}/`))) return true
  return !!item.to && (pathname === item.to || pathname.startsWith(`${item.to}/`))
}

/** True when the current page is one of the More tools (the "More" link then shows the gold underline). */
export const isMorePage = (pathname: string) => MORE_NAV.some((it) => it.to !== '/settings/team' && isActive(it, pathname))
