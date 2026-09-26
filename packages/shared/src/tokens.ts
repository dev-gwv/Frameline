/**
 * "Gilt" design tokens. Single source of truth for web (CSS variables in
 * @frameline/ui/styles.css mirror these) and mobile (imported directly).
 */
export const palette = {
  light: {
    paper: '#FAF7F0',
    surface: '#FFFFFF',
    sunk: '#F3EEE3',
    ink: '#1B1712',
    ink2: '#5E5548',
    ink3: '#958B7B',
    line: '#EAE2D3',
    line2: '#DDD2BE',
    accent: '#C08A2C',
    accentInk: '#1E1508',
    accentSoft: '#F7EDD8',
    accentText: '#8E6116',
    marker: '#D9A63A',
    ok: '#3E8A5C',
    okSoft: '#E4F1E8',
    warn: '#B9582A',
    warnSoft: '#FAE8DD',
    bad: '#B23D2E',
    badSoft: '#F7E2DE',
    side: '#15120E',
    side2: '#1F1A14',
    sideInk: '#F2EADB',
    sideInk2: '#A89D8A',
    sideLine: '#2C251D',
  },
  dark: {
    paper: '#0C0A08',
    surface: '#15120F',
    sunk: '#1D1914',
    ink: '#F3ECDF',
    ink2: '#B7AC98',
    ink3: '#7F7566',
    line: '#28221B',
    line2: '#372F25',
    accent: '#E2B458',
    accentInk: '#1A1206',
    accentSoft: '#2A2116',
    accentText: '#EBC677',
    marker: '#F0C766',
    ok: '#72C592',
    okSoft: '#16281D',
    warn: '#E58C5A',
    warnSoft: '#33201A',
    bad: '#EA7E6B',
    badSoft: '#361B17',
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
  stops: ['#F2D38A', '#DDA848', '#B37C22'] as const,
  locations: [0, 0.46, 1] as const,
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
