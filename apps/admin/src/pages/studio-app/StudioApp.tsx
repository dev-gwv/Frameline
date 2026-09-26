import { useState } from 'react'
import { Check, HelpCircle, Lock, Tag } from 'lucide-react'
import { Button, Card, CardHeader, PageHeader, SettingRow, Skeleton, Toggle, useToast } from '@frameline/ui'
import { useEvents, useStudio } from '../../lib/queries'
import { QueryError } from '../system'
import { useLocalState } from './util'
import { DEFAULT_CONFIG, QUESTIONS, type AppConfig } from './sample'
import { FollowCodeCard } from './FollowCodeCard'
import { FeaturedGalleries } from './FeaturedGalleries'
import { AppPreview } from './AppPreview'

const STORAGE_KEY = 'frameline.studioApp.v1'

export default function StudioApp() {
  const studio = useStudio()
  const events = useEvents()
  const toast = useToast()
  // No API for app features yet: the saved config lives in localStorage; edits stay in a draft until Save.
  const [saved, setSaved] = useLocalState<AppConfig>(STORAGE_KEY, DEFAULT_CONFIG)
  const [draft, setDraft] = useState<AppConfig>(saved)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const patch = (p: Partial<AppConfig>) => setDraft((d) => ({ ...d, ...p }))

  const save = () => { setSaved(draft); toast.success('Saved', 'Your studio profile in the app is updated.') }

  const header = (
    <PageHeader
      title="Studio app"
      subtitle="What guests see when they follow your studio in the Frameline app."
      actions={<>
        {dirty && <span className="text-[12px] font-semibold text-warn">Unsaved changes</span>}
        {dirty && <Button variant="ghost" onClick={() => setDraft(saved)}>Discard</Button>}
        <Button variant="primary" icon={<Check size={14} />} disabled={!dirty} onClick={save}>Save</Button>
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
            <SettingRow icon={<Tag size={15} />} title="Services and prices" description="From your website"
              control={<Toggle label="Services and prices" checked={draft.showServices} onCheckedChange={(v) => patch({ showServices: v })} />} />
            <SettingRow icon={<HelpCircle size={15} />} title="Questions and answers" description={`${QUESTIONS.length} answered`}
              control={<Toggle label="Questions and answers" checked={draft.showQuestions} onCheckedChange={(v) => patch({ showQuestions: v })} />} />
            <SettingRow icon={<Lock size={15} />} title="Private galleries in the list" description={`Cover and name only · ${privateCount} private`}
              control={<Toggle label="Private galleries in the list" checked={draft.showPrivate} onCheckedChange={(v) => patch({ showPrivate: v })} />} />
          </Card>
        </div>
        <div className="min-w-0">
          <FeaturedGalleries events={events.data} featured={draft.featured} onChange={(featured) => patch({ featured })} />
        </div>
        <div className="flex justify-center lg:col-span-2 xl:col-span-1 xl:justify-start">
          <AppPreview studio={studio.data} events={events.data} config={draft} />
        </div>
      </div>
    </div>
  )
}
