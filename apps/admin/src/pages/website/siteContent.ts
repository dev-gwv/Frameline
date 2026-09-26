import type { Website } from '@frameline/shared'

/*
 * Website content the API doesn't model yet (services, testimonials, FAQ).
 * Shown in the preview so every section renders something real. See "Needs from lead".
 */
export const SERVICES = [
  { name: 'Wedding coverage', price: 'From ₹1,50,000', detail: '2 photographers, all functions, edited gallery in 3 weeks' },
  { name: 'Pre-wedding shoot', price: 'From ₹35,000', detail: 'Half day, 2 locations, 60 edited photos' },
  { name: 'Events & corporate', price: 'From ₹25,000 / day', detail: 'Live gallery with face search for every guest' },
]

export const TESTIMONIALS = [
  { quote: 'Our guests found their photos the same night. Nobody had to ask twice.', name: 'Riya & Kabir', event: 'Udaipur, 2026', tone: 0 },
  { quote: 'Calm, invisible, and the album made my parents cry (the good kind).', name: 'Aditi Kapoor', event: 'Delhi, 2026', tone: 6 },
]

export const FAQ = [
  { q: 'How long until we get our photos?', a: 'A preview gallery goes live within 48 hours. The full edited set follows in about 3 weeks.' },
  { q: 'Do you travel for weddings?', a: 'Yes, anywhere in India and abroad. Travel and stay are billed at cost.' },
  { q: 'Can guests download their own photos?', a: 'Yes. Guests take a selfie and see only the photos they are in.' },
]

export interface TemplateInfo {
  id: Website['template']
  label: string
  blurb: string
  /** Thumbnail colours for the template picker. */
  thumb: { bg: string; bar: string; hero: 'full' | 'split' | 'text' | 'dark' | 'grid' | 'mosaic' }
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'classic', label: 'Classic', blurb: 'Centred serif, cream paper', thumb: { bg: '#F6F1E7', bar: '#2B2419', hero: 'text' } },
  { id: 'editorial', label: 'Editorial', blurb: 'Full-bleed cover, magazine type', thumb: { bg: '#FFFFFF', bar: '#15120E', hero: 'full' } },
  { id: 'minimal', label: 'Minimal', blurb: 'White space, small sans type', thumb: { bg: '#FFFFFF', bar: '#9A9A9A', hero: 'split' } },
  { id: 'bold', label: 'Bold', blurb: 'Dark, big type, brand colour', thumb: { bg: '#15120E', bar: '#F2D38A', hero: 'dark' } },
  { id: 'showcase', label: 'Showcase', blurb: 'Photo grid first', thumb: { bg: '#F2F2F0', bar: '#222222', hero: 'grid' } },
  { id: 'portfolio', label: 'Portfolio', blurb: 'Side menu, mosaic of work', thumb: { bg: '#EFEAE2', bar: '#3A3128', hero: 'mosaic' } },
]

export interface SiteTheme {
  bg: string
  fg: string
  muted: string
  card: string
  line: string
  serif: boolean
  upperNav: boolean
  dark: boolean
}

/** Colours of each template. These are the photographer's site, not app UI, so they are fixed values. */
export const THEMES: Record<Website['template'], SiteTheme> = {
  classic: { bg: '#F6F1E7', fg: '#2B2419', muted: '#6F6353', card: '#FFFDF8', line: '#E3D9C6', serif: true, upperNav: false, dark: false },
  editorial: { bg: '#FFFFFF', fg: '#15120E', muted: '#5E5548', card: '#FAF7F0', line: '#EAE2D3', serif: true, upperNav: true, dark: false },
  minimal: { bg: '#FFFFFF', fg: '#1A1A1A', muted: '#7A7A7A', card: '#F7F7F7', line: '#ECECEC', serif: false, upperNav: false, dark: false },
  bold: { bg: '#121010', fg: '#F7F1E6', muted: '#B3A895', card: '#1D1916', line: '#2E2822', serif: false, upperNav: true, dark: true },
  showcase: { bg: '#F2F2F0', fg: '#222222', muted: '#666666', card: '#FFFFFF', line: '#E0E0DC', serif: false, upperNav: true, dark: false },
  portfolio: { bg: '#EFEAE2', fg: '#3A3128', muted: '#7B6F60', card: '#F8F4EE', line: '#DCD3C5', serif: true, upperNav: false, dark: false },
}
