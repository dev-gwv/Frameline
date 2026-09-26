import { useMemo, useState } from 'react'
import { FlatList, RefreshControl, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import type { EventStatus } from '@frameline/shared'
import { Chip, EmptyState, ErrorState, Input, LoadingList, statusLabel } from '@/components'
import { EventRow } from '@/components/studio'
import { useEvents } from '@/lib/queries'
import { useTheme } from '@/theme'

const FILTERS: (EventStatus | 'all')[] = ['all', 'live', 'uploading', 'expiring', 'draft', 'archived']

export default function StudioEvents() {
  const { c } = useTheme()
  const { data: events, isLoading, error, refetch, isRefetching } = useEvents()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<EventStatus | 'all'>('all')

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (events ?? []).filter((e) => (status === 'all' || e.status === status) && (!term || e.name.toLowerCase().includes(term) || e.city.toLowerCase().includes(term) || e.shortId.toLowerCase().includes(term)))
  }, [events, q, status])

  if (isLoading) return <LoadingList rows={6} />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <FlatList
      style={{ backgroundColor: c.paper }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      data={list}
      keyExtractor={(e) => e.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.accent} />}
      ListHeaderComponent={
        <View style={{ gap: 10, paddingTop: 8, paddingBottom: 6 }}>
          <Input icon="search" value={q} onChangeText={setQ} placeholder="Search events, cities or codes" returnKeyType="search" clearButtonMode="while-editing" accessibilityLabel="Search events" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {FILTERS.map((f) => (
              <Chip key={f} label={f === 'all' ? 'All' : statusLabel(f)} count={(events ?? []).filter((e) => f === 'all' || e.status === f).length} selected={status === f} onPress={() => setStatus(f)} />
            ))}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={<EmptyState icon="search" title="No events match" body="Try a different name or clear the filter." action="Clear filters" onAction={() => { setQ(''); setStatus('all') }} />}
      renderItem={({ item, index }) => <EventRow event={item} first={index === 0} onPress={() => router.push({ pathname: '/manage/[id]', params: { id: item.id } })} />}
    />
  )
}
