import { useState } from 'react'
import { Pressable, Share, StyleSheet, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { router, type Href } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { PLANS, fmt, type AssetKind } from '@frameline/shared'
import { Button, Card, Field, Input, Screen, SectionHeader, SettingRow, Sheet, Txt } from '@/components'
import { StudioTopBar } from '@/components/studio'
import { API_MODE, queryClient, useApi, useHttp } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { followLink } from '@/lib/links'
import { actions, useLocal } from '@/lib/local'
import { useAction, useStudio, useUsage, useWallet } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { font, useTheme } from '@/theme'
import type { IconName } from '@/components'

/** More: tools (Sell lives here on phones), account and help, then guest mode and sign out. */
export default function More() {
  const { c } = useTheme()
  const { data: studio } = useStudio()
  const { data: usage } = useUsage()
  const { data: wallet } = useWallet()
  const email = useLocal((s) => s.studioSession?.email)
  const plan = PLANS.find((p) => p.id === usage?.planId)
  const http = useHttp()
  const api = useApi()
  /** uploadAsset (studio-logo) → updateStudio with the returned URL. */
  const logo = useAction(async (kind: Extract<AssetKind, 'studio-logo'>) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true, aspect: [1, 1] })
    const a = res.canceled ? undefined : res.assets[0]
    if (!a) return null
    const asset = await api.uploadAsset(kind, { filename: a.fileName ?? `${kind}.jpg`, uri: a.uri, contentType: a.mimeType ?? 'image/jpeg', size: a.fileSize })
    await api.updateStudio({ logoUrl: asset.url })
    return kind
  }, { success: (k) => (k ? 'Logo updated' : 'No change') })
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

  const tools: { icon: IconName; title: string; detail: string; to: Href }[] = [
    { icon: 'shopping-bag', title: 'Sell photos', detail: wallet ? `${fmt.rupees(wallet.balance)} in your wallet · orders` : 'Orders and your wallet', to: '/sell' },
    { icon: 'droplet', title: 'Watermark', detail: 'Your name on guest previews', to: '/tools/watermark' },
    { icon: 'camera', title: 'Camera sync', detail: 'Photos go straight from your camera to the event', to: '/tools/camera-sync' },
    { icon: 'grid', title: 'Smart QR', detail: 'One printed QR that you point at any event', to: '/tools/qr' },
    { icon: 'send', title: 'Messages to guests', detail: 'Tell your followers about new galleries', to: '/tools/messages' },
  ]
  const account: { icon: IconName; title: string; detail: string; to: Href }[] = [
    { icon: 'credit-card', title: 'Plan and billing', detail: usage ? `${plan?.name ?? usage.planId} · ${fmt.count(usage.photosUsed)} of ${fmt.count(usage.photosLimit)} photos used` : 'Your plan, photos and wallet', to: '/tools/plan' },
    { icon: 'users', title: 'Team', detail: 'People who upload and manage events with you', to: '/tools/team' },
    { icon: 'help-circle', title: 'Help', detail: 'WhatsApp, call or email a real person', to: '/tools/help' },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <StudioTopBar />
      <Screen>
        <Txt v="h1">More</Txt>
        {studio ? (
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Change logo" onPress={() => logo.mutate('studio-logo')}
                style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: studio.brandColor, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {studio.logoUrl ? <Image source={{ uri: studio.logoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Txt style={{ fontFamily: font.bodyHeavy, fontSize: 20, color: '#fff' }}>{studio.name[0]}</Txt>}
              </Pressable>
              <View style={{ flex: 1 }}>
                <Txt v="h3">{studio.name}</Txt>
                <Txt v="small" numberOfLines={1}>{email ?? studio.email}</Txt>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Txt v="small">Guests follow you with</Txt>
                <Txt weight="heavy" style={{ letterSpacing: 1, fontVariant: ['tabular-nums'] }} selectable>{studio.followCode}</Txt>
              </View>
              <Button label="Copy" icon="copy" size="sm" onPress={async () => { await Clipboard.setStringAsync(studio.followCode); toast.success('Follow code copied') }} />
              <Button label="Share" icon="share" size="sm" onPress={() => Share.share({ message: `Follow ${studio.name} on Frameline: ${followLink(studio)}` })} />
            </View>
          </Card>
        ) : null}

        <SectionHeader title="Tools" />
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {tools.map((t, i) => <SettingRow key={t.title} first={i === 0} icon={t.icon} title={t.title} detail={t.detail} onPress={() => router.push(t.to)} />)}
        </Card>

        <SectionHeader title="Account" />
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {account.map((t, i) => <SettingRow key={t.title} first={i === 0} icon={t.icon} title={t.title} detail={t.detail} onPress={() => router.push(t.to)} />)}
        </Card>

        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          <SettingRow first icon="smile" title="Switch to guest mode" detail="See galleries the way your guests do" onPress={() => { actions.setMode('guest'); router.replace('/events') }} />
          {http ? <SettingRow icon="lock" title="Set password" detail="Sign in without an email code next time" onPress={() => setPwOpen(true)} /> : null}
          <SettingRow icon="log-out" title={signingOut ? 'Signing out…' : 'Sign out'} detail={API_MODE === 'http' ? 'Ends this phone’s session' : undefined} onPress={signingOut ? undefined : signOut} />
        </Card>
        {http ? <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} setPassword={(n, cur) => http.auth.setPassword(n, cur)} /> : null}
        <Txt v="small" center color={c.ink3}>Frameline for studios</Txt>
      </Screen>
    </View>
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
