import { Linking, View } from 'react-native'
import { DEMO_NOW, PLANS, fmt } from '@frameline/shared'
import { Button, Card, CardTitle, ErrorState, LoadingList, Meter, Screen, Txt } from '@/components'
import { useUsage, useWallet } from '@/lib/queries'
import { font, useTheme } from '@/theme'

/** Plan and billing: photos used ("photos" = space), the wallet ("wallet" = money). Paying and upgrading are on the web. */
export default function Plan() {
  const { c } = useTheme()
  const { data: usage, isLoading, error, refetch } = useUsage()
  const { data: wallet } = useWallet()
  if (isLoading) return <LoadingList />
  if (error || !usage) return <ErrorState error={error} onRetry={refetch} />
  const plan = PLANS.find((p) => p.id === usage.planId)
  const pct = usage.photosLimit ? usage.photosUsed / usage.photosLimit : 0
  const days = fmt.daysUntil(usage.validTill, DEMO_NOW)

  return (
    <Screen>
      <Card style={{ gap: 10 }}>
        <CardTitle title={`${plan?.name ?? usage.planId} plan`} description={`${usage.period === 'yearly' ? 'Yearly' : 'Quarterly'} · renews ${fmt.date(usage.validTill)}${days <= 30 ? ` (in ${days} days)` : ''}`} />
        <Meter value={usage.photosUsed} max={usage.photosLimit} tone={pct > 0.95 ? 'bad' : pct > 0.85 ? 'warn' : undefined} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt v="small" style={{ fontVariant: ['tabular-nums'] }}><Txt weight="heavy">{fmt.count(usage.photosUsed)}</Txt> of {fmt.count(usage.photosLimit)} photos used</Txt>
          <Txt v="small" color={c.ink3}>{fmt.count(Math.max(0, usage.photosLimit - usage.photosUsed))} left</Txt>
        </View>
        {pct > 0.85 ? <Txt v="small" color={c.warn}>You’re close to your limit. Add photos to one event or upgrade your plan.</Txt> : null}
      </Card>

      {wallet ? (
        <Card style={{ gap: 6 }}>
          <CardTitle title="Wallet" description="Pays for renewals, event packs and AI enhance." />
          <Txt style={{ fontFamily: font.display, fontSize: 28, color: c.ink, fontVariant: ['tabular-nums'] }}>{fmt.rupees(wallet.balance)}</Txt>
          <Txt v="small" color={c.ink3}>{fmt.rupees(wallet.prepaid)} added by you · {fmt.rupees(wallet.earnings)} from sales</Txt>
        </Card>
      ) : null}

      <Button label="Change plan or add money on the web" icon="external-link" onPress={() => Linking.openURL('https://app.frameline.in/plan')} />
      <Txt v="small" center color={c.ink3}>Invoices and GST details are in Settings on the web.</Txt>
    </Screen>
  )
}
