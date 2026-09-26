import type { Context } from 'hono'
import type { AppEnv } from '../env'
import { getDb, schema } from '../db/client'
import { background, clientIp } from '../lib/http'
import { newId } from '../lib/ids'

/** Appends to the audit log after the response is sent. */
export function audit(
  c: Context<AppEnv>, action: string, target?: { type: string; id: string }, meta?: Record<string, unknown>, userId?: string,
): void {
  const db = getDb(c.env.DB)
  background(c, db.insert(schema.auditLog).values({
    id: newId('aud'),
    studioId: c.get('membership')?.studioId ?? null,
    userId: userId ?? c.get('user')?.id ?? null,
    action,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    meta: meta ?? null,
    ip: clientIp(c),
    requestId: c.get('requestId') ?? null,
    at: new Date().toISOString(),
  }).run())
}
