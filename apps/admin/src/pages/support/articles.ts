export interface Article { id: string; title: string; answer: string; tags: string[]; video?: { en: string; hi: string } }

const yt = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`Frameline ${q}`)}`

/** Local help articles until help docs are served from the API. */
export const ARTICLES: Article[] = [
  { id: 'face-miss', title: 'Guests say the selfie finds no photos', tags: ['face search', 'guests', 'selfie'],
    answer: 'Face search needs a clear, front-facing selfie in good light. Ask the guest to remove sunglasses and retake it. If photos were uploaded in the last few minutes, indexing may still be running: check the event’s People tab. Face search must be on in Event settings → Privacy.' },
  { id: 'pin', title: 'Change or reset an event PIN', tags: ['pin', 'privacy', 'share'],
    answer: 'Open the event, click Share → Link & access, then Reset PIN. The old PIN stops working immediately; guests already inside stay signed in. Send the new PIN with the Share → Message tab.' },
  { id: 'ftp', title: 'Set up camera FTP (Camera sync)', tags: ['camera', 'ftp', 'live'],
    answer: 'Go to Camera sync → Add camera, pick the event and album, and copy the server, username and password into your camera’s FTP settings (Canon: Network settings → FTP transfer). Use passive mode and port 21. Photos appear in the album within seconds.',
    video: { en: yt('camera FTP setup'), hi: yt('camera FTP setup Hindi') } },
  { id: 'drive', title: 'Google Drive import limits', tags: ['drive', 'import', 'upload'],
    answer: 'You can import up to 5,000 photos or 50 GB per import, from folders you own or that are shared with you. Shortcuts and Google Photos albums aren’t supported; move the files into a normal Drive folder first.' },
  { id: 'refund', title: 'Refund a photo order', tags: ['refund', 'store', 'orders'],
    answer: 'Open Sell photos → Orders, click the order and choose Refund. Say why (the buyer sees it). The money goes back to the buyer in 5–7 days and your share comes out of your wallet.' },
  { id: 'gst', title: 'Get a GST invoice', tags: ['gst', 'invoice', 'billing'],
    answer: 'Add your GSTIN in Settings → Billing and GST. Every plan, pack and wallet top-up then has a tax invoice under Settings → Invoices.' },
  { id: 'watermark', title: 'Watermark missing on downloads', tags: ['watermark', 'downloads'],
    answer: 'Check Watermark (in More) → Apply to. “Guest downloads” must be on for downloads to carry the watermark. Existing photos update within an hour after you change it.' },
  { id: 'expiry', title: 'What happens when an event expires', tags: ['expiry', 'renew', 'plan'],
    answer: 'Guests see an “expired” page but nothing is deleted for 7 days. Renew it from Home (half price from your wallet) or send your client a renewal link so they pay for it.' },
  { id: 'limit', title: 'Increase an event’s photo limit', tags: ['limit', 'pack', 'photos'],
    answer: 'Open Plan and billing → Buy an event pack and pick the event. The extra photos are added straight away and last 12 months.' },
  { id: 'team', title: 'Add a second shooter who can only upload', tags: ['team', 'uploader', 'roles'],
    answer: 'Go to Settings → Team, enter their email and pick Uploader. Uploaders can add photos to events you assign but can’t delete, share or see sales.' },
  { id: 'quickstart', title: 'Quick start: your first event in 5 minutes', tags: ['video', 'tutorial', 'start', 'hindi'],
    answer: 'Create an event, upload photos, then share the link or QR. Watch the walkthrough in English or Hindi.',
    video: { en: yt('quick start'), hi: yt('quick start Hindi') } },
  { id: 'enhance', title: 'AI enhance: fix exposure and skin in one click', tags: ['video', 'tutorial', 'ai', 'enhance'],
    answer: 'Open a photo, click Enhance, pick a template or write a prompt, then compare before and after. Each enhance is paid from your wallet.',
    video: { en: yt('AI enhance'), hi: yt('AI enhance Hindi') } },
]

export const TOPICS: { label: string; query: string }[] = [
  { label: 'Face search misses people', query: 'selfie' },
  { label: 'Change a PIN', query: 'pin' },
  { label: 'Camera FTP setup', query: 'ftp' },
  { label: 'Google Drive import limits', query: 'drive' },
  { label: 'Refund an order', query: 'refund' },
  { label: 'GST invoice', query: 'gst' },
  { label: 'Video tutorials · English / हिन्दी', query: 'video' },
]

export function searchArticles(q: string) {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
  if (!words.length) return ARTICLES.slice(0, 6)
  return ARTICLES
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

export function articleForTopic(topic: string | null): Article | undefined {
  if (!topic) return undefined
  const id = TOPIC_ALIASES[topic] ?? topic
  return ARTICLES.find((a) => a.id === id)
}
