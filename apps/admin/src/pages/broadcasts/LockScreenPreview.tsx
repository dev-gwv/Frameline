import type { Studio } from '@frameline/shared'
import type { Draft } from './draft'

/*
 * Lock-screen push preview; updates as the composer changes. It depicts a phone screen, so it keeps
 * phone colours (dark wallpaper, frosted notification) in both themes.
 */
export function LockScreenPreview({ studio, draft }: { studio?: Studio; draft: Draft }) {
  const title = draft.title.trim() || 'Your title appears here'
  const body = draft.body.trim() || 'Your message appears here. Keep it short so it fits on a lock screen.'
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="w-full max-w-[320px] rounded-[24px] p-[18px] text-white shadow-card" style={{ background: 'linear-gradient(170deg,#2a2119,#1b1611 55%,#120e0a)' }}>
        <div className="mt-2 text-center text-[12px] font-semibold opacity-80">Saturday 26 September</div>
        <div className="mb-7 text-center text-[44px] font-light leading-tight tnum">9:41</div>
        <div className="rounded-[14px] px-3 py-2.5 backdrop-blur" style={{ background: 'rgba(255,255,255,.14)' }} aria-label="Notification preview">
          <div className="flex items-center gap-1.5 text-[11px] opacity-80">
            <span className="grid size-4 shrink-0 place-items-center rounded-[4px] text-[9px] font-extrabold" style={{ background: studio?.brandColor ?? '#B8862B' }} aria-hidden>
              {(studio?.name ?? 'S')[0]}
            </span>
            <span className="truncate">{studio?.name ?? 'Your studio'} · now</span>
          </div>
          <b className={`mt-0.5 block break-words text-[13px] ${draft.title.trim() ? '' : 'opacity-60'}`}>{title}</b>
          <div className={`line-clamp-3 break-words text-[12px] ${draft.body.trim() ? 'opacity-90' : 'opacity-60'}`}>{body}</div>
          {draft.image && <img src={draft.image} alt="" className="mt-2 max-h-28 w-full rounded-[8px] object-cover" />}
        </div>
        <div className="h-24" aria-hidden />
      </div>
      <span className="text-[12px] text-ink-3">How it looks on a locked phone</span>
    </div>
  )
}
