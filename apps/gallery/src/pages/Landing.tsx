import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Download, ScanFace, X } from 'lucide-react'
import { Button, Field, Input, LogoMark, Tip } from '@frameline/ui'
import { fmt, toneCss } from '@frameline/shared'
import { useApi } from '../lib/api'
import { guest, useGuest } from '../lib/guest'
import { friendlyError, isNotFound } from '../lib/errors'
import { isStandalone, promptInstall, useCanInstall } from '../lib/pwa'
import { CodeForm } from '../components/common'

/** frameline.in/ — enter an event code, reopen a recent gallery, or find a studio by its follow code. */
export function Landing() {
  const api = useApi()
  const navigate = useNavigate()
  const recent = useGuest((s) => s.recent)
  const follows = useGuest((s) => s.follows)
  const canInstall = useCanInstall()
  const [follow, setFollow] = useState('')
  const [followError, setFollowError] = useState<string | null>(null)
  const [followBusy, setFollowBusy] = useState(false)

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
      if (isNotFound(err)) setFollowError(`No studio uses the code ${code}. Ask your photographer for their code.`)
      else { const f = friendlyError(err); setFollowError(`${f.title}. ${f.body}`) }
    } finally { setFollowBusy(false) }
  }

  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pb-10 pt-safe">
        <header className="flex h-14 items-center justify-between">
          <span className="flex items-center gap-2 text-[16px] font-extrabold"><LogoMark size={28} />Frameline</span>
          {canInstall && !isStandalone() && <Button icon={<Download size={14} />} className="h-11" onClick={() => void promptInstall()}>Install</Button>}
        </header>

        <section className="flex flex-col gap-4">
          <div>
            <h1 className="font-display text-[30px] font-semibold leading-[1.1]">Open your photos</h1>
            <p className="mt-1.5 text-[14.5px] text-ink-2">Type the code from your invite or the QR card. Then take a selfie to find every photo you’re in.</p>
          </div>
          <div className="rounded-card border border-line bg-surface p-4 shadow-card">
            <CodeForm />
          </div>
          <p className="flex items-center gap-2 text-[12.5px] text-ink-3"><ScanFace size={15} />No app or account needed. Your selfie is deleted after 30 days.</p>
        </section>

        {recent.length > 0 && (
          <section aria-labelledby="recent-h">
            <h2 id="recent-h" className="mb-2 text-[15px]">Opened on this phone</h2>
            <ul className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
              {recent.map((r) => (
                <li key={r.shortId} className="flex items-center border-t border-line first:border-t-0">
                  <Link to={`/${r.shortId.toLowerCase()}`} className="flex min-w-0 flex-1 items-center gap-3 p-2.5 hover:bg-sunk">
                    <span className="vignette relative size-12 shrink-0 overflow-hidden rounded-[8px]" style={{ background: toneCss(r.tone) }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14px]">{r.name}</b>
                      <span className="block truncate text-[12.5px] text-ink-2">{fmt.date(r.date)} · {r.city}</span>
                    </span>
                    <ChevronRight size={17} className="text-ink-3" />
                  </Link>
                  <Tip label="Remove from this list">
                    <button type="button" aria-label={`Remove ${r.name} from this list`} className="mr-1 grid size-11 place-items-center rounded-full text-ink-3 hover:bg-sunk hover:text-ink"
                      onClick={() => guest.update((s) => ({ ...s, recent: s.recent.filter((x) => x.shortId !== r.shortId) }))}><X size={16} /></button>
                  </Tip>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="follow-h" className="rounded-card border border-line bg-surface p-4 shadow-card">
          <h2 id="follow-h" className="text-[15px]">Find your photographer</h2>
          <p className="mb-3 mt-0.5 text-[13px] text-ink-2">See all their events in one place with their studio code. It starts with FA-.</p>
          <form onSubmit={followStudio} noValidate>
            <Field htmlFor="follow" error={followError}>
              <div className="flex gap-2">
                <Input id="follow" aria-label="Studio code" value={follow} placeholder="FA-KCGWHY" autoCapitalize="characters" spellCheck={false}
                  onChange={(e) => { setFollow(e.target.value); setFollowError(null) }} className="h-11 flex-1 text-[15px] uppercase" aria-invalid={!!followError} />
                <Button type="submit" size="lg" loading={followBusy} className="h-11">Find</Button>
              </div>
            </Field>
          </form>
          {follows.length > 0 && (
            <ul className="mt-3 flex flex-col">
              {follows.map((f) => (
                <li key={f}><Link to={`/studio/${f.toLowerCase()}`} className="inline-flex min-h-11 items-center gap-1 text-[13.5px] font-extrabold text-accent-text hover:underline">Studio you follow ({f})<ChevronRight size={15} /></Link></li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-auto text-center text-[12px] text-ink-3">Frameline delivers photos for event photographers.</footer>
      </div>
    </main>
  )
}
