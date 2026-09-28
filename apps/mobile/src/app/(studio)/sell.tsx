import { Linking, RefreshControl, View } from 'react-native'
import { DEMO_NOW, fmt, type Order } from '@frameline/shared'
import { Button, Card, CardTitle, Chip, EmptyState, ErrorState, LoadingList, Screen, Skeleton, Txt, type ChipTone } from '@/components'
import { useOrders, useWallet } from '@/lib/queries'
import { font, useTheme } from '@/theme'

const STATUS: Record<Order['status'], { label: string; tone: ChipTone }> = {
  paid: { label: 'Paid', tone: 'ok' }, printing: { label: 'Printing', tone: 'accent' }, pending: { label: 'Payment pending', tone: 'warn' },
  refunded: { label: 'Refunded', tone: 'neutral' }, 'paid-direct': { label: 'Paid to you', tone: 'ok' },
}

/**
 * Sell photos on a phone: the wallet (getWallet) and recent orders, read-only. Selling setup, prices, refunds and
 * withdrawals are desktop work and open on the web.
 */
export default function Sell() {
  const { c } = useTheme()
  const wallet = useWallet()
  const orders = useOrders()
  const list = [...(orders.data ?? [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20)
  const month = (orders.data ?? []).filter((o) => o.currency === 'INR' && o.status !== 'refunded' && o.status !== 'pending' && fmt.daysUntil(o.at, DEMO_NOW) > -30).reduce((s, o) => s + o.paid, 0)

  return (
    <Screen refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => { orders.refetch(); wallet.refetch() }} tintColor={c.accent} />}>
      <Txt v="small">Guests buy downloads and prints. Money goes to your wallet.</Txt>

      {wallet.isLoading ? <Skeleton style={{ height: 120, borderRadius: 12 }} /> : wallet.data ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: font.display, fontSize: 28, color: c.ink, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{fmt.rupees(wallet.data.balance)}</Txt>
              <Txt v="small">In your wallet</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: font.display, fontSize: 28, color: c.ink, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{fmt.rupees(month)}</Txt>
              <Txt v="small">Sold in the last 30 days</Txt>
            </View>
          </View>
          <Txt v="small" color={c.ink3}>{fmt.rupees(wallet.data.withdrawable)} can go to your bank · {fmt.rupees(wallet.data.prepaid)} added for renewals and packs</Txt>
          <Button label="Withdraw or change prices on the web" icon="external-link" size="sm" onPress={() => Linking.openURL('https://app.frameline.in/sell?tab=payouts')} />
        </Card>
      ) : wallet.error ? <ErrorState error={wallet.error} onRetry={wallet.refetch} /> : (
        <Card><Txt v="small">Only the studio owner can see the wallet.</Txt></Card>
      )}

      <CardTitle title="Recent orders" description="Open an order on the web to refund it." />
      {orders.isLoading ? <LoadingList rows={3} /> : orders.error ? <ErrorState error={orders.error} onRetry={orders.refetch} /> : list.length ? (
        <Card padded={false} style={{ paddingHorizontal: 14 }}>
          {list.map((o, i) => (
            <View key={o.id} style={{ paddingVertical: 12, gap: 4, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt weight="bold" style={{ flex: 1 }} numberOfLines={1}>#{o.number} · {o.buyer}</Txt>
                <Txt weight="heavy" style={{ fontVariant: ['tabular-nums'] }}>{fmt.money(o.paid, o.currency)}</Txt>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt v="small" style={{ flex: 1 }} numberOfLines={1}>{o.items} · {o.eventName} · {fmt.ago(o.at, DEMO_NOW)}</Txt>
                <Chip label={STATUS[o.status].label} tone={STATUS[o.status].tone} />
              </View>
            </View>
          ))}
        </Card>
      ) : <EmptyState icon="shopping-bag" title="No orders yet" body="Turn on selling in an event’s Settings. Guests then buy downloads and prints from the gallery." />}
    </Screen>
  )
}
