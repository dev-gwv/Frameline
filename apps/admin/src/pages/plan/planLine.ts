import { fmt, type Usage } from '@frameline/shared'

/**
 * "Free trial till 12 Oct 2026", or for a trial past its date "Free trial ended 12 Oct 2026". While payments are off
 * (server switch) a lapsed trial isn't enforced and nothing can be bought, so the trial has no end date to show.
 */
export function trialLine(u: Pick<Usage, 'validTill'>, payments: boolean) {
  if (!payments) return 'Free trial'
  return Date.parse(u.validTill) < Date.now() ? `Free trial ended ${fmt.date(u.validTill)}` : `Free trial till ${fmt.date(u.validTill)}`
}
