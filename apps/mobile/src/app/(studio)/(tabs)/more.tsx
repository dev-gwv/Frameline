import { useState } from 'react'
import { Linking, Pressable, Share, StyleSheet, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { DEMO_NOW, PLANS, fmt, type AssetKind, type Camera } from '@frameline/shared'
import { Button, Card, Chip, DarkCard, Field, Icon, Input, LogoMark, Meter, Screen, SectionHeader, SettingRow, Sheet, Txt, type ChipTone } from '@/components'
import { API_MODE, queryClient, useApi, useHttp } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { followLink } from '@/lib/links'
import { actions, useLocal } from '@/lib/local'
import { useAction, useCameras, useEvents, useStudio, useUsage } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { font, useTheme } from '@/theme'

const CAM: Record<Camera['status'], { label: string; tone: ChipTone }> = { receiving: { label: 'Receiving', tone: 'ok' }, idle: { label: 'Idle', tone: 'accent' }, offline: { label: 'Offline', tone: 'neutral' } }
const SUPPORT_PHONE = '+91 80 4718 2200'

export default function More() {
  const { c } = useTheme()
  const { data: studio } = useStudio()
  const { data: usage } = useUsage()
  const { data: cameras } = useCameras()
  const { data: events } = useEvents()
  const email = useLocal((s) => s.studioSession?.email)
  const plan = PLANS.find((p) => p.id === usage?.planId)
  const http = useHttp()
  const api = useApi()
  /** uploadAsset (studio-logo / studio-cover) → updateStudio with the returned URL. */
  const brand = useAction(async (kind: Extract<AssetKind, 'studio-logo' | 'studio-cover'>) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true, aspect: kind === 'studio-logo' ? [1, 1] : [16, 9] })
    const a = res.canceled ? undefined : res.assets[0]
    if (!a) return null
    const asset = await api.uploadAsset(kind, { filename: a.fileName ?? `${kind}.jpg`, uri: a.uri, contentType: a.mimeType ?? 'image/jpeg', size: a.fileSize })
    await api.updateStudio(kind === 'studio-logo' ? { logoUrl: asset.url } : { coverUrl: asset.url })
    return kind
  }, { success: (k) => (k === 'studio-logo' ? 'Logo updated' : k === 'studio-cover' ? 'Cover updated' : 'No change') })
  const [signingOut, setSigningOut] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)

  const signOut = async () => {
    setSigningOut(true)
    try { await http?.auth.logout() } finally {
      actions.signOut()
      queryClient.clear()
      setSigningOut(false)
      router.replace('/sign-in')
    }
  }

  return (
    <Screen>
      {studio ? (
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Change logo" onPress={() => brand.mutate('studio-logo')}
              style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: studio.brandColor, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {studio.logoUrl ? <Image source={{ uri: studio.logoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Txt style={{ fontFamily: font.display, fontSize: 22, color: '#fff' }}>{studio.name[0]}</Txt>}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Txt v="h3">{studio.name}</Txt>
              <Txt v="small">{studio.handle}.frameline.in · {email}</Txt>
            </View>
          </View>
          <SettingRow first icon="phone" title={studio.phone} detail={studio.email} />
          <SettingRow icon="image" title={brand.isPending ? 'Uploading…' : 'Logo'} detail={studio.logoUrl ? 'Tap to change' : 'Add your logo for galleries and your profile'} onPress={brand.isPending ? undefined : () => brand.mutate('studio-logo')} />
          <SettingRow icon="maximize" title="Cover photo" detail={studio.coverUrl ? 'Shown on your studio profile · tap to change' : 'Add a cover for your studio profile'} onPress={brand.isPending ? undefined : () => brand.mutate('studio-cover')} />
        </Card>
      ) : null}

      {studio ? (
        <DarkCard style={{ gap: 8 }}>
          <Txt v="eyebrow" color={c.sideInk2}>Follow code</Txt>
          <Txt style={{ fontFamily: font.monoBold, fontSize: 24, letterSpacing: 3, color: '#F2D38A' }} selectable>{studio.followCode}</Txt>
          <Txt v="small" color={c.sideInk2}>Anyone with this code follows all your events in the app.</Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Copy" icon="copy" variant="dark" size="sm" style={{ flex: 1 }} onPress={async () => { await Clipboard.setStringAsync(studio.followCode); toast.success('Follow code copied') }} />
            <Button label="Share link" icon="link" variant="dark" size="sm" style={{ flex: 1 }} onPress={() => Share.share({ message: `Follow ${studio.name} on Frameline: ${followLink(studio)}` })} />
          </View>
        </DarkCard>
      ) : null}

      {usage ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Txt v="h3" style={{ flex: 1 }}>Plan & usage</Txt>
            <Chip label={`${plan?.name ?? usage.planId} · ${usage.period}`} tone="accent" />
          </View>
          <Meter value={usage.photosUsed} max={usage.photosLimit} />
          <Txt v="small"><Txt v="mono" style={{ fontSize: 12.5 }}>{fmt.count(usage.photosUsed)}</Txt> of <Txt v="mono" style={{ fontSize: 12.5 }}>{fmt.count(usage.photosLimit)}</Txt> photos · {fmt.pct(usage.photosUsed, usage.photosLimit)}% used</Txt>
          <Txt v="small">Valid till {fmt.date(usage.validTill)} ({fmt.daysUntil(usage.validTill, DEMO_NOW)} days) · Wallet {fmt.rupees(usage.walletCredits)}</Txt>
          <Button label="Change plan on the web" variant="ghost" size="sm" iconRight="external-link" onPress={() => Linking.openURL('https://app.frameline.in/plan')} />
        </Card>
      ) : null}

      <SectionHeader title="Camera sync" />
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        {(cameras ?? []).map((cam, i) => (
          <SettingRow key={cam.id} first={i === 0} icon="camera" title={cam.label}
            detail={`${events?.find((e) => e.id === cam.eventId)?.name ?? 'Event'} · ${cam.today} today${cam.lastFile ? ` · ${cam.lastFile}` : ''}`}
            right={<Chip label={CAM[cam.status].label} tone={CAM[cam.status].tone} dot />} />
        ))}
        {!cameras?.length ? <Txt v="small" style={{ paddingVertical: 14 }}>No cameras yet. Add one from Camera sync on the web.</Txt> : null}
      </Card>

      <SectionHeader title="Help" />
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        <SettingRow first icon="message-circle" title="WhatsApp support" detail="Replies in about 10 minutes, 9am–9pm" onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_PHONE.replace(/\D/g, '')}`)} />
        <SettingRow icon="phone" title="Call support" detail={SUPPORT_PHONE} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`)} />
        <SettingRow icon="mail" title="Email" detail="help@frameline.in" onPress={() => Linking.openURL('mailto:help@frameline.in')} />
      </Card>

      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        <SettingRow first icon="smile" title="Switch to guest mode" detail="See galleries the way your guests do" onPress={() => { actions.setMode('guest'); router.replace('/events') }} />
        {http ? <SettingRow icon="lock" title="Set password" detail="Sign in without an email code next time" onPress={() => setPwOpen(true)} /> : null}
        <SettingRow icon="log-out" title={signingOut ? 'Signing out…' : 'Sign out'} detail={API_MODE === 'http' ? 'Ends this phone’s session' : undefined} onPress={signingOut ? undefined : signOut} right={<Icon name="chevron-right" size={18} color={c.ink3} />} />
      </Card>
      {http ? <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} setPassword={(n, cur) => http.auth.setPassword(n, cur)} /> : null}
      <View style={{ alignItems: 'center', gap: 6, marginTop: 8 }}>
        <LogoMark size={26} />
        <Txt v="small" color={c.ink3}>Frameline for studios</Txt>
      </View>
    </Screen>
  )
}

/** auth.setPassword: the current password is needed only when one is already set. */
function PasswordSheet({ open, onClose, setPassword }: { open: boolean; onClose: () => void; setPassword: (next: string, current?: string) => Promise<void> }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const close = () => { setCurrent(''); setNext(''); setError(undefined); onClose() }
  const save = async () => {
    if (next.length < 8) { setError('Use at least 8 characters'); return }
    setBusy(true)
    try { await setPassword(next, current || undefined); toast.success('Password saved'); close() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={close} title="Set password">
      <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8 }}>
        <Field label="Current password (if you have one)"><Input value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" placeholder="Leave empty if you never set one" /></Field>
        <Field label="New password" error={error}><Input value={next} onChangeText={(t) => { setNext(t); setError(undefined) }} secureTextEntry autoComplete="new-password" placeholder="At least 8 characters" invalid={!!error} /></Field>
        <Button label="Save password" variant="primary" size="lg" loading={busy} onPress={save} />
      </View>
    </Sheet>
  )
}
