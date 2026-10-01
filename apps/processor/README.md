# Frameline processor

Runs the actual image/face AI work that Cloudflare Workers can't do: face detection and recognition today;
resizing/renditions/watermarking and AI enhance are a later pass (see "Not built yet" below). Meant to run on
your own server (e.g. the Hostinger VPS) — apps/api calls it over plain HTTP per photo.

## How it fits together

```
apps/api (Worker)  --queue consumer-->  getProcessor(env)  --HTTP POST /process-->  this service
                                                                                         |
                                                                                   reads the original
                                                                                   from R2 (S3 API),
                                                                                   returns width/height/
                                                                                   faces[] with embeddings
                                         applyResult() writes faces + Vectorize  <--|
```

This isn't a new design — `apps/api/src/services/processor.ts` already has the `HttpProcessor` class and the
exact `ProcessResult` contract this service implements; it was built in anticipation of this app. Read that
file (and `getProcessor`/`applyResult` around it) before changing the wire contract on either side.

**To wire it up once this is deployed:** on the Worker, `wrangler secret put PROCESSOR_URL --env production`
(e.g. `https://processor.yourdomain.in`, or the VPS's IP while testing) and
`wrangler secret put PROCESSOR_TOKEN --env production` (same value as this app's `.env`). Until `PROCESSOR_URL`
is set, apps/api uses `SimulatedProcessor` (today's behaviour) — nothing breaks by deploying this gradually.

## The face recognition pipeline — how it actually works

Two models from [opencv/opencv_zoo](https://github.com/opencv/opencv_zoo), run with `onnxruntime-node`:

- **YuNet** (`face_detection_yunet_2023mar`, MIT) — finds faces and 5 landmarks (eyes, nose, mouth corners).
- **SFace** (`face_recognition_sface_2021dec`, Apache-2.0) — turns an aligned face crop into a 128-number
  "fingerprint" (embedding). Two embeddings of the same person end up close together (cosine similarity);
  different people end up far apart. OpenCV's own documented cutoff for "same person" is **0.363**.

Both are small, CPU-only, fully commercially licensed — see [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and
the project's cost research for why these over heavier alternatives (ArcFace/InsightFace, which need a separate
commercial licence; AWS Rekognition, ~20-40x the cost at our volume).

**The pre/post-processing math (`packages/faces`) was not guessed or copied from a blog post** — every piece
was pulled from a primary source and the numbers verified against a real photo before any of this was wired
into a server:

| Piece | Source | What it gave us |
|---|---|---|
| Anchor generation + bbox/landmark decode | [`ShiqiYu/libfacedetection.train`](https://github.com/ShiqiYu/libfacedetection.train) (the model author's own current training repo) — `yunet_train/{engine/priors.py, engine/codec.py, tasks/face/postprocess.py}` | The exact FCOS-style anchor-free decode formula, confirmed against the actual `.onnx`'s own output tensor names (`cls_8`/`obj_8`/`bbox_8`/`kps_8`/… ×3 strides) |
| Pixel normalisation for both models | Same repo's `tasks/face/transforms.py` (`Normalize(mean=0, std=1)`) + OpenCV's own `face_recognize.cpp` (`blobFromImage(..., scalefactor=1, mean=0, swapRB=true)`) | Both models take **raw 0–255 pixel values**, not the ImageNet-style `/255` or mean-subtracted input you'd normally assume |
| 5-point face alignment (the exact 112×112 template coordinates + the similarity-transform fit) | `opencv/opencv` main repo, `modules/objdetect/src/face_recognize.cpp` (`getSimilarityTransformMatrix`) | The precise ArcFace-standard template points, so this also lines up with any ArcFace-family model later |

**Verified, not assumed:** `packages/faces` was exercised against a real photo (opencv_zoo's own YuNet demo
image, a very large crowd selfie) before being wired into this service — boxes land on real faces, the same
face embedded twice gives cosine 1.0, and two different real people in that photo scored 0.317 (correctly
below the 0.363 cutoff). `scripts/test-pipeline.mjs` re-runs this exact check any time.

One real bug surfaced during that verification and is worth knowing about: `sharp`'s low-level `affine()`
(`idx`/`idy`/`odx`/`ody`) turned out to expect an **inverse** output→input mapping that isn't clearly documented,
and using the natural forward transform silently produced all-black crops (not an error — just wrong). That's
why alignment is done with our own `warpAffine()` in `packages/faces/src/warp.ts` instead: plain, readable
bilinear-sampling code with no native-library convention to get backwards. It also means the exact same code
runs identically in this Node service and (later) in the gallery's on-device selfie matching in the browser.

## What's NOT built yet (fast-follows, in rough priority order)

1. **Face clustering within an event** (`faces[].personId`). Right now every detected face comes back with no
   `personId`, which `applyResult()` already handles fine (stores `null`) — guest selfie search still works via
   direct Vectorize nearest-neighbour search (see `matchFaces` in `apps/api/src/services/faces.ts`), it just
   doesn't yet benefit from "found one photo of this person → also surface every other photo of them". Natural
   next step: on each new face, compare its embedding against recent faces in the same event and reuse a
   `personId` above some cosine threshold, else start a new one.
2. **The browser side of selfie matching.** `apps/gallery`'s `SelfieFlow.tsx` currently sends a placeholder
   `key`, with a comment: *"the real API uses `embedding` once an on-device model exists."* That on-device
   model should be the **same** YuNet+SFace pair running via `onnxruntime-web`, reusing `packages/faces`
   unchanged (it's pure math, no Node-specific APIs) — the guest's selfie image never has to leave their device,
   just a 128-number vector does.
3. **Renditions, watermarking, AI enhance.** `ProcessResult.previewUrl`/`exif` are left at their defaults; the
   Worker keeps using the original upload as-is, same as `SimulatedProcessor` does today.
4. **Real EXIF extraction** (camera/lens/capture time) — `sharp(...).metadata()` exposes the raw EXIF buffer;
   parsing it into `ProcessResult.exif` is a small, separate addition.

## Running locally

```bash
pnpm install                 # from the repo root, once
pnpm --filter @frameline/processor models:download   # ~39MB, not committed to git
cp apps/processor/.env.example apps/processor/.env    # fill in R2 credentials + a PROCESSOR_TOKEN
pnpm --filter @frameline/processor test:pipeline       # sanity-checks detection+embedding on a real photo
pnpm --filter @frameline/processor dev                 # serves :8788
```

`test:pipeline` downloads a real multi-face test photo on first run (opencv_zoo's own YuNet demo image) and
writes `.tmp/annotated.jpg` with the detected boxes drawn on — open it and check they land on real faces. Pass
your own photo instead: `pnpm --filter @frameline/processor test:pipeline path/to/photo.jpg`.

## Deploying to the VPS

Not done yet — this needs either SSH access to the VPS (so it can be set up directly) or for someone to run it
by hand there. Either way:

```bash
git clone <repo> && cd Kamero-Clone
pnpm install
pnpm --filter @frameline/processor models:download
cp apps/processor/.env.example apps/processor/.env   # fill in real values
docker compose -f apps/processor/docker-compose.yml up -d --build
```

Then point the Worker at it (see "How it fits together" above), and put a reverse proxy with TLS in front of
port 8788 (Caddy or nginx) rather than exposing it directly — this service has no rate limiting or DDoS
protection of its own, unlike apps/api sitting behind Cloudflare.

The `docker-compose.yml`'s CPU limit assumes a 4-core VPS and reserves 1 core for your other two APIs on the
same box — adjust `deploy.resources.limits.cpus` to match your actual plan.
