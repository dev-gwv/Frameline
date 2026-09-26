import { Fragment } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@frameline/ui'

/** Numbered sequence: done steps are gold with a check, the current one is ringed. */
export function Stepper({ steps, current, onJump }: { steps: string[]; current: number; onJump: (i: number) => void }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2.5 gap-y-2" aria-label="Setup progress">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <Fragment key={s}>
            <li className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
              <button
                type="button" disabled={!done} onClick={() => onJump(i)}
                className="flex items-center gap-2 disabled:cursor-default"
                aria-label={`Step ${i + 1}: ${s}${done ? ' (done)' : ''}`}
              >
                <span className={cn('grid size-6 place-items-center rounded-full font-mono text-[12px] font-extrabold',
                  done && 'bg-gold text-accent-ink',
                  active && 'border-2 border-accent text-accent-text',
                  !done && !active && 'border border-line-2 text-ink-3')}>
                  {done ? <Check size={13} strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn('text-[13.5px]', active ? 'font-extrabold text-ink' : done ? 'font-medium text-ink' : 'font-medium text-ink-3')}>{s}</span>
              </button>
            </li>
            {i < steps.length - 1 && <li aria-hidden className="h-px w-6 bg-line-2 sm:w-12" />}
          </Fragment>
        )
      })}
    </ol>
  )
}
