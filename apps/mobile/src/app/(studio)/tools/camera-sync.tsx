import { Linking, View } from 'react-native'
import { fmt, type Camera } from '@frameline/shared'
import { Button, Card, Chip, EmptyState, ErrorState, LoadingList, Screen, Txt, type ChipTone } from '@/components'
import { useCameras, useEvents } from '@/lib/queries'
import { useTheme } from '@/theme'

const STATUS: Record<Camera['status'], { label: string; tone: ChipTone }> = { receiving: { label: 'Receiving', tone: 'ok' }, idle: { label: 'Waiting', tone: 'accent' }, offline: { label: 'Offline', tone: 'neutral' } }

/** Camera sync on a phone: which cameras are sending photos right now. Adding a camera (FTP details) is on the web. */
export default function CameraSync() {
  const { c } = useTheme()
  const { data: cameras, isLoading, error, refetch } = useCameras()
  const { data: events } = useEvents()
  if (isLoading) return <LoadingList />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  return (
    <Screen>
      <Txt v="small">Photos go straight from your camera to the event while you shoot. Guests see them in minutes.</Txt>
      {cameras?.length ? cameras.map((cam) => (
        <Card key={cam.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt weight="heavy" style={{ flex: 1 }}>{cam.label}</Txt>
            <Chip label={STATUS[cam.status].label} tone={STATUS[cam.status].tone} />
          </View>
          <Txt v="small">{events?.find((e) => e.id === cam.eventId)?.name ?? 'Event'} · {fmt.count(cam.today)} photos today</Txt>
          {cam.lastFile ? <Txt v="small" color={c.ink3}>Last photo: {cam.lastFile}</Txt> : null}
        </Card>
      )) : <EmptyState icon="camera" title="No cameras yet" body="Connect a camera on the web. You get FTP details to type into the camera once." />}
      <Button label="Add or change cameras on the web" icon="external-link" onPress={() => Linking.openURL('https://app.frameline.in/camera-sync')} />
    </Screen>
  )
}
