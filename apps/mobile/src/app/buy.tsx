import { useRef, useState } from 'react'
import { View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { ApiError, fmt, type Order, type PaymentMethod, type ShippingAddress } from '@frameline/shared'
import { Button, Card, EmptyState, Field, Icon, IconButton, Input, LinkText, LoadingList, PhotoTile, RadioCards, Screen, Txt } from '@/components'
import { DownloadSheet } from '@/components/DownloadSheet'
import { realEmail } from '@/components/gates'
import { API_MODE, useApi } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { actions, lastRegistration, useLocal } from '@/lib/local'
import { usePhotoList, type PhotoScope } from '@/lib/photoList'
import { usePublicEvent, usePublicPrices } from '@/lib/queries'
import { CaptureHost, type CaptureHandle } from '@/lib/save'
import { useTheme } from '@/theme'

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
type Step = 'choose' | 'address' | 'pay'

/**
 * Buy (g-buy): Choose → (address for prints) → Pay → Paid. Prices come from listPublicPrices and the order from
 * createOrder (priced by the server). Without Razorpay keys the API simulates payment and returns `paid`; with keys
 * it returns `pending` (Razorpay Checkout isn't wired into the app yet). A failed payment keeps the Pay step open
 * with the reason and "Try again".
 */
export default function Buy() {
  const { c } = useTheme()
  const api = useApi()
  const params = useLocalSearchParams<{ shortId: string; eventId?: string; photoId?: string; scope?: PhotoScope; albumId?: string }>()
  const { data: event } = usePublicEvent(params.shortId)
  const { data: prices, error: pricesError, refetch } = usePublicPrices(params.shortId)
  const { photos } = usePhotoList(params.scope ?? 'album', { shortId: params.shortId, eventId: params.eventId || event?.id, albumId: params.albumId || undefined })
  const photoIds = params.photoId ? [params.photoId] : photos.map((p) => p.id)
  const one = params.photoId ? photos.find((p) => p.id === params.photoId) : undefined
  const n = Math.max(1, photoIds.length)
  const reg = useLocal(lastRegistration)
  const [name, setName] = useState(reg?.name ?? '')
  const [email, setEmail] = useState(realEmail(reg?.email))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [picked, setSelected] = useState<string>()
  const [qty, setQty] = useState(1)
  const [method, setMethod] = useState<'upi' | 'card'>('upi')
  const [step, setStep] = useState<Step>('choose')
  const [paying, setPaying] = useState(false)
  const [failed, setFailed] = useState<string>()
  const [order, setOrder] = useState<Order | null>(null)
  const [dlOpen, setDlOpen] = useState(false)
  const capture = useRef<CaptureHandle>(null)
  const [ship, setShip] = useState<ShippingAddress>({ name: reg?.name ?? '', phone: reg?.phone ?? '', line1: '', line2: '', city: '', state: '', postal: '', country: 'India' })
  const setS = (k: keyof ShippingAddress) => (v: string) => { setShip((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [`shipping.${k}`]: '' })) }

  if (pricesError && !prices) {
    const f = friendlyError(pricesError)
    return <Screen><EmptyState icon="shopping-bag" tone="warn" title={f.title} body={f.detail} action="Try again" actionVariant="secondary" onAction={refetch} secondary="Close" onSecondary={() => router.back()} /></Screen>
  }
  if (!prices || !event) return <LoadingList />
  const studio = event.studio
  // Options in the design's order: this photo, a print, then everything (best value).
  const options = prices.filter((p) => (params.photoId ? p.id !== 'multi' : p.id !== 'single' || n === 1))
  const selected = picked ?? (params.photoId ? 'single' : n >= 3 ? 'all' : 'single')
  const item = prices.find((p) => p.id === selected)
  const units = item?.id === 'print812' ? qty : item?.id === 'multi' ? Math.max(3, n) : item?.id === 'single' ? n : 1
  const total = (item?.price ?? 0) * units
  const isPrint = !!item?.id.startsWith('print')
  const title = (p: { id: string; label: string }) => p.id === 'single' ? (params.photoId ? 'This photo, full size' : `${n === 1 ? 'This photo' : `These ${n} photos`}, full size`) : p.id === 'all' ? 'All your photos' : p.id === 'print812' ? '8×12 print' : p.label
  const detail = (p: { id: string; detail: string; price: number }) => p.id === 'single' && n > 1 ? `${fmt.rupees(p.price)} each` : p.id === 'multi' ? `${fmt.rupees(p.price)} each, from 3 photos` : p.id === 'print812' ? 'Delivered in 5 days' : p.detail

  const next = () => {
    if (step === 'choose') { setStep(isPrint ? 'address' : 'pay'); return }
    if (step === 'address') {
      const e: Record<string, string> = {}
      if (ship.name.trim().length < 2) e['shipping.name'] = 'Who should receive the prints?'
      if (ship.phone.replace(/\D/g, '').length < 8) e['shipping.phone'] = 'A phone number for the courier'
      if (ship.line1.trim().length < 3) e['shipping.line1'] = 'House, street and area'
      if (!ship.city.trim()) e['shipping.city'] = 'City'
      if (!ship.state.trim()) e['shipping.state'] = 'State'
      if (!/^[0-9A-Za-z -]{3,10}$/.test(ship.postal.trim())) e['shipping.postal'] = 'PIN code'
      setErrors(e)
      if (!Object.keys(e).length) setStep('pay')
    }
  }

  const pay = async () => {
    if (!item) return
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Enter your name for the receipt'
    if (!emailOk(email)) e.email = 'Enter an email so we can send your photos'
    setErrors(e)
    if (Object.keys(e).length) return
    setPaying(true); setFailed(undefined)
    try {
      const o = await api.createOrder(event.shortId, {
        items: [{ priceId: item.id, photoIds: item.id === 'all' ? [] : photoIds.slice(0, 500), quantity: item.id === 'print812' ? qty : undefined }],
        method: method as PaymentMethod,
        buyer: { name: name.trim(), email: email.trim(), phone: (isPrint ? ship.phone : reg?.phone) || undefined },
        ...(isPrint ? { shipping: { ...ship, name: ship.name.trim(), phone: ship.phone.trim(), line1: ship.line1.trim(), line2: ship.line2?.trim() || undefined, city: ship.city.trim(), state: ship.state.trim(), postal: ship.postal.trim() } } : {}),
      })
      actions.addOrder({ id: o.id, number: o.number, eventId: event.id, item: o.items, amount: o.paid, at: o.at, status: o.status })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setOrder(o)
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) setErrors(Object.fromEntries(err.fieldErrors.map((x) => [x.field.replace(/^buyer\./, ''), x.message])))
      const f = friendlyError(err)
      setFailed(`${f.title}. ${f.detail}`)
    } finally { setPaying(false) }
  }

  if (order) {
    const pending = order.status === 'pending'
    const bought = item?.id === 'all' ? photos : photos.filter((p) => photoIds.includes(p.id))
    return (
      <Screen contentStyle={{ alignItems: 'center', paddingTop: 48, gap: 12 }}>
        <Stack.Screen options={{ title: pending ? 'Almost there' : 'Payment done', headerLeft: () => null }} />
        <CaptureHost ref={capture} />
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: pending ? c.warnSoft : c.okSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={pending ? 'clock' : 'check'} size={30} color={pending ? c.warn : c.ok} /></View>
        <Txt weight="heavy" center style={{ fontSize: 20 }}>{pending ? 'Almost there' : 'Payment done'}</Txt>
        <Txt v="small" center style={{ maxWidth: 320 }}>{pending
          ? `Online payment isn’t in the app yet. ${studio.name} will send you a payment link at ${order.buyerEmail ?? email}.`
          : isPrint ? `${studio.name} will print and ship your photos within 5 days. We’ve emailed your receipt.`
            : `Your ${bought.length === 1 ? 'photo is' : `${fmt.count(bought.length)} photos are`} ready in full size. We’ve also emailed the link.`}</Txt>
        <Txt v="small" center color={c.ink3}>Order #{order.number} · {fmt.money(order.paid, order.currency)}{API_MODE === 'mock' ? ' · demo checkout, no money moved' : ''}</Txt>
        {!pending && !isPrint && bought.length
          ? <Button label={bought.length === 1 ? 'Download' : 'Download all'} icon="download" variant="primary" size="lg" full style={{ marginTop: 10 }} onPress={() => setDlOpen(true)} />
          : <Button label="Done" variant="primary" size="lg" full style={{ marginTop: 10 }} onPress={() => router.back()} />}
        <LinkText label="See your orders" onPress={() => router.replace({ pathname: '/event/[id]', params: { id: event.shortId, tab: 'orders' } })} />
        <DownloadSheet open={dlOpen} onClose={() => setDlOpen(false)} photos={bought} event={event} host={capture} />
      </Screen>
    )
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: step === 'pay' ? `Pay ${fmt.rupees(total)}` : step === 'address' ? 'Deliver to' : 'Buy', headerRight: () => <IconButton icon="x" label="Close" onPress={() => router.back()} /> }} />

      {step === 'choose' ? (
        <>
          {one ? <View style={{ alignItems: 'center' }}><PhotoTile photo={one} size={150} radius={10} label="The photo you’re buying" /></View> : <Txt v="small">{event.name} · {n === 1 ? '1 photo' : `${fmt.count(n)} photos`}</Txt>}
          <RadioCards value={selected} onChange={setSelected} options={options.map((p) => ({ value: p.id, title: title(p), description: detail(p), right: fmt.rupees(p.price * (p.id === 'single' ? n : p.id === 'multi' ? Math.max(3, n) : 1)), badge: p.id === 'all' ? 'Best value' : undefined }))} />
          {isPrint ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt weight="bold">Copies</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <IconButton icon="minus" label="Fewer copies" tone="soft" onPress={() => setQty(Math.max(1, qty - 1))} />
                <Txt weight="heavy" style={{ fontSize: 18, minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{qty}</Txt>
                <IconButton icon="plus" label="More copies" tone="soft" onPress={() => setQty(Math.min(20, qty + 1))} />
              </View>
            </Card>
          ) : null}
          <Button label={`Continue · ${fmt.rupees(total)}`} variant="primary" size="lg" disabled={!item || (!photoIds.length && item.id !== 'all')} onPress={next} />
        </>
      ) : null}

      {step === 'address' ? (
        <>
          <Field label="Name" error={errors['shipping.name']}><Input value={ship.name} onChangeText={setS('name')} autoComplete="name" invalid={!!errors['shipping.name']} /></Field>
          <Field label="Phone" error={errors['shipping.phone']}><Input value={ship.phone} onChangeText={setS('phone')} keyboardType="phone-pad" autoComplete="tel" placeholder="+91 98200 12345" invalid={!!errors['shipping.phone']} /></Field>
          <Field label="Address" error={errors['shipping.line1']}><Input value={ship.line1} onChangeText={setS('line1')} autoComplete="street-address" placeholder="House, street, area" invalid={!!errors['shipping.line1']} /></Field>
          <Field label="Landmark (optional)"><Input value={ship.line2 ?? ''} onChangeText={setS('line2')} /></Field>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="City" error={errors['shipping.city']}><Input value={ship.city} onChangeText={setS('city')} invalid={!!errors['shipping.city']} /></Field></View>
            <View style={{ flex: 1 }}><Field label="PIN code" error={errors['shipping.postal']}><Input value={ship.postal} onChangeText={setS('postal')} keyboardType="number-pad" autoComplete="postal-code" invalid={!!errors['shipping.postal']} /></Field></View>
          </View>
          <Field label="State" error={errors['shipping.state']}><Input value={ship.state} onChangeText={setS('state')} invalid={!!errors['shipping.state']} /></Field>
          <Button label={`Continue · ${fmt.rupees(total)}`} variant="primary" size="lg" onPress={next} />
          <LinkText label="Back" icon="chevron-left" small onPress={() => setStep('choose')} />
        </>
      ) : null}

      {step === 'pay' ? (
        <>
          <Txt v="small">{title(item!)}{units > 1 ? ` × ${units}` : ''} · paid to {studio.name}. GST included.</Txt>
          <Field label="Name" error={errors.name}><Input value={name} onChangeText={setName} autoComplete="name" placeholder="Priya Rao" invalid={!!errors.name} /></Field>
          <Field label="Email" error={errors.email}><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="priya@gmail.com" invalid={!!errors.email} /></Field>
          <View style={{ gap: 8 }}>
            <Txt v="label">Pay with</Txt>
            <RadioCards<'upi' | 'card'> value={method} onChange={setMethod} options={[{ value: 'upi', title: 'UPI', description: 'GPay, PhonePe, Paytm' }, { value: 'card', title: 'Card' }]} />
          </View>
          {failed ? (
            <Card style={{ backgroundColor: c.badSoft, borderColor: 'transparent', gap: 4 }}>
              <Txt weight="bold" color={c.bad}>Payment didn’t go through</Txt>
              <Txt v="small">{failed} No money was taken.</Txt>
            </Card>
          ) : null}
          <Button label={failed ? 'Try again' : `Pay ${fmt.rupees(total)}`} variant="primary" size="lg" loading={paying} onPress={pay} />
          <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
            <Icon name="lock" size={12} color={c.ink3} />
            <Txt v="small" color={c.ink3}>Secured by Razorpay{API_MODE === 'mock' ? ' · demo checkout, no money moves' : ''}</Txt>
          </View>
          <LinkText label="Back" icon="chevron-left" small onPress={() => setStep(isPrint ? 'address' : 'choose')} />
        </>
      ) : null}
    </Screen>
  )
}
