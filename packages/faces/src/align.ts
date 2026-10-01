/**
 * SFace alignment + embedding post-processing (pure math).
 *
 * Model: `face_recognition_sface_2021dec.onnx` (opencv_zoo, Apache-2.0). Input `data` [1,3,112,112] NCHW, RGB,
 * raw float32 0..255 (no scale/mean — confirmed from OpenCV's own `FaceRecognizerSF::feature()`:
 * `blobFromImage(aligned, 1, Size(112,112), Scalar(0,0,0), /*swapRB=*\/true, /*crop=*\/false)` — scalefactor 1,
 * mean 0, and swapRB because OpenCV loads images as BGR; sharp/Canvas already give RGB, so no swap is needed
 * on our side). Output `fc1` is a 128-d embedding; L2-normalize it before storing or comparing (OpenCV does the
 * same in `match()`, via `normalize()` right before the cosine/L2 distance).
 *
 * Alignment target (112x112 reference positions for right eye, left eye, nose, right mouth, left mouth) is
 * OpenCV's own constant from `getSimilarityTransformMatrix` in `modules/objdetect/src/face_recognize.cpp` —
 * the standard ArcFace/InsightFace 5-point template, so this lines up with any ArcFace-family model too.
 */

export const SFACE_INPUT_SIZE = 112

export const SFACE_TEMPLATE_5PT: [number, number][] = [
  [38.2946, 51.6963], // right eye
  [73.5318, 51.5014], // left eye
  [56.0252, 71.7366], // nose tip
  [41.5493, 92.3655], // right mouth corner
  [70.7299, 92.2041], // left mouth corner
]

/** A 2x3 affine matrix: x' = a*x + b*y + c, y' = d*x + e*y + f. */
export interface Affine2x3 { a: number; b: number; c: number; d: number; e: number; f: number }

/**
 * The optimal similarity transform (rotation + uniform scale + translation, least squares, no reflection)
 * mapping `src` (5 points, in order: right eye, left eye, nose, right mouth, left mouth) onto
 * `SFACE_TEMPLATE_5PT`. Equivalent to OpenCV's SVD-based Umeyama fit for the generic (non-degenerate, planar)
 * case real face landmarks are always in — verified in tests by checking the fitted points land on the
 * template to sub-pixel accuracy, not by matching OpenCV's implementation line for line.
 */
export function similarityTransform5pt(src: [number, number][], dst: [number, number][] = SFACE_TEMPLATE_5PT): Affine2x3 {
  const n = src.length
  const srcMean: [number, number] = [avg(src, 0), avg(src, 1)]
  const dstMean: [number, number] = [avg(dst, 0), avg(dst, 1)]
  const sc = src.map(([x, y]) => [x - srcMean[0], y - srcMean[1]] as [number, number])
  const dc = dst.map(([x, y]) => [x - dstMean[0], y - dstMean[1]] as [number, number])

  // Optimal 2D rotation angle for aligning `sc` onto `dc` (Horn's closed-form absolute-orientation solution,
  // specialised to 2D — equivalent to the rotation component of a full SVD-based Procrustes fit).
  let cross = 0, dot = 0, srcSq = 0
  for (let i = 0; i < n; i++) {
    cross += dc[i][0] * sc[i][1] - dc[i][1] * sc[i][0]
    dot += dc[i][0] * sc[i][0] + dc[i][1] * sc[i][1]
    srcSq += sc[i][0] * sc[i][0] + sc[i][1] * sc[i][1]
  }
  const angle = Math.atan2(cross, dot)
  const cosA = Math.cos(angle), sinA = Math.sin(angle)

  // Uniform scale minimising the residual, given that rotation (standard Procrustes scale formula).
  let scaleNum = 0
  for (let i = 0; i < n; i++) {
    const rx = cosA * sc[i][0] - sinA * sc[i][1]
    const ry = sinA * sc[i][0] + cosA * sc[i][1]
    scaleNum += dc[i][0] * rx + dc[i][1] * ry
  }
  const scale = srcSq > 1e-9 ? scaleNum / srcSq : 1

  const a = scale * cosA, b = -scale * sinA, d = scale * sinA, e = scale * cosA
  return { a, b, c: dstMean[0] - (a * srcMean[0] + b * srcMean[1]), d, e, f: dstMean[1] - (d * srcMean[0] + e * srcMean[1]) }
}

function avg(pts: [number, number][], axis: 0 | 1): number {
  return pts.reduce((s, p) => s + p[axis], 0) / pts.length
}

/** In place-safe L2 normalisation; returns a new Float32Array (matches OpenCV's `normalize()` before matching). */
export function l2Normalize(v: ArrayLike<number>): Float32Array {
  let sumSq = 0
  for (let i = 0; i < v.length; i++) sumSq += v[i] * v[i]
  const norm = Math.sqrt(sumSq) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

/** Cosine similarity of two already-L2-normalised vectors (just the dot product). OpenCV's own "same person" cutoff is 0.363. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

export const SFACE_SAME_PERSON_COSINE_THRESHOLD = 0.363
