import { useCallback, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

/** Public guest gallery origin (apps/gallery). */
export const GALLERY_URL: string = (import.meta.env.VITE_GALLERY_URL ?? 'http://localhost:5174').replace(/\/$/, '')
/** Guest link for an event, e.g. https://frameline.in/6402F9F. */
export const galleryUrl = (shortId: string) => `${GALLERY_URL}/${shortId}`

/**
 * Search-param state helper. `set({ a: '1', b: undefined })` sets/removes keys, keeping the rest.
 * Pass `replace` for changes that shouldn't add a history entry (tabs inside a modal, filters).
 */
export function useParamState() {
  const [params, setParams] = useSearchParams()
  const set = useCallback((patch: Record<string, string | undefined | null>, replace = false) => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === null || v === '') n.delete(k); else n.set(k, v) }
      return n
    }, { replace })
  }, [setParams])
  return [params, set] as const
}

/**
 * The `?modal=` convention: every deep-linkable modal is opened by a search param, so links like
 * /events/:id?modal=share&tab=qr work from anywhere (search, Home, other tabs) and Back closes it.
 *   const m = useModalParam()
 *   <Button onClick={() => m.open('share', { tab: 'qr' })}>Share</Button>
 *   <ShareModal open={m.modal === 'share'} onOpenChange={(v) => !v && m.close()} />
 * `close()` also clears the extra keys you name (default: `tab`).
 */
export function useModalParam() {
  const [params, set] = useParamState()
  const modal = params.get('modal')
  const open = useCallback((name: string, extra: Record<string, string | undefined> = {}) => set({ modal: name, ...extra }), [set])
  const close = useCallback((clear: string[] = ['tab']) => set(Object.fromEntries([['modal', undefined], ...clear.map((k) => [k, undefined])])), [set])
  return { modal, params, open, close, set }
}

/** "‹ Events" style back link above a page or event title (rule 7: full pages get a Back link). */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-[28px] items-center gap-1 text-[12.5px] font-semibold text-ink-3 hover:text-ink-2">
      <ChevronLeft size={14} aria-hidden />{children}
    </Link>
  )
}
