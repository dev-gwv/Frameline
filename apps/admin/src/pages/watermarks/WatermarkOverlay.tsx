import type { CSSProperties } from 'react'
import type { WatermarkSettings } from '@frameline/shared'
import { fontStack, LOGO_SIZE, TEXT_SIZE, type LocalExtras } from './lib'

/** The simple watermark drawn on top of a PhotoFrame. Sizes are in cqw (share of photo width). */
export function WatermarkOverlay({ wm, extras }: { wm: WatermarkSettings; extras: LocalExtras }) {
  const top = wm.position[0] === 't'
  const left = wm.position[1] === 'l'
  const edge = `${extras.offset}cqw`
  const pos: CSSProperties = {
    position: 'absolute',
    [top ? 'top' : 'bottom']: edge,
    [left ? 'left' : 'right']: edge,
    opacity: wm.opacity / 100,
    textAlign: left ? 'left' : 'right',
    color: '#fff',
    textShadow: '0 1px 4px rgba(0,0,0,.55)',
    pointerEvents: 'none',
    maxWidth: '70cqw',
  }
  if (wm.mode === 'logo') {
    if (!extras.logoUrl) {
      return <div style={{ ...pos, fontSize: '2.6cqw', fontWeight: 700 }}>Your logo here</div>
    }
    return <img src={extras.logoUrl} alt="" style={{ ...pos, width: `${LOGO_SIZE[wm.size]}cqw`, height: 'auto', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.45))' }} />
  }
  const size = TEXT_SIZE[wm.size]
  return (
    <div style={pos}>
      <div style={{ fontFamily: fontStack(wm.font), fontSize: `${size}cqw`, fontWeight: 600, lineHeight: 1.1 }}>{wm.text || 'Your studio name'}</div>
      {wm.subtitle && <div style={{ fontFamily: fontStack(wm.font), fontSize: `${size * 0.48}cqw`, marginTop: '0.4cqw', letterSpacing: '.04em' }}>{wm.subtitle}</div>}
    </div>
  )
}
