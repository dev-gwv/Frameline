#!/usr/bin/env node
// Downloads the two ONNX models from opencv/opencv_zoo (not vendored in git — see ../README.md).
// GitHub serves LFS-tracked files as pointer text from raw.githubusercontent.com; media.githubusercontent.com
// resolves the actual LFS object, which is what we need here.
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODELS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'models')
const FILES = {
  'yunet.onnx': 'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx',
  'sface.onnx': 'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx',
}

await mkdir(MODELS_DIR, { recursive: true })
for (const [name, url] of Object.entries(FILES)) {
  process.stdout.write(`Downloading ${name}... `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} fetching ${url}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.length < 10_000) throw new Error(`${name}: suspiciously small (${bytes.length} bytes) — got an LFS pointer, not the real file?`)
  await writeFile(join(MODELS_DIR, name), bytes)
  console.log(`${(bytes.length / 1e6).toFixed(1)} MB`)
}
console.log(`\nModels in ${MODELS_DIR}:`)
console.log('  yunet.onnx  — face_detection_yunet_2023mar (MIT, opencv_zoo)')
console.log('  sface.onnx  — face_recognition_sface_2021dec (Apache-2.0, opencv_zoo)')
