import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react'
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, useAnimatedValue, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, G, Rect } from 'react-native-svg'
import { FlashList } from '@shopify/flash-list'
import type { Photo } from '@frameline/shared'
import { dismiss, useToasts } from '@/lib/toast'
import { font, radius, shadow, useTheme } from '@/theme'
import { Icon } from './Icon'
import { IconButton, Txt } from './primitives'
import { PhotoTile } from './photo'

/* ---------------- Bottom sheet (in-screen) ---------------- */

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,10,8,0.45)' }]} />
        <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + 12, maxHeight: height * 0.88 }, shadow.float]}>
          <View style={[styles.grabber, { backgroundColor: c.line2 }]} />
          {title ? (
            <View style={styles.sheetHead}>
              <Txt v="h3" style={{ flex: 1 }}>{title}</Txt>
              <IconButton icon="x" label="Close" onPress={onClose} tone="soft" size={36} />
            </View>
          ) : null}
          <View style={{ flexShrink: 1 }}>{children}</View>
          {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

/* ---------------- Toasts ---------------- */

export function ToastHost() {
  const items = useToasts()
  const insets = useSafeAreaInsets()
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-start', paddingTop: insets.top + 8, paddingHorizontal: 16 }]}>
      {items.map((t) => <ToastRow key={t.id} id={t.id} kind={t.kind} title={t.title} detail={t.detail} />)}
    </View>
  )
}

function ToastRow({ id, kind, title, detail }: { id: number; kind: 'success' | 'error' | 'info'; title: string; detail?: string }) {
  const { c, dark } = useTheme()
  const y = useAnimatedValue(-30)
  const o = useAnimatedValue(0)
  useEffect(() => {
    Animated.parallel([Animated.spring(y, { toValue: 0, useNativeDriver: true }), Animated.timing(o, { toValue: 1, duration: 160, useNativeDriver: true })]).start()
  }, [o, y])
  const color = kind === 'error' ? c.bad : kind === 'success' ? c.ok : c.accent
  return (
    <Animated.View accessibilityLiveRegion="polite" style={{ transform: [{ translateY: y }], opacity: o, marginBottom: 8 }}>
      <Pressable accessibilityRole="alert" onPress={() => dismiss(id)} style={[styles.toast, { backgroundColor: dark ? c.side2 : c.side, borderColor: c.sideLine }, shadow.float]}>
        <Icon name={kind === 'error' ? 'alert-triangle' : kind === 'success' ? 'check-circle' : 'info'} size={18} color={color} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.sideInk, fontFamily: font.bodyBold, fontSize: 14 }}>{title}</Text>
          {detail ? <Text style={{ color: c.sideInk2, fontFamily: font.body, fontSize: 12.5, marginTop: 2 }}>{detail}</Text> : null}
        </View>
      </Pressable>
    </Animated.View>
  )
}

/* ---------------- QR code (decorative; same deterministic pattern as packages/ui QRCode) ---------------- */

export function QRCode({ seed, size = 160, color = '#1B1712', rounded = false }: { seed: number; size?: number; color?: string; rounded?: boolean }) {
  const cells = useMemo(() => {
    let x = seed * 9301 + 49297
    const r = () => (x = (x * 9301 + 49297) % 233280) / 233280
    const out: [number, number][] = []
    for (let i = 0; i < 21; i++) for (let j = 0; j < 21; j++) {
      const inFinder = (i < 8 && j < 8) || (i > 12 && j < 8) || (i < 8 && j > 12)
      if (!inFinder && r() > 0.52) out.push([i, j])
    }
    return out
  }, [seed])
  const c = size / 21
  const finder = (a: number, b: number) => (
    <G key={`${a}-${b}`}>
      <Rect x={a * c} y={b * c} width={7 * c} height={7 * c} rx={rounded ? c * 2 : 0} fill={color} />
      <Rect x={(a + 1) * c} y={(b + 1) * c} width={5 * c} height={5 * c} rx={rounded ? c * 1.4 : 0} fill="#fff" />
      <Rect x={(a + 2) * c} y={(b + 2) * c} width={3 * c} height={3 * c} rx={rounded ? c : 0} fill={color} />
    </G>
  )
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityLabel="QR code" accessibilityRole="image">
      <Rect width={size} height={size} fill="#fff" />
      {cells.map(([i, j]) => rounded
        ? <Circle key={`${i}-${j}`} cx={i * c + c / 2} cy={j * c + c / 2} r={c * 0.45} fill={color} />
        : <Rect key={`${i}-${j}`} x={i * c} y={j * c} width={c} height={c} fill={color} />)}
      {finder(0, 0)}{finder(14, 0)}{finder(0, 14)}
    </Svg>
  )
}

/* ---------------- Photo grid ---------------- */

export function PhotoGrid({ photos, onPress, header, footer, favourites, columns = 3, bottomInset = 0, empty }: {
  photos: Photo[]; onPress?: (p: Photo, index: number) => void; header?: ReactElement | null; footer?: ReactElement | null; favourites?: Set<string>; columns?: number; bottomInset?: number; empty?: ReactElement | null
}) {
  const { width } = useWindowDimensions()
  const gap = 3
  const size = Math.floor((width - gap * (columns - 1)) / columns)
  const { c } = useTheme()
  return (
    <FlashList
      data={photos}
      numColumns={columns}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ListEmptyComponent={empty}
      style={{ backgroundColor: c.paper }}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      renderItem={({ item, index }) => (
        <View style={{ paddingBottom: gap, alignItems: index % columns === 0 ? 'flex-start' : index % columns === columns - 1 ? 'flex-end' : 'center' }}>
          <PhotoTile photo={item} size={size} favourite={favourites?.has(item.id)} label={`Photo ${index + 1}, ${item.filename}`} onPress={onPress ? () => onPress(item, index) : undefined} />
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: radius.modal + 6, borderTopRightRadius: radius.modal + 6, paddingTop: 8 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 6 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.card, borderWidth: 1 },
})
