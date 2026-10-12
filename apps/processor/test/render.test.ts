import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { renderDownload } from '../src/render.ts'

const photo = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#203040' } }).jpeg().toBuffer()

test('resizes to the long edge and applies the studio rotation', async () => {
  const out = await renderDownload(await photo(4000, 3000), { size: 2048, rotation: 90 })
  const meta = await sharp(out).metadata()
  assert.equal(meta.format, 'jpeg')
  assert.equal(meta.width, 1536)
  assert.equal(meta.height, 2048)
})

test('burns the watermark into the pixels', async () => {
  const src = await photo(1200, 800)
  const plain = await sharp(await renderDownload(src, { size: 2048 })).stats()
  const marked = await sharp(await renderDownload(src, { size: 2048, watermark: { text: 'Northlight Studio', subtitle: 'Mumbai', position: 'br', size: 'bold', opacity: 90 } })).stats()
  // White text on a dark photo raises the brightest pixels well above the plain render.
  assert.ok(marked.channels[0].max > plain.channels[0].max + 80, `max ${marked.channels[0].max} vs ${plain.channels[0].max}`)
})

test('never enlarges a small photo', async () => {
  const meta = await sharp(await renderDownload(await photo(800, 600), { size: 3072 })).metadata()
  assert.equal(meta.width, 800)
})
