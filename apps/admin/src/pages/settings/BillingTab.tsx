import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Skeleton } from '@frameline/ui'
import { QueryError } from '../system'
import { BillingForm, validateBilling } from '../wallet/BillingForm'
import { useBilling } from '../wallet/billing'
import type { Billing } from '../wallet/lib'

/** Billing & GST details on the Studio (same data as the Orders & wallet modal). */
export function BillingTab() {
  const b = useBilling()
  if (b.isError) return <QueryError error={b.error} retry={() => b.refetch()} />
  if (!b.billing) return <Skeleton className="h-[360px]" />
  return <BillingEditor saved={b.billing} save={b.save} />
}

function BillingEditor({ saved, save }: { saved: Billing; save: ReturnType<typeof useBilling>['save'] }) {
  const [value, setValue] = useState<Billing>(saved)
  const [showErrors, setShowErrors] = useState(false)
  const savedJson = JSON.stringify(saved)
  useEffect(() => { setValue(JSON.parse(savedJson) as Billing) }, [savedJson])
  const dirty = savedJson !== JSON.stringify(value)
  const submit = () => {
    if (Object.keys(validateBilling(value)).length) { setShowErrors(true); return }
    save.mutate(value, { onSuccess: () => setShowErrors(false) })
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] [&>*]:min-w-0">
      <Card className="flex flex-col gap-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold">Billing & GST</h3>
          <p className="text-[12px] text-ink-3">Printed on tax invoices for plans, packs, credits and commission.</p>
        </div>
        <BillingForm value={value} onChange={setValue} showErrors={showErrors} />
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="ghost" onClick={() => { setValue(saved); setShowErrors(false) }}>Discard</Button>}
          <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={submit}>Save changes</Button>
        </div>
      </Card>
      <Card className="self-start text-[12.5px] text-ink-2">
        <div className="mb-1 font-bold text-ink">Where to find invoices</div>
        Every purchase has a tax invoice under <Link to="/wallet?tab=invoices" className="font-bold text-accent-text hover:underline">Orders & wallet → Invoices</Link>.
        {' '}Maharashtra addresses get CGST + SGST; other states get IGST.
      </Card>
    </div>
  )
}
