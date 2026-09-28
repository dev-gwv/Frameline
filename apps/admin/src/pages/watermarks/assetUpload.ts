import { useCallback, useState } from 'react'
import { ApiError, ASSET_RULES, type Asset, type AssetKind } from '@frameline/shared'
import { errorMessage, useApi } from '../../lib/api'

/*
 * Page-local copy of pages/wallet/assets.ts (owned by D) for the tools pages. Helper for api.uploadAsset (lib/ is lead-owned).
 * Used by Watermark, Smart QR and Messages. Errors (wrong type 415, too big 413) come back as inline text.
 */

const typeNames = (kind: AssetKind) => ASSET_RULES[kind].types.map((t) => t.split('/')[1].toUpperCase().replace('JPEG', 'JPG')).join(', ')

/** Checks the file against ASSET_RULES before uploading (the server enforces the same). */
export function assetProblem(kind: AssetKind, f: File): string {
  const rule = ASSET_RULES[kind]
  if (!rule.types.includes(f.type)) return `${f.name} isn’t a ${typeNames(kind)} file.`
  if (f.size > rule.maxBytes) return `${f.name} is ${(f.size / 1048576).toFixed(1)} MB. Files can be up to ${Math.round(rule.maxBytes / 1048576)} MB.`
  return ''
}

/** Friendly text for an upload failure, with 413/415 spelled out. */
export function assetErrorMessage(kind: AssetKind, err: unknown): string {
  if (err instanceof ApiError && err.status === 415) return `That file type isn’t supported here. Upload a ${typeNames(kind)} file.`
  if (err instanceof ApiError && err.status === 413) return `That file is too big. Files can be up to ${Math.round(ASSET_RULES[kind].maxBytes / 1048576)} MB.`
  return errorMessage(err)
}

/** Upload one file as an asset; `error` holds the inline message when it fails. */
export function useAssetUpload(kind: AssetKind) {
  const api = useApi()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const upload = useCallback(async (f: File): Promise<Asset | null> => {
    const problem = assetProblem(kind, f)
    if (problem) { setError(problem); return null }
    setError(''); setPending(true)
    try {
      return await api.uploadAsset(kind, { filename: f.name, blob: f, contentType: f.type, size: f.size })
    } catch (err) {
      setError(assetErrorMessage(kind, err))
      return null
    } finally { setPending(false) }
  }, [api, kind])
  return { upload, error, pending, setError }
}

/** `accept` attribute for a file input of this kind. */
export const assetAccept = (kind: AssetKind) => ASSET_RULES[kind].types.join(',')
