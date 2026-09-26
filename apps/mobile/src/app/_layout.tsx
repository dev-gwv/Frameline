import { useEffect } from 'react'
import { View } from 'react-native'
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium'
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold'
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular'
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium'
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold'
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold'
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold'
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium'
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono/700Bold'
import { ApiProvider } from '@/lib/api'
import { iconFonts, ToastHost } from '@/components'
import { useStackOptions } from '@/lib/nav'
import { useTheme } from '@/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})
SplashScreen.setOptions({ duration: 300, fade: true })

export const unstable_settings = { initialRouteName: 'index' }

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Fraunces_500Medium, Fraunces_600SemiBold,
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
    JetBrainsMono_500Medium, JetBrainsMono_700Bold,
    ...iconFonts,
  })
  const ready = loaded || !!error

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {})
  }, [ready])

  if (!ready) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ApiProvider>
          <Root />
        </ApiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

function Root() {
  const { c, dark } = useTheme()
  const stack = useStackOptions()
  const base = dark ? DarkTheme : DefaultTheme
  const navTheme = { ...base, colors: { ...base.colors, primary: c.accent, background: c.paper, card: c.paper, text: c.ink, border: c.line, notification: c.accent } }
  return (
    <ThemeProvider value={navTheme}>
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Stack screenOptions={stack}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="(guest)" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="(studio)" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="e/[shortId]" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="viewer" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="scan" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="join" options={{ title: 'Join an event', presentation: 'modal' }} />
          <Stack.Screen name="buy" options={{ title: 'Buy photos', presentation: 'modal' }} />
          <Stack.Screen name="enquiry" options={{ title: 'Enquire', presentation: 'modal' }} />
          <Stack.Screen name="guest-upload" options={{ title: 'Add your photos', presentation: 'modal' }} />
          <Stack.Screen name="share/[id]" options={{ title: 'Share gallery', presentation: 'modal' }} />
        </Stack>
        <ToastHost />
      </View>
    </ThemeProvider>
  )
}
