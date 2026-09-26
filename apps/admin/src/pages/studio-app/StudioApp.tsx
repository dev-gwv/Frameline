import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, HelpCircle, Lock, Tag } from 'lucide-react'
import type { Studio, StudioAppConfig } from '@frameline/shared'
import { Button, Card, CardHeader, PageHeader, SettingRow, Skeleton, Toggle } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEvents, useStudio } from '../../lib/queries'
import { QueryError } from '../system'
import { FollowCodeCard } from './FollowCodeCard'
import { FeaturedGalleries } from './FeaturedGalleries'
import { AppPreview } from './AppPreview'

const EMPTY: StudioAppConfig = { featuredEventIds: [], showServices: true, showFaq: true, showPrivate: false }

export default function StudioApp() {
  const api = useApi()
  const studio = useStudio()
  const events = useEvents()
  // studio.app is saved with api.updateStudio; edits stay in a draft until Save so the preview can be tried out.
  const saved = studio.data?.app ?? EMPTY
  const [draft, setDraft] = useState<StudioAppConfig>(saved)
  const savedJson = JSON.stringify(saved)
  useEffect(() => { setDraft(JSON.parse(savedJson) as StudioAppConfig) }, [savedJson])
  const dirty = JSON.stringify(draft) !== savedJson
  const patch = (p: Partial<StudioAppConfig>) => setDraft((d) => ({ ...d, ...p }))

  const save = useAction((app: StudioAppConfig) => api.updateStudio({ app } as Partial<Studio>), { success: 'Studio app updated' })

  const header = (
    <PageHeader
      title="Studio app"
      subtitle="What guests see when they follow your studio in the Frameline app."
      actions={<>
        {dirty && <span className="text-[12px] font-semibold text-warn">Unsaved changes</span>}
        {dirty && <Button variant="ghost" onClick={() => setDraft(saved)}>Discard</Button>}
        <Button variant="primary" icon={<Check size={14} />} disabled={!dirty || !studio.data} loading={save.isPending} onClick={() => save.mutate(draft)}>Save</Button>
      </>}
    />
  )

  if (studio.error || events.error) {
    return <>{header}<div className="px-4 sm:px-7"><QueryError error={studio.error ?? events.error} retry={() => { studio.refetch(); events.refetch() }} /></div></>
  }
  if (!studio.data || !events.data) {
    return <>{header}<div className="grid gap-4 px-4 pb-8 sm:px-7 lg:grid-cols-[1fr_1fr_300px]"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-[540px]" /></div></>
  }

  const privateCount = events.data.filter((e) => e.settings.access !== 'link' && e.status !== 'draft' && e.status !== 'archived').length

  return (
    <div className="pb-10">
      {header}
      <div className="grid gap-4 px-4 sm:px-7 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_300px]">
        <div className="flex min-w-0 flex-col gap-3">
          <FollowCodeCard studio={studio.data} />
          <Card>
            <CardHeader title="Show in your app" />
            <SettingRow icon={<Tag size={15} />} title="Services and prices" description={`${studio.data.services.length} from your website`}
              control={<Toggle label="Services and prices" checked={draft.showServices} onCheckedChange={(v) => patch({ showServices: v })} />} />
            <SettingRow icon={<HelpCircle size={15} />} title="Questions and answers" description={`${studio.data.faq.length} answered`}
              control={<Toggle label="Questions and answers" checked={draft.showFaq} onCheckedChange={(v) => patch({ showFaq: v })} />} />
            <SettingRow icon={<Lock size={15} />} title="Private galleries in the list" description={`Cover and name only · ${privateCount} private`}
              control={<Toggle label="Private galleries in the list" checked={draft.showPrivate} onCheckedChange={(v) => patch({ showPrivate: v })} />} />
            <p className="mt-2 text-[12px] text-ink-3">Edit services and questions on <Link to="/website" className="font-bold text-accent-text hover:underline">Website</Link> or in <Link to="/settings/profile" className="font-bold text-accent-text hover:underline">Studio profile</Link>.</p>
          </Card>
        </div>
        <div className="min-w-0">
          <FeaturedGalleries events={events.data} featured={draft.featuredEventIds} onChange={(featuredEventIds) => patch({ featuredEventIds })} />
        </div>
        <div className="flex justify-center lg:col-span-2 xl:col-span-1 xl:justify-start">
          <AppPreview studio={studio.data} events={events.data} config={draft} />
        </div>
      </div>
    </div>
  )
}
