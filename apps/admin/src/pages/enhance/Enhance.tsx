import { useParams } from 'react-router-dom'
import { useWalletBalance } from '../../lib/queries'
import { Editor } from './Editor'
import { Picker } from './Picker'

/**
 * /enhance → "Pick a photo"; /enhance/:photoId → before/after editor. Saves are paid from the wallet
 * (`useWalletBalance().data.balance`: the API takes added money first, then sales); non-owners get a 403 there, so the balance is just hidden.
 */
export default function Enhance() {
  const { photoId } = useParams()
  const wallet = useWalletBalance().data?.balance
  return photoId ? <Editor key={photoId} photoId={photoId} wallet={wallet} /> : <Picker wallet={wallet} />
}
