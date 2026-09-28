/**
 * Frameline design tokens (redesign v2). Single source of truth for web (CSS variables in
 * @frameline/ui/styles.css mirror these) and mobile (imported directly).
 */
export const palette = {
  light: {
    paper: '#F7F5F0',
    surface: '#FFFFFF',
    sunk: '#F2EEE6',
    ink: '#1C1814',
    ink2: '#5F574B',
    ink3: '#8C8374',
    line: '#ECE7DD',
    line2: '#DED6C8',
    accent: '#B8862B',
    accentInk: '#1E1508',
    accentSoft: '#F6EDDA',
    accentText: '#8A5E14',
    marker: '#D9A63A',
    ok: '#2F7A4E',
    okSoft: '#E5F2E9',
    warn: '#A8501F',
    warnSoft: '#FAEADF',
    bad: '#B23D2E',
    badSoft: '#FBE7E3',
    side: '#15120E',
    side2: '#1F1A14',
    sideInk: '#F2EADB',
    sideInk2: '#A89D8A',
    sideLine: '#2C251D',
  },
  dark: {
    paper: '#100E0B',
    surface: '#18150F',
    sunk: '#201C16',
    ink: '#F1EBDF',
    ink2: '#B5AB98',
    ink3: '#8A806F',
    line: '#2A241C',
    line2: '#3A3226',
    accent: '#DDAF55',
    accentInk: '#1A1206',
    accentSoft: '#2C2317',
    accentText: '#E8C377',
    marker: '#F0C766',
    ok: '#72C592',
    okSoft: '#16281D',
    warn: '#E58C5A',
    warnSoft: '#33201A',
    bad: '#EA7E6B',
    badSoft: '#351B16',
    side: '#0F0D0A',
    side2: '#1A1611',
    sideInk: '#F2EADB',
    sideInk2: '#A89D8A',
    sideLine: '#262019',
  },
} as const

export type ThemeName = keyof typeof palette
export type Palette = (typeof palette)[ThemeName]

/** Gold leaf gradient, used for primary actions, meters and selection. */
export const gold = {
  stops: ['#E9C77A', '#C9973A', '#AE7A22'] as const,
  locations: [0, 0.55, 1] as const,
  angle: 135,
  highlight: '#F2D38A',
}

export const fonts = {
  display: 'Fraunces',
  body: 'Manrope',
  mono: 'JetBrains Mono',
}

export const radius = { control: 8, card: 12, modal: 14, pill: 999 }
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 }
