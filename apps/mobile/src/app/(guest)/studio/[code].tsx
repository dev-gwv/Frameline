import { useState } from 'react'
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { EVENT_TYPE_LABELS, fmt } from '@frameline/shared'
import { Button, Card, Chip, EmptyState, ErrorState, Icon, IconButton, LoadingList, Screen, SectionHeader, SettingRow, ToneView, Txt } from '@/components'
import { EnquiryPrompt } from '@/components/guest'
import { useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/lib/api'
import { errorCode, friendlyError } from '@/lib/errors'
import { followLink } from '@/lib/links'
import { actions, useLocal } from '@/lib/local'
import { useStudioProfile } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { font, radius, useTheme } from '@/theme'

/** Studio profile as guests see it (getStudioProfile: about, featured galleries, services, testimonials, Q&A, contact). */
export default function StudioProfileScreen() {
  const { c } = useTheme()
  const api = useApi()
  const qc = useQueryClient()
  const { code } = useLocalSearchParams<{ code: string }>()
  const followCode = String(code ?? '').toUpperCase()
  const { data, isLoading, error, refetch } = useStudioProfile(followCode)
  const following = useLocal((s) => s.following.includes(data?.studio.followCode ?? followCode))
  const [open, setOpen] = useState<number | null>(0)
  const [busy, setBusy] = useState(false)

  if (isLoading) return <LoadingList />
  if (!data) {
    if (errorCode(error) === 'not_found' || !error) {
      return <Screen><EmptyState icon="search" title="No studio with this code" body={`We couldn’t find a studio using ${followCode}. Check the code and try again.`} action="Go back" onAction={() => router.back()} /></Screen>
    }
    return <ErrorState error={error} onRetry={refetch} />
  }
  const { studio, featured } = data

  const toggleFollow = async () => {
    if (following) {
      actions.unfollow(studio.followCode)
      api.unfollowStudio(studio.followCode).then(() => qc.invalidateQueries({ queryKey: ['studio-profile'] }), () => {})
      toast.info(`Unfollowed ${studio.name}`)
      return
    }
    setBusy(true)
    try {
      await api.followStudio(studio.followCode)
      actions.follow(studio.followCode)
      qc.invalidateQueries({ queryKey: ['studio-profile'] })
      refetch()
      toast.success(`Following ${studio.name}`)
    } catch (e) {
      const f = friendlyError(e)
      toast.error(f.title, f.detail)
    } finally { setBusy(false) }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <Stack.Screen options={{ title: studio.name, headerRight: () => <IconButton icon="share" label="Share studio" onPress={() => Share.share({ message: `Follow ${studio.name} on Frameline: ${followLink(studio)} (code ${studio.followCode})` })} /> }} />
      <Screen>
        {studio.coverUrl ? <Image source={{ uri: studio.coverUrl }} style={{ height: 150, borderRadius: radius.card }} contentFit="cover" /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: studio.brandColor, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {studio.logoUrl ? <Image source={{ uri: studio.logoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Txt style={{ fontFamily: font.display, fontSize: 26, color: '#fff' }}>{studio.name[0]}</Txt>}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="h2">{studio.name}</Txt>
            <Txt v="small">{[studio.city, studio.instagram, `${fmt.count(studio.followers)} followers`].filter(Boolean).join(' · ')}</Txt>
          </View>
        </View>
        {studio.about ? <Txt v="small">{studio.about}</Txt> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label={following ? 'Following' : 'Follow'} icon={following ? 'check' : 'plus'} variant={following ? 'secondary' : 'primary'} style={{ flex: 1 }} loading={busy} onPress={toggleFollow} />
          <Button label="Enquire" icon="message-circle" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/enquiry', params: { studio: studio.followCode, studioName: studio.name, source: 'Studio app' } })} />
        </View>

        {featured.length ? (
          <>
            <Txt v="eyebrow">Featured</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {featured.map((e) => (
                <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={e.name} onPress={() => { actions.join(e); router.push({ pathname: '/event/[id]', params: { id: e.shortId } }) }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
                  <ToneView tone={e.coverTones[0]} style={styles.featured}>
                    <LinearGradient colors={['transparent', 'rgba(12,10,8,0.65)']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0.4 }} end={{ x: 0.5, y: 1 }} />
                    <Txt style={{ fontFamily: font.mono, fontSize: 10, color: 'rgba(255,255,255,0.85)' }}>{EVENT_TYPE_LABELS[e.type]}</Txt>
                    <Txt style={{ fontFamily: font.bodyBold, fontSize: 13, color: '#fff' }} numberOfLines={2}>{e.name}</Txt>
                    <Txt style={{ fontFamily: font.mono, fontSize: 10.5, color: 'rgba(255,255,255,0.85)' }}>{fmt.dayMonth(e.date)} · {fmt.count(e.photoCount)}</Txt>
                  </ToneView>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {studio.services.length ? (
          <>
            <SectionHeader title="Services" />
            <Card padded={false} style={{ paddingHorizontal: 16 }}>
              {studio.services.map((s, i) => (
                <View key={s.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
                  <View style={{ flex: 1 }}><Txt weight="bold">{s.name}</Txt>{s.description ? <Txt v="small">{s.description}</Txt> : null}</View>
                  <Txt v="mono" style={{ fontSize: 12.5 }}>{s.price}</Txt>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {studio.testimonials.length ? (
          <>
            <SectionHeader title="Kind words" />
            {studio.testimonials.slice(0, 3).map((t) => (
              <Card key={t.id} style={{ gap: 6 }}>
                <Txt style={{ fontFamily: font.display, fontSize: 16, lineHeight: 22 }}>“{t.quote}”</Txt>
                <Txt v="small">{t.name}{t.detail ? ` · ${t.detail}` : ''}</Txt>
              </Card>
            ))}
          </>
        ) : null}

        {studio.faq.length ? (
          <>
            <SectionHeader title="Questions" />
            <Card padded={false} style={{ paddingHorizontal: 16 }}>
              {studio.faq.map((f, i) => (
                <Pressable key={f.id} accessibilityRole="button" accessibilityState={{ expanded: open === i }} onPress={() => setOpen(open === i ? null : i)}
                  style={[styles.row, { flexDirection: 'column', alignItems: 'stretch' }, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Txt weight="bold" style={{ flex: 1 }}>{f.q}</Txt>
                    <Icon name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={c.ink3} />
                  </View>
                  {open === i ? <Txt v="small" style={{ marginTop: 6 }}>{f.a}</Txt> : null}
                </Pressable>
              ))}
            </Card>
          </>
        ) : null}

        <SectionHeader title="Contact" />
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          <SettingRow first icon="phone" title="Call" detail={studio.phone} onPress={() => Linking.openURL(`tel:${studio.phone.replace(/\s/g, '')}`)} />
          <SettingRow icon="message-circle" title="WhatsApp" detail="Usually replies within an hour" onPress={() => Linking.openURL(`https://wa.me/${studio.phone.replace(/\D/g, '')}`)} />
          <SettingRow icon="mail" title="Email" detail={studio.email} onPress={() => Linking.openURL(`mailto:${studio.email}`)} />
          {studio.website ? <SettingRow icon="globe" title="Website" detail={studio.website.replace(/^https?:\/\//, '')} onPress={() => Linking.openURL(studio.website!)} /> : null}
        </Card>
        <EnquiryPrompt studioCode={studio.followCode} studioName={studio.name} source="Studio app" />
        <View style={{ alignItems: 'center' }}><Chip label={`Follow code ${studio.followCode}`} tone="accent" /></View>
      </Screen>
    </View>
  )
}

const styles = StyleSheet.create({
  featured: { width: 132, height: 170, borderRadius: radius.card, padding: 10, justifyContent: 'flex-end', overflow: 'hidden', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, minHeight: 56 },
})
