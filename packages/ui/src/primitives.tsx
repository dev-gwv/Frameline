import { forwardRef, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Check } from 'lucide-react'

export const cn = (...v: ClassValue[]) => twMerge(clsx(v))

/* ---------------- Button ---------------- */
/**
 * - `primary`: gold. ONE per screen (the main action).
 * - `secondary` (default): outlined. `ghost`: plain text. `danger`: outlined red (remove, turn off).
 * - `destructive`: solid red, only for refund and delete forever (inside ConfirmDialog).
 * - `dark` / `side`: deprecated (old sidebar look); don't use in new work.
 * Sizes: `sm` 30px, `md` 38px (default), `lg` 46px (phone primary actions), `icon` 38px square (needs aria-label).
 */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive' | 'dark' | 'side'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'
const buttonVariant: Record<ButtonVariant, string> = {
  primary: 'bg-gold text-accent-ink border-transparent shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_1px_2px_rgba(110,70,10,.25)] hover:brightness-105 active:brightness-95',
  secondary: 'bg-surface text-ink border-line-2 hover:bg-sunk',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-sunk hover:text-ink',
  danger: 'bg-surface text-bad border-line-2 hover:bg-bad-soft',
  destructive: 'bg-bad text-white border-transparent hover:brightness-110',
  /** @deprecated */
  dark: 'bg-ink text-paper border-ink hover:brightness-110',
  /** @deprecated */
  side: 'bg-transparent text-ink-2 border-line-2 hover:bg-sunk',
}
const buttonSize: Record<ButtonSize, string> = {
  sm: 'h-[30px] px-[11px] text-[12.5px] gap-1.5 rounded-control',
  md: 'h-[38px] px-[15px] text-[13.5px] gap-[7px] rounded-control',
  lg: 'h-[46px] px-5 text-[15px] gap-2 rounded-control',
  icon: 'h-[38px] w-[38px] justify-center rounded-control',
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
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap border font-bold transition-[background,filter,color] duration-150 disabled:opacity-45',
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

/* ---------------- Chip (status only: always a dot or icon + a word) ---------------- */
export type ChipTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'accent' | 'dark' | 'glass'
const chipTone: Record<ChipTone, string> = {
  neutral: 'bg-sunk text-ink-2',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  accent: 'bg-accent-soft text-accent-text',
  dark: 'bg-ink text-paper',
  glass: 'bg-black/50 text-white backdrop-blur-sm',
}
/** `dot` defaults to true; pass `icon` to show an icon instead, or `dot={false}` for count badges. */
export function Chip({ tone = 'neutral', dot = true, icon, className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone; dot?: boolean; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-[9px] py-0.5 text-[11.5px] font-bold tnum', chipTone[tone], className)} {...rest}>
      {icon ?? (dot && <i className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />)}
      {children}
    </span>
  )
}

/* ---------------- Card ---------------- */
/** White card: 1px warm border, radius 12, very soft shadow. `padded` = 18px. */
export function Card({ className, padded = true, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cn('rounded-card border border-line bg-surface shadow-card', padded && 'p-[18px]', className)} {...rest} />
}
/** Card title: 15px extra-bold sans, optional one-line description and an action on the right. */
export function CardHeader({ title, description, action, className, children }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={cn('mb-2.5 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="font-sans text-[15px] font-extrabold tracking-normal">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>}
      </div>
      {children}
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}
/** @deprecated Rule 2: light everywhere except the photo viewer. Kept so old pages compile. */
export function DarkCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-side bg-side p-4 text-side-ink', className)} {...rest} />
}

/* ---------------- Form fields ---------------- */
export function Field({ label, hint, error, className, children, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className={cn('flex flex-col gap-[5px]', className)}>
      {label && <label htmlFor={htmlFor} className="text-[12.5px] font-bold text-ink-2">{label}</label>}
      {children}
      {error ? <span className="text-[12px] font-semibold text-bad" role="alert">{error}</span> : hint ? <span className="text-[12px] text-ink-3">{hint}</span> : null}
    </div>
  )
}
const inputBase = 'w-full rounded-control border border-line-2 bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-3 outline-none transition focus:border-accent focus:ring-[3px] focus:ring-accent-soft aria-[invalid=true]:border-bad'
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; suffix?: ReactNode }>(function Input({ className, icon, suffix, ...rest }, ref) {
  if (!icon && !suffix) return <input ref={ref} className={cn(inputBase, 'h-[38px]', className)} {...rest} />
  return (
    <div className={cn('flex h-[38px] items-center gap-2 rounded-control border border-line-2 bg-surface px-3 transition focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent-soft', className)}>
      {icon && <span className="text-ink-3">{icon}</span>}
      <input ref={ref} className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3" {...rest} />
      {suffix}
    </div>
  )
})
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputBase, 'min-h-[90px] py-2.5 leading-relaxed', className)} {...rest} />
})
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(inputBase, 'h-[38px] appearance-none bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238C8374' stroke-width='2.2' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}>
      {children}
    </select>
  )
})

/* ---------------- Toggle (switch) ---------------- */
export function Toggle({ checked, onCheckedChange, disabled, label, size = 'md', id }: { checked: boolean; onCheckedChange?: (v: boolean) => void; disabled?: boolean; label?: string; size?: 'sm' | 'md'; id?: string }) {
  const s = size === 'sm' ? { root: 'h-[15px] w-[26px]', thumb: 'size-[11px] data-[state=checked]:translate-x-[11px]' } : { root: 'h-[19px] w-[34px]', thumb: 'size-[15px] data-[state=checked]:translate-x-[15px]' }
  return (
    <SwitchPrimitive.Root
      id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label}
      className={cn('relative inline-flex shrink-0 items-center rounded-full bg-line-2 p-[2px] transition-colors data-[state=checked]:bg-accent disabled:opacity-50', s.root)}
    >
      <SwitchPrimitive.Thumb className={cn('block rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-transform', s.thumb)} />
    </SwitchPrimitive.Root>
  )
}

/* ---------------- Segmented control ---------------- */
export interface SegOption<T extends string> { value: T; label: ReactNode; icon?: ReactNode }
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md', stretch }: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; className?: string; size?: 'sm' | 'md'; stretch?: boolean }) {
  return (
    <div role="radiogroup" className={cn('inline-flex gap-0.5 rounded-[9px] bg-sunk p-[3px]', stretch && 'flex w-full', className)}>
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-[7px] font-bold transition',
            size === 'sm' ? 'px-2 py-1 text-[11.5px]' : 'px-3 py-[5px] text-[12.5px]',
            stretch && 'flex-1',
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------- Underline tabs ---------------- */
/** `count` shows a gold count badge (use it for things needing action). */
export function TabBar<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-[22px] overflow-x-auto border-b border-line scrollbar-none', className)}>
      {tabs.map((t) => (
        <button
          key={t.value} role="tab" type="button" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cn('inline-flex shrink-0 items-center gap-1.5 pb-2.5 text-[14px] font-bold transition', value === t.value ? 'text-ink shadow-[inset_0_-2px_0_var(--accent)]' : 'text-ink-3 hover:text-ink-2')}
        >
          {t.label}
          {!!t.count && <CountBadge n={t.count} />}
        </button>
      ))}
    </div>
  )
}
/** Small gold count ("3") for things needing action: tab badges, filter chips, Needs you. */
export function CountBadge({ n, className }: { n: number; className?: string }) {
  return <span className={cn('inline-grid min-w-[20px] place-items-center rounded-full bg-accent-soft px-1.5 text-[11.5px] font-bold leading-[18px] text-accent-text tnum', className)}>{n > 99 ? '99+' : n}</span>
}

/* ---------------- Meter ---------------- */
export function Meter({ value, max = 100, className, height = 6, tone = 'gold', label }: { value: number; max?: number; className?: string; height?: number; tone?: 'gold' | 'muted' | 'warn' | 'bad'; label?: string }) {
  const w = Math.min(100, Math.max(0, (value / (max || 1)) * 100))
  return (
    <div className={cn('overflow-hidden rounded-full bg-sunk', className)} style={{ height }} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', tone === 'gold' && 'bg-accent', tone === 'muted' && 'bg-line-2', tone === 'warn' && 'bg-warn', tone === 'bad' && 'bg-bad')} style={{ width: `${w}%` }} />
    </div>
  )
}

/* ---------------- Misc ---------------- */
export function IconTile({ children, className, tone = 'accent' }: { children: ReactNode; className?: string; tone?: 'accent' | 'neutral' | 'dark' }) {
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-control',
      tone === 'accent' && 'bg-accent-soft text-accent-text', tone === 'neutral' && 'bg-sunk text-ink-2', tone === 'dark' && 'bg-ink text-paper', className)}>
      {children}
    </span>
  )
}
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('rounded border border-line-2 px-1 font-sans text-[11px] font-semibold text-ink-3', className)}>{children}</kbd>
}
export function Avatar({ name, className, tone = 'accent' }: { name: string; className?: string; tone?: 'neutral' | 'dark' | 'accent' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-extrabold',
      tone === 'dark' && 'bg-ink text-paper', tone === 'accent' && 'bg-accent-soft text-accent-text', tone === 'neutral' && 'bg-sunk text-ink', className)} aria-hidden>
      {initials}
    </span>
  )
}
export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-line', className)} />
}
export function StepBadge({ n, done }: { n: number; done?: boolean }) {
  return (
    <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-extrabold tnum', done ? 'bg-accent text-white' : 'border-[1.5px] border-line-2 text-ink-2')}>
      {done ? <Check size={13} strokeWidth={3} /> : n}
    </span>
  )
}

/* ---------------- RadioCard ---------------- */
export interface RadioCardOption<T extends string> { value: T; title: ReactNode; description?: ReactNode; disabled?: boolean; /** Extra content under the description when selected. */ extra?: ReactNode }
/**
 * The spec's radio card: a bordered box with a radio dot, bold title and a one-line description.
 * Selected = gold border + gold-soft fill. Use inside RadioCardGroup (keyboard: arrows move).
 */
export function RadioCard({ checked, onSelect, title, description, disabled, extra, className, tabIndex }: {
  checked: boolean; onSelect: () => void; title: ReactNode; description?: ReactNode; disabled?: boolean; extra?: ReactNode; className?: string; tabIndex?: number
}) {
  return (
    <button
      type="button" role="radio" aria-checked={checked} disabled={disabled} tabIndex={tabIndex} onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-[10px] px-3 py-[11px] text-left transition disabled:opacity-45',
        checked ? 'border-[1.5px] border-accent bg-accent-soft' : 'border border-line bg-surface hover:border-line-2',
        className,
      )}
    >
      <span className={cn('mt-0.5 size-4 shrink-0 rounded-full', checked ? 'border-[5px] border-accent' : 'border-[1.5px] border-line-2')} aria-hidden />
      <span className="min-w-0 flex-1">
        <b className="block text-[13.5px] text-ink">{title}</b>
        {description && <span className="block text-[12.5px] text-ink-2">{description}</span>}
        {checked && extra}
      </span>
    </button>
  )
}
export function RadioCardGroup<T extends string>({ value, onChange, options, columns = 1, className, label }: {
  value: T; onChange: (v: T) => void; options: RadioCardOption<T>[]; columns?: 1 | 2 | 3; className?: string; /** Accessible name for the group. */ label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const onKey = (e: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) return
    e.preventDefault()
    const enabled = options.filter((o) => !o.disabled)
    const i = enabled.findIndex((o) => o.value === value)
    const next = enabled[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length]
    if (next) {
      onChange(next.value)
      requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus())
    }
  }
  return (
    <div ref={ref} role="radiogroup" aria-label={label} onKeyDown={onKey}
      className={cn('grid gap-2.5', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3', className)}>
      {options.map((o) => (
        <RadioCard key={o.value} checked={value === o.value} onSelect={() => onChange(o.value)} title={o.title} description={o.description}
          disabled={o.disabled} extra={o.extra} tabIndex={value === o.value ? 0 : -1} />
      ))}
    </div>
  )
}

/* ---------------- Filter chips ---------------- */
export interface FilterChipOption<T extends string> { value: T; label: ReactNode; count?: number; /** Show the count as a gold "needs action" badge. */ attention?: boolean }
/** Pill filters with counts (Everyone 38 · Picks 14 · Requests 2 · Uploads 12). Active = ink fill. */
export function FilterChips<T extends string>({ value, onChange, options, className, label }: { value: T; onChange: (v: T) => void; options: FilterChipOption<T>[]; className?: string; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={cn('inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold transition max-sm:min-h-[40px]',
              on ? 'border-ink bg-ink text-paper' : 'border-line-2 bg-surface text-ink-2 hover:text-ink')}>
            {o.label}
            {o.count !== undefined && (o.attention && o.count > 0 && !on
              ? <CountBadge n={o.count} />
              : <span className={cn('tnum', on ? 'text-paper/75' : 'text-ink-3')}>{o.count}</span>)}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Checklist steps ---------------- */
export interface ChecklistStep { id?: string; title: ReactNode; description?: ReactNode; done?: boolean; /** Button shown while not done (e.g. <Button size="sm">Add account</Button>). */ action?: ReactNode }
/**
 * Numbered steps that tick off (Sell first-run "Start selling in 3 steps", Home "Getting started").
 * Done steps show a gold check and a "Done" chip; the rest show their number and action.
 */
export function ChecklistSteps({ steps, title, showProgress = true, className }: { steps: ChecklistStep[]; title?: ReactNode; showProgress?: boolean; className?: string }) {
  const done = steps.filter((s) => s.done).length
  return (
    <div className={className}>
      {title && <div className="text-[15px] font-extrabold">{title}</div>}
      {showProgress && <Meter value={done} max={steps.length} className="mb-1.5 mt-2" label={`${done} of ${steps.length} done`} />}
      <ol>
        {steps.map((s, i) => (
          <li key={s.id ?? i} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
            <StepBadge n={i + 1} done={s.done} />
            <div className="min-w-0 flex-1">
              <b className="block text-[13.5px]">{s.title}</b>
              {s.description && <span className="block text-[12.5px] text-ink-2">{s.description}</span>}
            </div>
            {s.done ? <Chip tone="ok">Done</Chip> : s.action}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Horizontal wizard steps: ① Your studio — ② Your look — ③ First event. `current` is 0-based. */
export function StepIndicator({ steps, current, className }: { steps: ReactNode[]; current: number; className?: string }) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-2', className)} aria-label={`Step ${current + 1} of ${steps.length}`}>
      {steps.map((s, i) => (
        <li key={i} className={cn('flex items-center gap-2 text-[13px] font-bold', i === current ? 'text-ink' : 'text-ink-3')} aria-current={i === current ? 'step' : undefined}>
          {i > 0 && <span className="h-0.5 w-[34px] bg-line-2 max-sm:w-4" aria-hidden />}
          <span className={cn('grid size-6 place-items-center rounded-full text-[12px] font-extrabold',
            i < current ? 'bg-accent text-white' : i === current ? 'border-[1.5px] border-accent text-accent-text' : 'border-[1.5px] border-line-2')}>
            {i < current ? <Check size={13} strokeWidth={3} /> : i + 1}
          </span>
          <span className={cn(i !== current && 'max-sm:sr-only')}>{s}</span>
        </li>
      ))}
    </ol>
  )
}

/* ---------------- Page ---------------- */
/** Standard content column: max 1200px, 16px sides on phones, 24px from sm. */
export function PageBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-4 sm:px-6', className)} {...rest} />
}
