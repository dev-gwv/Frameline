import { useEffect } from 'react'
import { Redirect, Stack } from 'expo-router'
import { useApi } from '@/lib/api'
import { useLocal } from '@/lib/local'
import { useStackOptions } from '@/lib/nav'
import { uploads } from '@/lib/uploads'

export default function StudioLayout() {
  const session = useLocal((s) => s.studioSession)
  const stack = useStackOptions()
  const api = useApi()
  useEffect(() => { uploads.bind(api) }, [api])
  if (!session) return <Redirect href="/sign-in" />
  return (
    <Stack screenOptions={stack}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="manage/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="new-event" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="sell" options={{ title: 'Sell photos' }} />
      <Stack.Screen name="tools/watermark" options={{ title: 'Watermark' }} />
      <Stack.Screen name="tools/camera-sync" options={{ title: 'Camera sync' }} />
      <Stack.Screen name="tools/qr" options={{ title: 'Smart QR' }} />
      <Stack.Screen name="tools/messages" options={{ title: 'Messages to guests' }} />
      <Stack.Screen name="tools/plan" options={{ title: 'Plan and billing' }} />
      <Stack.Screen name="tools/team" options={{ title: 'Team' }} />
      <Stack.Screen name="tools/help" options={{ title: 'Help' }} />
    </Stack>
  )
}
