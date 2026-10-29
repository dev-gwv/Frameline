import { FEATURES, fmt, type PhotoEvent, type Studio } from '@frameline/shared'
import { appLink, galleryLink } from '../lib'

export const TEMPLATE_KEY = 'frameline.messageTemplate'
export const MAX_TEMPLATE = 2000
const ALL_VARIABLES = ['Event name', 'Event ID', 'Studio name', 'Web gallery link', 'App link', 'PIN', 'Expiry date'] as const
export type Variable = (typeof ALL_VARIABLES)[number]
/** Variables offered in the editor: no app link while there is no phone app (FEATURES.phoneApp). */
export const VARIABLES: readonly Variable[] = FEATURES.phoneApp ? ALL_VARIABLES : ALL_VARIABLES.filter((v) => v !== 'App link')

const APP_LINE = '\n\nPrefer the app? Use code {Event ID}.'
const WITH_APP = `Namaste! The photos from {Event name} are ready.\n\nOpen {Web gallery link} and enter PIN {PIN}.${APP_LINE}\n— {Studio name}`
export const DEFAULT_TEMPLATE = FEATURES.phoneApp ? WITH_APP : WITH_APP.replace(APP_LINE, '')

export function loadTemplate() {
  try {
    const saved = localStorage.getItem(TEMPLATE_KEY)
    // A template saved before the app line came out is the old default, not the studio's own words.
    return !saved || saved === WITH_APP ? DEFAULT_TEMPLATE : saved
  } catch { return DEFAULT_TEMPLATE }
}
export function saveTemplate(t: string) {
  try { localStorage.setItem(TEMPLATE_KEY, t); return true } catch { return false }
}

export function variableValues(event: PhotoEvent, studio?: Studio, short = event.settings.shortLinks): Record<Variable, string> {
  return {
    'Event name': event.name,
    'Event ID': event.shortId,
    'Studio name': studio?.name ?? 'your photographer',
    'Web gallery link': galleryLink(event, short),
    'App link': appLink(event),
    PIN: event.settings.pin,
    'Expiry date': fmt.date(event.expiresAt),
  }
}

export function fillTemplate(template: string, values: Record<Variable, string>) {
  return template.replace(/\{([^{}]+)\}/g, (m, name: string) => (name in values ? values[name as Variable] : m))
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
export const mailtoUrl = (subject: string, body: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
