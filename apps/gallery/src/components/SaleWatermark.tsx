import type { CSSProperties } from 'react'
import type { ID, StoreSettings } from '@frameline/shared'
import { useWatermark } from '../lib/queries'
import { useSession } from '../lib/guest'

type Sale = StoreSettings['saleWatermark']
const ANGLE: Record<Sale['orientation'], number> = { diagonal: -30, vertical: -90, horizontal: 0 }

/**
 * The "For sale" watermark for previews (PublicWatermark.sale: present only when the event sells with its For sale
 * watermark on). Returns null for photos this guest bought. Downloads never carry it: this is a CSS overlay only.
 */
export function useSaleMark(shortId: string, photoId: ID): Sale | null {
  const sale = useWatermark(shortId).data?.sale
  const purchased = useSession(shortId).purchased
  return sale && !purchased.includes(photoId) ? sale : null
}

/**
 * Lightweight overlay for the five templates. `scale` sizes the text for the space (1 = grid tile, ~2.5 = lightbox).
 * `logoUrl` is the studio logo for the logo grid (falls back to the text).
 */
export function SaleWatermark({ sale, scale = 1, logoUrl }: { sale: Sale; scale?: number; logoUrl?: string }) {
  const text = sale.text.trim() || 'FOR SALE'
  const font = Math.max(6, 4 * Math.max(1, sale.size) * scale)
  const base: CSSProperties = { color: sale.color, opacity: Math.min(1, Math.max(0.05, sale.opacity / 100)) }
  const shadow = '0 1px 2px rgba(0,0,0,.3)'
  const wrap = 'pointer-events-none absolute inset-0 z-[1] overflow-hidden select-none'

  if (sale.template === 'centre') {
    return (
      <div className={`${wrap} grid place-items-center`} style={base} aria-hidden>
        <span className="whitespace-nowrap font-display font-bold tracking-wider" style={{ fontSize: font * 1.8, transform: `rotate(${ANGLE[sale.orientation]}deg)`, textShadow: shadow }}>{text}</span>
      </div>
    )
  }
  if (sale.template === 'corner') {
    return (
      <div className={wrap} style={base} aria-hidden>
        <span className="absolute bottom-[6%] right-[6%] rounded-sm border-2 px-1.5 py-0.5 font-sans font-extrabold uppercase tracking-[.12em]"
          style={{ fontSize: font, borderColor: sale.color, transform: `rotate(${sale.orientation === 'horizontal' ? 0 : -8}deg)`, textShadow: shadow }}>{text}</span>
      </div>
    )
  }
  if (sale.template === 'frame') {
    const bar = Math.max(10, font * 1.8)
    return (
      <div className={wrap} style={base} aria-hidden>
        <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 0 ${bar}px ${sale.color}` }} />
        <span className="absolute inset-x-0 bottom-0 truncate text-center font-sans font-extrabold uppercase tracking-[.2em]"
          style={{ fontSize: font * 0.9, lineHeight: `${bar}px`, color: '#000', mixBlendMode: 'difference' }}>{text}</span>
      </div>
    )
  }
  // 'forsale' pattern and 'logo' grid: rotated rows of text (or the studio logo).
  const logo = sale.template === 'logo' && logoUrl
  const rows = Array.from({ length: 10 })
  return (
    <div className={wrap} style={base} aria-hidden>
      <div className="absolute left-1/2 top-1/2 flex flex-col" style={{ width: '260%', transform: `translate(-50%,-50%) rotate(${ANGLE[sale.orientation]}deg)`, gap: font * (logo ? 2.4 : 1.6) }}>
        {rows.map((_, i) => (
          <div key={i} className="flex whitespace-nowrap font-sans font-extrabold tracking-[.2em]" style={{ fontSize: font, marginLeft: i % 2 ? font * 3 : 0, gap: font * 3, textShadow: shadow }}>
            {Array.from({ length: 10 }, (_, k) => logo
              ? <img key={k} src={logoUrl} alt="" className="shrink-0 object-contain" style={{ height: font * 1.8, width: font * 5 }} />
              : <span key={k}>{text}</span>)}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Overlay for one photo, or nothing when it isn't for sale / already bought. */
export function SaleMark({ shortId, photoId, scale, logoUrl }: { shortId: string; photoId: ID; scale?: number; logoUrl?: string }) {
  const sale = useSaleMark(shortId, photoId)
  return sale ? <SaleWatermark sale={sale} scale={scale} logoUrl={logoUrl} /> : null
}
