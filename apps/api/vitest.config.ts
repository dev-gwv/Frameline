import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url)))
  return {
    plugins: [
      cloudflareTest({
        main: './src/index.ts',
        remoteBindings: false,
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            ENVIRONMENT: 'test',
            JWT_SECRET: 'test-jwt-secret-0123456789-0123456789-abcdef',
            OTP_PEPPER: 'test-otp-pepper',
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/setup.ts'],
      testTimeout: 30_000,
    },
  }
})
