import { useCallback, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { cn } from '@frameline/ui'
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
    const url = auth.googleUrl(from)
    if (url) { setGoogleBusy(true); window.location.assign(url); return }
    // Sample data: there is no Google account to check, so continue as the demo studio.
    auth.signIn(DEMO_USER)
    finish({ user: DEMO_USER, isNewUser: false })
  }

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
