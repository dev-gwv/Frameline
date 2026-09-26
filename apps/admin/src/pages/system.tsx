import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Button, EmptyState, Skeleton } from '@frameline/ui'

export function PageFallback() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6 sm:px-7" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-72" />
    </div>
  )
}

/** Shown when a page throws or a route fails to load. */
export function RouteError() {
  const err = useRouteError()
  const title = isRouteErrorResponse(err) ? `${err.status} · ${err.statusText}` : 'This page hit a problem'
  const body = isRouteErrorResponse(err) ? String(err.data ?? '') : err instanceof Error ? err.message : 'Something unexpected happened.'
  return (
    <div className="grid min-h-full place-items-center bg-paper p-6">
      <EmptyState
        icon={<AlertTriangle size={24} />} title={title}
        body={<>{body} Reload the page, or go back home. If it keeps happening, tell support what you were doing.</>}
        action={<div className="flex gap-2"><Button onClick={() => location.reload()}>Reload</Button><Link to="/"><Button variant="primary">Go home</Button></Link></div>}
      />
    </div>
  )
}

/** Inline error for a failed query inside a page. */
export function QueryError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle size={22} />} title="Couldn’t load this"
      body={error instanceof Error ? error.message : 'The request failed.'}
      action={retry && <Button onClick={retry}>Try again</Button>}
    />
  )
}
