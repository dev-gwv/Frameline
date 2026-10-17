/** Config read from the environment (see `.env.example`). Fails fast on startup if anything required is missing. */
export interface ProcessorEnv {
  port: number
  /** Must match `PROCESSOR_TOKEN` in apps/api's env — every request's Authorization: Bearer header is checked against it. */
  authToken: string
  r2: { accountId: string; accessKeyId: string; secretAccessKey: string }
  modelsDir: string
  /** Photos processed at once (default 2: one per core the container is given). */
  maxJobs: number
  /** Requests that may wait for a turn before the processor answers 503 busy (default 20). */
  maxWaiting: number
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example)`)
  return v
}

export function loadEnv(): ProcessorEnv {
  return {
    port: Number(process.env.PORT ?? 8788),
    authToken: required('PROCESSOR_TOKEN'),
    r2: {
      accountId: required('R2_ACCOUNT_ID'),
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    },
    maxJobs: Math.max(1, Number(process.env.PROCESSOR_MAX_JOBS ?? 2) || 2),
    maxWaiting: Math.max(0, Number(process.env.PROCESSOR_MAX_WAITING ?? 20) || 20),
    modelsDir: process.env.MODELS_DIR ?? new URL('../models', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  }
}
