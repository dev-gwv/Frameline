import { useState } from 'react'
import { Lock, Monitor, Smartphone } from 'lucide-react'
import type { PhotoEvent, Studio, Website } from '@frameline/shared'
import { Chip, Modal, Segmented } from '@frameline/ui'
import { SitePreview, type Device } from './SitePreview'

/** Full-screen preview of the site as visitors will see it. */
export function PreviewModal({ open, onOpenChange, website, studio, events, address }: {
  open: boolean; onOpenChange: (v: boolean) => void; website: Website; studio: Studio; events: PhotoEvent[]; address: string
}) {
  const [device, setDevice] = useState<Device>('desktop')
  return (
    <Modal open={open} onOpenChange={onOpenChange} width={1600} className="top-[2vh] h-[96vh] max-h-[96vh]" bodyClassName="flex flex-col bg-sunk"
      title={<span className="inline-flex items-center gap-2">Preview {website.published ? <Chip tone="ok" dot>Live</Chip> : <Chip>Draft</Chip>}</span>}
      description={website.published ? 'This is what visitors see right now.' : 'Only you can see this until you publish.'}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-sunk px-3 py-1 text-[12px] text-ink-2">
          <Lock size={11} /><span className="truncate font-mono">https://{address}</span>
        </div>
        <Segmented size="sm" value={device} onChange={setDevice} options={[
          { value: 'desktop', label: 'Desktop', icon: <Monitor size={12} /> },
          { value: 'phone', label: 'Phone', icon: <Smartphone size={12} /> },
        ]} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {device === 'phone' ? (
          <div className="mx-auto my-5 w-full max-w-[390px] overflow-hidden rounded-[28px] border-[6px] border-side shadow-card">
            <div className="h-[70vh] overflow-y-auto scrollbar-thin"><SitePreview website={website} studio={studio} events={events} device="phone" /></div>
          </div>
        ) : (
          <SitePreview website={website} studio={studio} events={events} device={typeof window !== 'undefined' && window.innerWidth < 640 ? 'phone' : 'desktop'} />
        )}
      </div>
    </Modal>
  )
}
