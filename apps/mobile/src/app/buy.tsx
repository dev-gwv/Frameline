import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { fmt, type Order, type PaymentMethod } from '@frameline/shared'
import { Button, Card, DarkCard, Field, Icon, IconButton, Input, LoadingList, Screen, Segmented, Txt } from '@/components'
import { API_MODE, useApi } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { actions, lastRegistration, useLocal } from '@/lib/local'
import { usePhotoList, type PhotoScope } from '@/lib/photoList'
import { usePrices, usePublicEvent } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { font, radius, useTheme } from '@/theme'

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

/**
 * Buy sheet: prices from listPrices, order via createOrder (priced by the server from the studio's price list).
 * Without Razorpay keys the API simulates payment and the order comes back `paid`; with keys it comes back
 * `pending` with `checkout` details — Razorpay Checkout isn't wired into the app yet.
 */
export default function Buy() {
  const { c } = useTheme()
  const api = useApi()
  const params = useLocalSearchParams<{ shortId: string; eventId?: string; photoId?: string; scope?: PhotoScope; albumId?: string }>()
  const { data: event } = usePublicEvent(params.shortId)
  const { data: priceList } = usePrices()
  const { photos } = usePhotoList(params.scope ?? 'album', { shortId: params.shortId, eventId: params.eventId || event?.id, albumId: params.albumId || undefined })
  const photoIds = params.photoId ? [params.photoId] : photos.map((p) => p.id)
  const n = Math.max(1, photoIds.length)
  const reg = useLocal(lastRegistration)
  const [name, setName] = useState(reg?.name ?? '')
  const [email, setEmail] = useState(reg?.email ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [picked, setSelected] = useState<string>()
  const selected = picked ?? (params.photoId ? 'print812' : n >= 3 ? 'all' : 'single')
  const [qty, setQty] = useState(1)
  const [method, setMethod] = useState<'upi' | 'card'>('upi')
  const [phase, setPhase] = useState<'choose' | 'paying' | { order: Order }>('choose')

  if (!priceList || !event) return <LoadingList />
  const prices = priceList.prices
  const studio = event.studio
  const item = prices.find((p) => p.id === selected)
  const units = item?.id === 'print812' ? qty : item?.id === 'multi' ? Math.max(3, n) : item?.id === 'single' ? n : 1
  const total = (item?.price ?? 0) * units

  const pay = async () => {
    if (!item) return
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Enter your name for the receipt'
    if (!emailOk(email)) e.email = 'Enter an email so we can send your photos'
    setErrors(e)
    if (Object.keys(e).length) return
    setPhase('paying')
    try {
      const order = await api.createOrder(event.shortId, {
        items: [{ priceId: item.id, photoIds: item.id === 'all' ? [] : photoIds.slice(0, 500), quantity: item.id === 'print812' ? qty : undefined }],
        method: method as PaymentMethod,
        buyer: { name: name.trim(), email: email.trim(), phone: reg?.phone || undefined },
      })
      actions.addOrder({ id: order.id, number: order.number, eventId: event.id, item: order.items, amount: order.paid, at: order.at, status: order.status })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setPhase({ order })
    } catch (err) {
      setPhase('choose')
      const f = friendlyError(err)
      toast.error(f.title, f.detail)
    }
  }

  if (typeof phase === 'object') {
    const { order } = phase
    const pending = order.status === 'pending'
    return (
      <Screen contentStyle={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
        <Stack.Screen options={{ title: pending ? 'Payment pending' : 'Order placed', headerLeft: () => null }} />
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: pending ? c.warnSoft : c.okSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={pending ? 'clock' : 'check'} size={32} color={pending ? c.warn : c.ok} /></View>
        <Txt v="h2" center>{pending ? 'Almost there' : 'Thank you!'}</Txt>
        <Txt v="small" center>Order <Txt v="mono">#{order.number}</Txt> · {fmt.money(order.paid, order.currency)}</Txt>
        <Txt v="small" center style={{ maxWidth: 300 }}>{pending
          ? `Online payment isn’t available in the app yet. ${studio.name} will send you a payment link at ${order.buyerEmail ?? 'your email'}.`
          : item?.id === 'print812' ? `${studio.name} will print and ship your photos within 5 days.` : 'Full-resolution photos will be emailed to you within a few minutes.'}</Txt>
        {API_MODE === 'mock' ? <Txt v="small" center color={c.ink3}>Demo checkout — no payment was taken.</Txt> : null}
        <Button label="Done" variant="primary" full size="lg" style={{ marginTop: 12 }} onPress={() => router.back()} />
      </Screen>
    )
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="x" label="Close" onPress={() => router.back()} /> }} />
      <Txt v="small">{event.name} · {n === 1 ? '1 photo' : `${n} photos`}</Txt>
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
      {priceList.standard ? <Txt v="small" color={c.ink3}>Standard prices shown. The studio’s own prices apply at checkout.</Txt> : null}

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

      <Field label="Your name" error={errors.name}><Input value={name} onChangeText={setName} autoComplete="name" placeholder="Full name" invalid={!!errors.name} /></Field>
      <Field label="Email for your photos and receipt" error={errors.email}><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@gmail.com" invalid={!!errors.email} /></Field>

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
        <Txt v="small" color={c.sideInk2}>Paid to {studio.name}. GST included.</Txt>
      </DarkCard>

      <Button label={phase === 'paying' ? 'Processing…' : `Pay ${fmt.rupees(total)}`} variant="primary" size="lg" loading={phase === 'paying'} disabled={!item || (!photoIds.length && item.id !== 'all')} onPress={pay} />
      {API_MODE === 'mock' ? <Txt v="small" center color={c.ink3}>Demo checkout — no money moves.</Txt> : null}
    </Screen>
  )
}
