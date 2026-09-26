import { randomInt } from './crypto'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** Prefixed, URL-safe random id, e.g. `ev_k3j9x0q2m1ab`. */
export function newId(prefix: string, length = 12): string {
  let s = ''
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)]
  return `${prefix}_${s}`
}

/** 7-char upper-case hex short id for guest links (frameline.in/e/6402F9F). */
export function newShortId(): string {
  let s = ''
  for (let i = 0; i < 7; i++) s += '0123456789ABCDEF'[randomInt(16)]
  return s
}

export const nowIso = () => new Date().toISOString()
