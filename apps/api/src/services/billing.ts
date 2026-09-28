import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { WALLET_POT_LABEL, type LedgerEntry } from '@frameline/shared'
import { getDb, schema, type DB } from '../db/client'
import { ledgerOut } from '../db/mappers'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { toMajor } from '../lib/money'

/**
 * Money model:
 * - `studios.wallet_paise` is the prepaid part of the wallet (Add money, coupons).
 * - `ledger_entries` is the studio's statement. `balance_paise` is the payout balance (store earnings):
 *   sales add to it and payouts/refunds take from it. Prepaid movements (credits-added/credits-used from prepaid)
 *   are listed with their amount but leave the payout balance unchanged.
 * - The UI shows one "Wallet" = prepaid + earnings. Spending (packs, renewals, AI enhance, plan checkout via
 *   wallet) draws from prepaid first, then from positive earnings; each part gets its own ledger line naming the pot.
 *   Withdrawable stays = earnings (never below 0).
 */
export class InsufficientCredits extends AppError {
  constructor(required: number, available: number) {
    super(402, 'insufficient_credits', 'Not enough in your wallet', `You need ₹${toMajor(required)} but your wallet has ₹${toMajor(available)}. Add money to your wallet and try again.`, {
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

/**
 * Takes `amountPaise` from the wallet: prepaid first (atomic conditional update), then positive store earnings
 * (a `credits-used` line that moves the payout balance). 402 when prepaid + earnings aren't enough.
 * Returns the ledger lines written (one per pot used), prepaid first.
 */
export async function spendFromWallet(db: DB, studioId: string, amountPaise: number, description: string, attempt = 0): Promise<LedgerEntry[]> {
  const st = schema.studios
  const [row] = await db.select({ w: st.walletPaise }).from(st).where(eq(st.id, studioId)).limit(1)
  const prepaid = Math.max(0, row?.w ?? 0)
  const earnings = Math.max(0, await payoutBalance(db, studioId))
  if (prepaid + earnings < amountPaise) throw new InsufficientCredits(amountPaise, prepaid + earnings)
  const fromPrepaid = Math.min(prepaid, amountPaise)
  const fromEarnings = amountPaise - fromPrepaid
  const lines: LedgerEntry[] = []
  if (fromPrepaid > 0) {
    const res = await db.update(st).set({ walletPaise: sql`${st.walletPaise} - ${fromPrepaid}` })
      .where(and(eq(st.id, studioId), gte(st.walletPaise, fromPrepaid))).run()
    // Another request spent it first: start over with fresh numbers.
    if (res.meta.changes === 0) {
      if (attempt >= 3) throw new InsufficientCredits(amountPaise, 0)
      return spendFromWallet(db, studioId, amountPaise, description, attempt + 1)
    }
    lines.push(await addLedger(db, studioId, 'credits-used', `${description} · ${WALLET_POT_LABEL.prepaid}`, -fromPrepaid, false))
  }
  if (fromEarnings > 0) lines.push(await addLedger(db, studioId, 'credits-used', `${description} · ${WALLET_POT_LABEL.earnings}`, -fromEarnings, true))
  return lines
}

/** Spends from the wallet (see spendFromWallet) and returns the first ledger line written. */
export async function debitWallet(db: DB, studioId: string, amountPaise: number, description: string): Promise<LedgerEntry> {
  const lines = await spendFromWallet(db, studioId, amountPaise, description)
  return lines[0]
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
