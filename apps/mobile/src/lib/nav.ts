import { useMemo } from 'react'
import { font, useTheme } from '@/theme'

/** Stack header options styled with Gilt tokens. */
export function useStackOptions() {
  const { c } = useTheme()
  return useMemo(() => ({
    headerStyle: { backgroundColor: c.paper },
    headerTintColor: c.ink,
    headerTitleStyle: { fontFamily: font.display, fontSize: 18, color: c.ink },
    headerLargeTitleStyle: { fontFamily: font.display, color: c.ink },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: c.paper },
  }), [c])
}

/** Bottom tab options styled with Gilt tokens. */
export function useTabOptions() {
  const { c } = useTheme()
  return useMemo(() => ({
    headerStyle: { backgroundColor: c.paper },
    headerTintColor: c.ink,
    headerTitleStyle: { fontFamily: font.display, fontSize: 20, color: c.ink },
    headerShadowVisible: false,
    headerTitleAlign: 'left' as const,
    tabBarActiveTintColor: c.accentText,
    tabBarInactiveTintColor: c.ink3,
    tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
    tabBarLabelStyle: { fontFamily: font.bodyBold, fontSize: 11 },
    sceneStyle: { backgroundColor: c.paper },
  }), [c])
}
