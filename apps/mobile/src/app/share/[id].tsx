import { Share, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { hash, type AccessMode } from '@frameline/shared'
import { Button, Card, DarkCard, IconButton, LoadingList, QRCode, Screen, Segmented, Txt } from '@/components'
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

/** Share sheet: link, PIN, QR (decorative, same pattern as the web QRCode) and access mode. */
export default function ShareEvent() {
  const { c } = useTheme()
  const api = useApi()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: event } = useEvent(id)
  const { data: studio } = useStudio()
  const access = useAction((mode: AccessMode) => api.updateEventSettings(id, { access: mode }), { success: 'Access updated' })
  const resetPin = useAction(() => api.resetPin(id), { success: (pin) => `New PIN ${pin}` })

  if (!event) return <LoadingList />
  const link = eventLink(event)
  const pinOn = event.settings.access === 'link-pin'
  const message = `${event.name} — your photos by ${studio?.name ?? 'us'} are ready. Open ${link}${pinOn ? ` and enter PIN ${event.settings.pin}` : ''}. Tap “Find my photos” and take a selfie to see the ones you’re in.`

  const copy = async (text: string, what: string) => { await Clipboard.setStringAsync(text); toast.success(`${what} copied`) }

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
        <Txt v="small">{event.settings.access === 'link' ? 'Anyone with the link can open the gallery.' : event.settings.access === 'link-pin' ? 'Guests need the link and the 4-digit PIN.' : 'Guests register with name, email and phone before seeing photos.'}</Txt>
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
          <QRCode seed={hash(event.shortId) % 100000} size={200} rounded />
        </View>
        <Txt v="small" center>Print it on standees and table cards. Guests scan it with the Frameline app or their camera.</Txt>
        <Txt v="mono" color={c.ink3} style={{ fontSize: 12 }}>{event.shortId}</Txt>
      </Card>

      <Card style={{ gap: 8 }}>
        <Txt v="h3">Message</Txt>
        <Txt v="small" selectable>{message}</Txt>
        <Button label="Copy message" icon="copy" size="sm" onPress={() => copy(message, 'Message')} />
      </Card>
    </Screen>
  )
}
