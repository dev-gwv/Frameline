import { toneCss, TONES, type Studio } from '@frameline/shared'
import type { Draft } from './draft'

/** Lock-screen push preview; updates as the composer changes. */
export function LockScreenPreview({ studio, draft }: { studio?: Studio; draft: Draft }) {
  const title = draft.title.trim() || 'Your title appears here'
  const body = draft.body.trim() || 'Your message appears here. Keep it short so it fits on a lock screen.'
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="h-[510px] w-[250px] overflow-hidden rounded-[36px] border-[7px] border-side bg-side shadow-card">
        <div className="relative flex h-full flex-col items-center rounded-[29px] px-3" style={{ background: toneCss(TONES[9]) }}>
          <span className="mt-2.5 h-3.5 w-16 rounded-full bg-black/80" aria-hidden />
          <div className="mt-6 text-[12px] font-semibold text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,.35)]">Saturday 26 September</div>
          <div className="font-display text-[52px] font-semibold leading-none text-white [text-shadow:0_1px_8px_rgba(0,0,0,.3)]">9:41</div>
          <div className="mt-6 w-full rounded-[14px] bg-white/90 p-2.5 text-[#15191C] shadow-[0_4px_16px_rgba(0,0,0,.18)] backdrop-blur" aria-label="Notification preview">
            <div className="flex gap-2">
              <div className="grid size-[30px] shrink-0 place-items-center rounded-[7px] font-display text-[13px] font-semibold text-white" style={{ background: studio?.brandColor ?? '#8C2F39' }}>
                {(studio?.name ?? 'S')[0]}
              </div>
              <div className="min-w-0 flex-1 text-[11.5px] leading-snug">
                <div className="flex justify-between gap-1"><b className="truncate">{studio?.name ?? 'Your studio'}</b><span className="shrink-0 text-[10px] text-[#6b7073]">now</span></div>
                <b className={draft.title.trim() ? 'block break-words' : 'block text-[#8a8f92]'}>{title}</b>
                <div className={draft.body.trim() ? 'line-clamp-3 break-words text-[#4a4f52]' : 'line-clamp-3 text-[#8a8f92]'}>{body}</div>
              </div>
            </div>
            {draft.image && <img src={draft.image} alt="" className="mt-2 max-h-28 w-full rounded-[8px] object-cover" />}
          </div>
          <span className="absolute bottom-2 h-1 w-24 rounded-full bg-white/80" aria-hidden />
        </div>
      </div>
      <span className="text-[11.5px] text-ink-3">Lock-screen preview · updates as you type</span>
    </div>
  )
}
