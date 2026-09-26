import { useMemo, useState } from 'react'
import { Alert, RefreshControl, Share, View } from 'react-native'
import { router } from 'expo-router'
import { BASE_RENEWAL, DEMO_NOW, RENEWAL_CREDIT_DISCOUNT, fmt, type PhotoEvent } from '@frameline/shared'
import { Button, Card, Chip, Icon, LoadingList, Screen, SectionHeader, Txt } from '@/components'
import { EventRow, StatCard } from '@/components/studio'
import { useApi } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { useAction, useActivity, useEvents, useOrders, useStudio, useUsage } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { useUploads } from '@/lib/uploads'
import { useTheme } from '@/theme'

const greeting = (h: number) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
const dayLine = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })

export default function Home() {
  const { c } = useTheme()
  const api = useApi()
  const { data: studio } = useStudio()
  const { data: events, isLoading, refetch, isRefetching } = useEvents()
  const { data: orders } = useOrders()
  const { data: activity } = useActivity()
  const { items } = useUploads()
  const running = items.filter((i) => i.status === 'uploading' || i.status === 'queued').length

  const { data: usage } = useUsage()
  const renew = useAction((v: { id: string; payWith: 'credits' | 'card' }) => api.renewEvent(v.id, { payWith: v.payWith }), {
    success: (r) => `Renewed till ${fmt.date(r.event.expiresAt)} · ${fmt.rupees(r.charged)}${r.payWith === 'credits' ? ' in credits' : ''}`,
  })
  const [linking, setLinking] = useState<string | null>(null)

  const askRenew = (e: PhotoEvent) => {
    const credits = BASE_RENEWAL * (1 - RENEWAL_CREDIT_DISCOUNT)
    const enough = (usage?.walletCredits ?? 0) >= credits
    Alert.alert(`Renew ${e.name}?`, `Adds a year to the gallery. ${fmt.rupees(credits)} in credits (you have ${fmt.rupees(usage?.walletCredits ?? 0)}) or ${fmt.rupees(BASE_RENEWAL)} by card.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Pay by card', onPress: () => renew.mutate({ id: e.id, payWith: 'card' }) },
      ...(enough ? [{ text: 'Use credits', onPress: () => renew.mutate({ id: e.id, payWith: 'credits' as const }) }] : []),
    ])
  }

  /** createRenewalLink → share sheet, so the client can pay for the renewal. */
  const sendRenewalLink = async (e: PhotoEvent, days: number) => {
    setLinking(e.id)
    try {
      const link = await api.createRenewalLink(e.id)
      await Share.share({ message: `Your gallery "${e.name}" expires in ${days} days. Keep it online for another year (${fmt.rupees(link.price)}): ${link.url}` })
    } catch (err) {
      const f = friendlyError(err)
      toast.error(f.title, f.detail)
    } finally { setLinking(null) }
  }

  const stats = useMemo(() => {
    const ev = events ?? []
    return {
      live: ev.filter((e) => e.status === 'live').length,
      uploading: ev.filter((e) => e.status === 'uploading').length,
      photos: ev.filter((e) => e.status !== 'draft').reduce((s, e) => s + e.photoCount, 0),
      visits: ev.reduce((s, e) => s + e.visits.web + e.visits.android + e.visits.ios, 0),
      faces: ev.reduce((s, e) => s + e.faceMatches, 0),
      revenue: (orders ?? []).filter((o) => o.currency === 'INR' && o.status !== 'refunded').reduce((s, o) => s + o.paid, 0),
    }
  }, [events, orders])

  if (isLoading || !events) return <Screen top><LoadingList rows={5} /></Screen>
  const expiring = events.filter((e) => e.status === 'expiring')
  const recent = [...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
  const hour = new Date(DEMO_NOW).getHours()

  return (
    <Screen top refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.accent} />}>
      <View style={{ gap: 4 }}>
        <Txt v="h1">{greeting(hour)}, {studio?.name.split(' ')[0] ?? ''}</Txt>
        <Txt v="small">{dayLine.format(new Date(DEMO_NOW))} · {stats.live} events live{stats.uploading + (running ? 1 : 0) ? ` · ${stats.uploading + (running ? 1 : 0)} upload running` : ''}</Txt>
      </View>

      {expiring.map((e) => {
        const days = fmt.daysUntil(e.expiresAt, DEMO_NOW)
        return (
          <Card key={e.id} style={{ backgroundColor: c.warnSoft, borderColor: 'transparent', gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Icon name="bell" size={18} color={c.warn} />
              <View style={{ flex: 1 }}>
                <Txt weight="bold">{e.name} expires in {days} days.</Txt>
                <Txt v="small">Renew it yourself or send the client a renewal link.</Txt>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Send renewal link" size="sm" style={{ flex: 1 }} loading={linking === e.id} onPress={() => sendRenewalLink(e, days)} />
              <Button label="Renew" size="sm" variant="primary" style={{ flex: 1 }} loading={renew.isPending && renew.variables?.id === e.id} onPress={() => askRenew(e)} />
            </View>
          </Card>
        )
      })}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <StatCard icon="image" label="Photos delivered" value={fmt.count(stats.photos)} />
        <StatCard icon="eye" label="Gallery visits" value={fmt.count(stats.visits)} />
        <StatCard icon="smile" label="Face searches" value={fmt.count(stats.faces)} />
        <StatCard icon="shopping-bag" label="Store revenue" value={fmt.rupees(stats.revenue)} />
      </View>

      <Button label="Upload photos" icon="upload-cloud" variant="primary" size="lg" onPress={() => router.navigate('/upload')} />

      <Card padded={false} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <SectionHeader title="Recent events" action="All events" onAction={() => router.navigate('/studio-events')} />
        {recent.map((e, i) => <EventRow key={e.id} event={e} first={i === 0} onPress={() => router.push({ pathname: '/manage/[id]', params: { id: e.id } })} />)}
      </Card>

      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Txt v="h3" style={{ flex: 1 }}>Activity</Txt>
          <Chip label="Live" tone="accent" dot />
        </View>
        {(activity ?? []).slice(0, 3).map((a) => (
          <View key={a.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.line }}>
            <Txt weight="bold">{a.title}</Txt>
            <Txt v="small" color={c.ink3}>{a.detail} · {fmt.ago(a.at, DEMO_NOW)}</Txt>
          </View>
        ))}
        <Button label="See all activity" variant="ghost" size="sm" onPress={() => router.navigate('/activity')} />
      </Card>
    </Screen>
  )
}
