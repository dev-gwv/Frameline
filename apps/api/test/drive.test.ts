import { SELF, createExecutionContext, createMessageBatch, env, getQueueResult } from 'cloudflare:test'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, schema } from '../src/db/client'
import type { PhotoJob } from '../src/env'
import { seal, unseal } from '../src/lib/seal'
import { signMediaKey } from '../src/lib/media-sign'
import { DRIVE_SCOPE } from '../src/services/drive'
import { exifTime, notImportable } from '../src/services/drive-import'
import { handlePhotoQueue } from '../src/services/processor'
import { BASE, call, expectProblem, freshIp, tokenFor } from './helpers'

/** Google Drive (docs/GOOGLE_DRIVE_PLAN.md): connect, import picked files, keep originals in Drive. Google is faked. */

const db = () => getDb(env.DB)
const KEY = btoa('k'.repeat(32))
const STUDIO = 'st_northlight'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6])
const WEB = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9])
const saved: Record<string, unknown> = {}
const KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DRIVE_TOKEN_KEY', 'GOOGLE_PICKER_API_KEY', 'PHOTO_QUEUE'] as const
let queued: { body: PhotoJob; delaySeconds?: number }[] = []
let usage = { photosUsed: 0, photosLimit: 0 }
const bag = env as unknown as Record<string, unknown>

beforeAll(async () => {
  const [st] = await db().select().from(schema.studios).where(eq(schema.studios.id, STUDIO))
  usage = { photosUsed: st!.photosUsed, photosLimit: st!.photosLimit }
  for (const k of KEYS) saved[k] = bag[k]
  Object.assign(env, { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', DRIVE_TOKEN_KEY: KEY, GOOGLE_PICKER_API_KEY: 'picker-key' })
  // Jobs are run by hand (handlePhotoQueue) so nothing reaches the real Google from the background.
  ;bag.PHOTO_QUEUE = {
    send: async (body: PhotoJob, o?: { delaySeconds?: number }) => { queued.push({ body, delaySeconds: o?.delaySeconds }) },
    sendBatch: async (msgs: { body: PhotoJob }[]) => { queued.push(...msgs) },
  }
})
afterAll(() => { for (const k of KEYS) bag[k] = saved[k] })
// Storage carries over between tests in a file: each test starts with no Drive connected and the plan as seeded.
beforeEach(async () => {
  queued = []
  await env.KV.delete(`drive:at:${STUDIO}`)
  await db().delete(schema.driveConnections).where(eq(schema.driveConnections.studioId, STUDIO)).run()
  await db().update(schema.events).set({ originalsIn: 'frameline' }).where(eq(schema.events.studioId, STUDIO)).run()
  await db().update(schema.studios).set(usage).where(eq(schema.studios.id, STUDIO)).run()
})
afterEach(() => vi.unstubAllGlobals())

interface FakeFile { id: string; name: string; mimeType: string; size?: number; parents?: string[]; trashed?: boolean; bytes?: Uint8Array; thumbnailLink?: string }

/** A pretend Google: OAuth, Drive metadata, downloads, folders, resumable uploads and thumbnails. */
function fakeGoogle(o: { files?: FakeFile[]; refresh?: 'ok' | 'invalid_grant'; grantScope?: string } = {}) {
  const files = new Map((o.files ?? []).map((f) => [f.id, f]))
  let n = 0
  const calls: string[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push(`${method} ${url.origin}${url.pathname}`)
    const json = (v: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json', ...headers } })
    if (url.href.startsWith('https://oauth2.googleapis.com/token')) {
      const form = new URLSearchParams(String(init.body))
      if (form.get('grant_type') === 'authorization_code') return json({ access_token: 'at-code', refresh_token: 'rt-new', expires_in: 3600, scope: o.grantScope ?? `openid email ${DRIVE_SCOPE}` })
      if (o.refresh === 'invalid_grant') return json({ error: 'invalid_grant' }, 400)
      return json({ access_token: 'at-refresh', expires_in: 3600 })
    }
    if (url.href.startsWith('https://oauth2.googleapis.com/revoke')) return new Response('')
    if (url.href.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) return json({ sub: 'g-1', email: 'aarav@northlight.in' })
    if (url.hostname === 'lh3.googleusercontent.com') return new Response(WEB, { headers: { 'content-type': 'image/jpeg' } })
    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') return new Response(null, { status: 200, headers: { location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=up${++n}` } })
    if (url.pathname === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(String(init.body)) as { name: string; parents?: string[] }
      const id = `folder_${++n}_xxxxxxxx`
      files.set(id, { id, name: body.name, mimeType: 'application/vnd.google-apps.folder', parents: body.parents })
      return json({ id })
    }
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const parent = /'([^']+)' in parents/.exec(url.searchParams.get('q') ?? '')?.[1]
      return json({ files: [...files.values()].filter((f) => f.parents?.includes(parent!) && !f.trashed).map(({ bytes: _b, ...f }) => ({ ...f, size: f.size === undefined ? undefined : String(f.size) })) })
    }
    const m = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)
    if (m) {
      const f = files.get(decodeURIComponent(m[1]))
      if (!f) return json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, 404)
      if (url.searchParams.get('alt') === 'media') return new Response(f.bytes ?? JPEG, { headers: { 'content-type': f.mimeType, 'content-length': String((f.bytes ?? JPEG).byteLength) } })
      const { bytes: _b, ...meta } = f
      return json({ ...meta, size: f.size === undefined ? undefined : String(f.size), imageMediaMetadata: { width: 6000, height: 4000, time: '2026:10:20 18:30:05' } })
    }
    return new Response('unexpected ' + url.href, { status: 500 })
  })
  vi.stubGlobal('fetch', fn)
  return { fn, files, calls }
}

async function connectStudio(status: 'ok' | 'revoked' = 'ok') {
  const row = { studioId: STUDIO, googleSub: 'g-1', email: 'aarav@northlight.in', refreshTokenEnc: await seal(KEY, 'rt-stored'), scope: DRIVE_SCOPE, status, connectedBy: 'u1', connectedAt: new Date().toISOString() }
  await db().insert(schema.driveConnections).values(row).onConflictDoUpdate({ target: schema.driveConnections.studioId, set: row }).run()
}

async function runQueue(kind: PhotoJob['kind'] = 'drive-import') {
  const jobs = queued.filter((q) => q.body.kind === kind)
  queued = queued.filter((q) => q.body.kind !== kind)
  const batch = createMessageBatch<PhotoJob>('frameline-photos', jobs.map((j, i) => ({ id: `m${i}${Date.now()}`, timestamp: new Date(), attempts: 1, body: j.body })))
  const ctx = createExecutionContext()
  await handlePhotoQueue(batch, env as never)
  return getQueueResult(batch, ctx)
}

const anAlbum = async (eventId = 'ev_riya') => (await db().select().from(schema.albums).where(and(eq(schema.albums.eventId, eventId), eq(schema.albums.kind, 'album'))).limit(1))[0]!

describe('sealed tokens and small rules', () => {
  it('seals and opens a refresh token, and refuses a tampered one', async () => {
    const s = await seal(KEY, 'secret-refresh-token')
    expect(s).toMatch(/^v1\./)
    expect(s).not.toContain('secret')
    expect(await unseal(KEY, s)).toBe('secret-refresh-token')
    await expect(unseal(KEY, s.slice(0, -2) + 'AA')).rejects.toThrow()
  })

  it('imports photos only (no RAW, video or huge files), and reads EXIF time', () => {
    expect(notImportable({ mimeType: 'image/jpeg', size: 10 })).toBeNull()
    expect(notImportable({ mimeType: 'image/x-canon-cr3', size: 10 })).toMatch(/RAW/)
    expect(notImportable({ mimeType: 'video/mp4', size: 10 })).toMatch(/Videos/)
    expect(notImportable({ mimeType: 'image/jpeg', size: 300 * 1024 * 1024 })).toMatch(/200 MB/)
    expect(exifTime('2026:10:20 18:30:05')).toBe(new Date('2026-10-20T18:30:05').toISOString())
    expect(exifTime('nonsense')).toBeUndefined()
  })
})

describe('connecting Google Drive', () => {
  it('reports itself in /v1/meta and in GET /drive', async () => {
    const meta = await call('/v1/meta')
    expect(meta.json.features).toMatchObject({ drive: true, driveImport: true })
    const st = await call('/v1/drive', { token: await tokenFor('editor') })
    expect(st.json).toMatchObject({ available: true, picker: true, connected: false, defaultForNewEvents: false })
  })

  it('asks Google for drive.file only, offline, and only the owner may start it', async () => {
    expectProblem(await call('/v1/drive/connect', { method: 'POST', token: await tokenFor('editor') }), 403)
    const r = await call('/v1/drive/connect', { method: 'POST', token: await tokenFor('owner') })
    expect(r.status).toBe(200)
    const url = new URL(r.json.authorizationUrl)
    expect(url.searchParams.get('scope')).toBe(`openid email ${DRIVE_SCOPE}`)
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('scope')).not.toMatch(/drive\.readonly|auth\/drive(\s|$)/)
  })

  it('stores the connection with the refresh token sealed, then goes back to Settings', async () => {
    const r = await call('/v1/drive/connect', { method: 'POST', token: await tokenFor('owner') })
    const state = new URL(r.json.authorizationUrl).searchParams.get('state')!
    fakeGoogle()
    const back = await SELF.fetch(`${BASE}/v1/drive/callback?code=c&state=${state}`, { redirect: 'manual', headers: { 'cf-connecting-ip': freshIp() } })
    expect(back.status).toBe(302)
    expect(back.headers.get('location')).toMatch(/\/settings\/drive\?drive=connected$/)
    const [row] = await db().select().from(schema.driveConnections).where(eq(schema.driveConnections.studioId, STUDIO))
    expect(row).toMatchObject({ email: 'aarav@northlight.in', status: 'ok' })
    expect(row!.refreshTokenEnc).not.toContain('rt-new')
    expect(await unseal(KEY, row!.refreshTokenEnc)).toBe('rt-new')
    // The state is single-use.
    const again = await SELF.fetch(`${BASE}/v1/drive/callback?code=c&state=${state}`, { redirect: 'manual', headers: { 'cf-connecting-ip': freshIp() } })
    expect(again.headers.get('location')).toMatch(/drive_error=expired/)
  })

  it('connects nothing when Drive was unticked on Google’s page', async () => {
    const r = await call('/v1/drive/connect', { method: 'POST', token: await tokenFor('owner') })
    const state = new URL(r.json.authorizationUrl).searchParams.get('state')!
    fakeGoogle({ grantScope: 'openid email' })
    const back = await SELF.fetch(`${BASE}/v1/drive/callback?code=c&state=${state}`, { redirect: 'manual', headers: { 'cf-connecting-ip': freshIp() } })
    expect(back.headers.get('location')).toMatch(/drive_error=scope/)
    expect(await db().select().from(schema.driveConnections).where(eq(schema.driveConnections.studioId, STUDIO))).toHaveLength(0)
  })

  it('needs a connection for originals in Drive, and disconnecting puts events back on Frameline', async () => {
    expectProblem(await call('/v1/events/ev_riya/originals', { method: 'PUT', token: await tokenFor('owner'), body: { in: 'drive' } }), 409, 'drive_not_connected')
    await connectStudio()
    const on = await call('/v1/events/ev_riya/originals', { method: 'PUT', token: await tokenFor('owner'), body: { in: 'drive' } })
    expect(on.json.originalsIn).toBe('drive')
    fakeGoogle()
    expect((await call('/v1/drive', { method: 'DELETE', token: await tokenFor('owner') })).status).toBe(204)
    const ev = await call('/v1/events/ev_riya', { token: await tokenFor('owner') })
    expect(ev.json.originalsIn).toBe('frameline')
  })

  it('gives the Picker a token from the stored connection (editors), refreshing it', async () => {
    await connectStudio()
    fakeGoogle()
    const r = await call('/v1/drive/picker', { token: await tokenFor('editor') })
    expect(r.json).toMatchObject({ accessToken: 'at-refresh', apiKey: 'picker-key' })
    expectProblem(await call('/v1/drive/picker', { token: await tokenFor('uploader') }), 403)
  })
})

describe('importing from Google Drive', () => {
  /** A folder with two photos and a RAW; `tag` keeps each test's file ids apart (imports skip files already in the event). */
  const pickedFiles = (tag = 'a'): FakeFile[] => [
    { id: 'folderReception01', name: 'Reception', mimeType: 'application/vnd.google-apps.folder' },
    { id: `file${tag}Recep0001`, name: 'REC_0001.JPG', mimeType: 'image/jpeg', size: JPEG.byteLength, parents: ['folderReception01'], thumbnailLink: 'https://lh3.googleusercontent.com/abc=s220' },
    { id: `file${tag}Recep0002`, name: 'REC_0002.JPG', mimeType: 'image/jpeg', size: JPEG.byteLength, parents: ['folderReception01'] },
    { id: `file${tag}RecepRAW1`, name: 'REC_0003.CR3', mimeType: 'image/x-canon-cr3', size: 30_000_000, parents: ['folderReception01'] },
  ]

  it('lists what a picked folder holds, with the RAW file marked as not imported', async () => {
    await connectStudio()
    fakeGoogle({ files: pickedFiles() })
    const r = await call('/v1/drive/expand', { token: await tokenFor('editor'), body: { ids: ['folderReception01'] } })
    expect(r.status).toBe(200)
    expect(r.json.closedFolders).toEqual([])
    expect(r.json.items.map((i: { name: string; importable: boolean; folderPath: string }) => [i.name, i.importable, i.folderPath])).toEqual([
      ['REC_0001.JPG', true, 'Reception'], ['REC_0002.JPG', true, 'Reception'], ['REC_0003.CR3', false, 'Reception'],
    ])
  })

  it('says when Google won’t list a picked folder', async () => {
    await connectStudio()
    fakeGoogle({ files: [{ id: 'folderClosed0001', name: 'Haldi', mimeType: 'application/vnd.google-apps.folder' }] })
    const r = await call('/v1/drive/expand', { token: await tokenFor('editor'), body: { ids: ['folderClosed0001'] } })
    expect(r.json).toEqual({ items: [], closedFolders: [{ id: 'folderClosed0001', name: 'Haldi' }] })
  })

  it('copies picked photos into the event as real photos, once, and counts them on the plan', async () => {
    await connectStudio()
    fakeGoogle({ files: pickedFiles() })
    const before = (await db().select().from(schema.studios).where(eq(schema.studios.id, STUDIO)))[0]!.photosUsed
    const items = pickedFiles().filter((f) => f.mimeType !== 'application/vnd.google-apps.folder').map((f) => ({ fileId: f.id, name: f.name, size: f.size!, mimeType: f.mimeType, albumName: 'Reception (Drive)' }))
    const start = await call('/v1/events/ev_riya/drive-imports', { token: await tokenFor('editor'), body: { name: 'Reception', quality: 'web', watermark: false, items } })
    expect(start.status).toBe(201)
    expect(start.json).toMatchObject({ status: 'running', total: 3, skipped: 1, albumsCreated: 1 })

    await runQueue()
    const photos = await db().select().from(schema.photos).where(and(eq(schema.photos.eventId, 'ev_riya'), eq(schema.photos.source, 'drive')))
    expect(photos.map((p) => p.filename).sort()).toEqual(['REC_0001.JPG', 'REC_0002.JPG'])
    const first = photos.find((p) => p.filename === 'REC_0001.JPG')!
    expect(first).toMatchObject({ driveFileId: 'fileaRecep0001', storage: 'r2', webCopy: true, status: 'processing' })
    expect(first.capturedAt).toBe(new Date('2026-10-20T18:30:05').toISOString())
    expect(new Uint8Array(await (await env.MEDIA.get(first.r2Key!))!.arrayBuffer())).toEqual(JPEG)
    expect(await env.MEDIA.head(first.r2Key!.replace(/\/[^/]+$/, '/renditions/2048.jpg'))).not.toBeNull()
    expect(photos.find((p) => p.filename === 'REC_0002.JPG')!.webCopy).toBe(false) // no thumbnail from Drive
    expect((await db().select().from(schema.studios).where(eq(schema.studios.id, STUDIO)))[0]!.photosUsed).toBe(before + 2)
    expect(queued.filter((q) => q.body.kind === 'process-photo')).toHaveLength(2)

    const list = await call('/v1/events/ev_riya/drive-imports', { token: await tokenFor('editor') })
    expect(list.json.items[0]).toMatchObject({ status: 'done', done: 2, skipped: 1, failed: 0 })

    // The same files again: nothing new comes in.
    const again = await call('/v1/events/ev_riya/drive-imports', { token: await tokenFor('editor'), body: { name: 'Again', items } })
    expect(again.json).toMatchObject({ status: 'done', total: 3, skipped: 3 })
  })

  it('refuses an import the plan has no room for', async () => {
    await connectStudio()
    await db().update(schema.studios).set({ photosUsed: 1_000_000_000, photosLimit: 1_000_000_000 }).where(eq(schema.studios.id, STUDIO)).run()
    const items = [{ fileId: 'filebRecep0001', name: 'a.jpg', size: 10, mimeType: 'image/jpeg', albumName: 'X' }]
    expectProblem(await call('/v1/events/ev_riya/drive-imports', { token: await tokenFor('editor'), body: { name: 'X', items } }), 402, 'quota_exceeded')
  })

  it('stops the import and asks for a reconnect when Google refuses the stored token', async () => {
    await connectStudio()
    fakeGoogle({ files: pickedFiles('c'), refresh: 'invalid_grant' })
    const album = await anAlbum()
    const items = [{ fileId: 'filecRecep0001', name: 'REC_0001.JPG', size: JPEG.byteLength, mimeType: 'image/jpeg', albumId: album.id }]
    // Starting works from the stored connection; the copy then finds the token dead.
    const start = await call('/v1/events/ev_riya/drive-imports', { token: await tokenFor('editor'), body: { name: 'Dead token', items } })
    expect(start.status).toBe(201)
    const res = await runQueue()
    expect(res.explicitAcks).toHaveLength(1)
    const [imp] = await db().select().from(schema.driveImports).where(eq(schema.driveImports.id, start.json.id))
    expect(imp).toMatchObject({ status: 'failed', skipped: 1 })
    expect((await call('/v1/drive', { token: await tokenFor('owner') })).json).toMatchObject({ connected: true, status: 'revoked' })
  })

  it('a stopped import skips what hasn’t come in yet', async () => {
    await connectStudio()
    fakeGoogle({ files: pickedFiles('d') })
    const items = [{ fileId: 'filedRecep0002', name: 'REC_0002.JPG', size: JPEG.byteLength, mimeType: 'image/jpeg', albumName: 'Stopped' }]
    const start = await call('/v1/events/ev_riya/drive-imports', { token: await tokenFor('editor'), body: { name: 'Stop me', items } })
    const stop = await call(`/v1/drive-imports/${start.json.id}`, { method: 'DELETE', token: await tokenFor('editor') })
    expect(stop.json).toMatchObject({ status: 'cancelled', skipped: 1 })
    await runQueue()
    expect(await db().select().from(schema.photos).where(eq(schema.photos.driveFileId, 'filedRecep0002'))).toHaveLength(0)
  })
})

describe('originals kept in the studio’s Drive', () => {
  it('uploads straight to Drive, keeps the web copy in R2, and serves the full-size file from Drive', async () => {
    await connectStudio()
    const g = fakeGoogle()
    await call('/v1/events/ev_riya/originals', { method: 'PUT', token: await tokenFor('owner'), body: { in: 'drive' } })
    const album = await anAlbum()
    const owner = await tokenFor('owner')
    const start = await call('/v1/events/ev_riya/uploads', { token: owner, body: { albumId: album.id, quality: 'original', files: [{ filename: 'DSC_9001.JPG', size: JPEG.byteLength, contentType: 'image/jpeg' }] } })
    expect(start.status).toBe(201)
    expect(start.json.mode).toBe('drive')
    const file = start.json.files[0]
    expect(file.driveUploadUrl).toMatch(/upload_id=/)
    expect(file.parts).toEqual([])
    // Folders were made: Frameline → event → album.
    const [ev] = await db().select().from(schema.events).where(eq(schema.events.id, 'ev_riya'))
    const [al] = await db().select().from(schema.albums).where(eq(schema.albums.id, album.id))
    expect(g.files.get(ev!.driveFolderId!)!.name).toMatch(/\(\d{4}-\d{2}-\d{2}\)$/)
    expect(g.files.get(al!.driveFolderId!)!.parents).toEqual([ev!.driveFolderId])

    // The browser's PUT made this file in the album's folder.
    g.files.set('driveOriginal001', { id: 'driveOriginal001', name: 'DSC_9001.JPG', mimeType: 'image/jpeg', size: JPEG.byteLength, parents: [al!.driveFolderId!], bytes: JPEG })
    const done = await call(`/v1/events/ev_riya/uploads/${start.json.uploadId}/complete`, { token: owner, body: { files: [{ photoId: file.photoId, driveFileId: 'driveOriginal001' }] } })
    expect(done.status).toBe(201)
    const [photo] = await db().select().from(schema.photos).where(eq(schema.photos.id, file.photoId))
    expect(photo).toMatchObject({ storage: 'drive', driveFileId: 'driveOriginal001', r2Key: file.key })
    expect(await env.MEDIA.head(file.key)).toBeNull() // the original never entered R2

    // Processing waits for the web copy, then works from it.
    const job = queued.find((q) => q.body.kind === 'process-photo')!.body
    expect(job).toMatchObject({ webOnly: true, key: file.key.replace(/\/[^/]+$/, '/renditions/2048.jpg') })
    const web = await SELF.fetch(`${BASE}/v1/photos/${file.photoId}/web`, { method: 'PUT', body: WEB, headers: { authorization: `Bearer ${owner}`, 'content-type': 'image/jpeg', 'cf-connecting-ip': freshIp() } })
    expect(web.status).toBe(204)
    await runQueue('process-photo')
    const [ready] = await db().select().from(schema.photos).where(eq(schema.photos.id, file.photoId))
    expect(ready!.status).toBe('ready')

    // The full-size address streams from Drive; with Drive gone it falls back to the web copy.
    const original = `/v1/media/${file.key.split('/').map(encodeURIComponent).join('/')}?${await signMediaKey(env.JWT_SECRET, file.key)}`
    const res = await SELF.fetch(`${BASE}${original}`, { headers: { 'cf-connecting-ip': freshIp() } })
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG)
    g.files.delete('driveOriginal001')
    const fallback = await SELF.fetch(`${BASE}${original}`, { headers: { 'cf-connecting-ip': freshIp() } })
    expect(fallback.status).toBe(200)
    expect(fallback.headers.get('x-frameline-fallback')).toBe('web-copy')
    expect(new Uint8Array(await fallback.arrayBuffer())).toEqual(WEB)
  })

  it('refuses a completion whose Drive file isn’t in the album’s folder', async () => {
    await connectStudio()
    const g = fakeGoogle()
    await call('/v1/events/ev_riya/originals', { method: 'PUT', token: await tokenFor('owner'), body: { in: 'drive' } })
    const album = await anAlbum()
    const owner = await tokenFor('owner')
    const start = await call('/v1/events/ev_riya/uploads', { token: owner, body: { albumId: album.id, files: [{ filename: 'X.JPG', size: 10, contentType: 'image/jpeg' }] } })
    g.files.set('someOtherFile01', { id: 'someOtherFile01', name: 'X.JPG', mimeType: 'image/jpeg', size: 10, parents: ['elsewhere'] })
    const done = await call(`/v1/events/ev_riya/uploads/${start.json.uploadId}/complete`, { token: owner, body: { files: [{ photoId: start.json.files[0].photoId, driveFileId: 'someOtherFile01' }] } })
    expect(done.json.items).toEqual([])
  })

  it('new events keep originals in Drive when the studio says so', async () => {
    await connectStudio()
    fakeGoogle()
    await call('/v1/drive', { method: 'PATCH', token: await tokenFor('owner'), body: { defaultForNewEvents: true } })
    const ev = await call('/v1/events', { token: await tokenFor('owner'), body: { name: 'Drive wedding', date: '2026-12-01', city: 'Pune', type: 'wedding', preset: 'private-family' } })
    expect(ev.status).toBe(201)
    expect(ev.json.originalsIn).toBe('drive')
    // The New event form can say otherwise for one event.
    const own = await call('/v1/events', { token: await tokenFor('owner'), body: { name: 'Kept here', date: '2026-12-02', city: 'Pune', type: 'wedding', preset: 'private-family', originalsIn: 'frameline' } })
    expect(own.json.originalsIn).toBe('frameline')
  })

  it('a new event can ask for Drive only while Drive is connected', async () => {
    const body = { name: 'Drive party', date: '2026-12-03', city: 'Goa', type: 'wedding', preset: 'private-family', originalsIn: 'drive' }
    const refused = await call('/v1/events', { token: await tokenFor('owner'), body })
    expect(refused.status).toBe(409)
    expect(refused.json.code).toBe('drive_not_connected')
    await connectStudio()
    fakeGoogle()
    const ok = await call('/v1/events', { token: await tokenFor('owner'), body })
    expect(ok.status).toBe(201)
    expect(ok.json.originalsIn).toBe('drive')
  })
})
