import { useState } from 'react'
import { fmt, STORE_COMMISSION, type Price } from '@frameline/shared'
import { Button, Card, Input, Skeleton } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, usePrices } from '../../lib/queries'
import { QueryError } from '../system'

const priceError = (v: string) => {
  const n = Number(v)
  return !v || !Number.isFinite(n) ? 'Enter a price in rupees' : n < 10 ? 'At least ₹10' : n > 100000 ? 'Up to ₹1,00,000' : ''
}

/** Editable price rows: label, what guests pay, what you get. */
export function PriceRows({ prices, value, onChange }: { prices: Price[]; value: Record<string, string>; onChange: (id: string, v: string) => void }) {
  return (
    <div className="flex flex-col">
      {prices.map((p) => {
        const v = value[p.id] ?? String(p.price)
        const err = priceError(v)
        return (
          <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2.5 first:border-t-0">
            <div className="min-w-0 flex-1">
              <label htmlFor={`price-${p.id}`} className="block text-[13.5px] font-bold">{p.label}</label>
              <span className="block text-[12.5px] text-ink-3">{err ? <span className="font-semibold text-bad">{err}</span> : `${p.detail} · you get ${fmt.rupees(Math.round((Number(v) || 0) * (1 - STORE_COMMISSION)))}`}</span>
            </div>
            <Input id={`price-${p.id}`} inputMode="numeric" className="w-[120px] tnum" aria-invalid={!!err} icon={<span className="text-[13px]">₹</span>} value={v}
              onChange={(e) => onChange(p.id, e.target.value.replace(/[^\d]/g, ''))} />
          </div>
        )
      })}
    </div>
  )
}
export const pricesValid = (prices: Price[], draft: Record<string, string>) => prices.every((p) => !priceError(draft[p.id] ?? String(p.price)))
export const applyDraft = (prices: Price[], draft: Record<string, string>) => prices.map((p) => ({ ...p, price: Math.round(Number(draft[p.id] ?? p.price)) }))

/** Default prices every selling event uses (api.updatePrices). `primary` = this card holds the screen's gold button. */
export function DefaultPrices({ primary = false }: { primary?: boolean }) {
  const api = useApi()
  const prices = usePrices()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const save = useAction((next: Price[]) => api.updatePrices(next), { success: 'Prices saved · new orders use them', onSuccess: () => setDraft({}) })
  if (prices.isError) return <Card><QueryError error={prices.error} retry={() => prices.refetch()} what="your prices" /></Card>
  if (!prices.data) return <Skeleton className="h-60 rounded-card" />
  const list = prices.data
  const dirty = list.some((p) => draft[p.id] !== undefined && draft[p.id] !== String(p.price))
  const keep = Math.round((1 - STORE_COMMISSION) * 100)
  return (
    <Card className={primary ? 'flex flex-col gap-2' : 'flex max-w-[640px] flex-col gap-2'}>
      <div>
        <h2 className="font-sans text-[15px] font-extrabold">Default prices</h2>
        <p className="mt-0.5 text-[13px] text-ink-2">What guests pay, including GST. You keep {keep}%. Every event that sells uses these unless you change them for that event.</p>
      </div>
      <PriceRows prices={list} value={draft} onChange={(id, v) => setDraft((d) => ({ ...d, [id]: v }))} />
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        {dirty && <Button variant="ghost" onClick={() => setDraft({})}>Discard</Button>}
        <Button variant={primary ? 'primary' : 'secondary'} disabled={!dirty || !pricesValid(list, draft)} loading={save.isPending} onClick={() => save.mutate(applyDraft(list, draft))}>Save prices</Button>
      </div>
    </Card>
  )
}
