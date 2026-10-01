import { AwsClient } from 'aws4fetch'
import type { ProcessorEnv } from './env.ts'

/** Same R2-over-S3 pattern as apps/api's services/storage.ts — kept deliberately identical. */
export function r2Client(env: ProcessorEnv['r2']) {
  const client = new AwsClient({ accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey, service: 's3', region: 'auto' })
  const base = `https://${env.accountId}.r2.cloudflarestorage.com`
  const objectUrl = (bucket: string, key: string) => `${base}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
  return {
    async getObject(bucket: string, key: string): Promise<ArrayBuffer> {
      const res = await client.fetch(objectUrl(bucket, key))
      if (!res.ok) throw new Error(`R2 GetObject ${bucket}/${key} failed: ${res.status} ${await res.text().catch(() => '')}`)
      return res.arrayBuffer()
    },
    async putObject(bucket: string, key: string, body: Uint8Array, contentType: string): Promise<void> {
      const res = await client.fetch(objectUrl(bucket, key), { method: 'PUT', body, headers: { 'Content-Type': contentType } })
      if (!res.ok) throw new Error(`R2 PutObject ${bucket}/${key} failed: ${res.status} ${await res.text().catch(() => '')}`)
    },
  }
}
