/**
 * Loads the shared sample data (`createSeed()` from @frameline/shared) into the LOCAL D1 database.
 *
 *   pnpm --filter @frameline/api db:seed            # apply migrations, then insert (idempotent: INSERT OR IGNORE)
 *   pnpm --filter @frameline/api db:reset:local     # wipe all rows first
 *   ... db:seed -- --photo-cap=50                   # fewer photos per album (faster)
 *
 * Seeded users (sign in with an email code; codes are printed in the `wrangler dev` log):
 *   aarav@northlight.in (owner) · meera@northlight.in (editor) · kunal.shah@gmail.com (uploader, Tessera only)
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSeedSql } from '../src/db/seed-sql'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const reset = args.includes('--reset')
const capArg = args.find((a) => a.startsWith('--photo-cap='))
const photoCap = capArg ? Number(capArg.split('=')[1]) : undefined

const run = (cmd: string) => execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1' } })

console.log('› Applying migrations to local D1…')
run('wrangler d1 migrations apply DB --local')

const stmts = buildSeedSql({ reset, photoCap })
const file = join(root, '.wrangler', 'seed.sql')
mkdirSync(dirname(file), { recursive: true })
writeFileSync(file, stmts.join('\n'))
console.log(`› Wrote ${stmts.length} statements to ${file}`)

console.log('› Loading seed into local D1…')
execSync(`wrangler d1 execute DB --local --file "${file}"`, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CI: '1' } })
const counts = execSync(`wrangler d1 execute DB --local --json --command "SELECT (SELECT count(*) FROM events) AS events, (SELECT count(*) FROM albums) AS albums, (SELECT count(*) FROM photos) AS photos, (SELECT count(*) FROM users) AS users"`, { cwd: root, env: { ...process.env, CI: '1' } }).toString()
console.log('› Row counts:', JSON.stringify(JSON.parse(counts)[0]?.results?.[0] ?? {}))
console.log('✓ Seed loaded. Studio: Northlight Studio (st_northlight). Owner: aarav@northlight.in')
