import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { BuildZipJob, Env, PhotoJob, ProcessPhotoJob } from '../env'
import { getMailer } from './mailer'
import { getDb, schema } from '../db/client'
import { newId } from '../lib/ids'
import { chunk, photoFilter } from '../routes/photos'
import { logDownloadsBatch } from './downloads'
import { notifyWaitingGuests } from './notify'
import { publishTopics } from './realtime'
import { vectorIndex } from './vectors'

/**
 * Image processing contract. The real implementation runs in a Cloudflare Container
 * (sharp for renditions + InsightFace ONNX for face detection/512-d embeddings), which:
 *   1. reads the original from R2 (`job.key`),
 *   2. writes renditions next to it (…/thumb.webp, …/preview.webp, …/2k.jpg),
 *   3. returns dimensions, EXIF and one embedding per detected face.
 *
 * TODO(processor): bind the container (`containers` + a Durable Object class in wrangler.jsonc) and add a
 * `ContainerProcessor` that calls it via `env.PROCESSOR.get(id).fetch(...)`. Until then `HttpProcessor`
 * talks to any HTTP deployment of the same service (PROCESSOR_URL), and `SimulatedProcessor` is used in dev.
 */
export interface ProcessResult {
  width: number
  height: number
  sizeBytes?: number
  capturedAt?: string
  exif?: { camera?: string; lens?: string; exposure?: string }
  /** Rendition URL to show in galleries; falls back to the original's media URL. */
  previewUrl?: string
  faces: { box: [number, number, number, number]; embedding?: number[]; personId?: string }[]
}

export interface PhotoProcessor {
  readonly name: string
  process(job: ProcessPhotoJob): Promise<ProcessResult>
}

export class HttpProcessor implements PhotoProcessor {
  readonly name = 'http'
  constructor(private url: string, private token?: string, private bucket?: string) {}
  async process(job: ProcessPhotoJob): Promise<ProcessResult> {
    const res = await fetch(`${this.url.replace(/\/$/, '')}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: JSON.stringify({ ...job, bucket: this.bucket }),
    })
    if (!res.ok) throw new Error(`processor responded ${res.status}`)
    return (await res.json()) as ProcessResult
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
  return env.PROCESSOR_URL ? new HttpProcessor(env.PROCESSOR_URL, env.PROCESSOR_TOKEN, env.R2_BUCKET_NAME) : new SimulatedProcessor(env)
}

/** Applies a processing result: marks the photo ready, stores faces (D1 + Vectorize namespace = event id). */
export async function applyResult(env: Env, job: ProcessPhotoJob, result: ProcessResult): Promise<boolean> {
  const db = getDb(env.DB)
  const [photo] = await db.select().from(schema.photos).where(eq(schema.photos.id, job.photoId)).limit(1)
  if (!photo) return false // deleted while processing

  const faceRows = result.faces.map((f) => ({ id: newId('fc'), photoId: photo.id, eventId: photo.eventId, personId: f.personId ?? null, box: f.box, vectorId: null as string | null }))
  const vectors: VectorizeVector[] = []
  result.faces.forEach((f, i) => {
    if (f.embedding?.length) {
      faceRows[i].vectorId = faceRows[i].id
      vectors.push({ id: faceRows[i].id, values: f.embedding, namespace: photo.eventId, metadata: { photoId: photo.id, eventId: photo.eventId } })
    }
  })
  const index = vectorIndex(env)
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
      url: result.previewUrl ?? photo.url,
      capturedAt: result.capturedAt ?? photo.capturedAt,
      exif: { ...photo.exif, ...result.exif, width: result.width, height: result.height, sizeBytes: result.sizeBytes ?? photo.exif.sizeBytes },
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
  for (const msg of batch.messages) {
    const job = msg.body
    try {
      if (job.kind === 'build-zip') { await buildZip(env, job); msg.ack(); continue }
      if (job.kind !== 'process-photo') { msg.ack(); continue }
      const result = await processor.process(job)
      if (await applyResult(env, job, result)) {
        if (!touched.has(job.studioId)) touched.set(job.studioId, new Set())
        touched.get(job.studioId)!.add(job.eventId)
      }
      msg.ack()
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'queue job failed', job, attempt: msg.attempts, error: String(e) }))
      msg.retry({ delaySeconds: Math.min(300, 2 ** msg.attempts * 5) })
    }
  }
  const db = getDb(env.DB)
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
 * ZIP export. TODO(processor): stream a real ZIP into R2 from the Container. Until then the "ZIP" is a
 * manifest of download links served by GET /v1/public/zips/:id, and the email points there.
 */
export async function buildZip(env: Env, job: BuildZipJob): Promise<void> {
  const db = getDb(env.DB)
  const [z] = await db.select().from(schema.zipRequests).where(eq(schema.zipRequests.id, job.zipId)).limit(1)
  if (!z || z.status === 'ready') return
  const url = `${(env.API_PUBLIC_URL ?? '').replace(/\/$/, '')}/v1/public/zips/${z.id}`
  await db.update(schema.zipRequests).set({ status: 'ready', readyAt: new Date().toISOString(), url }).where(eq(schema.zipRequests.id, z.id)).run()
  // One download_events row per photo the ZIP actually covers (an explicit selection, or everything the request
  // matched at build time — an album, or the whole event's regular albums).
  const p = schema.photos
  const photos = z.photoIds?.length
    ? (await Promise.all(chunk(z.photoIds).map((part) => db.select({ id: p.id, filename: p.filename }).from(p).where(and(inArray(p.id, part), isNull(p.deletedAt)))))).flat()
    : await db.select({ id: p.id, filename: p.filename }).from(p).where(photoFilter(z.eventId, { albumId: z.albumId ?? undefined }))
  for (const part of chunk(photos)) {
    await logDownloadsBatch(db, part.map((ph) => ({ studioId: z.studioId, eventId: z.eventId, photoId: ph.id, filename: ph.filename, guestId: z.guestId, kind: 'zip' as const })))
  }
  const [ev] = await db.select({ name: schema.events.name }).from(schema.events).where(eq(schema.events.id, z.eventId)).limit(1)
  await getMailer(env).send({
    to: z.email,
    subject: `Your photos from ${ev?.name ?? 'Frameline'} are ready`,
    text: `${z.photoCount} photos are ready to download: ${url}

The link works for 7 days.`,
  }).catch((e) => console.error(JSON.stringify({ level: 'error', msg: 'zip email failed', error: String(e) })))
  await publishTopics(env, job.studioId, ['misc']).catch(() => undefined)
}

