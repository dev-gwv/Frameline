import { useRef, useState } from 'react'
import { Copy, Mail, MessageCircle, Plus, RotateCcw } from 'lucide-react'
import { fmt, type PhotoEvent, type Studio } from '@frameline/shared'
import { Button, Textarea, Toggle, useToast } from '@frameline/ui'
import { useCopy, useSettings } from './LinkTab'
import { DEFAULT_TEMPLATE, MAX_TEMPLATE, VARIABLES, fillTemplate, loadTemplate, mailtoUrl, saveTemplate, variableValues, whatsappUrl, type Variable } from './message'

export function MessageTab({ event, studio }: { event: PhotoEvent; studio?: Studio }) {
  const toast = useToast()
  const copy = useCopy()
  const settings = useSettings(event)
  const [text, setText] = useState(loadTemplate)
  const [saved, setSaved] = useState(loadTemplate)
  const ref = useRef<HTMLTextAreaElement>(null)
  const filled = fillTemplate(text, variableValues(event, studio))
  const now = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date())

  const insert = (v: Variable) => {
    const token = `{${v}}`
    const el = ref.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const next = (text.slice(0, start) + token + text.slice(end)).slice(0, MAX_TEMPLATE)
    setText(next)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length) })
  }
  const save = () => {
    if (saveTemplate(text)) { setSaved(text); toast.success('Saved for all events', 'New shares use this message.') }
    else toast.error('Couldn’t save the template', 'Your browser blocked storage. Check private-browsing settings.')
  }

  return (
    <div className="grid gap-5 px-5 py-4 sm:px-6 md:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <b className="text-[13px]">Template</b>
          <span className="font-mono text-[11px] text-ink-3">{fmt.count(text.length)} / {fmt.count(MAX_TEMPLATE)}</span>
        </div>
        <Textarea ref={ref} value={text} maxLength={MAX_TEMPLATE} onChange={(e) => setText(e.target.value)} aria-label="Message template" className="min-h-[190px] text-[13px]" />
        <div>
          <div className="eyebrow mb-1.5">Insert</div>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => (
              <button key={v} type="button" onClick={() => insert(v)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-2 bg-sunk px-2 py-0.5 text-[11px] font-bold text-ink-2 hover:border-accent hover:text-accent-text">
                <Plus size={10} />{v}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button variant="ghost" size="sm" icon={<RotateCcw size={12} />} onClick={() => setText(DEFAULT_TEMPLATE)} disabled={text === DEFAULT_TEMPLATE}>Reset to default</Button>
          <Button variant="primary" onClick={save} disabled={text === saved || !text.trim()}>Save for all events</Button>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <b className="text-[13px]">Preview</b>
          <label className="flex items-center gap-2 text-[12px]">Short links <Toggle size="sm" label="Short links" checked={event.settings.shortLinks} onCheckedChange={(v) => settings.mutate({ shortLinks: v })} /></label>
        </div>
        <div className="flex-1 rounded-card bg-sunk p-3.5">
          <div className="ml-auto max-w-[92%] whitespace-pre-wrap break-words rounded-[10px] rounded-tr-sm bg-ok-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink shadow-card">
            {filled}
            <div className="mt-1 text-right font-mono text-[9.5px] text-ink-3">{now} ✓✓</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button className="justify-center" icon={<MessageCircle size={14} />} onClick={() => window.open(whatsappUrl(filled), '_blank', 'noopener')}>WhatsApp</Button>
          <Button className="justify-center" icon={<Mail size={14} />} onClick={() => { window.location.href = mailtoUrl(`Your photos from ${event.name}`, filled) }}>Email</Button>
          <Button className="justify-center" icon={<Copy size={14} />} onClick={() => copy(filled, 'Message')}>Copy</Button>
        </div>
      </div>
    </div>
  )
}
