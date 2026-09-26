import { CheckCircle2, Download, FileSpreadsheet, Loader2 } from 'lucide-react'
import { fmt, type UsageReport as UsageReportT } from '@frameline/shared'
import { Button, Card, CardHeader, EmptyState, Meter, Skeleton } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, usePurchases, useUsage, useUsageBreakdown, useUsageReport } from '../../lib/queries'
import { QueryError } from '../system'
import { downloadFile, round2 } from '../wallet/lib'

export const downloadUsageReport = (r: UsageReportT) =>
  r.csv && downloadFile(`usage-report-${(r.readyAt ?? r.requestedAt).slice(0, 10)}.csv`, '﻿' + r.csv, 'text/csv;charset=utf-8')

/** Request / download the usage report (api.requestUsageReport + getUsageReport). */
export function useUsageReportAction() {
  const api = useApi()
  const report = useUsageReport()
  const request = useAction(() => api.requestUsageReport(), { success: 'Report requested · it’s ready in a moment' })
  return { report, request }
}

export function UsageReport({ email }: { email?: string }) {
  const usage = useUsage()
  const breakdown = useUsageBreakdown()
  const purchases = usePurchases()
  const { report, request } = useUsageReportAction()
  const r = report.data

  const byYear = Object.entries((purchases.data ?? []).reduce<Record<string, { kinds: Record<string, number>; total: number }>>((acc, p) => {
    const y = p.at.slice(0, 4)
    acc[y] ??= { kinds: {}, total: 0 }
    acc[y].kinds[p.kind] = (acc[y].kinds[p.kind] ?? 0) + 1
    acc[y].total = round2(acc[y].total + p.amount)
    return acc
  }, {})).sort((a, b) => b[0].localeCompare(a[0]))
  const events = breakdown.data?.events.filter((e) => e.counted > 0).sort((a, b) => b.counted - a.counted) ?? []
  const maxCounted = Math.max(1, ...events.map((e) => e.counted))

  return (
    <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
      <Card className="lg:col-span-2">
        <CardHeader title="Usage report" />
        {report.isError ? <QueryError error={report.error} retry={() => report.refetch()} /> : report.isLoading ? <Skeleton className="h-16" /> : (
          <div className="flex flex-wrap items-center gap-3 text-[12.5px]" aria-live="polite">
            <span className="grid size-[34px] shrink-0 place-items-center rounded-control bg-accent-soft text-accent-text">
              {r?.status === 'processing' ? <Loader2 size={16} className="animate-spin" /> : r?.status === 'ready' ? <CheckCircle2 size={16} /> : <FileSpreadsheet size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              {!r ? <>
                <div className="font-bold">Get every event with its photo count, limit and status as a spreadsheet.</div>
                <div className="text-ink-3">We prepare it in the background{email ? ` and email it to ${email}` : ''}.</div>
              </> : r.status === 'processing' ? <>
                <div className="font-bold">We’re preparing your report.</div>
                <div className="text-ink-3">Requested {fmt.fullDateTime(r.requestedAt)}. This page updates when it’s ready.</div>
              </> : <>
                <div className="font-bold text-ok">Report ready{email ? ` and emailed to ${email}` : ''}.</div>
                <div className="text-ink-3">Requested {fmt.fullDateTime(r.requestedAt)}{r.readyAt ? ` · ready ${fmt.fullDateTime(r.readyAt)}` : ''}</div>
              </>}
            </div>
            <div className="flex gap-2">
              {r?.status === 'ready' && r.csv && <Button variant="primary" size="sm" icon={<Download size={12} />} onClick={() => downloadUsageReport(r)}>Download CSV</Button>}
              <Button size="sm" variant={r ? 'ghost' : 'primary'} loading={request.isPending} disabled={r?.status === 'processing'} onClick={() => request.mutate(undefined)}>{r ? 'Request a fresh one' : 'Request report'}</Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Upload capacity this period" action={usage.data && <span className="font-mono text-[11px] text-ink-3">valid till {fmt.date(usage.data.validTill)}</span>} />
        {breakdown.isError ? <QueryError error={breakdown.error} retry={() => breakdown.refetch()} /> : !breakdown.data ? <Skeleton className="h-40" /> : <>
          <div className="flex justify-between text-[12px]"><span>Used</span><span className="font-mono tnum">{fmt.count(breakdown.data.used)} / {fmt.count(breakdown.data.limit)}</span></div>
          <Meter value={breakdown.data.used + breakdown.data.guestReserved} max={breakdown.data.limit} height={8} className="mt-1.5" />
          <div className="mt-1 text-[11.5px] text-ink-3">{fmt.count(breakdown.data.guestReserved)} reserved for guest uploads · {fmt.count(breakdown.data.available)} free</div>
          <div className="mt-3 eyebrow">By event</div>
          {!events.length ? <p className="py-2 text-[12.5px] text-ink-3">No uploads counted yet.</p> : events.slice(0, 8).map((e) => (
            <div key={e.eventId} className="flex items-center gap-3 py-1.5">
              <span className="w-36 truncate text-[12.5px] sm:w-44">{e.name}</span>
              <Meter value={e.counted} max={maxCounted} height={8} className="flex-1" />
              <span className="w-16 text-right font-mono text-[12.5px] tnum">{fmt.count(e.counted)}</span>
            </div>
          ))}
          <p className="mt-2 text-[11.5px] text-ink-3">Original-quality uploads count twice. Live from your account.</p>
        </>}
      </Card>

      <Card>
        <CardHeader title="Purchases by year" />
        {purchases.isError ? <QueryError error={purchases.error} retry={() => purchases.refetch()} /> : purchases.isLoading ? <Skeleton className="h-32" /> : !byYear.length ? (
          <EmptyState title="No purchases yet" body="Plans, packs and credits you buy show up here." className="py-8" />
        ) : byYear.map(([y, v]) => (
          <div key={y} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px]">
            <span className="font-mono">{y}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{Object.entries(v.kinds).map(([k, n]) => `${n} ${KIND[k] ?? k}${n === 1 ? '' : 's'}`).join(' + ')}</span>
            <b className="font-mono tnum">{fmt.rupees(v.total)}</b>
          </div>
        ))}
        <p className="mt-1 text-[11.5px] text-ink-3">Amounts before GST. Full list in Orders & wallet → Plan purchases.</p>
      </Card>
    </div>
  )
}

const KIND: Record<string, string> = { plan: 'plan payment', pack: 'pack', credits: 'credit top-up', renewal: 'renewal', enhance: 'AI enhance', coupon: 'coupon' }
