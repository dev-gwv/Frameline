import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as ort from 'onnxruntime-node'
import sharp from 'sharp'
import {
  decodeYuNet, computeLetterbox, unletterboxDetection, YUNET_STRIDES, YUNET_INPUT_SIZE,
  similarityTransform5pt, SFACE_INPUT_SIZE, l2Normalize, warpAffine, type YuNetDetection,
} from '@frameline/faces'

export interface DetectedFace {
  box: [number, number, number, number]
  embedding: number[]
}

export interface DetectAndEmbedResult {
  width: number
  height: number
  faces: DetectedFace[]
}

let yunet: ort.InferenceSession | undefined
let sface: ort.InferenceSession | undefined

/** Loads both ONNX sessions once. Call before serving traffic — do this at startup, not lazily on first request. */
export async function loadModels(modelsDir: string): Promise<void> {
  const [y, s] = await Promise.all([
    ort.InferenceSession.create(join(modelsDir, 'yunet.onnx')),
    ort.InferenceSession.create(join(modelsDir, 'sface.onnx')),
  ])
  yunet = y
  sface = s
}

function assertLoaded(): { yunet: ort.InferenceSession; sface: ort.InferenceSession } {
  if (!yunet || !sface) throw new Error('Models not loaded — call loadModels() at startup')
  return { yunet, sface }
}

/** Interleaved RGB (3 channels) raw buffer, as sharp's `.raw()` output with alpha removed. */
async function toRawRgb(input: Buffer | string, resizeTo?: number): Promise<{ data: Buffer; width: number; height: number }> {
  let img = sharp(input).removeAlpha()
  if (resizeTo) img = img.resize(resizeTo, resizeTo, { fit: 'fill' })
  const { data, info } = await img.toColorspace('srgb').raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

function toYuNetTensor(rgb: Buffer, size: number): ort.Tensor {
  const plane = size * size
  const out = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    // BGR, raw 0..255 — see packages/faces/src/yunet.ts for why (no /255, no mean subtraction).
    out[i] = rgb[i * 3 + 2]
    out[plane + i] = rgb[i * 3 + 1]
    out[2 * plane + i] = rgb[i * 3]
  }
  return new ort.Tensor('float32', out, [1, 3, size, size])
}

async function detectFaces(originalBuffer: Buffer, width: number, height: number): Promise<YuNetDetection[]> {
  const { yunet } = assertLoaded()
  const lb = computeLetterbox(width, height, YUNET_INPUT_SIZE)
  const resizedW = Math.round(width * lb.scale), resizedH = Math.round(height * lb.scale)
  const { data } = await sharp(originalBuffer)
    .removeAlpha()
    .resize(resizedW, resizedH)
    .extend({
      top: Math.round(lb.padY), bottom: YUNET_INPUT_SIZE - resizedH - Math.round(lb.padY),
      left: Math.round(lb.padX), right: YUNET_INPUT_SIZE - resizedW - Math.round(lb.padX),
      background: { r: 0, g: 0, b: 0 },
    })
    .toColorspace('srgb').raw().toBuffer({ resolveWithObject: true })

  const results = await yunet.run({ input: toYuNetTensor(data, YUNET_INPUT_SIZE) })
  const outputsByStride = Object.fromEntries(YUNET_STRIDES.map((s) => [s, {
    cls: results[`cls_${s}`].data as Float32Array,
    obj: results[`obj_${s}`].data as Float32Array,
    bbox: results[`bbox_${s}`].data as Float32Array,
    kps: results[`kps_${s}`].data as Float32Array,
  }])) as Record<(typeof YUNET_STRIDES)[number], { cls: Float32Array; obj: Float32Array; bbox: Float32Array; kps: Float32Array }>

  return decodeYuNet(outputsByStride, { size: YUNET_INPUT_SIZE }).map((d) => unletterboxDetection(d, lb))
}

async function embedFace(fullRgb: Buffer, width: number, height: number, det: YuNetDetection): Promise<number[]> {
  const { sface } = assertLoaded()
  const xf = similarityTransform5pt(det.landmarks)
  const warped = warpAffine({ data: fullRgb, width, height, channels: 3 }, xf, SFACE_INPUT_SIZE, SFACE_INPUT_SIZE)
  const plane = SFACE_INPUT_SIZE * SFACE_INPUT_SIZE
  const tensor = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    tensor[i] = warped.data[i * 3]; tensor[plane + i] = warped.data[i * 3 + 1]; tensor[2 * plane + i] = warped.data[i * 3 + 2]
  }
  const out = await sface.run({ data: new ort.Tensor('float32', tensor, [1, 3, SFACE_INPUT_SIZE, SFACE_INPUT_SIZE]) })
  return Array.from(l2Normalize(out.fc1.data as Float32Array))
}

/**
 * Detects every face in `imageBuffer` and returns an L2-normalised 128-d embedding for each, in the original
 * image's own pixel coordinates. Faces are embedded against the FULL-resolution original (not the 640x640
 * detection input), for the best possible embedding quality.
 */
export async function detectAndEmbed(imageBuffer: Buffer): Promise<DetectAndEmbedResult> {
  const meta = await sharp(imageBuffer).metadata()
  if (!meta.width || !meta.height) throw new Error('Could not read image dimensions')
  const { width, height } = meta

  const detections = await detectFaces(imageBuffer, width, height)
  if (!detections.length) return { width, height, faces: [] }

  const { data: fullRgb } = await toRawRgb(imageBuffer)
  const faces: DetectedFace[] = []
  for (const det of detections) {
    faces.push({ box: det.box, embedding: await embedFace(fullRgb, width, height, det) })
  }
  return { width, height, faces }
}

/** Dev convenience: load an image straight from disk (used by scripts/test-pipeline.mjs, not the server). */
export async function detectAndEmbedFile(path: string): Promise<DetectAndEmbedResult> {
  return detectAndEmbed(await readFile(path))
}
