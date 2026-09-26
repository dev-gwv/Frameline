import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { fmt } from '@frameline/shared'
import { Button, Card, DarkCard, Icon, IconButton, LoadingList, Screen, Segmented, Txt } from '@/components'
import { actions } from '@/lib/local'
import { useEvent, usePrices, useStudio } from '@/lib/queries'
import { font, radius, useTheme } from '@/theme'

/**
 * Buy sheet: prices from api.listPrices, mock checkout (no payment is taken). The order is kept on the
 * phone until the API gains an order-creation endpoint.
 */
export default function Buy() {
  const { c } = useTheme()
  const { eventId, photoId, count } = useLocalSearchParams<{ eventId: string; photoId?: string; count?: string }>()
  const n = Math.max(1, Number(count) || 1)
  const { data: prices } = usePrices()
  const { data: event } = useEvent(eventId)
  const { data: studio } = useStudio()
  const [picked, setSelected] = useState<string>()
  const selected = picked ?? (photoId ? 'print812' : n >= 3 ? 'all' : 'single')
  const [qty, setQty] = useState(1)
  const [method, setMethod] = useState<'upi' | 'card'>('upi')
  const [phase, setPhase] = useState<'choose' | 'paying' | { orderId: string }>('choose')


  if (!prices || !event) return <LoadingList />
  const item = prices.find((p) => p.id === selected)
  const units = item?.id === 'print812' ? qty : item?.id === 'multi' ? Math.max(3, n) : item?.id === 'single' ? (photoId ? 1 : n) : 1
  const total = (item?.price ?? 0) * units

  const pay = async () => {
    if (!item) return
    setPhase('paying')
    await new Promise((r) => setTimeout(r, 1400))
    const orderId = actions.addOrder({ eventId: event.id, item: `${item.label}${units > 1 ? ` ×${units}` : ''}`, amount: total })
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    setPhase({ orderId })
  }

  if (typeof phase === 'object') {
    return (
      <Screen contentStyle={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
        <Stack.Screen options={{ title: 'Order placed', headerLeft: () => null }} />
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.okSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={32} color={c.ok} /></View>
        <Txt v="h2" center>Thank you!</Txt>
        <Txt v="small" center>Order <Txt v="mono">#{phase.orderId}</Txt> · {fmt.rupees(total)}</Txt>
        <Txt v="small" center style={{ maxWidth: 300 }}>{item?.id === 'print812' ? `${studio?.name ?? 'The studio'} will print and ship your photos within 5 days.` : 'Full-resolution photos will be emailed to you within a few minutes.'}</Txt>
        <Txt v="small" center color={c.ink3}>Demo checkout — no payment was taken.</Txt>
        <Button label="Done" variant="primary" full size="lg" style={{ marginTop: 12 }} onPress={() => router.back()} />
      </Screen>
    )
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="x" label="Close" onPress={() => router.back()} /> }} />
      <Txt v="small">{event.name} · {photoId ? '1 photo' : `${n} photos`}</Txt>
      <View style={{ gap: 10 }}>
        {prices.map((p) => {
          const on = p.id === selected
          return (
            <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${p.label}, ${fmt.rupees(p.price)}`} onPress={() => setSelected(p.id)}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card, borderWidth: on ? 2 : 1, borderColor: on ? c.marker : c.line, backgroundColor: on ? c.accentSoft : c.surface, opacity: pressed ? 0.85 : 1 }]}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.accent : c.line2, alignItems: 'center', justifyContent: 'center' }}>
                {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Txt weight="bold">{p.label}</Txt>
                <Txt v="small">{p.detail}</Txt>
              </View>
              <Txt v="mono" style={{ fontFamily: font.monoBold }}>{fmt.rupees(p.price)}</Txt>
            </Pressable>
          )
        })}
      </View>

      {item?.id === 'print812' ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt weight="bold">Copies</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IconButton icon="minus" label="Fewer copies" tone="soft" onPress={() => setQty(Math.max(1, qty - 1))} />
            <Txt v="mono" style={{ fontSize: 18, minWidth: 28, textAlign: 'center' }}>{qty}</Txt>
            <IconButton icon="plus" label="More copies" tone="soft" onPress={() => setQty(Math.min(20, qty + 1))} />
          </View>
        </Card>
      ) : null}

      <View style={{ gap: 8 }}>
        <Txt v="label">Pay with</Txt>
        <Segmented value={method} onChange={setMethod} options={[{ value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }]} />
      </View>

      <DarkCard style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt color={c.sideInk2}>{item?.label}{units > 1 ? ` × ${units}` : ''}</Txt>
          <Txt v="mono" color={c.sideInk}>{fmt.rupees(total)}</Txt>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Txt weight="bold" color={c.sideInk}>Total</Txt>
          <Txt style={{ fontFamily: font.display, fontSize: 26, color: '#F2D38A' }}>{fmt.rupees(total)}</Txt>
        </View>
        <Txt v="small" color={c.sideInk2}>Paid to {studio?.name ?? 'the studio'}. GST included.</Txt>
      </DarkCard>

      <Button label={phase === 'paying' ? 'Processing…' : `Pay ${fmt.rupees(total)}`} variant="primary" size="lg" loading={phase === 'paying'} disabled={!item} onPress={pay} />
      <Txt v="small" center color={c.ink3}>Demo checkout — no money moves.</Txt>
    </Screen>
  )
}
