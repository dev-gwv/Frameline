import { useParams } from 'react-router-dom'
import { useUsage } from '../../lib/queries'
import { Editor } from './Editor'
import { Picker } from './Picker'

/** /enhance → photo picker; /enhance/:photoId → before/after editor. Credits are the wallet balance from the API. */
export default function Enhance() {
  const { photoId } = useParams()
  const credits = useUsage().data?.walletCredits
  return photoId ? <Editor key={photoId} photoId={photoId} credits={credits} /> : <Picker credits={credits} />
}
