import { createSeed, generatePhotos, type SeedState } from '@frameline/shared'

/**
 * Turns `createSeed()` (the same sample data the mock API uses) into SQL for D1.
 * Pure: used by `pnpm db:seed` (Node → wrangler d1 execute) and by the tests (inside workerd).
 */

type Value = string | number | boolean | null | undefined | object
type Row = Record<string, Value>

const MAX_STATEMENT_BYTES = 90_000 // D1 caps a statement at 100 KB

function lit(v: Value): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return `'${s.replace(/'/g, "''")}'`
}

function inserts(table: string, rows: Row[]): string[] {
  if (!rows.length) return []
  const cols = Object.keys(rows[0])
  const head = `INSERT OR IGNORE INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES `
  const out: string[] = []
  let buf: string[] = []
  let size = head.length
  for (const r of rows) {
    const tuple = `(${cols.map((c) => lit(r[c])).join(', ')})`
    if (buf.length && size + tuple.length + 2 > MAX_STATEMENT_BYTES) {
      out.push(head + buf.join(', ') + ';')
      buf = []
      size = head.length
    }
    buf.push(tuple)
    size += tuple.length + 2
  }
  if (buf.length) out.push(head + buf.join(', ') + ';')
  return out
}

const paise = (n: number) => Math.round(n * 100)
export const SEED_STUDIO_ID = 'st_northlight'
export const SEED_USERS = { owner: 'u1', editor: 'u2', uploader: 'u3' } as const

const TABLES_IN_DELETE_ORDER = [
  'ticket_messages', 'tickets', 'faces', 'photos', 'people', 'films', 'guests', 'access_requests', 'uploads', 'albums',
  'cameras', 'smart_qrs', 'broadcasts', 'enquiries', 'activity', 'orders', 'ledger_entries', 'prices', 'watermarks', 'websites',
  'team_invites', 'memberships', 'events', 'refresh_tokens', 'otp_codes', 'idempotency_keys', 'audit_log', 'studios', 'users',
]

export function buildSeedSql(opts: { photoCap?: number; reset?: boolean; seed?: SeedState } = {}): string[] {
  const s = opts.seed ?? createSeed()
  const sid = s.studio.id
  const created = '2026-01-01T00:00:00.000Z'
  const stmts: string[] = []
  if (opts.reset) for (const t of TABLES_IN_DELETE_ORDER) stmts.push(`DELETE FROM ${t};`)

  stmts.push(...inserts('users', s.team.map((m) => ({
    id: m.id, email: m.email.toLowerCase(), name: m.name, password_hash: null, google_sub: null,
    email_verified_at: created, created_at: created, last_active_at: m.lastActive,
  }))))

  stmts.push(...inserts('studios', [{
    id: sid, name: s.studio.name, handle: s.studio.handle, logo_url: s.studio.logoUrl ?? null, brand_color: s.studio.brandColor,
    phone: s.studio.phone, email: s.studio.email, website: s.studio.website ?? null, instagram: s.studio.instagram ?? null,
    city: s.studio.city, follow_code: s.studio.followCode, about: s.studio.about ?? null,
    plan_id: s.usage.planId, plan_period: s.usage.period, valid_till: s.usage.validTill, photos_used: s.usage.photosUsed,
    photos_limit: s.usage.photosLimit, guest_reserved: s.usage.guestReserved, wallet_paise: paise(s.usage.walletCredits),
    renewal_multiplier: s.usage.renewalMultiplier, created_at: created,
  }]))

  const assigned: Record<string, string[]> = { uploader: ['ev_tessera'] }
  stmts.push(...inserts('memberships', s.team.map((m, i) => ({
    id: `mem_${m.id}`, studio_id: sid, user_id: m.id, role: m.role, event_ids: assigned[m.role] ?? [],
    created_at: new Date(Date.parse(created) + i * 1000).toISOString(), last_active_at: m.lastActive,
  }))))

  stmts.push(...inserts('events', s.events.map((e) => ({
    id: e.id, studio_id: sid, short_id: e.shortId, name: e.name, type: e.type, date: e.date, end_date: e.endDate ?? null, city: e.city,
    status: e.status, photo_count: e.photoCount, photo_limit: e.photoLimit, visits: e.visits, face_matches: e.faceMatches,
    expires_at: e.expiresAt, created_at: e.createdAt, cover_tones: e.coverTones, cover_photo_id: null, settings: e.settings,
    hosts: e.hosts, highlights: e.highlights, plan: e.plan,
  }))))

  const cap = opts.photoCap ?? Infinity
  const albums = s.albums.map((a) => ({ ...a, photoCount: Math.min(a.photoCount, cap) }))
  const photos = albums.flatMap((a) => generatePhotos(a, s.events.find((e) => e.id === a.eventId)!))
  stmts.push(...inserts('albums', albums.map((a) => {
    const ps = photos.filter((p) => p.albumId === a.id)
    return {
      id: a.id, event_id: a.eventId, studio_id: sid, name: a.name, sort_order: a.order, photo_count: ps.length, kind: a.kind,
      cover_photo_id: null, first_capture: ps[0]?.capturedAt ?? null, last_capture: ps[ps.length - 1]?.capturedAt ?? null, created_at: created,
    }
  })))
  if (opts.photoCap !== undefined) {
    // Keep event totals consistent with the capped photo set.
    for (const e of s.events) {
      const n = albums.filter((a) => a.eventId === e.id && a.kind !== 'store').reduce((t, a) => t + a.photoCount, 0)
      stmts.push(`UPDATE events SET photo_count = ${n} WHERE id = ${lit(e.id)};`)
    }
  }
  stmts.push(...inserts('photos', photos.map((p) => ({
    id: p.id, event_id: p.eventId, album_id: p.albumId, studio_id: sid, filename: p.filename, seq: p.index, captured_at: p.capturedAt,
    tone: p.tone, url: p.url ?? null, r2_key: null, status: p.status, hidden: p.hidden, favourites: p.favourites, downloads: p.downloads,
    faces: p.faces, exif: p.exif, uploaded_by: p.uploadedBy, source: p.source, quality: 'web', created_at: p.capturedAt,
  }))))
  stmts.push(...inserts('faces', photos.flatMap((p) => p.faces.map((f, k) => ({
    id: `${p.id}_f${k}`, photo_id: p.id, event_id: p.eventId, person_id: f.personId, box: f.box, vector_id: null,
  })))))

  stmts.push(...inserts('people', s.people.map((p) => ({ id: p.id, event_id: p.eventId, name: p.name ?? null, photo_count: p.photoCount, tone: p.tone, created_at: created }))))
  stmts.push(...inserts('films', s.films.map((f, i) => ({ id: f.id, event_id: f.eventId, name: f.name, url: f.url, created_at: new Date(Date.parse(created) + i * 1000).toISOString() }))))
  stmts.push(...inserts('guests', s.guests.map((g) => ({
    id: g.id, event_id: g.eventId, name: g.name, email: g.email, phone: g.phone, role: g.role, favourites: g.favourites,
    last_active: g.lastActive, registered_at: g.registeredAt,
  }))))
  stmts.push(...inserts('access_requests', s.accessRequests.map((a) => ({
    id: a.id, event_id: a.eventId, name: a.name, email: a.email, note: a.note, status: 'pending', created_at: a.createdAt, resolved_at: null, resolved_by: null,
  }))))
  stmts.push(...inserts('activity', s.activity.map((a) => ({ id: a.id, studio_id: sid, kind: a.kind, title: a.title, detail: a.detail, at: a.at }))))
  stmts.push(...inserts('orders', s.orders.map((o) => ({
    id: o.id, studio_id: sid, number: o.number, buyer: o.buyer, event_id: o.eventId, event_name: o.eventName, items: o.items,
    paid_paise: paise(o.paid), currency: o.currency, share_paise: paise(o.share), status: o.status, provider_ref: null, at: o.at,
  }))))
  stmts.push(...inserts('ledger_entries', s.ledger.map((l) => ({
    id: l.id, studio_id: sid, at: l.at, description: l.description, type: l.type, amount_paise: paise(l.amount), balance_paise: paise(l.balance),
  }))))
  stmts.push(...inserts('prices', s.prices.map((p, i) => ({ studio_id: sid, id: p.id, label: p.label, detail: p.detail, price_paise: paise(p.price), sort_order: i }))))
  stmts.push(...inserts('cameras', s.cameras.map((c, i) => ({
    id: c.id, studio_id: sid, label: c.label, event_id: c.eventId, album_id: c.albumId, mode: c.mode, ftp_user: c.ftpUser, status: c.status,
    today: c.today, last_file: c.lastFile ?? null, created_at: new Date(Date.parse(created) + i * 1000).toISOString(),
  }))))
  stmts.push(...inserts('smart_qrs', s.qrs.map((q, i) => ({
    id: q.id, studio_id: sid, name: q.name, slug: q.slug, event_id: q.eventId, target: q.target, scans: q.scans, color: q.color,
    created_at: new Date(Date.parse(created) + i * 1000).toISOString(),
  }))))
  stmts.push(...inserts('broadcasts', s.broadcasts.map((b) => ({
    id: b.id, studio_id: sid, title: b.title, body: b.body, audience: b.audience, sent_at: b.sentAt ?? null, scheduled_at: b.scheduledAt ?? null,
    open_rate: b.openRate ?? null, created_at: b.sentAt ?? b.scheduledAt ?? created,
  }))))
  stmts.push(...inserts('tickets', s.tickets.map((t) => ({
    id: t.id, studio_id: sid, subject: t.subject, event_id: t.eventId ?? null, platform: t.platform, status: t.status, created_by: SEED_USERS.owner,
    created_at: t.messages[0]?.at ?? created, updated_at: t.messages[t.messages.length - 1]?.at ?? created,
  }))))
  stmts.push(...inserts('ticket_messages', s.tickets.flatMap((t) => t.messages.map((m, i) => ({ id: `${t.id}_m${i}`, ticket_id: t.id, sender: m.from, body: m.body, at: m.at })))))
  stmts.push(...inserts('watermarks', [{ studio_id: sid, settings: s.watermark, updated_at: created }]))
  stmts.push(...inserts('websites', [{
    studio_id: sid, published: s.website.published, template: s.website.template, headline: s.website.headline, sections: s.website.sections,
    custom_domain: s.website.customDomain ?? null, updated_at: created,
  }]))
  stmts.push(...inserts('enquiries', s.enquiries.map((e) => ({
    id: e.id, studio_id: sid, name: e.name, phone: e.phone, email: e.email, message: e.message, source: e.source, note: e.note ?? null, at: e.at,
  }))))
  return stmts
}
