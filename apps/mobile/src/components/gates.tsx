import { useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import type { PhotoEvent, Studio } from '@frameline/shared'
import { actions, lastRegistration, useLocal } from '@/lib/local'
import { toast } from '@/lib/toast'
import { useTheme } from '@/theme'
import { Icon } from './Icon'
import { ToneView } from './photo'
import { Button, Card, Field, Input, Screen, Txt } from './primitives'

function GateHeader({ event, studio, icon, title, body }: { event: PhotoEvent; studio?: Studio; icon: 'lock' | 'user'; title: string; body: string }) {
  const { c } = useTheme()
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <ToneView tone={event.coverTones[0]} style={{ width: 84, height: 84, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(12,10,8,0.5)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color="#F2D38A" />
        </View>
      </ToneView>
      {studio ? <Txt v="eyebrow" color={c.ink3}>{studio.name}</Txt> : null}
      <Txt v="h2" center>{event.name}</Txt>
      <Txt v="h3" center style={{ marginTop: 8 }}>{title}</Txt>
      <Txt v="small" center style={{ maxWidth: 320 }}>{body}</Txt>
    </View>
  )
}

/** PIN gate for `access: 'link-pin'` galleries. */
export function PinGate({ event, studio }: { event: PhotoEvent; studio?: Studio }) {
  const { c } = useTheme()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string>()
  const unlock = (value = pin) => {
    if (value === event.settings.pin) { actions.unlock(event.id); toast.success('Gallery unlocked') }
    else setError('That PIN doesn’t match. Ask the host for the 4-digit PIN on your invitation.')
  }
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen top contentStyle={{ gap: 18, paddingTop: 80 }}>
        <GateHeader event={event} studio={studio} icon="lock" title="Enter the gallery PIN" body="The host protected these photos with a 4-digit PIN. You’ll find it on the invitation or message you received." />
        <Card style={{ gap: 12 }}>
          <Field label="PIN" error={error}>
            <Input mono value={pin} maxLength={4} keyboardType="number-pad" autoFocus placeholder="••••" invalid={!!error} accessibilityLabel="Gallery PIN"
              style={{ fontSize: 26, letterSpacing: 12, textAlign: 'center' }}
              onChangeText={(t) => { const v = t.replace(/\D/g, ''); setPin(v); setError(undefined); if (v.length === 4) unlock(v) }} />
          </Field>
          <Button label="Unlock gallery" variant="primary" size="lg" disabled={pin.length !== 4} onPress={() => unlock()} />
          <Button label="I don’t have a PIN — ask the host" variant="ghost" onPress={() => toast.success('Request sent', `${studio?.name ?? 'The studio'} will share access with you by email`)} />
        </Card>
        <Txt v="small" center color={c.ink3}>Demo PIN for the sample wedding: 5211</Txt>
      </Screen>
    </KeyboardAvoidingView>
  )
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

/** Registration form for galleries with `requireRegistration`. */
export function RegistrationGate({ event, studio }: { event: PhotoEvent; studio?: Studio }) {
  const prev = useLocal(lastRegistration)
  const [name, setName] = useState(prev?.name ?? '')
  const [email, setEmail] = useState(prev?.email ?? '')
  const [phone, setPhone] = useState(prev?.phone ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const submit = () => {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Enter your name so the host knows who you are'
    if (!emailOk(email)) e.email = 'Enter an email like name@gmail.com'
    if (phone.replace(/\D/g, '').length < 8) e.phone = 'Enter a phone number with country code, like +91 98200 12345'
    setErrors(e)
    if (Object.keys(e).length) return
    actions.register(event.id, { name: name.trim(), email: email.trim(), phone: phone.trim() })
    toast.success(`Welcome, ${name.trim().split(' ')[0]}`)
  }
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen top contentStyle={{ gap: 18, paddingTop: 60 }}>
        <GateHeader event={event} studio={studio} icon="user" title="Tell the host who you are" body="The host asks every guest to register once. Your details are shared only with the host and the studio." />
        <Card style={{ gap: 14 }}>
          <Field label="Your name" error={errors.name}><Input value={name} onChangeText={setName} placeholder="Full name" autoComplete="name" textContentType="name" invalid={!!errors.name} /></Field>
          <Field label="Email" error={errors.email}><Input value={email} onChangeText={setEmail} placeholder="you@gmail.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" invalid={!!errors.email} /></Field>
          <Field label="Phone" error={errors.phone}><Input value={phone} onChangeText={setPhone} placeholder="+91 98200 12345" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" invalid={!!errors.phone} /></Field>
          <Button label="Continue to photos" variant="primary" size="lg" onPress={submit} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  )
}
