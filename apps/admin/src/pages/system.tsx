import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { ApiError } from '@frameline/shared'
import { Button, PageBody, Skeleton } from '@frameline/ui'

/**
 * Loading pattern: grey shapes in the layout of a real page (title + buttons, a row of cards,
 * a big content block), never a spinner.
 */
export function PageFallback() {
  return (
    <PageBody aria-busy="true" aria-label="Loading">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-[18px] pt-5 sm:pt-[26px]">
        <div className="flex flex-col gap-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-72 max-w-[70vw]" /></div>
        <div className="flex gap-2"><Skeleton className="h-[38px] w-28 rounded-control" /><Skeleton className="h-[38px] w-28 rounded-control" /></div>
      </div>
      <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-card border border-line bg-surface">
            <Skeleton className="h-[118px] rounded-none" />
            <div className="flex flex-col gap-2 p-3.5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
          </div>
        ))}
      </div>
      <Skeleton className="mt-4 h-56 rounded-card" />
    </PageBody>
  )
}

/** Loading inside an event tab (the event header is already on screen): a toolbar and a block of grey tiles. */
export function TabFallback() {
  return (
    <div aria-busy="true" aria-label="Loading" className="pt-1">
      <div className="mb-3 flex items-center justify-between gap-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-[30px] w-32 rounded-control" /></div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-[4/3] rounded-[8px]" />)}
      </div>
    </div>
  )
}

/** A short reference people can quote to support: the server's request id, or one made from the error. */
export function errorRef(error: unknown): string {
  if (error instanceof ApiError && error.requestId) return error.requestId.slice(0, 9)
  const text = error instanceof Error ? `${error.name}:${error.message}` : String(error)
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0
  const hex = (h >>> 0).toString(16).padStart(8, '0')
  return `${hex.slice(0, 4)}-${hex.slice(4, 6)}`
}

/** Plain words for what went wrong. */
function explain(error: unknown): { title?: string; body: string; gone?: boolean } {
  if (error instanceof ApiError) {
    if (error.status === 0 || error.code === 'network_error') return { body: 'It’s probably your connection. Your photos are safe.' }
    if (error.status === 404) return { title: 'This isn’t here any more', body: 'It may have been deleted, or the link is old.', gone: true }
    if (error.status === 403) return { title: 'You don’t have access to this', body: 'Ask the studio owner to change your role in Team.' }
    if (error.status >= 500) return { body: 'Something went wrong on our side. Your photos are safe; try again in a moment.' }
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { body: 'You’re offline. Your photos are safe; this loads when you’re back.' }
  return { body: 'It’s probably your connection. Your photos are safe.' }
}

function ErrorPanel({ title, body, reference, onRetry, className, gone }: { title: string; body: string; reference: string; onRetry: () => void; className?: string; gone?: boolean }) {
  const navigate = useNavigate()
  return (
    <div className={className ?? 'grid place-items-center px-4 py-16'} role="alert">
      <div className="flex max-w-[420px] flex-col items-center gap-3 text-center">
        <span className="grid size-[52px] place-items-center rounded-control bg-warn-soft text-warn"><AlertTriangle size={24} aria-hidden /></span>
        <h2 className="font-display text-[22px] font-semibold">{title}</h2>
        <p className="text-[14px] text-ink-2">{body}</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {/* Gone (404): trying again can't help, so the way out is the main action. */}
          {!gone && <Button variant="primary" icon={<RefreshCw size={15} />} onClick={onRetry}>Try again</Button>}
          <Button variant={gone ? 'primary' : 'ghost'} onClick={() => navigate('/events')}>Go to Events</Button>
        </div>
        <p className="text-[12px] text-ink-3">Error ref {reference} · include this if you contact us</p>
      </div>
    </div>
  )
}

/** Shown when a page throws or a route fails to load. */
export function RouteError() {
  const err = useRouteError()
  const title = isRouteErrorResponse(err) && err.status === 404 ? 'This page isn’t here' : 'This page hit a problem'
  const body = isRouteErrorResponse(err)
    ? 'It may have moved. Try again, or go to your events.'
    : 'Something unexpected happened. Your photos are safe. Try again, and if it keeps happening, tell us.'
  return (
    <div className="grid min-h-dvh place-items-center bg-paper">
      <ErrorPanel title={title} body={body} reference={errorRef(err)} onRetry={() => location.reload()} />
    </div>
  )
}

/**
 * Inline error for a failed query inside a page: plain words, Try again (gold), Go to Events, and a
 * reference for support. `what` names the thing ("this event", "your events").
 */
export function QueryError({ error, retry, what = 'this' }: { error: unknown; retry?: () => void; what?: string }) {
  const e = explain(error)
  return <ErrorPanel title={e.title ?? `We couldn’t load ${what}`} body={e.body} gone={e.gone} reference={errorRef(error)} onRetry={retry ?? (() => location.reload())} />
}
