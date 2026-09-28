import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, Download, LifeBuoy, MessageCircle, QrCode } from 'lucide-react'
import { fmt, PLANS } from '@frameline/shared'
import { Button, Card, Meter, Modal, QRCode, Skeleton, useToast } from '@frameline/ui'
import { useStudio, useUsage } from '../../lib/queries'
import { GALLERY_URL } from '../../lib/url'

const WHATSAPP = '916351081819'
const title = 'font-sans text-[15px] font-extrabold tracking-normal'

async function copy(toast: ReturnType<typeof useToast>, text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`, text) } catch { toast.error(`Couldn’t copy the ${what.toLowerCase()}`, `Copy it by hand: ${text}`) }
}

export function PlanCard() {
  const navigate = useNavigate()
  const usage = useUsage()
  const u = usage.data
  const plan = PLANS.find((p) => p.id === u?.planId)
  const pct = u ? u.photosUsed / Math.max(1, u.photosLimit) : 0
  return (
    <Card>
      <h2 className={title}>Plan and photos</h2>
      {!u ? <div className="mt-2 flex flex-col gap-2"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-1.5" /><Skeleton className="h-3.5 w-2/3" /></div> : (
        <>
          <p className="mb-2.5 mt-0.5 text-[13px] text-ink-2">{plan?.name ?? 'Your plan'} · renews {fmt.date(u.validTill)}</p>
          <Meter value={u.photosUsed} max={u.photosLimit} tone={pct >= 1 ? 'bad' : pct >= 0.9 ? 'warn' : 'gold'} label="Photos used" />
          <div className="mt-2 flex items-center justify-between gap-2 text-[12.5px]">
            <span className="text-ink-2 tnum">{fmt.count(u.photosUsed)} of {fmt.count(u.photosLimit)} used</span>
            <button type="button" className="font-bold text-accent-text hover:underline max-sm:min-h-[44px]" onClick={() => navigate('/plan')}>Manage</button>
          </div>
        </>
      )}
    </Card>
  )
}

export function FollowCard() {
  const toast = useToast()
  const studio = useStudio().data
  const [qr, setQr] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)
  const code = studio?.followCode ?? ''
  const link = `${GALLERY_URL}/studio/${code}`

  const download = () => {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${studio?.handle ?? 'studio'}-follow-qr.svg`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    toast.success('QR code downloaded')
  }

  return (
    <Card>
      <h2 className={title}>Let guests follow you</h2>
      <p className="mb-2.5 mt-0.5 text-[13px] text-ink-2">Anyone with this code sees all your events in the app.</p>
      {!studio ? <Skeleton className="h-8 w-full" /> : (
        <div className="flex flex-wrap items-center gap-2">
          <b className="mr-auto text-[17px] tracking-[.08em] tnum">{code}</b>
          <Button size="sm" className="max-sm:h-10" icon={<Copy size={13} />} onClick={() => void copy(toast, code, 'Follow code')}>Copy</Button>
          <Button size="sm" className="max-sm:h-10" icon={<QrCode size={13} />} onClick={() => setQr(true)}>QR code</Button>
        </div>
      )}
      <Modal open={qr} onOpenChange={setQr} title="Follow QR code" description="Print it at your studio or on albums. Scanning it opens your studio page." width={400}
        footer={<>
          <Button variant="ghost" icon={<Copy size={14} />} onClick={() => void copy(toast, link, 'Follow link')}>Copy link</Button>
          <Button variant="primary" icon={<Download size={14} />} onClick={download}>Download QR code</Button>
        </>}>
        <div className="flex flex-col items-center gap-2 py-2">
          <div ref={qrRef} className="rounded-card bg-white p-3"><QRCode value={link} size={200} /></div>
          <b className="text-[18px] tracking-[.08em]">{code}</b>
          <span className="break-all text-center text-[12.5px] text-ink-3">{link}</span>
        </div>
      </Modal>
    </Card>
  )
}

export function HelpCard() {
  return (
    <Card>
      <h2 className={title}>Need a hand?</h2>
      <p className="mb-2.5 mt-0.5 text-[13px] text-ink-2">Guides, videos in English and हिन्दी, and a real person on WhatsApp.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="max-sm:h-10" icon={<MessageCircle size={13} />} onClick={() => window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hi Frameline, I need help with ')}`, '_blank', 'noopener')}>WhatsApp us</Button>
        <Link to="/support" className="inline-flex h-[30px] items-center gap-1.5 rounded-control px-[11px] text-[12.5px] font-bold text-ink-2 hover:bg-sunk hover:text-ink max-sm:h-10">
          <LifeBuoy size={13} aria-hidden />Help centre
        </Link>
      </div>
    </Card>
  )
}
