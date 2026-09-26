import { useLocalSearchParams } from 'expo-router'
import { GuestLinkScreen } from '@/components/GuestLinkScreen'

/** VIP link: https://frameline.in/v/<code>. VIP flags are honoured only when the API resolves a signed code. */
export default function VipLink() {
  const { code } = useLocalSearchParams<{ code: string }>()
  return <GuestLinkScreen kind="v" code={String(code ?? '')} />
}
