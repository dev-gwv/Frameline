import type { Album, PhotoEvent } from '@frameline/shared'
import { Modal, TabBar } from '@frameline/ui'
import { useStudio } from '../../../lib/queries'
import { LinkTab } from './LinkTab'
import { MessageTab } from './MessageTab'
import { PersonalTab } from './PersonalTab'
import { QRTab } from './QRTab'

export type ShareTab = 'link' | 'qr' | 'message' | 'personal'
export const SHARE_TABS: ShareTab[] = ['link', 'qr', 'message', 'personal']

const SUB: Record<ShareTab, string> = {
  link: 'A link, a PIN and a printed QR code.',
  qr: 'A branded QR code for cards, standees and the welcome table.',
  message: 'Your reusable message fills in each event’s details.',
  personal: 'Printed QR codes and links made for one person.',
}

export function ShareModal({ open, onOpenChange, event, albums, tab, onTab }: {
  open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent; albums: Album[]; tab: ShareTab; onTab: (t: ShareTab) => void
}) {
  const studio = useStudio().data
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Share ${event.name}`} description={SUB[tab]} width={tab === 'personal' ? 1000 : 920}>
      <div className="px-5 pt-3 sm:px-6">
        <TabBar<ShareTab> value={tab} onChange={onTab} tabs={[
          { value: 'link', label: 'Link & access' },
          { value: 'qr', label: 'QR code' },
          { value: 'message', label: 'Message' },
          { value: 'personal', label: 'Personal links' },
        ]} />
      </div>
      {tab === 'link' && <LinkTab event={event} studio={studio} />}
      {tab === 'qr' && <QRTab event={event} studio={studio} />}
      {tab === 'message' && <MessageTab event={event} studio={studio} />}
      {tab === 'personal' && <PersonalTab event={event} studio={studio} albums={albums} onTab={onTab} />}
    </Modal>
  )
}
