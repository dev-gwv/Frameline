import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, useToast } from '@frameline/ui'
import { BillingForm, validateBilling } from '../wallet/BillingForm'
import { BILLING_KEY, DEFAULT_BILLING, readLocal, writeLocal, type Billing } from '../wallet/lib'

/** Same billing details as the Orders & wallet modal (shared localStorage key frameline.billing). */
export function BillingTab() {
  const toast = useToast()
  const [saved, setSaved] = useState<Billing>(() => readLocal(BILLING_KEY, DEFAULT_BILLING))
  const [value, setValue] = useState<Billing>(saved)
  const [showErrors, setShowErrors] = useState(false)
  const dirty = JSON.stringify(saved) !== JSON.stringify(value)
  const save = () => {
    if (Object.keys(validateBilling(value)).length) { setShowErrors(true); return }
    writeLocal(BILLING_KEY, value); setSaved(value); setShowErrors(false)
    toast.success('Saved', 'New invoices use these details.')
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
          <Button variant="primary" disabled={!dirty} onClick={save}>Save changes</Button>
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
