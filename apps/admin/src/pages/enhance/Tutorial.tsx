import { useState } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Card } from '@frameline/ui'
import { COST } from './presets'

const KEY = 'frameline.enhance.tutorial.dismissed'
const readDismissed = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

/** Small "how it works" card; dismissing it is remembered on this device. */
export function Tutorial({ className }: { className?: string }) {
  const [hidden, setHidden] = useState(readDismissed)
  if (hidden) return null
  const dismiss = () => { setHidden(true); try { localStorage.setItem(KEY, '1') } catch { /* private mode: hide for this visit */ } }
  return (
    <Card className={className}>
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-control bg-accent-soft text-accent-text"><Lightbulb size={16} /></span>
        <div className="min-w-0 flex-1 text-[13px] text-ink-2">
          <b className="block text-[13.5px] text-ink">How AI enhance works</b>
          Pick a change or describe it, drag the divider to compare, then save. Each save costs {fmt.rupees(COST)} from your wallet.
          Your original stays as it is unless you choose “Replace the original”.
        </div>
        <button type="button" onClick={dismiss} aria-label="Hide these tips" className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-sunk hover:text-ink"><X size={16} /></button>
      </div>
    </Card>
  )
}
