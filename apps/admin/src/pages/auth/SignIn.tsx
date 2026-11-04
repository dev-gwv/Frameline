import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, LogoMark, cn } from '@frameline/ui'
import { embedded, tellParent } from '../../lib/embed'
import { DEMO_USER, useAuth, type VerifyResult } from '../../lib/auth'
import { safeDestination } from './signin/authHelpers'
import { PhotoPanel } from './signin/PhotoPanel'
import { SignInForm, type SignInView } from './signin/SignInForm'

/**
 * /login: sign in and sign up in one flow. Form left, photo right; the code and forgot-password
 * steps use one centred column. New studios continue to /setup; everyone else goes back to where
 * they were (?from= or the redirect state), including after "signed out for safety" (?expired=1).
 */
export default function SignIn() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [googleBusy, setGoogleBusy] = useState(false)
  const [view, setView] = useState<SignInView>('start')
  const onView = useCallback((v: SignInView) => setView(v), [])
  const from = safeDestination((location.state as { from?: string } | null)?.from ?? params.get('from'))
  const expired = params.get('expired') === '1'
  const googleError = params.get('error')

  const finish = (r: VerifyResult) => navigate(r.isNewUser ? '/setup' : from, { replace: true })

  const google = () => {
    // Must land back on /auth/callback (not `from` directly) — that's the only page that reads the
    // tokens out of the URL fragment. `from` rides along as a query param and is applied from there.
    const url = auth.googleUrl(`/auth/callback?from=${encodeURIComponent(from)}`)
    if (url) { setGoogleBusy(true); window.location.assign(url); return }
    // Sample data: there is no Google account to check, so continue as the demo studio.
    auth.signIn(DEMO_USER)
    finish({ user: DEMO_USER, isNewUser: false })
  }

  // Inside Studio AutoPilot, Google's sign-in can't open in the frame: Studio AutoPilot signs the person in again.
  if (embedded) return <EmbeddedSignedOut />

  const form = <SignInForm onDone={finish} onGoogle={google} googleBusy={googleBusy} expired={expired} googleError={googleError} onView={onView} />

  // One tree for every step so the form keeps its state when the layout changes.
  const start = view === 'start'
  return (
    <div className={cn('grid min-h-dvh bg-surface', start && 'lg:grid-cols-2')}>
      <div className="grid place-items-center px-4 py-10 sm:px-6">
        <div className={cn('w-full', start ? 'max-w-[380px]' : 'max-w-[400px]')}>{form}</div>
      </div>
      {start && <PhotoPanel />}
    </div>
  )
}

/**
 * /login inside Studio AutoPilot: the frame's session ended (or a Studio AutoPilot link failed). Studio AutoPilot
 * loads a fresh sign-in link when told; the button asks again.
 */
function EmbeddedSignedOut() {
  const [params] = useSearchParams()
  const error = params.get('error')
  useEffect(() => { if (!error) tellParent({ type: 'signed-out' }) }, [error])
  const why = error === 'sa_studio_not_set_up'
    ? 'Your studio owner hasn’t opened the gallery yet. Once they do, you can use it here too.'
    : error === 'sa_not_configured'
      ? 'The gallery isn’t connected to Studio AutoPilot on this server yet.'
      : error ? 'That sign-in link didn’t work.' : 'Signing you in again…'
  return (
    <div className="grid min-h-dvh place-items-center bg-surface px-4">
      <div className="flex max-w-[360px] flex-col items-center gap-3 text-center">
        <LogoMark size={32} />
        <p className="text-[14.5px] text-ink-2">{why}</p>
        {error !== 'sa_studio_not_set_up' && error !== 'sa_not_configured' && (
          <Button variant="primary" onClick={() => tellParent({ type: 'signed-out' })}>Sign in again</Button>
        )}
      </div>
    </div>
  )
}
