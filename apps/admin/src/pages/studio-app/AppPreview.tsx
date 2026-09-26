import { Lock } from 'lucide-react'
import { toneCss, type PhotoEvent, type Studio } from '@frameline/shared'
import { Chip } from '@frameline/ui'
import { QUESTIONS, SERVICES, type AppConfig } from './sample'

/** Live phone preview of the studio profile inside the guest app. */
export function AppPreview({ studio, events, config }: { studio: Studio; events: PhotoEvent[]; config: AppConfig }) {
  const byId = new Map(events.map((e) => [e.id, e]))
  const featured = config.featured.map((id) => byId.get(id)).filter((e): e is PhotoEvent => !!e)
  const listed = events
    .filter((e) => e.status !== 'draft' && e.status !== 'archived')
    .filter((e) => config.showPrivate || e.settings.access === 'link')

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="h-[540px] w-[262px] overflow-hidden rounded-[36px] border-[7px] border-side bg-side shadow-card">
        <div className="relative h-full overflow-y-auto rounded-[29px] bg-paper scrollbar-thin">
          <div className="flex items-center justify-between px-5 pb-1 pt-2.5 font-mono text-[10px] font-bold text-ink">
            <span>9:41</span><span className="h-3.5 w-16 rounded-full bg-side" aria-hidden /><span>5G</span>
          </div>
          <div className="flex items-center gap-2 px-3 pb-2 pt-2">
            <div className="grid size-[30px] place-items-center rounded-[8px] font-display text-[14px] font-semibold text-white" style={{ background: studio.brandColor }}>{studio.name[0]}</div>
            <div className="min-w-0 flex-1">
              <b className="block truncate font-display text-[14px]">{studio.name.replace(/ Studio$/, '')}</b>
              <span className="block truncate text-[10px] text-ink-3">{studio.city}</span>
            </div>
            <Chip tone="accent">Following</Chip>
          </div>
          <div className="px-3 pb-4">
            {featured.length > 0 && <>
              <div className="eyebrow mb-1.5 mt-1.5">Featured</div>
              <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 scrollbar-thin">
                {featured.map((e) => (
                  <div key={e.id} className="relative h-[118px] w-[92px] shrink-0 overflow-hidden rounded-[8px]" style={{ background: toneCss(e.coverTones[0]) }}>
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 text-[9.5px] font-bold leading-tight text-white">{e.name}</span>
                  </div>
                ))}
              </div>
            </>}

            {config.showServices && <>
              <div className="eyebrow mb-1 mt-3">Services</div>
              {SERVICES.map((s) => (
                <div key={s.name} className="flex justify-between gap-2 border-t border-line py-1.5 text-[11px]">
                  <b className="truncate">{s.name}</b><span className="shrink-0 font-mono text-ink-2">{s.price}</span>
                </div>
              ))}
            </>}

            <div className="eyebrow mb-1 mt-3">Galleries</div>
            {listed.map((e) => {
              const priv = e.settings.access !== 'link'
              return (
                <div key={e.id} className="flex items-center gap-2 border-t border-line py-1.5">
                  <div className="h-7 w-10 shrink-0 rounded" style={{ background: toneCss(e.coverTones[0]) }} />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{e.name}</span>
                  {priv && <Lock size={11} className="shrink-0 text-ink-3" aria-label="Private: cover and name only" />}
                </div>
              )
            })}

            {config.showQuestions && <>
              <div className="eyebrow mb-1 mt-3">Questions</div>
              {QUESTIONS.slice(0, 3).map((q) => (
                <div key={q.q} className="border-t border-line py-1.5 text-[11px]">
                  <b className="block">{q.q}</b>
                  <span className="text-ink-2">{q.a}</span>
                </div>
              ))}
            </>}
          </div>
        </div>
      </div>
      <span className="text-[11.5px] text-ink-3">Live preview · updates as you change settings</span>
    </div>
  )
}
