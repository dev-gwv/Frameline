import type { Env } from '../env'
import { ServiceUnavailable } from '../lib/errors'

export interface MailMessage { to: string; subject: string; text: string; html?: string }

/** Pluggable email transport. */
export interface Mailer {
  readonly name: string
  send(msg: MailMessage): Promise<void>
}

/** Resend (https://resend.com) over fetch. */
export class ResendMailer implements Mailer {
  readonly name = 'resend'
  constructor(private apiKey: string, private from: string) {}
  async send(msg: MailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(JSON.stringify({ level: 'error', msg: 'resend send failed', status: res.status, detail: detail.slice(0, 500) }))
      throw new ServiceUnavailable('We could not send the email right now. Try again in a minute.', 'email_failed')
    }
  }
}

/** Development transport: prints the message (including any sign-in code) to the Worker log. */
export class ConsoleMailer implements Mailer {
  readonly name = 'console'
  async send(msg: MailMessage): Promise<void> {
    console.log(JSON.stringify({ level: 'info', msg: 'email (dev mailer — not sent)', to: msg.to, subject: msg.subject, text: msg.text }))
  }
}

/** Refuses to send: production without a provider must not silently drop sign-in codes. */
class UnconfiguredMailer implements Mailer {
  readonly name = 'none'
  async send(): Promise<void> {
    throw new ServiceUnavailable('Email sign-in is not configured on this server (RESEND_API_KEY missing).', 'email_not_configured')
  }
}

export function getMailer(env: Env): Mailer {
  if (env.RESEND_API_KEY) return new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM)
  if (env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'test') return new ConsoleMailer()
  return new UnconfiguredMailer()
}

export function otpEmail(code: string): Omit<MailMessage, 'to'> {
  const text = `Your Frameline sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#1b1712">
<p>Your Frameline sign-in code:</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:700;font-family:ui-monospace,monospace">${code}</p>
<p style="color:#6b625a">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p></div>`
  return { subject: `${code} is your Frameline sign-in code`, text, html }
}
