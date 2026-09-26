import { View } from 'react-native'
import { Redirect } from 'expo-router'
import { useSessionChecked } from '@/lib/api'
import { useLocal } from '@/lib/local'
import { useTheme } from '@/theme'

/**
 * Launch router: first launch → audience chooser; then the chosen side of the app. In API mode the photographer
 * session is confirmed first (auth.isSignedIn / auth.me in ApiProvider).
 */
export default function Index() {
  const { c } = useTheme()
  const mode = useLocal((s) => s.mode)
  const session = useLocal((s) => s.studioSession)
  const checked = useSessionChecked()
  if (!mode) return <Redirect href="/onboarding" />
  if (mode === 'studio') {
    if (!checked) return <View style={{ flex: 1, backgroundColor: c.paper }} />
    return <Redirect href={session ? '/home' : '/sign-in'} />
  }
  return <Redirect href="/events" />
}
