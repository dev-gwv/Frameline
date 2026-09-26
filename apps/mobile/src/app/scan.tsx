import { useRef, useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, Card, IconButton, Screen, Txt } from '@/components'
import { JoinForm, notFoundText, useOpenCode } from '@/components/guest'
import { parseCode } from '@/lib/links'
import { toast } from '@/lib/toast'
import { radius, useTheme } from '@/theme'

/** QR scanner (expo-camera barcode scanning) with a manual-code fallback when the camera is unavailable. */
export default function Scan() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const openCode = useOpenCode()
  const [permission, requestPermission] = useCameraPermissions()
  const [manual, setManual] = useState(false)
  const handled = useRef(false)
  const [status, setStatus] = useState('Point your camera at the QR on the invitation or venue standee.')

  const close = () => (router.canGoBack() ? router.back() : router.replace('/events'))

  const onScan = async ({ data }: BarcodeScanningResult) => {
    if (handled.current) return
    const parsed = parseCode(data)
    if (!parsed) { setStatus('That QR isn’t a Frameline gallery. Try the code printed under it.'); return }
    handled.current = true
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    try {
      await openCode(parsed, 'replace')
    } catch (e) {
      toast.error('Couldn’t open that code', notFoundText(parsed, e))
      handled.current = false
    }
  }

  const fallback = (title: string, body: string, action?: { label: string; onPress: () => void }) => (
    <Screen top contentStyle={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}><IconButton icon="x" label="Close" onPress={close} tone="soft" /></View>
      <Card style={{ gap: 10 }}>
        <Txt v="h3">{title}</Txt>
        <Txt v="small">{body}</Txt>
        {action ? <Button label={action.label} onPress={action.onPress} /> : null}
      </Card>
      <Card style={{ gap: 12 }}>
        <Txt v="h3">Type the code instead</Txt>
        <JoinForm autoFocus={manual} onDone={close} />
      </Card>
    </Screen>
  )

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />
  if (manual) return fallback('Enter the code', 'It’s the 7 characters printed under the QR, like 6402F9F.')
  if (!permission.granted) {
    return permission.canAskAgain
      ? fallback('Allow the camera to scan', 'Frameline uses the camera only while this screen is open.', { label: 'Allow camera', onPress: () => { requestPermission() } })
      : fallback('Camera access is off', 'Turn on camera access for Frameline in Settings, or type the code below.', { label: 'Open Settings', onPress: () => Linking.openSettings() })
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan}
        onMountError={() => setManual(true)} />
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <IconButton icon="x" label="Close scanner" tone="overlay" onPress={close} />
      </View>
      <View style={styles.center} pointerEvents="none">
        <View style={[styles.reticle, { borderColor: c.marker }]} />
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <Txt center color="#F3ECDF" accessibilityLiveRegion="polite">{status}</Txt>
        <Button label="Type the code instead" variant="dark" onPress={() => setManual(true)} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 10, right: 10, flexDirection: 'row' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  reticle: { width: 240, height: 240, borderWidth: 3, borderRadius: radius.modal + 10 },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 0, gap: 12, backgroundColor: 'rgba(12,10,8,0.55)', borderRadius: radius.card, padding: 14 },
})
