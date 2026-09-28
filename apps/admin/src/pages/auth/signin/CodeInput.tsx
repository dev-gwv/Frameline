import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '@frameline/ui'

const LEN = 6

/** Six separate digit boxes with auto-advance, backspace-to-previous and paste support. */
export function CodeInput({ value, onChange, onComplete, disabled, invalid, autoFocus, shake = 0 }: {
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  disabled?: boolean
  invalid?: boolean
  autoFocus?: boolean
  /** Bump to shake the boxes (wrong code). */
  shake?: number
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const group = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!shake || !group.current?.animate) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    group.current.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
      { duration: 380, easing: 'ease-out' },
    )
    refs.current[0]?.focus()
  }, [shake])
  const digits = Array.from({ length: LEN }, (_, i) => value[i] ?? '')

  const set = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, LEN)
    onChange(clean)
    if (clean.length === LEN) onComplete?.(clean)
  }
  const focus = (i: number) => refs.current[Math.max(0, Math.min(LEN - 1, i))]?.focus()

  const onInput = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, '')
    if (!d) return
    if (d.length > 1) { // typed/auto-filled several digits into one box
      set((value.slice(0, i) + d).slice(0, LEN))
      focus(i + d.length)
      return
    }
    const arr = digits.slice()
    arr[i] = d
    set(arr.join(''))
    focus(i + 1)
  }
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const arr = digits.slice()
      if (arr[i]) { arr[i] = ''; onChange(arr.join('').slice(0, i) + arr.slice(i + 1).join('')) }
      else if (i > 0) { arr[i - 1] = ''; onChange(arr.join('')); focus(i - 1) }
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); focus(i - 1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); focus(i + 1) }
  }
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!text) return
    e.preventDefault()
    set(text)
    focus(text.length)
  }

  return (
    <div ref={group} className="flex justify-between gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LEN}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-14 w-full min-w-0 rounded-control border bg-surface text-center text-[22px] font-bold tnum text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-50',
            invalid ? 'border-bad' : 'border-line-2',
          )}
        />
      ))}
    </div>
  )
}
