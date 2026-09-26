import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { DEMO_USER, useAuth, type VerifyResult } from '../../lib/auth'
import { safeDestination } from './signin/authHelpers'
import { ShowcaseHeader, ShowcasePanel } from './signin/ShowcasePanel'
import { SignInForm } from './signin/SignInForm'

/** /login — sign-in and sign-up in one flow. New studios continue to /setup. */
export default function SignIn() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [googleBusy, setGoogleBusy] = useState(false)
  const from = safeDestination((location.state as { from?: string } | null)?.from ?? params.get('from'))
  const expired = params.get('expired') === '1'

  const finish = (r: VerifyResult) => navigate(r.isNewUser ? '/setup' : from, { replace: true })

  const google = () => {
    const url = auth.googleUrl(from)
    if (url) { setGoogleBusy(true); window.location.assign(url); return }
    // Sample data: there is no Google account to check, so continue as the demo studio.
    auth.signIn(DEMO_USER)
    finish({ user: DEMO_USER, isNewUser: false })
  }

  return (
    <div className="flex min-h-full flex-col bg-surface lg:grid lg:grid-cols-[1.1fr_1fr]">
      <ShowcasePanel />
      <ShowcaseHeader />
      <div className="grid flex-1 place-items-center px-4 py-8 sm:px-7">
        <div className="w-full max-w-[360px]">
          <SignInForm onDone={finish} onGoogle={google} googleBusy={googleBusy}
            notice={expired ? 'Your session expired, sign in again.' : undefined} />
        </div>
      </div>
    </div>
  )
}
