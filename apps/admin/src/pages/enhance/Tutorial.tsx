import { useState } from 'react'
import { ChevronDown, HelpCircle } from 'lucide-react'
import { Card, cn, StepBadge } from '@frameline/ui'
import { COST } from './presets'

const STEPS = [
  ['Pick a photo', 'Open any photo and choose the wand, or pick one below.'],
  ['Choose a look', 'Tap a preset or describe the edit in your own words. Drag the divider to compare.'],
  ['Save', `Each save costs ${COST} credits from your wallet. Keep the original or replace it.`],
] as const

export function Tutorial({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left text-[13px] font-bold">
        <HelpCircle size={15} className="text-accent-text" /> How AI enhance works
        <ChevronDown size={15} className={cn('ml-auto text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ol className="mt-3 flex flex-col gap-2.5">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="flex gap-2.5">
              <StepBadge n={i + 1} />
              <div><div className="text-[13px] font-bold">{t}</div><div className="text-[12px] text-ink-2">{d}</div></div>
            </li>
          ))}
          <li className="text-[11.5px] text-ink-3">Edits run on a copy. Your original file is never changed unless you choose Replace.</li>
        </ol>
      )}
    </Card>
  )
}
