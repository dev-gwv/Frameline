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
      <Stack.Screen name="manage/[id]" options={{ title: '' }} />
    </Stack>
  )
}
