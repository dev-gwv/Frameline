import { fmt, type PhotoEvent, type Studio } from '@frameline/shared'
import { appLink, galleryLink, https } from '../lib'

export const TEMPLATE_KEY = 'frameline.messageTemplate'
export const MAX_TEMPLATE = 2000
export const VARIABLES = ['Event name', 'Event ID', 'Studio name', 'Web gallery link', 'App link', 'PIN', 'Expiry date'] as const
export type Variable = (typeof VARIABLES)[number]

export const DEFAULT_TEMPLATE =
  'Namaste! The photos from {Event name} are ready.\n\nOpen {Web gallery link} and enter PIN {PIN}, then take a selfie to find yourself.\n\nPrefer the app? Use code {Event ID}.\n— {Studio name}'

export function loadTemplate() {
  try { return localStorage.getItem(TEMPLATE_KEY) || DEFAULT_TEMPLATE } catch { return DEFAULT_TEMPLATE }
}
export function saveTemplate(t: string) {
  try { localStorage.setItem(TEMPLATE_KEY, t); return true } catch { return false }
}

export function variableValues(event: PhotoEvent, studio?: Studio, short = event.settings.shortLinks): Record<Variable, string> {
  return {
    'Event name': event.name,
    'Event ID': event.shortId,
    'Studio name': studio?.name ?? 'your photographer',
    'Web gallery link': https(galleryLink(event, short)),
    'App link': https(appLink(event)),
    PIN: event.settings.pin,
    'Expiry date': fmt.date(event.expiresAt),
  }
}

export function fillTemplate(template: string, values: Record<Variable, string>) {
  return template.replace(/\{([^{}]+)\}/g, (m, name: string) => (name in values ? values[name as Variable] : m))
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
export const mailtoUrl = (subject: string, body: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
