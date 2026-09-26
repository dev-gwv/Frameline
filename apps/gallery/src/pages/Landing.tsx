import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Download, History, ScanFace, Store, X } from 'lucide-react'
import { Button, Field, Input, LogoMark, Tip } from '@frameline/ui'
import { fmt, toneCss } from '@frameline/shared'
import { useApi } from '../lib/api'
import { guest, useGuest } from '../lib/guest'
import { friendlyError, isNotFound } from '../lib/errors'
import { isStandalone, promptInstall, useCanInstall } from '../lib/pwa'

export function Landing() {
  const api = useApi()
  const navigate = useNavigate()
  const recent = useGuest((s) => s.recent)
  const follows = useGuest((s) => s.follows)
  const canInstall = useCanInstall()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [follow, setFollow] = useState('')
  const [followError, setFollowError] = useState<string | null>(null)
  const [followBusy, setFollowBusy] = useState(false)

  async function open(e: FormEvent) {
    e.preventDefault()
    const c = code.trim().replace(/^.*frameline\.in\//i, '').replace(/[^0-9a-z]/gi, '').toUpperCase()
    if (c.length < 6) { setCodeError('Enter the 7-character code from your invite, like 6402F9F.'); return }
    setChecking(true)
    try {
      await api.getPublicEvent(c)
      navigate(`/${c.toLowerCase()}`)
    } catch (err) {
      if (isNotFound(err)) setCodeError(`We couldn't find an event with code ${c}. Check it against your invite.`)
      else { const f = friendlyError(err); setCodeError(`${f.title}. ${f.body}`) }
    } finally { setChecking(false) }
  }

  async function followStudio(e: FormEvent) {
    e.preventDefault()
    const c = follow.trim().toUpperCase().replace(/\s/g, '')
    if (!/^FA-?[A-Z0-9]{4,}$/.test(c)) { setFollowError('Studio codes start with FA-, like FA-KCGWHY.'); return }
    setFollowBusy(true)
    const code = c.includes('-') ? c : `FA-${c.slice(2)}`
    try {
      const profile = await api.getStudioProfile(code)
      navigate(`/studio/${profile.studio.followCode.toLowerCase()}`)
    } catch (err) {
      if (isNotFound(err)) setFollowError(`No studio uses the code ${code}. Ask your photographer for their follow code.`)
      else { const f = friendlyError(err); setFollowError(`${f.title}. ${f.body}`) }
    } finally { setFollowBusy(false) }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-7 px-4 pb-10 pt-safe sm:max-w-lg">
      <header className="flex items-center justify-between pt-5">
        <span className="flex items-center gap-2 font-display text-[17px] font-semibold"><LogoMark size={28} />Frameline</span>
        {canInstall && !isStandalone() && <Button size="sm" icon={<Download size={13} />} onClick={() => void promptInstall()}>Install</Button>}
      </header>

      <section className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-[32px] font-semibold leading-[1.05]">Open your photos</h1>
          <p className="mt-1.5 text-[14px] text-ink-2">Enter the event code from your invite or the QR card. Then take a selfie to find every photo you're in.</p>
        </div>
        <form onSubmit={open} className="flex flex-col gap-2.5" noValidate>
          <Field label="Event code" htmlFor="code" error={codeError}>
            <Input id="code" value={code} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="6402F9F" maxLength={40}
              onChange={(e) => { setCode(e.target.value); setCodeError(null) }}
              className="h-13 font-mono text-[20px] uppercase tracking-[0.2em] placeholder:tracking-[0.2em]" aria-invalid={!!codeError} />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={checking} iconRight={<ArrowRight size={16} />} className="h-12 w-full justify-center text-[15px]">Open photos</Button>
        </form>
        <p className="flex items-center gap-2 text-[12px] text-ink-3"><ScanFace size={14} />No app or account needed. Your selfie is deleted after 30 days.</p>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="mb-2 flex items-center gap-1.5 text-[15px]"><History size={15} className="text-ink-3" />Recently opened</h2>
          <ul className="flex flex-col gap-2">
            {recent.map((r) => (
              <li key={r.shortId} className="flex items-center gap-1">
                <Link to={`/${r.shortId.toLowerCase()}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-card border border-line bg-surface p-2 pr-3 hover:bg-sunk">
                  <span className="vignette relative size-12 shrink-0 overflow-hidden rounded-[8px]" style={{ background: toneCss(r.tone) }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14px]">{r.name}</b>
                    <span className="block truncate text-[12px] text-ink-2">{fmt.date(r.date)} · {r.city} · <span className="font-mono">{r.shortId}</span></span>
                  </span>
                  <ArrowRight size={16} className="text-ink-3" />
                </Link>
                <Tip label="Remove from this list">
                  <button type="button" aria-label={`Remove ${r.name} from recent`} className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-sunk hover:text-ink"
                    onClick={() => guest.update((s) => ({ ...s, recent: s.recent.filter((x) => x.shortId !== r.shortId) }))}><X size={15} /></button>
                </Tip>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="follow-h" className="rounded-card border border-line bg-surface p-4">
        <h2 id="follow-h" className="flex items-center gap-1.5 text-[15px]"><Store size={15} className="text-accent-text" />Follow a studio</h2>
        <p className="mb-3 mt-0.5 text-[12.5px] text-ink-2">See every event from your photographer in one place, with their code (starts with FA-).</p>
        <form onSubmit={followStudio} className="flex flex-col gap-2" noValidate>
          <Field htmlFor="follow" error={followError}>
            <div className="flex gap-2">
              <Input id="follow" aria-label="Studio follow code" value={follow} placeholder="FA-KCGWHY" autoCapitalize="characters" spellCheck={false}
                onChange={(e) => { setFollow(e.target.value); setFollowError(null) }} className="h-11 flex-1 font-mono uppercase tracking-wider" aria-invalid={!!followError} />
              <Button type="submit" size="lg" loading={followBusy}>Find</Button>
            </div>
          </Field>
        </form>
        {follows.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {follows.map((f) => <Link key={f} to={`/studio/${f.toLowerCase()}`} className="rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[11.5px] font-bold text-accent-text hover:underline">Following {f}</Link>)}
          </div>
        )}
      </section>

      <footer className="mt-auto text-center text-[11.5px] text-ink-3">Frameline delivers photos for event photographers.</footer>
    </main>
  )
}
