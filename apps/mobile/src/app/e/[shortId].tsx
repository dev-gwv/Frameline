import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { EmptyState, Txt } from '@/components'
import { actions, local } from '@/lib/local'
import { useEvent } from '@/lib/queries'
import { useTheme } from '@/theme'

/** Deep-link entry: frameline://e/<shortId>?n=<welcome name> (and https links via +native-intent). */
export default function OpenEventLink() {
  const { c } = useTheme()
  const { shortId, n } = useLocalSearchParams<{ shortId: string; n?: string }>()
  const { data: event, error } = useEvent(shortId)

  useEffect(() => {
    if (!event) return
    if (!local.get().mode) actions.setMode('guest')
    actions.join(event, n || undefined)
    router.replace({ pathname: '/event/[id]', params: { id: event.id } })
  }, [event, n])

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center' }}>
        <EmptyState icon="link" title="This link doesn’t open a gallery" body={`We couldn’t find an event with code ${String(shortId).toUpperCase()}. Check the link on your invitation or ask the photographer for a new one.`}
          action="Enter a code instead" onAction={() => router.replace('/join')} secondary="Go to my events" onSecondary={() => router.replace('/events')} />
      </View>
    )
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <ActivityIndicator color={c.accent} />
      <Txt v="small">Opening gallery…</Txt>
    </View>
  )
}
