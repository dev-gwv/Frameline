import { Redirect } from 'expo-router'
import { useLocal } from '@/lib/local'

/** Launch router: first launch → audience chooser; then the chosen side of the app. */
export default function Index() {
  const mode = useLocal((s) => s.mode)
  const session = useLocal((s) => s.studioSession)
  if (!mode) return <Redirect href="/onboarding" />
  if (mode === 'studio') return <Redirect href={session ? '/home' : '/sign-in'} />
  return <Redirect href="/events" />
}
