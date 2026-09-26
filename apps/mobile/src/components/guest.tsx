import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { Image } from 'expo-image'
import { useQueryClient } from '@tanstack/react-query'
import { EVENT_TYPE_LABELS, fmt, type ID } from '@frameline/shared'
import { useApi } from '@/lib/api'
import { errorCode, errorText } from '@/lib/errors'
import { parseCode, routeFor, type ParsedCode } from '@/lib/links'
import { actions, local, useLocal } from '@/lib/local'
import { usePublicEvent } from '@/lib/queries'
import { font, radius, shadow, useTheme } from '@/theme'
import { Icon } from './Icon'
import { ToneView } from './photo'
import { Button, Card, Input, Skeleton, Txt } from './primitives'

/**
 * Code entry used by the Events tab, the Join modal and the scanner fallback. Handles event codes, follow
 * codes, personal links and pasted gallery links; opens the gallery (or studio profile) on success.
 */
export function JoinForm({ autoFocus, onDone, compact }: { autoFocus?: boolean; onDone?: () => void; compact?: boolean }) {
  const { c } = useTheme()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const openCode = useOpenCode()

  const submit = async (raw = value) => {
    const parsed = parseCode(raw)
    if (!parsed) { setError('Codes look like 6402F9F (event) or FA-KCGWHY (studio). Check your invitation.'); return }
    setBusy(true); setError(undefined)
    try {
      await openCode(parsed, 'push')
      setValue('')
      onDone?.()
    } catch (e) {
      setError(notFoundText(parsed, e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Input mono value={value} onChangeText={(t) => { setValue(t.includes('/') ? t : t.toUpperCase()); setError(undefined) }} placeholder="6402F9F" autoCapitalize="characters" autoCorrect={false}
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

/** Plain-words reason a code didn't open. */
export function notFoundText(p: ParsedCode, e: unknown) {
  if (errorCode(e) !== 'not_found') return errorText(e)
  if (p.kind === 'studio') return `No studio uses the code ${p.code}. Ask the studio for their follow code.`
  if (p.kind === 'link') return 'This link is broken or has expired. Ask the photographer for a new one.'
  return `We couldn’t find an event with code ${p.code}. Check the code on your invitation.`
}

/**
 * Opens a parsed code: checks the studio (getStudioProfile) or gallery (getPublicEvent) exists first, so a typo
 * shows an inline error instead of a dead screen. Personal links go to the /s or /v route, which resolves them.
 */
export function useOpenCode() {
  const api = useApi()
  const qc = useQueryClient()
  return async (parsed: ParsedCode, how: 'push' | 'replace') => {
    const go = how === 'push' ? router.push : router.replace
    if (parsed.kind === 'link') { go(routeFor(parsed) as Href); return }
    if (parsed.kind === 'studio') {
      await qc.fetchQuery({ queryKey: ['studio-profile', parsed.code], queryFn: () => api.getStudioProfile(parsed.code) })
      go({ pathname: '/studio/[code]', params: { code: parsed.code } })
      return
    }
    const event = await qc.fetchQuery({ queryKey: ['public-event', parsed.code], queryFn: () => api.getPublicEvent(parsed.code) })
    if (!local.get().mode) actions.setMode('guest')
    actions.join(event, parsed.name)
    go({ pathname: '/event/[id]', params: { id: event.shortId } })
  }
}

/** A joined gallery as a card with its cover, studio and date. */
export function EventCard({ shortId, eventId, onPress }: { shortId: string; eventId: ID; onPress: () => void }) {
  const { c } = useTheme()
  const { data: e, isLoading, error } = usePublicEvent(shortId)
  const selfie = useLocal((s) => !!s.selfie[eventId])
  if (isLoading) return <Skeleton style={{ height: 210, borderRadius: radius.card }} />
  if (!e) {
    return (
      <Card onPress={onPress} style={{ gap: 4 }}>
        <Txt weight="bold">Gallery {shortId}</Txt>
        <Txt v="small">{errorText(error)}</Txt>
      </Card>
    )
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${e.name}, ${fmt.dateRange(e.date, e.endDate)}, ${e.city}`} onPress={onPress}
      style={({ pressed }) => [{ borderRadius: radius.card, overflow: 'hidden', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.9 : 1 }, shadow.card]}>
      <ToneView tone={e.coverTones[0]} style={{ height: 150, justifyContent: 'flex-end', padding: 14 }}>
        {e.coverUrl ? <Image source={{ uri: e.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,10,8,0.18)' }]} />
        <Txt style={{ fontFamily: font.display, color: '#fff', fontSize: 10, letterSpacing: 2.4, position: 'absolute', top: 12, left: 0, right: 0, textAlign: 'center' }}>{e.studio.name.toUpperCase()}</Txt>
        <Txt style={{ fontFamily: font.display, color: '#fff', fontSize: 24, lineHeight: 27 }} numberOfLines={2}>{e.name}</Txt>
      </ToneView>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt v="small">{EVENT_TYPE_LABELS[e.type]} · {fmt.dateRange(e.date, e.endDate)} · {e.city}</Txt>
          <Txt v="mono" color={c.ink3} style={{ fontSize: 12, marginTop: 2 }}>{fmt.count(e.photoCount)} photos · {e.shortId}</Txt>
        </View>
        {selfie ? <View style={[styles.pill, { backgroundColor: c.accentSoft }]}><Icon name="smile" size={13} color={c.accentText} /><Txt v="label" color={c.accentText} style={{ fontSize: 12 }}>Your photos</Txt></View> : null}
        <Icon name="chevron-right" size={18} color={c.ink3} />
      </View>
    </Pressable>
  )
}

/** Small "Enquire with <studio>" prompt shown on galleries, the viewer and the studio profile. */
export function EnquiryPrompt({ shortId, studioCode, studioName, dark, source }: { shortId?: string; studioCode?: string; studioName?: string; dark?: boolean; source: string }) {
  const { c } = useTheme()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Enquire with ${studioName ?? 'the studio'}`}
      onPress={() => router.push({ pathname: '/enquiry', params: { shortId: shortId ?? '', studio: studioCode ?? '', studioName: studioName ?? '', source } })}
      style={({ pressed }) => [styles.enquiry, { backgroundColor: dark ? '#15120F' : c.side, borderColor: dark ? '#2C251D' : c.sideLine, opacity: pressed ? 0.85 : 1 }]}>
      <Icon name="message-circle" size={18} color="#F2D38A" />
      <Txt v="small" color={c.sideInk2} style={{ flex: 1 }}>Want photos like these? <Txt v="small" weight="bold" color="#F2D38A">Enquire with {studioName?.split(' ')[0] ?? 'the studio'}</Txt></Txt>
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
