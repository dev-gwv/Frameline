import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Film, Heart, ImagePlus, Images, Lock, MessageCircle, RotateCcw, ScanFace, Share2, Sparkles, Store } from 'lucide-react'
import { Button, Tip, cn, useToast } from '@frameline/ui'
import { fmt, toneCss, type Album, type Tone } from '@frameline/shared'
import { guestAlbums, useAlbumCover, useHighlights } from '../lib/queries'
import { BrandButton, Container } from '../components/common'
import { SelfieFlow } from '../components/SelfieFlow'
import { UploadSheet } from '../components/UploadSheet'
import { EnquirySheet } from '../components/EnquirySheet'
import { useEventCtx } from './EventLayout'

export function EventHome() {
  const { event, studio, session, base, seeAll, matches, matchesLoading } = useEventCtx()
  const navigate = useNavigate()
  const { toast } = useToast()
  const highlightsQ = useHighlights(event.shortId, event.highlights && seeAll)
  const [selfie, setSelfie] = useState(false)
  const [upload, setUpload] = useState(false)
  const [enquire, setEnquire] = useState(false)

  const albums = guestAlbums(event.albums, event)
  const guestAlbum = event.albums.find((a) => a.kind === 'guest')
  const films = event.films
  // Photos a guest can browse (the event total also counts guest uploads awaiting review).
  const total = albums.reduce((n, a) => n + a.photoCount, 0)
  const s = event.settings

  function openAlbum(a: Album) {
    if (seeAll) return navigate(`${base}/a/${a.id}`)
    if (session.match) return navigate(`${base}/me?album=${a.id}`)
    toast({ kind: 'info', title: 'Find your photos first', body: 'This gallery shows guests only the photos they are in.' })
    setSelfie(true)
  }

  async function share() {
    const url = `${location.origin}${base}`
    try {
      if (navigator.share) await navigator.share({ title: event.name, text: `Photos from ${event.name}`, url })
      else { await navigator.clipboard.writeText(url); toast({ title: 'Link copied', body: url }) }
    } catch { /* share sheet dismissed */ }
  }

  const matchCount = matches?.length

  return (
    <div className="min-h-dvh pb-10">
      {/* Hero */}
      <section className="relative text-white" style={{ background: toneCss(event.coverTones[0]) }}>
        {event.coverUrl && <img src={event.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />}
        <div className="hero-fade absolute inset-0" aria-hidden />
        <Container className="relative flex min-h-[320px] flex-col justify-end pb-6 pt-safe sm:min-h-[400px]">
          <div className="absolute inset-x-0 top-5 flex items-center justify-between px-3 sm:px-6">
            <span className="size-10" aria-hidden />
            <Link to={`/studio/${studio.followCode.toLowerCase()}`} className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] hover:underline">{studio.name}</Link>
            <div className="flex">
              <Tip label="Your favourites">
                <Link to={`${base}/favourites`} aria-label="Your favourites" className="grid size-10 place-items-center rounded-full hover:bg-white/15"><Heart size={19} /></Link>
              </Tip>
              <Tip label="Share gallery">
                <button type="button" aria-label="Share gallery" onClick={share} className="grid size-10 place-items-center rounded-full hover:bg-white/15"><Share2 size={18} /></button>
              </Tip>
            </div>
          </div>
          {session.greeting && <div className="text-[13px] opacity-90">Welcome, {session.greeting}</div>}
          <h1 className="font-display text-[32px] font-semibold leading-[1.04] sm:text-[44px]">{event.name}</h1>
          <div className="mt-1.5 text-[13px] opacity-90">{fmt.dateRange(event.date, event.endDate)} · {event.city}</div>
        </Container>
      </section>

      <Container className="flex flex-col gap-6 pt-4">
        {/* Primary action */}
        <div className="mx-auto flex w-full max-w-md flex-col gap-2.5">
          {s.faceSearch && (session.match ? (
            <>
              <BrandButton icon={<ScanFace size={19} />} onClick={() => navigate(`${base}/me`)}>
                {matchesLoading ? 'Your photos' : matchCount ? `See your ${matchCount} photos` : 'Your photos'}
              </BrandButton>
              <button type="button" onClick={() => setSelfie(true)} className="inline-flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-ink-2 hover:text-ink"><RotateCcw size={13} />Not you? Retake your selfie</button>
            </>
          ) : (
            <>
              <BrandButton icon={<ScanFace size={19} />} onClick={() => setSelfie(true)}>Find my photos</BrandButton>
              <p className="text-center text-[11.5px] text-ink-2">Your selfie is only used to match you and is deleted after 30 days.</p>
            </>
          ))}
          {seeAll && (
            <Link to={`${base}/a/all`} className="block">
              <Button size="lg" icon={<Images size={17} />} className="w-full justify-center">Browse all {fmt.count(total)} photos</Button>
            </Link>
          )}
          {!seeAll && !s.faceSearch && <p className="text-center text-[13px] text-ink-2">Photos are being prepared. Check back soon.</p>}
        </div>

        {/* Albums */}
        <section aria-labelledby="albums-h">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h2 id="albums-h" className="text-[17px]">Albums</h2>
            <span className="text-[12px] text-ink-3">{fmt.count(total)} photos{films.length ? ` · ${films.length} ${films.length === 1 ? 'film' : 'films'}` : ''}</span>
          </div>
          {!seeAll && <p className="mb-2.5 flex items-center gap-1.5 text-[12px] text-ink-3"><Lock size={12} />Guests see only the photos they're in. Albums open to your matches.</p>}
          {albums.length === 0 && films.length === 0 ? (
            <p className="rounded-card bg-sunk p-3 text-[13px] text-ink-2">{studio.name} hasn't added albums yet. Check back soon.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {event.highlights && seeAll && (highlightsQ.data?.length ?? 0) > 0 && (
                <li>
                  <AlbumCard title="Highlights" count={highlightsQ.data!.length} icon={<Sparkles size={13} />} tone={highlightsQ.data![0].tone} url={highlightsQ.data![0].url} onClick={() => navigate(`${base}/a/highlights`)} />
                </li>
              )}
              {albums.map((a, i) => <li key={a.id}><AlbumCover album={a} shortId={event.shortId} fallback={event.coverTones[i % 3]} locked={!seeAll} onClick={() => openAlbum(a)} /></li>)}
              {films.map((f, i) => (
                <li key={f.id}>
                  <a href={f.url} target="_blank" rel="noreferrer noopener" className="group block rounded-card focus-visible:outline-offset-2" aria-label={`${f.name} (opens YouTube)`}>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-card vignette" style={{ background: toneCss(event.coverTones[(i + 1) % 3]) }}>
                      <span className="absolute inset-0 grid place-items-center"><span className="grid size-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition group-hover:scale-105"><Film size={18} /></span></span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[13px] font-bold"><span className="truncate">{f.name}</span></div>
                    <div className="text-[11.5px] text-ink-3">Film · YouTube</div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Secondary actions */}
        <section className="grid gap-2.5 sm:grid-cols-2" aria-label="More">
          {s.guestUploads && (
            <ActionRow icon={<ImagePlus size={17} />} title="Add your photos" body={`Share what you shot at ${event.name}.`} onClick={() => setUpload(true)} />
          )}
          {s.allowEnquiries && (
            <ActionRow icon={<MessageCircle size={17} />} title={`Want photos like these?`} body={`Enquire with ${studio.name}`} onClick={() => setEnquire(true)} />
          )}
          <ActionRow icon={<Store size={17} />} title={`More from ${studio.name}`} body="Galleries, services and contact" onClick={() => navigate(`/studio/${studio.followCode.toLowerCase()}`)} />
        </section>

        <footer className="pt-2 text-center text-[11.5px] text-ink-3">
          Photos by <Link className="font-semibold text-ink-2 hover:underline" to={`/studio/${studio.followCode.toLowerCase()}`}>{studio.name}</Link> · Delivered with Frameline
        </footer>
      </Container>

      <SelfieFlow open={selfie} onOpenChange={setSelfie} event={event} studio={studio} base={base} />
      {s.guestUploads && <UploadSheet open={upload} onOpenChange={setUpload} event={event} studio={studio} guestAlbum={guestAlbum} session={session} />}
      <EnquirySheet open={enquire} onOpenChange={setEnquire} studio={studio} source={`${event.name} gallery`} shortId={event.shortId} session={session} />
    </div>
  )
}

function ActionRow({ icon, title, body, onClick }: { icon: ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3.5 text-left transition hover:bg-sunk">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-text">{icon}</span>
      <span className="min-w-0 flex-1"><b className="block text-[14px]">{title}</b><span className="block truncate text-[12.5px] text-ink-2">{body}</span></span>
      <ChevronRight size={17} className="text-ink-3" />
    </button>
  )
}

/** Cover = the album's first photo. Locked albums (face privacy) can't be listed, so they show an event tone. */
function AlbumCover({ album, shortId, fallback, locked, onClick }: { album: Album; shortId: string; fallback: Tone; locked: boolean; onClick: () => void }) {
  const q = useAlbumCover(shortId, album.id, !locked && album.photoCount > 0)
  const first = q.data
  const tone = first?.tone ?? (locked || album.photoCount === 0 || q.isError ? fallback : undefined)
  return <AlbumCard title={album.name} count={album.photoCount} tone={tone} url={first?.url} locked={locked} onClick={onClick} />
}

function AlbumCard({ title, count, tone, url, icon, locked, onClick }: { title: string; count: number; tone?: Tone; url?: string; icon?: ReactNode; locked?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group block w-full rounded-card text-left focus-visible:outline-offset-2" aria-label={`${title}, ${count} photos${locked ? ', shows your matches' : ''}`}>
      <div className={cn('relative aspect-[4/3] overflow-hidden rounded-card', tone ? 'vignette' : 'shimmer bg-sunk')} style={tone ? { background: toneCss(tone) } : undefined}>
        {url && <img src={url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />}
        {locked && <span className="absolute right-2 top-2 z-[1] grid size-6 place-items-center rounded-full bg-black/50 text-white"><Lock size={12} /></span>}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[13px] font-bold">{icon && <span className="text-accent-text">{icon}</span>}<span className="truncate">{title}</span></div>
      <div className="font-mono text-[11px] tnum text-ink-3">{fmt.count(count)} photos</div>
    </button>
  )
}
