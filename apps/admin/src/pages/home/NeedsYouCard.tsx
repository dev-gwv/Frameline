import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ScanFace, Upload, Users, type LucideIcon } from 'lucide-react'
import type { NeedsYouKind } from '@frameline/shared'
import { Button, Card, CountBadge, IconTile, Skeleton } from '@frameline/ui'
import { useNeedsYou } from '../../lib/queries'

const ICON: Record<NeedsYouKind, LucideIcon> = {
  'access-request': Users, 'guest-uploads': Upload, 'event-expiring': AlertTriangle, 'face-data-expiring': ScanFace,
}
const MAX = 5

/** Only actionable things reach Home (rule 13). Each row has its one button. */
export function NeedsYouCard({ className }: { className?: string }) {
  const navigate = useNavigate()
  const q = useNeedsYou()
  const [all, setAll] = useState(false)
  // Uploaders get a 403: treat as nothing to do.
  const items = q.isError ? [] : q.data ?? []
  const shown = all ? items : items.slice(0, MAX)

  return (
    <Card className={className}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="font-sans text-[15px] font-extrabold tracking-normal">Needs you</h2>
        {items.length > 0 && <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><CountBadge n={items.length} />{items.length === 1 ? 'thing' : 'things'}</span>}
      </div>
      {q.isLoading ? (
        <div className="flex flex-col gap-3 pt-2">{Array.from({ length: 3 }, (_, i) => <div key={i} className="flex items-center gap-3"><Skeleton className="size-8 rounded-control" /><div className="flex flex-1 flex-col gap-1.5"><Skeleton className="h-3.5 w-4/5" /><Skeleton className="h-3 w-1/2" /></div></div>)}</div>
      ) : items.length === 0 ? (
        <div className="flex items-start gap-2.5 py-3 text-[13px]">
          <CheckCircle2 size={18} className="mt-px shrink-0 text-ok" aria-hidden />
          <div><b>Nothing needs you right now.</b><div className="text-ink-2">Access requests, guest photos to review and events about to expire show up here.</div></div>
        </div>
      ) : (
        <ul>
          {shown.map((item) => {
            const Icon = ICON[item.kind]
            const urgent = item.kind === 'event-expiring' || item.kind === 'face-data-expiring'
            return (
              <li key={item.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                <IconTile tone={urgent ? 'neutral' : 'accent'} className={urgent ? 'bg-warn-soft text-warn' : undefined}><Icon size={15} aria-hidden /></IconTile>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold leading-snug">{item.title}</div>
                  <div className="truncate text-[12px] text-ink-3">{item.detail}</div>
                </div>
                <Button size="sm" className="max-sm:h-10" onClick={() => navigate(item.to)} aria-label={`${item.actionLabel}: ${item.title}`}>{item.actionLabel}</Button>
              </li>
            )
          })}
        </ul>
      )}
      {items.length > MAX && (
        <button type="button" className="mt-1 text-[12.5px] font-bold text-accent-text hover:underline" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </Card>
  )
}
