import { Compass } from 'lucide-react'
import { CodeForm, StatePage } from '../components/common'

/** 404: the link is incomplete; the way forward is the event code. */
export function NotFound() {
  return (
    <StatePage icon={<Compass size={24} />} tone="neutral" title="This page doesn’t exist" body="The link may be cut off. Type the event code from your invite to open your photos.">
      <CodeForm />
    </StatePage>
  )
}
