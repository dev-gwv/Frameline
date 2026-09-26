import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Eye, Mail, Monitor, RotateCw, Smartphone } from 'lucide-react'
import type { Studio, Website as WebsiteT, WebsiteSection } from '@frameline/shared'
import { Button, Card, Chip, ConfirmDialog, PageHeader, Segmented, Skeleton, TabBar, Tip, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useEnquiries, useEvents, useStudio, useWebsite } from '../../lib/queries'
import { QueryError } from '../system'
import { SectionsList } from './SectionsList'
import { SitePreview, type Device } from './SitePreview'
import { Inspector } from './Inspector'
import { DomainModal, CHECKS, type DomainSetup } from './DomainModal'
import { Enquiries } from './Enquiries'
import { PreviewModal } from './PreviewModal'
import { StudioContentEditor, type ContentKind } from './StudioContentEditor'
import { SITE_HOST, useLocalState } from './helpers'

type Tab = 'builder' | 'enquiries'

export default function Website() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'enquiries' ? 'enquiries' : 'builder'
  const setTab = (t: Tab) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n }, { replace: true })

  const site = useWebsite()
  const studio = useStudio()
  const events = useEvents()
  const enquiries = useEnquiries()
  const api = useApi()
  const qc = useQueryClient()
  const toast = useToast()

  const [previewOpen, setPreviewOpen] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)
  const [domainOpen, setDomainOpen] = useState(false)
  const [domain, setDomain] = useLocalState<DomainSetup | null>('frameline.website.domain', null)

  /** Optimistic website update: preview changes instantly, then saves. */
  const save = useAction((patch: Partial<WebsiteT>) => api.updateWebsite(patch), {
    onMutate: (patch) => { qc.setQueryData<WebsiteT>(['website'], (w) => (w ? { ...w, ...patch } : w)) },
    onError: () => { qc.invalidateQueries({ queryKey: ['website'] }) },
  })
  const saveStudio = useAction((patch: Partial<Studio>) => api.updateStudio(patch), {
    success: 'Brand colour saved',
    onMutate: (patch) => { qc.setQueryData<Studio>(['studio'], (s) => (s ? { ...s, ...patch } : s)) },
  })
  const publish = useAction((published: boolean) => api.updateWebsite({ published }), {
    onSuccess: (_d, published) => {
      if (published) toast.toast({ kind: 'success', title: 'Your site is live', body: `Visitors can open ${SITE_HOST(studio.data?.handle ?? '')} now.`, action: { label: 'View site', onClick: () => setPreviewOpen(true) } })
      else toast.success('Site unpublished', 'It’s back to a draft. Visitors see a “coming soon” page.')
    },
  })

  const update = (patch: Partial<WebsiteT>, message?: string) => save.mutate(patch, message ? { onSuccess: () => toast.success(message) } : undefined)

  const error = site.error ?? studio.error ?? events.error
  if (error) return <div className="px-4 py-6 sm:px-7"><QueryError error={error} retry={() => { site.refetch(); studio.refetch(); events.refetch() }} /></div>

  const w = site.data
  const st = studio.data
  const host = st ? SITE_HOST(st.handle) : ''
  const customLive = domain && domain.progress >= CHECKS.length ? domain.domain : null

  return (
    <div className="pb-10">
      <PageHeader
        title={<span className="inline-flex items-center gap-2">Website {w && (w.published ? <Chip tone="ok" dot>Live</Chip> : <Chip>Draft</Chip>)}</span>}
        subtitle={st ? <span className="font-mono text-[12.5px]">{customLive ?? host}</span> : <Skeleton className="h-4 w-44" />}
        actions={<>
          <Button icon={<Mail size={14} />} onClick={() => setTab('enquiries')} aria-pressed={tab === 'enquiries'}>
            Enquiries {enquiries.data && <Chip tone="accent">{enquiries.data.length}</Chip>}
          </Button>
          <Button icon={<Eye size={14} />} onClick={() => setPreviewOpen(true)} disabled={!w || !st}>Preview</Button>
          {w?.published ? (
            <>
              <Button variant="ghost" onClick={() => setConfirmUnpublish(true)}>Unpublish</Button>
              <Button variant="primary" icon={<ExternalLink size={14} />} onClick={() => setPreviewOpen(true)}>View live site</Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setConfirmPublish(true)} disabled={!w} loading={publish.isPending}>Publish</Button>
          )}
        </>}
      />

      <div className="px-4 sm:px-7">
        <TabBar className="mb-4" value={tab} onChange={setTab} tabs={[
          { value: 'builder', label: 'Builder' },
          { value: 'enquiries', label: 'Enquiries', count: enquiries.data?.length },
        ]} />

        {tab === 'enquiries' ? (
          st ? <Enquiries studio={st} /> : <Skeleton className="h-64" />
        ) : !w || !st || !events.data ? (
          <div className="grid gap-4 lg:grid-cols-[200px_1fr_260px]"><Skeleton className="h-80" /><Skeleton className="h-[560px]" /><Skeleton className="h-80" /></div>
        ) : (
          <Builder website={w} studio={st} events={events.data}
            domain={domain}
            onSections={(sections, msg) => update({ sections }, msg)}
            onTemplate={(template) => update({ template }, `${template[0].toUpperCase()}${template.slice(1)} template applied`)}
            onHeadline={(headline) => update({ headline }, 'Headline saved')}
            onBrand={(brandColor) => saveStudio.mutate({ brandColor })}
            onOpenDomain={() => setDomainOpen(true)} />
        )}
      </div>

      {w && st && events.data && (
        <PreviewModal open={previewOpen} onOpenChange={setPreviewOpen} website={w} studio={st} events={events.data} address={customLive ?? host} />
      )}
      {st && (
        <DomainModal key={domain ? 'set' : 'new'} open={domainOpen} onOpenChange={setDomainOpen} handle={st.handle} setup={domain}
          onSetup={(s) => { setDomain(s); if (!s && w?.customDomain) save.mutate({ customDomain: undefined }) }}
          onLive={(d) => save.mutate({ customDomain: d })} />
      )}
      <ConfirmDialog open={confirmPublish} onOpenChange={setConfirmPublish} title="Publish your website?"
        body={<>Your site goes live at <b className="font-mono">{customLive ?? host}</b>. {w?.sections.filter((s) => s.enabled).length} sections are switched on. You can keep editing; changes appear after you publish again.</>}
        confirmLabel="Publish" onConfirm={() => publish.mutate(true)} />
      <ConfirmDialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish} title="Unpublish your website?" danger
        body="Visitors will see a “coming soon” page until you publish again. Your galleries keep working."
        confirmLabel="Unpublish" onConfirm={() => publish.mutate(false)} />
    </div>
  )
}

function Builder({ website, studio, events, domain, onSections, onTemplate, onHeadline, onBrand, onOpenDomain }: {
  website: WebsiteT; studio: Studio; events: import('@frameline/shared').PhotoEvent[]; domain: DomainSetup | null
  onSections: (s: WebsiteSection[], msg: string) => void
  onTemplate: (t: WebsiteT['template']) => void
  onHeadline: (t: string) => void
  onBrand: (c: string) => void
  onOpenDomain: () => void
}) {
  const [device, setDevice] = useState<Device>('desktop')
  const [focus, setFocus] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const frame = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)

  // Desktop preview renders at 1100px and shrinks to fit the column.
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setZoom(Math.min(1, e.contentRect.width / 1100)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [contentKind, setContentKind] = useState<ContentKind>('services')
  const select = (id: string) => {
    setFocus(id); window.setTimeout(() => setFocus((f) => (f === id ? null : f)), 1600)
    if (id === 'services' || id === 'testimonials' || id === 'faq') setContentKind(id)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_260px]">
      <SectionsList sections={website.sections} selected={focus} onSelect={select} onChange={onSections} />

      <Card padded={false} className="flex min-w-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-1.5">
          <Segmented size="sm" value={device} onChange={setDevice} options={[
            { value: 'desktop', label: 'Desktop', icon: <Monitor size={12} /> },
            { value: 'phone', label: 'Phone', icon: <Smartphone size={12} /> },
          ]} />
          <span className="hidden truncate text-[11.5px] text-ink-3 sm:inline">Click the headline to edit it</span>
          <Tip label="Reload preview">
            <button type="button" aria-label="Reload preview" onClick={() => setReloadKey((k) => k + 1)} className="rounded p-1.5 text-ink-3 hover:bg-sunk hover:text-ink"><RotateCw size={14} /></button>
          </Tip>
        </div>
        <div ref={frame} className="relative h-[600px] overflow-y-auto bg-sunk scrollbar-thin">
          {device === 'phone' ? (
            <div className="mx-auto my-4 w-full max-w-[390px] overflow-hidden rounded-[28px] border-[6px] border-side shadow-card">
              <div className="h-[540px] overflow-y-auto scrollbar-thin">
                <SitePreview key={reloadKey} website={website} studio={studio} events={events} device="phone" onHeadlineChange={onHeadline} focusSection={focus} />
              </div>
            </div>
          ) : (
            <div style={{ width: zoom < 1 ? 1100 : undefined, zoom }}>
              <SitePreview key={reloadKey} website={website} studio={studio} events={events} device="desktop" onHeadlineChange={onHeadline} focusSection={focus} />
            </div>
          )}
        </div>
      </Card>

      <div className="lg:col-span-2 xl:col-span-1">
        <Inspector website={website} studio={studio} domain={domain} onTemplate={onTemplate} onBrand={onBrand} onHeadline={onHeadline} onOpenDomain={onOpenDomain} />
      </div>

      <StudioContentEditor className="lg:col-span-2 xl:col-start-2 xl:col-end-4" studio={studio} kind={contentKind}
        onKindChange={(k) => { setContentKind(k); select(k) }} />
    </div>
  )
}
