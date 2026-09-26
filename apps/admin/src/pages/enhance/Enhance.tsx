import { useParams } from 'react-router-dom'
import { useUsage } from '../../lib/queries'
import { Editor } from './Editor'
import { Picker } from './Picker'
import { useSpentCredits } from './presets'

/** /enhance → photo picker; /enhance/:photoId → before/after editor. */
export default function Enhance() {
  const { photoId } = useParams()
  const usage = useUsage().data
  const { spent, spend } = useSpentCredits()
  // Wallet credits minus what this browser has spent (API has no debit call yet).
  const credits = usage ? Math.max(0, usage.walletCredits - spent) : undefined
  return photoId ? <Editor key={photoId} photoId={photoId} credits={credits} spend={spend} /> : <Picker credits={credits} />
}
