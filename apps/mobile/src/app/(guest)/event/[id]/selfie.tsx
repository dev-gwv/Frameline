import { useEffect, useState } from 'react'
import { Animated, Easing, Linking, StyleSheet, View, useAnimatedValue } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useQueryClient } from '@tanstack/react-query'
import { fmt } from '@frameline/shared'
import { Button, Card, Icon, Meter, Screen, Txt } from '@/components'
import { actions } from '@/lib/local'
import { myPhotosQuery, useEvent, useStudio } from '@/lib/queries'
import { useApi } from '@/lib/api'
import { toast } from '@/lib/toast'
import { goldGradient, useTheme } from '@/theme'

type Phase = { k: 'intro'; denied?: boolean } | { k: 'matching'; uri: string } | { k: 'found'; n: number }

export default function Selfie() {
  const { c } = useTheme()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: event } = useEvent(id)
  const { data: studio } = useStudio()
  const qc = useQueryClient()
  const api = useApi()
  const [phase, setPhase] = useState<Phase>({ k: 'intro' })

  const take = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) { setPhase({ k: 'intro', denied: true }); return }
    try {
      const res = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, mediaTypes: ['images'], quality: 0.6, allowsEditing: false })
      if (!res.canceled && res.assets[0]) setPhase({ k: 'matching', uri: res.assets[0].uri })
    } catch {
      toast.error('The camera isn’t available', 'Choose a photo of yourself from your gallery instead')
    }
  }
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, selectionLimit: 1 })
    if (!res.canceled && res.assets[0]) setPhase({ k: 'matching', uri: res.assets[0].uri })
  }

  // Simulated matching: ~2.6 s scan, then load the (deterministic) matches.
  useEffect(() => {
    if (phase.k !== 'matching' || !event) return
    let alive = true
    const t = setTimeout(async () => {
      actions.saveSelfie(event.id, phase.uri)
      const mine = await qc.fetchQuery(myPhotosQuery(api, event.id)).catch(() => null)
      if (!alive) return
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setPhase({ k: 'found', n: mine?.length ?? 0 })
    }, 2600)
    return () => { alive = false; clearTimeout(t) }
  }, [phase, event, qc, api])

  if (!event) return null

  if (phase.k === 'matching') return <Matching uri={phase.uri} total={event.photoCount} />

  if (phase.k === 'found') {
    return (
      <Screen contentStyle={{ alignItems: 'center', paddingTop: 60, gap: 14 }}>
        <View style={[styles.badge, { backgroundColor: c.accentSoft }]}><Icon name="check" size={34} color={c.accentText} /></View>
        <Txt v="h1" center>We found you in {phase.n} photos</Txt>
        <Txt v="small" center>From {event.name}. Favourite the ones you love — {studio?.name ?? 'the studio'} sees your picks.</Txt>
        <Button label="See your photos" variant="primary" size="lg" full style={{ marginTop: 12 }} onPress={() => { router.back(); router.push({ pathname: '/event/[id]/photos', params: { id: event.id, scope: 'mine' } }) }} />
      </Screen>
    )
  }

  return (
    <Screen contentStyle={{ gap: 18 }}>
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 12 }}>
        <View style={[styles.frame, { borderColor: c.line2, backgroundColor: c.sunk }]}>
          <Icon name="smile" size={64} color={c.ink3} />
        </View>
        <Txt v="h2" center>Find your photos with a selfie</Txt>
        <Txt v="small" center style={{ maxWidth: 320 }}>We compare your face with {fmt.count(event.photoCount)} photos from {event.name} and show you only the ones you’re in.</Txt>
      </View>
      <Card style={{ gap: 10 }}>
        {['Hold your phone at eye level, face the camera', 'Find good light; take off sunglasses', 'Just you in the frame'].map((t, i) => (
          <View key={t} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={[styles.step, { backgroundColor: c.accentSoft }]}><Txt v="mono" color={c.accentText} style={{ fontSize: 12 }}>{i + 1}</Txt></View>
            <Txt style={{ flex: 1 }}>{t}</Txt>
          </View>
        ))}
      </Card>
      {phase.denied ? (
        <Card style={{ gap: 10, backgroundColor: c.warnSoft, borderColor: 'transparent' }}>
          <Txt weight="bold">Camera access is off</Txt>
          <Txt v="small">Allow the camera in Settings, or choose a clear photo of yourself from your gallery.</Txt>
          <Button label="Open Settings" size="sm" onPress={() => Linking.openSettings()} />
        </Card>
      ) : null}
      <Button label="Take a selfie" icon="camera" variant="primary" size="lg" onPress={take} />
      <Button label="Choose a photo from my gallery" icon="image" onPress={pick} />
      <Txt v="small" center color={c.ink2}>Your selfie is only used to match you and is deleted after 30 days.</Txt>
    </Screen>
  )
}

function Matching({ uri, total }: { uri: string; total: number }) {
  const { c } = useTheme()
  const spin = useAnimatedValue(0)
  const [scanned, setScanned] = useState(0)
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    const started = Date.now()
    const t = setInterval(() => setScanned(Math.min(total, Math.round(((Date.now() - started) / 2500) * total))), 80)
    return () => { loop.stop(); clearInterval(t) }
  }, [spin, total])
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  return (
    <View style={{ flex: 1, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }} accessibilityLiveRegion="polite">
      <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
          <LinearGradient {...goldGradient} colors={[goldGradient.colors[0], 'transparent', goldGradient.colors[2]]} locations={[0, 0.5, 1]} style={{ flex: 1, borderRadius: 100 }} />
        </Animated.View>
        <Image source={{ uri }} style={{ width: 184, height: 184, borderRadius: 92, borderWidth: 4, borderColor: c.paper }} contentFit="cover" />
      </View>
      <Txt v="h2" center>Finding you…</Txt>
      <Txt v="small" center>Looking through <Txt v="mono">{fmt.count(scanned)}</Txt> of <Txt v="mono">{fmt.count(total)}</Txt> photos</Txt>
      <View style={{ alignSelf: 'stretch' }}><Meter value={scanned} max={total} /></View>
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  step: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
})
