import { Link } from 'react-router-dom'
import { Camera, Check, Mail, Monitor, ScanFace, ShoppingBag, UserPlus, Users, type LucideIcon } from 'lucide-react'
import { DEMO_NOW, fmt, type ActivityItem } from '@frameline/shared'
import { Button, Card, CardHeader, Chip, DarkCard, IconTile, Menu, Meter, Skeleton, cn, useToast } from '@frameline/ui'
import type { ChecklistItem } from './stats'

export function SetupChecklist({ items }: { items: ChecklistItem[] }) {
  const done = items.filter((i) => i.done).length
  if (done === items.length) return null
  return (
    <Card>
      <CardHeader title="Finish setting up" action={<span className="font-mono text-[12px] text-ink-2">{done} of {items.length}</span>} />
      <Meter value={done} max={items.length} className="mb-2" />
      <ul className="flex flex-col">
        {items.map((t) => (
          <li key={t.label} className={cn('flex items-center gap-2.5 py-1.5 text-[13px]', t.done && 'text-ink-3 line-through')}>
            <span className={cn('grid size-[18px] shrink-0 place-items-center rounded-full', t.done ? 'bg-gold text-accent-ink' : 'border-[1.5px] border-line-2')}>
              {t.done && <Check size={11} strokeWidth={3} />}
            </span>
            {t.label}
            {!t.done && <Link to={t.to} className="ml-auto text-[12px] font-bold text-accent-text hover:underline">Start</Link>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

const ICONS: Record<ActivityItem['kind'], LucideIcon> = {
  face: ScanFace, order: ShoppingBag, camera: Camera, 'guest-upload': Users, registration: UserPlus, enquiry: Mail,
}

export function ActivityFeed({ items, loading }: { items?: ActivityItem[]; loading?: boolean }) {
  return (
    <Card>
      <CardHeader title="Activity" action={<Chip tone="accent" dot>Live</Chip>} />
      {loading ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : !items?.length ? (
        <p className="py-3 text-[12.5px] text-ink-3">Nothing yet. Guest searches, orders and uploads show up here as they happen.</p>
      ) : (
        <ul>
          {items.slice(0, 6).map((a) => {
            const Icon = ICONS[a.kind]
            return (
              <li key={a.id} className="flex items-start gap-2.5 border-t border-line py-2 first:border-t-0">
                <IconTile><Icon size={14} /></IconTile>
                <div className="min-w-0 text-[13px]">
                  <b className="font-bold">{a.title}</b>
                  <div className="text-[11.5px] text-ink-3">{a.detail} · {fmt.ago(a.at, DEMO_NOW)}</div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export function DesktopUploaderCard() {
  const toast = useToast()
  const get = (os: string) => toast.toast({ kind: 'info', title: `Download link for ${os} sent to your email`, body: 'Open it on the computer you edit on, install, then sign in with this account.' })
  return (
    <DarkCard className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <Monitor size={18} className="shrink-0 text-side-gold" aria-hidden />
        <div>
          <b className="text-[13px]">Desktop uploader</b>
          <div className="text-[11.5px] text-side-ink-2">Up to 9× faster for 2,000+ photos</div>
        </div>
      </div>
      <Menu width={180} trigger={<Button size="sm" variant="side">Mac · Windows</Button>}
        items={[{ label: 'Download for Mac', onSelect: () => get('Mac') }, { label: 'Download for Windows', onSelect: () => get('Windows') }]} />
    </DarkCard>
  )
}
