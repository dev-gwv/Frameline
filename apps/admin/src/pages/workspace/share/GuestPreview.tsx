import { useRef, useState } from 'react'
import { Camera, CheckCircle2 } from 'lucide-react'
import { toneCss, type PhotoEvent, type Studio } from '@frameline/shared'
import { cn } from '@frameline/ui'

/** A small live phone showing the first thing a guest sees with the current access settings. */
export function GuestPreview({ event, studio }: { event: PhotoEvent; studio?: Studio }) {
  const s = event.settings
  const brand = studio?.brandColor ?? '#8C2F39'
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="eyebrow">What the guest sees</div>
      <div className="w-[200px] overflow-hidden rounded-[20px] border-[6px] border-side bg-surface shadow-card">
        <div className="flex h-[118px] items-end p-2.5 font-display text-[15px] font-semibold text-white" style={{ background: toneCss(event.coverTones[0]) }}>
          <span className="drop-shadow">{event.name}</span>
        </div>
        <div className="flex min-h-[150px] flex-col gap-1.5 p-2.5">
          {s.access === 'link-pin' && <PinEntry pin={s.pin} brand={brand} />}
          {s.access === 'registered' && (
            <>
              <div className="text-[10.5px] text-ink-2">Register to see the photos</div>
              {['Your name', 'Email or mobile'].map((p) => <input key={p} aria-label={p} placeholder={p} className="h-6 rounded-[5px] border border-line-2 bg-surface px-1.5 text-[10.5px] text-ink outline-none placeholder:text-ink-3 focus:border-accent" />)}
              <span className="mt-1 rounded-[6px] py-1 text-center text-[11px] font-bold text-white" style={{ background: brand }}>Continue</span>
            </>
          )}
          {s.access === 'link' && (
            <>
              <div className="text-[10.5px] text-ink-2">{s.facePrivacy ? 'Take a selfie to see your photos' : 'Anyone with the link can browse'}</div>
              {s.facePrivacy ? (
                <span className="mt-1 inline-flex items-center justify-center gap-1 rounded-[6px] py-1 text-[11px] font-bold text-white" style={{ background: brand }}><Camera size={11} />Find my photos</span>
              ) : (
                <div className="grid grid-cols-3 gap-0.5">
                  {[event.coverTones[1], event.coverTones[2], event.coverTones[0], event.coverTones[2], event.coverTones[0], event.coverTones[1]].map((t, i) => <span key={i} className="aspect-square rounded-[3px]" style={{ background: toneCss(t) }} />)}
                </div>
              )}
            </>
          )}
          {s.access !== 'link' && s.facePrivacy && <div className="mt-auto text-[9.5px] text-ink-3">Then a selfie shows only their photos.</div>}
        </div>
      </div>
    </div>
  )
}

function PinEntry({ pin, brand }: { pin: string; brand: string }) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const value = digits.join('')
  const state = value.length < 4 ? 'typing' : value === pin ? 'ok' : 'bad'
  return (
    <>
      <div className="text-[10.5px] text-ink-2">Enter PIN <span className="text-ink-3">(try it)</span></div>
      <div className="flex gap-1">
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el }} value={d} inputMode="numeric" maxLength={1} aria-label={`PIN digit ${i + 1}`}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(-1)
              setDigits((ds) => ds.map((x, k) => (k === i ? v : x)))
              if (v && i < 3) refs.current[i + 1]?.focus()
            }}
            onKeyDown={(e) => { if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus() }}
            className={cn('h-7 w-full min-w-0 flex-1 rounded-[5px] border bg-surface text-center font-mono text-[13px] text-ink outline-none focus:border-accent',
              state === 'bad' ? 'border-bad' : state === 'ok' ? 'border-ok' : 'border-line-2')} />
        ))}
      </div>
      {state === 'ok' ? (
        <span className="mt-1 inline-flex items-center justify-center gap-1 text-[11px] font-bold text-ok"><CheckCircle2 size={12} />Gallery unlocked</span>
      ) : (
        <button type="button" className="mt-1 rounded-[6px] py-1 text-center text-[11px] font-bold text-white" style={{ background: brand }}
          onClick={() => { setDigits(['', '', '', '']); refs.current[0]?.focus() }}>
          {state === 'bad' ? 'Wrong PIN · try again' : 'Continue'}
        </button>
      )}
    </>
  )
}
