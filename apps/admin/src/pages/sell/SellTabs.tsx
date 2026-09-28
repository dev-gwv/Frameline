import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, MoreHorizontal, Receipt, ShoppingBag } from 'lucide-react'
import { fmt, type ID, type LedgerEntry, type Order, type PhotoEvent, type StoreSettings, type WalletBalance } from '@frameline/shared'
import { Button, Card, Chip, cn, EmptyState, FilterChips, Menu, Skeleton, useToast } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { QueryError } from '../system'
import { exportLedgerCsv, exportOrdersCsv, LEDGER_FILTERS, ledgerMatches, LEDGER_TYPES, money, ORDER_STATUS, type LedgerFilter } from './lib'
import { counts } from './revenue'

/* ---------------- Orders ---------------- */
type OrderFilter = 'all' | Order['status']
export function OrdersTab({ orders, loading, error, retry, onOpen, onSell }: {
  orders?: Order[]; loading: boolean; error: unknown; retry: () => void; onOpen: (o: Order) => void; onSell: () => void
}) {
  const [filter, setFilter] = useState<OrderFilter>('all')
  const list = orders ?? []
  const n = (s: Order['status']) => list.filter((o) => o.status === s).length
  const rows = filter === 'all' ? list : list.filter((o) => o.status === filter)
  const options = [
    { value: 'all' as const, label: 'All', count: list.length },
    { value: 'paid' as const, label: 'Paid', count: n('paid') },
    { value: 'printing' as const, label: 'Printing', count: n('printing'), attention: true },
    { value: 'pending' as const, label: 'Payment pending', count: n('pending') },
    { value: 'refunded' as const, label: 'Refunded', count: n('refunded') },
    ...(n('paid-direct') ? [{ value: 'paid-direct' as const, label: 'Paid directly', count: n('paid-direct') }] : []),
  ]
  if (error) return <Card><QueryError error={error} retry={retry} what="your orders" /></Card>
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterChips label="Show orders" value={filter} onChange={setFilter} options={options} />
        <Button size="sm" icon={<Download size={13} />} disabled={!rows.length} onClick={() => exportOrdersCsv(rows)}>Export CSV</Button>
      </div>
      <Card padded={false} className="overflow-hidden">
        {loading ? <div className="p-4"><Skeleton className="h-48" /></div> : !list.length ? (
          <EmptyState icon={<ShoppingBag size={22} />} title="No orders yet" body="Sell from an event and share its gallery. Orders show up here the moment a guest pays." action={<Button onClick={onSell}>Sell from an event</Button>} />
        ) : !rows.length ? (
          <EmptyState title="Nothing here" body="No orders match this filter." action={<Button onClick={() => setFilter('all')}>Show all orders</Button>} />
        ) : (
          <ul>
            {rows.map((o) => (
              <li key={o.id} className="border-t border-line first:border-t-0">
                <button type="button" onClick={() => onOpen(o)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 text-left hover:bg-sunk focus-visible:bg-sunk md:grid-cols-[64px_minmax(0,1fr)_minmax(0,1.1fr)_100px_170px] md:px-[18px]">
                  <b className="hidden tnum md:block">#{o.number}</b>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{o.buyer}<span className="font-medium text-ink-3 md:hidden"> · #{o.number}</span></span>
                    <span className="block truncate text-[12.5px] text-ink-3">{o.eventName} · {fmt.dayMonth(o.at)}</span>
                  </span>
                  <span className="hidden truncate text-ink-2 md:block">{o.items}</span>
                  <b className="text-right tnum">{money(o.paid, o.currency)}</b>
                  <span className="col-span-2 flex items-center justify-between gap-2 md:col-span-1 md:justify-end">
                    <span className="truncate text-[12.5px] text-ink-2 md:hidden">{o.items}</span>
                    <Chip tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Chip>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* ---------------- Selling events ---------------- */
export function EventsTab({ events, orders, loading, onSell }: { events?: PhotoEvent[]; orders?: Order[]; loading: boolean; onSell: () => void }) {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const list = (events ?? []).filter((e) => e.settings.storeEnabled)
  const stats = useMemo(() => {
    const m = new Map<ID, { orders: number; sold: number }>()
    for (const o of orders ?? []) {
      if (!counts(o) || o.currency !== 'INR') continue
      const s = m.get(o.eventId) ?? { orders: 0, sold: 0 }
      s.orders += 1; s.sold += o.paid
      m.set(o.eventId, s)
    }
    return m
  }, [orders])
  const toggle = useAction((v: { id: ID; on: boolean }) => api.updateEventSettings(v.id, { storeEnabled: v.on }), {
    onSuccess: (e, v) => { if (!v.on) toast.undo(`${e.name} stopped selling`, () => toggle.mutate({ id: e.id, on: true }), 'Guests no longer see Buy buttons.') },
  })
  if (loading) return <Skeleton className="h-48 rounded-card" />
  if (!list.length) return (
    <Card><EmptyState icon={<ShoppingBag size={22} />} title="No events are selling" body="Pick an event, check the prices, and guests can buy their photos." action={<Button onClick={onSell}>Sell from an event</Button>} /></Card>
  )
  return (
    <Card padded={false}>
      <ul>
        {list.map((e) => {
          const s = stats.get(e.id)
          const custom = Object.keys(e.settings.priceOverrides ?? {}).length > 0
          return (
            <li key={e.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 md:px-[18px]">
              <div className="min-w-0 flex-1">
                <Link to={`/events/${e.id}`} className="block truncate font-bold hover:underline">{e.name}</Link>
                <span className="block truncate text-[12.5px] text-ink-3">
                  {s ? `${fmt.count(s.orders)} ${s.orders === 1 ? 'order' : 'orders'} · ${fmt.rupees(s.sold)} sold` : 'No orders yet'} · {custom ? 'Own prices for this event' : 'Default prices'}
                </span>
              </div>
              <Chip tone="ok" className="max-sm:hidden">Selling</Chip>
              <Menu trigger={<Button size="icon" variant="ghost" aria-label={`More for ${e.name}`}><MoreHorizontal size={16} /></Button>}
                items={[
                  { label: 'Open event', onSelect: () => navigate(`/events/${e.id}`) },
                  { label: 'Stop selling', description: 'Guests stop seeing Buy buttons', onSelect: () => toggle.mutate({ id: e.id, on: false }) },
                ]} />
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/* ---------------- Payouts (wallet ledger) ---------------- */
export function PayoutsTab({ ledger, wallet, settings, loading, error, retry, onWithdraw }: {
  ledger?: LedgerEntry[]; wallet?: WalletBalance; settings?: StoreSettings; loading: boolean; error: unknown; retry: () => void; onWithdraw: () => void
}) {
  const [filter, setFilter] = useState<LedgerFilter>('all')
  const sorted = useMemo(() => [...(ledger ?? [])].sort((a, b) => b.at.localeCompare(a.at)), [ledger])
  const rows = sorted.filter((l) => ledgerMatches(filter, l))
  const p = settings?.payout
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <b className="block">{p?.accountLast4 ? `Payouts go to ${p.bank || 'your bank'} ····${p.accountLast4} every Tuesday` : 'Add a bank account to get paid'}</b>
          <span className="block text-[13px] text-ink-2">
            {wallet ? <>You can withdraw <b className="tnum text-ink">{fmt.rupees(wallet.withdrawable, true)}</b> now. Sales wait 3 days for refunds first.</> : 'Sales wait 3 days for refunds, then you can withdraw them.'}
          </span>
        </div>
        {p?.accountLast4 ? <Button onClick={onWithdraw}>Withdraw</Button> : <Link to="/sell/settings/payouts" className="font-bold text-accent-text hover:underline">Add bank account</Link>}
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterChips label="Show" value={filter} onChange={setFilter} options={LEDGER_FILTERS.map((f) => ({ ...f, count: sorted.filter((l) => ledgerMatches(f.value, l)).length }))} />
        <Button size="sm" icon={<Download size={13} />} disabled={!rows.length} onClick={() => exportLedgerCsv(rows)}>Export CSV</Button>
      </div>
      <Card padded={false} className="overflow-hidden">
        {error ? <QueryError error={error} retry={retry} what="your wallet" /> : loading ? <div className="p-4"><Skeleton className="h-48" /></div> : !rows.length ? (
          <EmptyState icon={<Receipt size={22} />} title="Nothing here yet" body="Sales, payouts and money you add show up here the moment they happen." action={filter !== 'all' ? <Button onClick={() => setFilter('all')}>Show everything</Button> : undefined} />
        ) : (
          <ul>
            {rows.map((l) => (
              <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-t border-line px-4 py-3 first:border-t-0 md:grid-cols-[130px_minmax(0,1fr)_150px_130px] md:px-[18px]">
                <span className="hidden text-[13px] text-ink-3 md:block">{fmt.dateTime(l.at)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{l.description}</span>
                  <span className="block text-[12.5px] text-ink-3 md:hidden">{fmt.dateTime(l.at)} · {LEDGER_TYPES[l.type].label}</span>
                </span>
                <span className="hidden text-[13px] text-ink-2 md:block">{LEDGER_TYPES[l.type].label}</span>
                <b className={cn('text-right tnum', l.amount > 0 ? 'text-ok' : 'text-ink')}>{fmt.signedRupees(l.amount)}</b>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
