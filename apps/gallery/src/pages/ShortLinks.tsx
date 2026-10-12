import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { QrCode, WifiOff } from 'lucide-react'
import { useApi } from '../lib/api'
import { isNetwork } from '../lib/errors'
import { CodeForm, StatePage, WideButton } from '../components/common'

/** /q/:slug — a printed smart QR. The API says which gallery it points at today (and counts the scan). */
export function QrLink() {
  const { slug = '' } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  const [error, setError] = useState<'missing' | 'offline' | null>(null)

  useEffect(() => {
    let cancelled = false
    api.resolveQr(slug)
      .then((r) => { if (!cancelled) navigate(`/${r.shortId.toLowerCase()}`, { replace: true }) })
      .catch((err) => { if (!cancelled) setError(isNetwork(err) ? 'offline' : 'missing') })
    return () => { cancelled = true }
  }, [api, slug, navigate])

  if (error === 'offline') {
    return (
      <StatePage icon={<WifiOff size={24} />} tone="neutral" title="You seem to be offline" body="We couldn’t open this QR code. Check your internet connection and try again.">
        <WideButton onClick={() => location.reload()}>Try again</WideButton>
      </StatePage>
    )
  }
  if (error) {
    return (
      <StatePage icon={<QrCode size={24} />} tone="neutral" title="This QR code isn’t in use" body="The studio may have removed it. Type the event code from the invitation instead.">
        <CodeForm />
      </StatePage>
    )
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-paper" aria-busy aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-ink-2">
        <span className="size-8 animate-spin rounded-full border-[3px] border-accent border-r-transparent" aria-hidden />
        <span className="text-[14px] font-semibold">Opening the gallery…</span>
      </div>
    </main>
  )
}

/** /follow/:code and /f/:code (the admin's and the app's share links) open the studio profile. */
export function FollowLink() {
  const { code = '' } = useParams()
  return <Navigate to={`/studio/${code.toLowerCase()}`} replace />
}

/** /app?code=<shortId> — the "open in the app" link. There is no app yet, so it opens the gallery on the web. */
export function AppLink() {
  const [params] = useSearchParams()
  const code = params.get('code')?.trim()
  return <Navigate to={code && /^[0-9a-z]{7}$/i.test(code) ? `/${code.toLowerCase()}` : '/'} replace />
}
