import { useState } from 'react'
import { Check, CheckCircle2, Circle, Copy, Loader2, RefreshCw } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Button, Chip, cn, Field, Input, Modal, Tip, useToast } from '@frameline/ui'
import { useCopy } from './helpers'

export interface DomainSetup {
  domain: string
  billing: 'monthly' | 'yearly'
  /** How many checklist steps have passed (0–4). */
  progress: number
  lastChecked?: string
  token: string
}

const DOMAIN_RE = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,24}$/

export const CHECKS = [
  { label: 'Domain added', detail: 'We reserved it for your site' },
  { label: 'DNS records found', detail: 'Your CNAME and TXT records are visible' },
  { label: 'Secure certificate issued', detail: 'HTTPS is ready (free, renews itself)' },
  { label: 'Site live on your domain', detail: 'Visitors see your site at your address' },
]

export function dnsRecords(setup: Pick<DomainSetup, 'domain' | 'token'>, handle: string) {
  const bare = setup.domain.replace(/^www\./, '')
  return [
    { type: 'CNAME', name: 'www', value: `${handle}.sites.frameline.in`, ttl: 'Auto' },
    { type: 'CNAME', name: '@', value: `${handle}.sites.frameline.in`, ttl: 'Auto', note: 'Use ALIAS / ANAME if your provider has no CNAME at @' },
    { type: 'TXT', name: `_frameline.${bare}`, value: `frameline-verify=${setup.token}`, ttl: 'Auto' },
  ]
}

export function DomainModal({ open, onOpenChange, handle, setup, onSetup, onLive }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  handle: string
  setup: DomainSetup | null
  onSetup: (s: DomainSetup | null) => void
  onLive: (domain: string) => void
}) {
  const toast = useToast()
  const copy = useCopy(toast)
  const [billing, setBilling] = useState<DomainSetup['billing']>(setup?.billing ?? 'yearly')
  const [domain, setDomain] = useState(setup?.domain ?? '')
  const [touched, setTouched] = useState(false)
  const [checking, setChecking] = useState(false)

  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const error = !clean ? 'Type the domain you own, for example northlightstudio.in'
    : clean.endsWith('.frameline.in') ? 'That’s already your free address. Use a domain you bought elsewhere.'
      : !DOMAIN_RE.test(clean) ? 'That doesn’t look like a domain. Use letters, numbers and dots, like studio.in' : null

  const start = () => {
    setTouched(true)
    if (error) return
    onSetup({ domain: clean, billing, progress: 1, lastChecked: new Date().toISOString(), token: Math.random().toString(36).slice(2, 12) })
    toast.success('Domain added', `${billing === 'yearly' ? '₹7,990/year' : '₹799/month'} starts when your domain is live.`)
  }

  const checkNow = () => {
    if (!setup) return
    setChecking(true)
    setTimeout(() => {
      const progress = Math.min(CHECKS.length, setup.progress + 1)
      onSetup({ ...setup, progress, lastChecked: new Date().toISOString() })
      setChecking(false)
      if (progress === CHECKS.length) { onLive(setup.domain); toast.success(`${setup.domain} is live`, 'Your site now opens on your own domain.') }
      else toast.success(`${CHECKS[progress - 1].label}`, 'We’ll keep checking every 10 minutes.')
    }, 1100)
  }

  const records = setup ? dnsRecords(setup, handle) : []
  const allText = records.map((r) => `${r.type}\t${r.name}\t${r.value}`).join('\n')

  return (
    <Modal open={open} onOpenChange={onOpenChange} width={640} title="Connect your own domain"
      description="Your site keeps working at its free address while you set this up."
      footer={setup ? <>
        <Button variant="ghost" className="mr-auto text-bad" onClick={() => { onSetup(null); toast.success('Domain removed', 'Your site stays on your free address.') }}>Remove domain</Button>
        <Button onClick={() => onOpenChange(false)}>Close</Button>
        {setup.progress < CHECKS.length && <Button variant="primary" icon={checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} onClick={checkNow} disabled={checking}>Check now</Button>}
      </> : <>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" onClick={start}>Continue</Button>
      </>}>
      {!setup ? (
        <div className="flex flex-col gap-4 px-5 py-4 sm:px-6">
          <Field label="How would you like to pay?">
            <div className="grid gap-2 sm:grid-cols-2">
              {([['monthly', '₹799', 'per month', 'Cancel any time'], ['yearly', '₹7,990', 'per year', '2 months free']] as const).map(([v, price, per, note]) => (
                <button key={v} type="button" onClick={() => setBilling(v)} aria-pressed={billing === v}
                  className={cn('rounded-card border p-3 text-left transition', billing === v ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunk')}>
                  <div className="flex items-center justify-between"><b className="text-[13px] capitalize">{v}</b>{billing === v && <Check size={15} className="text-accent-text" />}</div>
                  <div><span className="font-display text-[22px] font-semibold tnum">{price}</span> <span className="text-[12px] text-ink-2">{per}</span></div>
                  <div className="text-[11.5px] text-ink-3">{note} · GST extra</div>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Your domain" htmlFor="domain-input" error={touched ? error : undefined} hint="Buy one from GoDaddy, Namecheap, Google or any registrar first.">
            <Input id="domain-input" placeholder="northlightstudio.in" value={domain} autoComplete="off" spellCheck={false}
              onChange={(e) => setDomain(e.target.value)} onBlur={() => setTouched(true)} onKeyDown={(e) => e.key === 'Enter' && start()} />
          </Field>
          <p className="text-[12px] text-ink-2">Next we show the two DNS records to add at your registrar. We check them for you and switch on HTTPS automatically.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <b className="font-mono text-[14px]">{setup.domain}</b>
            {setup.progress >= CHECKS.length ? <Chip tone="ok" dot>Live</Chip> : <Chip tone="warn" dot>Waiting for DNS</Chip>}
            <span className="ml-auto text-[12px] text-ink-3">{setup.billing === 'yearly' ? '₹7,990/year' : '₹799/month'}</span>
          </div>
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-[14px]">1 · Add these records at your registrar</h4>
              <Button size="sm" icon={<Copy size={12} />} onClick={() => copy(allText, 'DNS records copied')}>Copy all</Button>
            </div>
            <div className="overflow-x-auto rounded-card border border-line">
              <table className="w-full min-w-[480px] text-left text-[12px]">
                <thead className="bg-sunk text-ink-2"><tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">TTL</th><th className="w-8" /></tr></thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.type + r.name} className="border-t border-line align-top">
                      <td className="px-3 py-2 font-mono font-bold">{r.type}</td>
                      <td className="px-3 py-2 font-mono">{r.name}</td>
                      <td className="px-3 py-2 font-mono break-all">{r.value}{r.note && <div className="font-sans text-[11px] text-ink-3">{r.note}</div>}</td>
                      <td className="px-3 py-2 text-ink-2">{r.ttl}</td>
                      <td className="px-1 py-1.5">
                        <Tip label="Copy value"><button type="button" aria-label={`Copy ${r.type} ${r.name} value`} onClick={() => copy(r.value)} className="rounded p-1 text-ink-3 hover:bg-sunk hover:text-ink"><Copy size={13} /></button></Tip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h4 className="mb-2 text-[14px]">2 · Setup progress</h4>
            <ol className="flex flex-col gap-2">
              {CHECKS.map((c, i) => {
                const done = i < setup.progress
                const current = i === setup.progress
                return (
                  <li key={c.label} className="flex items-start gap-2.5">
                    {done ? <CheckCircle2 size={17} className="mt-0.5 text-ok" /> : current && checking ? <Loader2 size={17} className="mt-0.5 animate-spin text-accent-text" /> : <Circle size={17} className="mt-0.5 text-ink-3" />}
                    <div><div className={cn('text-[13px] font-bold', !done && 'text-ink-2')}>{c.label}</div><div className="text-[11.5px] text-ink-3">{c.detail}</div></div>
                  </li>
                )
              })}
            </ol>
            <p className="mt-3 text-[12px] text-ink-3">
              Last checked {setup.lastChecked ? `${fmt.time(setup.lastChecked)} · ${fmt.ago(setup.lastChecked)}` : 'never'}. DNS changes can take up to 24 hours; we check every 10 minutes.
            </p>
          </section>
        </div>
      )}
    </Modal>
  )
}
