import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { readExif } from '../src/exif.ts'

const jpegWith = (exif: Record<string, Record<string, string>>) =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } }).jpeg().withExif(exif).toBuffer()

test('reads camera, lens and capture time from a real JPEG', async () => {
  const buf = await jpegWith({
    IFD0: { Make: 'Canon', Model: 'Canon EOS R5' },
    IFD2: { DateTimeOriginal: '2026:10:12 18:04:31', OffsetTimeOriginal: '+05:30', LensModel: 'RF24-70mm F2.8 L IS USM' },
  })
  const exif = readExif((await sharp(buf).metadata()).exif)
  assert.equal(exif.camera, 'Canon EOS R5')
  assert.equal(exif.lens, 'RF24-70mm F2.8 L IS USM')
  assert.equal(exif.capturedAt, '2026-10-12T12:34:31.000Z')
})

test('joins make and model when the model does not repeat the make', async () => {
  const buf = await jpegWith({ IFD0: { Make: 'SONY', Model: 'ILCE-7M4' } })
  assert.equal(readExif((await sharp(buf).metadata()).exif).camera, 'SONY ILCE-7M4')
})

test('never throws on missing or broken EXIF', () => {
  assert.deepEqual(readExif(undefined), {})
  assert.deepEqual(readExif(Buffer.from('Exif\0\0garbage-garbage')), {})
})
