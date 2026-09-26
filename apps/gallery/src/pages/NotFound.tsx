import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@frameline/ui'
import { StatePage } from '../components/common'

export function NotFound() {
  return (
    <StatePage icon={<Compass size={26} />} title="This page doesn't exist" body="The link may be incomplete. Enter your event code to open your photos.">
      <Link to="/"><Button variant="primary" size="lg">Enter an event code</Button></Link>
    </StatePage>
  )
}
