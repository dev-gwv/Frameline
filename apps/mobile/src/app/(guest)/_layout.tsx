import { Stack } from 'expo-router'
import { useStackOptions } from '@/lib/nav'

export default function GuestLayout() {
  const stack = useStackOptions()
  return (
    <Stack screenOptions={stack}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="event/[id]/index" options={{ headerShown: false }} />
      <Stack.Screen name="event/[id]/photos" options={{ title: '' }} />
      <Stack.Screen name="event/[id]/selfie" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="studio/[code]" options={{ title: '' }} />
    </Stack>
  )
}
