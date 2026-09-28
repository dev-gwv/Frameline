import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@frameline/ui'

/** Outlined button on the dark viewer chrome (icon + word; icon-only only for ⋯, close and back, with aria-label). */
export const VBtn = forwardRef<HTMLButtonElement, { icon?: ReactNode; children?: ReactNode; active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>>(
  function VBtn({ icon, children, active, className, type = 'button', ...rest }, ref) {
    return (
      <button ref={ref} type={type} {...rest}
        className={cn('inline-flex h-[34px] shrink-0 items-center justify-center gap-1.5 rounded-control border border-side-line px-2.5 text-[13px] font-bold text-side-ink transition-colors hover:bg-side-2 disabled:opacity-40 max-sm:h-11',
          !children && 'w-[34px] px-0 max-sm:w-11', active && 'bg-side-2', className)}>
        {icon}{children}
      </button>
    )
  },
)

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="rounded border border-side-line px-1 font-sans text-[11px] font-bold text-side-ink">{children}</kbd>
