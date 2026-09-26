import { forwardRef, useEffect, type ReactNode } from 'react'
import {
  ActivityIndicator, Animated, Pressable, useAnimatedValue, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type PressableProps, type ScrollViewProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { gold, type EventStatus } from '@frameline/shared'
import { font, goldGradient, radius, shadow, useTheme } from '@/theme'
import { Icon, type IconName } from './Icon'

/* ---------------- Text ---------------- */

type TxtVariant = 'body' | 'small' | 'label' | 'eyebrow' | 'mono' | 'title' | 'h1' | 'h2' | 'h3'
export function Txt({ v = 'body', color, style, weight, center, ...rest }: TextProps & { v?: TxtVariant; color?: string; weight?: 'regular' | 'semi' | 'bold' | 'heavy'; center?: boolean }) {
  const { t, c } = useTheme()
  const base: TextStyle =
    v === 'h1' ? t.display(30) : v === 'h2' ? t.display(24) : v === 'h3' ? t.display(19) : v === 'title' ? { ...t.body, fontFamily: font.bodyBold, fontSize: 16 }
      : v === 'small' ? t.small : v === 'label' ? t.label : v === 'eyebrow' ? t.eyebrow : v === 'mono' ? t.mono : t.body
  const w: TextStyle | undefined = weight === 'regular' ? { fontFamily: font.bodyRegular } : weight === 'semi' ? { fontFamily: font.bodySemi } : weight === 'bold' ? { fontFamily: font.bodyBold } : weight === 'heavy' ? { fontFamily: font.bodyHeavy } : undefined
  return <Text maxFontSizeMultiplier={1.6} {...rest} style={[base, w, color ? { color } : null, center && { textAlign: 'center' }, v === 'mono' && !color && { color: c.ink }, style]} />
}

/* ---------------- Buttons ---------------- */

export type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'ghost' | 'danger'
export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  iconRight?: IconName
  loading?: boolean
  full?: boolean
  style?: StyleProp<ViewStyle>
}

export function Button({ label, variant = 'secondary', size = 'md', icon, iconRight, loading, full, disabled, style, onPress, ...rest }: ButtonProps) {
  const { c, dark } = useTheme()
  const h = size === 'lg' ? 54 : size === 'sm' ? 36 : 46
  const fg = variant === 'primary' ? c.accentInk : variant === 'dark' ? c.sideInk : variant === 'ghost' ? c.accentText : variant === 'danger' ? c.bad : c.ink
  const bg: ViewStyle =
    variant === 'dark' ? { backgroundColor: dark ? c.side2 : c.side, borderColor: c.sideLine }
      : variant === 'secondary' ? { backgroundColor: c.surface, borderColor: c.line2 }
        : variant === 'danger' ? { backgroundColor: c.badSoft, borderColor: 'transparent' }
          : { backgroundColor: 'transparent', borderColor: 'transparent' }
  const inner = (
    <View style={[styles.btnInner, { height: h, paddingHorizontal: size === 'sm' ? 12 : 18 }]}>
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={size === 'lg' ? 20 : 17} color={fg} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: fg, fontFamily: font.bodyBold, fontSize: size === 'lg' ? 16 : size === 'sm' ? 13 : 15 }}>{label}</Text>
      {iconRight && !loading ? <Icon name={iconRight} size={16} color={fg} /> : null}
    </View>
  )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      hitSlop={size === 'sm' ? 4 : 0}
      onPress={(e) => {
        if (variant === 'primary') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
        onPress?.(e)
      }}
      style={({ pressed }) => [
        styles.btn,
        variant !== 'primary' && bg,
        full && { alignSelf: 'stretch' },
        { opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
        variant === 'primary' && shadow.card,
        style,
      ]}
      {...rest}
    >
      {variant === 'primary' ? <LinearGradient {...goldGradient} style={{ borderRadius: radius.control + 2 }}>{inner}</LinearGradient> : inner}
    </Pressable>
  )
}

export function IconButton({ icon, label, onPress, tone = 'plain', size = 44, color, active, badge }: { icon: IconName; label: string; onPress?: () => void; tone?: 'plain' | 'soft' | 'overlay'; size?: number; color?: string; active?: boolean; badge?: number }) {
  const { c } = useTheme()
  const bg = tone === 'soft' ? c.sunk : tone === 'overlay' ? 'rgba(12,10,8,0.45)' : 'transparent'
  const fg = color ?? (tone === 'overlay' ? '#F3ECDF' : active ? c.accentText : c.ink)
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={20} color={fg} />
      {badge ? <View style={[styles.badge, { backgroundColor: c.accent }]}><Text style={{ color: c.accentInk, fontFamily: font.bodyHeavy, fontSize: 10 }}>{badge}</Text></View> : null}
    </Pressable>
  )
}

/* ---------------- Chip ---------------- */

export type ChipTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'dark'
export function Chip({ label, tone = 'neutral', selected, onPress, count, icon, dot }: { label: string; tone?: ChipTone; selected?: boolean; onPress?: () => void; count?: number | string; icon?: IconName; dot?: boolean }) {
  const { c } = useTheme()
  const map: Record<ChipTone, [string, string]> = {
    neutral: [c.sunk, c.ink2], accent: [c.accentSoft, c.accentText], ok: [c.okSoft, c.ok], warn: [c.warnSoft, c.warn], bad: [c.badSoft, c.bad], dark: [c.side, c.sideInk],
  }
  const [bg, fg] = selected ? [c.side, '#F2D38A'] : map[tone]
  const body = (
    <View style={[styles.chip, { backgroundColor: bg, minHeight: onPress ? 36 : 24, paddingHorizontal: onPress ? 14 : 9 }]}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} /> : null}
      {icon ? <Icon name={icon} size={13} color={fg} /> : null}
      <Text maxFontSizeMultiplier={1.4} style={{ color: fg, fontFamily: font.bodyBold, fontSize: onPress ? 13 : 12 }}>{label}</Text>
      {count !== undefined ? <Text style={{ color: fg, fontFamily: font.mono, fontSize: 12, opacity: 0.8 }}>{count}</Text> : null}
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={`${label}${count !== undefined ? ` ${count}` : ''}`} onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress() }} hitSlop={4}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  )
}

const STATUS: Record<EventStatus, { label: string; tone: ChipTone }> = {
  live: { label: 'Live', tone: 'ok' }, uploading: { label: 'Uploading', tone: 'accent' }, expiring: { label: 'Expiring', tone: 'warn' },
  draft: { label: 'Draft', tone: 'neutral' }, archived: { label: 'Archived', tone: 'neutral' },
}
export const EventStatusChip = ({ status }: { status: EventStatus }) => <Chip label={STATUS[status].label} tone={STATUS[status].tone} dot />
export const statusLabel = (s: EventStatus) => STATUS[s].label

/* ---------------- Cards ---------------- */

export function Card({ children, style, padded = true, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean; onPress?: () => void; accessibilityLabel?: string }) {
  const { c } = useTheme()
  const s: StyleProp<ViewStyle> = [{ backgroundColor: c.surface, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.card, padding: padded ? 16 : 0, overflow: 'hidden' }, shadow.card, style]
  if (!onPress) return <View style={s}>{children}</View>
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]}>{children}</Pressable>
}

/** Espresso card for summary / premium callouts. Children should use `c.sideInk` colours. */
export function DarkCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c, dark } = useTheme()
  return <View style={[{ backgroundColor: dark ? c.side2 : c.side, borderRadius: radius.card, padding: 16, borderWidth: 1, borderColor: c.sideLine }, style]}>{children}</View>
}

export function SectionHeader({ title, action, onAction, count }: { title: string; action?: string; onAction?: () => void; count?: string }) {
  const { c } = useTheme()
  return (
    <View style={styles.sectionHeader}>
      <Txt v="h3" style={{ flex: 1 }}>{title}{count ? <Txt v="mono" color={c.ink3}>{`  ${count}`}</Txt> : null}</Txt>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Txt v="label" color={c.accentText}>{action}</Txt>
        </Pressable>
      ) : null}
    </View>
  )
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme()
  return <View style={[{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }, style]} />
}

/* ---------------- Form ---------------- */

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  const { c } = useTheme()
  return (
    <View style={{ gap: 6 }}>
      <Txt v="label">{label}</Txt>
      {children}
      {error ? <Txt v="small" color={c.bad}>{error}</Txt> : hint ? <Txt v="small" color={c.ink3}>{hint}</Txt> : null}
    </View>
  )
}

export const Input = forwardRef<TextInput, TextInputProps & { icon?: IconName; mono?: boolean; invalid?: boolean; right?: ReactNode }>(function Input({ icon, mono, invalid, style, right, ...rest }, ref) {
  const { c } = useTheme()
  return (
    <View style={[styles.input, { backgroundColor: c.surface, borderColor: invalid ? c.bad : c.line2 }]}>
      {icon ? <Icon name={icon} size={17} color={c.ink3} /> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={c.ink3}
        selectionColor={c.accent}
        maxFontSizeMultiplier={1.4}
        style={[{ flex: 1, color: c.ink, fontFamily: mono ? font.mono : font.body, fontSize: mono ? 17 : 16, letterSpacing: mono ? 1.5 : 0, paddingVertical: 0, minHeight: 48 }, style]}
        {...rest}
      />
      {right}
    </View>
  )
})

export function Toggle({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const { c } = useTheme()
  return (
    <Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={(v) => { Haptics.selectionAsync().catch(() => {}); onChange(v) }}
      trackColor={{ false: c.line2, true: c.accent }} thumbColor="#FFFFFF" ios_backgroundColor={c.line2} />
  )
}

export function SettingRow({ title, detail, right, onPress, icon, first }: { title: string; detail?: string; right?: ReactNode; onPress?: () => void; icon?: IconName; first?: boolean }) {
  const { c } = useTheme()
  const body = (
    <View style={[styles.settingRow, !first && { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: c.line }]}>
      {icon ? <View style={[styles.iconTile, { backgroundColor: c.accentSoft }]}><Icon name={icon} size={17} color={c.accentText} /></View> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="bold">{title}</Txt>
        {detail ? <Txt v="small">{detail}</Txt> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={18} color={c.ink3} /> : null)}
    </View>
  )
  if (!onPress) return body
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>{body}</Pressable>
}

export function Segmented<T extends string>({ options, value, onChange, dark: onDark }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; dark?: boolean }) {
  const { c } = useTheme()
  return (
    <View accessibilityRole="tablist" style={[styles.seg, { backgroundColor: onDark ? c.side2 : c.sunk }]}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label} onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(o.value) }}
            style={[styles.segItem, on && { backgroundColor: c.surface, ...shadow.card }]}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontFamily: font.bodyBold, fontSize: 13, color: on ? c.ink : c.ink2 }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/* ---------------- Meter ---------------- */

export function Meter({ value, max, height = 8, onDark }: { value: number; max: number; height?: number; onDark?: boolean }) {
  const { c } = useTheme()
  const pct = Math.max(0, Math.min(1, max ? value / max : 0))
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height, borderRadius: height, backgroundColor: onDark ? c.sideLine : c.sunk, overflow: 'hidden' }}>
      <LinearGradient {...goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${pct * 100}%`, height: '100%', borderRadius: height }} />
    </View>
  )
}

/* ---------------- Empty / loading ---------------- */

export function EmptyState({ icon = 'image', title, body, action, onAction, secondary, onSecondary }: { icon?: IconName; title: string; body?: string; action?: string; onAction?: () => void; secondary?: string; onSecondary?: () => void }) {
  const { c } = useTheme()
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 10 }}>
      <View style={[styles.emptyIcon, { backgroundColor: c.accentSoft }]}><Icon name={icon} size={26} color={c.accentText} /></View>
      <Txt v="h3" center>{title}</Txt>
      {body ? <Txt v="small" center style={{ maxWidth: 300 }}>{body}</Txt> : null}
      {action && onAction ? <Button label={action} variant="primary" onPress={onAction} style={{ marginTop: 8 }} /> : null}
      {secondary && onSecondary ? <Button label={secondary} variant="ghost" onPress={onSecondary} /> : null}
    </View>
  )
}

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme()
  const o = useAnimatedValue(0.5)
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [o])
  return <Animated.View style={[{ backgroundColor: c.sunk, borderRadius: radius.control, opacity: o }, style]} />
}

export function LoadingList({ rows = 4 }: { rows?: number }) {
  return <View style={{ gap: 12, padding: 16 }}>{Array.from({ length: rows }, (_, i) => <Skeleton key={i} style={{ height: 72, borderRadius: radius.card }} />)}</View>
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <EmptyState icon="alert-triangle" title="Couldn’t load this" body={`${error instanceof Error ? error.message : 'Something went wrong'}. Check your connection and try again.`} action={onRetry ? 'Try again' : undefined} onAction={onRetry} />
}

/* ---------------- Screen scaffold ---------------- */

/** Scrollable page on the paper background. `edges` adds safe-area padding where no header/tab bar covers it. */
export function Screen({ children, top, bottomPad = 32, style, contentStyle, ...rest }: ScrollViewProps & { children: ReactNode; top?: boolean; bottomPad?: number; contentStyle?: StyleProp<ViewStyle> }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: c.paper }, style]}
      contentContainerStyle={[{ padding: 16, paddingTop: top ? insets.top + 12 : 16, paddingBottom: bottomPad, gap: 16 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior={top ? 'never' : 'automatic'}
      {...rest}
    >
      {children}
    </ScrollView>
  )
}

/* ---------------- Brand ---------------- */

export function LogoMark({ size = 30 }: { size?: number }) {
  const { c } = useTheme()
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: c.side2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(226,180,88,0.35)' }}>
      <LinearGradient {...goldGradient} style={{ width: size * 0.54, height: size * 0.38, borderRadius: 2, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', top: size * 0.08, bottom: size * 0.08, left: size * 0.11, right: size * 0.11, backgroundColor: c.side2, borderRadius: 1 }} />
      </LinearGradient>
    </View>
  )
}

export function Avatar({ name, size = 40, color }: { name: string; size?: number; color?: string }) {
  const { c } = useTheme()
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.bodyHeavy, fontSize: size * 0.36, color: color ? '#fff' : c.accentText }}>{initials || '·'}</Text>
    </View>
  )
}

/** Gold-gradient text substitute: gold-coloured display text (RN has no background-clip). */
export function GoldText({ children, size = 30 }: { children: ReactNode; size?: number }) {
  return <Text style={{ fontFamily: font.display, fontSize: size, lineHeight: size * 1.12, color: gold.stops[1] }}>{children}</Text>
}

const styles = StyleSheet.create({
  btn: { borderRadius: radius.control + 2, borderWidth: 1, overflow: 'hidden', minHeight: 44 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, alignSelf: 'flex-start' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.control + 2, paddingHorizontal: 14 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  iconTile: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', borderRadius: radius.control + 2, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 38, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
})
