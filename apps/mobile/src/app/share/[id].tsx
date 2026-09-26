import { useState } from 'react'
import { Share, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import type { AccessMode, GuestLinkResult } from '@frameline/shared'
import { Button, Card, DarkCard, Field, IconButton, Input, LoadingList, QRCode, Screen, Segmented, SettingRow, Toggle, Txt } from '@/components'
import { useApi } from '@/lib/api'
import { eventLink } from '@/lib/links'
import { useAction, useEvent, useStudio } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { font, radius, useTheme } from '@/theme'

const ACCESS: { value: AccessMode; label: string }[] = [
  { value: 'link', label: 'Link' },
  { value: 'link-pin', label: 'Link + PIN' },
  { value: 'registered', label: 'Registered' },
]

/** Share sheet: link, PIN, scannable QR, access mode, and personal guest links (createGuestLink). */
export default function ShareEvent() {
  const { c } = useTheme()
  const api = useApi()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: event } = useEvent(id)
  const { data: studio } = useStudio()
  const access = useAction((mode: AccessMode) => api.updateEventSettings(id, { access: mode }), { success: 'Access updated' })
  const resetPin = useAction(() => api.resetPin(id), { success: (pin) => `New PIN ${pin}` })
  const [guestName, setGuestName] = useState('')
  const [startMine, setStartMine] = useState(false)
  const [vip, setVip] = useState(false)
  const [made, setMade] = useState<GuestLinkResult | null>(null)
  const personal = useAction(() => api.createGuestLink(id, {
    n: guestName.trim() || undefined,
    me: startMine || undefined,
    vip: vip ? { skipLogin: true, pin: true, all: true } : undefined,
  }), { onSuccess: (r) => setMade(r) })

  if (!event) return <LoadingList />
  const link = eventLink(event)
  const pinOn = event.settings.access === 'link-pin'
  const message = `${event.name} — your photos by ${studio?.name ?? 'us'} are ready. Open ${link}${pinOn ? ` and enter PIN ${event.settings.pin}` : ''}. Tap “Find my photos” and take a selfie to see the ones you’re in.`

  const copy = async (text: string, what: string) => { await Clipboard.setStringAsync(text); toast.success(`${what} copied`) }
  const sharePersonal = (r: GuestLinkResult) => Share.share({
    message: `${r.payload.n ? `${r.payload.n}, your` : 'Your'} photos from ${event.name} by ${studio?.name ?? 'us'}: ${r.url}`,
  })

  return (
    <Screen>
      <DarkCard style={{ gap: 10 }}>
        <Txt v="eyebrow" color={c.sideInk2}>Gallery link</Txt>
        <Txt style={{ fontFamily: font.mono, fontSize: 16, color: '#F2D38A' }} selectable>{link.replace('https://', '')}</Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Copy link" icon="copy" variant="dark" size="sm" style={{ flex: 1 }} onPress={() => copy(link, 'Link')} />
          <Button label="Share" icon="share" variant="primary" size="sm" style={{ flex: 1 }} onPress={() => Share.share({ message })} />
        </View>
      </DarkCard>

      <Card style={{ gap: 10 }}>
        <Txt v="h3">Who can open it</Txt>
        <Segmented value={event.settings.access} onChange={(v) => access.mutate(v)} options={ACCESS} />
        <Txt v="small">{event.settings.access === 'link' ? 'Anyone with the link can open the gallery.' : event.settings.access === 'link-pin' ? 'Guests need the link and the 4-digit PIN.' : 'Guests register with name and email before seeing photos.'}</Txt>
        {pinOn ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Txt v="label">PIN</Txt>
              <Txt style={{ fontFamily: font.monoBold, fontSize: 26, letterSpacing: 6, color: c.ink }} selectable>{event.settings.pin}</Txt>
            </View>
            <IconButton icon="copy" label="Copy PIN" tone="soft" onPress={() => copy(event.settings.pin, 'PIN')} />
            <Button label="New PIN" icon="refresh-cw" size="sm" loading={resetPin.isPending} onPress={() => resetPin.mutate(undefined)} />
          </View>
        ) : null}
      </Card>

      <Card style={{ alignItems: 'center', gap: 12 }}>
        <Txt v="h3" style={{ alignSelf: 'flex-start' }}>QR code</Txt>
        <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: radius.card }}>
          <QRCode value={link} size={200} rounded />
        </View>
        <Txt v="small" center>Print it on standees and table cards. Guests scan it with the Frameline app or their camera.</Txt>
        <Txt v="mono" color={c.ink3} style={{ fontSize: 12 }}>{event.shortId}</Txt>
      </Card>

      <Card style={{ gap: 10 }}>
        <Txt v="h3">Personal link</Txt>
        <Txt v="small">A link for one guest: it greets them by name and can open straight on their photos. VIP links skip the PIN and show every photo.</Txt>
        <Field label="Guest name (optional)"><Input value={guestName} onChangeText={(t) => { setGuestName(t); setMade(null) }} placeholder="Dadi ji" maxLength={40} /></Field>
        <View>
          <SettingRow first title="Start on “My photos”" detail="Opens the selfie step first" right={<Toggle label="Start on My photos" value={startMine} onChange={(v) => { setStartMine(v); setMade(null) }} />} />
          <SettingRow title="VIP" detail="Skip the PIN, see every photo" right={<Toggle label="VIP link" value={vip} onChange={(v) => { setVip(v); setMade(null) }} />} />
        </View>
        {made ? (
          <View style={{ gap: 8 }}>
            <Txt v="mono" selectable style={{ fontSize: 13 }}>{made.url.replace('https://', '')}</Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Copy" icon="copy" size="sm" style={{ flex: 1 }} onPress={() => copy(made.url, 'Personal link')} />
              <Button label="Share" icon="share" variant="primary" size="sm" style={{ flex: 1 }} onPress={() => sharePersonal(made)} />
            </View>
          </View>
        ) : <Button label="Create personal link" icon="link" loading={personal.isPending} onPress={() => personal.mutate(undefined)} />}
      </Card>

      <Card style={{ gap: 8 }}>
        <Txt v="h3">Message</Txt>
        <Txt v="small" selectable>{message}</Txt>
        <Button label="Copy message" icon="copy" size="sm" onPress={() => copy(message, 'Message')} />
      </Card>
    </Screen>
  )
}
