import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { fmt, type ID } from '@frameline/shared'
import { useApi } from '@/lib/api'
import { parseCode } from '@/lib/links'
import { actions, useLocal } from '@/lib/local'
import { useEvent, useStudio } from '@/lib/queries'
import { font, radius, shadow, useTheme } from '@/theme'
import { Icon } from './Icon'
import { ToneView } from './photo'
import { Button, Card, Input, Skeleton, Txt } from './primitives'

/**
 * Code entry used by the Events tab, the Join modal and the scanner fallback. Handles event codes, follow
 * codes and pasted links; opens the gallery (or studio profile) on success.
 */
export function JoinForm({ autoFocus, onDone, compact }: { autoFocus?: boolean; onDone?: () => void; compact?: boolean }) {
  const { c } = useTheme()
  const api = useApi()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const submit = async (raw = value) => {
    const parsed = parseCode(raw)
    if (!parsed) { setError('Codes look like 6402F9F (event) or FA-KCGWHY (studio). Check your invitation.'); return }
    setBusy(true); setError(undefined)
    try {
      if (parsed.kind === 'studio') {
        const studio = await api.getStudio()
        if (studio.followCode.toUpperCase() !== parsed.code) throw new Error('no-studio')
        onDone?.()
        router.push({ pathname: '/studio/[code]', params: { code: parsed.code } })
      } else {
        const event = await api.getEvent(parsed.code)
        actions.join(event, parsed.name)
        setValue('')
        onDone?.()
        router.push({ pathname: '/event/[id]', params: { id: event.id } })
      }
    } catch (e) {
      setError(e instanceof Error && e.message === 'no-studio'
        ? `No studio uses the code ${parsed.code}. Ask the studio for their follow code.`
        : `We couldn’t find an event with code ${parsed.code}. Check the code on your invitation.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Input mono value={value} onChangeText={(t) => { setValue(t.toUpperCase()); setError(undefined) }} placeholder="6402F9F" autoCapitalize="characters" autoCorrect={false}
            autoFocus={autoFocus} returnKeyType="go" onSubmitEditing={() => submit()} invalid={!!error} accessibilityLabel="Event or studio code" />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Scan a QR code" onPress={() => { onDone?.(); router.push('/scan') }}
          style={({ pressed }) => [styles.scanBtn, { backgroundColor: c.side, opacity: pressed ? 0.8 : 1 }]}>
          <Icon name="scan" size={22} color="#F2D38A" />
        </Pressable>
      </View>
      {error ? <Txt v="small" color={c.bad}>{error}</Txt> : null}
      <Button label="Open gallery" variant="primary" size={compact ? 'md' : 'lg'} loading={busy} disabled={!value.trim()} onPress={() => submit()} />
    </View>
  )
}

/** A joined event as a card with its cover, studio and date. */
export function EventCard({ eventId, onPress }: { eventId: ID; onPress: () => void }) {
  const { c } = useTheme()
  const { data: e, isLoading } = useEvent(eventId)
  const { data: studio } = useStudio()
  const selfie = useLocal((s) => !!s.selfie[eventId])
  if (isLoading || !e) return <Skeleton style={{ height: 210, borderRadius: radius.card }} />
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${e.name}, ${fmt.dateRange(e.date, e.endDate)}, ${e.city}`} onPress={onPress}
      style={({ pressed }) => [{ borderRadius: radius.card, overflow: 'hidden', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.9 : 1 }, shadow.card]}>
      <ToneView tone={e.coverTones[0]} style={{ height: 150, justifyContent: 'flex-end', padding: 14 }}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,10,8,0.18)' }]} />
        <Txt style={{ fontFamily: font.display, color: '#fff', fontSize: 10, letterSpacing: 2.4, position: 'absolute', top: 12, left: 0, right: 0, textAlign: 'center' }}>{(studio?.name ?? '').toUpperCase()}</Txt>
        <Txt style={{ fontFamily: font.display, color: '#fff', fontSize: 24, lineHeight: 27 }} numberOfLines={2}>{e.name}</Txt>
      </ToneView>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt v="small">{fmt.dateRange(e.date, e.endDate)} · {e.city}</Txt>
          <Txt v="mono" color={c.ink3} style={{ fontSize: 12, marginTop: 2 }}>{fmt.count(e.photoCount)} photos · {e.shortId}</Txt>
        </View>
        {selfie ? <View style={[styles.pill, { backgroundColor: c.accentSoft }]}><Icon name="smile" size={13} color={c.accentText} /><Txt v="label" color={c.accentText} style={{ fontSize: 12 }}>Your photos</Txt></View> : null}
        <Icon name="chevron-right" size={18} color={c.ink3} />
      </View>
    </Pressable>
  )
}

/** Small "Enquire with <studio>" prompt shown on galleries and in the viewer. */
export function EnquiryPrompt({ eventId, dark, source }: { eventId?: ID; dark?: boolean; source: string }) {
  const { c } = useTheme()
  const { data: studio } = useStudio()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Enquire with ${studio?.name ?? 'the studio'}`} onPress={() => router.push({ pathname: '/enquiry', params: { eventId: eventId ?? '', source } })}
      style={({ pressed }) => [styles.enquiry, { backgroundColor: dark ? '#15120F' : c.side, borderColor: dark ? '#2C251D' : c.sideLine, opacity: pressed ? 0.85 : 1 }]}>
      <Icon name="message-circle" size={18} color="#F2D38A" />
      <Txt v="small" color={c.sideInk2} style={{ flex: 1 }}>Want photos like these? <Txt v="small" weight="bold" color="#F2D38A">Enquire with {studio?.name.split(' ')[0] ?? 'the studio'}</Txt></Txt>
      <Icon name="chevron-right" size={16} color={c.sideInk2} />
    </Pressable>
  )
}

export function InfoCard({ icon, title, body, action, onAction }: { icon: Parameters<typeof Icon>[0]['name']; title: string; body: string; action?: string; onAction?: () => void }) {
  const { c } = useTheme()
  return (
    <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View style={[styles.icon, { backgroundColor: c.accentSoft }]}><Icon name={icon} size={18} color={c.accentText} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="bold">{title}</Txt>
        <Txt v="small">{body}</Txt>
      </View>
      {action && onAction ? <Button label={action} size="sm" onPress={onAction} /> : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  scanBtn: { width: 50, height: 50, borderRadius: radius.control + 2, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  enquiry: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.card, borderWidth: 1, minHeight: 52 },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
})
