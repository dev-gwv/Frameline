import type { CSSProperties } from 'react'
import { fontStack } from './lib'

/**
 * The originals rule, custom per-event marks and the asset library have no API model yet, so they
 * live on this device. The store rule is StoreSettings.saleWatermark and "no watermark" per event is
 * EventSettings.watermarkOff — both on the API.
 */
export interface Asset {
  id: string
  kind: 'image' | 'text'
  name: string
  dataUrl?: string
  text?: string
  font?: string
  color?: string
  bytes: number
}
export interface OriginalsRule { enabled: boolean; assetId: string; x: number; y: number; size: number; opacity: number }
export interface AdvancedState {
  originals: OriginalsRule
  /** eventId → asset id: a custom mark for that event (local only). */
  overrides: Record<string, string>
  assets: Asset[]
}

export const ADVANCED_KEY = 'frameline.watermark.advanced.v2'
export const MAX_ASSETS = 20
export const ASSET_STORAGE = 100_000_000
export const MAX_ASSET_FILE = 25_000_000

export const DEFAULT_ADVANCED: AdvancedState = {
  originals: { enabled: false, assetId: '', x: 88, y: 90, size: 18, opacity: 80 },
  overrides: {},
  assets: [],
}

export const ORIGINAL_PRESETS: { label: string; x: number; y: number; size: number }[] = [
  { label: 'Bottom right', x: 88, y: 90, size: 18 },
  { label: 'Bottom centre', x: 50, y: 90, size: 22 },
  { label: 'Centre, large', x: 50, y: 50, size: 45 },
  { label: 'Top left', x: 12, y: 9, size: 18 },
]

export const localRuleCount = (a: AdvancedState) => Number(a.originals.enabled) + Object.values(a.overrides).filter(Boolean).length

/** Draws an asset (or the studio name when none) `width` cqw wide, centred on its box. */
export function AssetMark({ asset, fallbackText, fallbackFont, width, style }: { asset?: Asset; fallbackText: string; fallbackFont: string; width: number; style?: CSSProperties }) {
  const shadow = '0 1px 4px rgba(0,0,0,.55)'
  if (asset?.kind === 'image' && asset.dataUrl) {
    return <img src={asset.dataUrl} alt="" style={{ width: `${width}cqw`, height: 'auto', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.45))', ...style }} />
  }
  const text = asset?.kind === 'text' ? asset.text ?? '' : fallbackText
  const font = asset?.kind === 'text' ? asset.font ?? fallbackFont : fallbackFont
  const chars = Math.max(6, [...text].length)
  return (
    <div style={{ width: `${width}cqw`, fontFamily: fontStack(font), fontSize: `${(width / chars) * 1.8}cqw`, fontWeight: 600, color: asset?.color ?? '#fff', textShadow: shadow, whiteSpace: 'nowrap', textAlign: 'center', lineHeight: 1.1, ...style }}>
      {text}
    </div>
  )
}
