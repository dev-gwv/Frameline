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

/** "Message on WhatsApp" link: the studio's WhatsApp number (PublicStudio.whatsapp, else its phone). */
export const waLink = (studio: { whatsapp?: string; phone: string }, text: string) =>
  `https://wa.me/${(studio.whatsapp || studio.phone).replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`
