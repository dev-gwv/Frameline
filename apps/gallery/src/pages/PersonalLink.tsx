import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Link2Off, WifiOff } from 'lucide-react'
import { Button } from '@frameline/ui'
import { decodeGuestLink, type GuestLinkPayload, type GuestSession } from '@frameline/shared'
import { useApi } from '../lib/api'
import { authFrom, guest } from '../lib/guest'
import { isNetwork } from '../lib/errors'
import { StatePage } from '../components/common'

type LinkError = 'bad' | 'missing' | 'offline'

/**
 * /s/:code (album + face links) and /v/:code (VIP links).
 * The API resolves the code first (signed short codes, or unsigned tokens in the README format) and may hand back
 * a ready guest session for VIP links with an embedded PIN or "see all". If the API doesn't know the code, the
 * token is decoded locally; its VIP flags are then ignored because anyone could forge them.
 */
export function PersonalLink() {
  const { token = '' } = useParams()
  const { pathname } = useLocation()
  const isVipPath = pathname.startsWith('/v/')
  const api = useApi()
  const navigate = useNavigate()
  const [error, setError] = useState<LinkError | null>(null)

  useEffect(() => {
    let cancelled = false
    async function open() {
      let payload: GuestLinkPayload | null = null
      let session: GuestSession | undefined
      let trusted = false
      try {
        const r = await api.resolveGuestLink(token)
        payload = r.payload
        session = r.session
        trusted = r.kind === 'v' && isVipPath
      } catch (err) {
        if (isNetwork(err)) throw err
        payload = decodeGuestLink(token)
      }
      if (!payload) { setError('bad'); return }
      const event = await api.getPublicEvent(payload.e)
      if (cancelled) return
      const vip = trusted && payload.vip ? { skipLogin: !!payload.vip.skipLogin, pin: !!payload.vip.pin, all: !!payload.vip.all } : undefined
      const albumOk = !!payload.album && event.albums.some((a) => a.id === payload!.album)
      const me = payload.me
      const personId = payload.p
      const name = payload.n
      guest.patchSession(event.shortId, (s) => ({
        ...(name ? { greeting: name } : {}),
        ...(vip ? { vip } : {}),
        ...(session ? { auth: authFrom(session, s.auth) } : {}),
        ...(session && vip?.pin ? { pin: s.pin === 'typed' ? 'typed' : 'embedded' } : {}),
        ...(vip?.skipLogin ? { webChosen: true } : {}),
        // Face link: the person comes with the link, or is looked up by face search (same key every time).
        ...(me ? { match: { personId, key: personId ? undefined : `${event.id}:link:${name ?? token}`, at: new Date().toISOString(), via: 'link' as const } } : {}),
      }))
      const base = `/${event.shortId.toLowerCase()}`
      navigate(me ? `${base}/me` : albumOk ? `${base}/a/${payload.album}` : base, { replace: true })
    }
    open().catch((err) => {
      if (cancelled) return
      // Unknown event (404) or a blocked/removed gallery both read as "no longer here".
      setError(isNetwork(err) ? 'offline' : 'missing')
    })
    return () => { cancelled = true }
  }, [api, token, isVipPath, navigate])

  if (error === 'offline') {
    return (
      <StatePage icon={<WifiOff size={26} />} title="You seem to be offline" body="We couldn't open your link. Check your internet connection and try again.">
        <Button variant="primary" size="lg" onClick={() => location.reload()}>Try again</Button>
      </StatePage>
    )
  }
  if (error) {
    return (
      <StatePage icon={<Link2Off size={26} />} title={error === 'bad' ? 'This link is broken' : 'This gallery is no longer here'}
        body={error === 'bad'
          ? 'Part of the link may be missing — try copying the whole link from the message again, or enter the event code instead.'
          : 'The event in this link was removed or the link is out of date. Ask the host for a new link.'}>
        <Link to="/"><Button variant="primary" size="lg">Enter an event code</Button></Link>
      </StatePage>
    )
  }
  return (
    <main className="grid min-h-dvh place-items-center" aria-busy aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-ink-2">
        <span className="size-7 animate-spin rounded-full border-[3px] border-accent border-r-transparent" aria-hidden />
        <span className="text-[13px]">Opening your photos…</span>
      </div>
    </main>
  )
}
