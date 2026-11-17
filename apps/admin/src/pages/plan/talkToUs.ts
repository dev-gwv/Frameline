import { useServerFeatures } from '../../lib/api'
import { useAuth } from '../../lib/auth'

/**
 * Plans, photos and money are bought by talking to the team (owner, 17 Nov), the same way Studio AutoPilot sells
 * its plans: every buy button on the Plan page opens WhatsApp with the request already written, and the team sets
 * it up. Frameline's support number when the server has one (SUPPORT_WHATSAPP), else Studio AutoPilot's sales line.
 */
export const SALES_WHATSAPP = '919109192065'

export function useTalkToUs() {
  const { supportWhatsapp } = useServerFeatures()
  const { user } = useAuth()
  const digits = supportWhatsapp?.replace(/\D/g, '') || SALES_WHATSAPP
  const to = digits.length === 10 ? `91${digits}` : digits
  return (want: string) => {
    const text = [`Hi, I'd like ${want} for my Frameline studio.`, user ? `Login: ${user.email}` : null, 'Please call me.'].filter(Boolean).join('\n')
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }
}
