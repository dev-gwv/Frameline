import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Button } from '@frameline/ui'

/** Opens the shell's search (⌘K) palette; it listens for the shortcut on window. */
const openSearch = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, metaKey: true, bubbles: true }))

/** 404, including old /website links while the website builder is off. */
export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="grid min-h-[70vh] place-items-center px-4 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="font-display text-[64px] font-semibold leading-none text-gold">404</div>
        <h1 className="font-display text-[22px] font-semibold">This page isn’t here</h1>
        <p className="text-[14px] text-ink-2">It may have moved. Try search, or go back home.</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => navigate('/')}>Go home</Button>
          <Button icon={<Search size={15} />} onClick={openSearch}>Search</Button>
        </div>
      </div>
    </div>
  )
}
