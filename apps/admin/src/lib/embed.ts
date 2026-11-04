/**
 * Frameline shown inside Studio AutoPilot's dashboard (its Projects → Gallery app page frames this site).
 *
 * The frame is signed in by Studio AutoPilot's single-use link (/v1/integrations/studioautopilot/sso), and its
 * sign-in lives in the frame's own browser storage. Google refuses to show its pages in a frame (sign-in, the Drive
 * consent, the Drive picker), so those steps are handed to Studio AutoPilot, which opens a signed-in Frameline tab
 * at that page (`openOutside`). Messages go only to a Studio AutoPilot page (or localhost while developing); the
 * studio site's frame-ancestors header lets no one else frame it anyway.
 *
 * Messages to the parent, all `{ source: 'frameline', type, ... }`:
 * - `ready`                  the app started in the frame
 * - `route`  { path }        the page changed (Studio AutoPilot reopens here next time)
 * - `open`   { path }        open this Frameline page in a new, signed-in tab
 * - `signed-out`             the frame has no session any more: load a fresh sign-in link
 * The parent says `{ source: 'studioautopilot', type: 'hello' }` once the frame loads.
 */

const PARENT = /^https:\/\/([a-z0-9-]+\.)*studioautopilot\.in$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

export const embedded = (() => {
  try { return window.self !== window.top } catch { return true }
})()

type Message = { type: 'ready' } | { type: 'route'; path: string } | { type: 'open'; path: string } | { type: 'signed-out' }

let parentOrigin: string | null = null
const waiting: Message[] = []

function send(m: Message) {
  if (parentOrigin) window.parent.postMessage({ source: 'frameline', ...m }, parentOrigin)
  else waiting.push(m)
}

if (embedded) {
  const known = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins?.[0]
  if (known && PARENT.test(known)) parentOrigin = known
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !PARENT.test(e.origin)) return
    const d = e.data as { source?: string; type?: string } | null
    if (d?.source !== 'studioautopilot' || d.type !== 'hello') return
    parentOrigin = e.origin
    for (const m of waiting.splice(0)) send(m)
  })
  document.documentElement.dataset.embedded = 'studioautopilot'
  send({ type: 'ready' })
}

/** Tells Studio AutoPilot something (nothing happens outside a frame). */
export function tellParent(m: Message) {
  if (embedded) send(m)
}

/**
 * Opens a Frameline page in its own tab, signed in, for steps Google won't do in a frame. Inside Studio AutoPilot it
 * asks the parent (which fetches a fresh sign-in link for that page); returns false when not embedded.
 */
export function openOutside(path: string): boolean {
  if (!embedded) return false
  send({ type: 'open', path })
  return true
}
