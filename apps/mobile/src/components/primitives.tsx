import { forwardRef, useEffect, type ReactNode } from 'react'
import {
  ActivityIndicator, Animated, Pressable, useAnimatedValue, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type PressableProps, type ScrollViewProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DEMO_NOW, EVENT_STATUS_LABELS, gold, type EventStatus } from '@frameline/shared'
import { friendlyError } from '@/lib/errors'
import { font, goldGradient, radius, shadow, useTheme } from '@/theme'
import { Icon, type IconName } from './Icon'

/*
 * Redesign v2 rules baked in here: one gold button per screen (`variant="primary"`), light surfaces, Manrope for UI
 * and Fraunces only for page titles (Txt h1/h2), numbers in tabular Manrope (no mono), no uppercase labels,
 * status chips are always a dot or icon + word, targets at least 44px.
 */

/* ---------------- Text ---------------- */

/** h1/h2 = page titles (Fraunces). h3 = card titles (Manrope 800). `mono` = tabular Manrope for numbers and codes. */
type TxtVariant = 'body' | 'small' | 'label' | 'eyebrow' | 'mono' | 'title' | 'h1' | 'h2' | 'h3'
export function Txt({ v = 'body', color, style, weight, center, ...rest }: TextProps & { v?: TxtVariant; color?: string; weight?: 'regular' | 'semi' | 'bold' | 'heavy'; center?: boolean }) {
  const { t, c } = useTheme()
  const base: TextStyle =
    v === 'h1' ? t.display(26) : v === 'h2' ? t.display(22) : v === 'h3' ? { ...t.body, fontFamily: font.bodyHeavy, fontSize: 16, lineHeight: 21 } : v === 'title' ? { ...t.body, fontFamily: font.bodyBold, fontSize: 16 }
      : v === 'small' ? t.small : v === 'label' ? t.label : v === 'eyebrow' ? t.eyebrow : v === 'mono' ? t.mono : t.body
  const w: TextStyle | undefined = weight === 'regular' ? { fontFamily: font.bodyRegular } : weight === 'semi' ? { fontFamily: font.bodySemi } : weight === 'bold' ? { fontFamily: font.bodyBold } : weight === 'heavy' ? { fontFamily: font.bodyHeavy } : undefined
  return <Text maxFontSizeMultiplier={1.6} {...rest} style={[base, w, color ? { color } : null, center && { textAlign: 'center' }, v === 'mono' && !color && { color: c.ink }, style]} />
}

/* ---------------- Buttons ---------------- */

/** `primary` = gold: ONE per screen. `dark` is kept only for the photo viewer. `danger` = soft red (Trash). */
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
  const h = size === 'lg' ? 50 : size === 'sm' ? 38 : 46
  const fg = variant === 'primary' ? c.accentInk : variant === 'dark' ? c.sideInk : variant === 'ghost' ? c.accentText : variant === 'danger' ? c.bad : c.ink
  const bg: ViewStyle =
    variant === 'dark' ? { backgroundColor: dark ? c.side2 : c.side, borderColor: c.sideLine }
      : variant === 'secondary' ? { backgroundColor: c.surface, borderColor: c.line2 }
        : variant === 'danger' ? { backgroundColor: c.badSoft, borderColor: 'transparent' }
          : { backgroundColor: 'transparent', borderColor: 'transparent' }
  const inner = (
    <View style={[styles.btnInner, { height: h, paddingHorizontal: size === 'sm' ? 12 : 18 }]}>
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={size === 'lg' ? 19 : 17} color={fg} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: fg, fontFamily: font.bodyHeavy, fontSize: size === 'lg' ? 16 : size === 'sm' ? 13.5 : 15, flexShrink: 1 }}>{label}</Text>
      {iconRight && !loading ? <Icon name={iconRight} size={16} color={fg} /> : null}
    </View>
  )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      hitSlop={size === 'sm' ? 3 : 0}
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

/** Icon-only button: only for back, close and ⋯ (always with an accessibility label). */
export function IconButton({ icon, label, onPress, tone = 'plain', size = 44, color, active, badge }: { icon: IconName; label: string; onPress?: () => void; tone?: 'plain' | 'soft' | 'overlay'; size?: number; color?: string; active?: boolean; badge?: number }) {
  const { c } = useTheme()
  const bg = tone === 'soft' ? c.sunk : tone === 'overlay' ? 'rgba(12,10,8,0.45)' : 'transparent'
  const fg = color ?? (tone === 'overlay' ? '#F3ECDF' : active ? c.accentText : c.ink)
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={Math.max(0, (44 - size) / 2)}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={20} color={fg} />
      {badge ? <View style={[styles.badge, { backgroundColor: c.accent }]}><Text style={{ color: c.accentInk, fontFamily: font.bodyHeavy, fontSize: 10 }}>{badge}</Text></View> : null}
    </Pressable>
  )
}

/** Text link (ghost, no box) that still has a 44px target. */
export function LinkText({ label, onPress, color, icon, small }: { label: string; onPress: () => void; color?: string; icon?: IconName; small?: boolean }) {
  const { c } = useTheme()
  const fg = color ?? c.accentText
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}>
      {icon ? <Icon name={icon} size={small ? 14 : 16} color={fg} /> : null}
      <Text maxFontSizeMultiplier={1.4} style={{ color: fg, fontFamily: font.bodyBold, fontSize: small ? 13 : 14.5 }}>{label}</Text>
    </Pressable>
  )
}

/* ---------------- Chip ---------------- */

export type ChipTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'dark'
/**
 * Status chip when not pressable: always a dot (or icon) + word. With `onPress` it's a filter chip: outlined,
 * gold-soft when selected, count in tabular figures (`attention` shows the count as a gold badge).
 */
export function Chip({ label, tone = 'neutral', selected, onPress, count, icon, dot, attention }: { label: string; tone?: ChipTone; selected?: boolean; onPress?: () => void; count?: number | string; icon?: IconName; dot?: boolean; attention?: boolean }) {
  const { c } = useTheme()
  if (onPress) {
    const fg = selected ? c.accentText : c.ink2
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={`${label}${count !== undefined ? ` ${count}` : ''}`}
        onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress() }} hitSlop={4}
        style={({ pressed }) => [styles.filterChip, { backgroundColor: selected ? c.accentSoft : c.surface, borderColor: selected ? c.accent : c.line2, opacity: pressed ? 0.7 : 1 }]}>
        {icon ? <Icon name={icon} size={14} color={fg} /> : null}
        <Text maxFontSizeMultiplier={1.4} style={{ color: selected ? c.accentText : c.ink, fontFamily: font.bodyBold, fontSize: 13.5 }}>{label}</Text>
        {count !== undefined ? (
          attention && Number(count) > 0
            ? <View style={[styles.countBadge, { backgroundColor: c.accent }]}><Text style={{ color: c.accentInk, fontFamily: font.bodyHeavy, fontSize: 11, fontVariant: ['tabular-nums'] }}>{count}</Text></View>
            : <Text style={{ color: fg, fontFamily: font.bodySemi, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{count}</Text>
        ) : null}
      </Pressable>
    )
  }
  const map: Record<ChipTone, [string, string]> = {
    neutral: [c.sunk, c.ink2], accent: [c.accentSoft, c.accentText], ok: [c.okSoft, c.ok], warn: [c.warnSoft, c.warn], bad: [c.badSoft, c.bad], dark: [c.sunk, c.ink],
  }
  const [bg, fg] = map[tone]
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={12} color={fg} /> : dot !== false ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} /> : null}
      <Text maxFontSizeMultiplier={1.4} style={{ color: fg, fontFamily: font.bodyBold, fontSize: 12, fontVariant: ['tabular-nums'] }}>{label}</Text>
      {count !== undefined ? <Text style={{ color: fg, fontFamily: font.bodyBold, fontSize: 12, fontVariant: ['tabular-nums'] }}>{count}</Text> : null}
    </View>
  )
}

/** Gold count badge for things that need action (e.g. the Guests tab). Renders nothing for 0. */
export function CountBadge({ n }: { n: number }) {
  const { c } = useTheme()
  if (!n) return null
  return <View style={[styles.countBadge, { backgroundColor: c.accent }]}><Text style={{ color: c.accentInk, fontFamily: font.bodyHeavy, fontSize: 11, fontVariant: ['tabular-nums'] }}>{n > 99 ? '99+' : n}</Text></View>
}

const STATUS: Record<EventStatus, { label: string; tone: ChipTone }> = {
  live: { label: EVENT_STATUS_LABELS.live, tone: 'ok' }, uploading: { label: EVENT_STATUS_LABELS.uploading, tone: 'accent' }, expiring: { label: EVENT_STATUS_LABELS.expiring, tone: 'warn' },
  draft: { label: EVENT_STATUS_LABELS.draft, tone: 'neutral' }, archived: { label: EVENT_STATUS_LABELS.archived, tone: 'neutral' },
}
/** Status as dot + word. Expiring events say how long is left ("Expires in 6 days", "Expired"). */
export function EventStatusChip({ status, expiresAt, now = DEMO_NOW }: { status: EventStatus; expiresAt?: string; now?: number }) {
  return <Chip label={statusText(status, expiresAt, now)} tone={STATUS[status].tone} />
}
export function statusText(status: EventStatus, expiresAt?: string, now = DEMO_NOW) {
  if (status !== 'expiring' || !expiresAt) return STATUS[status].label
  const d = Math.ceil((Date.parse(expiresAt) - now) / 86_400_000)
  return d < 0 ? 'Expired' : d === 0 ? 'Expires today' : d === 1 ? 'Expires tomorrow' : `Expires in ${d} days`
}
export const statusLabel = (s: EventStatus) => STATUS[s].label

/* ---------------- Cards ---------------- */

export function Card({ children, style, padded = true, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean; onPress?: () => void; accessibilityLabel?: string }) {
  const { c } = useTheme()
  const s: StyleProp<ViewStyle> = [{ backgroundColor: c.surface, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.card, padding: padded ? 16 : 0, overflow: 'hidden' }, shadow.card, style]
  if (!onPress) return <View style={s}>{children}</View>
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]}>{children}</Pressable>
}

/** Card title (15–16px extra-bold sans) with an optional one-line description and a right-side element. */
export function CardTitle({ title, description, right }: { title: string; description?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="h3" style={{ fontSize: 15.5 }}>{title}</Txt>
        {description ? <Txt v="small">{description}</Txt> : null}
      </View>
      {right}
    </View>
  )
}

/** Soft gold callout (replaces the old dark card: light everywhere except the photo viewer). */
export function SoftCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme()
  return <View style={[{ backgroundColor: c.accentSoft, borderRadius: radius.card, padding: 14 }, style]}>{children}</View>
}

export function SectionHeader({ title, action, onAction, count }: { title: string; action?: string; onAction?: () => void; count?: string }) {
  const { c } = useTheme()
  return (
    <View style={styles.sectionHeader}>
      <Txt v="h3" style={{ flex: 1 }}>{title}{count ? <Txt v="small" color={c.ink3}>{`  ${count}`}</Txt> : null}</Txt>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Txt v="label" color={c.accentText}>{action}</Txt>
          <Icon name="chevron-right" size={15} color={c.accentText} />
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

/** Text input. `mono` = codes and PINs: bold tabular Manrope with a little letter spacing (no monospace font). */
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
        style={[{ flex: 1, color: c.ink, fontFamily: mono ? font.bodyBold : font.body, fontSize: mono ? 17 : 16, letterSpacing: mono ? 1 : 0, fontVariant: mono ? ['tabular-nums'] : undefined, paddingVertical: 0, minHeight: 48 }, style]}
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

export function SettingRow({ title, detail, right, onPress, icon, first, danger }: { title: string; detail?: string; right?: ReactNode; onPress?: () => void; icon?: IconName; first?: boolean; danger?: boolean }) {
  const { c } = useTheme()
  const body = (
    <View style={[styles.settingRow, !first && { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: c.line }]}>
      {icon ? <View style={[styles.iconTile, { backgroundColor: danger ? c.badSoft : c.sunk }]}><Icon name={icon} size={17} color={danger ? c.bad : c.ink2} /></View> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="bold" color={danger ? c.bad : undefined}>{title}</Txt>
        {detail ? <Txt v="small">{detail}</Txt> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={18} color={c.ink3} /> : null)}
    </View>
  )
  if (!onPress) return body
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>{body}</Pressable>
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme()
  return (
    <View accessibilityRole="tablist" style={[styles.seg, { backgroundColor: c.sunk }]}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label} onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(o.value) }}
            style={[styles.segItem, on && { backgroundColor: c.surface, ...shadow.card }]}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontFamily: font.bodyBold, fontSize: 13.5, color: on ? c.ink : c.ink2 }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Radio cards: a bordered option with a title and one line; the chosen one is gold-soft with a gold ring. */
export function RadioCards<T extends string>({ options, value, onChange }: { options: { value: T; title: string; description?: string; right?: string; badge?: string }[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme()
  return (
    <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${o.title}${o.right ? `, ${o.right}` : ''}`}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(o.value) }}
            style={({ pressed }) => [styles.radio, { borderColor: on ? c.accent : c.line, borderWidth: on ? 1.5 : 1, backgroundColor: on ? c.accentSoft : c.surface, opacity: pressed ? 0.85 : 1 }]}>
            <View style={[styles.radioDot, { borderColor: on ? c.accent : c.line2, borderWidth: on ? 6 : 1.5 }]} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt weight="bold">{o.title}{o.badge ? <Txt v="small" weight="bold" color={c.accentText}>{`  ${o.badge}`}</Txt> : null}</Txt>
              {o.description ? <Txt v="small">{o.description}</Txt> : null}
            </View>
            {o.right ? <Txt weight="heavy" style={{ fontVariant: ['tabular-nums'] }}>{o.right}</Txt> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

/* ---------------- Meter ---------------- */

export function Meter({ value, max, height = 8, tone }: { value: number; max: number; height?: number; tone?: 'warn' | 'bad' }) {
  const { c } = useTheme()
  const pct = Math.max(0, Math.min(1, max ? value / max : 0))
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height, borderRadius: height, backgroundColor: c.sunk, overflow: 'hidden' }}>
      {tone
        ? <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: height, backgroundColor: tone === 'bad' ? c.bad : c.warn }} />
        : <LinearGradient {...goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${pct * 100}%`, height: '100%', borderRadius: height }} />}
    </View>
  )
}

/* ---------------- Empty / loading ---------------- */

/** Every dead end says why and offers one next step. `action` is gold unless `actionVariant` says otherwise. */
export function EmptyState({ icon = 'image', title, body, action, onAction, secondary, onSecondary, actionVariant = 'primary', tone = 'accent', icon2, children }: {
  icon?: IconName; title: string; body?: string; action?: string; onAction?: () => void; secondary?: string; onSecondary?: () => void
  actionVariant?: ButtonVariant; tone?: 'accent' | 'warn' | 'neutral'; icon2?: IconName; children?: ReactNode
}) {
  const { c } = useTheme()
  const [ibg, ifg] = tone === 'warn' ? [c.warnSoft, c.warn] : tone === 'neutral' ? [c.sunk, c.ink2] : [c.accentSoft, c.accentText]
  return (
    <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 10 }}>
      <View style={[styles.emptyIcon, { backgroundColor: ibg }]}><Icon name={icon} size={26} color={ifg} /></View>
      <Txt center style={{ fontFamily: font.bodyHeavy, fontSize: 19, lineHeight: 24 }}>{title}</Txt>
      {body ? <Txt v="small" center style={{ maxWidth: 320 }}>{body}</Txt> : null}
      {children}
      {action && onAction ? <Button label={action} icon={icon2} variant={actionVariant} onPress={onAction} style={{ marginTop: 8, alignSelf: 'stretch' }} /> : null}
      {secondary && onSecondary ? <Button label={secondary} variant={actionVariant === 'primary' ? 'secondary' : 'ghost'} onPress={onSecondary} style={{ alignSelf: 'stretch' }} /> : null}
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
  const f = friendlyError(error)
  if (f.title === 'You’re offline') {
    return <EmptyState icon="wifi-off" tone="neutral" title="You seem to be offline" body="Things you’ve opened are still here. We’ll load the rest when you’re back." action={onRetry ? 'Try again' : undefined} actionVariant="secondary" onAction={onRetry} />
  }
  return <EmptyState icon="alert-triangle" tone="warn" title={f.title === 'That didn’t work' ? 'Couldn’t load this' : f.title} body={f.detail} action={onRetry ? 'Try again' : undefined} actionVariant="secondary" onAction={onRetry} />
}

/* ---------------- Screen scaffold ---------------- */

/** Scrollable page on the paper background. `top` adds safe-area padding where no header covers it. */
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
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, borderRadius: size * 0.27, overflow: 'hidden' }}>
      <LinearGradient {...goldGradient} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.5, height: size * 0.36, borderRadius: 2, borderWidth: Math.max(1.5, size * 0.07), borderColor: c.surface }} />
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

/** Gold display text (RN has no background-clip). Page titles only. */
export function GoldText({ children, size = 30 }: { children: ReactNode; size?: number }) {
  return <Text style={{ fontFamily: font.display, fontSize: size, lineHeight: size * 1.12, color: gold.stops[2] }}>{children}</Text>
}

const styles = StyleSheet.create({
  btn: { borderRadius: radius.control + 2, borderWidth: 1, overflow: 'hidden', minHeight: 38 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: 9 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, borderWidth: 1, minHeight: 38, paddingHorizontal: 14 },
  countBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.control + 2, paddingHorizontal: 14 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  iconTile: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', borderRadius: radius.control + 2, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 40, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card, minHeight: 56 },
  radioDot: { width: 20, height: 20, borderRadius: 10 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
})
