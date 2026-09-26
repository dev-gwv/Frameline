import { PERIOD_DAYS, PLANS, planPrice, type Plan, type Usage } from '@frameline/shared'
import { useUsage } from '../../lib/queries'

export type Period = 'yearly' | 'quarterly'
export const GST_RATE = 0.18

export const perThousand = (p: Plan) => Math.round(p.pricePerYear / (p.photos / 1000))
export const withGst = (n: number) => Math.round(n * (1 + GST_RATE) * 100) / 100

/** How much cheaper a year on the yearly plan is than four quarters (from `planPrice`, e.g. 50). */
export function yearlySavingPct(p: Plan = PLANS[0]) {
  const quarters = planPrice(p, 'quarterly') * 4
  return Math.round((1 - planPrice(p, 'yearly') / quarters) * 100)
}

/**
 * Estimate of what changePlan will charge, using the same rule as the API: the unused part of the
 * current period is credited against the new plan's price. The API's response is the final word.
 */
export function planChangeQuote(usage: Usage, target: Plan, period: Period, now = Date.now()) {
  const current = PLANS.find((p) => p.id === usage.planId) ?? PLANS[0]
  const remainingDays = Math.max(0, (Date.parse(usage.validTill) - now) / 86_400_000)
  const credit = Math.round(planPrice(current, usage.period) * Math.min(1, remainingDays / PERIOD_DAYS[usage.period]))
  const price = planPrice(target, period)
  const charged = Math.max(0, price - credit)
  return { current, price, credit, charged, wasted: Math.max(0, credit - price), validTill: new Date(now + PERIOD_DAYS[period] * 86_400_000).toISOString(), remainingDays: Math.floor(remainingDays) }
}

/** Usage from the API plus the matching plan. */
export function usePlanState() {
  const q = useUsage()
  const usage = q.data
  const plan = PLANS.find((p) => p.id === usage?.planId) ?? PLANS[0]
  return { ...q, usage, plan }
}
