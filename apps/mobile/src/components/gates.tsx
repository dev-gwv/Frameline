import { useRef, useState } from 'react'
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useAnimatedValue } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError, fmt, type PublicEvent } from '@frameline/shared'
import { API_MODE, useApi } from '@/lib/api'
import { errorCode, friendlyError } from '@/lib/errors'
import { actions, lastRegistration, useLocal } from '@/lib/local'
import { toast } from '@/lib/toast'
import { font, radius, useTheme } from '@/theme'
import { ToneView } from './photo'
import { Button, Field, Input, LinkText, Txt } from './primitives'

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
/** Older app versions stored a stand-in email for mobile-only sign-ups; never show or reuse it. */
export const isPhoneEmail = (email: string | undefined) => !!email && email.endsWith('@mobile.frameline.in')
/** A real email the guest typed before (never the mobile stand-in). */
export const realEmail = (email: string | undefined) => (email && !isPhoneEmail(email) ? email : '')

/** Event cover hero: studio name, event name (title), dates · city. `small` for gates and sheets. */
export function GalleryHero({ event, small, welcome, children }: { event: PublicEvent; small?: boolean; welcome?: string; children?: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  const h = (small ? 150 : 250) + insets.top
  return (
    <ToneView tone={event.coverTones[0]} style={{ height: h, justifyContent: 'flex-end', padding: 16 }}>
      {event.coverUrl ? <Image source={{ uri: event.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
      <LinearGradient colors={['rgba(0,0,0,0.25)', 'transparent', 'rgba(0,0,0,0.6)']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
      <Txt style={styles.heroSmall}>{event.studio.name}</Txt>
      <Txt style={[styles.heroTitle, small && { fontSize: 22, lineHeight: 26 }]} accessibilityRole="header" numberOfLines={2}>{event.name}</Txt>
      <Txt style={styles.heroSmall}>{fmt.dateRange(event.date, event.endDate)} · {event.city}{welcome ? `  ·  Welcome, ${welcome}` : ''}</Txt>
      {children}
    </ToneView>
  )
}

/**
 * PIN gate for `access: 'link-pin'` galleries: four code boxes, one gold "Open gallery". Wrong PINs shake the boxes
 * and show the tries left (401 `invalid_pin`); after 5, 429 `pin_locked` says how long to wait.
 */
export function PinGate({ event }: { event: PublicEvent }) {
  const { c } = useTheme()
  const api = useApi()
  const reg = useLocal(lastRegistration)
  const input = useRef<TextInput>(null)
  const shake = useAnimatedValue(0)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string>()
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [askName, setAskName] = useState(reg?.name ?? '')
  const [askEmail, setAskEmail] = useState(realEmail(reg?.email))
  const [askBusy, setAskBusy] = useState(false)
  const [asked, setAsked] = useState(false)

  const doShake = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
    Animated.sequence([10, -10, 8, -8, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 55, useNativeDriver: true }))).start()
  }
  const unlock = async (value = pin) => {
    if (busy || locked || value.length !== 4) return
    setBusy(true)
    try {
      const session = await api.verifyPin(event.shortId, value)
      actions.unlock(event.id, session.seeAll)
    } catch (e) {
      const f = friendlyError(e)
      setError(errorCode(e) === 'pin_locked' ? `Too many tries. ${f.detail}` : f.detail)
      setPin('')
      doShake()
      if (errorCode(e) === 'pin_locked') setLocked(true)
    } finally { setBusy(false) }
  }
  const askHost = async () => {
    if (askName.trim().length < 2 || !emailOk(askEmail)) { toast.error('Add your name and email', 'So the host knows who is asking and where to reply'); return }
    setAskBusy(true)
    try {
      await api.requestAccess(event.shortId, { name: askName.trim(), email: askEmail.trim(), note: 'Asked from the Frameline app' })
      setAsked(true); setAskOpen(false)
      toast.success('Request sent', `${event.studio.name} will reply to ${askEmail.trim()}`)
    } catch (e) { const f = friendlyError(e); toast.error(f.title, f.detail) } finally { setAskBusy(false) }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <GalleryHero event={event} small />
        <View style={{ padding: 20, gap: 12, alignItems: 'center' }}>
          <Txt v="h3" center style={{ fontSize: 18 }}>Enter the event PIN</Txt>
          <Txt v="small" center>It’s on the invite or the QR poster.</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel={`PIN, ${pin.length} of 4 digits entered`} onPress={() => input.current?.focus()}>
            <Animated.View style={{ flexDirection: 'row', gap: 10, marginVertical: 6, transform: [{ translateX: shake }] }}>
              {[0, 1, 2, 3].map((i) => {
                const focus = i === pin.length && !locked
                return (
                  <View key={i} style={[styles.box, { borderColor: error ? c.bad : focus ? c.accent : c.line2, borderWidth: focus ? 2 : 1, backgroundColor: c.surface }]}>
                    <Txt style={{ fontFamily: font.bodyHeavy, fontSize: 24, fontVariant: ['tabular-nums'] }}>{pin[i] ?? ''}</Txt>
                  </View>
                )
              })}
            </Animated.View>
          </Pressable>
          <TextInput ref={input} value={pin} autoFocus editable={!locked} keyboardType="number-pad" maxLength={4} textContentType="oneTimeCode" accessibilityLabel="Gallery PIN"
            onChangeText={(t) => { const v = t.replace(/\D/g, ''); setPin(v); setError(undefined); if (v.length === 4) unlock(v) }}
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
          {error ? <Txt v="small" color={c.bad} center>{error}</Txt> : null}
          <Button label={locked ? 'Locked for now' : 'Open gallery'} variant="primary" size="lg" full loading={busy} disabled={pin.length !== 4 || locked} onPress={() => unlock()} />
          {askOpen ? (
            <View style={{ gap: 10, alignSelf: 'stretch' }}>
              <Field label="Your name"><Input value={askName} onChangeText={setAskName} autoComplete="name" placeholder="Full name" /></Field>
              <Field label="Email for the reply"><Input value={askEmail} onChangeText={setAskEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@gmail.com" /></Field>
              <Button label="Ask the host" loading={askBusy} onPress={askHost} />
            </View>
          ) : (
            <LinkText label={asked ? 'Request sent to the host' : 'I don’t have the PIN'} small onPress={() => { if (!asked) setAskOpen(true) }} />
          )}
          {API_MODE === 'mock' ? <Txt v="small" center color={c.ink3}>Demo PIN for the sample wedding: 5211</Txt> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

/** Sign-up for galleries that ask (requireRegistration / access 'registered'): name and mobile; email optional. */
export function RegistrationGate({ event }: { event: PublicEvent }) {
  const { c } = useTheme()
  const api = useApi()
  const prev = useLocal(lastRegistration)
  const [name, setName] = useState(prev?.name ?? '')
  const [phone, setPhone] = useState(prev?.phone ?? '')
  const [email, setEmail] = useState(realEmail(prev?.email))
  const [withEmail, setWithEmail] = useState(!!realEmail(prev?.email))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Enter your name so the host knows who you are'
    if (phone.replace(/\D/g, '').length < 8) e.phone = 'Enter your mobile number, like +91 98450 55012'
    if (email.trim() && !emailOk(email)) e.email = 'Enter an email like name@gmail.com, or leave it empty'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      const r = { name: name.trim(), email: email.trim(), phone: phone.trim() }
      // Contract v5: name + email or phone.
      const session = await api.registerGuest(event.shortId, { name: r.name, email: r.email || undefined, phone: r.phone })
      actions.register(event.id, r, session.seeAll)
    } catch (err) {
      const f = friendlyError(err)
      if (err instanceof ApiError && err.fieldErrors.length) { setErrors(Object.fromEntries(err.fieldErrors.map((x) => [x.field, x.message]))); return }
      if (errorCode(err) === 'pin_required') actions.lock(event.id)
      toast.error(f.title, f.detail)
    } finally { setBusy(false) }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <GalleryHero event={event} small />
        <View style={{ padding: 20, gap: 14 }}>
          <View style={{ gap: 2 }}>
            <Txt v="h3" style={{ fontSize: 18 }}>Tell the host who you are</Txt>
            <Txt v="small">So they know who’s looking at their photos.</Txt>
          </View>
          <Field label="Your name" error={errors.name}><Input value={name} onChangeText={setName} placeholder="Priya Rao" autoComplete="name" textContentType="name" invalid={!!errors.name} /></Field>
          <Field label="Mobile" error={errors.phone}><Input value={phone} onChangeText={setPhone} placeholder="+91 98450 55012" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" invalid={!!errors.phone} /></Field>
          {withEmail
            ? <Field label="Email (optional)" error={errors.email}><Input value={email} onChangeText={setEmail} placeholder="you@gmail.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" invalid={!!errors.email} /></Field>
            : <LinkText label="Add an email (optional)" small onPress={() => setWithEmail(true)} />}
          <Button label="Continue" variant="primary" size="lg" loading={busy} onPress={submit} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  box: { width: 54, height: 60, borderRadius: radius.control + 2, alignItems: 'center', justifyContent: 'center' },
  heroSmall: { fontFamily: font.body, color: 'rgba(255,255,255,0.9)', fontSize: 12.5 },
  heroTitle: { fontFamily: font.display, color: '#fff', fontSize: 30, lineHeight: 34, marginVertical: 2 },
})
