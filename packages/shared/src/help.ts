import { FEATURES, type ServerFeatures } from './features'

/** What a guide needs switched on to be true: a product flag (features.ts) or a server switch (AI, payments, invoices). */
export type ArticleNeeds = 'cameraSync' | 'drive' | 'driveImport' | 'aiEnhance' | 'ai' | 'payments' | 'invoices'
export interface Article { id: string; title: string; answer: string; tags: string[]; video?: { en: string; hi: string }; needs?: ArticleNeeds }

/** The help guides: the studio's Help page and the support assistant (apps/api services/support-ai.ts) read the same ones. */
export const ARTICLES: Article[] = [
  { id: 'face-miss', needs: 'ai', title: 'Guests say the selfie finds no photos', tags: ['face search', 'guests', 'selfie'],
    answer: 'Face search needs a clear, front-facing selfie in good light. Ask the guest to remove sunglasses and retake it. If photos were uploaded in the last few minutes, indexing may still be running: check the event’s People tab. Face search must be on in Event settings → Privacy.' },
  { id: 'pin', title: 'Change or reset an event PIN', tags: ['pin', 'privacy', 'share'],
    answer: 'Open the event and click Share. On the Link tab, under PIN, press New PIN. The old PIN stops working straight away; guests already inside stay signed in. Send the new PIN with Send on WhatsApp or the Message tab. You can also do it in the event’s Settings tab, under Who can open the gallery.' },
  { id: 'ftp', needs: 'cameraSync', title: 'Set up camera FTP (Camera sync)', tags: ['camera', 'ftp', 'live'],
    answer: 'Go to Camera sync → Add camera, pick the event and album, and copy the server, username and password into your camera’s FTP settings (Canon: Network settings → FTP transfer). Use passive mode and port 21. Photos appear in the album within seconds.' },
  { id: 'drive', needs: 'driveImport', title: 'Import photos from Google Drive', tags: ['drive', 'import', 'upload', 'google'],
    answer: 'The studio owner connects Google Drive once, in Settings → Google Drive. Then open the event, choose ⋯ → Import from Google Drive, and pick folders or photos in Google’s window. Each folder becomes an album; you can rename them before importing. JPG, PNG, HEIC and WebP photos up to 200 MB each come in, up to 5,000 per import; RAW files and videos are skipped. Imported photos count against your plan like uploads, and a photo already in the event is skipped. The import carries on if you close the window. If Frameline can’t see inside a folder you picked, open that folder in Google’s window and select the photos themselves. Google Photos albums can’t be picked; put the photos in a Drive folder first.' },
  { id: 'drive-originals', needs: 'drive', title: 'Keep full-size photos in your Google Drive', tags: ['drive', 'storage', 'originals', 'google'],
    answer: 'Connect Google Drive in Settings → Google Drive, then turn on “Keep originals in Google Drive” in an event’s Settings (or for every new event, in Settings → Google Drive). New uploads then go to a Frameline folder in your Drive (Frameline → event → album), and Frameline keeps a 2048 px copy for the gallery. Guests’ full-size downloads come from your Drive. Photos uploaded before stay where they are. If Drive is disconnected or the files are deleted there, guests get the 2048 px copy instead. Deleting a photo in Frameline leaves it in your Drive.' },
  { id: 'refund', needs: 'payments', title: 'Refund a photo order', tags: ['refund', 'store', 'orders'],
    answer: 'Open Sell photos → Orders, click the order and choose Refund. Say why (the buyer sees it). The money goes back to the buyer in 5–7 days and your share comes out of your wallet.' },
  { id: 'gst', needs: 'invoices', title: 'Get a GST invoice', tags: ['gst', 'invoice', 'billing'],
    answer: 'Add your GSTIN in Settings → Billing and GST. Every plan, pack and wallet top-up then has a tax invoice under Settings → Invoices.' },
  { id: 'watermark', title: 'Watermark missing on downloads', tags: ['watermark', 'downloads'],
    answer: 'Check Watermark (in More) → More options → Add it to. “Guest downloads” must be on for downloads to carry the watermark (and “Full-size downloads” when the gallery lets guests save full-size files). A change applies to the next download. Photos shown while guests browse aren’t watermarked.' },
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
export function availableArticles(server: Pick<ServerFeatures, 'ai' | 'payments' | 'seller'> & Partial<Pick<ServerFeatures, 'drive' | 'driveImport'>>): Article[] {
  const on = (n: ArticleNeeds) => (n === 'ai' ? server.ai : n === 'payments' ? server.payments : n === 'invoices' ? !!server.seller
    : n === 'drive' || n === 'driveImport' ? server[n] === true : FEATURES[n])
  return ARTICLES.filter((a) => !a.needs || on(a.needs))
}
