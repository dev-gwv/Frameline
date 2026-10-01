#!/usr/bin/env node
// Dev smoke test: detect + embed faces in a real photo, print a same-face/different-face sanity check, and
// write an annotated copy so you can eyeball the boxes. Not part of the test suite — run by hand after
// `pnpm models:download`: `pnpm test:pipeline [path-to-a-photo-with-at-least-2-faces]`.
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { cosineSimilarity, SFACE_SAME_PERSON_COSINE_THRESHOLD } from '@frameline/faces'
import { loadModels, detectAndEmbedFile } from '../src/faces.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TMP = join(ROOT, '.tmp')
const DEMO_IMAGE_URL = 'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/example_outputs/largest_selfie.jpg'

async function ensureDemoImage() {
  const path = join(TMP, 'demo.jpg')
  await mkdir(TMP, { recursive: true })
  try { await sharp(path).metadata(); return path } catch { /* doesn't exist yet */ }
  console.log('No demo image found — downloading opencv_zoo\'s own YuNet test photo...')
  const res = await fetch(DEMO_IMAGE_URL)
  if (!res.ok) throw new Error(`demo image download failed: ${res.status}`)
  await writeFile(path, Buffer.from(await res.arrayBuffer()))
  return path
}

async function main() {
  const imagePath = process.argv[2] ?? await ensureDemoImage()
  console.log('Loading models...')
  await loadModels(join(ROOT, 'models'))

  console.log(`Processing ${imagePath}...`)
  const t0 = Date.now()
  const result = await detectAndEmbedFile(imagePath)
  console.log(`Detected ${result.faces.length} face(s) in ${Date.now() - t0}ms (image ${result.width}x${result.height})`)

  if (result.faces.length >= 2) {
    const [a, b] = result.faces
    const sim = cosineSimilarity(a.embedding, b.embedding)
    console.log(`\nFirst two faces' cosine similarity: ${sim.toFixed(4)} (same-person cutoff is ${SFACE_SAME_PERSON_COSINE_THRESHOLD})`)
    console.log(sim < SFACE_SAME_PERSON_COSINE_THRESHOLD ? '→ correctly read as different people' : '→ read as the same person (only meaningful if they actually are)')
  }

  await mkdir(TMP, { recursive: true })
  const svg = `<svg width="${result.width}" height="${result.height}" xmlns="http://www.w3.org/2000/svg">${result.faces.map((f) => {
    const [x1, y1, x2, y2] = f.box
    return `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="none" stroke="lime" stroke-width="2"/>`
  }).join('')}</svg>`
  const outPath = join(TMP, 'annotated.jpg')
  await sharp(imagePath).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 85 }).toFile(outPath)
  console.log(`\nWrote ${outPath} — open it to check the boxes land on real faces.`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
