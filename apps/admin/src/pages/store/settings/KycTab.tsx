import { useRef, useState } from 'react'
import { Download, FileText, Upload } from 'lucide-react'
import { Button, Card, Chip, Field, Input, Segmented, Select, useToast } from '@frameline/ui'
import { downloadFile, INDIAN_STATES } from '../../wallet/lib'
import { assetAccept, assetErrorMessage, assetProblem } from '../../wallet/assets'
import { useApi } from '../../../lib/api'
import type { DocId, DocStatus, TabProps } from './model'

const DOCS: { id: DocId; label: string; hint: string }[] = [
  { id: 'pan', label: 'PAN card', hint: 'Business or proprietor PAN' },
  { id: 'id', label: 'ID card', hint: 'Aadhaar, passport or driving licence' },
  { id: 'gst', label: 'GST certificate', hint: 'Or the signed declaration letter if not registered' },
  { id: 'cheque', label: 'Cancelled cheque', hint: 'Must show the account holder name' },
]
const STATUS: Record<DocStatus, { label: string; tone: 'ok' | 'accent' | 'warn' }> = {
  verified: { label: 'Verified', tone: 'ok' }, review: { label: 'In review', tone: 'accent' }, needed: { label: 'Needed', tone: 'warn' },
}

function declarationLetter(name: string, pan: string, address: string) {
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  return `GST NON-REGISTRATION DECLARATION

Date: ${today}

To,
Frameline Technologies Pvt. Ltd.

Subject: Declaration that we are not registered under the Goods and Services Tax Act, 2017

I/We, ${name || '[Legal entity name]'}, holding PAN ${pan || '[PAN]'}, with our place of business at
${address || '[Business address]'},
hereby declare that:

1. We are not registered under the GST Act, 2017, as our aggregate turnover in the financial year
   is below the threshold limit for registration.
2. We will inform Frameline within 7 days if we register under GST, and share our GSTIN.
3. Frameline will not be responsible for any GST liability arising from our non-registration.

This declaration is true and correct to the best of my/our knowledge.

Signature: ______________________
Name of authorised signatory: ______________________
Designation: ______________________
Place: ______________________

(Print, sign, scan and upload this letter as your "GST certificate" document.)
`
}

export function KycTab({ data, set, errors }: TabProps) {
  const k = data.kyc
  const toast = useToast()
  const api = useApi()
  const [uploading, setUploading] = useState<DocId | null>(null)
  const inputs = useRef<Partial<Record<DocId, HTMLInputElement | null>>>({})
  const [docError, setDocError] = useState<Partial<Record<DocId, string>>>({})
  // The file goes to private storage with api.uploadAsset('kyc-document'); saving sends its assetId for review.
  const onFile = async (id: DocId, f?: File) => {
    if (!f) return
    const problem = assetProblem('kyc-document', f)
    if (problem) { setDocError((e) => ({ ...e, [id]: problem })); return }
    setDocError((e) => ({ ...e, [id]: undefined }))
    setUploading(id)
    try {
      const asset = await api.uploadAsset('kyc-document', { filename: f.name, blob: f, contentType: f.type, size: f.size })
      set('kyc', { docs: { ...k.docs, [id]: { file: asset.fileName || f.name, status: 'review', assetId: asset.id } } })
      toast.success('Document uploaded', `Save changes to send ${f.name} for review. We usually check within 1 working day.`)
    } catch (err) {
      setDocError((e) => ({ ...e, [id]: assetErrorMessage('kyc-document', err) }))
    } finally { setUploading(null) }
  }
  const address = [k.street, k.city, k.state, k.postal].filter(Boolean).join(', ')

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <Card className="flex flex-col gap-3.5">
        <h3 className="font-display text-[15px] font-semibold">Business details</h3>
        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <Field label="Legal entity name" error={errors['kyc.legalName']} htmlFor="kyc-name">
            <Input id="kyc-name" value={k.legalName} onChange={(e) => set('kyc', { legalName: e.target.value })} />
          </Field>
          <Field label="PAN" error={errors['kyc.pan']} htmlFor="kyc-pan">
            <Input id="kyc-pan" className="font-mono uppercase" maxLength={10} value={k.pan} onChange={(e) => set('kyc', { pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-bold">Registered under GST?</span>
          <Segmented value={k.gst} onChange={(v) => set('kyc', { gst: v })} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        </div>
        {k.gst === 'yes' ? (
          <Field label="GSTIN" error={errors['kyc.gstin']} hint="15 characters. We add it to every invoice." htmlFor="kyc-gstin">
            <Input id="kyc-gstin" className="font-mono uppercase" maxLength={15} value={k.gstin}
              suffix={!errors['kyc.gstin'] && k.gstin.length === 15 ? <Chip tone="ok">Valid format</Chip> : undefined}
              onChange={(e) => set('kyc', { gstin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
          </Field>
        ) : (
          <div className="rounded-control border border-dashed border-line-2 bg-sunk p-3 text-[12.5px] text-ink-2">
            Not registered? Download the declaration letter, sign it, and upload it as your GST document below.
            <div className="mt-2"><Button size="sm" icon={<Download size={13} />} onClick={() => downloadFile('gst-declaration-letter.txt', declarationLetter(k.legalName, k.pan, address))}>Download declaration letter template</Button></div>
          </div>
        )}

        <h3 className="mt-2 font-display text-[15px] font-semibold">Business address</h3>
        <Field label="Street" error={errors['kyc.street']} htmlFor="kyc-street">
          <Input id="kyc-street" value={k.street} onChange={(e) => set('kyc', { street: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City" error={errors['kyc.city']} htmlFor="kyc-city"><Input id="kyc-city" value={k.city} onChange={(e) => set('kyc', { city: e.target.value })} /></Field>
          <Field label="State" error={errors['kyc.state']} htmlFor="kyc-state">
            <Select id="kyc-state" value={k.state} onChange={(e) => set('kyc', { state: e.target.value })}>
              <option value="">Pick a state</option>
              {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Postal code" error={errors['kyc.postal']} htmlFor="kyc-pin">
            <Input id="kyc-pin" className="font-mono" inputMode="numeric" maxLength={6} value={k.postal} onChange={(e) => set('kyc', { postal: e.target.value.replace(/\D/g, '') })} />
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="font-display text-[15px] font-semibold">Documents</h3>
        <p className="mb-2 text-[12px] text-ink-3">Stored privately. Only our KYC team sees them.</p>
        {DOCS.map((d) => {
          const doc = k.docs[d.id]
          const st = STATUS[doc.status]
          return (
            <div key={d.id} className="border-t border-line py-2.5">
              <div className="flex items-center gap-3">
                <span className="grid size-[30px] shrink-0 place-items-center rounded-control bg-accent-soft text-accent-text"><FileText size={14} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold">{d.label}</div>
                  <div className="truncate font-mono text-[11px] text-ink-3">{doc.file || d.hint}</div>
                </div>
                <Chip tone={st.tone}>{st.label}</Chip>
                <Button size="sm" icon={<Upload size={12} />} loading={uploading === d.id} onClick={() => inputs.current[d.id]?.click()} aria-label={`Upload ${d.label}`}>{doc.file ? 'Replace' : 'Upload'}</Button>
                <input ref={(el) => { inputs.current[d.id] = el }} type="file" hidden accept={assetAccept('kyc-document')}
                  onChange={(e) => { void onFile(d.id, e.target.files?.[0]); e.target.value = '' }} />
              </div>
              {docError[d.id] && <div className="mt-1 pl-[42px] text-[11.5px] font-semibold text-bad">{docError[d.id]}</div>}
            </div>
          )
        })}
        <p className="mt-2 text-[11.5px] text-ink-3">PDF, JPG or PNG · up to 10 MB each. Not registered for GST? Pick “No” above for a declaration letter template.</p>
      </Card>
    </div>
  )
}
