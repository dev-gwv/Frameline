import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Copy, Inbox, Mail, MessageSquareText, Phone, Search, StickyNote } from 'lucide-react'
import { DEMO_NOW, fmt, type Enquiry, type Studio } from '@frameline/shared'
import { Avatar, Button, Card, Chip, EmptyState, Input, Segmented, Skeleton, Textarea, Tip, useToast } from '@frameline/ui'
import { useEnquiries } from '../../lib/queries'
import { QueryError } from '../system'
import { useCopy, useLocalState } from './helpers'

type Filter = 'all' | 'new' | 'replied'

/** Enquiries inbox. Notes and "replied" status are kept in this browser until the API stores them. */
export function Enquiries({ studio }: { studio: Studio }) {
  const q = useEnquiries()
  const toast = useToast()
  const copy = useCopy(toast)
  const [notes, setNotes] = useLocalState<Record<string, string>>('frameline.enquiry-notes', {})
  const [replied, setReplied] = useLocalState<Record<string, boolean>>('frameline.enquiry-replied', {})
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const list = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (q.data ?? [])
      .filter((e) => filter === 'all' || (filter === 'replied' ? replied[e.id] : !replied[e.id]))
      .filter((e) => !s || [e.name, e.email, e.phone, e.message, e.source].some((v) => v.toLowerCase().includes(s)))
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [q.data, filter, search, replied])

  if (q.isError) return <QueryError error={q.error} retry={() => q.refetch()} />

  const newCount = (q.data ?? []).filter((e) => !replied[e.id]).length

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={filter} onChange={setFilter} options={[
            { value: 'all', label: `All · ${q.data?.length ?? 0}` },
            { value: 'new', label: `New · ${newCount}` },
            { value: 'replied', label: 'Replied' },
          ]} />
          <Input className="ml-auto w-full sm:w-64" icon={<Search size={14} />} placeholder="Search name, phone, message" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search enquiries" />
        </div>
        {q.isLoading ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36" />)
        ) : list.length === 0 ? (
          <Card>
            <EmptyState icon={<Inbox size={22} />} title={q.data?.length ? 'Nothing matches' : 'No enquiries yet'}
              body={q.data?.length ? 'Try another search or filter.' : 'When someone fills the contact form on your site or a gallery, it lands here and we notify you.'}
              action={q.data?.length ? <Button onClick={() => { setFilter('all'); setSearch('') }}>Clear filters</Button> : undefined} />
          </Card>
        ) : (
          list.map((e) => (
            <EnquiryCard key={e.id} e={e} note={notes[e.id] ?? e.note ?? ''} replied={!!replied[e.id]}
              onNote={(v) => { setNotes((n) => ({ ...n, [e.id]: v })); toast.success('Note saved') }}
              onReplied={(v) => setReplied((r) => ({ ...r, [e.id]: v }))}
              copy={copy} />
          ))
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Card>
          <div className="mb-2 flex items-center gap-2"><Bell size={15} className="text-accent-text" /><h3 className="text-[15px]">Who gets notified</h3></div>
          <ul className="flex flex-col gap-1.5 text-[12.5px]">
            <li className="flex items-center gap-2"><Mail size={13} className="text-ink-3" /><span className="truncate">{studio.email}</span><Chip className="ml-auto">Email</Chip></li>
            <li className="flex items-center gap-2"><Phone size={13} className="text-ink-3" /><span className="truncate">{studio.phone}</span><Chip className="ml-auto">WhatsApp</Chip></li>
          </ul>
          <Link to="/settings/notifications" className="mt-3 inline-block text-[12.5px] font-bold text-accent-text hover:underline">Change who’s notified</Link>
        </Card>
        <Card className="bg-sunk text-[12px] text-ink-2">
          Enquiries come from your website’s contact form, from galleries with “Allow enquiries” on, and from the studio app.
        </Card>
      </div>
    </div>
  )
}

function EnquiryCard({ e, note, replied, onNote, onReplied, copy }: {
  e: Enquiry; note: string; replied: boolean
  onNote: (v: string) => void; onReplied: (v: boolean) => void
  copy: (t: string, what?: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-3">
        <Avatar name={e.name} tone="accent" className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-[14px]">{e.name}</b>
            {replied ? <Chip tone="ok">Replied</Chip> : <Chip tone="accent" dot>New</Chip>}
            <span className="ml-auto text-[11.5px] text-ink-3" title={fmt.fullDateTime(e.at)}>{fmt.ago(e.at, DEMO_NOW)} · via {e.source}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            <ContactLine icon={<Phone size={12} />} value={e.phone} href={`tel:${e.phone.replace(/\s/g, '')}`} copy={copy} />
            <ContactLine icon={<Mail size={12} />} value={e.email} href={`mailto:${e.email}`} copy={copy} />
          </div>
          <p className="mt-2 flex gap-2 text-[13px] text-ink"><MessageSquareText size={14} className="mt-0.5 shrink-0 text-ink-3" />{e.message}</p>

          {editing ? (
            <div className="mt-3 flex flex-col gap-2">
              <Textarea autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)} placeholder="e.g. Sent quote on WhatsApp, follow up Friday" aria-label={`Note for ${e.name}`} maxLength={500} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setDraft(note); setEditing(false) }}>Cancel</Button>
                <Button size="sm" variant="primary" onClick={() => { onNote(draft.trim()); setEditing(false) }}>Save note</Button>
              </div>
            </div>
          ) : note ? (
            <button type="button" onClick={() => { setDraft(note); setEditing(true) }} className="mt-3 flex w-full items-start gap-2 rounded-control bg-sunk px-3 py-2 text-left text-[12.5px] text-ink-2 hover:text-ink">
              <StickyNote size={13} className="mt-0.5 shrink-0" /><span className="flex-1">{note}</span><span className="text-[11px] font-bold text-accent-text">Edit</span>
            </button>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { window.open(`https://wa.me/${e.phone.replace(/\D/g, '')}`, '_blank', 'noopener'); onReplied(true) }}>Reply on WhatsApp</Button>
            <Button size="sm" onClick={() => { location.href = `mailto:${e.email}?subject=${encodeURIComponent('Your enquiry')}`; onReplied(true) }}>Email</Button>
            {!note && !editing && <Button size="sm" variant="ghost" icon={<StickyNote size={12} />} onClick={() => { setDraft(''); setEditing(true) }}>Add note</Button>}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onReplied(!replied)}>{replied ? 'Mark as new' : 'Mark as replied'}</Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function ContactLine({ icon, value, href, copy }: { icon: ReactNode; value: string; href: string; copy: (t: string, what?: string) => void }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-ink-3">{icon}</span>
      <a href={href} className="select-text font-mono text-[12px] hover:underline">{value}</a>
      <Tip label="Copy"><button type="button" aria-label={`Copy ${value}`} onClick={() => copy(value, 'Copied')} className="rounded p-0.5 text-ink-3 hover:bg-sunk hover:text-ink"><Copy size={12} /></button></Tip>
    </span>
  )
}
