import { RotateCcw } from 'lucide-react'
import { Button, Card, Field, Textarea } from '@frameline/ui'
import { DEFAULT_STORE_TERMS as DEFAULT_TERMS } from '@frameline/shared'
import type { Errors } from './model'

export function TermsTab({ terms, setTerms, errors }: { terms: string; setTerms: (v: string) => void; errors: Errors }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-sans text-[15px] font-extrabold">Terms for buyers</h3>
          <p className="text-[12px] text-ink-3">Buyers accept these at checkout. Plain words work best.</p>
        </div>
        <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} disabled={terms === DEFAULT_TERMS} onClick={() => setTerms(DEFAULT_TERMS)}>Reset to default</Button>
      </div>
      <Field error={errors['terms.terms']} hint={`${terms.length.toLocaleString('en-IN')} characters`}>
        <Textarea aria-label="Photo-selling terms" value={terms} onChange={(e) => setTerms(e.target.value)} className="min-h-[380px] font-sans text-[13px]" />
      </Field>
    </Card>
  )
}
