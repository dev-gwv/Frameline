import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { fmt } from '@frameline/shared'
import { radius, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Sheet } from './overlays'
import { Button, IconButton, Txt } from './primitives'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 6)).toISOString()

/** Date picker without a native module: a field that opens a month calendar in a bottom sheet. */
export function DateField({ value, onChange, label = 'Date' }: { value: string; onChange: (iso: string) => void; label?: string }) {
  const { c } = useTheme()
  const [open, setOpen] = useState(false)
  const cur = new Date(value)
  const [view, setView] = useState({ y: cur.getUTCFullYear(), m: cur.getUTCMonth() })
  const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() // 0 = Sunday
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
  const cells = [...Array.from({ length: (first + 6) % 7 }, () => 0), ...Array.from({ length: days }, (_, i) => i + 1)]
  const selected = (d: number) => d === cur.getUTCDate() && view.m === cur.getUTCMonth() && view.y === cur.getUTCFullYear()
  const step = (n: number) => setView((v) => { const m = v.m + n; return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 } })

  return (
    <View style={{ gap: 6 }}>
      <Txt v="label">{label}</Txt>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${fmt.date(value)}. Change`} onPress={() => { setView({ y: cur.getUTCFullYear(), m: cur.getUTCMonth() }); setOpen(true) }}
        style={({ pressed }) => [styles.field, { borderColor: c.line2, backgroundColor: c.surface, opacity: pressed ? 0.7 : 1 }]}>
        <Icon name="calendar" size={17} color={c.ink3} />
        <Txt style={{ flex: 1 }}>{fmt.date(value)}</Txt>
        <Icon name="chevron-down" size={17} color={c.ink3} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconButton icon="chevron-left" label="Previous month" onPress={() => step(-1)} />
            <Txt weight="heavy" center style={{ flex: 1 }}>{MONTHS[view.m]} {view.y}</Txt>
            <IconButton icon="chevron-right" label="Next month" onPress={() => step(1)} />
          </View>
          <View style={styles.grid}>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <Txt key={d} v="small" center style={styles.dayName}>{d}</Txt>)}
            {cells.map((d, i) => d === 0 ? <View key={`b${i}`} style={styles.cell} /> : (
              <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: selected(d) }} accessibilityLabel={`${d} ${MONTHS[view.m]}`}
                onPress={() => { onChange(iso(view.y, view.m, d)); setOpen(false) }}
                style={[styles.cell, { borderRadius: 22, backgroundColor: selected(d) ? c.accent : 'transparent' }]}>
                <Txt weight={selected(d) ? 'heavy' : 'semi'} color={selected(d) ? c.accentInk : c.ink}>{d}</Txt>
              </Pressable>
            ))}
          </View>
          <Button label="Close" variant="ghost" onPress={() => setOpen(false)} />
        </View>
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.control + 2, paddingHorizontal: 14, minHeight: 50 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.2857%', height: 44, alignItems: 'center', justifyContent: 'center' },
  dayName: { width: '14.2857%', lineHeight: 32 },
})
