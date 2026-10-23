import { FEATURES, type ServerFeatures } from './features'

/** What a guide needs switched on to be true: a product flag (features.ts) or a server switch (AI, payments, invoices). */
export type ArticleNeeds = 'cameraSync' | 'driveImport' | 'aiEnhance' | 'ai' | 'payments' | 'invoices'
export interface Article { id: string; title: string; answer: string; tags: string[]; video?: { en: string; hi: string }; needs?: ArticleNeeds }

/** The help guides: the studio's Help page and the support assistant (apps/api services/support-ai.ts) read the same ones. */
export const ARTICLES: Article[] = [
  { id: 'face-miss', needs: 'ai', title: 'Guests say the selfie finds no photos', tags: ['face search', 'guests', 'selfie'],
    answer: 'Face search needs a clear, front-facing selfie in good light. Ask the guest to remove sunglasses and retake it. If photos were uploaded in the last few minutes, indexing may still be running: check the event’s People tab. Face search must be on in Event settings → Privacy.' },
  { id: 'pin', title: 'Change or reset an event PIN', tags: ['pin', 'privacy', 'share'],
    answer: 'Open the event and click Share. On the Link tab, under PIN, press New PIN. The old PIN stops working straight away; guests already inside stay signed in. Send the new PIN with Send on WhatsApp or the Message tab. You can also do it in the event’s Settings tab, under Who can open the gallery.' },
  { id: 'ftp', needs: 'cameraSync', title: 'Set up camera FTP (Camera sync)', tags: ['camera', 'ftp', 'live'],
    answer: 'Go to Camera sync → Add camera, pick the event and album, and copy the server, username and password into your camera’s FTP settings (Canon: Network settings → FTP transfer). Use passive mode and port 21. Photos appear in the album within seconds.' },
  { id: 'drive', needs: 'driveImport', title: 'Google Drive import limits', tags: ['drive', 'import', 'upload'],
    answer: 'You can import up to 5,000 photos or 50 GB per import, from folders you own or that are shared with you. Shortcuts and Google Photos albums aren’t supported; move the files into a normal Drive folder first.' },
  { id: 'refund', needs: 'payments', title: 'Refund a photo order', tags: ['refund', 'store', 'orders'],
    answer: 'Open Sell photos → Orders, click the order and choose Refund. Say why (the buyer sees it). The money goes back to the buyer in 5–7 days and your share comes out of your wallet.' },
  { id: 'gst', needs: 'invoices', title: 'Get a GST invoice', tags: ['gst', 'invoice', 'billing'],
    answer: 'Add your GSTIN in Settings → Billing and GST. Every plan, pack and wallet top-up then has a tax invoice under Settings → Invoices.' },
  { id: 'watermark', title: 'Watermark missing on downloads', tags: ['watermark', 'downloads'],
    answer: 'Check Watermark (in More) → Apply to. “Guest downloads” must be on for downloads to carry the watermark. Existing photos update within an hour after you change it.' },
  { id: 'expiry', title: 'What happens when an event expires', tags: ['expiry', 'renew', 'plan'],
    answer: 'Guests see an “expired” page but nothing is deleted for 7 days. Renew it from Home (half price from your wallet) or send your client a renewal link so they pay for it.' },
  { id: 'limit', title: 'Increase an event’s photo limit', tags: ['limit', 'pack', 'photos'],
    answer: 'Open Plan and billing → Buy an event pack and pick the event. The extra photos are added straight away and last 12 months.' },
  { id: 'team', title: 'Add a second shooter who can only upload', tags: ['team', 'uploader', 'roles'],
    answer: 'Go to Settings → Team, enter their email and pick Uploader. Uploaders can add photos to events you assign but can’t delete, share or see sales.' },
  { id: 'quickstart', title: 'Quick start: your first event in 5 minutes', tags: ['tutorial', 'start'],
    answer: 'Create an event, upload photos, then share the link or QR from the event’s Share button.' },
  { id: 'enhance', needs: 'aiEnhance', title: 'AI enhance: fix exposure and skin in one click', tags: ['tutorial', 'ai', 'enhance'],
    answer: 'Open a photo, click Enhance, pick a template or write a prompt, then compare before and after. Each enhance is paid from your wallet.' },
]


/** The guides that are true right now: never one for a switched-off feature. */
export function availableArticles(server: Pick<ServerFeatures, 'ai' | 'payments' | 'seller'>): Article[] {
  const on = (n: ArticleNeeds) => (n === 'ai' ? server.ai : n === 'payments' ? server.payments : n === 'invoices' ? !!server.seller : FEATURES[n])
  return ARTICLES.filter((a) => !a.needs || on(a.needs))
}
