import { serve } from '@hono/node-server'
import { loadEnv } from './env.ts'
import { loadModels } from './faces.ts'
import { buildServer } from './server.ts'

const env = loadEnv()
console.log(JSON.stringify({ level: 'info', msg: 'loading models', dir: env.modelsDir }))
await loadModels(env.modelsDir)
console.log(JSON.stringify({ level: 'info', msg: 'models loaded' }))

const app = buildServer(env)
serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(JSON.stringify({ level: 'info', msg: 'processor listening', port: info.port }))
})
