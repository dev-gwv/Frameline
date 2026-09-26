import {
  BarChart3, CalendarDays, Camera, CreditCard, Droplet, Globe, House, LifeBuoy, Megaphone, QrCode, Receipt, Settings2,
  ShoppingBag, Smartphone, WandSparkles, type LucideIcon,
} from 'lucide-react'

export interface NavItem { to: string; label: string; icon: LucideIcon; keywords?: string }
export interface NavGroup { label?: string; items: NavItem[] }

/** Sidebar structure; mirrors the "Screens" design (Work · Business · Grow · Tools · Account). */
export const NAV: NavGroup[] = [
  { items: [
    { to: '/', label: 'Home', icon: House, keywords: 'dashboard overview' },
    { to: '/events', label: 'Events', icon: CalendarDays, keywords: 'galleries albums' },
  ] },
  { label: 'Business', items: [
    { to: '/store', label: 'Store', icon: ShoppingBag, keywords: 'sell photos prices' },
    { to: '/wallet', label: 'Orders & wallet', icon: Receipt, keywords: 'ledger payout invoices' },
    { to: '/reports', label: 'Reports', icon: BarChart3, keywords: 'usage events csv' },
  ] },
  { label: 'Grow', items: [
    { to: '/website', label: 'Website', icon: Globe, keywords: 'site domain enquiries' },
    { to: '/studio-app', label: 'Studio app', icon: Smartphone, keywords: 'follow code featured' },
    { to: '/qr', label: 'Smart QR', icon: QrCode, keywords: 'common qr poster' },
    { to: '/broadcasts', label: 'Broadcasts', icon: Megaphone, keywords: 'posts push notifications' },
  ] },
  { label: 'Tools', items: [
    { to: '/watermarks', label: 'Watermarks', icon: Droplet, keywords: 'logo text' },
    { to: '/camera-sync', label: 'Camera sync', icon: Camera, keywords: 'ftp live' },
    { to: '/enhance', label: 'AI enhance', icon: WandSparkles, keywords: 'retouch edit' },
  ] },
  { label: 'Account', items: [
    { to: '/plan', label: 'Plan & usage', icon: CreditCard, keywords: 'subscription credits packs renew' },
    { to: '/support', label: 'Support', icon: LifeBuoy, keywords: 'help ticket' },
    { to: '/settings', label: 'Settings', icon: Settings2, keywords: 'team notifications billing password profile' },
  ] },
]
