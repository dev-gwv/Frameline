import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Skeleton } from '@frameline/ui'
import { QueryError } from '../system'
import type { Billing } from '../wallet/lib'
import { BillingForm, validateBilling } from './BillingForm'
import { useBilling } from './billing'
import { SectionTitle } from './SideList'

/** Billing and GST details printed on Frameline's invoices (Studio.billing). */
export function BillingTab() {
  const b = useBilling()
  if (b.isError) return <QueryError error={b.error} retry={() => b.refetch()} what="your billing details" />
  if (!b.billing) return <Skeleton className="h-[360px] rounded-card" />
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
    <div>
      <SectionTitle title="Billing and GST" description={<>Printed on tax invoices for plans, packs and money added. Find them under <Link to="/settings/invoices" className="font-bold text-accent-text hover:underline">Invoices</Link>.</>} />
      <Card className="flex max-w-[640px] flex-col gap-3">
        <BillingForm value={value} onChange={setValue} showErrors={showErrors} />
        <p className="text-[12.5px] text-ink-3">Addresses in Maharashtra get CGST + SGST; other states get IGST.</p>
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          {dirty && <Button variant="ghost" onClick={() => { setValue(saved); setShowErrors(false) }}>Discard</Button>}
          <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={submit}>Save changes</Button>
        </div>
      </Card>
    </div>
  )
}
