import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { LedgerEntry } from '@frameline/shared'
import { getDb, schema, type DB } from '../db/client'
import { ledgerOut } from '../db/mappers'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { toMajor } from '../lib/money'

/**
 * Money model:
 * - `studios.wallet_paise` is the prepaid wallet ("credits") used for packs, renewals and AI enhance.
 * - `ledger_entries` is the studio's statement. `balance_paise` is the payout balance (store earnings):
 *   sales add to it and payouts/refunds take from it. Wallet movements (credits-added/credits-used) are listed
 *   with their amount but leave the payout balance unchanged.
 */
export class InsufficientCredits extends AppError {
  constructor(required: number, available: number) {
    super(402, 'insufficient_credits', 'Not enough credits', `You need ${toMajor(required)} credits but have ${toMajor(available)}. Add credits and try again.`, {
      extensions: { required: toMajor(required), available: toMajor(available) },
    })
  }
}

export async function payoutBalance(db: DB, studioId: string): Promise<number> {
  const l = schema.ledgerEntries
  const [last] = await db.select({ b: l.balancePaise }).from(l).where(eq(l.studioId, studioId)).orderBy(desc(l.at), desc(l.id)).limit(1)
  return last?.b ?? 0
}

/** Appends a statement line. `movesBalance` controls whether the payout balance changes. */
export async function addLedger(db: DB, studioId: string, type: LedgerEntry['type'], description: string, amountPaise: number, movesBalance: boolean): Promise<LedgerEntry> {
  const balance = await payoutBalance(db, studioId)
  const row = {
    id: newId('led'), studioId, at: nowIso(), description, type, amountPaise,
    balancePaise: balance + (movesBalance ? amountPaise : 0),
  }
  await db.insert(schema.ledgerEntries).values(row).run()
  return ledgerOut(row)
}

/** Atomically takes credits from the wallet (402 when there aren't enough) and records it. */
export async function debitWallet(db: DB, studioId: string, amountPaise: number, description: string): Promise<LedgerEntry> {
  const st = schema.studios
  const res = await db.update(st).set({ walletPaise: sql`${st.walletPaise} - ${amountPaise}` })
    .where(and(eq(st.id, studioId), gte(st.walletPaise, amountPaise))).run()
  if (res.meta.changes === 0) {
    const [row] = await db.select({ w: st.walletPaise }).from(st).where(eq(st.id, studioId)).limit(1)
    throw new InsufficientCredits(amountPaise, row?.w ?? 0)
  }
  return addLedger(db, studioId, 'credits-used', description, -amountPaise, false)
}

export async function creditWallet(db: DB, studioId: string, amountPaise: number, description: string): Promise<LedgerEntry> {
  const st = schema.studios
  await db.update(st).set({ walletPaise: sql`${st.walletPaise} + ${amountPaise}` }).where(eq(st.id, studioId)).run()
  return addLedger(db, studioId, 'credits-added', description, amountPaise, false)
}

const invoiceNumber = () => `FL-${new Date().getUTCFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`

export async function recordPurchase(db: DB, studioId: string, p: { description: string; kind: typeof schema.purchases.$inferInsert['kind']; amountPaise: number; method: typeof schema.purchases.$inferInsert['method'] }) {
  const row = { id: newId('pur'), studioId, at: nowIso(), invoiceNumber: invoiceNumber(), ...p }
  await db.insert(schema.purchases).values(row).run()
  return row
}

export async function walletOf(d1: D1Database, studioId: string): Promise<number> {
  const [row] = await getDb(d1).select({ w: schema.studios.walletPaise }).from(schema.studios).where(eq(schema.studios.id, studioId)).limit(1)
  return row?.w ?? 0
}
