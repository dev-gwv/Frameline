import { useRef, useState } from 'react'
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as ImagePicker from 'expo-image-picker'
import * as Sharing from 'expo-sharing'
import * as WebBrowser from 'expo-web-browser'
import { captureRef } from 'react-native-view-shot'
import { fmt, type AccessMode, type GuestLinkResult, type PhotoEvent } from '@frameline/shared'
import { useApi } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { eventLink } from '@/lib/links'
import { useAction, useAlbums, useStudio } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { radius, useTheme } from '@/theme'
import { Icon, type IconName } from './Icon'
import { QRCode, Sheet } from './overlays'
import { Button, Chip, Input, LinkText, RadioCards, SettingRow, Txt } from './primitives'

type Step = 'link' | 'qr' | 'newPin' | 'special'
const ACCESS: { value: AccessMode; title: string; description: string }[] = [
  { value: 'link-pin', title: 'Anyone with the link and PIN', description: 'The PIN is on the invite and the QR poster.' },
  { value: 'link', title: 'Anyone with the link', description: 'No PIN. Good for open events.' },
  { value: 'registered', title: 'People who sign up', description: 'Guests give their name and mobile first.' },
]

/**
 * Share sheet: copy link, PIN, WhatsApp, QR code; "Who can open it" is the same setting as in Settings. Special
 * links (one album, one person, family VIP) are folded one step deeper. A new PIN asks first.
 */
export function ShareSheet({ event, open, onClose }: { event: PhotoEvent; open: boolean; onClose: () => void }) {
  const { c } = useTheme()
  const api = useApi()
  const { data: studio } = useStudio()
  const [step, setStep] = useState<Step>('link')
  const [accessOpen, setAccessOpen] = useState(false)
  const qrRef = useRef<View>(null)
  const link = eventLink(event)
  const pinOn = event.settings.access === 'link-pin'
  const message = `Hi! Photos from ${event.name} are ready.\nOpen: ${link.replace('https://', '')}${pinOn ? ` · PIN ${event.settings.pin}` : ''}\nTake a selfie to see the photos you’re in.\n— ${studio?.name ?? 'Your photographer'}`

  const access = useAction((mode: AccessMode) => api.updateEventSettings(event.id, { access: mode }), { success: 'Saved' })
  const resetPin = useAction(() => api.resetPin(event.id), { success: (pin) => `New PIN ${pin}. Old links need it now.`, onSuccess: () => setStep('link') })

  const close = () => { setStep('link'); setAccessOpen(false); onClose() }
  const copy = async (text: string, what: string) => { await Clipboard.setStringAsync(text); toast.success(`${what} copied`) }
  const whatsapp = () => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`).catch(() => Share.share({ message }))
  const shareQr = async () => {
    try {
      const uri = await captureRef(qrRef, { format: 'png', quality: 1, width: 1200, height: 1200, result: 'tmpfile' })
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share QR code' })
      else await Share.share({ message: link })
    } catch { toast.error('Couldn’t make the QR image', 'Share the link instead, or download the poster on the web') }
  }

  return (
    <Sheet open={open} onClose={close} title={step === 'special' ? 'Special links' : step === 'qr' ? 'QR code' : step === 'newPin' ? 'Make a new PIN?' : 'Share this event'}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 14, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
        {step !== 'link' ? <View style={{ marginTop: -8 }}><LinkText label="Back to sharing" icon="chevron-left" small onPress={() => setStep('link')} /></View> : null}

        {step === 'link' ? (
          <>
            <View style={{ gap: 6 }}>
              <Txt v="label">Gallery link</Txt>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={[styles.linkBox, { borderColor: c.line2, backgroundColor: c.sunk }]}>
                  <Icon name="link" size={15} color={c.ink3} />
                  <Txt numberOfLines={1} selectable style={{ flex: 1 }}>{link.replace('https://', '')}</Txt>
                </View>
                <Button label="Copy link" icon="copy" variant="primary" onPress={() => copy(link, 'Link')} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: accessOpen }} accessibilityLabel="Who can open it. Change" onPress={() => setAccessOpen(!accessOpen)}
                style={[styles.box, { flex: 1, borderColor: c.line2 }]}>
                <Txt v="small">Who can open it</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Txt weight="bold" numberOfLines={1} style={{ flex: 1 }}>{event.settings.access === 'link-pin' ? 'Link and PIN' : event.settings.access === 'link' ? 'Anyone with the link' : 'People who sign up'}</Txt>
                  <Icon name={accessOpen ? 'chevron-up' : 'chevron-down'} size={15} color={c.ink3} />
                </View>
              </Pressable>
              {pinOn ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`PIN ${event.settings.pin}. Copy`} onPress={() => copy(event.settings.pin, 'PIN')} style={[styles.box, { width: 116, borderColor: c.line2 }]}>
                  <Txt v="small">PIN</Txt>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt weight="heavy" style={{ flex: 1, letterSpacing: 3, fontVariant: ['tabular-nums'] }}>{event.settings.pin}</Txt>
                    <Icon name="copy" size={14} color={c.ink3} />
                  </View>
                </Pressable>
              ) : null}
            </View>
            {accessOpen ? (
              <View style={{ gap: 8 }}>
                <RadioCards value={event.settings.access} onChange={(v) => access.mutate(v)} options={ACCESS} />
                {pinOn ? <Button label="Make a new PIN" icon="refresh-cw" size="sm" onPress={() => setStep('newPin')} /> : null}
              </View>
            ) : null}

            <View style={{ gap: 8 }}>
              <Button label="Send on WhatsApp" icon="message-circle" onPress={whatsapp} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="QR code" icon="grid" style={{ flex: 1 }} onPress={() => setStep('qr')} />
                <Button label="More ways" icon="share" style={{ flex: 1 }} onPress={() => Share.share({ message })} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <LinkText label="Copy message" icon="copy" small onPress={() => copy(message, 'Message')} />
                <LinkText label="Open as a guest" icon="eye" small onPress={() => { WebBrowser.openBrowserAsync(link).catch(() => toast.error('Couldn’t open the gallery', 'Check your connection')) }} />
              </View>
            </View>

            <Pressable accessibilityRole="button" accessibilityLabel="Special links" onPress={() => setStep('special')}
              style={({ pressed }) => [styles.specialRow, { borderTopColor: c.line, opacity: pressed ? 0.6 : 1 }]}>
              <View style={{ flex: 1 }}>
                <Txt weight="bold">Special links</Txt>
                <Txt v="small">For one person, one album, or family who should skip the PIN</Txt>
              </View>
              <Icon name="chevron-right" size={18} color={c.ink3} />
            </Pressable>
          </>
        ) : null}

        {step === 'qr' ? (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <View ref={qrRef} collapsable={false} style={{ padding: 16, backgroundColor: '#fff', borderRadius: radius.card, alignItems: 'center', gap: 8 }}>
              <QRCode value={link} size={220} rounded />
              <Txt style={{ color: '#1C1814', fontVariant: ['tabular-nums'] }} weight="bold">{link.replace('https://', '')}</Txt>
            </View>
            <Txt v="small" center>Print it on standees and table cards. Guests scan it with their camera or the Frameline app.</Txt>
            <Button label="Share QR image" icon="share" full onPress={shareQr} />
            <Txt v="small" center color={c.ink3}>QR styles, colours and the A4 poster are on the web.</Txt>
          </View>
        ) : null}

        {step === 'newPin' ? (
          <View style={{ gap: 12 }}>
            <Txt v="small">Guests who have the old PIN {event.settings.pin} won’t be able to open the gallery until you send them the new one.</Txt>
            <Button label="Make a new PIN" variant="primary" size="lg" loading={resetPin.isPending} onPress={() => resetPin.mutate(undefined)} />
            <Button label="Keep the PIN" variant="ghost" onPress={() => setStep('link')} />
          </View>
        ) : null}

        {step === 'special' ? <SpecialLinks event={event} studioName={studio?.name} /> : null}
      </ScrollView>
    </Sheet>
  )
}

type Kind = 'album' | 'person' | 'vip'

function SpecialLinks({ event, studioName }: { event: PhotoEvent; studioName?: string }) {
  const { c } = useTheme()
  const api = useApi()
  const { data: albums } = useAlbums(event.id)
  const [openKind, setOpenKind] = useState<Kind | null>(null)
  const [albumId, setAlbumId] = useState<string>()
  const [name, setName] = useState('')
  const [match, setMatch] = useState<{ personId: string | null; count: number; uri: string; noFace?: boolean } | null>(null)
  const [matching, setMatching] = useState(false)
  const [made, setMade] = useState<GuestLinkResult | null>(null)
  const [busy, setBusy] = useState(false)

  const choose = (k: Kind) => { setOpenKind(openKind === k ? null : k); setMade(null) }
  const pickFace = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, selectionLimit: 1 })
    const a = res.canceled ? undefined : res.assets[0]
    if (!a) return
    setMatching(true); setMade(null)
    try {
      const r = await api.matchFaceForLink(event.id, { key: `${event.id}:${a.fileName ?? a.uri}:${a.fileSize ?? a.width}`, image: { width: a.width, height: a.height } })
      setMatch({ personId: r.faceFound === false ? null : r.personId, count: r.photoIds.length, uri: a.uri, noFace: r.faceFound === false })
    } catch (e) { const f = friendlyError(e); toast.error(f.title, f.detail) } finally { setMatching(false) }
  }
  const make = async (k: Kind) => {
    setBusy(true)
    try {
      const n = name.trim() || undefined
      const r = await api.createGuestLink(event.id, k === 'album' ? { album: albumId, n } : k === 'person' ? { me: true, p: match?.personId ?? undefined, n } : { n, vip: { skipLogin: true, pin: true, all: true } })
      setMade(r)
    } catch (e) { const f = friendlyError(e); toast.error(f.title, f.detail) } finally { setBusy(false) }
  }

  const rows: { k: Kind; icon: IconName; title: string; body: string }[] = [
    { k: 'album', icon: 'folder', title: 'One album', body: 'Only one album, e.g. for the bride’s family' },
    { k: 'person', icon: 'smile', title: 'One person', body: 'Opens straight to one person’s photos' },
    { k: 'vip', icon: 'key', title: 'Family (VIP)', body: 'Skips the PIN and sign-up, sees every photo' },
  ]
  const albumChoices = (albums ?? []).filter((a) => a.kind === 'album')

  return (
    <View style={{ gap: 10 }}>
      {rows.map((r) => {
        const on = openKind === r.k
        return (
          <View key={r.k} style={[styles.specialCard, { borderColor: on ? c.accent : c.line }]}>
            <SettingRow first icon={r.icon} title={r.title} detail={r.body} onPress={() => choose(r.k)} right={<Icon name={on ? 'chevron-up' : 'chevron-down'} size={17} color={c.ink3} />} />
            {on ? (
              <View style={{ gap: 10, paddingBottom: 12 }}>
                {r.k === 'album' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {albumChoices.map((a) => <Chip key={a.id} label={a.name} count={a.photoCount} selected={albumId === a.id} onPress={() => { setAlbumId(a.id); setMade(null) }} />)}
                  </View>
                ) : null}
                {r.k === 'person' ? (
                  match ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {match.noFace ? <Txt v="small" color={c.warn}>We couldn’t see a face — try another photo</Txt> : match.personId ? <Chip label={`Found in ${fmt.count(match.count)} photos`} tone="ok" icon="check" /> : <Chip label="Matched nobody yet" tone="warn" />}
                      <LinkText label="Try another photo" small onPress={pickFace} />
                    </View>
                  ) : <Button label={matching ? 'Looking for them…' : 'Choose a photo of them'} icon="image" loading={matching} onPress={pickFace} />
                ) : null}
                <Input value={name} onChangeText={(t) => { setName(t); setMade(null) }} placeholder="Their name (optional), e.g. Dadi ji" maxLength={40} />
                {made ? (
                  <View style={{ gap: 8 }}>
                    <View style={[styles.linkBox, { borderColor: c.line2, backgroundColor: c.sunk }]}><Txt numberOfLines={1} selectable style={{ flex: 1 }}>{made.url.replace('https://', '')}</Txt></View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button label="Copy" icon="copy" style={{ flex: 1 }} onPress={async () => { await Clipboard.setStringAsync(made.url); toast.success('Link copied') }} />
                      <Button label="Send" icon="share" style={{ flex: 1 }} onPress={() => Share.share({ message: `${made.payload.n ? `${made.payload.n}, your` : 'Your'} photos from ${event.name} by ${studioName ?? 'us'}: ${made.url}` })} />
                    </View>
                  </View>
                ) : (
                  <Button label="Make link" loading={busy} disabled={(r.k === 'album' && !albumId) || (r.k === 'person' && !match?.personId)} onPress={() => make(r.k)} />
                )}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  linkBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.control + 2, paddingHorizontal: 12, minHeight: 46 },
  box: { borderWidth: 1, borderRadius: radius.control + 2, paddingHorizontal: 12, paddingVertical: 8, minHeight: 56, gap: 2 },
  specialRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 12, minHeight: 56 },
  specialCard: { borderWidth: 1, borderRadius: radius.card, paddingHorizontal: 12 },
})
