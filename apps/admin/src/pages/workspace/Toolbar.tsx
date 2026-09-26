import { ArrowUpDown, ScanFace, Search, Upload, X } from 'lucide-react'
import { toneCss, type ID, type PhotoFilter, type PhotoSort } from '@frameline/shared'
import { Button, Menu, Segmented, Select, Tip } from '@frameline/ui'
import { usePeople } from '../../lib/queries'

export type ViewMode = 'scroll' | 'pages'

interface Props {
  eventId: ID
  sort: PhotoSort
  onSort: (s: PhotoSort) => void
  filter: PhotoFilter
  onFilter: (f: PhotoFilter) => void
  personId?: ID
  onPerson: (id?: ID) => void
  mode: ViewMode
  onMode: (m: ViewMode) => void
  onUpload: () => void
}

export function Toolbar({ eventId, sort, onSort, filter, onFilter, personId, onPerson, mode, onMode, onUpload }: Props) {
  const people = usePeople(eventId).data ?? []
  const person = people.find((p) => p.id === personId)
  const personName = (p: { name?: string }, i: number) => p.name ?? `Guest ${i + 1}`
  let unnamed = 0
  const items = people.map((p) => {
    const label = p.name ?? `Guest ${++unnamed}`
    return {
      label,
      hint: `${p.photoCount} photos`,
      icon: <span className="block size-6 rounded-full border border-line" style={{ background: toneCss(p.tone) }} aria-hidden />,
      onSelect: () => onPerson(p.id),
    }
  })
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="relative flex items-center">
          <span className="sr-only">Sort photos</span>
          <ArrowUpDown size={13} className="pointer-events-none absolute left-2.5 text-ink-3" />
          <Select value={sort} onChange={(e) => onSort(e.target.value as PhotoSort)} className="h-8 w-auto pl-7 text-[12.5px] font-bold">
            <option value="capture">Capture time</option>
            <option value="name">Name</option>
            <option value="sequence">Name sequence</option>
          </Select>
        </label>
        <div className="max-w-full overflow-x-auto scrollbar-thin">
          <Segmented<PhotoFilter> size="sm" value={filter} onChange={onFilter} options={[
            { value: 'all', label: 'All' },
            { value: 'people', label: 'People', icon: <ScanFace size={12} /> },
            { value: 'favourites', label: 'Favourites' },
            { value: 'hidden', label: 'Hidden' },
          ]} />
        </div>
        {person ? (
          <span className="inline-flex h-8 items-center gap-2 rounded-control border border-accent bg-accent-soft pl-1 pr-1.5 text-[12.5px] font-bold text-accent-text">
            <span className="block size-6 rounded-full" style={{ background: toneCss(person.tone) }} aria-hidden />
            {personName(person, people.filter((p) => !p.name).indexOf(person))}
            <Tip label="Show everyone"><button type="button" aria-label="Clear person filter" className="rounded p-0.5 hover:bg-surface" onClick={() => onPerson(undefined)}><X size={13} /></button></Tip>
          </span>
        ) : (
          <Menu align="start" width={250}
            trigger={<button type="button" className="inline-flex h-8 w-[170px] items-center gap-2 rounded-control border border-line-2 bg-surface px-2.5 text-[12.5px] text-ink-3 hover:text-ink-2"><Search size={13} />Find a person</button>}
            items={items.length ? items : [{ label: 'No people found yet', disabled: true }]}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <Segmented<ViewMode> size="sm" value={mode} onChange={onMode} options={[{ value: 'scroll', label: 'Scroll' }, { value: 'pages', label: 'Pages' }]} />
        <Button variant="primary" size="md" className="h-8" icon={<Upload size={14} />} onClick={onUpload}>Upload</Button>
      </div>
    </div>
  )
}
