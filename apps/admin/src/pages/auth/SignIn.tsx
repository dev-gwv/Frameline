import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { ShowcaseHeader, ShowcasePanel } from './signin/ShowcasePanel'
import { SignInForm } from './signin/SignInForm'
import { DEMO_EMAIL, DEMO_NAME, isDemo, nameFromEmail } from './signin/mockAuth'

/** /login — sign-in and sign-up in one flow. New studios continue to /setup. */
export default function SignIn() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const finish = (email: string) => {
    if (isDemo(email)) {
      signIn({ id: 'u1', name: DEMO_NAME, email: DEMO_EMAIL, role: 'owner' })
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } else {
      signIn({ id: 'u1', name: nameFromEmail(email), email: email.toLowerCase(), role: 'owner' })
      navigate('/setup', { replace: true })
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-surface lg:grid lg:grid-cols-[1.1fr_1fr]">
      <ShowcasePanel />
      <ShowcaseHeader />
      <div className="grid flex-1 place-items-center px-4 py-8 sm:px-7">
        <div className="w-full max-w-[360px]">
          <SignInForm onSuccess={finish} onGoogle={() => finish(DEMO_EMAIL)} />
        </div>
      </div>
    </div>
  )
}
