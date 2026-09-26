import { useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Button, Field, Icon, Input, Screen, Txt } from '@/components'
import { actions, lastRegistration, useLocal } from '@/lib/local'
import { useStudio } from '@/lib/queries'
import { useTheme } from '@/theme'

/**
 * Enquiry form (lead capture from galleries, the viewer and the studio profile). There's no create-enquiry
 * endpoint yet, so the enquiry is kept on the phone and the confirmation is simulated.
 */
export default function Enquiry() {
  const { c } = useTheme()
  const { source } = useLocalSearchParams<{ eventId?: string; source?: string }>()
  const { data: studio } = useStudio()
  const reg = useLocal(lastRegistration)
  const [name, setName] = useState(reg?.name ?? '')
  const [phone, setPhone] = useState(reg?.phone ?? '')
  const [email, setEmail] = useState(reg?.email ?? '')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sent, setSent] = useState(false)

  const submit = () => {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Enter your name'
    if (phone.replace(/\D/g, '').length < 8 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.phone = 'Add a phone number or an email so the studio can reply'
    if (message.trim().length < 5) e.message = 'Tell the studio what you’re planning — the date and place help'
    setErrors(e)
    if (Object.keys(e).length) return
    actions.addEnquiry({ name: name.trim(), phone: phone.trim(), email: email.trim(), message: message.trim(), source: source || 'Frameline app' })
    setSent(true)
  }

  if (sent) {
    return (
      <Screen contentStyle={{ alignItems: 'center', paddingTop: 48, gap: 12 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="send" size={28} color={c.accentText} /></View>
        <Txt v="h2" center>Enquiry sent</Txt>
        <Txt v="small" center style={{ maxWidth: 300 }}>{studio?.name ?? 'The studio'} usually replies within a day on {phone ? 'WhatsApp or phone' : 'email'}.</Txt>
        <Button label="Done" variant="primary" size="lg" full style={{ marginTop: 12 }} onPress={() => router.back()} />
      </Screen>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Txt v="small">Planning a wedding, shoot or event? Send {studio?.name ?? 'the studio'} a note and they’ll get back to you.</Txt>
        <Field label="Your name" error={errors.name}><Input value={name} onChangeText={setName} autoComplete="name" placeholder="Full name" invalid={!!errors.name} /></Field>
        <Field label="Phone" error={errors.phone}><Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="+91 98200 12345" invalid={!!errors.phone} /></Field>
        <Field label="Email (optional)"><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@gmail.com" /></Field>
        <Field label="What are you planning?" error={errors.message}>
          <Input value={message} onChangeText={setMessage} multiline placeholder="Wedding in Goa on 14 Feb 2027, about 250 guests" invalid={!!errors.message} style={{ minHeight: 110, paddingVertical: 12, textAlignVertical: 'top' }} />
        </Field>
        <Button label="Send enquiry" variant="primary" size="lg" onPress={submit} />
      </Screen>
    </KeyboardAvoidingView>
  )
}
