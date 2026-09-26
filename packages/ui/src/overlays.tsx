import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { cn } from './primitives'

/* ---------------- Modal ---------------- */
export function Modal({
  open, onOpenChange, title, description, children, footer, width = 720, className, bodyClassName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
  className?: string
  bodyClassName?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(12,10,8,.55)] animate-[fl-fade-in_150ms_ease-out]" />
        <DialogPrimitive.Content
          className={cn('fixed left-1/2 top-[6vh] z-50 flex max-h-[88vh] w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-modal border border-line bg-surface shadow-card outline-none animate-[fl-slide-up_180ms_ease-out]', className)}
          style={{ maxWidth: width }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div>
              <DialogPrimitive.Title className="font-display text-[21px] font-semibold">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-[13px] text-ink-2">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{String(title)}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-ink-2 hover:bg-sunk hover:text-ink" aria-label="Close"><X size={18} /></DialogPrimitive.Close>
          </div>
          <div className={cn('min-h-0 flex-1 overflow-y-auto scrollbar-thin', bodyClassName)}>{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3 sm:px-6">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ---------------- Drawer (right side) ---------------- */
export function Drawer({ open, onOpenChange, title, description, children, footer, width = 480 }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(12,10,8,.55)] animate-[fl-fade-in_150ms_ease-out]" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-card outline-none animate-[fl-slide-left_200ms_ease-out]" style={{ maxWidth: width }}>
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
            <div>
              <DialogPrimitive.Title className="font-display text-[23px] font-semibold">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-[13px] text-ink-2">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{String(title)}</DialogPrimitive.Description>}
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
export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, danger, onConfirm }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} width={440}
      footer={<>
        <button type="button" className="h-9 rounded-control px-3.5 text-[13px] font-bold text-ink-2 hover:bg-sunk" onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className={cn('h-9 rounded-control px-3.5 text-[13px] font-bold', danger ? 'bg-bad text-white hover:brightness-110' : 'bg-gold text-accent-ink')} onClick={() => { onConfirm(); onOpenChange(false) }}>{confirmLabel}</button>
      </>}>
      <div className="px-6 py-4 text-[13.5px] text-ink-2">{body}</div>
    </Modal>
  )
}

/* ---------------- Dropdown menu ---------------- */
export interface MenuItem { label: ReactNode; icon?: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean; hint?: ReactNode }
export function Menu({ trigger, items, align = 'end', width = 220 }: { trigger: ReactNode; items: (MenuItem | 'separator')[]; align?: 'start' | 'end' | 'center'; width?: number }) {
  return (
    <DropdownPrimitive.Root modal={false}>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content align={align} sideOffset={6} className="z-50 rounded-card border border-line bg-surface p-1.5 shadow-card animate-[fl-fade-in_120ms_ease-out]" style={{ width }}>
          {items.map((it, i) => it === 'separator' ? <DropdownPrimitive.Separator key={i} className="my-1 h-px bg-line" /> : (
            <DropdownPrimitive.Item key={i} disabled={it.disabled} onSelect={it.onSelect}
              className={cn('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-semibold outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-sunk', it.danger ? 'text-bad' : 'text-ink')}>
              {it.icon && <span className={cn('shrink-0', !it.danger && 'text-ink-2')}>{it.icon}</span>}
              <span className="flex-1">{it.label}</span>
              {it.hint && <span className="text-[11px] font-medium text-ink-3">{it.hint}</span>}
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
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 rounded-md bg-side px-2 py-1 text-[11.5px] font-semibold text-side-ink shadow-card animate-[fl-fade-in_100ms_ease-out]">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/* ---------------- Toasts ---------------- */
type ToastKind = 'success' | 'error' | 'info'
interface ToastItem { id: number; kind: ToastKind; title: string; body?: string; action?: { label: string; onClick: () => void } }
interface ToastApi { toast: (t: Omit<ToastItem, 'id' | 'kind'> & { kind?: ToastKind }) => void; success: (title: string, body?: string) => void; error: (title: string, body?: string) => void }
const ToastCtx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const toast = useCallback<ToastApi['toast']>((t) => {
    const id = Date.now() + Math.random()
    setItems((l) => [...l.slice(-3), { kind: 'success', ...t, id }])
    setTimeout(() => dismiss(id), t.kind === 'error' ? 6000 : 3500)
  }, [dismiss])
  const api = useMemo<ToastApi>(() => ({
    toast,
    success: (title, body) => toast({ kind: 'success', title, body }),
    error: (title, body) => toast({ kind: 'error', title, body }),
  }), [toast])
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-card border border-line bg-surface px-3.5 py-2.5 shadow-card animate-[fl-slide-up_160ms_ease-out]">
            <span className={cn('mt-0.5', t.kind === 'success' && 'text-ok', t.kind === 'error' && 'text-bad', t.kind === 'info' && 'text-accent-text')}>
              {t.kind === 'success' ? <CheckCircle2 size={16} /> : t.kind === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold">{t.title}</div>
              {t.body && <div className="text-[12px] text-ink-2">{t.body}</div>}
            </div>
            {t.action && <button type="button" className="text-[12px] font-bold text-accent-text" onClick={() => { t.action!.onClick(); dismiss(t.id) }}>{t.action.label}</button>}
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
