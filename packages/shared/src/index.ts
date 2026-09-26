export * from './types'
export * from './tokens'
export * from './seed'
export * from './api'
export * as fmt from './format'
export { DEMO_NOW } from './format'

import type { Tone } from './types'
/** CSS `background` for a placeholder photo tone (web only). */
export const toneCss = (t: Tone) => `linear-gradient(${t.angle}deg, ${t.stops[0]}, ${t.stops[1]} 55%, ${t.stops[2]})`
export * from './http'
