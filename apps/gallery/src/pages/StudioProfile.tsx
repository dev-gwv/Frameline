import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, AtSign, Check, ChevronDown, Copy, Globe, Lock, Mail, MessageCircle, Phone, Plus, SearchX } from 'lucide-react'
import { Button, Skeleton, Tip, cn, useToast } from '@frameline/ui'
import { fmt, toneCss, type PhotoEvent } from '@frameline/shared'
import { useEvents, useStudio } from '../lib/queries'
import { toggleFollow, useGuest } from '../lib/guest'
import { Container, StatePage } from '../components/common'
import { EnquirySheet } from '../components/EnquirySheet'
import { useBrandColor } from '../lib/brand'

/**
 * Studio content that has no API yet (services, questions) mirrors the admin "Studio app" screen.
 * TODO(api): api.getStudioProfile(followCode) → { studio, featured, services, faqs }.
 */
const SERVICES = [
  { name: 'Wedding coverage', price: 'From ₹1,50,000', detail: '2 photographers, 3 days, online gallery' },
  { name: 'Pre-wedding shoot', price: 'From ₹35,000', detail: 'Half day, 2 locations, 60 edits' },
  { name: 'Events and parties', price: 'From ₹18,000', detail: '4 hours, same-night preview' },
  { name: 'Family and baby', price: 'From ₹12,000', detail: 'At home or in studio, 40 edits' },
]
const FAQS = [
  { q: 'How long until we get photos?', a: 'Previews go live on the gallery the same night. The full edited set arrives within 3 weeks.' },
  { q: 'Do you travel outside Mumbai?', a: 'Yes — anywhere in India and abroad. Travel and stay are billed at cost.' },
  { q: 'Can guests order prints?', a: 'Yes. Guests can buy prints straight from the gallery; we print on matte paper and ship in about 5 days.' },
  { q: 'How do we book a date?', a: 'Send an enquiry with your date and city. A 30% advance confirms the booking.' },
]
const FEATURED_ORDER = ['6402F9F', '2A6F1C9', '91B7F3A', 'E4B0937']

export function StudioProfile() {
  const { followCode = '' } = useParams()
  const studioQ = useStudio()
  const eventsQ = useEvents()
  const follows = useGuest((s) => s.follows)
  const { toast } = useToast()
  const [enquire, setEnquire] = useState(false)
  useBrandColor(studioQ.data?.brandColor)

  if (studioQ.isLoading) return <Container className="flex flex-col gap-3 pt-10"><Skeleton className="h-16" /><Skeleton className="h-40" /><Skeleton className="h-40" /></Container>
  const studio = studioQ.data
  if (!studio || studio.followCode.toLowerCase() !== followCode.toLowerCase()) {
    return (
      <StatePage icon={<SearchX size={26} />} eyebrow={followCode.toUpperCase()} title="We couldn't find this studio" body="Check the follow code with your photographer. Codes start with FA-.">
        <Link to="/"><Button variant="primary" size="lg">Go to Frameline</Button></Link>
      </StatePage>
    )
  }
  const following = follows.includes(studio.followCode.toUpperCase())
  const events = eventsQ.data ?? []
  const featured = FEATURED_ORDER.map((s) => events.find((e) => e.shortId === s)).filter((e): e is PhotoEvent => !!e && e.status !== 'draft')

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); toast({ title: `${what} copied`, body: text }) }
    catch { toast({ kind: 'error', title: `Couldn't copy the ${what.toLowerCase()}`, body: 'Select the text and copy it instead.' }) }
  }

  const waNumber = studio.phone.replace(/[^\d]/g, '')

  return (
    <div className="min-h-dvh pb-12">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/92 backdrop-blur-md pt-safe">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2 sm:px-5">
          <Tip label="Frameline home"><Link to="/" aria-label="Frameline home" className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-sunk"><ArrowLeft size={20} /></Link></Tip>
          <span className="bg-brand grid size-8 shrink-0 place-items-center rounded-[9px] font-display text-[14px] font-bold" aria-hidden>{studio.name[0]}</span>
          <b className="min-w-0 flex-1 truncate font-display text-[16px]">{studio.name}</b>
          <Button variant={following ? 'secondary' : 'primary'} icon={following ? <Check size={15} /> : <Plus size={15} />} aria-pressed={following}
            onClick={() => { toggleFollow(studio.followCode); toast({ title: following ? `Unfollowed ${studio.name}` : `Following ${studio.name}`, body: following ? undefined : 'New events from this studio will show up on your home screen.' }) }}>
            {following ? 'Following' : 'Follow'}
          </Button>
        </div>
      </header>

      <Container className="flex max-w-3xl flex-col gap-7 pt-5">
        <section>
          <div className="eyebrow">{studio.city} · <span className="font-mono">{studio.followCode}</span></div>
          <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight">{studio.name}</h1>
          {studio.about && <p className="mt-1 text-[14px] text-ink-2">{studio.about}</p>}
        </section>

        <section aria-labelledby="feat-h">
          <h2 id="feat-h" className="eyebrow mb-2">Featured galleries</h2>
          {eventsQ.isLoading ? <div className="flex gap-2.5"><Skeleton className="h-40 w-32" /><Skeleton className="h-40 w-32" /></div> : (
            <ul className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0">
              {featured.map((e) => {
                const isPrivate = e.settings.access !== 'link' || e.settings.facePrivacy
                return (
                  <li key={e.id} className="w-[132px] shrink-0 snap-start sm:w-auto">
                    <Link to={`/${e.shortId.toLowerCase()}`} className="group block">
                      <div className="vignette relative aspect-[4/5] overflow-hidden rounded-card" style={{ background: toneCss(e.coverTones[0]) }}>
                        {isPrivate && <span className="absolute right-2 top-2 z-[1] grid size-6 place-items-center rounded-full bg-black/50 text-white" aria-label="Private gallery"><Lock size={12} /></span>}
                      </div>
                      <b className="mt-1.5 block truncate text-[13px] group-hover:underline">{e.name}</b>
                      <span className="block text-[11.5px] text-ink-3">{fmt.date(e.date)} · {e.city}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="svc-h">
          <h2 id="svc-h" className="eyebrow mb-1">Services</h2>
          <ul>
            {SERVICES.map((s) => (
              <li key={s.name} className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0">
                <div className="min-w-0"><b className="text-[14px]">{s.name}</b><div className="text-[12.5px] text-ink-2">{s.detail}</div></div>
                <span className="shrink-0 font-mono text-[12.5px] tnum">{s.price}</span>
              </li>
            ))}
          </ul>
          <Button variant="primary" size="lg" icon={<MessageCircle size={16} />} className="mt-2 w-full justify-center sm:w-auto" onClick={() => setEnquire(true)}>Send an enquiry</Button>
        </section>

        <section aria-labelledby="faq-h">
          <h2 id="faq-h" className="eyebrow mb-1">Questions</h2>
          <div>
            {FAQS.map((f) => (
              <details key={f.q} className="group border-t border-line py-3 first:border-t-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-bold [&::-webkit-details-marker]:hidden">
                  {f.q}<ChevronDown size={16} className="shrink-0 text-ink-3 transition group-open:rotate-180" />
                </summary>
                <p className="mt-1.5 text-[13px] text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="contact-h" className="rounded-card border border-line bg-surface p-4">
          <h2 id="contact-h" className="mb-2 text-[16px]">Contact</h2>
          <ContactRow icon={<Phone size={15} />} label="Phone" value={studio.phone} href={`tel:${studio.phone.replace(/\s/g, '')}`} onCopy={() => copy(studio.phone, 'Phone number')} />
          <ContactRow icon={<Mail size={15} />} label="Email" value={studio.email} href={`mailto:${studio.email}`} onCopy={() => copy(studio.email, 'Email')} />
          {studio.website && <ContactRow icon={<Globe size={15} />} label="Website" value={studio.website.replace(/^https?:\/\//, '')} href={studio.website} external />}
          {studio.instagram && <ContactRow icon={<AtSign size={15} />} label="Instagram" value={studio.instagram} href={`https://instagram.com/${studio.instagram.replace('@', '')}`} external />}
          <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi ${studio.name}, I found you on Frameline.`)}`} target="_blank" rel="noreferrer noopener" className="mt-3 block">
            <Button size="lg" icon={<MessageCircle size={16} />} className="w-full justify-center">WhatsApp {studio.name}</Button>
          </a>
        </section>
      </Container>
      <EnquirySheet open={enquire} onOpenChange={setEnquire} studio={studio} source="Studio profile" />
    </div>
  )
}

function ContactRow({ icon, label, value, href, onCopy, external }: { icon: ReactNode; label: string; value: string; href: string; onCopy?: () => void; external?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-accent-soft text-accent-text">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] text-ink-3">{label}</div>
        {/* Selectable text; tapping the link calls/emails */}
        <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})} className={cn('block select-text truncate text-[14px] font-semibold text-ink hover:underline', label !== 'Website' && 'font-mono text-[13px]')}>{value}</a>
      </div>
      {onCopy && <Tip label={`Copy ${label.toLowerCase()}`}><button type="button" aria-label={`Copy ${label.toLowerCase()}`} onClick={onCopy} className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-sunk hover:text-ink"><Copy size={15} /></button></Tip>}
    </div>
  )
}
