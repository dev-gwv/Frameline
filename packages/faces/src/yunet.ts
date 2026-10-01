/**
 * YuNet face detector: decode + NMS only (pure math, no model I/O — works identically in Node and the browser).
 *
 * Model: `face_detection_yunet_2023mar.onnx` (opencv_zoo, MIT). Fixed input `input` [1,3,640,640] NCHW, raw BGR
 * float32 in 0..255 (no mean/scale — confirmed from the model author's training config: Normalize(mean=0, std=1,
 * to_rgb=false), i.e. the network is fed exactly what `cv2.imread` + `blobFromImage(scalefactor=1)` would produce).
 *
 * Outputs (already sigmoid-activated at export time): for each stride s in (8, 16, 32), `cls_s` [1,N,1],
 * `obj_s` [1,N,1], `bbox_s` [1,N,4], `kps_s` [1,N,10] — N = (640/s)^2 grid cells, row-major (y outer, x inner).
 * Decode verified against opencv/opencv_zoo's current training repo (ShiqiYu/libfacedetection.train,
 * yunet_train/{engine/priors.py, engine/codec.py, tasks/face/postprocess.py}): an anchor-free, FCOS-style head.
 *
 * The 5 landmarks are, in order: right eye, left eye, nose tip, right mouth corner, left mouth corner — this is
 * OpenCV's own convention (`FaceDetectorYN::detect()`), chosen so it lines up directly with SFace's alignment
 * template in align.ts without reordering.
 */

export const YUNET_INPUT_SIZE = 640
export const YUNET_STRIDES = [8, 16, 32] as const

export interface YuNetDetection {
  /** [x1, y1, x2, y2] in the 640x640 input-tensor's own pixel space — map back with your own resize/pad info. */
  box: [number, number, number, number]
  score: number
  /** 5 points, each [x, y], same coordinate space as `box`. Order: right eye, left eye, nose, right mouth, left mouth. */
  landmarks: [number, number][]
}

/** One stride's four raw output tensors, as returned by the ONNX runtime (any typed array works). */
export interface YuNetStrideOutputs {
  cls: ArrayLike<number>
  obj: ArrayLike<number>
  bbox: ArrayLike<number>
  kps: ArrayLike<number>
}

function iou(a: [number, number, number, number], b: [number, number, number, number]): number {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3])
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1])
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1])
  const union = areaA + areaB - inter
  return union > 0 ? inter / union : 0
}

/** Greedy NMS, highest score first. `dets` is mutated-free; returns the kept subset in score order. */
export function nms(dets: YuNetDetection[], iouThreshold: number): YuNetDetection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score)
  const kept: YuNetDetection[] = []
  for (const d of sorted) {
    if (kept.every((k) => iou(k.box, d.box) <= iouThreshold)) kept.push(d)
  }
  return kept
}

/**
 * Decodes one stride's raw outputs into detections (before NMS, after a score threshold). `size` is the square
 * input size actually used (640 for the 2023mar export — pass it rather than hardcoding in case of a future
 * dynamic-shape export).
 */
export function decodeStride(stride: number, out: YuNetStrideOutputs, size: number, scoreThreshold: number): YuNetDetection[] {
  const grid = size / stride
  const n = grid * grid
  const dets: YuNetDetection[] = []
  for (let i = 0; i < n; i++) {
    const score = out.cls[i] * out.obj[i]
    if (score < scoreThreshold) continue
    // Row-major grid: y = floor(i / grid), x = i % grid (torch.meshgrid(shift_y, shift_x, indexing='ij').reshape(-1)).
    const gy = Math.floor(i / grid), gx = i % grid
    const px = gx * stride, py = gy * stride
    const bx = i * 4, kx = i * 10
    const cx = out.bbox[bx] * stride + px
    const cy = out.bbox[bx + 1] * stride + py
    const w = Math.exp(out.bbox[bx + 2]) * stride
    const h = Math.exp(out.bbox[bx + 3]) * stride
    const landmarks: [number, number][] = []
    for (let p = 0; p < 5; p++) {
      landmarks.push([out.kps[kx + p * 2] * stride + px, out.kps[kx + p * 2 + 1] * stride + py])
    }
    dets.push({ box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], score, landmarks })
  }
  return dets
}

/** Decodes all three strides and applies NMS. `scoreThreshold`/`nmsThreshold` default to OpenCV's own demo values. */
export function decodeYuNet(
  outputsByStride: Record<(typeof YUNET_STRIDES)[number], YuNetStrideOutputs>,
  opts: { size?: number; scoreThreshold?: number; nmsThreshold?: number } = {},
): YuNetDetection[] {
  const size = opts.size ?? YUNET_INPUT_SIZE
  const scoreThreshold = opts.scoreThreshold ?? 0.6
  const nmsThreshold = opts.nmsThreshold ?? 0.3
  const all = YUNET_STRIDES.flatMap((s) => decodeStride(s, outputsByStride[s], size, scoreThreshold))
  return nms(all, nmsThreshold)
}

/** Scale+pad used to fit an arbitrary W×H image into a `target`×`target` square without distorting it. */
export interface Letterbox { scale: number; padX: number; padY: number; target: number }

export function computeLetterbox(width: number, height: number, target = YUNET_INPUT_SIZE): Letterbox {
  const scale = Math.min(target / width, target / height)
  return { scale, padX: (target - width * scale) / 2, padY: (target - height * scale) / 2, target }
}

/** Maps a point from letterboxed (model input) space back to the original image's pixel space. */
export function unletterboxPoint([x, y]: [number, number], lb: Letterbox): [number, number] {
  return [(x - lb.padX) / lb.scale, (y - lb.padY) / lb.scale]
}

export function unletterboxDetection(d: YuNetDetection, lb: Letterbox): YuNetDetection {
  const [x1, y1] = unletterboxPoint([d.box[0], d.box[1]], lb)
  const [x2, y2] = unletterboxPoint([d.box[2], d.box[3]], lb)
  return { ...d, box: [x1, y1, x2, y2], landmarks: d.landmarks.map((p) => unletterboxPoint(p, lb)) }
}
