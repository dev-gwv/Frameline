import * as ort from 'onnxruntime-node'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import {
  decodeYuNet, computeLetterbox, unletterboxDetection, YUNET_STRIDES, YUNET_INPUT_SIZE,
  similarityTransform5pt, SFACE_INPUT_SIZE, l2Normalize, cosineSimilarity, warpAffine,
} from '../../packages/faces/src/index.ts'

const IMG_PATH = 'test-images/largest_selfie.jpg'

async function loadLetterboxedBGR(path, target) {
  const img = sharp(path)
  const meta = await img.metadata()
  const lb = computeLetterbox(meta.width, meta.height, target)
  const resizedW = Math.round(meta.width * lb.scale), resizedH = Math.round(meta.height * lb.scale)
  const { data } = await img
    .resize(resizedW, resizedH)
    .extend({
      top: Math.round(lb.padY), bottom: target - resizedH - Math.round(lb.padY),
      left: Math.round(lb.padX), right: target - resizedW - Math.round(lb.padX),
      background: { r: 0, g: 0, b: 0 },
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  // sharp gives interleaved RGB HWC uint8; convert to planar BGR float32 NCHW.
  const plane = target * target
  const tensor = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2]
    tensor[i] = b           // channel 0 = B
    tensor[plane + i] = g   // channel 1 = G
    tensor[2 * plane + i] = r // channel 2 = R
  }
  return { tensor, lb, meta }
}

function toTensor(arr, dims) { return new ort.Tensor('float32', arr, dims) }

async function main() {
  console.log('Loading YuNet...')
  const yunet = await ort.InferenceSession.create('models/yunet.onnx')
  console.log('Loading SFace...')
  const sfaceSess = await ort.InferenceSession.create('models/sface.onnx')

  console.log('Preprocessing image...')
  const { tensor, lb, meta } = await loadLetterboxedBGR(IMG_PATH, YUNET_INPUT_SIZE)
  console.log('Original size:', meta.width, meta.height, 'letterbox:', lb)

  console.log('Running YuNet...')
  const results = await yunet.run({ input: toTensor(tensor, [1, 3, YUNET_INPUT_SIZE, YUNET_INPUT_SIZE]) })

  // Sanity-check: are cls/obj already sigmoided (values in [0,1]) as the export script suggests?
  const clsSample = results['cls_8'].data
  let min = Infinity, max = -Infinity
  for (let i = 0; i < Math.min(1000, clsSample.length); i++) { min = Math.min(min, clsSample[i]); max = Math.max(max, clsSample[i]) }
  console.log('cls_8 sample range:', min, max, '(expect within [0,1] if already sigmoided)')

  const outputsByStride = {}
  for (const s of YUNET_STRIDES) {
    outputsByStride[s] = { cls: results[`cls_${s}`].data, obj: results[`obj_${s}`].data, bbox: results[`bbox_${s}`].data, kps: results[`kps_${s}`].data }
  }
  const detections = decodeYuNet(outputsByStride, { size: YUNET_INPUT_SIZE, scoreThreshold: 0.6, nmsThreshold: 0.3 })
    .map((d) => unletterboxDetection(d, lb))
  console.log(`Detected ${detections.length} faces (score>=0.6, after NMS)`)
  console.log('Top 5 scores:', detections.slice(0, 5).map((d) => d.score.toFixed(3)))
  console.log('Sample box (orig px):', detections[0]?.box, 'landmarks:', detections[0]?.landmarks)

  // Draw boxes on the original image to visually verify against the reference-annotated photo.
  const svgBoxes = detections.map((d) => {
    const [x1, y1, x2, y2] = d.box
    const dots = d.landmarks.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="red"/>`).join('')
    return `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="none" stroke="lime" stroke-width="2"/>${dots}`
  }).join('')
  const svg = `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">${svgBoxes}</svg>`
  await sharp(IMG_PATH).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 85 }).toFile('test-images/our_detections.jpg')
  console.log('Wrote test-images/our_detections.jpg')

  // Pick two detections that are clearly different people (far apart) to test SFace embeddings.
  const byX = [...detections].sort((a, b) => a.box[0] - b.box[0])
  const faceA = byX[Math.floor(byX.length * 0.1)]
  const faceB = byX[Math.floor(byX.length * 0.9)]
  if (!faceA || !faceB) throw new Error('not enough detections for an embedding test')

  const orig = sharp(IMG_PATH).removeAlpha()
  const { data: fullRGB, info } = await orig.raw().toBuffer({ resolveWithObject: true })

  async function embed(face) {
    const xf = similarityTransform5pt(face.landmarks)
    const warped = warpAffine({ data: fullRGB, width: info.width, height: info.height, channels: 3 }, xf, SFACE_INPUT_SIZE, SFACE_INPUT_SIZE)
    const plane = SFACE_INPUT_SIZE * SFACE_INPUT_SIZE
    const t = new Float32Array(3 * plane)
    for (let i = 0; i < plane; i++) {
      t[i] = warped.data[i * 3]; t[plane + i] = warped.data[i * 3 + 1]; t[2 * plane + i] = warped.data[i * 3 + 2]
    }
    const out = await sfaceSess.run({ data: toTensor(t, [1, 3, SFACE_INPUT_SIZE, SFACE_INPUT_SIZE]) })
    return { embedding: l2Normalize(out.fc1.data), crop: warped }
  }

  console.log('\nEmbedding face A (left-ish)...')
  const a1 = await embed(faceA)
  console.log('Embedding face A again (determinism check)...')
  const a2 = await embed(faceA)
  console.log('Embedding face B (right-ish, different person)...')
  const b1 = await embed(faceB)

  console.log('\nsame-face cosine (A vs A):', cosineSimilarity(a1.embedding, a2.embedding).toFixed(4), '(expect ~1.0)')
  console.log('diff-face cosine (A vs B):', cosineSimilarity(a1.embedding, b1.embedding).toFixed(4), '(expect well below 0.363)')
  console.log('embedding length:', a1.embedding.length, 'norm:', Math.hypot(...a1.embedding).toFixed(4), '(expect 128 and 1.0)')

  await sharp(a1.crop.data, { raw: { width: SFACE_INPUT_SIZE, height: SFACE_INPUT_SIZE, channels: 3 } }).jpeg().toFile('test-images/aligned_a.jpg')
  await sharp(b1.crop.data, { raw: { width: SFACE_INPUT_SIZE, height: SFACE_INPUT_SIZE, channels: 3 } }).jpeg().toFile('test-images/aligned_b.jpg')
  console.log('Wrote test-images/aligned_a.jpg, aligned_b.jpg for visual inspection')
}

main().catch((e) => { console.error(e); process.exit(1) })
