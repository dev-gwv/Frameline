import { useQueries } from '@tanstack/react-query'
import type { ID, Photo } from '@frameline/shared'
import { useApi } from '../../lib/api'

/** Resolve photo ids to photos (key root 'photo' refreshes on live changes). Missing photos are skipped. */
export function usePhotosByIds(ids: ID[], enabled = true) {
  const api = useApi()
  const results = useQueries({
    queries: ids.map((id) => ({ queryKey: ['photo', id], queryFn: () => api.getPhoto(id), enabled, retry: false, staleTime: 60_000 })),
  })
  return {
    photos: results.map((r) => r.data).filter((p): p is Photo => !!p),
    loading: results.some((r) => r.isLoading),
  }
}

/** Real CSV download via Blob + anchor. */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Review state for guest uploads. The Photo model has no "pending review" flag yet, so decisions made
 * here are remembered per event in this browser; hidden/published is written to the API.
 */
const reviewKey = (eventId: ID) => `frameline.guest-review.${eventId}`
export function readReviewed(eventId: ID): Set<ID> {
  try { return new Set(JSON.parse(localStorage.getItem(reviewKey(eventId)) ?? '[]') as ID[]) } catch { return new Set() }
}
export function writeReviewed(eventId: ID, ids: Set<ID>) {
  try { localStorage.setItem(reviewKey(eventId), JSON.stringify([...ids])) } catch { /* storage unavailable */ }
}

export const roleLabel = (role: 'guest' | 'host' | 'client') => (role === 'client' ? 'client · host' : role)
