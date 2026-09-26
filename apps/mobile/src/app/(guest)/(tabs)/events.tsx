import { useEffect } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Card, EmptyState, Screen, SectionHeader, Txt } from '@/components'
import { EventCard, JoinForm } from '@/components/guest'
import { API_MODE } from '@/lib/api'
import { actions, useLocal } from '@/lib/local'
import { useMyGalleries } from '@/lib/queries'
import { useTheme } from '@/theme'

export default function GuestEvents() {
  const { c } = useTheme()
  const joined = useLocal((s) => s.joined)
  // Galleries this device opened (listMyGalleries, keyed by X-Guest-Device); the local list is the instant cache.
  const { data: server } = useMyGalleries()
  useEffect(() => { if (server?.length) actions.mergeJoined(server) }, [server])
  return (
    <Screen>
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Txt v="h3">Open an event</Txt>
          <Txt v="small">Type the code from your invitation, or scan the QR at the venue.</Txt>
        </View>
        <JoinForm compact />
      </Card>

      {joined.length ? (
        <>
          <SectionHeader title="Your events" count={String(joined.length)} />
          {joined.map((j) => <EventCard key={j.eventId} shortId={j.shortId} eventId={j.eventId} onPress={() => router.push({ pathname: '/event/[id]', params: { id: j.shortId } })} />)}
        </>
      ) : (
        <EmptyState icon="image" title="No events yet" body="Events you open appear here so you can come back to your photos any time."
          action={API_MODE === 'mock' ? 'Try the sample wedding' : undefined} onAction={() => router.push('/e/6402F9F')} />
      )}
      {API_MODE === 'mock' ? <Txt v="small" center color={c.ink3}>Sample codes: event 6402F9F (PIN 5211) · studio FA-KCGWHY</Txt> : null}
    </Screen>
  )
}
