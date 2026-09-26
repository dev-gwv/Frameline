import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button, EmptyState } from '@frameline/ui'

export default function NotFound() {
  return (
    <EmptyState
      className="min-h-[70vh]" icon={<Compass size={24} />} title="There’s no page here"
      body="The link may be old, or the page was moved. Use search (⌘K) to find what you need."
      action={<Link to="/"><Button variant="primary">Go home</Button></Link>}
    />
  )
}
