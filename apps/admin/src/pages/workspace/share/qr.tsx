import { forwardRef } from 'react'
import { QRCode } from '@frameline/ui'
import { downloadBlob } from '../lib'

export type QRStyle = 'rounded' | 'soft' | 'hybrid' | 'classic'
export type QRCorner = 'rounded' | 'circle' | 'square'

interface StyledQRProps { seed: number; size?: number; color: string; style: QRStyle; corner: QRCorner; logo?: string }

/**
 * Wraps the shared QRCode in one exportable SVG and layers the chosen finder
 * shape and centre logo on top. (QRCode is decorative until a real encoder lands.)
 */
export const StyledQR = forwardRef<SVGSVGElement, StyledQRProps>(function StyledQR({ seed, size = 220, color, style, corner, logo }, ref) {
  const c = size / 21
  const finder = (cx: number, cy: number) => {
    const x = cx * c, y = cy * c
    const key = `${cx}-${cy}`
    if (corner === 'circle') {
      const r = 3.5 * c, mx = x + r, my = y + r
      return (
        <g key={key}>
          <rect x={x - c * 0.2} y={y - c * 0.2} width={7.4 * c} height={7.4 * c} fill="#fff" />
          <circle cx={mx} cy={my} r={r} fill={color} />
          <circle cx={mx} cy={my} r={2.5 * c} fill="#fff" />
          <circle cx={mx} cy={my} r={1.5 * c} fill={color} />
        </g>
      )
    }
    const rr = corner === 'rounded' ? [c * 2, c * 1.4, c * 0.9] : [0, 0, 0]
    return (
      <g key={key}>
        <rect x={x - c * 0.2} y={y - c * 0.2} width={7.4 * c} height={7.4 * c} fill="#fff" />
        <rect x={x} y={y} width={7 * c} height={7 * c} rx={rr[0]} fill={color} />
        <rect x={x + c} y={y + c} width={5 * c} height={5 * c} rx={rr[1]} fill="#fff" />
        <rect x={x + 2 * c} y={y + 2 * c} width={3 * c} height={3 * c} rx={rr[2]} fill={color} />
      </g>
    )
  }
  const pad = c * 1.5
  const full = size + pad * 2
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={full} height={full} viewBox={`0 0 ${full} ${full}`} role="img" aria-label="QR code preview">
      <rect width={full} height={full} rx={style === 'classic' ? 0 : c} fill="#fff" />
      <g transform={`translate(${pad} ${pad})`}>
        <g opacity={style === 'soft' ? 0.82 : 1}>
          <QRCode seed={seed} size={size} color={color} rounded={style === 'rounded' || style === 'soft'} />
        </g>
        {style !== 'classic' || corner !== 'square' ? [finder(0, 0), finder(14, 0), finder(0, 14)] : null}
        {logo && (
          <g>
            <rect x={size / 2 - 3 * c} y={size / 2 - 3 * c} width={6 * c} height={6 * c} rx={c} fill="#fff" />
            <image href={logo} x={size / 2 - 2.5 * c} y={size / 2 - 2.5 * c} width={5 * c} height={5 * c} preserveAspectRatio="xMidYMid meet" />
          </g>
        )}
      </g>
    </svg>
  )
})

export const svgString = (el: SVGSVGElement) => {
  const s = new XMLSerializer().serializeToString(el)
  return s.startsWith('<?xml') ? s : `<?xml version="1.0" encoding="UTF-8"?>\n${s}`
}

const toBase64 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin)
}
export const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${toBase64(svg)}`

export function downloadSvg(svg: string, filename: string) {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename)
}

/** Rasterise an SVG string to PNG at `px` wide. */
export function svgToPng(svg: string, px: number, heightPx?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = px
      canvas.height = heightPx ?? px
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas is not available in this browser.'))
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t create the PNG.'))), 'image/png')
    }
    img.onerror = () => reject(new Error('Couldn’t draw the QR code. Try the SVG download instead.'))
    img.src = svgDataUrl(svg)
  })
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A4 poster (595 × 842 pt) with studio name, event name, "Find your photos" and the PIN. */
export function buildPoster(args: { qrSvg: string; studio: string; event: string; link: string; pin?: string; color: string }) {
  const { qrSvg, studio, event, link, pin, color } = args
  const qr = svgDataUrl(qrSvg)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 595 842">
  <rect width="595" height="842" fill="#FAF7F0"/>
  <rect x="24" y="24" width="547" height="794" rx="18" fill="none" stroke="${esc(color)}" stroke-width="1.5" opacity=".35"/>
  <text x="297.5" y="92" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="13" letter-spacing="3" fill="#5E5548">${esc(studio.toUpperCase())}</text>
  <text x="297.5" y="160" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="36" font-weight="600" fill="#1B1712">${esc(event)}</text>
  <text x="297.5" y="210" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="24" font-style="italic" fill="${esc(color)}">Find your photos</text>
  <text x="297.5" y="238" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="13" fill="#5E5548">Scan the code, take a selfie, and see every photo you’re in.</text>
  <rect x="147.5" y="270" width="300" height="300" rx="16" fill="#fff"/>
  <image href="${qr}" x="157.5" y="280" width="280" height="280"/>
  <text x="297.5" y="614" text-anchor="middle" font-family="JetBrains Mono, Consolas, monospace" font-size="16" fill="#1B1712">${esc(link)}</text>
  ${pin ? `<text x="297.5" y="668" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="13" fill="#5E5548">PIN</text>
  <text x="297.5" y="706" text-anchor="middle" font-family="JetBrains Mono, Consolas, monospace" font-size="34" letter-spacing="10" font-weight="700" fill="#1B1712">${esc(pin)}</text>` : ''}
  <text x="297.5" y="790" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="10" fill="#958B7B">Photos delivered with Frameline</text>
</svg>`
}
