import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { Button, cn } from './primitives'

const overlayCls = 'fixed inset-0 z-40 bg-[rgba(18,14,9,.45)] animate-[fl-fade-in_150ms_ease-out]'

/* ---------------- Modal ---------------- */
/**
 * Rule 7: short tasks (≤ ~5 fields) use a Modal; longer ones get a full page. On phones (<640px)
 * the same Modal slides up from the bottom as a sheet, so screens need no special phone code.
 * Put the ONE gold button in `footer` (right-most), with Cancel as `variant="ghost"`.
 */
export function Modal({
  open, onOpenChange, title, description, children, footer, width = 560, className, bodyClassName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
  className?: string
  /** Body padding defaults to 22px sides / 18px top-bottom with 14px gaps; override or pass 'p-0' for edge-to-edge content. */
  bodyClassName?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayCls} />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden bg-surface shadow-float outline-none',
            // phone: bottom sheet
            'inset-x-0 bottom-0 mx-auto max-h-[92dvh] rounded-t-[22px] pb-[env(safe-area-inset-bottom)] animate-[fl-sheet-up_200ms_ease-out]',
            // ≥ sm: centred dialog
            'sm:inset-x-auto sm:bottom-auto sm:mx-0 sm:left-1/2 sm:top-[8vh] sm:max-h-[84vh] sm:w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:rounded-modal sm:pb-0 sm:animate-[fl-slide-up_180ms_ease-out]',
            className,
          )}
          style={{ maxWidth: width }}
        >
          <span className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line-2 sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3 border-b border-line px-[22px] py-4 sm:py-[18px]">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-[21px] font-semibold leading-tight">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-[13px] text-ink-2">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="-mr-1 grid size-9 shrink-0 place-items-center rounded-control text-ink-2 hover:bg-sunk hover:text-ink" aria-label="Close"><X size={18} /></DialogPrimitive.Close>
          </div>
          <div className={cn('flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-[22px] py-[18px] scrollbar-thin', bodyClassName)}>{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-[22px] py-3.5 max-sm:[&>button]:min-h-[44px]">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ---------------- Bottom sheet (phone menus) ---------------- */
/** A sheet from the bottom with a grab handle. Use for phone menus (the More tab); forms use Modal, which is already a sheet on phones. */
export function BottomSheet({ open, onOpenChange, title, children, className }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; children: ReactNode; className?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayCls} />
        <DialogPrimitive.Content
          className={cn('fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[22px] bg-surface pb-[max(18px,env(safe-area-inset-bottom))] shadow-float outline-none animate-[fl-sheet-up_200ms_ease-out]', className)}
        >
          <span className="mx-auto mb-1 mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line-2" aria-hidden />
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 scrollbar-thin">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ---------------- Drawer (deprecated) ---------------- */
/** @deprecated Rule 7: "Modal or page, never a drawer". Kept exported so old pages compile; don't use in new work. */
export function Drawer({ open, onOpenChange, title, description, children, footer, width = 480 }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayCls} />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-float outline-none animate-[fl-slide-left_200ms_ease-out]" style={{ maxWidth: width }}>
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
            <div>
              <DialogPrimitive.Title className="font-display text-[23px] font-semibold">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-[13px] text-ink-2">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{typeof title === 'string' ? title : 'Panel'}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-ink-2 hover:bg-sunk hover:text-ink" aria-label="Close"><X size={18} /></DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3 scrollbar-thin">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ---------------- Confirm (in-page, never window.confirm) ---------------- */
/**
 * Rule 8: ask first ONLY for sending messages, paying, refunding, new PIN, delete forever, turning off an event,
 * resetting camera passwords. Everything reversible acts immediately with an Undo toast instead.
 * `confirmLabel` says what happens with the amount ("Refund ₹1,199"). `danger` = solid red button.
 * If `onConfirm` returns a promise, the button shows a spinner and the dialog closes when it resolves (stays open on error).
 */
export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, danger, onConfirm, children }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; body: ReactNode; confirmLabel: string; danger?: boolean
  onConfirm: () => unknown
  /** Extra content under the body (e.g. a "Reason" field). */
  children?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    const r = onConfirm()
    if (r instanceof Promise) {
      setBusy(true)
      try { await r; onOpenChange(false) } catch { /* caller shows the error */ } finally { setBusy(false) }
    } else onOpenChange(false)
  }
  return (
    <Modal open={open} onOpenChange={(v) => !busy && onOpenChange(v)} title={title} width={480}
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
        <Button variant={danger ? 'destructive' : 'primary'} loading={busy} onClick={run}>{confirmLabel}</Button>
      </>}>
      <div className="text-[14px] text-ink-2">{body}</div>
      {children}
    </Modal>
  )
}

/* ---------------- Dropdown menu ---------------- */
/** `description` gives an item a second line (the spec's ⋯ and More menus: "Import from Google Drive" / "Bring in a finished shoot"). */
export interface MenuItem { label: ReactNode; description?: ReactNode; icon?: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean; hint?: ReactNode }
export function Menu({ trigger, items, align = 'end', width = 240, header, columns = 1, tone = 'light' }: {
  trigger: ReactNode; items: (MenuItem | 'separator')[]; align?: 'start' | 'end' | 'center'; width?: number
  /** 'dark' = the photo viewer's look (side tokens); everything else uses the default light menu. */
  tone?: 'light' | 'dark'
  /** Non-interactive block at the top (e.g. account name + email). */
  header?: ReactNode
  /** 2 = two-column grid (the top bar's More menu). */
  columns?: 1 | 2
}) {
  const dark = tone === 'dark'
  const sep = cn('my-1.5 h-px', dark ? 'bg-side-line' : 'bg-line', columns === 2 && 'col-span-2')
  return (
    <DropdownPrimitive.Root modal={false}>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content align={align} sideOffset={6} collisionPadding={12}
          className={cn('z-50 max-w-[calc(100vw-24px)] rounded-card border p-2 shadow-float animate-[fl-fade-in_120ms_ease-out]',
            dark ? 'border-side-line bg-side-2 text-side-ink' : 'border-line bg-surface', columns === 2 && 'grid grid-cols-2 gap-x-3.5 gap-y-1 p-3.5')}
          style={{ width }}>
          {header && <div className={cn('px-2.5 pb-1.5 pt-1', columns === 2 && 'col-span-2')}>{header}</div>}
          {header && <DropdownPrimitive.Separator className={sep} />}
          {items.map((it, i) => it === 'separator' ? <DropdownPrimitive.Separator key={i} className={sep} /> : (
            <DropdownPrimitive.Item key={i} disabled={it.disabled} onSelect={it.onSelect}
              className={cn('flex cursor-pointer items-center gap-[11px] rounded-control px-2.5 py-2 text-[13.5px] font-bold outline-none data-[disabled]:opacity-40',
                dark ? 'data-[highlighted]:bg-side' : 'data-[highlighted]:bg-sunk',
                it.danger ? (dark ? 'text-inverse-bad' : 'text-bad') : dark ? 'text-side-ink' : 'text-ink', it.description && 'items-start py-[9px]')}>
              {it.icon && <span className={cn('shrink-0', it.description && 'mt-0.5', !it.danger && (dark ? 'text-side-ink-2' : 'text-ink-2'))}>{it.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="block">{it.label}</span>
                {it.description && <span className={cn('block text-[12px] font-medium', dark ? 'text-side-ink-2' : 'text-ink-3')}>{it.description}</span>}
              </span>
              {it.hint && <span className={cn('text-[11.5px] font-medium', dark ? 'text-side-ink-2' : 'text-ink-3')}>{it.hint}</span>}
            </DropdownPrimitive.Item>
          ))}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  )
}

/* ---------------- Tooltip ---------------- */
export const TooltipProvider = TooltipPrimitive.Provider
export function Tip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-[70] rounded-md bg-inverse px-2 py-1 text-[12px] font-semibold text-inverse-ink shadow-float animate-[fl-fade-in_100ms_ease-out]">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/* ---------------- Selection bar ---------------- */
/**
 * The white, raised bar that floats at the bottom centre while items are selected ("4 selected · Move · Hide · Download · Trash").
 * Children are the actions (Buttons, size="sm" or default). On phones it spans the width above the tab bar.
 */
export function SelectionBar({ open = true, label, children, onClear, className }: {
  open?: boolean; label: ReactNode; children: ReactNode; onClear?: () => void; className?: string
}) {
  if (!open) return null
  return (
    <div role="toolbar" aria-label="Selection"
      className={cn(
        'fixed z-30 flex items-center gap-1.5 rounded-card border border-line-2 bg-surface py-2 pl-4 pr-2.5 shadow-float animate-[fl-slide-up_160ms_ease-out]',
        'inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] overflow-x-auto scrollbar-none md:inset-x-auto md:bottom-6 md:left-1/2 md:max-w-[calc(100vw-48px)] md:-translate-x-1/2',
        className,
      )}>
      <b className="mr-2 shrink-0 whitespace-nowrap text-[13.5px] tnum">{label}</b>
      {children}
      {onClear && <button type="button" onClick={onClear} aria-label="Clear selection" className="ml-1 grid size-[34px] shrink-0 place-items-center rounded-control text-ink-2 hover:bg-sunk hover:text-ink"><X size={16} /></button>}
    </div>
  )
}

/* ---------------- Toasts ---------------- */
type ToastKind = 'success' | 'error' | 'info'
export interface ToastAction { label: string; onClick: () => void }
interface ToastItem { id: number; kind: ToastKind; title: string; body?: string; action?: ToastAction }
export interface ToastApi {
  /** Full control. With an `action` the toast stays 6 s (errors too); otherwise 3.5 s. */
  toast: (t: Omit<ToastItem, 'id' | 'kind'> & { kind?: ToastKind; duration?: number }) => void
  success: (title: string, body?: string) => void
  error: (title: string, body?: string) => void
  /** Rule 8 shorthand: `toast.undo('4 photos moved to Wedding', () => api.updatePhotos(ids, { albumId: from }))`. */
  undo: (title: string, onUndo: () => void, body?: string) => void
}
const ToastCtx = createContext<ToastApi | null>(null)

/** Toasts: a dark pill at the bottom centre (above the phone tab bar), with an optional gold action such as Undo. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const dismiss = useCallback((id: number) => {
    setItems((l) => l.filter((t) => t.id !== id))
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])
  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])
  const toast = useCallback<ToastApi['toast']>(({ duration, ...t }) => {
    const id = Date.now() + Math.random()
    setItems((l) => [...l.slice(-2), { kind: 'success', ...t, id }])
    timers.current.set(id, setTimeout(() => dismiss(id), duration ?? (t.action || t.kind === 'error' ? 6000 : 3500)))
  }, [dismiss])
  const api = useMemo<ToastApi>(() => ({
    toast,
    success: (title, body) => toast({ kind: 'success', title, body }),
    error: (title, body) => toast({ kind: 'error', title, body }),
    undo: (title, onUndo, body) => toast({ kind: 'success', title, body, action: { label: 'Undo', onClick: onUndo } }),
  }), [toast])
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-7">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex min-h-[44px] max-w-[min(520px,100%)] items-center gap-3 rounded-[10px] bg-inverse py-2.5 pl-4 pr-2 text-inverse-ink shadow-float animate-[fl-slide-up_160ms_ease-out]">
            <span className={cn('shrink-0', t.kind === 'error' ? 'text-inverse-bad' : t.kind === 'info' ? 'text-inverse-ink-2' : 'text-inverse-accent')}>
              {t.kind === 'success' ? <CheckCircle2 size={16} /> : t.kind === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold">{t.title}</div>
              {t.body && <div className="text-[12.5px] text-inverse-ink-2">{t.body}</div>}
            </div>
            {t.action
              ? <button type="button" className="shrink-0 rounded-md px-2.5 py-1.5 text-[13.5px] font-extrabold text-inverse-accent hover:bg-white/10" onClick={() => { t.action!.onClick(); dismiss(t.id) }}>{t.action.label}</button>
              : <button type="button" aria-label="Dismiss" className="grid size-7 shrink-0 place-items-center rounded-md text-inverse-ink-2 hover:bg-white/10" onClick={() => dismiss(t.id)}><X size={14} /></button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
