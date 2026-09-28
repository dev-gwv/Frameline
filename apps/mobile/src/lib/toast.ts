import { useSyncExternalStore } from 'react'

export interface ToastAction { label: string; onPress: () => void }
export interface ToastItem { id: number; kind: 'success' | 'error' | 'info'; title: string; detail?: string; action?: ToastAction }

/** How long an Undo toast stays up. */
export const UNDO_MS = 6000

let items: ToastItem[] = []
let seq = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function push(kind: ToastItem['kind'], title: string, detail?: string, action?: ToastAction, duration?: number) {
  const id = seq++
  items = [...items.slice(-1), { id, kind, title, detail, action }]
  emit()
  setTimeout(() => dismiss(id), duration ?? (action ? UNDO_MS : kind === 'error' ? 5200 : 3000))
  return id
}

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

/**
 * Global toasts: a dark pill at the bottom (above the tab bar), rendered by <ToastHost/> in the root layout.
 * `undo` is the rule-8 toast: the action already happened; the gold Undo reverses it.
 */
export const toast = {
  success: (title: string, detail?: string) => push('success', title, detail),
  error: (title: string, detail?: string) => push('error', title, detail),
  info: (title: string, detail?: string) => push('info', title, detail),
  action: (title: string, action: ToastAction, detail?: string) => push('success', title, detail, action),
  undo: (title: string, onUndo: () => void, detail?: string) => push('success', title, detail, { label: 'Undo', onPress: onUndo }),
}

export const useToasts = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => items, () => items)
