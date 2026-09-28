import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Outlet, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, BellRing, CalendarX, EyeOff, ImageIcon, MessageCircle, Phone, SearchX, WifiOff } from 'lucide-react'
import { Field, Input, Skeleton } from '@frameline/ui'
import type { Photo, PublicBlockReason, PublicEvent, PublicStudio } from '@frameline/shared'
import { useMatches, useMyOrders, usePublicEvent } from '../lib/queries'
import { guest, rememberEvent, useGuest, useSession, type EventSession } from '../lib/guest'
import { waLink } from '../lib/brand'
import { canSeeAll, needsAppChoice, needsPin, needsRegistration } from '../lib/access'
import { errorCode, friendlyError, isNetwork, isNotFound } from '../lib/errors'
import { useApi } from '../lib/api'
import { AppInterstitial, PinGate, RegistrationGate, validPhone } from '../components/Gates'
import { CodeForm, Container, EventHero, linkBtn, PrimaryButton, StateBlock, StatePage, WideButton } from '../components/common'

export interface EventCtx {
  event: PublicEvent
  studio: PublicStudio
  session: EventSession
  /** "/6402f9f" */
  base: string
  seeAll: boolean
  matches: Photo[] | undefined
  matchesLoading: boolean
  matchesError: unknown
  retryMatches: () => void
  ownIds: Set<string>
  /** Dev preview of the offline banner (?preview=offline). */
  forceOffline: boolean
}

export const useEventCtx = () => useOutletContext<EventCtx>()

type Preview = PublicBlockReason | 'offline' | 'notfound' | 'neterror'
/** Dev-only: `?preview=expired|disabled|archived|empty|offline|notfound|neterror` shows that state for design checks. */
function usePreview(): Preview | undefined {
  const [params] = useSearchParams()
  if (!import.meta.env.DEV) return undefined
  return (params.get('preview') as Preview | null) ?? undefined
}

export function EventLayout() {
  const { shortId = '' } = useParams()
  const preview = usePreview()
  const eventQ = usePublicEvent(shortId)
  const session = useSession(shortId)
  const loaded = eventQ.data
  const event = loaded && preview && preview !== 'offline' && preview !== 'notfound' && preview !== 'neterror' ? { ...loaded, blocked: preview } : loaded
  const gated = !event || !!event.blocked || needsAppChoice(event, session) || needsPin(event, session) || needsRegistration(event, session)
  const matchQ = useMatches(shortId, session.match, !gated)
  // Refreshes which photos this guest bought (unlocks their downloads on any device the orders show up on).
  useMyOrders(shortId, !gated && !!event?.settings.storeEnabled)

  useEffect(() => {
    if (event) {
      rememberEvent({ shortId: event.shortId, name: event.name, date: event.date, city: event.city, tone: event.coverTones[0] })
      document.title = `${event.name} · Photos`
    }
    return () => { document.title = 'Frameline · Your photos' }
  }, [event])

  const ownIds = useMemo(() => new Set((matchQ.data ?? []).map((p) => p.id)), [matchQ.data])

  if (eventQ.isLoading) {
    return (
      <main className="mx-auto w-full" aria-busy aria-label="Loading gallery">
        <Skeleton className="h-[220px] rounded-none sm:h-[320px]" />
        <Container className="flex max-w-md flex-col gap-3 pt-5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-12" /><Skeleton className="h-11" /><Skeleton className="h-40" /></Container>
      </main>
    )
  }
  // Keep showing a gallery that already loaded when a refresh fails (offline): the banner explains.
  if (preview === 'notfound' || (!event && (!eventQ.error || isNotFound(eventQ.error)))) {
    return (
      <StatePage icon={<SearchX size={24} />} tone="neutral" title="We couldn’t find this gallery"
        body={`No gallery uses the code ${shortId.toUpperCase()}. Check the link or type the code from your invite.`}>
        <CodeForm />
      </StatePage>
    )
  }
  if (preview === 'neterror' || !event) {
    const f = friendlyError(eventQ.error, 'The gallery didn’t load')
    const offline = preview === 'neterror' || isNetwork(eventQ.error)
    return (
      <StatePage icon={<WifiOff size={24} />} tone="neutral" title={offline ? 'You seem to be offline' : f.title}
        body={offline ? 'We couldn’t open the gallery. Check your internet connection and try again.' : f.body}>
        <WideButton loading={eventQ.isFetching} onClick={() => void eventQ.refetch()}>Try again</WideButton>
      </StatePage>
    )
  }
  const studio = event.studio

  if (event.blocked) return <Blocked event={event} studio={studio} reason={event.blocked} session={session} />

  // Gates, in order: web or app → PIN → sign-up. Each appears only if the event asks for it.
  if (needsAppChoice(event, session)) return <AppInterstitial event={event} studio={studio} />
  if (needsPin(event, session)) return <PinGate event={event} studio={studio} session={session} />
  if (needsRegistration(event, session)) return <RegistrationGate event={event} studio={studio} session={session} />

  const ctx: EventCtx = {
    event, studio, session, base: `/${event.shortId.toLowerCase()}`,
    seeAll: canSeeAll(event, session),
    matches: matchQ.data, matchesLoading: matchQ.isLoading && !!session.match,
    matchesError: matchQ.error, retryMatches: () => void matchQ.refetch(),
    ownIds, forceOffline: preview === 'offline',
  }
  return <Outlet context={ctx} />
}

/* ---------------------------------------------------------------- Closed galleries */

export { waLink }
export const telLink = (studio: PublicStudio) => `tel:${studio.phone.replace(/\s/g, '')}`

function BlockedFrame({ event, children }: { event: PublicEvent; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-paper">
      <EventHero event={event} />
      <Container className="max-w-md pb-10 pt-4">
        <div className="rounded-card border border-line bg-surface px-5 shadow-card">{children}</div>
      </Container>
    </main>
  )
}

/** Expired, turned off, archived, or no photos yet: why, and a way forward. */
function Blocked({ event, studio, reason, session }: { event: PublicEvent; studio: PublicStudio; reason: PublicBlockReason; session: EventSession }) {
  const contact = (
    <>
      <a href={waLink(studio, `Hi ${studio.name}, I’d like to see the photos from ${event.name} (${event.shortId}).`)} target="_blank" rel="noreferrer noopener" className={linkBtn('primary')}>
        <MessageCircle size={17} />Message on WhatsApp
      </a>
      <a href={telLink(studio)} className={linkBtn()}><Phone size={16} />Call the studio</a>
    </>
  )
  if (reason === 'empty') return <BlockedFrame event={event}><NotYet event={event} studio={studio} session={session} /></BlockedFrame>
  const copy = {
    expired: { icon: <CalendarX size={24} />, title: 'This gallery has closed', body: `${studio.name} can reopen it for you.` },
    disabled: { icon: <EyeOff size={24} />, title: 'This gallery is turned off', body: `${studio.name} has paused it for now. Your photos are safe. Ask them when it will be back.` },
    archived: { icon: <Archive size={24} />, title: 'This gallery has been archived', body: `Ask ${studio.name} to restore it or send you your photos.` },
  }[reason]
  return (
    <BlockedFrame event={event}>
      <StateBlock icon={copy.icon} tone="warn" title={copy.title} body={copy.body}>{contact}</StateBlock>
    </BlockedFrame>
  )
}

/**
 * "Photos are on their way" + Notify me: api.requestNotify stores the number and the API messages it when the first
 * photos go live (the session flag only caches that). 409 `already_live` means the photos just arrived: reload.
 */
function NotYet({ event, studio, session }: { event: PublicEvent; studio: PublicStudio; session: EventSession }) {
  const api = useApi()
  const qc = useQueryClient()
  const profilePhone = useGuest((s) => s.profile?.phone ?? '')
  const [asking, setAsking] = useState(false)
  const [phone, setPhone] = useState(profilePhone)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reload = () => void qc.invalidateQueries({ queryKey: ['event', event.shortId.toUpperCase()] })
  async function save(e?: FormEvent) {
    e?.preventDefault()
    if (!validPhone(phone)) { setError('Enter a 10-digit mobile number (you can add +91).'); setAsking(true); return }
    setBusy(true); setError(null)
    try {
      await api.requestNotify(event.shortId, phone.trim())
      guest.setProfile({ phone: phone.trim() })
      guest.patchSession(event.shortId, { notify: phone.trim() })
    } catch (err) {
      if (errorCode(err) === 'already_live') { reload(); return }
      const f = friendlyError(err, 'We couldn’t save your number')
      setError(`${f.title}. ${f.body}`); setAsking(true)
    } finally { setBusy(false) }
  }
  async function stop() {
    setBusy(true)
    try {
      await api.cancelNotify(event.shortId, session.notify!)
      guest.patchSession(event.shortId, { notify: undefined })
    } catch (err) {
      const f = friendlyError(err, 'We couldn’t stop the message')
      setError(`${f.title}. ${f.body}`)
    } finally { setBusy(false) }
  }
  if (session.notify) {
    return (
      <StateBlock icon={<BellRing size={24} />} tone="ok" title="We’ll let you know"
        body={`We’ll message ${session.notify} when ${studio.name} adds the photos. You can close this page.`}>
        {error && <p role="alert" className="text-[13px] font-semibold text-bad">{error}</p>}
        <WideButton loading={busy} onClick={() => void stop()}>Stop notifications</WideButton>
      </StateBlock>
    )
  }
  return (
    <StateBlock icon={<ImageIcon size={24} />} tone="neutral" title="Photos are on their way" body="The studio is still uploading. We’ll let you know when they’re here.">
      {asking ? (
        <form onSubmit={save} className="flex flex-col gap-2 text-left" noValidate>
          <Field label="Your mobile" htmlFor="notify-phone" error={error}>
            <Input id="notify-phone" type="tel" inputMode="tel" autoComplete="tel" autoFocus placeholder="+91 98450 55012" value={phone}
              onChange={(e) => { setPhone(e.target.value); setError(null) }} className="h-11 text-[15px]" />
          </Field>
          <PrimaryButton type="submit" loading={busy}>Notify me</PrimaryButton>
        </form>
      ) : (
        <WideButton icon={<BellRing size={16} />} loading={busy} onClick={() => (profilePhone ? void save() : setAsking(true))}>Notify me</WideButton>
      )}
    </StateBlock>
  )
}
