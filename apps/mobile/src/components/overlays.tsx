import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react'
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, useAnimatedValue, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, G, Rect } from 'react-native-svg'
import { FlashList } from '@shopify/flash-list'
import { encode } from 'uqr'
import { gold, palette, type Photo } from '@frameline/shared'
import { dismiss, useToasts, type ToastItem } from '@/lib/toast'
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

/** Dark pill at the bottom, above the tab bar (dark floating UI is allowed); the action (Undo) is gold. */
export function ToastHost() {
  const items = useToasts()
  const insets = useSafeAreaInsets()
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', paddingBottom: insets.bottom + 64, paddingHorizontal: 12 }]}>
      {items.map((t) => <ToastRow key={t.id} item={t} />)}
    </View>
  )
}

function ToastRow({ item }: { item: ToastItem }) {
  const { c, dark } = useTheme()
  const y = useAnimatedValue(30)
  const o = useAnimatedValue(0)
  useEffect(() => {
    Animated.parallel([Animated.spring(y, { toValue: 0, useNativeDriver: true }), Animated.timing(o, { toValue: 1, duration: 160, useNativeDriver: true })]).start()
  }, [o, y])
  const color = item.kind === 'error' ? c.bad : item.kind === 'success' ? palette.dark.ok : gold.highlight
  return (
    <Animated.View accessibilityLiveRegion="polite" style={{ transform: [{ translateY: y }], opacity: o, marginTop: 8, alignSelf: 'center', maxWidth: 520, width: '100%' }}>
      <View accessibilityRole="alert" style={[styles.toast, { backgroundColor: dark ? c.line2 : c.side }, shadow.float]}>
        <Icon name={item.kind === 'error' ? 'alert-triangle' : item.kind === 'success' ? 'check-circle' : 'info'} size={18} color={color} />
        <Pressable style={{ flex: 1, paddingVertical: 2 }} onPress={() => dismiss(item.id)} accessibilityRole="button" accessibilityLabel={`${item.title}. Dismiss`}>
          <Text style={{ color: c.sideInk, fontFamily: font.bodyBold, fontSize: 14 }}>{item.title}</Text>
          {item.detail ? <Text style={{ color: c.sideInk2, fontFamily: font.body, fontSize: 12.5, marginTop: 2 }}>{item.detail}</Text> : null}
        </Pressable>
        {item.action ? (
          <Pressable accessibilityRole="button" accessibilityLabel={item.action.label} hitSlop={8} onPress={() => { item.action!.onPress(); dismiss(item.id) }}
            style={({ pressed }) => ({ minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: gold.highlight, fontFamily: font.bodyHeavy, fontSize: 14.5 }}>{item.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  )
}

/* ---------------- QR code (real, scannable: uqr matrix drawn with react-native-svg) ---------------- */

/**
 * Encodes `value` with error correction Q and a 1-module quiet zone. Finder patterns are drawn as rounded squares
 * when `rounded`; data modules as dots — still well within what scanners accept at ECC Q.
 */
export function QRCode({ value, size = 160, color = '#1B1712', rounded = false }: { value: string; size?: number; color?: string; rounded?: boolean }) {
  const matrix = useMemo(() => encode(value, { ecc: 'Q', border: 1 }).data, [value])
  const n = matrix.length
  const c = size / n
  // Finder patterns sit at (1,1), (n-8,1), (1,n-8) with a 1-module border.
  const isFinder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7
    return inBox(1, 1) || inBox(n - 8, 1) || inBox(1, n - 8)
  }
  const cells: [number, number][] = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (matrix[y]![x] && !(rounded && isFinder(x, y))) cells.push([x, y])
  const finder = (a: number, b: number) => (
    <G key={`${a}-${b}`}>
      <Rect x={a * c} y={b * c} width={7 * c} height={7 * c} rx={c * 2} fill={color} />
      <Rect x={(a + 1) * c} y={(b + 1) * c} width={5 * c} height={5 * c} rx={c * 1.4} fill="#fff" />
      <Rect x={(a + 2) * c} y={(b + 2) * c} width={3 * c} height={3 * c} rx={c} fill={color} />
    </G>
  )
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityLabel={`QR code for ${value}`} accessibilityRole="image">
      <Rect width={size} height={size} fill="#fff" />
      {cells.map(([x, y]) => rounded
        ? <Circle key={`${x}-${y}`} cx={x * c + c / 2} cy={y * c + c / 2} r={c * 0.46} fill={color} />
        : <Rect key={`${x}-${y}`} x={x * c} y={y * c} width={c + 0.25} height={c + 0.25} fill={color} />)}
      {rounded ? <>{finder(1, 1)}{finder(n - 8, 1)}{finder(1, n - 8)}</> : null}
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
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 6, paddingVertical: 8, borderRadius: radius.card + 4, minHeight: 52 },
})
