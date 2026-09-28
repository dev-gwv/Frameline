import { ChevronLeft } from 'lucide-react'
import type { Album, PhotoEvent } from '@frameline/shared'
import { Modal, TabBar } from '@frameline/ui'
import { useStudio } from '../../../lib/queries'
import { useLinkTab } from './LinkTab'
import { useMessageTab } from './MessageTab'
import { useQRTab } from './QRTab'
import { SpecialLinks } from './SpecialLinks'

export type ShareTab = 'link' | 'qr' | 'message' | 'special'
/** `personal` is the old name of the special links view (still used by older deep links). */
export const parseShareTab = (v: string | null): ShareTab => (v === 'qr' || v === 'message' || v === 'special' ? v : v === 'personal' ? 'special' : 'link')

/**
 * ?modal=share&tab=link|qr|message|special — the three things everyone does (copy the link, show the QR,
 * send the message), plus "Special links" one click deeper (one album, one person, family / VIP).
 */
export function ShareModal({ open, onOpenChange, event, albums, tab, onTab }: {
  open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent; albums: Album[]; tab: ShareTab; onTab: (t: ShareTab) => void
}) {
  const studio = useStudio().data
  const link = useLinkTab(event, studio, () => onTab('special'))
  const qr = useQRTab(event, studio)
  const message = useMessageTab(event, studio)

  if (tab === 'special') {
    return (
      <Modal open={open} onOpenChange={onOpenChange} width={640} title="Special links"
        description={<button type="button" onClick={() => onTab('link')} className="inline-flex min-h-[28px] items-center gap-1 font-bold text-accent-text hover:underline"><ChevronLeft size={14} />Back to sharing</button>}>
        <SpecialLinks event={event} albums={albums} studio={studio} />
      </Modal>
    )
  }
  const current = tab === 'qr' ? qr : tab === 'message' ? message : link
  return (
    <Modal open={open} onOpenChange={onOpenChange} width={640} title="Share this event" footer={current.footer}>
      <TabBar<ShareTab> value={tab} onChange={onTab} className="-mt-1" tabs={[
        { value: 'link', label: 'Link' },
        { value: 'qr', label: 'QR code' },
        { value: 'message', label: 'Message' },
      ]} />
      {current.body}
    </Modal>
  )
}
