import { PLANS, type Plan, type Usage } from '@frameline/shared'
import { useUsage } from '../../lib/queries'
import { useLocalState } from '../wallet/lib'

export type Period = 'yearly' | 'quarterly'
export const GST_RATE = 0.18

/** Quarterly costs 25% more than a quarter of the yearly price. */
export const priceFor = (p: Plan, period: Period) => (period === 'yearly' ? p.pricePerYear : Math.round((p.pricePerYear / 4) * 2))
export const perThousand = (p: Plan) => Math.round(p.pricePerYear / (p.photos / 1000))
export const withGst = (n: number) => Math.round(n * (1 + GST_RATE) * 100) / 100

/** Base renewal price a client pays per event-year before your multiplier. */
export const BASE_RENEWAL = 1000

interface LocalPlan { planId?: Plan['id']; period?: Period; validTill?: string; multiplier?: number }

/**
 * Usage from the API with local overrides for things the mock API can't change yet
 * (plan upgrades and the renewal multiplier). Stored in localStorage key frameline.plan.
 */
export function usePlanState() {
  const q = useUsage()
  const [local, setLocal] = useLocalState<LocalPlan>('frameline.plan', {})
  const usage: Usage | undefined = q.data && {
    ...q.data,
    planId: local.planId ?? q.data.planId,
    period: local.period ?? q.data.period,
    validTill: local.validTill ?? q.data.validTill,
    renewalMultiplier: local.multiplier ?? q.data.renewalMultiplier,
    photosLimit: local.planId ? PLANS.find((p) => p.id === local.planId)!.photos : q.data.photosLimit,
  }
  const plan = PLANS.find((p) => p.id === usage?.planId) ?? PLANS[0]
  return { ...q, usage, plan, setLocal }
}
