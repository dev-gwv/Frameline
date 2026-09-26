import { router } from 'expo-router'
import { Screen, Txt } from '@/components'
import { JoinForm } from '@/components/guest'
import { API_MODE } from '@/lib/api'
import { useTheme } from '@/theme'

export default function Join() {
  const { c } = useTheme()
  return (
    <Screen contentStyle={{ gap: 14 }}>
      <Txt v="small">Type the 7-character code from your invitation or the venue standee, paste a gallery or personal link, or scan the QR.</Txt>
      <JoinForm autoFocus onDone={() => { if (router.canGoBack()) router.back() }} />
      {API_MODE === 'mock' ? <Txt v="small" center color={c.ink3}>Try the sample wedding: 6402F9F (PIN 5211)</Txt> : null}
    </Screen>
  )
}
