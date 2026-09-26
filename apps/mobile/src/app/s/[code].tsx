import { useLocalSearchParams } from 'expo-router'
import { GuestLinkScreen } from '@/components/GuestLinkScreen'

/** Personal album / face link: https://frameline.in/s/<code> (rewritten by +native-intent). */
export default function SharedLink() {
  const { code } = useLocalSearchParams<{ code: string }>()
  return <GuestLinkScreen kind="s" code={String(code ?? '')} />
}
