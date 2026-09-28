import { Linking, Share, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { fmt } from '@frameline/shared'
import { Button, Card, EmptyState, ErrorState, LoadingList, QRCode, Screen, Txt } from '@/components'
import { useEvents, useQRs } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { radius, useTheme } from '@/theme'

/** Smart QR: printed codes you can point at any event. Styles, posters and scheduling are on the web. */
export default function SmartQR() {
  const { c } = useTheme()
  const { data: qrs, isLoading, error, refetch } = useQRs()
  const { data: events } = useEvents()
  if (isLoading) return <LoadingList />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  return (
    <Screen>
      <Txt v="small">Print one QR for your stall or studio, then point it at whichever event is on.</Txt>
      {qrs?.length ? qrs.map((q) => {
        const url = `https://frameline.in/q/${q.slug}`
        return (
          <Card key={q.id} style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <View style={{ padding: 6, backgroundColor: '#fff', borderRadius: radius.control }}><QRCode value={url} size={84} color={q.color} rounded={q.dotStyle !== 'square'} /></View>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt weight="heavy">{q.name}</Txt>
              <Txt v="small" numberOfLines={1}>Opens {events?.find((e) => e.id === q.eventId)?.name ?? 'an event'}</Txt>
              <Txt v="small" color={c.ink3} style={{ fontVariant: ['tabular-nums'] }}>{fmt.count(q.scans)} scans · frameline.in/q/{q.slug}</Txt>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Button label="Copy" icon="copy" size="sm" onPress={async () => { await Clipboard.setStringAsync(url); toast.success('Link copied') }} />
                <Button label="Share" icon="share" size="sm" onPress={() => Share.share({ message: url })} />
              </View>
            </View>
          </Card>
        )
      }) : <EmptyState icon="grid" title="No Smart QR yet" body="Make one on the web, print it once and reuse it at every event." />}
      <Button label="Change or print on the web" icon="external-link" onPress={() => Linking.openURL('https://app.frameline.in/qr')} />
    </Screen>
  )
}
