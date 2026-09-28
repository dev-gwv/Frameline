import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@frameline/ui'

/**
 * Bottom sheet on phones, centred dialog from `sm` up. Built on Radix Dialog (focus trap, Esc, labels).
 * One decision per sheet; the footer holds its action.
 */
export function Sheet({
  open, onOpenChange, title, description, children, footer, className, dark, hideClose,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** Use the dark "side" palette (photo viewer only). */
  dark?: boolean
  /** Hide the close button while something is running (the sheet can't be closed then). */
  hideClose?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(18,14,9,.5)] animate-[fl-fade-in_150ms_ease-out]" />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[22px] border-t outline-none shadow-float',
            'animate-[fl-sheet-up_220ms_cubic-bezier(.2,.8,.2,1)]',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[8vh] sm:w-[calc(100vw-32px)] sm:max-w-[460px] sm:-translate-x-1/2 sm:rounded-modal sm:border sm:animate-[fl-slide-up_180ms_ease-out]',
            dark ? 'border-side-line bg-side text-side-ink' : 'border-line bg-surface text-ink',
            className,
          )}
        >
          <div className={cn('mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full sm:hidden', dark ? 'bg-side-line' : 'bg-line-2')} aria-hidden />
          <div className="flex items-start justify-between gap-3 px-4 pb-1 pt-2.5 sm:px-5 sm:pt-5">
            <div className="min-w-0 pt-1.5">
              <Dialog.Title className="text-[17px] font-extrabold leading-snug">{title}</Dialog.Title>
              {description
                ? <Dialog.Description className={cn('mt-1 text-[13.5px]', dark ? 'text-side-ink-2' : 'text-ink-2')}>{description}</Dialog.Description>
                : <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</Dialog.Description>}
            </div>
            {!hideClose && (
              <Dialog.Close
                className={cn('-mr-2 grid size-11 shrink-0 place-items-center rounded-full', dark ? 'text-side-ink-2 hover:bg-side-2 hover:text-side-ink' : 'text-ink-2 hover:bg-sunk hover:text-ink')}
                aria-label="Close"
              >
                <X size={19} />
              </Dialog.Close>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2 scrollbar-thin sm:px-5">{children}</div>
          {footer && <div className={cn('flex flex-col gap-2 border-t px-4 pt-3 pb-safe sm:px-5 sm:pb-5', dark ? 'border-side-line' : 'border-line')}>{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Radio card used inside sheets (Download: ZIP / one by one; Buy: options; Pay with). */
export function RadioCard({ checked, onSelect, title, detail, children, disabled }: {
  checked: boolean; onSelect: () => void; title: ReactNode; detail?: ReactNode; children?: ReactNode; disabled?: boolean
}) {
  return (
    <div
      role="radio" aria-checked={checked} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
      onClick={() => { if (!disabled) onSelect() }}
      onKeyDown={(e) => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onSelect() } }}
      className={cn('flex min-h-11 cursor-pointer gap-3 rounded-[10px] border px-3.5 py-3 text-left transition',
        checked ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line bg-surface hover:bg-sunk',
        disabled && 'cursor-not-allowed opacity-50')}
    >
      <span className={cn('mt-0.5 size-4 shrink-0 rounded-full', checked ? 'border-[5px] border-accent' : 'border-[1.5px] border-line-2')} aria-hidden />
      <div className="min-w-0 flex-1">
        <b className="block text-[14px]">{title}</b>
        {detail && <div className="text-[12.5px] text-ink-2">{detail}</div>}
        {children}
      </div>
    </div>
  )
}
