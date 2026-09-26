import { Linking, Share, View } from 'react-native'
import { router } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { DEMO_NOW, PLANS, fmt, type Camera } from '@frameline/shared'
import { Button, Card, Chip, DarkCard, Icon, LogoMark, Meter, Screen, SectionHeader, SettingRow, Txt, type ChipTone } from '@/components'
import { followLink } from '@/lib/links'
import { actions, useLocal } from '@/lib/local'
import { useCameras, useEvents, useStudio, useUsage } from '@/lib/queries'
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

  return (
    <Screen>
      {studio ? (
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: studio.brandColor, alignItems: 'center', justifyContent: 'center' }}>
              <Txt style={{ fontFamily: font.display, fontSize: 22, color: '#fff' }}>{studio.name[0]}</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="h3">{studio.name}</Txt>
              <Txt v="small">{studio.handle}.frameline.in · {email}</Txt>
            </View>
          </View>
          <SettingRow first icon="phone" title={studio.phone} detail={studio.email} />
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
        <SettingRow icon="log-out" title="Sign out" onPress={() => { actions.signOut(); router.replace('/sign-in') }} right={<Icon name="chevron-right" size={18} color={c.ink3} />} />
      </Card>
      <View style={{ alignItems: 'center', gap: 6, marginTop: 8 }}>
        <LogoMark size={26} />
        <Txt v="small" color={c.ink3}>Frameline for studios</Txt>
      </View>
    </Screen>
  )
}
