import type { CSSProperties } from 'react'
import { fontStack, LOGO_SIZE, TEXT_SIZE, type WmDraft } from './lib'

/**
 * The simple watermark drawn on top of a PhotoFrame. Sizes are in cqw (share of photo width);
 * `edgeOffset` is a share of the short side, so portrait and landscape get the same margin.
 * Photo overlay colours (white + shadow) are photo tones, not UI colours.
 */
export function WatermarkOverlay({ wm, ratio = 1.5 }: { wm: WmDraft; ratio?: number }) {
  const top = wm.position[0] === 't'
  const h = wm.position[1] as 'l' | 'c' | 'r'
  const edge = `${(wm.edgeOffset ?? 3) * Math.min(1, 1 / ratio)}cqw`
  const pos: CSSProperties = {
    position: 'absolute',
    [top ? 'top' : 'bottom']: edge,
    ...(h === 'c' ? { left: '50%', transform: 'translateX(-50%)' } : { [h === 'l' ? 'left' : 'right']: edge }),
    opacity: wm.opacity / 100,
    textAlign: h === 'l' ? 'left' : h === 'c' ? 'center' : 'right',
    color: '#fff',
    textShadow: '0 1px 4px rgba(0,0,0,.55)',
    pointerEvents: 'none',
    maxWidth: '70cqw',
    whiteSpace: 'nowrap',
  }
  if (wm.mode === 'logo') {
    if (!wm.logoUrl) {
      return <div style={{ ...pos, fontSize: '2.6cqw', fontWeight: 700 }}>Your logo here</div>
    }
    return <img src={wm.logoUrl} alt="" style={{ ...pos, width: `${LOGO_SIZE[wm.size]}cqw`, height: 'auto', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.45))' }} />
  }
  const size = TEXT_SIZE[wm.size]
  return (
    <div style={pos}>
      <div style={{ fontFamily: fontStack(wm.font), fontSize: `${size}cqw`, fontWeight: 600, lineHeight: 1.1 }}>{wm.text || 'Your studio name'}</div>
      {wm.subtitle && <div style={{ fontFamily: fontStack(wm.font), fontSize: `${size * 0.48}cqw`, marginTop: '0.4cqw', letterSpacing: '.04em' }}>{wm.subtitle}</div>}
    </div>
  )
}
