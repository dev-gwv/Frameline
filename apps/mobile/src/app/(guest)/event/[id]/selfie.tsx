import { useEffect, useState } from 'react'
import { Animated, Easing, Linking, StyleSheet, View, useAnimatedValue } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { useQueryClient } from '@tanstack/react-query'
import { fmt, gold, palette } from '@frameline/shared'
import { Button, Icon, IconButton, Screen, SoftCard, Txt } from '@/components'
import { friendlyError } from '@/lib/errors'
import { actions } from '@/lib/local'
import { usePublicEvent } from '@/lib/queries'
import { useApi } from '@/lib/api'
import { toast } from '@/lib/toast'
import { font, useTheme } from '@/theme'

type Picked = { uri: string; name: string; size: number; width?: number; height?: number }
type Phase = { k: 'intro'; denied?: boolean; noFace?: boolean } | { k: 'confirm'; pic: Picked } | { k: 'matching'; pic: Picked }

const picked = (a: ImagePicker.ImagePickerAsset): Picked => ({ uri: a.uri, name: a.fileName ?? a.uri.split('/').pop() ?? 'selfie.jpg', size: a.fileSize ?? a.width * a.height, width: a.width, height: a.height })
const D = palette.dark

/**
 * Selfie flow (g-home / g-mine): tips (when opened directly), "Use this selfie?", then "Finding your photos…".
 * The match is saved and we go back: the event opens on My photos (with the result, or "We couldn't find you yet").
 */
export default function Selfie() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ id: string; uri?: string; name?: string; size?: string; w?: string; h?: string }>()
  const { data: event } = usePublicEvent(params.id)
  const qc = useQueryClient()
  const api = useApi()
  const [phase, setPhase] = useState<Phase>(params.uri ? { k: 'confirm', pic: { uri: params.uri, name: params.name ?? 'selfie.jpg', size: Number(params.size) || 1, width: Number(params.w) || undefined, height: Number(params.h) || undefined } } : { k: 'intro' })

  const take = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) { setPhase({ k: 'intro', denied: true }); return }
    try {
      const res = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, mediaTypes: ['images'], quality: 0.6, allowsEditing: false })
      if (!res.canceled && res.assets[0]) setPhase({ k: 'confirm', pic: picked(res.assets[0]) })
    } catch { toast.error('The camera isn’t available', 'Choose a photo of yourself instead') }
  }
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, selectionLimit: 1 })
    if (!res.canceled && res.assets[0]) setPhase({ k: 'confirm', pic: picked(res.assets[0]) })
  }

  // searchFaces with a stable key for the selfie (`${event.id}:${name}:${size}`); the animation runs at least 1.8 s.
  useEffect(() => {
    if (phase.k !== 'matching' || !event) return
    let alive = true
    const { pic } = phase
    ;(async () => {
      const key = `${event.id}:${pic.name}:${pic.size}`
      try {
        const [match] = await Promise.all([api.searchFaces(event.shortId, { key, image: pic.width && pic.height ? { width: pic.width, height: pic.height } : undefined }), new Promise((r) => setTimeout(r, 1800))])
        if (!alive) return
        if (match.faceFound === false) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
          setPhase({ k: 'intro', noFace: true })
          return
        }
        actions.saveSelfie(event.id, { uri: pic.uri, key, personId: match.personId, photoIds: match.photoIds })
        qc.invalidateQueries({ queryKey: ['my-photos', event.shortId.toUpperCase()] })
        Haptics.notificationAsync(match.photoIds.length ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {})
        if (router.canGoBack()) router.back()
        else router.replace({ pathname: '/event/[id]', params: { id: event.shortId, tab: 'mine' } })
      } catch (e) {
        if (!alive) return
        const f = friendlyError(e)
        toast.error(f.title, f.detail)
        setPhase({ k: 'confirm', pic })
      }
    })()
    return () => { alive = false }
  }, [phase, event, qc, api])

  if (!event) return null

  if (phase.k === 'matching') return <Matching uri={phase.pic.uri} total={event.photoCount} />

  if (phase.k === 'confirm') {
    return (
      <View style={{ flex: 1, backgroundColor: D.paper, alignItems: 'center', justifyContent: 'center', paddingBottom: insets.bottom + 24 }}>
        <Txt style={{ color: D.ink, fontFamily: font.bodyHeavy, fontSize: 18, marginBottom: 20 }}>Use this selfie?</Txt>
        <Image source={{ uri: phase.pic.uri }} style={{ width: 210, height: 270, borderRadius: 135, borderWidth: 3, borderColor: gold.stops[1] }} contentFit="cover" />
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 20, gap: 10 }}>
          <Button label="Find my photos" variant="primary" size="lg" onPress={() => setPhase({ k: 'matching', pic: phase.pic })} />
          <Button label="Retake" variant="dark" onPress={() => setPhase({ k: 'intro' })} />
        </View>
      </View>
    )
  }

  return (
    <Screen top contentStyle={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: -8 }}><IconButton icon="x" label="Close" tone="soft" onPress={() => router.back()} /></View>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <View style={[styles.frame, { borderColor: c.line2, backgroundColor: c.sunk }]}><Icon name="face" size={60} color={c.ink3} /></View>
        <Txt v="h3" center style={{ fontSize: 19 }}>Find your photos with a selfie</Txt>
        <Txt v="small" center style={{ maxWidth: 320 }}>We look through {fmt.count(event.photoCount)} photos from {event.name} and show only the ones you’re in.</Txt>
      </View>
      <View style={{ gap: 10 }}>
        {['Face the camera in good light', 'Take off sunglasses', 'Only used to find you in this event'].map((t) => (
          <View key={t} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Icon name="check" size={16} color={c.ok} />
            <Txt>{t}</Txt>
          </View>
        ))}
      </View>
      {phase.noFace ? (
        <SoftCard style={{ gap: 4 }}>
          <Txt weight="bold">We couldn’t see a face — try another photo</Txt>
          <Txt v="small">Face the camera in good light, close enough that your face fills the circle.</Txt>
        </SoftCard>
      ) : null}
      {phase.denied ? (
        <SoftCard style={{ gap: 8 }}>
          <Txt weight="bold">Camera access is off</Txt>
          <Txt v="small">Allow the camera in Settings, or choose a clear photo of yourself.</Txt>
          <Button label="Open Settings" size="sm" onPress={() => Linking.openSettings()} />
        </SoftCard>
      ) : null}
      <Button label="Take a selfie" icon="camera" variant="primary" size="lg" onPress={take} />
      <Button label="Choose a photo" icon="image" onPress={pick} />
    </Screen>
  )
}

function Matching({ uri, total }: { uri: string; total: number }) {
  const { c } = useTheme()
  const pulse = useAnimatedValue(0)
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [pulse])
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })
  return (
    <View style={{ flex: 1, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 6 }} accessibilityLiveRegion="polite">
      <Animated.View style={{ transform: [{ scale }], marginBottom: 18, borderRadius: 70, padding: 6, backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.accent }}>
        <Image source={{ uri }} style={{ width: 120, height: 120, borderRadius: 60 }} contentFit="cover" />
      </Animated.View>
      <Txt weight="heavy" style={{ fontSize: 17 }}>Finding your photos…</Txt>
      <Txt v="small">Looking through {fmt.count(total)} photos</Txt>
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { width: 130, height: 130, borderRadius: 65, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
})
