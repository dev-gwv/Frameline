import { useRef, type ChangeEvent } from 'react'
import { CalendarClock, Circle, Copy, Download, FileImage, ImagePlus, MoreHorizontal, Palette, Pencil, Printer, Square, Trash2, X } from 'lucide-react'
import { fmt, type PhotoEvent, type SmartQR } from '@frameline/shared'
import { Button, Card, Menu, QRCode, useToast } from '@frameline/ui'
import { downloadBlob, downloadBlobFile, svgMarkup, svgToPng, switchTime, useCopy } from './util'
import { assetAccept, useAssetUpload } from '../watermarks/assetUpload'
import { buildPoster, shortUrl } from './poster'
import { scheduleOf } from './modals'

const INK = '#1B1712'

/** Inline the centre logo as a data URL so the SVG still has it when drawn to a canvas. */
async function inlineLogo(svg: string, logo?: string) {
  if (!logo || logo.startsWith('data:')) return svg
  try {
    const blob = await (await fetch(logo)).blob()
    const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob) })
    return svg.split(`href="${logo}"`).join(`href="${data}"`)
  } catch { return svg }
}

export function QRCard({ qr, events, studioName, brandColor, onUpdate, onChangeEvent, onSchedule, onClearSchedule, onRename, onRemoveLogo, onDelete }: {
  qr: SmartQR
  events: PhotoEvent[]
  studioName: string
  brandColor: string
  onUpdate: (patch: Partial<SmartQR>) => void
  onChangeEvent: () => void
  onSchedule: () => void
  onClearSchedule: () => void
  onRename: () => void
  onRemoveLogo: () => void
  onDelete: () => void
}) {
  const copy = useCopy()
  const toast = useToast()
  const qrRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const logoUp = useAssetUpload('qr-logo')
  const event = events.find((e) => e.id === qr.eventId)
  const schedule = scheduleOf(qr)
  const next = schedule && events.find((e) => e.id === schedule.eventId)
  const url = `https://${shortUrl(qr.slug)}`
  const logo = qr.logoUrl || undefined
  // The encoder draws square modules or round dots; 'rounded' and 'dots' both render as dots.
  const rounded = (qr.dotStyle ?? 'square') !== 'square'

  const downloadPoster = () => {
    const svg = svgMarkup(qrRef.current)
    if (!svg) return
    downloadBlob(buildPoster({ qrSvg: svg, studio: studioName, name: qr.name, eventName: event?.name ?? 'Your event', slug: qr.slug, color: qr.color }), `${qr.slug}-poster-a4.svg`, 'image/svg+xml')
    toast.success('Poster downloaded', 'A4 SVG, ready to print.')
  }
  const downloadSvg = async () => {
    const svg = svgMarkup(qrRef.current)
    if (!svg) return
    downloadBlob(await inlineLogo(svg, logo), `${qr.slug}-qr.svg`, 'image/svg+xml')
    toast.success('QR code downloaded', 'SVG: sharp at any print size.')
  }
  const downloadPng = async () => {
    const svg = svgMarkup(qrRef.current)
    if (!svg) return
    try {
      downloadBlobFile(await svgToPng(await inlineLogo(svg, logo), 1200), `${qr.slug}-qr.png`)
      toast.success('QR code downloaded', 'PNG, 1200 × 1200 px.')
    } catch {
      toast.error('Couldn’t make the PNG', 'Download the SVG instead; it prints just as well.')
    }
  }

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    void logoUp.upload(f).then((a) => { if (a) onUpdate({ logoUrl: a.url }) })
  }

  let sub = `${fmt.count(qr.scans)} ${qr.scans === 1 ? 'scan' : 'scans'}`
  if (schedule) sub += next ? ` · switches to “${next.name}” at ${switchTime(schedule.at)}` : ' · the scheduled event was deleted'

  return (
    <Card className="flex min-w-0 items-start gap-3.5 p-4 sm:p-[18px]">
      <div className="shrink-0 rounded-control border border-line bg-white p-1.5" ref={qrRef}>
        <QRCode value={url} size={92} color={qr.color} rounded={rounded} logo={logo} />
      </div>
      <div className="min-w-0 flex-1">
        <b className="block truncate text-[14.5px]">{qr.name}</b>
        <div className="truncate text-[13px] text-ink-2">Opens {event?.name ?? 'a deleted event'}</div>
        <div className="mt-1 text-[12.5px] text-ink-3 tnum">{sub}</div>
        {logoUp.pending && <div className="mt-1 text-[12px] font-semibold text-ink-3">Uploading logo…</div>}
        {logoUp.error && <div className="mt-1 text-[12px] font-semibold text-bad" role="alert">{logoUp.error}</div>}
        <div className="mt-2.5 flex items-center gap-1.5">
          <Button size="sm" onClick={onChangeEvent} className="max-sm:h-[40px]">Change event</Button>
          <Menu
            width={260}
            trigger={<button type="button" className="grid size-[30px] place-items-center rounded-control text-ink-2 hover:bg-sunk hover:text-ink max-sm:size-10" aria-label={`More for ${qr.name}`}><MoreHorizontal size={16} /></button>}
            items={[
              { label: schedule ? 'Change the scheduled switch' : 'Schedule a switch', description: 'Open another event from a set time', icon: <CalendarClock size={15} />, onSelect: onSchedule },
              ...(schedule ? [{ label: 'Cancel the switch', icon: <X size={15} />, onSelect: onClearSchedule }] : []),
              { label: 'Rename', icon: <Pencil size={15} />, onSelect: onRename },
              { label: 'Copy short link', description: shortUrl(qr.slug), icon: <Copy size={15} />, onSelect: () => void copy(url, 'Short link') },
              'separator',
              { label: 'Download SVG', icon: <Download size={15} />, onSelect: () => void downloadSvg() },
              { label: 'Download PNG', icon: <FileImage size={15} />, onSelect: () => void downloadPng() },
              { label: 'Download A4 poster', icon: <Printer size={15} />, onSelect: downloadPoster },
              'separator',
              { label: rounded ? 'Square dots' : 'Round dots', icon: rounded ? <Square size={15} /> : <Circle size={15} />, onSelect: () => onUpdate({ dotStyle: rounded ? 'square' : 'dots' }) },
              { label: qr.color === INK ? 'Use my brand colour' : 'Use black', icon: <Palette size={15} />, onSelect: () => onUpdate({ color: qr.color === INK ? brandColor : INK }) },
              { label: logo ? 'Replace logo' : 'Add logo in the middle', icon: <ImagePlus size={15} />, onSelect: () => fileRef.current?.click() },
              ...(logo ? [{ label: 'Remove logo', icon: <X size={15} />, onSelect: onRemoveLogo }] : []),
              'separator',
              { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onSelect: onDelete },
            ]}
          />
          <input ref={fileRef} type="file" accept={assetAccept('qr-logo')} className="hidden" onChange={onLogo} />
        </div>
      </div>
    </Card>
  )
}
