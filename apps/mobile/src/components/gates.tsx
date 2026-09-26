import { useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { ApiError, type PublicEvent } from '@frameline/shared'
import { API_MODE, useApi } from '@/lib/api'
import { errorCode, friendlyError } from '@/lib/errors'
import { actions, lastRegistration, useLocal } from '@/lib/local'
import { toast } from '@/lib/toast'
import { useTheme } from '@/theme'
import { Icon } from './Icon'
import { ToneView } from './photo'
import { Button, Card, Field, Input, Screen, Txt } from './primitives'

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

function GateHeader({ event, icon, title, body }: { event: PublicEvent; icon: 'lock' | 'user'; title: string; body: string }) {
  const { c } = useTheme()
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <ToneView tone={event.coverTones[0]} style={{ width: 84, height: 84, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(12,10,8,0.5)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color="#F2D38A" />
        </View>
      </ToneView>
      <Txt v="eyebrow" color={c.ink3}>{event.studio.name}</Txt>
      <Txt v="h2" center>{event.name}</Txt>
      <Txt v="h3" center style={{ marginTop: 8 }}>{title}</Txt>
      <Txt v="small" center style={{ maxWidth: 320 }}>{body}</Txt>
    </View>
  )
}

/**
 * PIN gate for `access: 'link-pin'` galleries. `verifyPin` returns a guest session (kept by the HTTP client per
 * gallery); wrong PINs come back as 401 `invalid_pin` with attempts left, and 5 wrong tries lock the phone out
 * with 429 `pin_locked`.
 */
export function PinGate({ event }: { event: PublicEvent }) {
  const { c } = useTheme()
  const api = useApi()
  const reg = useLocal(lastRegistration)
  const [askOpen, setAskOpen] = useState(false)
  const [askName, setAskName] = useState(reg?.name ?? '')
  const [askEmail, setAskEmail] = useState(reg?.email ?? '')
  const [askBusy, setAskBusy] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string>()
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [asked, setAsked] = useState(false)

  const unlock = async (value = pin) => {
    if (busy || locked) return
    setBusy(true)
    try {
      const session = await api.verifyPin(event.shortId, value)
      actions.unlock(event.id, session.seeAll)
      toast.success('Gallery unlocked')
    } catch (e) {
      const f = friendlyError(e)
      setError(`${f.title}. ${f.detail}`)
      setPin('')
      if (errorCode(e) === 'pin_locked') setLocked(true)
    } finally {
      setBusy(false)
    }
  }

  /** requestAccess: the photographer sees the request in Guests and can reply with the PIN. */
  const askHost = async () => {
    if (askName.trim().length < 2 || !emailOk(askEmail)) { toast.error('Add your name and email', 'So the host knows who is asking and where to reply'); return }
    setAskBusy(true)
    try {
      await api.requestAccess(event.shortId, { name: askName.trim(), email: askEmail.trim(), note: 'Asked from the Frameline app' })
      setAsked(true)
      setAskOpen(false)
      toast.success('Request sent', `${event.studio.name} will reply to ${askEmail.trim()}`)
    } catch (e) {
      const f = friendlyError(e)
      toast.error(f.title, f.detail)
    } finally { setAskBusy(false) }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen top contentStyle={{ gap: 18, paddingTop: 80 }}>
        <GateHeader event={event} icon="lock" title="Enter the gallery PIN" body="The host protected these photos with a 4-digit PIN. You’ll find it on the invitation or message you received." />
        <Card style={{ gap: 12 }}>
          <Field label="PIN" error={error}>
            <Input mono value={pin} maxLength={4} keyboardType="number-pad" autoFocus placeholder="••••" invalid={!!error} accessibilityLabel="Gallery PIN" editable={!locked}
              style={{ fontSize: 26, letterSpacing: 12, textAlign: 'center' }}
              onChangeText={(t) => { const v = t.replace(/\D/g, ''); setPin(v); setError(undefined); if (v.length === 4) unlock(v) }} />
          </Field>
          <Button label={locked ? 'Locked for now' : 'Unlock gallery'} variant="primary" size="lg" loading={busy} disabled={pin.length !== 4 || locked} onPress={() => unlock()} />
          {askOpen ? (
            <View style={{ gap: 10 }}>
              <Field label="Your name"><Input value={askName} onChangeText={setAskName} autoComplete="name" placeholder="Full name" /></Field>
              <Field label="Email for the reply"><Input value={askEmail} onChangeText={setAskEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@gmail.com" /></Field>
              <Button label="Send request" loading={askBusy} onPress={askHost} />
            </View>
          ) : (
            <Button label={asked ? 'Request sent' : 'I don’t have a PIN — ask the host'} variant="ghost" disabled={asked} onPress={() => setAskOpen(true)} />
          )}
        </Card>
        {API_MODE === 'mock' ? <Txt v="small" center color={c.ink3}>Demo PIN for the sample wedding: 5211</Txt> : null}
      </Screen>
    </KeyboardAvoidingView>
  )
}

/** Registration form for galleries with `requireRegistration` / `access: 'registered'` (registerGuest). */
export function RegistrationGate({ event }: { event: PublicEvent }) {
  const api = useApi()
  const prev = useLocal(lastRegistration)
  const [name, setName] = useState(prev?.name ?? '')
  const [email, setEmail] = useState(prev?.email ?? '')
  const [phone, setPhone] = useState(prev?.phone ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Enter your name so the host knows who you are'
    if (!emailOk(email)) e.email = 'Enter an email like name@gmail.com'
    if (phone.trim() && phone.replace(/\D/g, '').length < 8) e.phone = 'Enter a phone number with country code, like +91 98200 12345'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      const r = { name: name.trim(), email: email.trim(), phone: phone.trim() }
      const session = await api.registerGuest(event.shortId, { name: r.name, email: r.email, phone: r.phone || undefined })
      actions.register(event.id, r, session.seeAll)
      toast.success(`Welcome, ${r.name.split(' ')[0]}`)
    } catch (err) {
      const f = friendlyError(err)
      if (err instanceof ApiError && err.fieldErrors.length) {
        setErrors(Object.fromEntries(err.fieldErrors.map((x) => [x.field, x.message])))
        return
      }
      if (errorCode(err) === 'pin_required') actions.lock(event.id)
      toast.error(f.title, f.detail)
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen top contentStyle={{ gap: 18, paddingTop: 60 }}>
        <GateHeader event={event} icon="user" title="Tell the host who you are" body="The host asks every guest to register once. Your details are shared only with the host and the studio." />
        <Card style={{ gap: 14 }}>
          <Field label="Your name" error={errors.name}><Input value={name} onChangeText={setName} placeholder="Full name" autoComplete="name" textContentType="name" invalid={!!errors.name} /></Field>
          <Field label="Email" error={errors.email}><Input value={email} onChangeText={setEmail} placeholder="you@gmail.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" invalid={!!errors.email} /></Field>
          <Field label="Phone (optional)" error={errors.phone}><Input value={phone} onChangeText={setPhone} placeholder="+91 98200 12345" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" invalid={!!errors.phone} /></Field>
          <Button label="Continue to photos" variant="primary" size="lg" loading={busy} onPress={submit} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  )
}
