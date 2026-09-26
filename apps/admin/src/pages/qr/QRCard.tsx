import { useRef, useState, type ChangeEvent } from 'react'
import { CalendarClock, Circle, Copy, Download, ImagePlus, MoreHorizontal, Palette, Pencil, Square, Trash2, X } from 'lucide-react'
import { fmt, type PhotoEvent, type SmartQR } from '@frameline/shared'
import { Button, Chip, cn, Field, Input, Menu, QRCode, Select, Tip, useToast } from '@frameline/ui'
import { downloadBlob, imageDataUrl, svgMarkup, useCopy } from './util'
import { buildPoster, shortUrl } from './poster'
import { scheduleOf } from './modals'

export const TARGETS: { value: SmartQR['target']; label: string }[] = [
  { value: 'web', label: 'Web gallery' },
  { value: 'smart', label: 'App on phones, web elsewhere' },
  { value: 'app', label: 'App only' },
]

const INK = '#1B1712'

export function QRCard({ qr, events, studioName, brandColor, onUpdate, onSchedule, onClearSchedule, onDelete }: {
  qr: SmartQR
  events: PhotoEvent[]
  studioName: string
  brandColor: string
  onUpdate: (patch: Partial<SmartQR>) => void
  onSchedule: () => void
  onClearSchedule: () => void
  onDelete: () => void
}) {
  const copy = useCopy()
  const toast = useToast()
  const qrRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(qr.name)
  const event = events.find((e) => e.id === qr.eventId)
  const schedule = scheduleOf(qr)
  const next = schedule && events.find((e) => e.id === schedule.eventId)
  const url = `https://${shortUrl(qr.slug)}`
  const logo = qr.logoUrl || undefined
  // The encoder draws either square modules or round dots; 'rounded' and 'dots' both render as dots.
  const rounded = (qr.dotStyle ?? 'square') !== 'square'
  
  const commitName = () => {
    setEditing(false)
    const v = name.trim()
    if (!v) { setName(qr.name); return }
    if (v !== qr.name) onUpdate({ name: v })
  }

  const downloadPoster = () => {
    const svg = svgMarkup(qrRef.current)
    if (!svg) return
    downloadBlob(buildPoster({ qrSvg: svg, studio: studioName, name: qr.name, eventName: event?.name ?? 'Your event', slug: qr.slug, color: qr.color }), `${qr.slug}-poster-a4.svg`, 'image/svg+xml')
    toast.success('Poster downloaded', 'A4 SVG, ready to print.')
  }
  const downloadQR = () => {
    const svg = svgMarkup(qrRef.current)
    if (svg) downloadBlob(svg, `${qr.slug}-qr.svg`, 'image/svg+xml')
  }

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(f.type)) return toast.error('That file isn’t an image', 'Use a PNG, JPG, SVG or WebP logo.')
    imageDataUrl(f, 4000, { keepAlpha: true })
      .then((logoUrl) => onUpdate({ logoUrl }))
      .catch((err: Error) => toast.error('Couldn’t use that logo', err.message))
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <Input autoFocus aria-label="QR name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setName(qr.name); setEditing(false) } }} className="h-8" />
        ) : (
          <button type="button" onClick={() => { setName(qr.name); setEditing(true) }} className="group flex min-w-0 items-center gap-1.5 text-left" aria-label={`Rename ${qr.name}`}>
            <b className="truncate text-[14.5px]">{qr.name}</b>
            <Pencil size={12} className="shrink-0 text-ink-3 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        )}
        <Menu
          trigger={<button type="button" className="rounded p-1 text-ink-2 hover:bg-sunk hover:text-ink" aria-label={`More for ${qr.name}`}><MoreHorizontal size={16} /></button>}
          items={[
            { label: 'Rename', icon: <Pencil size={14} />, onSelect: () => { setName(qr.name); setEditing(true) } },
            { label: 'Copy short link', icon: <Copy size={14} />, onSelect: () => copy(url, 'Short link') },
            { label: 'Download QR only (SVG)', icon: <Download size={14} />, onSelect: downloadQR },
            'separator',
            { label: rounded ? 'Square dots' : 'Round dots', icon: rounded ? <Square size={14} /> : <Circle size={14} />, onSelect: () => onUpdate({ dotStyle: rounded ? 'square' : 'dots' }) },
            { label: qr.color === INK ? 'Use brand colour' : 'Use black', icon: <Palette size={14} />, onSelect: () => onUpdate({ color: qr.color === INK ? brandColor : INK }) },
            { label: logo ? 'Replace logo' : 'Add logo in the middle', icon: <ImagePlus size={14} />, onSelect: () => fileRef.current?.click() },
            ...(logo ? [{ label: 'Remove logo', icon: <X size={14} />, onSelect: () => onUpdate({ logoUrl: '' }) }] : []),
            'separator',
            { label: 'Delete QR', icon: <Trash2 size={14} />, danger: true, onSelect: onDelete },
          ]}
        />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={onLogo} />
      </div>

      <div className="relative grid place-items-center rounded-[10px] border border-line bg-white p-3.5">
        <div ref={qrRef}><QRCode value={url} size={140} color={qr.color} rounded={rounded} logo={logo} /></div>
      </div>

      <Field label="Currently opens" htmlFor={`opens-${qr.id}`}>
        <Select id={`opens-${qr.id}`} value={qr.eventId} onChange={(e) => onUpdate({ eventId: e.target.value })}>
          {!event && <option value={qr.eventId}>Deleted event</option>}
          {events.filter((e) => e.status !== 'archived' || e.id === qr.eventId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </Field>

      {schedule && next && (
        <div className="flex items-center gap-2 rounded-control bg-accent-soft px-2.5 py-1.5 text-[12px] text-accent-text">
          <CalendarClock size={13} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate"><b>{next.name}</b> from {fmt.dateTime(schedule.at)}</span>
          <Tip label="Cancel scheduled switch">
            <button type="button" onClick={onClearSchedule} className="rounded p-0.5 hover:bg-surface" aria-label="Cancel scheduled switch"><X size={13} /></button>
          </Tip>
        </div>
      )}

      <Field label="Where it opens" htmlFor={`target-${qr.id}`}>
        <Select id={`target-${qr.id}`} value={qr.target} onChange={(e) => onUpdate({ target: e.target.value as SmartQR['target'] })}>
          {TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </Field>

      <div className="flex items-center justify-between gap-2 text-[12px] text-ink-2">
        <button type="button" onClick={() => copy(url, 'Short link')} className="flex min-w-0 items-center gap-1.5 rounded px-1 font-mono hover:bg-sunk hover:text-ink" aria-label="Copy short link">
          <span className="truncate">{shortUrl(qr.slug)}</span><Copy size={12} className="shrink-0" />
        </button>
        <span className="shrink-0"><b className="font-mono text-ink">{fmt.count(qr.scans)}</b> scans</span>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1 justify-center" icon={<Download size={14} />} onClick={downloadPoster}>Poster</Button>
        <Button className={cn('flex-1 justify-center')} icon={<CalendarClock size={14} />} onClick={onSchedule}>{schedule ? 'Edit switch' : 'Schedule switch'}</Button>
      </div>
      {schedule && !next && <Chip tone="warn">Scheduled event was deleted</Chip>}
    </div>
  )
}
