import { defineConfig } from 'drizzle-kit'

/** `pnpm db:generate` writes SQL migrations to ./migrations; wrangler applies them to D1. */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
})
