import { useMemo } from 'react'
import { useColorScheme, type TextStyle } from 'react-native'
import { gold, palette, radius, space, type Palette } from '@frameline/shared'

/**
 * Gilt theme for React Native. Colours come from `palette.light/dark` in @frameline/shared and follow the
 * OS appearance. Font family names match the keys loaded in `src/app/_layout.tsx`.
 */
export const font = {
  display: 'Fraunces_600SemiBold',
  displayMedium: 'Fraunces_500Medium',
  body: 'Manrope_500Medium',
  bodyRegular: 'Manrope_400Regular',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  bodyHeavy: 'Manrope_800ExtraBold',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const

/** Gold leaf gradient for expo-linear-gradient (135° → top-left to bottom-right). */
export const goldGradient = {
  colors: gold.stops,
  locations: gold.locations,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
} as const

export { radius, space }

export interface Theme {
  c: Palette
  dark: boolean
  /** Text presets. */
  t: {
    display: (size: number) => TextStyle
    eyebrow: TextStyle
    body: TextStyle
    small: TextStyle
    label: TextStyle
    mono: TextStyle
  }
}

export function makeTheme(dark: boolean): Theme {
  const c = dark ? palette.dark : palette.light
  return {
    c,
    dark,
    t: {
      display: (size) => ({ fontFamily: font.display, fontSize: size, lineHeight: Math.round(size * 1.12), color: c.ink, letterSpacing: -0.3 }),
      eyebrow: { fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', color: c.ink3 },
      body: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: c.ink },
      small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: c.ink2 },
      label: { fontFamily: font.bodyBold, fontSize: 13, color: c.ink2 },
      mono: { fontFamily: font.mono, fontSize: 13, color: c.ink, fontVariant: ['tabular-nums'] },
    },
  }
}

const light = makeTheme(false)
const darkTheme = makeTheme(true)

export function useTheme(): Theme {
  const scheme = useColorScheme()
  return scheme === 'dark' ? darkTheme : light
}

/** Memoised StyleSheet-like factory keyed on the theme. */
export function useStyles<T>(factory: (th: Theme) => T): T {
  const th = useTheme()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(th), [th])
}

/** Soft card shadow (iOS) + elevation (Android). */
export const shadow = {
  card: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  float: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
} as const
