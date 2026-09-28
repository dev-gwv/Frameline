import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError, DEMO_NOW, EVENT_TYPES, fmt, type EventType, type PresetId } from '@frameline/shared'
import { Button, Chip, Field, Icon, IconButton, Input, RadioCards, SoftCard, Toggle, Txt } from '@/components'
import { DateField } from '@/components/DateField'
import { useApi } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { useUsage } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { useTheme } from '@/theme'

const WHO: { value: PresetId; title: string; description: string }[] = [
  { value: 'private-family', title: 'Only the people in them', description: 'Guests take a selfie to see their own photos. PIN required.' },
  { value: 'open-corporate', title: 'Everyone with the link', description: 'Good for company events and parties.' },
  { value: 'race', title: 'Buyers (race or sports)', description: 'Guests find their photos and buy them.' },
]
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

/** New event: a full-screen form with three questions; event type, client contact and guest uploads fold away. */
export default function NewEvent() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const api = useApi()
  const { data: usage } = useUsage()
  const [name, setName] = useState('')
  const [date, setDate] = useState(new Date(DEMO_NOW + 7 * 86_400_000).toISOString())
  const [city, setCity] = useState('')
  const [preset, setPreset] = useState<PresetId>('private-family')
  const [more, setMore] = useState(false)
  const [type, setType] = useState<EventType>('wedding')
  const [hostEmail, setHostEmail] = useState('')
  const [hostPhone, setHostPhone] = useState('')
  const [guestUploads, setGuestUploads] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const left = usage ? usage.photosLimit - usage.photosUsed : undefined
  const full = left !== undefined && left <= 0

  const create = async () => {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Give the event a name guests will recognise'
    if (!city.trim()) e.city = 'Add the city'
    if (hostEmail.trim() && !emailOk(hostEmail)) e.hostEmail = 'Enter an email like name@gmail.com'
    setErrors(e)
    if (Object.keys(e).length) { if (e.hostEmail) setMore(true); return }
    setBusy(true)
    try {
      const ev = await api.createEvent({
        name: name.trim(), date, city: city.trim(), type: preset === 'race' && !more ? 'sports' : type, preset,
        host: hostEmail.trim() ? { email: hostEmail.trim(), phone: hostPhone.trim() || undefined } : undefined,
        guestUploadLimit: guestUploads ? 20 : 0,
      })
      if (guestUploads) await api.updateEventSettings(ev.id, { guestUploads: true }).catch(() => {})
      toast.success(`${ev.name} created`, 'Add photos, then share the link')
      router.replace({ pathname: '/manage/[id]', params: { id: ev.id } })
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) setErrors(Object.fromEntries(err.fieldErrors.map((x) => [x.field, x.message])))
      const f = friendlyError(err)
      toast.error(f.title, f.detail)
    } finally { setBusy(false) }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <IconButton icon="x" label="Cancel" onPress={() => router.back()} />
        <View style={{ flex: 1, paddingVertical: 6 }}>
          <Txt v="h2">New event</Txt>
          <Txt v="small">You can change everything later.</Txt>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Field label="Event name" error={errors.name}>
          <Input value={name} onChangeText={(t) => { setName(t); setErrors((x) => ({ ...x, name: '' })) }} placeholder="Anaya’s First Birthday" autoFocus invalid={!!errors.name} returnKeyType="next" />
        </Field>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><DateField value={date} onChange={setDate} /></View>
          <View style={{ flex: 1 }}>
            <Field label="City" error={errors.city}><Input value={city} onChangeText={(t) => { setCity(t); setErrors((x) => ({ ...x, city: '' })) }} placeholder="Bengaluru" invalid={!!errors.city} /></Field>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Txt v="label">Who should see the photos?</Txt>
          <RadioCards value={preset} onChange={setPreset} options={WHO} />
        </View>

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(!more)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt weight="bold" color={c.accentText} style={{ flex: 1 }}>More options: event type, client’s contact, guest uploads</Txt>
          <Icon name={more ? 'chevron-up' : 'chevron-down'} size={17} color={c.accentText} />
        </Pressable>
        {more ? (
          <View style={{ gap: 14 }}>
            <View style={{ gap: 8 }}>
              <Txt v="label">Event type</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {EVENT_TYPES.map((t) => <Chip key={t.value} label={t.label} selected={type === t.value} onPress={() => setType(t.value)} />)}
              </View>
            </View>
            <Field label="Client’s email (optional)" hint="They become a host: they can see picks and guest requests." error={errors.hostEmail}>
              <Input value={hostEmail} onChangeText={setHostEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="client@gmail.com" invalid={!!errors.hostEmail} />
            </Field>
            <Field label="Client’s mobile (optional)"><Input value={hostPhone} onChangeText={setHostPhone} keyboardType="phone-pad" placeholder="+91 98200 12345" /></Field>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt weight="bold">Let guests add their photos</Txt>
                <Txt v="small">Up to 20 each. You check them before everyone can see them.</Txt>
              </View>
              <Toggle label="Let guests add their photos" value={guestUploads} onChange={setGuestUploads} />
            </View>
          </View>
        ) : null}

        {left !== undefined ? (
          full ? (
            <SoftCard style={{ gap: 8 }}>
              <Txt weight="bold">Your plan is full</Txt>
              <Txt v="small">You can still create the event. To upload, add photos to your plan or upgrade on the web.</Txt>
              <Button label="Plan and billing" size="sm" onPress={() => router.push('/tools/plan')} />
            </SoftCard>
          ) : (
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Icon name="info" size={14} color={c.ink3} />
              <Txt v="small" color={c.ink3}>Uses your plan: {fmt.count(left)} photos left.</Txt>
            </View>
          )
        ) : null}
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
        <Button label="Create event" variant="primary" size="lg" loading={busy} onPress={create} />
      </View>
    </KeyboardAvoidingView>
  )
}

