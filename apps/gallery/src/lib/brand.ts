import { useEffect } from 'react'
import { inkOn } from './access'

/** Applies the studio brand colour (used by .bg-brand / .text-brand) to the page and to portalled sheets. */
export function useBrandColor(color: string | undefined) {
  useEffect(() => {
    if (!color) return
    const root = document.documentElement
    root.style.setProperty('--brand', color)
    root.style.setProperty('--brand-ink', inkOn(color))
  }, [color])
}

/** A number as wa.me wants it: digits with the country code (Indian 10-digit and 0-prefixed numbers get 91). */
function waNumber(n: string) {
  const d = n.replace(/\D/g, '')
  return d.length === 10 ? `91${d}` : d.length === 11 && d.startsWith('0') ? `91${d.slice(1)}` : d
}

/**
 * "Message on WhatsApp" link: the studio's WhatsApp number (PublicStudio.whatsapp, else its phone). Undefined when
 * the studio gave no number (it's optional at sign-up): show no WhatsApp button then.
 */
export function waLink(studio: { whatsapp?: string; phone: string }, text: string): string | undefined {
  const n = waNumber(studio.whatsapp || studio.phone || '')
  return n.length >= 10 ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : undefined
}

/** "Call the studio" link, or undefined when the studio gave no phone number. */
export function telLink(studio: { phone: string }): string | undefined {
  const n = (studio.phone || '').replace(/[^\d+]/g, '')
  return n.replace(/\D/g, '').length >= 10 ? `tel:${n}` : undefined
}
