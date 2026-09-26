import { useState } from 'react'
import { CheckCircle2, Mail, RefreshCw } from 'lucide-react'
import { fmt, type Usage } from '@frameline/shared'
import { Button, Card, CardHeader, Meter, Skeleton } from '@frameline/ui'
import { round2, useLocalState } from '../wallet/lib'
import { usePurchases } from '../wallet/purchases'

/** Earlier years come from the usage archive; the current year is live from the API. */
const PAST_UPLOADS: [string, number][] = [['2024', 18210], ['2025', 41880]]

interface ReportState { requestedAt: string; status: 'preparing' | 'ready'; readyAt?: string }

export function uploadsByYear(usage?: Usage): [string, number][] {
  return [...PAST_UPLOADS, ['2026', usage?.photosUsed ?? 0]]
}

export function UsageReport({ usage, loading, email }: { usage?: Usage; loading: boolean; email?: string }) {
  const years = uploadsByYear(usage)
  const max = Math.max(...years.map((y) => y[1]))
  const total = years.reduce((s, y) => s + y[1], 0)
  const { purchases } = usePurchases()
  const byYear = Object.entries(purchases.reduce<Record<string, { items: string[]; total: number }>>((acc, p) => {
    const y = p.at.slice(0, 4)
    acc[y] ??= { items: [], total: 0 }
    acc[y].items.push(p.item.split(' · ')[0])
    acc[y].total = round2(acc[y].total + p.amount)
    return acc
  }, {})).sort((a, b) => b[0].localeCompare(a[0]))

  const [report, setReport] = useLocalState<ReportState | null>('frameline.usageReport', null)
  const [checking, setChecking] = useState(false)
  const refresh = () => {
    setChecking(true)
    setTimeout(() => { setChecking(false); setReport((r) => r && { ...r, status: 'ready', readyAt: new Date().toISOString() }) }, 1400)
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader title="Photo uploads by year" action={<span className="font-mono text-[11px] text-ink-3">estimated {fmt.count(total)} total</span>} />
        {loading ? <Skeleton className="h-24" /> : years.map(([y, n]) => (
          <div key={y} className="flex items-center gap-3 py-1.5">
            <span className="w-10 font-mono text-[12.5px]">{y}</span>
            <Meter value={n} max={max} height={10} className="flex-1" />
            <span className="w-16 text-right font-mono text-[12.5px] tnum">{fmt.count(n)}</span>
          </div>
        ))}
        <p className="mt-2 text-[11.5px] text-ink-3">Original-quality uploads count twice. {years[2][0]} is live and updates as you upload.</p>
      </Card>
      <Card>
        <CardHeader title="Purchases by year" action={!report && <Button size="sm" onClick={() => setReport({ requestedAt: new Date().toISOString(), status: 'preparing' })}>Request fresh report</Button>} />
        {byYear.map(([y, v]) => (
          <div key={y} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px]">
            <span className="font-mono">{y}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{summarise(v.items)}</span>
            <b className="font-mono tnum">{fmt.rupees(v.total)}</b>
          </div>
        ))}
        {report && (
          <div className="mt-3 rounded-control border border-line bg-sunk p-3 text-[12.5px]" aria-live="polite">
            {report.status === 'preparing' ? (
              <>
                <div className="flex items-center gap-2 font-bold"><Mail size={14} className="text-accent-text" /> We’re preparing your report. We’ll email you when it’s ready.</div>
                <div className="mt-0.5 text-ink-3">Requested {fmt.fullDateTime(report.requestedAt)}{email ? ` · goes to ${email}` : ''}</div>
                <Button size="sm" className="mt-2" loading={checking} icon={!checking && <RefreshCw size={12} />} onClick={refresh}>Refresh status</Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 font-bold text-ok"><CheckCircle2 size={14} /> Report ready and emailed{email ? ` to ${email}` : ''}.</div>
                <div className="mt-0.5 text-ink-3">Requested {fmt.fullDateTime(report.requestedAt)} · ready {fmt.fullDateTime(report.readyAt!)}</div>
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => setReport({ requestedAt: new Date().toISOString(), status: 'preparing' })}>Request another</Button>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

function summarise(items: string[]) {
  const counts = new Map<string, number>()
  for (const it of items) {
    const key = it.includes('pack') ? 'pack' : it
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([k, n]) => (k === 'pack' ? `${n} ${n === 1 ? 'pack' : 'packs'}` : n > 1 ? `${k} ×${n}` : k)).join(' + ')
}
