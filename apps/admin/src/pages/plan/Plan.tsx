import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { fmt, PACKS, PLANS, type Plan as PlanT } from '@frameline/shared'
import { Button, Card, Chip, cn, Meter, PageHeader, Segmented, Skeleton, useToast } from '@frameline/ui'
import { QueryError } from '../system'
import { td } from '../wallet/lib'
import { PackModal, UpgradeModal } from './Checkout'
import { AddCreditsModal, CapacityModal, MultiplierModal, RedeemModal } from './PlanModals'
import { RenewalCard } from './RenewalCard'
import { perThousand, priceFor, usePlanState, type Period } from './usePlanState'

const FAQS: [string, string][] = [
  ['How do photo limits work?', 'Your plan gives a yearly pool of photo slots shared by all events. One upload uses one slot (two for original quality). Each event also has its own limit you can raise with an event pack.'],
  ['When do credits reset?', 'Wallet credits never expire and don’t reset. Photo slots reset when your plan renews each year (or quarter).'],
  ['What happens after an event expires?', 'Guests see a “gallery expired” page, but nothing is deleted for 7 days. During that grace period you or your client can renew and everything comes back instantly. After 7 days photos are removed.'],
  ['Can I upgrade in the middle of my plan?', 'Yes. You pay only the difference for the days left, and your renewal date stays the same.'],
  ['Yearly or quarterly?', 'Quarterly costs 25% more per quarter than a quarter of the yearly price. Yearly works out cheapest if you shoot all year round.'],
  ['Do guest uploads count?', 'Yes. Each event’s guest-upload limit is reserved from your pool so guests never hit a wall mid-event. Lower the limit in event settings to free slots.'],
]

export default function Plan() {
  const toast = useToast()
  const { usage, plan, isLoading, isError, error, refetch, setLocal } = usePlanState()
  const [period, setPeriod] = useState<Period>('yearly')
  const [modal, setModal] = useState<'capacity' | 'credits' | 'redeem' | 'multiplier' | null>(null)
  const [upgrade, setUpgrade] = useState<PlanT | null>(null)
  const [pack, setPack] = useState<(typeof PACKS)[number] | null>(null)
  const close = () => setModal(null)

  if (isError) return <div className="p-6"><QueryError error={error} retry={() => refetch()} /></div>

  return (
    <div className="pb-10">
      <PageHeader title="Plan & usage" subtitle="Capacity, credits and renewals in one place."
        actions={<Segmented value={period} onChange={setPeriod} options={[{ value: 'yearly', label: <>Yearly <span className="text-ok">· save 50%</span></> }, { value: 'quarterly', label: 'Quarterly' }]} />} />
      <div className="flex flex-col gap-3 px-4 sm:px-7">
        {isLoading || !usage ? <Skeleton className="h-[110px]" /> : (
          <Card className="grid items-center gap-5 sm:grid-cols-2 xl:grid-cols-[1.2fr_1.3fr_1fr_1fr]">
            <div>
              <div className="eyebrow">Current plan</div>
              <div className="font-display text-[23px] font-semibold">{plan.name} · {usage.period}</div>
              <div className="text-[12.5px] text-ink-2">Valid till {fmt.date(usage.validTill)} · {fmt.rupees(priceFor(plan, usage.period))} + GST</div>
            </div>
            <div>
              <div className="flex justify-between text-[12px]"><span>Upload capacity</span><span className="font-mono tnum">{fmt.count(usage.photosUsed)} / {fmt.count(usage.photosLimit)}</span></div>
              <Meter value={usage.photosUsed} max={usage.photosLimit} className="mt-1.5" />
              <div className="mt-1 text-[11px] text-ink-3">{fmt.count(usage.guestReserved)} reserved for guest uploads · <button type="button" className="underline hover:text-ink" onClick={() => setModal('capacity')}>how this is calculated</button></div>
            </div>
            <div>
              <div className="flex justify-between text-[12px]"><span>Wallet credits</span><b className="font-mono tnum">{fmt.rupees(usage.walletCredits)}</b></div>
              <div className="mt-1.5 flex gap-1.5"><Button size="sm" onClick={() => setModal('credits')}>Add credits</Button><Button size="sm" variant="ghost" onClick={() => setModal('redeem')}>Redeem code</Button></div>
            </div>
            <div>
              <div className="eyebrow">Client renewals</div>
              <div className="mt-0.5 text-[12.5px]">You charge <b className="font-mono">{usage.renewalMultiplier.toFixed(1)}×</b> the base renewal price. <button type="button" className="underline hover:text-ink-2" onClick={() => setModal('multiplier')}>Change</button></div>
            </div>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => {
            const current = usage && p.id === plan.id && period === usage.period
            const popular = p.id === 'pro'
            const lower = p.pricePerYear < plan.pricePerYear
            return (
              <div key={p.id} className={cn('flex flex-col gap-1.5 rounded-card border bg-surface p-4', popular ? 'border-accent bg-gradient-to-b from-accent-soft to-surface to-45% border-[1.5px]' : 'border-line')}>
                {popular ? <Chip tone="accent" className="self-start">Most chosen</Chip> : p.id === plan.id ? <Chip className="self-start">Your plan</Chip> : <span className="h-[19px]" />}
                <div className="font-display text-[19px] font-semibold">{p.name}</div>
                <div><b className="font-mono text-[22px] tnum">{fmt.rupees(priceFor(p, period))}</b><span className="text-[12px] text-ink-3"> /{period === 'yearly' ? 'year' : 'quarter'} + GST</span></div>
                <div className="text-[12px] text-ink-2">{fmt.count(p.photos / 1000)}k photos · {p.seats} seats · {fmt.rupees(perThousand(p))} per 1,000</div>
                {period === 'quarterly' && <div className="text-[11.5px] text-ink-3">{fmt.rupees(priceFor(p, 'quarterly') * 4)} a year billed quarterly</div>}
                {current ? <Button disabled className="mt-1 justify-center">Current</Button>
                  : lower ? <Button className="mt-1 justify-center" onClick={() => toast.toast({ kind: 'info', title: `Switch to ${p.name} at renewal`, body: `Downgrades take effect on ${usage ? fmt.date(usage.validTill) : 'your renewal date'} so you keep what you paid for. Contact support to schedule it.` })}>Downgrade</Button>
                  : <Button variant={popular ? 'primary' : 'secondary'} className="mt-1 justify-center" disabled={!usage} onClick={() => setUpgrade(p)}>{p.id === plan.id ? `Switch to ${period}` : 'Upgrade'}</Button>}
              </div>
            )
          })}
        </div>
        <p className="text-[12px] text-ink-3">Need more than 5 lakh photos or 10 seats? <a className="font-bold text-accent-text hover:underline" href="mailto:sales@frameline.in">Talk to sales</a> for Enterprise.</p>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] [&>*]:min-w-0">
          <Card padded={false}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-1 pt-4">
              <h3 className="font-display text-[15px] font-semibold">One-off event packs</h3>
              <span className="text-[12px] text-ink-3">For one event beyond your plan · 12 months</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-[13px] tnum">
                <tbody>
                  {PACKS.map((pk) => (
                    <tr key={pk.photos}>
                      <td className={td}>{fmt.count(pk.photos)} photos</td>
                      <td className={`${td} text-right font-mono`}>{fmt.rupees(pk.price)}</td>
                      <td className={`${td} text-right font-mono text-ink-3`}>{fmt.rupees(Math.round(pk.price / (pk.photos / 1000)))} / 1k</td>
                      <td className={`${td} text-right`}><Button size="sm" disabled={!usage} onClick={() => setPack(pk)}>Buy</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2.5 text-[12px] text-ink-3">Paid from wallet credits when you have enough, otherwise by UPI or card.</p>
          </Card>
          {usage ? <RenewalCard multiplier={usage.renewalMultiplier} credits={usage.walletCredits} /> : <Skeleton className="h-48" />}
        </div>

        <Card>
          <h3 className="mb-1 font-display text-[15px] font-semibold">Questions</h3>
          {FAQS.map(([q, a]) => (
            <details key={q} className="group border-t border-line py-2.5 first-of-type:border-t-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-bold [&::-webkit-details-marker]:hidden">
                {q}<ChevronDown size={15} className="shrink-0 text-ink-3 transition group-open:rotate-180" />
              </summary>
              <p className="mt-1.5 text-[13px] text-ink-2">{a}</p>
            </details>
          ))}
        </Card>
      </div>

      {usage && <>
        <CapacityModal open={modal === 'capacity'} onOpenChange={(v) => !v && close()} usage={usage} />
        <AddCreditsModal open={modal === 'credits'} onOpenChange={(v) => !v && close()} />
        <RedeemModal open={modal === 'redeem'} onOpenChange={(v) => !v && close()} />
        <MultiplierModal open={modal === 'multiplier'} onOpenChange={(v) => !v && close()} value={usage.renewalMultiplier} onSave={(m) => setLocal((l) => ({ ...l, multiplier: m }))} />
        <UpgradeModal target={upgrade} period={period} usage={usage} current={plan} onClose={() => setUpgrade(null)}
          onDone={(planId, per, validTill) => setLocal((l) => ({ ...l, planId, period: per, validTill }))} />
        <PackModal pack={pack} credits={usage.walletCredits} onClose={() => setPack(null)} />
      </>}
    </div>
  )
}
