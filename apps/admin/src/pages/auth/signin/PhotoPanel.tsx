import { tone, toneCss } from '@frameline/shared'

/** Right half of the sign-in page on desktop: a photo with one line about what Frameline does. */
export function PhotoPanel() {
  return (
    <div className="relative hidden overflow-hidden lg:block" aria-hidden style={{ background: toneCss(tone(3)) }}>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-50% to-black/50" />
      <p className="absolute bottom-11 left-11 max-w-[420px] font-display text-[30px] font-semibold leading-[1.15] text-white">
        Upload once. Every guest finds their own photos.
      </p>
    </div>
  )
}
