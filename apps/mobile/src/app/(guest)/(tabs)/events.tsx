import { View } from 'react-native'
import { router } from 'expo-router'
import { Card, EmptyState, Screen, SectionHeader, Txt } from '@/components'
import { EventCard, JoinForm } from '@/components/guest'
import { useLocal } from '@/lib/local'
import { useTheme } from '@/theme'

export default function GuestEvents() {
  const { c } = useTheme()
  const joined = useLocal((s) => s.joined)
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
          {joined.map((j) => <EventCard key={j.eventId} eventId={j.eventId} onPress={() => router.push({ pathname: '/event/[id]', params: { id: j.eventId } })} />)}
        </>
      ) : (
        <EmptyState icon="image" title="No events yet" body="Events you open appear here so you can come back to your photos any time."
          action="Try the sample wedding" onAction={() => router.push('/e/6402F9F')} />
      )}
      <Txt v="small" center color={c.ink3}>Sample codes: event 6402F9F (PIN 5211) · studio FA-KCGWHY</Txt>
    </Screen>
  )
}
