import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@frameline/ui'

/**
 * Bottom sheet on phones, centred dialog from `sm` up. Built on Radix Dialog (focus trap, Esc, labels).
 */
export function Sheet({
  open, onOpenChange, title, description, children, footer, className, dark,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** Use the dark "side" palette (photo viewer). */
  dark?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(12,10,8,.55)] animate-[fl-fade-in_150ms_ease-out]" />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[18px] border outline-none shadow-float',
            'animate-[fl-sheet-up_220ms_cubic-bezier(.2,.8,.2,1)]',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[8vh] sm:w-[calc(100vw-32px)] sm:max-w-[480px] sm:-translate-x-1/2 sm:rounded-modal sm:animate-[fl-slide-up_180ms_ease-out]',
            dark ? 'border-side-line bg-side text-side-ink' : 'border-line bg-surface text-ink',
            className,
          )}
        >
          <div className={cn('mx-auto mt-2 h-1 w-10 rounded-full sm:hidden', dark ? 'bg-side-line' : 'bg-line-2')} aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-3 sm:pt-5">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-[20px] font-semibold leading-tight">{title}</Dialog.Title>
              {description
                ? <Dialog.Description className={cn('mt-1 text-[13px]', dark ? 'text-side-ink-2' : 'text-ink-2')}>{description}</Dialog.Description>
                : <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</Dialog.Description>}
            </div>
            <Dialog.Close
              className={cn('-mr-1 grid size-9 shrink-0 place-items-center rounded-full', dark ? 'text-side-ink-2 hover:bg-side-2 hover:text-side-ink' : 'text-ink-2 hover:bg-sunk hover:text-ink')}
              aria-label="Close"
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 scrollbar-thin">{children}</div>
          {footer && <div className={cn('flex items-center gap-2 border-t px-5 pt-3 pb-safe', dark ? 'border-side-line' : 'border-line')}>{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
