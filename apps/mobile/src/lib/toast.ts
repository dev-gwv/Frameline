import { useSyncExternalStore } from 'react'

export interface ToastItem { id: number; kind: 'success' | 'error' | 'info'; title: string; detail?: string }

let items: ToastItem[] = []
let seq = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function push(kind: ToastItem['kind'], title: string, detail?: string) {
  const id = seq++
  items = [...items.slice(-2), { id, kind, title, detail }]
  emit()
  setTimeout(() => dismiss(id), kind === 'error' ? 5200 : 3000)
}

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

/** Global toasts (rendered by <ToastHost/> in the root layout). */
export const toast = {
  success: (title: string, detail?: string) => push('success', title, detail),
  error: (title: string, detail?: string) => push('error', title, detail),
  info: (title: string, detail?: string) => push('info', title, detail),
}

export const useToasts = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => items, () => items)
