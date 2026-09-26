import { applyD1Migrations, env } from 'cloudflare:test'
import { buildSeedSql } from '../src/db/seed-sql'

// Runs before each test file: schema + a trimmed copy of the shared sample data (40 photos per album).
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
const seeded = await env.DB.prepare('SELECT count(*) AS n FROM studios WHERE id = ?').bind('st_northlight').first<{ n: number }>()
if (!seeded?.n) {
  const stmts = buildSeedSql({ photoCap: 40 })
  await env.DB.batch(stmts.map((s) => env.DB.prepare(s)))
}
