import { RefreshControl, View } from 'react-native'
import { router } from 'expo-router'
import { DEMO_NOW } from '@frameline/shared'
import { Button, EmptyState, ErrorState, LoadingList, Screen, SectionHeader, Skeleton, Txt } from '@/components'
import { NeedsYouCard, StudioEventCard, StudioTopBar } from '@/components/studio'
import { useLocal } from '@/lib/local'
import { useEvents, useNeedsYou, useStudio } from '@/lib/queries'
import { useUploads } from '@/lib/uploads'
import { useTheme } from '@/theme'

const greeting = (h: number) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')

/** p-home: greeting, Needs you (only things to act on), recent events, gold New event. */
export default function Home() {
  const { c } = useTheme()
  const session = useLocal((s) => s.studioSession)
  const { data: studio } = useStudio()
  const { data: events, isLoading, error, refetch, isRefetching } = useEvents()
  const needs = useNeedsYou()
  const { items } = useUploads()
  const running = items.filter((i) => i.status === 'uploading' || i.status === 'queued').length

  const firstName = (session?.name ?? studio?.name ?? '').split(' ')[0]
  const hour = new Date(DEMO_NOW).getHours()
  const list = (events ?? []).filter((e) => e.status !== 'archived')
  const live = list.filter((e) => e.status === 'live').length
  const uploading = list.find((e) => e.status === 'uploading')
  const recent = [...list].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
  const summary = [
    live ? `${live === 1 ? '1 event is' : `${live} events are`} live.` : null,
    running ? `${running} photos still uploading.` : uploading ? `${uploading.name} is still uploading.` : null,
  ].filter(Boolean).join(' ')

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <StudioTopBar />
      {isLoading ? <LoadingList rows={4} /> : error ? <ErrorState error={error} onRetry={refetch} /> : (
        <Screen refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); needs.refetch() }} tintColor={c.accent} />}>
          <View style={{ gap: 4 }}>
            <Txt v="h1">{greeting(hour)}{firstName ? `, ${firstName}` : ''}</Txt>
            {summary ? <Txt v="small">{summary}</Txt> : null}
          </View>

          {!list.length ? (
            <EmptyState icon="calendar" title="Create your first event" body="Add the event, upload photos, then share one link. Guests find their photos with a selfie."
              action="New event" icon2="plus" onAction={() => router.push('/new-event')} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Upload photos" icon="upload-cloud" style={{ flex: 1 }} onPress={() => router.navigate('/upload')} />
                <Button label="New event" icon="plus" variant="primary" style={{ flex: 1 }} onPress={() => router.push('/new-event')} />
              </View>

              {needs.isLoading ? <Skeleton style={{ height: 120, borderRadius: 12 }} /> : <NeedsYouCard items={needs.data ?? []} events={events ?? []} />}

              <SectionHeader title="Your events" action={`See all ${list.length}`} onAction={() => router.navigate('/studio-events')} />
              {recent.map((e) => <StudioEventCard key={e.id} event={e} onPress={() => router.push({ pathname: '/manage/[id]', params: { id: e.id } })} />)}
            </>
          )}
        </Screen>
      )}
    </View>
  )
}
