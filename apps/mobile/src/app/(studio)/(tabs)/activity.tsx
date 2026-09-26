import { FlatList, RefreshControl, View } from 'react-native'
import { DEMO_NOW, fmt, type ActivityItem } from '@frameline/shared'
import { EmptyState, ErrorState, Icon, LoadingList, Txt, type IconName } from '@/components'
import { useActivity, useOrders } from '@/lib/queries'
import { useTheme } from '@/theme'

const ICON: Record<ActivityItem['kind'], IconName> = { face: 'smile', order: 'shopping-bag', camera: 'camera', 'guest-upload': 'users', registration: 'user-plus', enquiry: 'message-circle' }

export default function Activity() {
  const { c } = useTheme()
  const { data: activity, isLoading, error, refetch, isRefetching } = useActivity()
  const { data: orders } = useOrders()
  if (isLoading) return <LoadingList rows={6} />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  // Merge activity with recent orders for a fuller feed.
  const feed: ActivityItem[] = [
    ...(activity ?? []),
    ...(orders ?? []).filter((o) => !(activity ?? []).some((a) => a.title.includes(`#${o.number}`))).map((o) => ({
      id: `o-${o.id}`, kind: 'order' as const, title: `Order #${o.number} · ${fmt.money(o.paid, o.currency)}`, detail: `${o.buyer} · ${o.eventName} · ${o.items}`, at: o.at,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <FlatList
      style={{ backgroundColor: c.paper }}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      data={feed}
      keyExtractor={(a) => a.id}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.accent} />}
      ListEmptyComponent={<EmptyState icon="activity" title="Nothing yet" body="Face matches, orders, camera uploads and enquiries show up here as they happen." />}
      renderItem={({ item }) => (
        <View style={{ flexDirection: 'row', gap: 12, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.line, padding: 14 }}>
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={ICON[item.kind]} size={18} color={c.accentText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="bold">{item.title}</Txt>
            <Txt v="small" color={c.ink3}>{item.detail} · {fmt.ago(item.at, DEMO_NOW)}</Txt>
          </View>
        </View>
      )}
    />
  )
}
