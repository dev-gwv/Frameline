import { z } from '@hono/zod-openapi'
import { and, eq, gt, lt, or, type AnyColumn, type SQL } from 'drizzle-orm'
import { fromBase64Url, toBase64Url } from './crypto'
import { BadRequest } from './errors'

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
    .openapi({ description: `Page size (1–${MAX_LIMIT}).`, example: 50 }),
  cursor: z.string().max(512).optional().openapi({ description: 'Opaque cursor from the previous page\'s `nextCursor`.' }),
})

export const pageOf = <T extends z.ZodType>(item: T, name: string) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable().openapi({ description: 'Pass as `cursor` to get the next page; null on the last page.' }),
  }).openapi(name)

type CursorValue = string | number
const enc = new TextEncoder()
const dec = new TextDecoder()

export function encodeCursor(sortValue: CursorValue, id: string): string {
  return toBase64Url(enc.encode(JSON.stringify([sortValue, id])))
}

export function decodeCursor(cursor: string): [CursorValue, string] {
  try {
    const v = JSON.parse(dec.decode(fromBase64Url(cursor)))
    if (Array.isArray(v) && v.length === 2 && (typeof v[0] === 'string' || typeof v[0] === 'number') && typeof v[1] === 'string') return [v[0], v[1]]
  } catch { /* fall through */ }
  throw new BadRequest('The cursor is invalid or expired. Start again from the first page.', 'invalid_cursor')
}

/** Keyset condition "after (sortValue, id)" for the given direction. */
export function afterCursor(sortCol: AnyColumn, idCol: AnyColumn, dir: 'asc' | 'desc', cursor?: string): SQL | undefined {
  if (!cursor) return undefined
  const [v, id] = decodeCursor(cursor)
  const cmp = dir === 'asc' ? gt : lt
  return or(cmp(sortCol, v), and(eq(sortCol, v), cmp(idCol, id)))
}

/** Trims the extra look-ahead row and builds `nextCursor`. */
export function toPage<R, T>(rows: R[], limit: number, keyOf: (r: R) => [CursorValue, string], map: (r: R) => T): { items: T[]; nextCursor: string | null } {
  const more = rows.length > limit
  const slice = more ? rows.slice(0, limit) : rows
  const last = slice[slice.length - 1]
  return { items: slice.map(map), nextCursor: more && last ? encodeCursor(...keyOf(last)) : null }
}
