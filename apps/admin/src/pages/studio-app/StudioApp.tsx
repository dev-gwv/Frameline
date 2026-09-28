import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { HelpCircle, Lock, Plus, Tag } from 'lucide-react'
import type { Studio, StudioAppConfig } from '@frameline/shared'
import { Button, Card, CardHeader, Page, SettingRow, Skeleton, Toggle, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents, useStudio } from '../../lib/queries'
import { QueryError } from '../system'
import { FollowCodeCard } from './FollowCodeCard'
import { AddFeaturedModal, FeaturedGalleries, featurable, MAX_FEATURED } from './FeaturedGalleries'
import { AppPreview } from './AppPreview'

const EMPTY: StudioAppConfig = { featuredEventIds: [], showServices: true, showFaq: true, showPrivate: false }

export default function StudioApp() {
  const api = useApi()
  const qc = useQueryClient()
  const toast = useToast()
  const studio = useStudio()
  const events = useEvents()
  const [adding, setAdding] = useState(false)

  // Every change saves straight away (studio.app via api.updateStudio); `config` is the optimistic copy.
  // `latest` is the newest unsaved config: older responses and refetches never overwrite it (Undo right after Remove).
  const savedJson = JSON.stringify(studio.data?.app ?? EMPTY)
  const [config, setConfig] = useState<StudioAppConfig>(EMPTY)
  const latest = useRef<StudioAppConfig | null>(null)
  useEffect(() => { if (!latest.current) setConfig(JSON.parse(savedJson) as StudioAppConfig) }, [savedJson])

  const save = useAction((app: StudioAppConfig) => api.updateStudio({ app } as Partial<Studio>), {
    onSuccess: (s, vars) => { if (vars === latest.current) { latest.current = null; qc.setQueryData(['studio'], s) } },
    onError: (_e, vars) => { if (vars === latest.current) { latest.current = null; setConfig(JSON.parse(savedJson) as StudioAppConfig) } },
  })
  const apply = (next: StudioAppConfig) => { latest.current = next; setConfig(next); save.mutate(next) }
  const patch = (p: Partial<StudioAppConfig>, message?: string) => { apply({ ...config, ...p }); if (message) toast.success(message) }

  const byName = (id: string) => events.data?.find((e) => e.id === id)?.name ?? 'Gallery'
  const remove = (id: string) => {
    const before = config
    apply({ ...config, featuredEventIds: config.featuredEventIds.filter((x) => x !== id) })
    toast.undo(`${byName(id)} removed from featured`, () => apply(before))
  }
  const add = (ids: string[]) => {
    apply({ ...config, featuredEventIds: [...config.featuredEventIds, ...ids] })
    toast.success(ids.length === 1 ? `${byName(ids[0])} featured` : `${ids.length} galleries featured`)
  }

  const canAdd = !!events.data && config.featuredEventIds.length < MAX_FEATURED && featurable(events.data, config.featuredEventIds).length > 0
  const page = (children: ReactNode) => (
    <Page title="Your studio app" subtitle="What guests see when they follow your studio in the Frameline app. Changes save as you make them."
      actions={<Button variant="primary" icon={<Plus size={15} />} disabled={!canAdd} onClick={() => setAdding(true)}>Add a featured gallery</Button>}>
      {children}
    </Page>
  )

  if (studio.error || events.error) return page(<Card><QueryError error={studio.error ?? events.error} retry={() => { studio.refetch(); events.refetch() }} /></Card>)
  if (!studio.data || !events.data) {
    return page(<div className="grid gap-4 lg:grid-cols-[1fr_300px]"><div className="flex flex-col gap-4"><Skeleton className="h-36 rounded-card" /><Skeleton className="h-48 rounded-card" /><Skeleton className="h-56 rounded-card" /></div><Skeleton className="mx-auto h-[540px] w-[262px] rounded-[36px]" /></div>)
  }

  const s = studio.data
  const privateCount = events.data.filter((e) => !e.deletedAt && e.settings.access !== 'link' && e.status !== 'draft' && e.status !== 'archived').length

  return page(<>
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <FollowCodeCard studio={s} />
        <Card>
          <CardHeader title="Show in your app" description="Turn sections of your studio page on or off." />
          <SettingRow icon={<Tag size={15} />} title="Services and prices" description={`${s.services.length} from your studio profile`}
            control={<Toggle label="Services and prices" checked={config.showServices} onCheckedChange={(v) => patch({ showServices: v }, v ? 'Services shown in your app' : 'Services hidden from your app')} />} />
          <SettingRow icon={<HelpCircle size={15} />} title="Questions and answers" description={`${s.faq.length} answered`}
            control={<Toggle label="Questions and answers" checked={config.showFaq} onCheckedChange={(v) => patch({ showFaq: v }, v ? 'Questions shown in your app' : 'Questions hidden from your app')} />} />
          <SettingRow icon={<Lock size={15} />} title="Private events in the list" description={`Cover and name only, guests still need the PIN · ${privateCount} private`}
            control={<Toggle label="Private events in the list" checked={config.showPrivate} onCheckedChange={(v) => patch({ showPrivate: v }, v ? 'Private events listed' : 'Private events hidden')} />} />
          <p className="mt-2 text-[12.5px] text-ink-3">Edit services and questions in <Link to="/settings/profile" className="font-bold text-accent-text hover:underline">Studio profile</Link>.</p>
        </Card>
        <FeaturedGalleries events={events.data} featured={config.featuredEventIds}
          onReorder={(featuredEventIds) => patch({ featuredEventIds })} onRemove={remove} onAddClick={() => setAdding(true)} />
      </div>
      <div className="flex justify-center lg:sticky lg:top-[72px]">
        <AppPreview studio={s} events={events.data} config={config} />
      </div>
    </div>
    <AddFeaturedModal open={adding} onOpenChange={setAdding} events={events.data} featured={config.featuredEventIds} onAdd={add} />
  </>)
}
