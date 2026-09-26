import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, AtSign, Check, ChevronDown, Copy, Globe, Mail, MessageCircle, Phone, Plus, SearchX } from 'lucide-react'
import { Button, Skeleton, Tip, cn, useToast } from '@frameline/ui'
import { fmt, toneCss } from '@frameline/shared'
import { useApi } from '../lib/api'
import { useStudioProfile } from '../lib/queries'
import { setFollowing, useGuest } from '../lib/guest'
import { friendlyError, isNotFound } from '../lib/errors'
import { Container, StatePage } from '../components/common'
import { EnquirySheet } from '../components/EnquirySheet'
import { useBrandColor } from '../lib/brand'

/**
 * Studio profile from api.getStudioProfile(followCode | handle): featured galleries, services, questions and
 * testimonials as the studio set them up in the admin "Studio app" screen. Follow → api.followStudio.
 */
export function StudioProfile() {
  const { followCode = '' } = useParams()
  const api = useApi()
  const profileQ = useStudioProfile(followCode)
  const follows = useGuest((s) => s.follows)
  const { toast } = useToast()
  const [enquire, setEnquire] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  useBrandColor(profileQ.data?.studio.brandColor)

  if (profileQ.isLoading) return <Container className="flex flex-col gap-3 pt-10"><Skeleton className="h-16" /><Skeleton className="h-40" /><Skeleton className="h-40" /></Container>
  if (profileQ.isError && !isNotFound(profileQ.error)) {
    const f = friendlyError(profileQ.error, 'The studio page didn’t load')
    return (
      <StatePage icon={<SearchX size={26} />} eyebrow={followCode.toUpperCase()} title={f.title} body={f.body}>
        <Button variant="primary" size="lg" onClick={() => void profileQ.refetch()}>Try again</Button>
      </StatePage>
    )
  }
  const profile = profileQ.data
  if (!profile) {
    return (
      <StatePage icon={<SearchX size={26} />} eyebrow={followCode.toUpperCase()} title="We couldn't find this studio" body="Check the follow code with your photographer. Codes start with FA-.">
        <Link to="/"><Button variant="primary" size="lg">Go to Frameline</Button></Link>
      </StatePage>
    )
  }
  const studio = profile.studio
  const following = follows.includes(studio.followCode.toUpperCase())
  const featured = profile.featured

  /** Follow / unfollow go to the API (the studio's follower count); the device remembers which studios it follows. */
  async function toggleFollow() {
    setFollowBusy(true)
    try {
      if (following) {
        await api.unfollowStudio(studio.followCode)
        setFollowing(studio.followCode, false)
        toast({ title: `Unfollowed ${studio.name}` })
      } else {
        await api.followStudio(studio.followCode)
        setFollowing(studio.followCode, true)
        toast({ title: `Following ${studio.name}`, body: 'New events from this studio will show up on your home screen.' })
      }
      void profileQ.refetch()
    } catch (err) {
      const f = friendlyError(err, following ? 'Couldn’t unfollow the studio' : 'Couldn’t follow the studio')
      toast({ kind: 'error', title: f.title, body: f.body })
    } finally { setFollowBusy(false) }
  }

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
            loading={followBusy} onClick={() => void toggleFollow()}>
            {following ? 'Following' : 'Follow'}
          </Button>
        </div>
      </header>

      <Container className="flex max-w-3xl flex-col gap-7 pt-5">
        <section>
          <div className="eyebrow">{studio.city} · <span className="font-mono">{studio.followCode}</span>{studio.followers > 0 && <> · {fmt.count(studio.followers)} followers</>}</div>
          <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight">{studio.name}</h1>
          {studio.about && <p className="mt-1 text-[14px] text-ink-2">{studio.about}</p>}
        </section>

        {featured.length > 0 && <section aria-labelledby="feat-h">
          <h2 id="feat-h" className="eyebrow mb-2">Featured galleries</h2>
          {(
            <ul className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0">
              {featured.map((e) => {
                return (
                  <li key={e.id} className="w-[132px] shrink-0 snap-start sm:w-auto">
                    <Link to={`/${e.shortId.toLowerCase()}`} className="group block">
                      <div className="vignette relative aspect-[4/5] overflow-hidden rounded-card" style={{ background: toneCss(e.coverTones[0]) }}>
                      </div>
                      <b className="mt-1.5 block truncate text-[13px] group-hover:underline">{e.name}</b>
                      <span className="block text-[11.5px] text-ink-3">{fmt.date(e.date)} · {e.city}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>}

        <section aria-labelledby="svc-h">
          {studio.services.length > 0 && <>
            <h2 id="svc-h" className="eyebrow mb-1">Services</h2>
            <ul>
              {studio.services.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0">
                  <div className="min-w-0"><b className="text-[14px]">{s.name}</b><div className="text-[12.5px] text-ink-2">{s.description}</div></div>
                  <span className="shrink-0 font-mono text-[12.5px] tnum">{s.price}</span>
                </li>
              ))}
            </ul>
          </>}
          {studio.services.length === 0 && <h2 id="svc-h" className="eyebrow mb-1">Book {studio.name}</h2>}
          <Button variant="primary" size="lg" icon={<MessageCircle size={16} />} className="mt-2 w-full justify-center sm:w-auto" onClick={() => setEnquire(true)}>Send an enquiry</Button>
        </section>

        {studio.testimonials.length > 0 && (
          <section aria-labelledby="tst-h">
            <h2 id="tst-h" className="eyebrow mb-2">Kind words</h2>
            <ul className="flex flex-col gap-2.5">
              {studio.testimonials.map((t) => (
                <li key={t.id} className="rounded-card border border-line bg-surface p-3.5">
                  <p className="text-[13.5px] text-ink">“{t.quote}”</p>
                  <div className="mt-1.5 text-[12px] text-ink-3"><b className="text-ink-2">{t.name}</b>{t.detail ? ` · ${t.detail}` : ''}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {studio.faq.length > 0 && <section aria-labelledby="faq-h">
          <h2 id="faq-h" className="eyebrow mb-1">Questions</h2>
          <div>
            {studio.faq.map((f) => (
              <details key={f.id} className="group border-t border-line py-3 first:border-t-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-bold [&::-webkit-details-marker]:hidden">
                  {f.q}<ChevronDown size={16} className="shrink-0 text-ink-3 transition group-open:rotate-180" />
                </summary>
                <p className="mt-1.5 text-[13px] text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>}

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
