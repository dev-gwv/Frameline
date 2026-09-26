import { Link } from 'react-router-dom'
import { Package, ShoppingBag } from 'lucide-react'
import { Button, EmptyState, cn } from '@frameline/ui'
import { fmt, type Order } from '@frameline/shared'
import { useMyOrders } from '../lib/queries'
import { Container, LoadError, TopBar } from '../components/common'
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
  const { event, studio, base, seeAll, session } = useEventCtx()
  const q = useMyOrders(event.shortId)
  const orders = q.data ?? []

  return (
    <div className="min-h-dvh pb-12">
      <TopBar back={base} studioName={studio.name} favouritesTo={`${base}/favourites`} favCount={session.favourites.length} />
      <Container className="max-w-2xl pt-4">
        <h1 className="font-display text-[24px] font-semibold leading-tight">Your orders</h1>
        <p className="text-[12.5px] text-ink-2">Photos and prints you bought from {event.name}.</p>
        <div className="mt-4">
          {q.isLoading ? (
            <div className="flex flex-col gap-2" aria-busy aria-label="Loading orders">{[0, 1].map((i) => <div key={i} className="shimmer h-20 rounded-card bg-sunk" />)}</div>
          ) : q.isError ? (
            <LoadError error={q.error} title="Your orders didn’t load" onRetry={() => void q.refetch()} />
          ) : orders.length === 0 ? (
            <EmptyState icon={<ShoppingBag size={26} />} title="No orders yet" body={`Open a photo and tap Buy print, or buy your photos from ${studio.name}.`}
              action={<Link to={seeAll ? `${base}/a/all` : session.match ? `${base}/me` : base}><Button variant="primary">See photos</Button></Link>} />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {orders.map((o) => {
                const st = STATUS[o.status] ?? STATUS.pending
                return (
                  <li key={o.id} className="rounded-card border border-line bg-surface p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-[12px] text-ink-3">Order #{o.number} · {fmt.date(o.at)}</div>
                        <b className="block text-[14px]">{o.items}</b>
                        <div className="text-[12.5px] text-ink-2">{o.photoIds?.length ? `${fmt.count(o.photoIds.length)} ${o.photoIds.length === 1 ? 'photo' : 'photos'}` : ''}{o.shipping ? ` · ships to ${o.shipping.city}` : ''}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <b className="font-mono text-[14px] tnum">{fmt.rupees(o.paid)}</b>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', st.tone)}>{st.label}</span>
                      </div>
                    </div>
                    {o.shipping && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-3"><Package size={13} />{studio.name} prints and ships in about 5 days.</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Container>
    </div>
  )
}
