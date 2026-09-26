import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Link2Off } from 'lucide-react'
import { Button } from '@frameline/ui'
import { useApi } from '../lib/api'
import { decodeGuestLink } from '../lib/link'
import { guest } from '../lib/guest'
import { StatePage } from '../components/common'
import { personFor } from '../components/SelfieFlow'

/**
 * /s/:token (album + face links) and /v/:token (VIP links).
 * Applies the link's greeting, VIP flags and face match to this device, then redirects.
 */
export function PersonalLink() {
  const { token = '' } = useParams()
  const { pathname } = useLocation()
  const isVip = pathname.startsWith('/v/')
  const api = useApi()
  const navigate = useNavigate()
  const [error, setError] = useState<'bad' | 'missing' | null>(null)

  useEffect(() => {
    const data = decodeGuestLink(token)
    if (!data) { setError('bad'); return }
    let cancelled = false
    api.getEvent(data.e).then(async (event) => {
      if (cancelled) return
      const vip = isVip && data.vip ? { skipLogin: !!data.vip.skipLogin, pin: !!data.vip.pin, all: !!data.vip.all } : undefined
      let albumOk = false
      if (data.album) albumOk = (await api.listAlbums(event.id)).some((a) => a.id === data.album)
      guest.patchSession(event.shortId, (s) => ({
        ...(data.n ? { greeting: data.n } : {}),
        ...(vip ? { vip } : {}),
        ...(vip?.pin ? { pin: s.pin === 'typed' ? 'typed' : 'embedded' } : {}),
        ...(vip?.skipLogin ? { webChosen: true } : {}),
        ...(data.me ? { match: { personId: data.p ?? personFor(`${event.id}:${data.n ?? token}`), at: new Date().toISOString(), via: 'link' as const } } : {}),
      }))
      const base = `/${event.shortId.toLowerCase()}`
      navigate(data.me ? `${base}/me` : albumOk ? `${base}/a/${data.album}` : base, { replace: true })
    }).catch(() => { if (!cancelled) setError('missing') })
    return () => { cancelled = true }
  }, [api, token, isVip, navigate])

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
