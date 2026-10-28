import { and, eq, sql } from 'drizzle-orm'
import type { BuildZipJob, Env, PhotoJob, ProcessPhotoJob } from '../env'
import { getMailer } from './mailer'
import { getDb, schema } from '../db/client'
import { newId } from '../lib/ids'
import { chunk } from '../routes/photos'
import { logDownloadsBatch } from './downloads'
import { zipFileSize, zipParts, zipPhotos } from './zips'
import { notifyWaitingGuests } from './notify'
import { publishTopics } from './realtime'
import { vectorIndex } from './vectors'
import { assignPeople, recountPeople, type ClusterMemory } from './clustering'
import { DriveRevoked } from './drive'
import { failImport, runDriveImport } from './drive-import'

/**
 * Image processing contract. The real implementation is apps/processor (Node + sharp + YuNet/SFace ONNX,
 * 128-d embeddings), reached over HTTP at PROCESSOR_URL. Per photo it:
 *   1. reads the original from R2 (`job.key`) and turns it upright from its EXIF orientation,
 *   2. writes download renditions next to it (…/renditions/2048.jpg and 3072.jpg, no watermark),
 *   3. returns dimensions and one embedding per detected face,
 *   4. answers 422 for a file it can't decode, which marks the photo `failed` here.
 * Without PROCESSOR_URL, `SimulatedProcessor` marks photos ready with no faces or renditions (warned outside dev).
 */
export interface ProcessResult {
  width: number
  height: number
  sizeBytes?: number
  capturedAt?: string
  exif?: { camera?: string; lens?: string; exposure?: string }
  /** Rendition URL to show in galleries; falls back to the original's media URL. */
  previewUrl?: string
  /** Set here (not by the processor) when the processor wrote the renditions, so galleries show the 2048 px copy. */
  renditions?: boolean
  faces: { box: [number, number, number, number]; embedding?: number[]; personId?: string }[]
}

export interface PhotoProcessor {
  readonly name: string
  process(job: ProcessPhotoJob): Promise<ProcessResult>
}

/** The processor can never handle this file (not an image it can read, no file): retrying won't help. */
export class ProcessingRejected extends Error {}

/** Attempts before a photo is given up on and marked `failed` (so it never sits in `processing` forever). */
export const MAX_PROCESS_ATTEMPTS = 5
/** Waits (20 s each) for a Drive photo's web copy before it is processed without one. */
const WEB_COPY_WAITS = 6

const PROCESS_TIMEOUT_MS = 120_000

/** The processor is at capacity: try the photo again later, without counting it as a failed attempt. */
export class ProcessorBusy extends Error {
  constructor(readonly retryAfterSec: number) { super('processor busy') }
}

export class HttpProcessor implements PhotoProcessor {
  readonly name = 'http'
  constructor(private url: string, private token?: string, private bucket?: string) {}
  async process(job: ProcessPhotoJob): Promise<ProcessResult> {
    const res = await fetch(`${this.url.replace(/\/$/, '')}/process`, {
      method: 'POST',
      // A 24 MP photo takes seconds; a processor that hangs must not hold the queue consumer for 15 minutes.
      signal: AbortSignal.timeout(PROCESS_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      // A web copy (original in Drive) is only scanned for faces: no renditions are made from it.
      body: JSON.stringify({ ...job, ...(job.webOnly ? { reindex: true } : {}), bucket: this.bucket }),
    })
    // 422 = the file itself is the problem (HEIC it can't decode, a video, a corrupt upload, no key).
    if (res.status === 422) throw new ProcessingRejected(`processor rejected the file: ${await res.text().catch(() => '')}`.slice(0, 500))
    // 503 `busy`: at capacity (apps/processor/src/limiter.ts), not the photo's fault, so it goes back in the queue.
    // Any other 503 (the proxy in front of a processor that is down) is an outage and counts as an attempt.
    if (res.status === 503) {
      const body = (await res.clone().json().catch(() => null)) as { error?: string } | null
      if (body?.error === 'busy') throw new ProcessorBusy(Number(res.headers.get('retry-after')) || 30)
    }
    if (!res.ok) throw new Error(`processor responded ${res.status}`)
    // A full run (not a face re-index) writes …/renditions/2048.jpg and 3072.jpg next to the original.
    return { ...((await res.json()) as ProcessResult), ...(job.reindex || job.webOnly ? {} : { renditions: true }) }
  }
}

/** Dev stand-in: confirms the original exists, keeps client-reported dimensions and any faces already known. */
export class SimulatedProcessor implements PhotoProcessor {
  readonly name = 'simulated'
  constructor(private env: Env) {}
  async process(job: ProcessPhotoJob): Promise<ProcessResult> {
    const head = job.key ? await this.env.MEDIA.head(job.key) : null
    const [photo] = await getDb(this.env.DB).select({ exif: schema.photos.exif, faces: schema.photos.faces }).from(schema.photos).where(eq(schema.photos.id, job.photoId)).limit(1)
    return {
      width: photo?.exif.width || 6000, height: photo?.exif.height || 4000, sizeBytes: head?.size ?? photo?.exif.sizeBytes,
      faces: (photo?.faces ?? []).map((f) => ({ box: f.box, personId: f.personId })),
    }
  }
}

export function getProcessor(env: Env): PhotoProcessor {
  if (env.PROCESSOR_URL) return new HttpProcessor(env.PROCESSOR_URL, env.PROCESSOR_TOKEN, env.R2_BUCKET_NAME)
  // Without a processor photos still go live (galleries keep working), but nothing finds faces or writes
  // download renditions. Say so loudly outside development; GET /health reports `processor: simulated` too.
  if (env.ENVIRONMENT !== 'development' && env.ENVIRONMENT !== 'test') {
    console.warn(JSON.stringify({ level: 'warn', msg: 'processor_not_configured', detail: 'PROCESSOR_URL is not set: photos are marked ready without face finding or renditions' }))
  }
  return new SimulatedProcessor(env)
}

/** Gives up on a photo: `failed` instead of `processing` forever. Studios see it and can delete or re-upload. */
async function markFailed(env: Env, job: ProcessPhotoJob, error: string) {
  await getDb(env.DB).update(schema.photos).set({ status: 'failed' })
    .where(and(eq(schema.photos.id, job.photoId), eq(schema.photos.status, 'processing'))).run()
  console.error(JSON.stringify({ level: 'error', msg: 'photo_failed', photoId: job.photoId, eventId: job.eventId, error }))
}

/** Applies a processing result: marks the photo ready, stores faces (D1 + Vectorize namespace = event id). */
export async function applyResult(env: Env, job: ProcessPhotoJob, result: ProcessResult, memory: ClusterMemory = new Map()): Promise<boolean> {
  const db = getDb(env.DB)
  const [photo] = await db.select().from(schema.photos).where(eq(schema.photos.id, job.photoId)).limit(1)
  if (!photo) return false // deleted while processing

  const faceRows = result.faces.map((f) => ({ id: newId('fc'), photoId: photo.id, eventId: photo.eventId, personId: f.personId ?? null, box: f.box, vectorId: null as string | null }))
  // Faces with an embedding and no person yet are clustered into the event's people (services/clustering.ts).
  const index = vectorIndex(env)
  const toCluster = result.faces.map((f, i) => ({ f, i })).filter(({ f }) => !f.personId && f.embedding?.length)
  if (index && toCluster.length) {
    const ids = await assignPeople(env, index, photo.eventId, toCluster.map(({ f }) => ({ embedding: f.embedding! })), memory)
    toCluster.forEach(({ i }, k) => { faceRows[i].personId = ids[k] })
  }
  const vectors: VectorizeVector[] = []
  result.faces.forEach((f, i) => {
    if (f.embedding?.length) {
      faceRows[i].vectorId = faceRows[i].id
      vectors.push({ id: faceRows[i].id, values: f.embedding, namespace: photo.eventId, metadata: { photoId: photo.id, eventId: photo.eventId } })
    }
  })
  // Re-processing (retries, re-index) replaces the photo's faces.
  const old = await db.select({ v: schema.faces.vectorId }).from(schema.faces).where(eq(schema.faces.photoId, photo.id))
  const oldVectors = old.map((o) => o.v).filter((v): v is string => !!v)
  if (index && oldVectors.length) await index.deleteByIds(oldVectors).catch(() => undefined)
  if (vectors.length && index) await index.upsert(vectors)

  await db.batch([
    db.delete(schema.faces).where(eq(schema.faces.photoId, photo.id)),
    db.update(schema.photos).set({
      status: 'ready',
      facesIndexedAt: new Date().toISOString(),
      url: job.webOnly ? photo.url : result.previewUrl ?? photo.url,
      ...(result.renditions ? { webCopy: true } : {}),
      capturedAt: result.capturedAt ?? photo.capturedAt,
      // From a web copy (original in Drive) the size and dimensions are the web copy's: keep the original's.
      exif: job.webOnly
        ? { ...photo.exif, ...result.exif, width: photo.exif.width || result.width, height: photo.exif.height || result.height, sizeBytes: photo.exif.sizeBytes }
        : { ...photo.exif, ...result.exif, width: result.width, height: result.height, sizeBytes: result.sizeBytes ?? photo.exif.sizeBytes },
      faces: faceRows.filter((f) => f.personId).map((f) => ({ personId: f.personId!, box: f.box })),
    }).where(eq(schema.photos.id, photo.id)),
    ...faceRows.map((f) => db.insert(schema.faces).values(f)),
  ])
  return true
}

/** Queue consumer: process each photo, retry with backoff on failure, then flip finished events to live. */
export async function handlePhotoQueue(batch: MessageBatch<PhotoJob>, env: Env): Promise<void> {
  const processor = getProcessor(env)
  const touched = new Map<string, Set<string>>() // studioId → eventIds
  const memory: ClusterMemory = new Map()
  for (const msg of batch.messages) {
    const job = msg.body
    try {
      if (job.kind === 'build-zip') { await buildZip(env, job); msg.ack(); continue }
      if (job.kind === 'drive-import') {
        try { await runDriveImport(env, job) } catch (e) {
          if (e instanceof DriveRevoked) { await failImport(env, job.importId, 'Google Drive was disconnected'); msg.ack(); continue }
          throw e
        }
        msg.ack()
        continue
      }
      if (job.kind !== 'process-photo') { msg.ack(); continue }
      // Original in Drive: work from the web copy the studio's browser sends just after the upload. Wait for it a
      // little (fresh messages, like a busy processor), then go ahead without it.
      if (job.webOnly && job.key && !(await env.MEDIA.head(job.key)) && (job.webWaits ?? 0) < WEB_COPY_WAITS) {
        await env.PHOTO_QUEUE.send({ ...job, webWaits: (job.webWaits ?? 0) + 1 }, { delaySeconds: 20 })
        msg.ack()
        continue
      }
      // Photos registered by URL have no file in R2 for the processor to read; nor has a Drive photo whose web copy
      // never came (it goes live without faces rather than failing).
      const readable = !!job.key && (!job.webOnly || !!(await env.MEDIA.head(job.key)))
      const result = await (readable ? processor : new SimulatedProcessor(env)).process(job)
      if (await applyResult(env, job, result, memory)) {
        if (!touched.has(job.studioId)) touched.set(job.studioId, new Set())
        touched.get(job.studioId)!.add(job.eventId)
      }
      msg.ack()
    } catch (e) {
      if (e instanceof ProcessorBusy && job.kind === 'process-photo') {
        // Re-queued as a fresh message so a busy processor never uses up the photo's retries (max_retries).
        await env.PHOTO_QUEUE.send(job, { delaySeconds: Math.min(300, Math.max(10, e.retryAfterSec)) })
        msg.ack()
        continue
      }
      console.error(JSON.stringify({ level: 'error', msg: 'queue job failed', job, attempt: msg.attempts, error: String(e) }))
      if (job.kind === 'drive-import' && msg.attempts >= MAX_PROCESS_ATTEMPTS) {
        await failImport(env, job.importId, 'Google Drive kept failing. Try the import again later.').catch(() => undefined)
        msg.ack()
        continue
      }
      if (job.kind === 'process-photo' && (e instanceof ProcessingRejected || msg.attempts >= MAX_PROCESS_ATTEMPTS)) {
        await markFailed(env, job, String(e)).catch(() => undefined)
        if (!touched.has(job.studioId)) touched.set(job.studioId, new Set())
        touched.get(job.studioId)!.add(job.eventId)
        msg.ack()
        continue
      }
      msg.retry({ delaySeconds: Math.min(300, 2 ** msg.attempts * 5) })
    }
  }
  const db = getDb(env.DB)
  // People's photo counts, for the events where faces were clustered in this batch.
  await recountPeople(env, [...memory.keys()]).catch((e) => console.error(JSON.stringify({ level: 'error', msg: 'people recount failed', error: String(e) })))
  for (const [studioId, eventIds] of touched) {
    for (const eventId of eventIds) {
      await db.run(sql`UPDATE events SET status = 'live' WHERE id = ${eventId} AND status = 'uploading'
        AND NOT EXISTS (SELECT 1 FROM photos WHERE event_id = ${eventId} AND status = 'processing')`)
    }
    await publishTopics(env, studioId, ['photos', 'events']).catch(() => undefined)
    // Guests who asked to be told when the first photos arrive.
    await notifyWaitingGuests(env, [...eventIds]).catch((e) => console.error(JSON.stringify({ level: 'error', msg: 'notify sweep failed', error: String(e) })))
  }
}

/**
 * ZIP export: marks the request ready and emails the link. The ZIP itself is streamed on demand by
 * GET /v1/public/zips/:id/download (lib/zip.ts), so nothing large is built or stored ahead of time.
 */
export async function buildZip(env: Env, job: BuildZipJob): Promise<void> {
  const db = getDb(env.DB)
  const [z] = await db.select().from(schema.zipRequests).where(eq(schema.zipRequests.id, job.zipId)).limit(1)
  if (!z || z.status === 'ready') return
  const url = `${(env.API_PUBLIC_URL ?? '').replace(/\/$/, '')}/v1/public/zips/${z.id}/download`
  await db.update(schema.zipRequests).set({ status: 'ready', readyAt: new Date().toISOString(), url }).where(eq(schema.zipRequests.id, z.id)).run()
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, z.eventId)).limit(1)
  const photos = await zipPhotos(db, z)
  // One download_events row per photo the ZIP covers.
  for (const part of chunk(photos)) {
    await logDownloadsBatch(db, part.map((ph) => ({ studioId: z.studioId, eventId: z.eventId, photoId: ph.id, filename: ph.filename, guestId: z.guestId, kind: 'zip' as const })))
  }
  // A big request comes in parts (services/zips.ts); the email links each one.
  const parts = ev ? zipParts(photos, (r) => zipFileSize(z, ev, r)) : []
  const links = parts.length > 1
    ? `They come in ${parts.length} ZIP files. Download each one:\n\n${parts.map((p, i) => `Part ${i + 1} (${p.length} photos): ${url}?part=${i + 1}`).join('\n')}`
    : `Download: ${url}`
  await getMailer(env).send({
    to: z.email,
    subject: `Your photos from ${ev?.name ?? 'Frameline'} are ready`,
    text: `${photos.length} photos are ready to download.\n\n${links}\n\nThe links work for 7 days.`,
  }).catch((e) => console.error(JSON.stringify({ level: 'error', msg: 'zip email failed', error: String(e) })))
  await publishTopics(env, job.studioId, ['misc']).catch(() => undefined)
}

