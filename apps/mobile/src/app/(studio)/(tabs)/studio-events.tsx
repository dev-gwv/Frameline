import { useMemo, useState } from 'react'
import { FlatList, RefreshControl, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import type { EventStatus } from '@frameline/shared'
import { Button, Chip, EmptyState, ErrorState, Input, LoadingList, Txt } from '@/components'
import { StudioEventCard, StudioTopBar } from '@/components/studio'
import { useEvents } from '@/lib/queries'
import { useTheme } from '@/theme'

type Filter = EventStatus | 'all'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'live', label: 'Live' }, { value: 'uploading', label: 'Uploading' },
  { value: 'draft', label: 'Drafts' }, { value: 'expiring', label: 'Expiring' }, { value: 'archived', label: 'Archived' },
]

/** Events: search, status filter chips, event cards and one gold New event. */
export default function StudioEvents() {
  const { c } = useTheme()
  const { data: events, isLoading, error, refetch, isRefetching } = useEvents()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Filter>('all')

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (events ?? [])
      .filter((e) => (status === 'all' ? e.status !== 'archived' : e.status === status))
      .filter((e) => !term || e.name.toLowerCase().includes(term) || e.city.toLowerCase().includes(term) || e.shortId.toLowerCase().includes(term))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [events, q, status])
  const count = (f: Filter) => (events ?? []).filter((e) => (f === 'all' ? e.status !== 'archived' : e.status === f)).length

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <StudioTopBar />
      {isLoading ? <LoadingList rows={5} /> : error ? <ErrorState error={error} onRetry={refetch} /> : (
        <FlatList
          style={{ backgroundColor: c.paper }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 12 }}
          data={list}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.accent} />}
          ListHeaderComponent={
            <View style={{ gap: 12, paddingTop: 16, paddingBottom: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Txt v="h1" style={{ flex: 1 }}>Events</Txt>
                <Button label="New event" icon="plus" variant="primary" size="sm" onPress={() => router.push('/new-event')} />
              </View>
              <Input icon="search" value={q} onChangeText={setQ} placeholder="Search by name or event code" returnKeyType="search" clearButtonMode="while-editing" accessibilityLabel="Search events" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginHorizontal: -16 }}>
                <View style={{ width: 10 }} />
                {FILTERS.filter((f) => f.value === 'all' || count(f.value) > 0).map((f) => (
                  <Chip key={f.value} label={f.label} count={count(f.value)} selected={status === f.value} onPress={() => setStatus(f.value)} />
                ))}
                <View style={{ width: 10 }} />
              </ScrollView>
            </View>
          }
          ListEmptyComponent={
            events?.length
              ? <EmptyState icon="search" title="No events match" body="Try another name or code, or show all events." action="Show all events" actionVariant="secondary" onAction={() => { setQ(''); setStatus('all') }} />
              : <EmptyState icon="calendar" title="No events yet" body="Create an event, upload photos and share one link with your guests." />
          }
          renderItem={({ item }) => <StudioEventCard event={item} onPress={() => router.push({ pathname: '/manage/[id]', params: { id: item.id } })} />}
        />
      )}
    </View>
  )
}
