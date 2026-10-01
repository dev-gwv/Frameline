# Build from the REPO ROOT (needs the pnpm workspace):
#   docker build -f apps/processor/Dockerfile -t frameline-processor .
#   docker run -p 8788:8788 --env-file apps/processor/.env -v $(pwd)/apps/processor/models:/app/apps/processor/models frameline-processor
#
# Debian (not Alpine): onnxruntime-node's prebuilt native binding doesn't reliably cover musl libc, and sharp's
# musl build has had more rough edges historically. glibc avoids both.
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc* ./
COPY packages/faces/package.json packages/faces/package.json
COPY apps/processor/package.json apps/processor/package.json
# Only this app + its workspace deps (packages/faces) — not the whole monorepo's node_modules.
RUN pnpm install --filter @frameline/processor... --frozen-lockfile

FROM deps AS runtime
COPY packages/faces packages/faces
COPY apps/processor apps/processor
WORKDIR /app/apps/processor
ENV NODE_ENV=production
EXPOSE 8788
# Models are downloaded into a mounted volume, not baked into the image (see README) — ~38MB, and lets a model
# upgrade (e.g. SFace → a 512-d ArcFace model) ship without rebuilding the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:8788/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.ts"]
