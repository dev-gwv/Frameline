import { useRef, useState } from 'react'
import { Copy, Download, Link2, QrCode } from 'lucide-react'
import { fmt, type Studio } from '@frameline/shared'
import { Button, Card, CardHeader, Modal, QRCode } from '@frameline/ui'
import { downloadBlob, svgMarkup, useCopy } from './util'

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
    <Card>
      <CardHeader title="Let guests follow you"
        description="Anyone with this code sees all your events in the Frameline app."
        action={<span className="text-[12.5px] text-ink-3 tnum">{fmt.count(studio.followers)} {studio.followers === 1 ? 'follower' : 'followers'}</span>} />
      <div className="flex flex-wrap items-center gap-2">
        <b className="mr-auto basis-full text-[22px] tracking-[.08em] tnum sm:basis-auto">{studio.followCode}</b>
        <Button size="sm" icon={<Copy size={13} />} onClick={() => copy(studio.followCode, 'Follow code')}>Copy</Button>
        <Button size="sm" icon={<QrCode size={13} />} onClick={() => setQrOpen(true)}>QR code</Button>
      </div>
      <button type="button" onClick={() => copy(link, 'Follow link')} className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded text-[12.5px] text-ink-3 hover:text-ink">
        <Link2 size={13} className="shrink-0" /><span className="truncate">{link.replace('https://', '')}</span><span className="shrink-0 font-bold text-accent-text">Copy link</span>
      </button>

      <Modal open={qrOpen} onOpenChange={setQrOpen} title="Follow QR code" description="Print it at your studio or on albums. Scanning it opens your follow page." width={420}
        footer={<>
          <Button variant="ghost" icon={<Link2 size={14} />} onClick={() => copy(link, 'Follow link')}>Copy link</Button>
          <Button variant="primary" icon={<Download size={14} />} onClick={download}>Download SVG</Button>
        </>}>
        <div className="flex flex-col items-center gap-3">
          <div ref={qrRef} className="rounded-card border border-line bg-white p-4">
            <QRCode value={link} logo={studio.logoUrl || undefined} size={220} rounded />
          </div>
          <div className="text-center">
            <div className="text-[18px] font-extrabold tracking-[.08em]">{studio.followCode}</div>
            <div className="select-all text-[12.5px] text-ink-3">{link.replace('https://', '')}</div>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
