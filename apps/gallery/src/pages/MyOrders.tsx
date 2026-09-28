import { Link } from 'react-router-dom'
import { Package, ShoppingBag } from 'lucide-react'
import { cn } from '@frameline/ui'
import { fmt, type Order } from '@frameline/shared'
import { useMyOrders } from '../lib/queries'
import { Container, LoadError, linkBtn, PageTop, StateBlock } from '../components/common'
import { EventShell } from '../components/Shell'
import { useEventCtx } from './EventLayout'

const STATUS: Record<Order['status'], { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'bg-ok-soft text-ok' },
  'paid-direct': { label: 'Paid to studio', tone: 'bg-ok-soft text-ok' },
  printing: { label: 'Printing', tone: 'bg-accent-soft text-accent-text' },
  pending: { label: 'Payment pending', tone: 'bg-warn-soft text-warn' },
  refunded: { label: 'Refunded', tone: 'bg-sunk text-ink-2' },
}

/** Orders from api.listMyOrders: placed on this device, or by this registered guest's email. */
export function MyOrders() {
  const { event, studio, base, seeAll, session, forceOffline } = useEventCtx()
  const q = useMyOrders(event.shortId)
  const orders = q.data ?? []
  const browse = seeAll ? `${base}/a/all` : session.match ? `${base}/me` : base

  return (
    <EventShell event={event} base={base} tab="orders" offline={forceOffline}>
      <PageTop back={base} title="Your orders" />
      <Container className="pt-3 md:pt-2">
        <p className="text-[13.5px] text-ink-2">Photos and prints you bought from {studio.name}.</p>
        <div className="mt-3 max-w-2xl">
          {q.isLoading ? (
            <div className="flex flex-col gap-2" aria-busy aria-label="Loading orders">{[0, 1].map((i) => <div key={i} className="shimmer h-20 rounded-card bg-sunk" />)}</div>
          ) : q.isError ? (
            <LoadError error={q.error} title="Your orders didn’t load" onRetry={() => void q.refetch()} />
          ) : orders.length === 0 ? (
            <StateBlock icon={<ShoppingBag size={24} />} title="No orders yet" body="Open a photo and tap Buy print, or buy all your photos in full size.">
              <Link to={browse} className={linkBtn('primary')}>{seeAll || session.match ? 'See photos' : 'Find my photos'}</Link>
            </StateBlock>
          ) : (
            <ul className="flex flex-col gap-2">
              {orders.map((o) => {
                const st = STATUS[o.status] ?? STATUS.pending
                return (
                  <li key={o.id} className="rounded-card border border-line bg-surface p-4 shadow-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <b className="block text-[14.5px]">{o.items}</b>
                        <div className="text-[12.5px] text-ink-2">
                          Order {o.number} · {fmt.date(o.at)}{o.photoIds?.length ? ` · ${fmt.count(o.photoIds.length)} ${o.photoIds.length === 1 ? 'photo' : 'photos'}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <b className="text-[14.5px] tnum">{fmt.rupees(o.paid)}</b>
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-bold', st.tone)}><i className="size-1.5 rounded-full bg-current" aria-hidden />{st.label}</span>
                      </div>
                    </div>
                    {o.shipping && <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-3"><Package size={14} />Ships to {o.shipping.city} in about 5 days</p>}
                    {!o.shipping && !!session.match && (o.status === 'paid' || o.status === 'paid-direct') && (
                      <Link to={`${base}/me?download=1`} className="mt-2 inline-flex min-h-11 items-center text-[13px] font-extrabold text-accent-text hover:underline">Download your photos</Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Container>
    </EventShell>
  )
}
