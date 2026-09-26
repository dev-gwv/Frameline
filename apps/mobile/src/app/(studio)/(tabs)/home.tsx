import { useMemo } from 'react'
import { RefreshControl, Share, View } from 'react-native'
import { router } from 'expo-router'
import { DEMO_NOW, fmt } from '@frameline/shared'
import { Button, Card, Chip, Icon, LoadingList, Screen, SectionHeader, Txt } from '@/components'
import { EventRow, StatCard } from '@/components/studio'
import { useApi } from '@/lib/api'
import { eventLink } from '@/lib/links'
import { useAction, useActivity, useEvents, useOrders, useStudio } from '@/lib/queries'
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

  const renew = useAction((id: string) => api.updateEvent(id, { status: 'live', expiresAt: new Date(DEMO_NOW + 365 * 86_400_000).toISOString() }), { success: 'Renewed for another year' })

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
              <Button label="Send renewal link" size="sm" style={{ flex: 1 }} onPress={() => Share.share({ message: `Your gallery "${e.name}" expires in ${days} days. Renew it here: ${eventLink(e)}/renew` })} />
              <Button label="Renew" size="sm" variant="primary" style={{ flex: 1 }} loading={renew.isPending} onPress={() => renew.mutate(e.id)} />
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
