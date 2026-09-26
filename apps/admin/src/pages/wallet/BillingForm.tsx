import { Field, Input, Select, Textarea } from '@frameline/ui'
import { EMAIL_RE, GSTIN_RE, INDIAN_STATES, type Billing } from './lib'

export function validateBilling(b: Billing) {
  const e: Partial<Record<keyof Billing, string>> = {}
  if (!b.name.trim()) e.name = 'Enter the name to print on invoices'
  if (b.gstin && !GSTIN_RE.test(b.gstin)) e.gstin = 'GSTIN is 15 characters, e.g. 27AAKFN4521Q1Z8. Leave empty if not registered.'
  if (b.address.trim().length < 8) e.address = 'Enter the full billing address'
  if (!b.state) e.state = 'Pick the state (decides CGST + SGST or IGST)'
  if (b.email && !EMAIL_RE.test(b.email)) e.email = 'Enter a valid email, like accounts@studio.in'
  return e
}

/** Billing & GST details used on tax invoices. Shared by /wallet (modal) and /settings/billing. */
export function BillingForm({ value, onChange, showErrors }: { value: Billing; onChange: (b: Billing) => void; showErrors: boolean }) {
  const errors = showErrors ? validateBilling(value) : {}
  const set = (patch: Partial<Billing>) => onChange({ ...value, ...patch })
  return (
    <div className="flex flex-col gap-3">
      <Field label="Name on invoice" error={errors.name} htmlFor="bill-name"><Input id="bill-name" value={value.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="GSTIN (optional)" error={errors.gstin} hint="Add it to claim input tax credit" htmlFor="bill-gstin">
          <Input id="bill-gstin" className="font-mono uppercase" maxLength={15} value={value.gstin} onChange={(e) => set({ gstin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
        </Field>
        <Field label="State" error={errors.state} htmlFor="bill-state">
          <Select id="bill-state" value={value.state} onChange={(e) => set({ state: e.target.value })}>
            <option value="">Pick a state</option>
            {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Billing address" error={errors.address} htmlFor="bill-addr"><Textarea id="bill-addr" rows={3} value={value.address} onChange={(e) => set({ address: e.target.value })} /></Field>
      <Field label="Send invoices to" error={errors.email} htmlFor="bill-email"><Input id="bill-email" type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} /></Field>
    </div>
  )
}
