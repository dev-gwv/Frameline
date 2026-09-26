import { useState } from 'react'
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { fmt } from '@frameline/shared'
import { Button, Card, Chip, EmptyState, Icon, IconButton, LoadingList, Screen, SectionHeader, SettingRow, ToneView, Txt } from '@/components'
import { EnquiryPrompt } from '@/components/guest'
import { followLink } from '@/lib/links'
import { actions, useLocal } from '@/lib/local'
import { useEvents, useStudio } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { font, radius, useTheme } from '@/theme'

/*
 * Studio profile as guests see it after following (mirrors the 'studioapp' phone preview).
 * Services and Q&A aren't in the API yet — they're sample content until the website builder content model lands.
 */
const SERVICES = [
  { name: 'Wedding coverage', price: 'From ₹1,50,000', detail: '2 photographers · 3 days · films' },
  { name: 'Pre-wedding shoot', price: 'From ₹35,000', detail: 'Half day · 2 locations' },
  { name: 'Events & corporate', price: 'From ₹25,000', detail: 'Per day · same-day gallery' },
]
const FAQ = [
  { q: 'How long until we get photos?', a: 'Previews go live the same night. Edited photos arrive within 3 weeks, films within 6.' },
  { q: 'Do you travel for weddings?', a: 'Yes, anywhere in India and abroad. Travel and stay are billed at cost.' },
  { q: 'Can guests find their own photos?', a: 'Yes. Every gallery has selfie search, so each guest sees the photos they’re in.' },
]
const FEATURED = ['ev_riya', 'ev_kapoor', 'ev_marathon', 'ev_portfolio']

export default function StudioProfile() {
  const { c } = useTheme()
  const { code } = useLocalSearchParams<{ code: string }>()
  const { data: studio, isLoading } = useStudio()
  const { data: events } = useEvents()
  const following = useLocal((s) => (studio ? s.following.includes(studio.followCode) : false))
  const [open, setOpen] = useState<number | null>(0)

  if (isLoading) return <LoadingList />
  if (!studio || studio.followCode.toUpperCase() !== String(code).toUpperCase()) {
    return <Screen><EmptyState icon="search" title="No studio with this code" body={`We couldn’t find a studio using ${String(code).toUpperCase()}. Check the code and try again.`} action="Go back" onAction={() => router.back()} /></Screen>
  }
  const featured = FEATURED.map((id) => events?.find((e) => e.id === id)).filter((e) => !!e)

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <Stack.Screen options={{ title: studio.name, headerRight: () => <IconButton icon="share" label="Share studio" onPress={() => Share.share({ message: `Follow ${studio.name} on Frameline: ${followLink(studio)} (code ${studio.followCode})` })} /> }} />
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: studio.brandColor, alignItems: 'center', justifyContent: 'center' }}>
            <Txt style={{ fontFamily: font.display, fontSize: 26, color: '#fff' }}>{studio.name[0]}</Txt>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="h2">{studio.name}</Txt>
            <Txt v="small">{studio.city} · {studio.instagram}</Txt>
          </View>
        </View>
        {studio.about ? <Txt v="small">{studio.about}</Txt> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label={following ? 'Following' : 'Follow'} icon={following ? 'check' : 'plus'} variant={following ? 'secondary' : 'primary'} style={{ flex: 1 }}
            onPress={() => { if (following) { actions.unfollow(studio.followCode); toast.info(`Unfollowed ${studio.name}`) } else { actions.follow(studio.followCode); toast.success(`Following ${studio.name}`) } }} />
          <Button label="Enquire" icon="message-circle" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/enquiry', params: { source: 'Studio app' } })} />
        </View>

        <Txt v="eyebrow">Featured</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
          {featured.map((e) => (
            <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={e.name} onPress={() => { actions.join(e); router.push({ pathname: '/event/[id]', params: { id: e.id } }) }}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
              <ToneView tone={e.coverTones[0]} style={styles.featured}>
                <LinearGradient colors={['transparent', 'rgba(12,10,8,0.65)']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0.4 }} end={{ x: 0.5, y: 1 }} />
                {e.settings.access !== 'link' ? <View style={styles.lock}><Icon name="lock" size={11} color="#F2D38A" /></View> : null}
                <Txt style={{ fontFamily: font.bodyBold, fontSize: 13, color: '#fff' }} numberOfLines={2}>{e.name}</Txt>
                <Txt style={{ fontFamily: font.mono, fontSize: 10.5, color: 'rgba(255,255,255,0.85)' }}>{fmt.dayMonth(e.date)} · {fmt.count(e.photoCount)}</Txt>
              </ToneView>
            </Pressable>
          ))}
        </ScrollView>

        <SectionHeader title="Services" />
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {SERVICES.map((s, i) => (
            <View key={s.name} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
              <View style={{ flex: 1 }}><Txt weight="bold">{s.name}</Txt><Txt v="small">{s.detail}</Txt></View>
              <Txt v="mono" style={{ fontSize: 12.5 }}>{s.price}</Txt>
            </View>
          ))}
        </Card>

        <SectionHeader title="Questions" />
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {FAQ.map((f, i) => (
            <Pressable key={f.q} accessibilityRole="button" accessibilityState={{ expanded: open === i }} onPress={() => setOpen(open === i ? null : i)}
              style={[styles.row, { flexDirection: 'column', alignItems: 'stretch' }, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt weight="bold" style={{ flex: 1 }}>{f.q}</Txt>
                <Icon name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={c.ink3} />
              </View>
              {open === i ? <Txt v="small" style={{ marginTop: 6 }}>{f.a}</Txt> : null}
            </Pressable>
          ))}
        </Card>

        <SectionHeader title="Contact" />
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          <SettingRow first icon="phone" title="Call" detail={studio.phone} onPress={() => Linking.openURL(`tel:${studio.phone.replace(/\s/g, '')}`)} />
          <SettingRow icon="message-circle" title="WhatsApp" detail="Usually replies within an hour" onPress={() => Linking.openURL(`https://wa.me/${studio.phone.replace(/\D/g, '')}`)} />
          <SettingRow icon="mail" title="Email" detail={studio.email} onPress={() => Linking.openURL(`mailto:${studio.email}`)} />
          {studio.website ? <SettingRow icon="globe" title="Website" detail={studio.website.replace(/^https?:\/\//, '')} onPress={() => Linking.openURL(studio.website!)} /> : null}
        </Card>
        <EnquiryPrompt source="Studio app" />
        <View style={{ alignItems: 'center' }}><Chip label={`Follow code ${studio.followCode}`} tone="accent" /></View>
      </Screen>
    </View>
  )
}

const styles = StyleSheet.create({
  featured: { width: 132, height: 170, borderRadius: radius.card, padding: 10, justifyContent: 'flex-end', overflow: 'hidden', gap: 2 },
  lock: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(12,10,8,0.5)', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, minHeight: 56 },
})
