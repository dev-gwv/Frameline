import { ARTICLES, type Article } from '@frameline/shared'

export type { Article }
/** Quick topics; `article` names the guide a topic needs, so one for a switched-off feature is not offered. */
export const TOPICS: { label: string; query: string; article?: string }[] = [
  { label: 'Face search misses people', query: 'selfie', article: 'face-miss' },
  { label: 'Change a PIN', query: 'pin' },
  { label: 'Camera FTP setup', query: 'ftp', article: 'ftp' },
  { label: 'Google Drive import limits', query: 'drive', article: 'drive' },
  { label: 'Refund an order', query: 'refund' },
  { label: 'GST invoice', query: 'gst' },
  { label: 'Video tutorials · English / हिन्दी', query: 'video' },
]

/** Guides matching a search, among `list` (availableArticles: only features that are switched on). */
export function searchArticles(q: string, list: Article[] = ARTICLES) {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
  if (!words.length) return list.slice(0, 6)
  return list
    .map((a) => {
      const hay = `${a.title} ${a.answer} ${a.tags.join(' ')}`.toLowerCase()
      const score = words.reduce((s, w) => s + (a.tags.some((t) => t.includes(w)) ? 3 : 0) + (a.title.toLowerCase().includes(w) ? 2 : 0) + (hay.includes(w) ? 1 : 0), 0)
      return { a, score }
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a)
}

/** Deep-link topics other screens use (e.g. /support?topic=google-drive-import) → article id. */
const TOPIC_ALIASES: Record<string, string> = {
  'google-drive-import': 'drive', 'camera-ftp': 'ftp', 'face-search': 'face-miss', 'event-expiry': 'expiry', 'gst-invoice': 'gst', refunds: 'refund',
}

export function articleForTopic(topic: string | null, list: Article[] = ARTICLES): Article | undefined {
  if (!topic) return undefined
  const id = TOPIC_ALIASES[topic] ?? topic
  return list.find((a) => a.id === id)
}
