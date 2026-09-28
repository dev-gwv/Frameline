import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileSpreadsheet, ImageIcon, Loader2, Receipt } from 'lucide-react'
import { fmt, type PhotoEvent, type UsageReport as UsageReportT } from '@frameline/shared'
import { Card, CardHeader, cn, EmptyState, Meter, Skeleton } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, usePurchases, useUsage, useUsageBreakdown, useUsageReport } from '../../lib/queries'
import { QueryError } from '../system'
import { downloadFile, round2 } from './files'
import { photosByMonth } from './stats'

export const downloadUsageReport = (r: UsageReportT) =>
  r.csv && downloadFile(`usage-report-${(r.readyAt ?? r.requestedAt).slice(0, 10)}.csv`, '﻿' + r.csv, 'text/csv;charset=utf-8')

/** Request / download the usage report (api.requestUsageReport + getUsageReport). */
export function useUsageReportAction() {
  const api = useApi()
  const report = useUsageReport()
  const request = useAction(() => api.requestUsageReport(), { success: 'Report requested. It’s ready in a moment.' })
  return { report, request }
}

/** Single-series bar chart: photos added per month. Gold bars, recessive grid, hover/focus tooltip. */
function PhotosChart({ events }: { events: PhotoEvent[] }) {
  const data = photosByMonth(events, 12)
  const max = Math.max(1, ...data.map((d) => d.photos))
  const total = data.reduce((s, d) => s + d.photos, 0)
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? data.length - 1
  if (!total) return <EmptyState className="py-8" icon={<ImageIcon size={20} />} title="No photos yet" body="Upload photos to an event and this chart fills in month by month." />
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-display text-[24px] font-semibold leading-tight tnum">{fmt.count(data[shown].photos)}</div>
          <div className="text-[13px] text-ink-2">photos added in {data[shown].long}</div>
        </div>
        <div className="text-[12.5px] text-ink-3 tnum">{fmt.count(total)} in the last 12 months</div>
      </div>
      <div className="relative h-[180px]" onMouseLeave={() => setHover(null)}>
        {[0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${f * 100}%` }} aria-hidden>
            <span className="absolute -top-2 right-0 bg-surface pl-1 text-[11px] text-ink-3 tnum">{fmt.count(Math.round(max * f))}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-line-2 pr-10">
          {data.map((d, i) => (
            <button key={d.key} type="button" className="group flex h-full flex-1 items-end justify-center outline-none"
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`${d.long}: ${fmt.count(d.photos)} photos`}>
              <span className={cn('block w-full max-w-[28px] rounded-t-[4px] bg-accent transition-opacity', hover !== null && hover !== i && 'opacity-45', 'group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent')}
                style={{ height: d.photos ? `max(3px, ${(d.photos / max) * 100}%)` : 0 }} />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px] pr-10" aria-hidden>
        {data.map((d, i) => <span key={d.key} className={cn('flex-1 text-center text-[11px] text-ink-3', i % 2 === 1 && 'max-sm:invisible')}>{d.short}</span>)}
      </div>
    </div>
  )
}

const KIND: Record<string, [string, string]> = {
  plan: ['plan payment', 'plan payments'], pack: ['event pack', 'event packs'], credits: ['wallet top-up', 'wallet top-ups'],
  renewal: ['renewal', 'renewals'], enhance: ['AI enhance', 'AI enhances'], coupon: ['code redeemed', 'codes redeemed'],
}

export function UsageReport({ events, email }: { events?: PhotoEvent[]; email?: string }) {
  const usage = useUsage()
  const breakdown = useUsageBreakdown()
  const purchases = usePurchases()
  const { report } = useUsageReportAction()
  const r = report.data

  const byYear = Object.entries((purchases.data ?? []).reduce<Record<string, { kinds: Record<string, number>; total: number }>>((acc, p) => {
    const y = p.at.slice(0, 4)
    acc[y] ??= { kinds: {}, total: 0 }
    acc[y].kinds[p.kind] = (acc[y].kinds[p.kind] ?? 0) + 1
    acc[y].total = round2(acc[y].total + p.amount)
    return acc
  }, {})).sort((a, b) => b[0].localeCompare(a[0]))
  const byEvent = breakdown.data?.events.filter((e) => e.counted > 0).sort((a, b) => b.counted - a.counted) ?? []
  const maxCounted = Math.max(1, ...byEvent.map((e) => e.counted))
  const b = breakdown.data
  const usedPct = b ? fmt.pct(b.used + b.guestReserved, b.limit) : 0

  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <Card className="lg:col-span-2">
        <CardHeader title="Photos used over time" description="Photos added each month, by event date." />
        {!events ? <Skeleton className="h-[220px]" /> : <PhotosChart events={events} />}
      </Card>

      <Card>
        <CardHeader title="Photos on your plan" description={usage.data ? `Your plan runs until ${fmt.date(usage.data.validTill)}.` : undefined} />
        {breakdown.isError ? <QueryError error={breakdown.error} retry={() => breakdown.refetch()} /> : !b ? <Skeleton className="h-40" /> : <>
          <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
            <span><b className="tnum">{fmt.count(b.used)}</b> of {fmt.count(b.limit)} photos used</span>
            <span className="text-ink-3 tnum">{usedPct}%</span>
          </div>
          <Meter value={b.used + b.guestReserved} max={b.limit} height={8} className="mt-2" tone={usedPct >= 95 ? 'bad' : usedPct >= 80 ? 'warn' : 'gold'} label="Photos used on your plan" />
          <div className="mt-1.5 text-[12.5px] text-ink-3 tnum">{fmt.count(b.guestReserved)} kept free for guest uploads · {fmt.count(b.available)} left</div>
          <div className="mb-1 mt-4 text-[13px] font-bold">By event</div>
          {!byEvent.length ? <p className="py-2 text-[13px] text-ink-3">No photos counted yet.</p> : byEvent.slice(0, 8).map((e) => (
            <div key={e.eventId} className="flex items-center gap-3 py-1.5">
              <Link to={`/events/${e.eventId}`} className="w-32 truncate text-[13px] hover:underline sm:w-44">{e.name}</Link>
              <Meter value={e.counted} max={maxCounted} height={8} className="min-w-0 flex-1" label={`${e.name}: ${fmt.count(e.counted)} photos`} />
              <span className="w-14 text-right text-[13px] tnum">{fmt.count(e.counted)}</span>
            </div>
          ))}
          <p className="mt-2 text-[12.5px] text-ink-3">Original-quality photos count twice. <Link to="/plan" className="font-bold text-accent-text hover:underline">Get more photos</Link></p>
        </>}
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader title="Purchases by year" description="What you bought from Frameline, before GST." />
          {purchases.isError ? <QueryError error={purchases.error} retry={() => purchases.refetch()} /> : purchases.isLoading ? <Skeleton className="h-32" /> : !byYear.length ? (
            <EmptyState className="py-8" icon={<Receipt size={20} />} title="No purchases yet" body="Plans, event packs and wallet top-ups show up here." />
          ) : byYear.map(([y, v]) => (
            <div key={y} className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-[13.5px] first-of-type:border-t-0">
              <b className="tnum">{y}</b>
              <span className="min-w-0 flex-1 truncate text-ink-2">{Object.entries(v.kinds).map(([k, n]) => `${n} ${(KIND[k] ?? [k, k])[n === 1 ? 0 : 1]}`).join(' · ')}</span>
              <b className="tnum">{fmt.rupees(v.total)}</b>
            </div>
          ))}
          <p className="mt-1 text-[12.5px] text-ink-3">Invoices are in <Link to="/settings/invoices" className="font-bold text-accent-text hover:underline">Settings → Invoices</Link>.</p>
        </Card>

        <Card>
          <CardHeader title="Full usage report" />
          {report.isError ? <QueryError error={report.error} retry={() => report.refetch()} /> : report.isLoading ? <Skeleton className="h-14" /> : (
            <div className="flex items-start gap-3 text-[13px]" aria-live="polite">
              <span className="grid size-[34px] shrink-0 place-items-center rounded-control bg-accent-soft text-accent-text">
                {r?.status === 'processing' ? <Loader2 size={16} className="animate-spin" /> : r?.status === 'ready' ? <CheckCircle2 size={16} /> : <FileSpreadsheet size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                {!r ? <>
                  <div className="font-bold">Every event with its photo count, limit and status, as a spreadsheet.</div>
                  <div className="text-ink-3">Use the button at the top. We also email it{email ? ` to ${email}` : ''}.</div>
                </> : r.status === 'processing' ? <>
                  <div className="font-bold">We’re preparing your report.</div>
                  <div className="text-ink-3">Requested {fmt.fullDateTime(r.requestedAt)}. This page updates when it’s ready.</div>
                </> : <>
                  <div className="font-bold text-ok">Report ready{email ? ` and emailed to ${email}` : ''}.</div>
                  <div className="text-ink-3">Requested {fmt.fullDateTime(r.requestedAt)}{r.readyAt ? ` · ready ${fmt.fullDateTime(r.readyAt)}` : ''}</div>
                </>}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
