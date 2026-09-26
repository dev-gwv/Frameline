import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...v: ClassValue[]) => twMerge(clsx(v))

/* ---------------- Button ---------------- */
type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger' | 'side'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'
const buttonVariant: Record<ButtonVariant, string> = {
  primary: 'bg-gold text-accent-ink border-transparent shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_1px_2px_rgba(110,70,10,.3)] hover:brightness-105 active:brightness-95',
  secondary: 'bg-surface text-ink border-line-2 hover:bg-sunk',
  dark: 'bg-side text-side-gold border-side hover:bg-side-2',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-sunk hover:text-ink',
  danger: 'bg-surface text-bad border-line-2 hover:bg-bad-soft',
  side: 'bg-transparent text-side-ink border-side-line hover:bg-side-2',
}
const buttonSize: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-[7px]',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-control',
  lg: 'h-11 px-5 text-[14px] gap-2 rounded-[10px]',
  icon: 'h-9 w-9 justify-center rounded-control',
}
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap border font-bold transition-[background,filter,color] duration-150 disabled:opacity-50',
        buttonVariant[variant], buttonSize[size], className,
      )}
      {...rest}
    >
      {loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  )
})

/* ---------------- Chip ---------------- */
export type ChipTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'accent' | 'dark' | 'glass'
const chipTone: Record<ChipTone, string> = {
  neutral: 'bg-sunk text-ink-2',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  accent: 'bg-accent-soft text-accent-text',
  dark: 'bg-side text-side-gold',
  glass: 'bg-black/50 text-white backdrop-blur-sm',
}
export function Chip({ tone = 'neutral', dot, className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold', chipTone[tone], className)} {...rest}>
      {dot && <i className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

/* ---------------- Card ---------------- */
export function Card({ className, padded = true, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cn('rounded-card border border-line bg-surface', padded && 'p-4', className)} {...rest} />
}
export function CardHeader({ title, action, className, children }: { title: ReactNode; action?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={cn('mb-2.5 flex items-center justify-between gap-3', className)}>
      <h3 className="font-display text-[15px] font-semibold">{title}</h3>
      {children}
      {action}
    </div>
  )
}
export function DarkCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-side bg-side p-4 text-side-ink', className)} {...rest} />
}

/* ---------------- Form fields ---------------- */
export function Field({ label, hint, error, className, children, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <label htmlFor={htmlFor} className="text-[12px] font-bold text-ink-2">{label}</label>}
      {children}
      {error ? <span className="text-[11.5px] font-semibold text-bad">{error}</span> : hint ? <span className="text-[11.5px] text-ink-3">{hint}</span> : null}
    </div>
  )
}
const inputBase = 'w-full rounded-control border border-line-2 bg-surface px-3 text-[13px] text-ink placeholder:text-ink-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft'
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; suffix?: ReactNode }>(function Input({ className, icon, suffix, ...rest }, ref) {
  if (!icon && !suffix) return <input ref={ref} className={cn(inputBase, 'h-9', className)} {...rest} />
  return (
    <div className={cn('flex h-9 items-center gap-2 rounded-control border border-line-2 bg-surface px-3 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft', className)}>
      {icon && <span className="text-ink-3">{icon}</span>}
      <input ref={ref} className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3" {...rest} />
      {suffix}
    </div>
  )
})
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputBase, 'min-h-20 py-2 leading-relaxed', className)} {...rest} />
})
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(inputBase, 'h-9 appearance-none bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23958B7B' stroke-width='2.2' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}>
      {children}
    </select>
  )
})

/* ---------------- Toggle (switch) ---------------- */
export function Toggle({ checked, onCheckedChange, disabled, label, size = 'md' }: { checked: boolean; onCheckedChange?: (v: boolean) => void; disabled?: boolean; label?: string; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? { root: 'h-[15px] w-[26px]', thumb: 'size-[11px] data-[state=checked]:translate-x-[13px]' } : { root: 'h-[18px] w-[32px]', thumb: 'size-[14px] data-[state=checked]:translate-x-[16px]' }
  return (
    <SwitchPrimitive.Root
      checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label}
      className={cn('relative inline-flex shrink-0 items-center rounded-full bg-line-2 p-[2px] transition-colors data-[state=checked]:bg-gold disabled:opacity-50', s.root)}
    >
      <SwitchPrimitive.Thumb className={cn('block rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.25)] transition-transform', s.thumb)} />
    </SwitchPrimitive.Root>
  )
}

/* ---------------- Segmented control ---------------- */
export interface SegOption<T extends string> { value: T; label: ReactNode; icon?: ReactNode }
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md', stretch }: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; className?: string; size?: 'sm' | 'md'; stretch?: boolean }) {
  return (
    <div role="radiogroup" className={cn('inline-flex gap-0.5 rounded-[9px] border border-line bg-sunk p-[3px]', stretch && 'flex w-full', className)}>
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-[7px] font-bold transition',
            size === 'sm' ? 'px-2 py-1 text-[11.5px]' : 'px-2.5 py-1 text-[12px]',
            stretch && 'flex-1',
            value === o.value ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(40,28,10,.12)]' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------- Underline tabs ---------------- */
export function TabBar<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-5 overflow-x-auto border-b border-line scrollbar-thin', className)}>
      {tabs.map((t) => (
        <button
          key={t.value} role="tab" type="button" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cn('inline-flex shrink-0 items-center gap-1.5 pb-2.5 text-[13px] font-bold transition', value === t.value ? 'text-ink shadow-[inset_0_-2px_0_var(--accent)]' : 'text-ink-3 hover:text-ink-2')}
        >
          {t.label}
          {t.count !== undefined && <span className="font-mono text-[11px] font-medium text-ink-3">· {t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ---------------- Meter ---------------- */
export function Meter({ value, max = 100, className, height = 6 }: { value: number; max?: number; className?: string; height?: number }) {
  const w = Math.min(100, Math.max(0, (value / (max || 1)) * 100))
  return (
    <div className={cn('overflow-hidden rounded-full bg-sunk', className)} style={{ height }} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${w}%` }} />
    </div>
  )
}

/* ---------------- Misc ---------------- */
export function IconTile({ children, className, tone = 'accent' }: { children: ReactNode; className?: string; tone?: 'accent' | 'neutral' | 'dark' }) {
  return (
    <span className={cn('grid size-[30px] shrink-0 place-items-center rounded-control',
      tone === 'accent' && 'bg-accent-soft text-accent-text', tone === 'neutral' && 'bg-sunk text-ink-2', tone === 'dark' && 'bg-side-2 text-side-gold', className)}>
      {children}
    </span>
  )
}
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('rounded border border-line-2 px-1 font-mono text-[10.5px] text-ink-3', className)}>{children}</kbd>
}
export function Avatar({ name, className, tone = 'neutral' }: { name: string; className?: string; tone?: 'neutral' | 'dark' | 'accent' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')
  return (
    <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-extrabold',
      tone === 'dark' && 'bg-side text-side-gold', tone === 'accent' && 'bg-accent-soft text-accent-text', tone === 'neutral' && 'bg-sunk text-ink', className)}>
      {initials}
    </span>
  )
}
export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-line', className)} />
}
export function StepBadge({ n }: { n: number }) {
  return <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gold font-mono text-[11px] font-bold text-accent-ink">{n}</span>
}
