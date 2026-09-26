const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const shortUrl = (slug: string) => `frameline.in/q/${slug}`

/** A4 (595×842 pt) printable poster with the QR code in the middle. */
/** `qrSvg` is the rendered QRCode (real encoded URL, logo included). */
export function buildPoster({ qrSvg, studio, name, eventName, slug, color }: {
  qrSvg: string; studio: string; name: string; eventName: string; slug: string; color: string
}) {
  // Strip the root element's size so the nested viewport controls it.
  const inner = qrSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  const vb = /viewBox="([^"]+)"/.exec(qrSvg)?.[1] ?? '0 0 140 140'
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842" viewBox="0 0 595 842">
  <rect width="595" height="842" fill="#FAF7F0"/>
  <rect x="24" y="24" width="547" height="794" rx="18" fill="none" stroke="${esc(color)}" stroke-width="2"/>
  <text x="297.5" y="110" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="22" fill="#5E5548">${esc(studio)}</text>
  <text x="297.5" y="178" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="44" font-weight="600" fill="#1B1712">Find your photos</text>
  <text x="297.5" y="214" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-size="17" fill="#5E5548">Scan with your phone camera. Take a selfie to see the ones you're in.</text>
  <rect x="147.5" y="262" width="300" height="300" rx="16" fill="#FFFFFF" stroke="#EAE2D3"/>
  <svg x="167.5" y="282" width="260" height="260" viewBox="${vb}">${inner}</svg>
  <text x="297.5" y="620" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-size="15" fill="#958B7B">Now showing</text>
  <text x="297.5" y="652" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="26" font-weight="600" fill="#1B1712">${esc(eventName)}</text>
  <text x="297.5" y="720" text-anchor="middle" font-family="JetBrains Mono, Consolas, monospace" font-size="16" fill="#1B1712">${esc(shortUrl(slug))}</text>
  <text x="297.5" y="790" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-size="11" fill="#958B7B">${esc(name)} · Powered by Frameline</text>
</svg>`
}
