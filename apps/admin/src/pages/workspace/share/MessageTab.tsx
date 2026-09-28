import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Copy, MessageCircle } from 'lucide-react'
import type { PhotoEvent, Studio } from '@frameline/shared'
import { Button, Textarea } from '@frameline/ui'
import { useCopy } from './LinkTab'
import { DEFAULT_TEMPLATE, MAX_TEMPLATE, fillTemplate, loadTemplate, saveTemplate, variableValues, whatsappUrl, type Variable } from './message'

/**
 * Turns an edited, filled-in message back into a template: this event's name, link, PIN… become {placeholders},
 * so the edit is reused for the next events with their own details (and a new PIN fills in by itself).
 */
function toTemplate(text: string, values: Record<Variable, string>) {
  const pairs = (Object.entries(values) as [Variable, string][])
    .filter(([k, v]) => v && (k !== 'PIN' || v.length >= 4))
    .sort((a, b) => b[1].length - a[1].length)
  let out = text
  for (const [k, v] of pairs) out = out.split(v).join(`{${k}}`)
  return out
}

/** Message tab: the ready message, editable; edits are saved for the next events. Copy, or send on WhatsApp (gold). */
export function useMessageTab(event: PhotoEvent, studio?: Studio): { body: ReactNode; footer: ReactNode } {
  const copy = useCopy()
  const values = useMemo(() => variableValues(event, studio), [event, studio])
  const [template, setTemplate] = useState(loadTemplate)
  const [text, setText] = useState(() => fillTemplate(template, values))
  const [saved, setSaved] = useState(false)
  const editing = useRef(false)
  // Refill when the event's details change (e.g. a new PIN), unless mid-edit.
  useEffect(() => { if (!editing.current) setText(fillTemplate(template, values)) }, [template, values])

  const onChange = (v: string) => {
    editing.current = true
    setText(v)
    setSaved(false)
  }
  const commit = () => {
    editing.current = false
    const t = toTemplate(text, values)
    if (t !== template) { setTemplate(t); setSaved(saveTemplate(t)) }
  }
  const reset = () => { setTemplate(DEFAULT_TEMPLATE); saveTemplate(DEFAULT_TEMPLATE); editing.current = false; setText(fillTemplate(DEFAULT_TEMPLATE, values)); setSaved(false) }

  const body = (
    <>
      <Textarea value={text} maxLength={MAX_TEMPLATE} onChange={(e) => onChange(e.target.value)} onBlur={commit} aria-label="Message to guests" className="min-h-[190px] text-[14px] leading-relaxed" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] text-ink-3">{saved ? 'Saved. Your next events use this message.' : 'Edits here are saved for your next events.'}</span>
        <button type="button" onClick={reset} disabled={template === DEFAULT_TEMPLATE} className="min-h-[28px] text-[13px] font-bold text-accent-text hover:underline disabled:text-ink-3 disabled:no-underline">Reset to default</button>
      </div>
    </>
  )
  const footer = (
    <>
      <Button icon={<Copy size={15} />} onClick={() => { commit(); void copy(text, 'Message') }}>Copy message</Button>
      <Button variant="primary" icon={<MessageCircle size={15} />} onClick={() => { commit(); window.open(whatsappUrl(text), '_blank', 'noopener') }}>Send on WhatsApp</Button>
    </>
  )
  return { body, footer }
}
