import { memo, useEffect, type ReactNode } from 'react'
import { Animated, Pressable, StyleSheet, Text, View, useAnimatedValue, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Image } from 'expo-image'
import type { Photo, Tone } from '@frameline/shared'
import { font, useTheme } from '@/theme'
import { Icon } from './Icon'

/** CSS-style angle → expo-linear-gradient start/end points. */
export function toneVector(angle: number) {
  const rad = (angle * Math.PI) / 180
  const dx = Math.sin(rad) / 2, dy = -Math.cos(rad) / 2
  return { start: { x: 0.5 - dx, y: 0.5 - dy }, end: { x: 0.5 + dx, y: 0.5 + dy } }
}

/** A placeholder photo swatch: the tone's 3-stop gradient at its angle (mirrors web `toneCss`). */
export function ToneView({ tone, style, children }: { tone: Tone; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const { start, end } = toneVector(tone.angle)
  return <LinearGradient colors={tone.stops} locations={[0, 0.55, 1]} start={start} end={end} style={style}>{children}</LinearGradient>
}

type TilePhoto = Pick<Photo, 'id' | 'tone' | 'url' | 'status'> & Partial<Pick<Photo, 'hidden'>>

/** Photo in a grid: real image via expo-image, tone gradient otherwise; shimmer while processing. */
export const PhotoTile = memo(function PhotoTile({ photo, size, onPress, selected, favourite, radius = 4, label, onLongPress }: {
  photo: TilePhoto; size: number; onPress?: () => void; onLongPress?: () => void; selected?: boolean; favourite?: boolean; radius?: number; label?: string
}) {
  const { c } = useTheme()
  const processing = photo.status === 'processing'
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress} accessibilityRole={onPress ? 'imagebutton' : 'image'} accessibilityLabel={label ?? 'Photo'}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: radius, overflow: 'hidden', opacity: pressed ? 0.85 : 1 }]}>
      <PhotoFill photo={photo} />
      {processing ? <Shimmer /> : null}
      {processing ? <View style={styles.processingTag}><Text style={styles.processingText}>Processing</Text></View> : null}
      {photo.hidden ? <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(12,10,8,0.5)' }]}><Icon name="eye-off" size={18} color="#F3ECDF" /></View> : null}
      {favourite ? <View style={styles.fav}><Icon name="heart" size={12} color="#F2D38A" /></View> : null}
      {selected ? <View style={[StyleSheet.absoluteFill, { borderWidth: 3, borderColor: c.marker, borderRadius: radius }]} /> : null}
    </Pressable>
  )
})

/** Fills its parent with the photo (image or tone). */
export function PhotoFill({ photo, contentFit = 'cover' }: { photo: Pick<Photo, 'tone' | 'url'>; contentFit?: 'cover' | 'contain' }) {
  return (
    <>
      <ToneView tone={photo.tone} style={StyleSheet.absoluteFill} />
      {photo.url ? <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit={contentFit} transition={180} recyclingKey={photo.url} /> : null}
    </>
  )
}

function Shimmer() {
  const x = useAnimatedValue(-1)
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1100, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [x])
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,10,8,0.35)', overflow: 'hidden' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: x.interpolate({ inputRange: [-1, 1], outputRange: [-160, 160] }) }] }]}>
        <LinearGradient colors={['transparent', 'rgba(255,255,255,0.28)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ width: 80, height: '100%', alignSelf: 'center' }} />
      </Animated.View>
    </View>
  )
}

/** Three stacked tones used as an event cover mosaic. */
export function CoverMosaic({ tones, style, height = 120 }: { tones: [Tone, Tone, Tone]; style?: StyleProp<ViewStyle>; height?: number }) {
  return (
    <View style={[{ flexDirection: 'row', height, gap: 2 }, style]}>
      <ToneView tone={tones[0]} style={{ flex: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <ToneView tone={tones[1]} style={{ flex: 1 }} />
        <ToneView tone={tones[2]} style={{ flex: 1 }} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  processingTag: { position: 'absolute', left: 4, bottom: 4, backgroundColor: 'rgba(12,10,8,0.6)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  processingText: { color: '#F3ECDF', fontFamily: font.bodyBold, fontSize: 9 },
  fav: { position: 'absolute', right: 4, top: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(12,10,8,0.5)', alignItems: 'center', justifyContent: 'center' },
})
