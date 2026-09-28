import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Film, ImagePlus, Images, Lock, Play, ScanFace, Share2, Sparkles, Store } from 'lucide-react'
import { cn } from '@frameline/ui'
import { fmt, toneCss, type Album, type Tone } from '@frameline/shared'
import { guestAlbums, useAlbumCover, useHighlights } from '../lib/queries'
import { Container, EventHero, PrimaryButton, TextButton, WideButton } from '../components/common'
import { EventShell, useShareGallery } from '../components/Shell'
import { SelfieFlow } from '../components/SelfieFlow'
import { UploadSheet } from '../components/UploadSheet'
import { useEventCtx } from './EventLayout'

export function EventHome() {
  const { event, studio, session, base, seeAll, matches, matchesLoading, forceOffline } = useEventCtx()
  const navigate = useNavigate()
  const share = useShareGallery(event, base)
  const highlightsQ = useHighlights(event.shortId, event.highlights && seeAll)
  const [selfie, setSelfie] = useState(false)
  const [upload, setUpload] = useState(false)

  const albums = guestAlbums(event.albums, event)
  const guestAlbum = event.albums.find((a) => a.kind === 'guest')
  const films = event.films
  // Photos a guest can browse (the event total also counts guest uploads awaiting review).
  const total = albums.reduce((n, a) => n + a.photoCount, 0)
  const s = event.settings
  const locked = !seeAll && !session.match
  const highlights = event.highlights && seeAll ? highlightsQ.data ?? [] : []

  function openAlbum(a: Album) {
    if (seeAll) return navigate(`${base}/a/${a.id}`)
    if (session.match) return navigate(`${base}/me?album=${a.id}`)
    setSelfie(true)
  }

  const matchCount = matches?.length

  return (
    <EventShell event={event} base={base} tab="event" offline={forceOffline}>
      <EventHero event={event}>
        <button type="button" onClick={() => void share()}
          className="absolute right-3 top-3 z-[1] inline-flex h-11 items-center gap-1.5 rounded-full bg-black/35 px-3.5 text-[13px] font-bold text-white backdrop-blur-sm hover:bg-black/50 md:hidden">
          <Share2 size={15} />Share
        </button>
      </EventHero>

      <Container className="flex flex-col gap-6 pt-4">
        {/* The one gold action */}
        <div className="flex w-full flex-col gap-2.5 md:max-w-md">
          {session.greeting && <p className="text-[13.5px] text-ink-2">Welcome, {session.greeting}</p>}
          {s.faceSearch ? (session.match ? (
            <>
              <PrimaryButton icon={<ScanFace size={18} />} onClick={() => navigate(`${base}/me`)}>
                {matchesLoading || matchCount === undefined ? 'See your photos' : matchCount ? `See your ${fmt.count(matchCount)} ${matchCount === 1 ? 'photo' : 'photos'}` : 'See your photos'}
              </PrimaryButton>
              <TextButton className="-my-1 self-center" onClick={() => setSelfie(true)}>Not you? Retake</TextButton>
            </>
          ) : (
            <PrimaryButton icon={<ScanFace size={18} />} onClick={() => setSelfie(true)}>Find my photos</PrimaryButton>
          )) : seeAll && (
            <PrimaryButton icon={<Images size={17} />} onClick={() => navigate(`${base}/a/all`)}>Browse all {fmt.count(total)}</PrimaryButton>
          )}
          {s.faceSearch && seeAll && (
            <WideButton icon={<Images size={16} />} onClick={() => navigate(`${base}/a/all`)}>Browse all {fmt.count(total)}</WideButton>
          )}
        </div>

        {/* Albums */}
        <section aria-labelledby="albums-h">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h2 id="albums-h" className="text-[15px]">Albums</h2>
            <span className="text-[12.5px] text-ink-3 tnum">{fmt.count(total)} photos</span>
          </div>
          {locked && (
            <p className="mb-2.5 flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2.5 text-[13px] text-ink-2">
              <Lock size={14} className="shrink-0 text-accent-text" />This gallery shows each guest only the photos they’re in. Find your photos first.
            </p>
          )}
          {albums.length === 0 ? (
            <p className="rounded-card border border-line bg-surface p-4 text-[13.5px] text-ink-2">{studio.name} hasn’t added albums yet. Check back soon.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {highlights.length > 0 && (
                <li>
                  <AlbumTile title="Highlights" count={highlights.length} icon={<Sparkles size={13} />} tone={highlights[0].tone} url={highlights[0].url} onClick={() => navigate(`${base}/a/highlights`)} />
                </li>
              )}
              {albums.map((a, i) => (
                <li key={a.id}><AlbumCover album={a} shortId={event.shortId} fallback={event.coverTones[i % 3]} locked={!seeAll} lockText={locked} onClick={() => openAlbum(a)} /></li>
              ))}
            </ul>
          )}
        </section>

        {films.length > 0 && (
          <section aria-labelledby="films-h">
            <h2 id="films-h" className="mb-2.5 text-[15px]">Films</h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
              {films.map((f, i) => (
                <li key={f.id}>
                  <a href={f.url} target="_blank" rel="noreferrer noopener" className="group flex items-center gap-3 rounded-card border border-line bg-surface p-2 pr-3 shadow-card hover:bg-sunk">
                    <span className="vignette relative grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-[8px]" style={{ background: toneCss(event.coverTones[(i + 1) % 3]) }}>
                      <span className="relative z-[1] grid size-8 place-items-center rounded-full bg-black/55 text-white"><Play size={14} className="ml-0.5 fill-current" /></span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14px]">{f.name}</b>
                      <span className="flex items-center gap-1 text-[12.5px] text-ink-2"><Film size={13} />Watch on YouTube</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="More">
          {s.guestUploads && (
            <ActionRow icon={<ImagePlus size={17} />} title="Add your photos" body={`Share what you shot at ${event.name}`} onClick={() => setUpload(true)} />
          )}
          <ActionRow icon={<Store size={17} />} title={`More from ${studio.name}`} body="Their galleries, services and contact" onClick={() => navigate(`/studio/${studio.followCode.toLowerCase()}`)} />
        </section>

        <footer className="pb-4 text-center text-[12px] text-ink-3">
          Photos by <Link className="font-bold text-ink-2 hover:underline" to={`/studio/${studio.followCode.toLowerCase()}`}>{studio.name}</Link> · Delivered with Frameline
        </footer>
      </Container>

      <SelfieFlow open={selfie} onOpenChange={setSelfie} event={event} studio={studio} base={base} />
      {s.guestUploads && <UploadSheet open={upload} onOpenChange={setUpload} event={event} studio={studio} guestAlbum={guestAlbum} session={session} />}
    </EventShell>
  )
}

function ActionRow({ icon, title, body, onClick }: { icon: ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 min-w-0 items-center gap-3 rounded-card border border-line bg-surface p-3.5 text-left shadow-card transition hover:bg-sunk">
      <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-accent-soft text-accent-text">{icon}</span>
      <span className="min-w-0 flex-1"><b className="block text-[14px]">{title}</b><span className="block truncate text-[12.5px] text-ink-2">{body}</span></span>
      <ChevronRight size={17} className="text-ink-3" />
    </button>
  )
}

/** Cover = the album's first photo. Locked albums (face privacy) can't be listed, so they show an event tone. */
function AlbumCover({ album, shortId, fallback, locked, lockText, onClick }: { album: Album; shortId: string; fallback: Tone; locked: boolean; lockText: boolean; onClick: () => void }) {
  const q = useAlbumCover(shortId, album.id, !locked && album.photoCount > 0)
  const first = q.data
  const tone = first?.tone ?? (locked || album.photoCount === 0 || q.isError ? fallback : undefined)
  return <AlbumTile title={album.name} count={album.photoCount} tone={tone} url={first?.url} locked={lockText} onClick={onClick} />
}

function AlbumTile({ title, count, tone, url, icon, locked, onClick }: { title: string; count: number; tone?: Tone; url?: string; icon?: ReactNode; locked?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group block w-full rounded-card text-left focus-visible:outline-offset-2"
      aria-label={`${title}, ${count} photos${locked ? '. Find your photos first' : ''}`}>
      <div className={cn('relative aspect-[4/3] overflow-hidden rounded-card', !tone && 'shimmer bg-sunk')} style={tone ? { background: toneCss(tone) } : undefined}>
        {url && <img src={url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition group-hover:scale-[1.02]" />}
        <div className="absolute inset-0 bg-[linear-gradient(transparent_40%,rgba(0,0,0,.6))]" aria-hidden />
        {locked && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-bold text-white"><Lock size={11} />Find your photos first</span>}
        <div className="absolute inset-x-2.5 bottom-2 text-white">
          <div className="flex items-center gap-1 text-[14px] font-extrabold leading-tight">{icon}<span className="truncate">{title}</span></div>
          <div className="text-[11.5px] opacity-85 tnum">{fmt.count(count)} photos</div>
        </div>
      </div>
    </button>
  )
}
