import type { Persistence } from './api'

interface StorageEventLike { key: string | null; newValue: string | null }
interface WindowLike {
  localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void }
  addEventListener?(type: 'storage', fn: (e: StorageEventLike) => void): void
  removeEventListener?(type: 'storage', fn: (e: StorageEventLike) => void): void
}

/**
 * Mock API data in localStorage under `key`, kept in sync across tabs: another tab's write arrives as a `storage`
 * event and `createMockApi` takes that copy. Safe where there's no window or localStorage (React Native, tests):
 * then it simply doesn't persist.
 *
 *   createMockApi(localStoragePersistence('frameline.mock.v1'))
 */
export function localStoragePersistence(key: string): Persistence {
  const w = () => globalThis as unknown as WindowLike
  const ls = () => { try { return w().localStorage } catch { return undefined } }
  return {
    load: () => { try { return ls()?.getItem(key) ?? null } catch { return null } },
    save: (data) => { try { ls()?.setItem(key, data) } catch { /* quota or private mode */ } },
    subscribe(onChange) {
      const win = w()
      if (typeof win.addEventListener !== 'function') return () => {}
      const handler = (e: StorageEventLike) => { if (e.key === key) onChange(e.newValue) }
      win.addEventListener('storage', handler)
      return () => win.removeEventListener?.('storage', handler)
    },
  }
}

/** In-memory store shared by several mock instances (tests): a write by one instance notifies the others. */
export function sharedMemoryPersistence(): () => Persistence {
  let data: string | null = null
  const subs = new Set<(raw: string | null) => void>()
  return () => {
    let mine: ((raw: string | null) => void) | undefined
    return {
      load: () => data,
      save: (d) => { data = d; subs.forEach((fn) => { if (fn !== mine) fn(d) }) },
      subscribe(onChange) { mine = onChange; subs.add(onChange); return () => { subs.delete(onChange) } },
    }
  }
}
