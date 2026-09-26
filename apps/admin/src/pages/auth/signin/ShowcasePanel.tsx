import { tone } from '@frameline/shared'
import { LogoMark, PhotoTile } from '@frameline/ui'

const MOSAIC = [0, 2, 3, 6, 8, 10, 12, 1, 4, 9, 11, 7]

function Headline({ className }: { className?: string }) {
  return (
    <h2 className={className}>
      Deliver every guest their photos <span className="text-gold">by tonight.</span>
    </h2>
  )
}

/** Left panel on desktop: a delivered gallery shows the value before sign-up. */
export function ShowcasePanel() {
  return (
    <div className="hidden flex-col gap-6 bg-side p-10 text-side-ink lg:flex">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <span className="font-display text-[18px] font-semibold">Frameline</span>
      </div>
      <div className="grid grid-cols-4 gap-2" aria-hidden>
        {MOSAIC.map((t, k) => <PhotoTile key={k} tone={tone(t)} selected={k === 5} />)}
      </div>
      <div className="mt-auto">
        <Headline className="max-w-[15ch] font-display text-[40px] font-semibold leading-[1.08]" />
        <p className="mt-3 max-w-[44ch] text-side-ink-2">
          Upload, share one link, and let guests find themselves with a selfie. Used by 1,200 studios across India.
        </p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11.5px] text-side-ink-2">
          <span><b className="text-side-gold">1,200</b> studios</span>
          <span><b className="text-side-gold">4.2M</b> photos delivered</span>
          <span><b className="text-side-gold">9 s</b> to find yourself</span>
        </div>
      </div>
    </div>
  )
}

/** Mobile: the panel collapses to a short header. */
export function ShowcaseHeader() {
  return (
    <div className="flex flex-col gap-3 bg-side px-4 pb-5 pt-5 text-side-ink lg:hidden">
      <div className="flex items-center gap-2.5">
        <LogoMark size={24} />
        <span className="font-display text-[17px] font-semibold">Frameline</span>
      </div>
      <Headline className="font-display text-[22px] font-semibold leading-tight" />
      <div className="grid grid-cols-6 gap-1" aria-hidden>
        {MOSAIC.slice(0, 6).map((t, k) => <PhotoTile key={k} tone={tone(t)} selected={k === 3} rounded="rounded" />)}
      </div>
    </div>
  )
}
