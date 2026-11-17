import { useState } from 'react'
import { fmt, PLANS, planPrice, type Plan as PlanT, type PlanChange } from '@frameline/shared'
import { Button, Card, Chip, cn, Meter, Page, Segmented, Skeleton } from '@frameline/ui'
import { useServerFeatures } from '../../lib/api'
import { useWalletBalance } from '../../lib/queries'
import { trialLine } from './planLine'
import { useParamState } from '../../lib/url'
import { useAuth } from '../../lib/auth'
import { QueryError } from '../system'
import { CheckoutModal, PackModal, PaidModal } from './Checkout'
import { AddMoneyModal, CapacityModal, RedeemModal, RenewalPriceModal } from './PlanModals'
import { RenewModal } from './RenewModal'
import { usePlanState, yearlySavingPct, type Period } from './usePlanState'
import { useTalkToUs } from './talkToUs'
import { MessageCircle } from 'lucide-react'

const SAVING = yearlySavingPct()
/**
 * The Studio AutoPilot cover card (Drive gallery photos in the plan) stays hidden from studios until the owner decides
 * what they see (17 Nov). The cover still counts imports; turn this on to show the card again.
 */
const SHOW_SA_COVER = false
const lakh = (n: number) => (n >= 100_000 ? `${fmt.count(n / 100_000)} lakh` : fmt.count(n))

/**
 * /plan "Plan and billing": photos used, wallet, plans. Deep links: ?renew=<eventId>[&faces=1] opens Renew,
 * ?add=1 Add money, ?redeem=1 Redeem a code, ?pack=1 event pack.
 */
export default function Plan() {
  const { usage, plan, isLoading, isError, error, refetch } = usePlanState()
  const { user } = useAuth()
  const wallet = useWalletBalance(!user || user.role === 'owner')
  const [params, set] = useParamState()
  const [period, setPeriod] = useState<Period>('yearly')
  const [modal, setModal] = useState<'capacity' | 'renewal-price' | null>(null)
  const [upgrade, setUpgrade] = useState<PlanT | null>(null)
  const [paid, setPaid] = useState<{ r: PlanChange; plan: PlanT } | null>(null)
  const { payments } = useServerFeatures()
  // Buying is a conversation with the team (talkToUs.ts); checkout and packs stay for their deep links.
  const talk = useTalkToUs()

  if (isError) return <Page title="Plan and billing"><QueryError error={error} retry={() => refetch()} what="your plan" /></Page>

  // Nothing renews by itself (no saved card), so a paid plan says "valid till"; the trial says it is one.
  const subtitle = !usage ? ' ' : usage.trial
    ? `${trialLine(usage, payments)} · ${fmt.count(usage.photosLimit)} photos`
    : `${plan.name} · ${fmt.count(plan.photos)} photos a ${usage.period === 'yearly' ? 'year' : 'quarter'} · valid till ${fmt.date(usage.validTill)}`
  const flag = (k: string) => params.get(k) === '1'
  const renewId = params.get('renew')

  return (
    <Page title="Plan and billing" subtitle={subtitle}
      actions={<Segmented value={period} onChange={setPeriod} options={[{ value: 'yearly', label: SAVING > 0 ? `Yearly · save ${SAVING}%` : 'Yearly' }, { value: 'quarterly', label: 'Quarterly' }]} />}>
      {isLoading || !usage ? <Skeleton className="mb-4 h-[110px] rounded-card" /> : (
        <Card className="mb-4 grid items-center gap-5 md:grid-cols-[1.2fr_1fr_auto] md:gap-6">
          <div>
            <b className="block text-[15px]">Photos used</b>
            <Meter value={usage.photosUsed} max={usage.photosLimit} className="my-2" label="Photos used" tone={usage.photosUsed / usage.photosLimit > 0.9 ? 'warn' : 'gold'} />
            <div className="text-[13px] text-ink-2 tnum">{fmt.count(usage.photosUsed)} of {fmt.count(usage.photosLimit)} · <button type="button" className="font-bold text-accent-text hover:underline" onClick={() => setModal('capacity')}>How photos are counted</button></div>
          </div>
          <div>
            <b className="block text-[15px]">Wallet</b>
            <div className="font-display text-[24px] font-semibold tnum">{wallet.data ? fmt.rupees(Math.round(wallet.data.balance)) : wallet.isError ? '—' : <Skeleton className="h-7 w-28" />}</div>
            {wallet.data && wallet.data.earnings > 0 && <div className="text-[12.5px] text-ink-3">{fmt.rupees(Math.round(wallet.data.prepaid))} added · {fmt.rupees(Math.round(wallet.data.earnings))} from sales</div>}
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button icon={<MessageCircle size={14} />} className="bg-[#1fa855] text-white hover:bg-[#178a45]" onClick={() => talk('to add money to my wallet')}>WhatsApp us</Button>
            <Button variant="ghost" onClick={() => set({ redeem: '1' })}>Redeem a code</Button>
          </div>
        </Card>
      )}

      {SHOW_SA_COVER && usage?.saCover && (
        <Card className="mb-4 grid items-center gap-4 border-[1.5px] border-accent md:grid-cols-[1.2fr_auto]">
          <div>
            <b className="block text-[15px]">Google Drive galleries · included in your Studio AutoPilot {usage.saCover.plan} plan</b>
            <Meter value={usage.saCover.used} max={Math.max(1, usage.saCover.photos)} className="my-2" label="Drive gallery photos" tone={usage.saCover.used / Math.max(1, usage.saCover.photos) > 0.9 ? 'warn' : 'gold'} />
            <div className="text-[13px] text-ink-2 tnum">
              {usage.saCover.active
                ? `${fmt.count(usage.saCover.used)} of ${fmt.count(usage.saCover.photos)} photos kept · until ${fmt.date(usage.saCover.until)} · imports from Google Drive count here, not in Photos used`
                : `Your Studio AutoPilot plan ended on ${fmt.date(usage.saCover.until)}. Galleries stay open; renew it to import from Google Drive again.`}
            </div>
          </div>
          <div className="flex md:justify-end">
            <Button variant="secondary" icon={<MessageCircle size={14} />} onClick={() => talk(`more Google Drive gallery photos on my Studio AutoPilot ${usage.saCover!.plan} plan`)}>Ask for more photos</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => {
          const current = !!usage && p.id === plan.id && period === usage.period
          const popular = p.id === 'pro'
          const lower = p.pricePerYear < plan.pricePerYear
          return (
            <Card key={p.id} className={cn('flex flex-col gap-2', popular && 'border-[1.5px] border-accent')}>
              {popular ? <Chip tone="accent" className="self-start">Most popular</Chip> : <span className="h-5" aria-hidden />}
              <b className="text-[16px]">{p.name}</b>
              <div><span className="font-display text-[24px] font-semibold tnum">{fmt.rupees(planPrice(p, period))}</span><span className="text-ink-3"> /{period === 'yearly' ? 'year' : 'quarter'}</span></div>
              <div className="text-[13px] text-ink-2">{lakh(p.photos)} photos · {p.seats} team seats</div>
              <div className="mt-auto pt-1">
                {current ? <Button disabled className="w-full">Current plan</Button>
                  : <Button variant={popular && !lower && p.id !== plan.id ? 'primary' : 'secondary'} className="w-full" disabled={!usage} icon={<MessageCircle size={14} />}
                    onClick={() => talk(`the ${p.name} plan, paid ${period} (${fmt.rupees(planPrice(p, period))} + GST)`)}>
                    WhatsApp us
                  </Button>}
              </div>
            </Card>
          )
        })}
      </div>
      <p className="mt-3.5 text-[13.5px] text-ink-3">
        Need photos for one event only? <button type="button" className="font-bold text-accent-text hover:underline" onClick={() => talk('an event photo pack')}>Ask us on WhatsApp for an event pack</button>
        {' · '}<button type="button" className="font-bold text-accent-text hover:underline" onClick={() => setModal('renewal-price')}>What clients pay to renew</button>
        {' · '}Prices exclude GST.
      </p>

      <CapacityModal open={modal === 'capacity'} onOpenChange={(v) => !v && setModal(null)} />
      <AddMoneyModal open={flag('add')} onOpenChange={(v) => set({ add: v ? '1' : undefined })} />
      <RedeemModal open={flag('redeem')} onOpenChange={(v) => set({ redeem: v ? '1' : undefined })} />
      <PackModal open={flag('pack')} onOpenChange={(v) => set({ pack: v ? '1' : undefined })} wallet={wallet.data?.balance} />
      {usage && <>
        <RenewalPriceModal open={modal === 'renewal-price'} onOpenChange={(v) => !v && setModal(null)} value={usage.renewalMultiplier} />
        <CheckoutModal target={upgrade} period={period} usage={usage} wallet={wallet.data?.balance} onClose={() => setUpgrade(null)}
          onPaid={(r, p) => { setUpgrade(null); setPaid({ r, plan: p }) }} />
      </>}
      <PaidModal result={paid?.r ?? null} plan={paid?.plan ?? null} onClose={() => setPaid(null)} />
      <RenewModal eventId={renewId} faces={flag('faces')} onClose={() => set({ renew: undefined, faces: undefined, pay: undefined })} />
    </Page>
  )
}
