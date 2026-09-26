import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Instagram, Globe, Lock, MapPin, Phone, Mail } from 'lucide-react'
import { tone, toneCss, type PhotoEvent, type Studio, type Website } from '@frameline/shared'
import { FAQ, SERVICES, TESTIMONIALS, THEMES, type SiteTheme } from './siteContent'
import { onColor } from './helpers'

export type Device = 'desktop' | 'phone'

interface Props {
  website: Website
  studio: Studio
  events: PhotoEvent[]
  device: Device
  /** Enables inline headline editing. */
  onHeadlineChange?: (text: string) => void
  /** Section id to briefly highlight / scroll to. */
  focusSection?: string | null
}

/** Galleries shown on the site: events marked "Show on my website", else the most recent delivered ones. */
export function siteGalleries(events: PhotoEvent[]) {
  const chosen = events.filter((e) => e.settings.showOnWebsite && e.status !== 'draft')
  const list = chosen.length ? chosen : events.filter((e) => e.status !== 'draft' && e.photoCount > 0)
  return [...list].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
}

/**
 * Renders the photographer's public site for the chosen template. Colours come from the
 * template theme and the studio brand colour (site content, not app UI).
 */
export function SitePreview({ website, studio, events, device, onHeadlineChange, focusSection }: Props) {
  const t = THEMES[website.template]
  const narrow = device === 'phone'
  const brand = studio.brandColor
  const root = useRef<HTMLDivElement>(null)
  const font = (serif = t.serif): CSSProperties => ({ fontFamily: serif ? 'Fraunces, Georgia, serif' : 'Manrope, system-ui, sans-serif' })
  const galleries = siteGalleries(events)

  useEffect(() => {
    if (!focusSection) return
    const el = root.current?.querySelector<HTMLElement>(`[data-section="${focusSection}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusSection])

  const ctx: SectionCtx = { t, narrow, brand, studio, font, galleries, website, onHeadlineChange }
  const enabled = website.sections.filter((s) => s.enabled)

  return (
    <div ref={root} style={{ background: t.bg, color: t.fg, ...font(false) }} className="relative min-h-full text-[13px] leading-relaxed">
      <Nav {...ctx} />
      {enabled.map((s) => (
        <div key={s.id} data-section={s.id}
          className="scroll-mt-2 transition-[outline] duration-300"
          style={focusSection === s.id ? { outline: `2px dashed ${brand}`, outlineOffset: -4 } : undefined}>
          {renderSection(s.id, ctx)}
        </div>
      ))}
      <footer className="px-6 py-6 text-center text-[11px]" style={{ color: t.muted, borderTop: `1px solid ${t.line}` }}>
        © 2026 {studio.name} · Made with Frameline
      </footer>
    </div>
  )
}

interface SectionCtx {
  t: SiteTheme
  narrow: boolean
  brand: string
  studio: Studio
  font: (serif?: boolean) => CSSProperties
  galleries: PhotoEvent[]
  website: Website
  onHeadlineChange?: (text: string) => void
}

function renderSection(id: string, c: SectionCtx): ReactNode {
  switch (id) {
    case 'cover': return <Cover {...c} />
    case 'about': return <About {...c} />
    case 'galleries': return <Galleries {...c} />
    case 'services': return <Services {...c} />
    case 'testimonials': return <Testimonials {...c} />
    case 'faq': return <Questions {...c} />
    case 'contact': return <Contact {...c} />
    case 'location': return <Location {...c} />
    case 'social': return <Social {...c} />
    default: return null
  }
}

function Nav({ t, studio, font, website, brand, narrow }: SectionCtx) {
  const name = website.template === 'editorial' || website.template === 'bold' ? studio.name.split(' ')[0].toUpperCase() : studio.name
  const onHero = website.template === 'editorial' && website.sections.find((s) => s.enabled)?.id === 'cover'
  return (
    <nav className={`flex items-center justify-between gap-3 px-5 py-3.5 ${onHero ? 'absolute inset-x-0 top-0 z-10' : ''}`}
      style={{ color: onHero ? '#fff' : t.fg, borderBottom: onHero ? undefined : `1px solid ${t.line}` }}>
      <b style={{ ...font(t.serif), letterSpacing: t.upperNav ? '.15em' : undefined }} className="text-[14px]">{name}</b>
      {narrow ? (
        <span aria-hidden className="flex flex-col gap-[3px]"><i className="block h-[2px] w-4" style={{ background: 'currentColor' }} /><i className="block h-[2px] w-4" style={{ background: 'currentColor' }} /></span>
      ) : (
        <span className="flex items-center gap-4 text-[11px]" style={{ letterSpacing: t.upperNav ? '.15em' : undefined }}>
          {(t.upperNav ? ['WORK', 'ABOUT', 'CONTACT'] : ['Work', 'About', 'Contact']).map((l) => <span key={l}>{l}</span>)}
          {website.template !== 'editorial' && <span className="rounded-full px-3 py-1 font-bold" style={{ background: brand, color: onColor(brand) }}>Check a date</span>}
        </span>
      )}
    </nav>
  )
}

function Headline({ website, onHeadlineChange, className, style }: SectionCtx & { className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (ref.current && ref.current.textContent !== website.headline) ref.current.textContent = website.headline }, [website.headline])
  if (!onHeadlineChange) return <h2 className={className} style={style}>{website.headline}</h2>
  return (
    <h2
      ref={ref} className={`${className ?? ''} cursor-text rounded outline-none hover:outline-dashed hover:outline-1 hover:outline-offset-4 focus:outline-dashed focus:outline-1 focus:outline-offset-4`}
      style={style} contentEditable suppressContentEditableWarning role="textbox" aria-label="Headline (click to edit)" title="Click to edit"
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } if (e.key === 'Escape') { e.currentTarget.textContent = website.headline; e.currentTarget.blur() } }}
      onBlur={(e) => {
        const v = (e.currentTarget.textContent ?? '').trim().slice(0, 80)
        if (!v) { e.currentTarget.textContent = website.headline; return }
        if (v !== website.headline) onHeadlineChange(v)
      }}
    >{website.headline}</h2>
  )
}

function Cta({ brand, label = 'Check a date', light }: { brand: string; label?: string; light?: boolean }) {
  return <span className="mt-3 inline-block rounded-full px-4 py-1.5 text-[12px] font-bold" style={light ? { background: '#fff', color: '#15191C' } : { background: brand, color: onColor(brand) }}>{label}</span>
}

function Cover(c: SectionCtx) {
  const { t, narrow, brand, font, website, galleries } = c
  const tones = galleries[0]?.coverTones ?? [tone(3), tone(0), tone(12)]
  const big = narrow ? 'text-[28px]' : 'text-[40px]'
  switch (website.template) {
    case 'editorial':
      return (
        <section className="relative flex items-end p-6" style={{ minHeight: narrow ? 360 : 300, background: toneCss(tones[0]) }}>
          <span className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.25), transparent 40%, rgba(0,0,0,.45))' }} aria-hidden />
          <div className="relative text-white">
            <Headline {...c} className={`${big} max-w-[16ch] font-semibold leading-[1.05]`} style={font(true)} />
            <Cta brand={brand} light />
          </div>
        </section>
      )
    case 'minimal':
      return (
        <section className={`grid gap-6 px-6 py-10 ${narrow ? '' : 'grid-cols-2 items-center'}`}>
          <div>
            <div className="mb-2 text-[11px]" style={{ color: t.muted }}>{c.studio.city} · Photography</div>
            <Headline {...c} className={`${narrow ? 'text-[24px]' : 'text-[28px]'} font-semibold leading-tight`} style={font(false)} />
            <Cta brand={brand} />
          </div>
          <div className="aspect-[4/5] rounded" style={{ background: toneCss(tones[0]) }} />
        </section>
      )
    case 'bold':
      return (
        <section className="px-6 py-10">
          <Headline {...c} className={`${narrow ? 'text-[34px]' : 'text-[52px]'} font-extrabold uppercase leading-[.95] tracking-tight`} style={font(false)} />
          <div className="mt-3 h-1.5 w-24" style={{ background: brand }} />
          <div className="mt-6 grid grid-cols-3 gap-2">{tones.map((x, i) => <div key={i} className="aspect-square" style={{ background: toneCss(x) }} />)}</div>
        </section>
      )
    case 'showcase':
      return (
        <section className="relative p-3">
          <div className={`grid gap-1.5 ${narrow ? 'grid-cols-2' : 'grid-cols-4'}`}>
            {[...tones, tone(5), tone(9), tone(11), tone(7), tone(1)].slice(0, narrow ? 4 : 8).map((x, i) => <div key={i} className="aspect-square" style={{ background: toneCss(x) }} />)}
          </div>
          <div className="absolute inset-x-8 bottom-8 rounded-lg p-4 text-center shadow-lg" style={{ background: t.card }}>
            <Headline {...c} className="text-[22px] font-bold leading-tight" style={font(false)} />
          </div>
        </section>
      )
    case 'portfolio':
      return (
        <section className={`grid gap-4 px-6 py-8 ${narrow ? '' : 'grid-cols-[1fr_2fr]'}`}>
          <div className="flex flex-col justify-end">
            <div className="text-[11px] italic" style={{ color: t.muted }}>Selected work, 2014–2026</div>
            <Headline {...c} className="text-[26px] font-semibold leading-tight" style={font(true)} />
            <Cta brand={brand} />
          </div>
          <div className="grid grid-cols-[2fr_1fr] gap-1.5" style={{ height: narrow ? 220 : 260 }}>
            <div style={{ background: toneCss(tones[0]) }} />
            <div className="grid gap-1.5"><div style={{ background: toneCss(tones[1]) }} /><div style={{ background: toneCss(tones[2]) }} /></div>
          </div>
        </section>
      )
    default: // classic
      return (
        <section className="px-6 pb-8 pt-12 text-center">
          <div className="mb-2 text-[11px] uppercase tracking-[.2em]" style={{ color: t.muted }}>{c.studio.name}</div>
          <Headline {...c} className={`${big} mx-auto max-w-[18ch] font-medium italic leading-tight`} style={font(true)} />
          <Cta brand={brand} />
          <div className="mx-auto mt-7 grid max-w-xl grid-cols-3 gap-2">{tones.map((x, i) => <div key={i} className="aspect-[3/4] rounded-sm" style={{ background: toneCss(x) }} />)}</div>
        </section>
      )
  }
}

function SectionTitle({ c, children }: { c: SectionCtx; children: ReactNode }) {
  const { t, font, website } = c
  const upper = website.template === 'bold' || website.template === 'showcase'
  return <h3 className={`mb-3 font-semibold ${upper ? 'text-[13px] uppercase tracking-[.18em]' : 'text-[18px]'}`} style={{ ...font(t.serif), color: t.fg }}>{children}</h3>
}

function About(c: SectionCtx) {
  const { t, studio, narrow } = c
  return (
    <section className={`grid gap-5 px-6 py-8 ${narrow ? '' : 'grid-cols-[1fr_2fr] items-center'}`}>
      <div className="aspect-square max-w-[180px] rounded-full" style={{ background: toneCss(tone(10)) }} />
      <div>
        <SectionTitle c={c}>About {studio.name}</SectionTitle>
        <p style={{ color: t.muted }}>{studio.about ?? `Photography studio in ${studio.city}.`} We photograph weddings, families and events across India, and deliver every gallery with face search so each guest finds their own photos.</p>
      </div>
    </section>
  )
}

function Galleries(c: SectionCtx) {
  const { t, narrow, galleries, website } = c
  const cols = narrow ? (website.template === 'showcase' ? 'grid-cols-1' : 'grid-cols-2') : website.template === 'showcase' ? 'grid-cols-2' : 'grid-cols-3'
  return (
    <section className="px-6 py-8" style={{ background: website.template === 'minimal' ? undefined : t.card }}>
      <SectionTitle c={c}>{website.template === 'portfolio' ? 'Work' : 'Recent galleries'}</SectionTitle>
      {galleries.length === 0 ? (
        <p style={{ color: t.muted }}>Turn on “Show on my website” in an event’s settings to list it here.</p>
      ) : (
        <div className={`grid gap-3 ${cols}`}>
          {galleries.map((g) => {
            const priv = g.settings.access !== 'link'
            return (
              <div key={g.id}>
                <div className="relative aspect-[3/2] overflow-hidden rounded-md" style={{ background: toneCss(g.coverTones[0]) }}>
                  {priv && <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[9.5px] font-bold text-white"><Lock size={9} />Private</span>}
                </div>
                <b className="mt-1 block text-[12px]">{g.name}</b>
                <span className="text-[11px]" style={{ color: t.muted }}>{g.city}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Services(c: SectionCtx) {
  const { t, narrow } = c
  return (
    <section className="px-6 py-8">
      <SectionTitle c={c}>Services</SectionTitle>
      <div className={`grid gap-3 ${narrow ? '' : 'grid-cols-3'}`}>
        {SERVICES.map((s) => (
          <div key={s.name} className="rounded-md p-3" style={{ border: `1px solid ${t.line}` }}>
            <b className="block">{s.name}</b>
            <span className="text-[12px] font-bold" style={{ color: c.brand }}>{s.price}</span>
            <p className="mt-1 text-[11.5px]" style={{ color: t.muted }}>{s.detail}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Testimonials(c: SectionCtx) {
  const { t, narrow, font } = c
  return (
    <section className="px-6 py-8" style={{ background: t.card }}>
      <SectionTitle c={c}>Kind words</SectionTitle>
      <div className={`grid gap-4 ${narrow ? '' : 'grid-cols-2'}`}>
        {TESTIMONIALS.map((q) => (
          <figure key={q.name} className="flex gap-3">
            <span className="size-10 shrink-0 rounded-full" style={{ background: toneCss(tone(q.tone)) }} aria-hidden />
            <div>
              <blockquote className="text-[14px] italic leading-snug" style={font(true)}>“{q.quote}”</blockquote>
              <figcaption className="mt-1 text-[11px]" style={{ color: t.muted }}>{q.name} · {q.event}</figcaption>
            </div>
          </figure>
        ))}
      </div>
    </section>
  )
}

function Questions(c: SectionCtx) {
  const { t } = c
  return (
    <section className="px-6 py-8">
      <SectionTitle c={c}>Questions</SectionTitle>
      {FAQ.map((f) => (
        <details key={f.q} className="py-2" style={{ borderTop: `1px solid ${t.line}` }}>
          <summary className="cursor-pointer font-bold">{f.q}</summary>
          <p className="mt-1 text-[12px]" style={{ color: t.muted }}>{f.a}</p>
        </details>
      ))}
    </section>
  )
}

function Contact(c: SectionCtx) {
  const { t, studio, narrow, brand } = c
  const box: CSSProperties = { border: `1px solid ${t.line}`, background: t.dark ? t.card : '#fff', color: t.muted }
  return (
    <section className={`grid gap-5 px-6 py-8 ${narrow ? '' : 'grid-cols-2'}`} style={{ background: t.card }}>
      <div>
        <SectionTitle c={c}>Check your date</SectionTitle>
        <p className="mb-2" style={{ color: t.muted }}>Tell us about your day. We reply within a day.</p>
        <div className="flex items-center gap-2 text-[12px]"><Phone size={12} />{studio.phone}</div>
        <div className="flex items-center gap-2 text-[12px]"><Mail size={12} />{studio.email}</div>
      </div>
      <div className="flex flex-col gap-2 text-[12px]">
        <div className="rounded px-2.5 py-2" style={box}>Your name</div>
        <div className="rounded px-2.5 py-2" style={box}>Phone or email</div>
        <div className="h-14 rounded px-2.5 py-2" style={box}>Date, city and a few words</div>
        <span className="self-start rounded-full px-4 py-1.5 font-bold" style={{ background: brand, color: onColor(brand) }}>Send enquiry</span>
      </div>
    </section>
  )
}

function Location(c: SectionCtx) {
  const { t, studio } = c
  return (
    <section className="px-6 py-8">
      <SectionTitle c={c}>Visit the studio</SectionTitle>
      <div className="flex items-center gap-3 rounded-md p-3" style={{ border: `1px solid ${t.line}` }}>
        <span className="grid size-12 shrink-0 place-items-center rounded" style={{ background: t.card }}><MapPin size={18} /></span>
        <div className="min-w-0">
          <b className="block">{studio.name}, {studio.city}</b>
          <a className="text-[12px] underline" style={{ color: c.brand }} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${studio.name} ${studio.city}`)}`} target="_blank" rel="noreferrer">Open in Google Maps</a>
        </div>
      </div>
    </section>
  )
}

function Social(c: SectionCtx) {
  const { t, studio } = c
  return (
    <section className="flex flex-wrap items-center justify-center gap-4 px-6 py-6 text-[12px]" style={{ color: t.muted }}>
      {studio.instagram && <span className="inline-flex items-center gap-1.5"><Instagram size={14} />{studio.instagram}</span>}
      {studio.website && <span className="inline-flex items-center gap-1.5"><Globe size={14} />{studio.website.replace(/^https?:\/\//, '')}</span>}
    </section>
  )
}
