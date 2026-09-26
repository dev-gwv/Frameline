import { useRef, useState } from 'react'
import { Copy, Download, Link2, QrCode } from 'lucide-react'
import { fmt, hash, type Studio } from '@frameline/shared'
import { Button, DarkCard, Modal, QRCode } from '@frameline/ui'
import { downloadBlob, svgMarkup, useCopy } from './util'
import { FOLLOWERS } from './sample'

export const followLink = (code: string) => `https://frameline.in/follow/${code}`

export function FollowCodeCard({ studio }: { studio: Studio }) {
  const copy = useCopy()
  const [qrOpen, setQrOpen] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)
  const link = followLink(studio.followCode)

  const download = () => {
    const svg = svgMarkup(qrRef.current)
    if (svg) downloadBlob(svg, `${studio.handle}-follow-qr.svg`, 'image/svg+xml')
  }

  return (
    <DarkCard>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[.09em] text-side-ink-2">Follow code</span>
        <span className="text-[11.5px] text-side-ink-2"><b className="font-mono text-side-ink">{fmt.count(FOLLOWERS)}</b> followers</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <b className="font-mono text-[24px] tracking-[.12em] text-side-gold">{studio.followCode}</b>
        <Button size="sm" variant="side" icon={<Copy size={12} />} onClick={() => copy(studio.followCode, 'Follow code')}>Copy</Button>
      </div>
      <p className="mb-3 mt-1 text-[12px] text-side-ink-2">Anyone with this code follows all your events in the app.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="side" icon={<Link2 size={12} />} onClick={() => copy(link, 'Follow link')}>Follow link</Button>
        <Button size="sm" variant="side" icon={<QrCode size={12} />} onClick={() => setQrOpen(true)}>QR code</Button>
      </div>

      <Modal open={qrOpen} onOpenChange={setQrOpen} title="Follow QR code" description="Print it at your studio or on albums. Scanning opens the follow page." width={420}
        footer={<>
          <Button icon={<Link2 size={14} />} onClick={() => copy(link, 'Follow link')}>Copy link</Button>
          <Button variant="primary" icon={<Download size={14} />} onClick={download}>Download SVG</Button>
        </>}>
        <div className="flex flex-col items-center gap-3 px-6 py-5">
          <div ref={qrRef} className="rounded-card border border-line bg-white p-4">
            <QRCode seed={hash(studio.followCode)} size={220} rounded />
          </div>
          <div className="text-center">
            <div className="font-mono text-[18px] font-bold tracking-[.12em]">{studio.followCode}</div>
            <div className="select-all font-mono text-[12px] text-ink-3">{link.replace('https://', '')}</div>
          </div>
        </div>
      </Modal>
    </DarkCard>
  )
}
