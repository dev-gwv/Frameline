import { SELF, env } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import { matchFaces } from '../src/services/faces'
import { seal } from '../src/lib/seal'
import { BASE, call, expectProblem, freshIp, SEED } from './helpers'

/**
 * Studio AutoPilot opening Frameline as its gallery add-on: sign-in from a single-use token, and one gallery
 * per project. Tokens are minted here the way Studio AutoPilot's server mints them.
 */

const SECRET = env.STUDIOAUTOPILOT_SECRET!
const enc = new TextEncoder()
const b64 = (bytes: Uint8Array | ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const uid = () => crypto.randomUUID()

async function mint(over: Record<string, unknown> = {}, secret = SECRET): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    iss: 'studioautopilot', aud: 'frameline', sub: uid(), jti: uid(), iat: now, exp: now + 60, purpose: 'sso',
    cid: uid(), cname: 'Sharma Studio', name: 'Ravi Sharma', email: `ravi.${uid().slice(0, 8)}@example.com`,
    email_verified: true, role: 'owner', ...over,
  }
  const head = b64(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64(enc.encode(JSON.stringify(claims)))
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = b64(await crypto.subtle.sign('HMAC', key, enc.encode(`${head}.${body}`)))
  return `${head}.${body}.${sig}`
}

/** The redirect itself, not where it leads: the admin app is not this worker. */
async function sso(token: string) {
  const res = await SELF.fetch(`${BASE}/v1/integrations/studioautopilot/sso?token=${encodeURIComponent(token)}`, {
    redirect: 'manual', headers: { 'cf-connecting-ip': freshIp() },
  })
  await res.text()
  return { status: res.status, headers: res.headers }
}

/** Follows the redirect's fragment the way the admin app's /auth/callback does. */
function sessionFrom(location: string | null) {
  expect(location).toBeTruthy()
  const url = new URL(location!)
  const frag = new URLSearchParams(url.hash.slice(1))
  return { url, accessToken: frag.get('access_token')! }
}

describe('signing in from Studio AutoPilot', () => {
  it('makes the owner\'s studio and lands them where they were going', async () => {
    const cid = uid()
    const r = await sso(await mint({ cid, cname: 'Kapoor Films', to: '/events?new=1' }))
    expect(r.status).toBe(302)
    const { url, accessToken } = sessionFrom(r.headers.get('location'))
    expect(`${url.origin}${url.pathname}`).toBe(`${env.APP_URL}/auth/callback`)
    expect(url.searchParams.get('from')).toBe('/events?new=1')
    expect(r.headers.get('cache-control')).toContain('no-store')

    const me = await call('/v1/me', { token: accessToken })
    expect(me.status).toBe(200)
    expect(me.json.memberships).toEqual([expect.objectContaining({ role: 'owner', studioName: 'Kapoor Films' })])
  })

  it('opens a link only once', async () => {
    const token = await mint()
    expect((await sso(token)).status).toBe(302)
    const again = await sso(token)
    expect(again.headers.get('location')).toBe(`${env.APP_URL}/login?error=sa_link_expired`)
  })

  it('refuses a forged, expired, long-lived or wrong-purpose token', async () => {
    const now = Math.floor(Date.now() / 1000)
    for (const token of [
      await mint({}, 'not-the-shared-secret-not-the-shared-secret'),
      await mint({ iat: now - 600, exp: now - 300 }),
      await mint({ exp: now + 3600 }),
      await mint({ purpose: 'api' }),
      await mint({ iss: 'someone-else' }),
      'not.a.token',
    ]) {
      expect((await sso(token)).headers.get('location')).toBe(`${env.APP_URL}/login?error=sa_link_expired`)
    }
  })

  it('never sends someone outside the admin app', async () => {
    const r = await sso(await mint({ to: '//evil.example/steal' }))
    expect(sessionFrom(r.headers.get('location')).url.searchParams.get('from')).toBe('/events')
  })

  it('lets the team in only after the owner, and as editors', async () => {
    const cid = uid()
    const early = await sso(await mint({ cid, role: 'editor' }))
    expect(early.headers.get('location')).toBe(`${env.APP_URL}/login?error=sa_studio_not_set_up`)

    await sso(await mint({ cid, role: 'owner', cname: 'Mehta Studio' }))
    const later = await sso(await mint({ cid, role: 'editor' }))
    const me = await call('/v1/me', { token: sessionFrom(later.headers.get('location')).accessToken })
    expect(me.json.memberships).toEqual([expect.objectContaining({ role: 'editor', studioName: 'Mehta Studio' })])
  })

  it('is the same person every time, matched by their Studio AutoPilot id', async () => {
    const sub = uid()
    const cid = uid()
    const first = await call('/v1/me', { token: sessionFrom((await sso(await mint({ sub, cid }))).headers.get('location')).accessToken })
    const second = await call('/v1/me', { token: sessionFrom((await sso(await mint({ sub, cid, email: 'changed@example.com' }))).headers.get('location')).accessToken })
    expect(second.json.user.id).toBe(first.json.user.id)
    expect(second.json.memberships).toHaveLength(1)
  })

  it('does not hand over an account for an email Studio AutoPilot has not confirmed', async () => {
    // Its team logins may carry any email. Typing the Frameline owner's address must not open their account.
    const r = await sso(await mint({ email: SEED.owner.email, email_verified: false }))
    const me = await call('/v1/me', { token: sessionFrom(r.headers.get('location')).accessToken })
    expect(me.json.user.id).not.toBe(SEED.owner.id)
    expect(me.json.user.email).toMatch(/@users\.studioautopilot\.invalid$/)
    expect(me.json.memberships.map((m: { studioId: string }) => m.studioId)).not.toContain('st_northlight')
  })

  it('keeps a confirmed owner\'s own studio rather than making them a second one', async () => {
    const r = await sso(await mint({ email: SEED.owner.email, email_verified: true, role: 'owner' }))
    const me = await call('/v1/me', { token: sessionFrom(r.headers.get('location')).accessToken })
    expect(me.json.user.id).toBe(SEED.owner.id)
    expect(me.json.memberships).toHaveLength(1)
    expect(me.json.memberships[0]).toMatchObject({ studioId: 'st_northlight', role: 'owner' })
  })
})

describe('a project\'s gallery', () => {
  const api = (path: string, token: string, body?: unknown) => call(`/v1/integrations/studioautopilot${path}`, { token, body })
  const project = { projectId: 'proj-1', name: 'Priya & Rahul\'s Wedding', date: '2026-12-11T00:00:00.000Z', city: 'Jaipur' }

  it('is made once per project, and read back', async () => {
    const cid = uid()
    const sub = uid()
    const made = await api('/events', await mint({ cid, sub, purpose: 'api' }), project)
    expect(made.status).toBe(201)
    expect(made.json).toMatchObject({ projectId: 'proj-1', name: project.name, status: 'draft', photoCount: 0, adminPath: `/events/${made.json.eventId}` })
    expect(made.json.galleryUrl).toBe(`${env.GALLERY_URL}/${made.json.shortId}`)
    expect(made.json.pin).toMatch(/^\d{4}$/)

    const again = await api('/events', await mint({ cid, sub, purpose: 'api' }), project)
    expect(again.status).toBe(200)
    expect(again.json.eventId).toBe(made.json.eventId)

    const read = await api('/events/proj-1', await mint({ cid, sub, purpose: 'api' }))
    expect(read.status).toBe(200)
    expect(read.json.eventId).toBe(made.json.eventId)
  })

  it('makes a gallery guests can use today: PIN and registration on, downloads on, no selfie needed', async () => {
    const made = await api('/events', await mint({ purpose: 'api' }), project)
    const row = await env.DB.prepare('SELECT settings FROM events WHERE id = ?').bind(made.json.eventId).first<{ settings: string }>()
    const s = JSON.parse(row!.settings)
    expect(s).toMatchObject({ access: 'link-pin', requireRegistration: true, facePrivacy: false, downloads: 'all' })

    // Not ready while empty; with a photo, the PIN opens it and a ZIP of everything can be asked for.
    const r = (path: string, body?: unknown, token?: string) => call(`/v1/public/events/${made.json.shortId}${path}`, { body, ...(token ? { token } : {}) })
    expectProblem(await r('/pin', { pin: made.json.pin }), 403, 'gallery_empty')
    await env.DB.prepare('UPDATE events SET photo_count = 1 WHERE id = ?').bind(made.json.eventId).run()
    const session = await r('/pin', { pin: made.json.pin })
    expect(session.status).toBe(200)
    const guestToken = session.json.token ?? session.json.accessToken
    // A ZIP can't carry the studio watermark: watermarked galleries save photos one by one in the gallery.
    expectProblem(await r('/zips', { email: 'guest@example.com' }, guestToken), 409, 'watermark_required')
    await env.DB.prepare(`UPDATE events SET settings = json_set(settings, '$.watermarkOff', json('true')) WHERE id = ?`).bind(made.json.eventId).run()
    const zip = await r('/zips', { email: 'guest@example.com' }, guestToken)
    expect(zip.status).toBe(202)
  })

  it('keeps two companies\' projects apart even with the same project id', async () => {
    const a = await api('/events', await mint({ purpose: 'api' }), project)
    const b = await api('/events', await mint({ purpose: 'api' }), project)
    expect(a.json.eventId).not.toBe(b.json.eventId)
  })

  it('makes a new gallery when the old one was moved to the trash', async () => {
    const cid = uid()
    const first = await api('/events', await mint({ cid, purpose: 'api' }), project)
    await env.DB.prepare('UPDATE events SET deleted_at = ? WHERE id = ?').bind(new Date().toISOString(), first.json.eventId).run()
    expectProblem(await api('/events/proj-1', await mint({ cid, purpose: 'api' })), 404)
    const second = await api('/events', await mint({ cid, purpose: 'api' }), project)
    expect(second.status).toBe(201)
    expect(second.json.eventId).not.toBe(first.json.eventId)
  })

  it('waits for the owner, like sign-in', async () => {
    expectProblem(await api('/events', await mint({ role: 'editor', purpose: 'api' }), project), 409, 'partner_studio_not_set_up')
  })

  it('takes only server tokens, and each only once', async () => {
    expectProblem(await api('/events', await mint({ purpose: 'sso' }), project), 401, 'invalid_partner_token')
    const token = await mint({ purpose: 'api' })
    expect((await api('/events', token, project)).status).toBe(201)
    expectProblem(await api('/events', token, project), 401, 'partner_token_used')
    expectProblem(await call('/v1/integrations/studioautopilot/events', { body: project }), 401, 'missing_token')
  })
})

describe('selfie search', () => {
  it('never returns a photo a guest may not see, even when no person is matched', async () => {
    // Every vector hit has no person until face clustering exists, and those hits used to skip the
    // visibility rules: a hidden photo came back to a guest through a selfie.
    const rows = await env.DB.prepare(
      `SELECT p.id, p.event_id FROM photos p JOIN albums a ON a.id = p.album_id
        WHERE p.status = 'ready' AND p.hidden = 0 AND p.deleted_at IS NULL AND a.kind = 'album'
          AND (p.review_status IS NULL OR p.review_status = 'approved') ORDER BY p.id LIMIT 2`,
    ).all<{ id: string; event_id: string }>()
    const [shown, hidden] = rows.results
    expect(hidden?.event_id).toBe(shown!.event_id)
    await env.DB.prepare('UPDATE photos SET hidden = 1 WHERE id = ?').bind(hidden!.id).run()
    for (const [v, p] of [['vtest-1', shown!.id], ['vtest-2', hidden!.id]] as const) {
      await env.DB.prepare('INSERT INTO faces (id, photo_id, event_id, person_id, box, vector_id) VALUES (?, ?, ?, NULL, ?, ?)')
        .bind(`f_${v}`, p, shown!.event_id, '[0,0,1,1]', v).run()
    }
    const index = { query: async () => ({ count: 2, matches: [{ id: 'vtest-1', score: 0.9 }, { id: 'vtest-2', score: 0.9 }] }) }
    const prod = { ...env, ENVIRONMENT: 'production' as const, VECTORIZE_REMOTE: undefined, FACES: index as unknown as VectorizeIndex }
    const r = await matchFaces(prod, shown!.event_id, 'selfie', new Array(128).fill(0.1))
    expect(r.personId).toBeNull()
    expect(r.photoIds).toEqual([shown!.id])
  })
})

describe('what Studio AutoPilot reads back', () => {
  const api = (path: string, token: string, body?: unknown) => call(`/v1/integrations/studioautopilot${path}`, { token, body })

  it('lists the company\'s galleries and its studio, with the PINs and figures the project page shows', async () => {
    const cid = uid()
    const sub = uid()
    const before = await api('/studio', await mint({ cid, sub, purpose: 'api' }))
    expect(before.json).toMatchObject({ linked: false, galleries: 0 })
    expect((await api('/events', await mint({ cid, sub, purpose: 'api' }))).json.items).toEqual([])

    const made = await api('/events', await mint({ cid, sub, purpose: 'api' }), { projectId: 'p-a', name: 'Anaya & Dev', date: '2026-12-01T00:00:00.000Z' })
    await api('/events', await mint({ cid, sub, purpose: 'api' }), { projectId: 'p-b', name: 'Mehra Reception', date: '2026-12-02T00:00:00.000Z' })
    await api('/events', await mint({ purpose: 'api' }), { projectId: 'p-other', name: 'Someone else', date: '2026-12-03T00:00:00.000Z' })

    const list = await api('/events', await mint({ cid, sub, purpose: 'api' }))
    expect(list.status).toBe(200)
    expect(list.json.items.map((g: { projectId: string }) => g.projectId).sort()).toEqual(['p-a', 'p-b'])
    expect(list.json.items[0]).toMatchObject({ facePrivacy: false, fullAccessPin: null, visits: 0 })
    expect(list.json.items[0].expiresAt).toBeTruthy()

    const one = await api('/events/p-a', await mint({ cid, sub, purpose: 'api' }))
    expect(one.json).toMatchObject({ eventId: made.json.eventId, guests: 0, pin: made.json.pin })

    const studio = await api('/studio', await mint({ cid, sub, purpose: 'api' }))
    expect(studio.json).toMatchObject({ linked: true, studioName: 'Sharma Studio', galleries: 2, adminUrl: env.APP_URL })
    expect(typeof studio.json.walletRupees).toBe('number')
  })
})

describe('Google Drive through Studio AutoPilot', () => {
  const api = (path: string, token: string, body?: unknown) => call(`/v1/integrations/studioautopilot${path}`, { token, body })
  const bag = env as unknown as Record<string, unknown>
  const KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DRIVE_TOKEN_KEY', 'GOOGLE_PICKER_API_KEY'] as const
  const saved: Record<string, unknown> = {}
  const on = () => { for (const k of KEYS) saved[k] = bag[k]; Object.assign(bag, { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'cs', DRIVE_TOKEN_KEY: 'k'.repeat(44), GOOGLE_PICKER_API_KEY: 'pk' }) }
  const off = () => { for (const k of KEYS) bag[k] = saved[k] }

  it('says whether the studio connected Drive, keeps originals there when asked, and gives the admin paths', async () => {
    on()
    try {
      const cid = uid()
      const sub = uid()
      const first = await api('/events', await mint({ cid, sub, purpose: 'api' }), { projectId: 'd-1', name: 'Drive wedding', date: '2026-12-01T00:00:00.000Z' })
      expect(first.json).toMatchObject({ originalsIn: 'frameline', importPath: `/events/${first.json.eventId}?modal=import` })
      const notYet = await api('/studio', await mint({ cid, sub, purpose: 'api' }))
      expect(notYet.json.drive).toMatchObject({ available: true, importAvailable: true, connected: false, needsReconnect: false, settingsPath: '/settings/drive' })
      // Asking for Drive before it is connected is refused, not quietly ignored.
      expectProblem(await api('/events', await mint({ cid, sub, purpose: 'api' }), { projectId: 'd-2', name: 'Too early', date: '2026-12-02T00:00:00.000Z', originalsIn: 'drive' }), 409, 'drive_not_connected')

      const ev = await env.DB.prepare('SELECT studio_id FROM events WHERE id = ?').bind(first.json.eventId).first<{ studio_id: string }>()
      const now = new Date().toISOString()
      await env.DB.prepare(`INSERT INTO drive_connections (studio_id, google_sub, email, refresh_token_enc, scope, status, default_for_new_events, missing_files, connected_by, connected_at)
        VALUES (?, 'g-1', 'studio@gmail.com', 'v1.x.y', 'drive.file', 'ok', 0, 0, 'u', ?)`).bind(ev!.studio_id, now).run()
      const studio = await api('/studio', await mint({ cid, sub, purpose: 'api' }))
      expect(studio.json.drive).toMatchObject({ connected: true, email: 'studio@gmail.com', defaultForNewEvents: false })
      const inDrive = await api('/events', await mint({ cid, sub, purpose: 'api' }), { projectId: 'd-3', name: 'Kept in Drive', date: '2026-12-03T00:00:00.000Z', originalsIn: 'drive' })
      expect(inDrive.status).toBe(201)
      expect(inDrive.json.originalsIn).toBe('drive')
    } finally {
      off()
    }
  })

  it("imports from Studio AutoPilot's own picker into the project's gallery, and stops it", async () => {
    const key = btoa('k'.repeat(32))
    const keys = [...KEYS, 'PHOTO_QUEUE'] as const
    for (const k of keys) saved[k] = bag[k]
    const queued: unknown[] = []
    Object.assign(bag, { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'cs', DRIVE_TOKEN_KEY: key, GOOGLE_PICKER_API_KEY: 'pk', PHOTO_QUEUE: { send: async () => {}, sendBatch: async (m: unknown[]) => { queued.push(...m) } } })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })
      if (url.href.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'at-sa', expires_in: 3600 })
      if (url.pathname === '/drive/v3/files') return json({ files: [{ id: 'fileSaHaldi001', name: 'H1.JPG', mimeType: 'image/jpeg', size: '100' }, { id: 'fileSaHaldiRaw', name: 'H2.CR3', mimeType: 'image/x-canon-cr3', size: '100' }] })
      if (url.pathname === '/drive/v3/files/folderSaHaldi1') return json({ id: 'folderSaHaldi1', name: 'Haldi', mimeType: 'application/vnd.google-apps.folder' })
      return new Response('unexpected', { status: 500 })
    }))
    try {
      const cid = uid()
      const sub = uid()
      const tok = () => mint({ cid, sub, purpose: 'api' })
      // Nothing set up here yet: Drive is not connected.
      expectProblem(await api('/drive/picker', await tok()), 409, 'drive_not_connected')
      const g = await api('/events', await tok(), { projectId: 'sa-drive', name: 'Mehta Wedding', date: '2026-12-01T00:00:00.000Z' })
      const ev = await env.DB.prepare('SELECT studio_id FROM events WHERE id = ?').bind(g.json.eventId).first<{ studio_id: string }>()
      await env.DB.prepare(`INSERT INTO drive_connections (studio_id, google_sub, email, refresh_token_enc, scope, status, default_for_new_events, missing_files, connected_by, connected_at)
        VALUES (?, 'g-sa', 'studio@gmail.com', ?, 'drive.file', 'ok', 0, 0, 'u', ?)`).bind(ev!.studio_id, await seal(key, 'rt-sa'), new Date().toISOString()).run()

      expect((await api('/drive/picker', await tok())).json).toMatchObject({ accessToken: 'at-sa', apiKey: 'pk' })
      const picked = await api('/drive/expand', await tok(), { ids: ['folderSaHaldi1'] })
      expect(picked.json.items.map((i: { name: string; importable: boolean; folderPath: string }) => [i.name, i.importable, i.folderPath])).toEqual([['H1.JPG', true, 'Haldi'], ['H2.CR3', false, 'Haldi']])

      const items = [{ fileId: 'fileSaHaldi001', name: 'H1.JPG', size: 100, mimeType: 'image/jpeg', albumName: 'Haldi' }]
      expectProblem(await api('/events/not-a-project/drive-imports', await tok(), { name: 'Haldi', quality: 'web', items }), 404)
      const start = await api('/events/sa-drive/drive-imports', await tok(), { name: 'Haldi', quality: 'web', items })
      expect(start.status).toBe(201)
      expect(start.json).toMatchObject({ eventId: g.json.eventId, status: 'running', total: 1, albumsCreated: 1 })
      expect(queued).toHaveLength(1)
      expect((await api('/events/sa-drive/drive-imports', await tok())).json.items[0]).toMatchObject({ id: start.json.id, status: 'running' })

      // Another company cannot stop it, even knowing the project id and the import id.
      expectProblem(await call(`/v1/integrations/studioautopilot/events/sa-drive/drive-imports/${start.json.id}`, { method: 'DELETE', token: await mint({ purpose: 'api' }) }), 404)
      const stop = await call(`/v1/integrations/studioautopilot/events/sa-drive/drive-imports/${start.json.id}`, { method: 'DELETE', token: await tok() })
      expect(stop.json).toMatchObject({ status: 'cancelled', skipped: 1 })
    } finally {
      vi.unstubAllGlobals()
      for (const k of keys) bag[k] = saved[k]
    }
  })

  it('says Drive is not offered when the server has no Google keys', async () => {
    const r = await api('/studio', await mint({ purpose: 'api' }))
    expect(r.json.drive).toMatchObject({ available: false, connected: false })
  })
})

describe('telling Studio AutoPilot a gallery changed', () => {
  const api = (path: string, token: string, body?: unknown) => call(`/v1/integrations/studioautopilot${path}`, { token, body })

  it('sends a PIN change on the next tick, signed, and only for galleries Studio AutoPilot made', async () => {
    const { queuePartnerNotice, sendPartnerNotices } = await import('../src/services/partner-notify')
    const cid = uid()
    const made = await api('/events', await mint({ cid, purpose: 'api' }), { projectId: 'p-pin', name: 'PIN test', date: '2026-12-01T00:00:00.000Z' })
    await queuePartnerNotice(env, made.json.eventId, 'pin')
    await queuePartnerNotice(env, 'ev_riya', 'pin') // made in Frameline itself: nobody to tell

    const seen: { url: string; auth: string; body: Record<string, unknown> }[] = []
    const sent = await sendPartnerNotices(env, (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: String((init.headers as Record<string, string>).Authorization), body: JSON.parse(String(init.body)) })
      return new Response(null, { status: 204 })
    }) as typeof fetch)
    expect(sent).toBe(1)
    expect(seen[0].url).toBe('https://sa.example/webhooks/frameline')
    expect(seen[0].body).toEqual({ type: 'gallery.changed', companyId: cid, projectId: 'p-pin', reasons: ['pin'] })

    const [head, body, sig] = seen[0].auth.replace('Bearer ', '').split('.')
    const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const raw = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0))
    expect(await crypto.subtle.verify('HMAC', key, raw, enc.encode(`${head}.${body}`))).toBe(true)
    expect(JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))).toMatchObject({ iss: 'frameline', aud: 'studioautopilot', purpose: 'notice', cid })

    // Delivered once: nothing left to send.
    expect(await sendPartnerNotices(env, (async () => new Response(null, { status: 204 })) as unknown as typeof fetch)).toBe(0)
  })

  it('waits for uploads to go quiet, and retries when Studio AutoPilot does not answer', async () => {
    const { queuePartnerNotice, sendPartnerNotices } = await import('../src/services/partner-notify')
    const made = await api('/events', await mint({ purpose: 'api' }), { projectId: 'p-photos', name: 'Photos test', date: '2026-12-01T00:00:00.000Z' })
    await queuePartnerNotice(env, made.json.eventId, 'photos')
    const fail = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch
    expect(await sendPartnerNotices(env, fail)).toBe(0)
    const pending = await env.KV.get<{ due: number; reasons: string[] }>(`sa-out:${made.json.eventId}`, 'json')
    expect(pending!.reasons).toEqual(['photos'])
    expect(pending!.due).toBeGreaterThan(Math.floor(Date.now() / 1000) + 60)

    // A PIN change while photos wait goes now, carrying both reasons.
    await queuePartnerNotice(env, made.json.eventId, 'pin')
    expect(await sendPartnerNotices(env, fail)).toBe(0)
    const retry = await env.KV.get<{ attempts: number; reasons: string[] }>(`sa-out:${made.json.eventId}`, 'json')
    expect(retry).toMatchObject({ attempts: 1, reasons: ['photos', 'pin'] })
    await env.KV.delete(`sa-out:${made.json.eventId}`)
  })
})
