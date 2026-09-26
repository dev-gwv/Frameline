import { Pressable, StyleSheet, View } from 'react-native'
import { fmt, type PhotoEvent } from '@frameline/shared'
import { font, radius, useTheme } from '@/theme'
import { Icon, type IconName } from './Icon'
import { ToneView } from './photo'
import { Card, EventStatusChip, Txt } from './primitives'

export function StatCard({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  const { c } = useTheme()
  return (
    <Card style={{ flex: 1, gap: 6, minWidth: 150 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={14} color={c.accentText} />
        <Txt v="small" numberOfLines={1} style={{ flex: 1 }}>{label}</Txt>
      </View>
      <Txt style={{ fontFamily: font.display, fontSize: 26, color: c.ink, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{value}</Txt>
    </Card>
  )
}

export function EventRow({ event, onPress, first }: { event: PhotoEvent; onPress: () => void; first?: boolean }) {
  const { c } = useTheme()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${event.name}, ${event.status}, ${event.photoCount} photos`} onPress={onPress}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: 1, borderTopColor: c.line }, { opacity: pressed ? 0.7 : 1 }]}>
      <ToneView tone={event.coverTones[0]} style={{ width: 52, height: 52, borderRadius: radius.control }} />
      <View style={{ flex: 1, gap: 3 }}>
        <Txt weight="bold" numberOfLines={1}>{event.name}</Txt>
        <Txt v="small" numberOfLines={1}>{fmt.dayMonth(event.date)} · {event.city} · <Txt v="mono" color={c.ink2} style={{ fontSize: 12 }}>{fmt.count(event.photoCount)}</Txt></Txt>
      </View>
      <EventStatusChip status={event.status} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 64 },
})
