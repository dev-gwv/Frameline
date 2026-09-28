import type {
  AccessRequest, ActivityItem, Album, Broadcast, Camera, CameraUpload, Enquiry, EventSettings, Film, Guest, LedgerEntry,
  NotificationPrefs, Order, Person, Photo, PhotoEvent, Plan, Purchase, SmartQR, StoreSettings, Studio, TeamMember, Ticket, Tone,
  Usage, WatermarkSettings, Website, ZipRequest,
} from './types'

/** Warm, event-photography palette used as placeholder photos until real files exist. */
export const TONES: Tone[] = [
  { stops: ['#f6b26b', '#c0504d', '#3d1f2b'], angle: 135 },
  { stops: ['#a7c957', '#386641', '#1b2d1f'], angle: 160 },
  { stops: ['#ffd9a0', '#e8906b', '#6b4f7a'], angle: 135 },
  { stops: ['#fff3c4', '#e0a458', '#5b3a29'], angle: 150 },
  { stops: ['#8ec5fc', '#c9b6f2', '#6e6a8e'], angle: 180 },
  { stops: ['#2b2d42', '#5c6378', '#8d99ae'], angle: 135 },
  { stops: ['#ffb4a2', '#b5838d', '#3d2c3e'], angle: 120 },
  { stops: ['#d4a373', '#faedcd', '#606c38'], angle: 135 },
  { stops: ['#e76f51', '#f4a261', '#264653'], angle: 200 },
  { stops: ['#f1faee', '#a8dadc', '#1d3557'], angle: 170 },
  { stops: ['#ff9e7d', '#ffd6a5', '#7b4fa8'], angle: 135 },
  { stops: ['#cdb4db', '#ffafcc', '#6d597a'], angle: 160 },
  { stops: ['#ffe8a3', '#c77d2e', '#2c1a12'], angle: 150 },
  { stops: ['#83c5be', '#2a8a8f', '#006d77'], angle: 120 },
]

export const tone = (i: number): Tone => TONES[((i % TONES.length) + TONES.length) % TONES.length]

/** Small deterministic PRNG so sample data is identical on every device. */
export function rng(seed: number) {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13; x >>>= 0
    x ^= x >> 17
    x ^= x << 5; x >>>= 0
    return x / 4294967296
  }
}

export const PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', pricePerYear: 8490, photos: 50_000, seats: 5 },
  { id: 'studio', name: 'Studio', pricePerYear: 15990, photos: 100_000, seats: 8 },
  { id: 'pro', name: 'Pro', pricePerYear: 38490, photos: 250_000, seats: 15 },
  { id: 'agency', name: 'Agency', pricePerYear: 57990, photos: 500_000, seats: 25 },
]

/** Price for one billing period. Quarterly costs half the yearly price, so yearly saves 50%. */
export const planPrice = (p: Plan, period: 'yearly' | 'quarterly') => (period === 'yearly' ? p.pricePerYear : Math.round((p.pricePerYear / 4) * 2))
export const PERIOD_DAYS = { yearly: 365, quarterly: 91 } as const

/** Base price a client pays to renew one event for a year, before the studio's multiplier. */
export const BASE_RENEWAL = 1000
/** Paying a renewal from the wallet costs half. */
export const RENEWAL_CREDIT_DISCOUNT = 0.5
/** Rupees taken from the wallet per AI-enhanced photo. */
export const ENHANCE_COST = 8
/** Frameline's commission on store sales (the studio keeps the rest). */
export const STORE_COMMISSION = 0.1
/** One-time coupons: code → rupees added to the wallet. */
export const COUPONS: Record<string, number> = { WELCOME500: 500 }

export const PACKS = [
  { photos: 1000, price: 700 },
  { photos: 3000, price: 1350 },
  { photos: 10000, price: 3500 },
]

export const defaultSettings = (over: Partial<EventSettings> = {}): EventSettings => ({
  access: 'link-pin',
  pin: '5211',
  requireRegistration: true,
  skipAppLanding: true,
  faceSearch: true,
  facePrivacy: true,
  anonymousSelfie: false,
  downloads: 'own',
  originalDownloads: false,
  anonymousDownloads: false,
  guestUploads: true,
  guestUploadLimit: 300,
  watermarkGuestUploads: false,
  reviewGuestUploads: true,
  watermarkOff: false,
  showOnWebsite: false,
  allowEnquiries: true,
  storeEnabled: false,
  disabled: false,
  shortLinks: true,
  priceOverrides: {},
  forSaleWatermark: true,
  ...over,
})

export const PRESETS: Record<'private-family' | 'open-corporate' | 'race', { label: string; description: string; settings: Partial<EventSettings> }> = {
  'private-family': {
    label: 'Private family event',
    description: 'Selfie to see your own photos. PIN on. Downloads of own photos only.',
    settings: { access: 'link-pin', facePrivacy: true, downloads: 'own', requireRegistration: true, storeEnabled: false },
  },
  'open-corporate': {
    label: 'Open corporate event',
    description: 'Anyone with the link sees everything. Downloads on.',
    settings: { access: 'link', facePrivacy: false, downloads: 'all', requireRegistration: false, storeEnabled: false },
  },
  race: {
    label: 'Race or sports',
    description: 'Selfie or bib search. Store on with sample prices.',
    settings: { access: 'link', facePrivacy: false, downloads: 'none', requireRegistration: false, storeEnabled: true },
  },
}

export interface SeedState {
  studio: Studio
  storeSettings: StoreSettings
  notificationPrefs: NotificationPrefs
  purchases: Purchase[]
  cameraUploads: CameraUpload[]
  zipRequests: ZipRequest[]
  usage: Usage
  events: PhotoEvent[]
  albums: Album[]
  films: Film[]
  people: Person[]
  guests: Guest[]
  accessRequests: AccessRequest[]
  activity: ActivityItem[]
  orders: Order[]
  ledger: LedgerEntry[]
  cameras: Camera[]
  qrs: SmartQR[]
  broadcasts: Broadcast[]
  tickets: Ticket[]
  team: TeamMember[]
  watermark: WatermarkSettings
  website: Website
  enquiries: Enquiry[]
  prices: { id: string; label: string; detail: string; price: number }[]
}

const iso = (s: string) => new Date(s).toISOString()

export function createSeed(): SeedState {
  const events: PhotoEvent[] = [
    ev('ev_riya', '6402F9F', 'Riya & Kabir Wedding', 'wedding', '2026-09-12', 'Udaipur', 'live', 1248, 2000, [1420, 640, 250], 412, '2027-09-14', [0, 3, 12]),
    ev('ev_mehta', '7A1C0B2', 'Mehta Sangeet Night', 'wedding', '2026-09-20', 'Jaipur', 'live', 412, 2000, [610, 190, 80], 190, '2027-09-20', [2, 6, 10], { storeEnabled: true }),
    ev('ev_tessera', '3F9E21D', 'Tessera Labs Offsite', 'corporate', '2026-09-24', 'Goa', 'uploading', 146, 3000, [90, 20, 10], 12, '2027-09-24', [9, 13, 4], { access: 'link', facePrivacy: false, downloads: 'all', requireRegistration: false }),
    ev('ev_greenfield', 'C0DE417', 'Greenfield School Annual Day', 'school', '2026-09-02', 'Pune', 'expiring', 2096, 3000, [3900, 1100, 402], 1210, '2026-10-02', [7, 1, 3], {}, 'pack'),
    ev('ev_marathon', '91B7F3A', 'Coastal Half Marathon', 'sports', '2026-08-17', 'Mumbai', 'live', 5820, 10000, [8800, 2500, 740], 3302, '2027-08-17', [8, 5, 9], { access: 'link', facePrivacy: false, downloads: 'none', storeEnabled: true, requireRegistration: false }),
    ev('ev_anaya', '5D22E80', 'Anaya’s First Birthday', 'baby', '2026-10-04', 'Bengaluru', 'draft', 0, 2000, [0, 0, 0], 0, '2027-10-04', [11, 2, 10]),
    ev('ev_kapoor', '2A6F1C9', 'Kapoor Engagement', 'engagement', '2026-07-19', 'Delhi', 'archived', 734, 2000, [1200, 360, 120], 540, '2027-07-19', [6, 0, 11]),
    ev('ev_portfolio', 'E4B0937', 'Studio Portfolio 2026', 'other', '2026-01-01', 'Mumbai', 'live', 88, 1000, [500, 100, 40], 0, '2027-01-01', [3, 12, 7], { access: 'link', facePrivacy: false, requireRegistration: false }),
  ]
  events[0].hosts = [
    { id: 'h1', name: 'Priya Rao', email: 'priya.rao@gmail.com', phone: '+91 99870 22113', role: 'client', access: 'full', status: 'accepted', invitedAt: iso('2026-09-10T12:00:00') },
    { id: 'h2', name: 'Aman Rao', email: 'aman.rao@gmail.com', role: 'host', access: 'upload', status: 'invited', invitedAt: iso('2026-09-24T09:30:00') },
  ]

  const albums: Album[] = []
  const albumPlan: Record<string, [string, number][]> = {
    ev_riya: [['Haldi', 312], ['Mehendi', 287], ['Sangeet', 401], ['Wedding', 248]],
    ev_mehta: [['Getting ready', 96], ['Sangeet', 316]],
    ev_tessera: [['Keynote', 88], ['Candids', 58]],
    ev_greenfield: [['Morning assembly', 410], ['Performances', 1210], ['Prize distribution', 476]],
    ev_marathon: [['Start line', 1300], ['On course', 3120], ['Finish', 1400]],
    ev_anaya: [],
    ev_kapoor: [['Ring ceremony', 434], ['Family portraits', 300]],
    ev_portfolio: [['Selects', 88]],
  }
  for (const [eventId, list] of Object.entries(albumPlan)) {
    list.forEach(([name, photoCount], i) => albums.push({ id: `${eventId}_al${i}`, eventId, name, order: i, photoCount, kind: 'album' }))
    albums.push({ id: `${eventId}_guest`, eventId, name: 'Guest uploads', order: 99, photoCount: eventId === 'ev_riya' ? 12 : 0, kind: 'guest' })
  }
  for (const a of albums) {
    const event = events.find((e) => e.id === a.eventId)!
    const ps = generatePhotos(a, event)
    if (ps.length) { a.firstCapture = ps[0].capturedAt; a.lastCapture = ps[ps.length - 1].capturedAt }
  }

  const people: Person[] = [
    { id: 'p_riya', eventId: 'ev_riya', name: 'Riya', photoCount: 214, tone: tone(6) },
    { id: 'p_kabir', eventId: 'ev_riya', name: 'Kabir', photoCount: 198, tone: tone(0) },
    { id: 'p_priya', eventId: 'ev_riya', name: 'Priya Rao', photoCount: 86, tone: tone(10) },
    { id: 'p_g1', eventId: 'ev_riya', photoCount: 38, tone: tone(2) },
    { id: 'p_g2', eventId: 'ev_riya', photoCount: 24, tone: tone(11) },
    { id: 'p_g3', eventId: 'ev_riya', photoCount: 12, tone: tone(4) },
  ]

  const guests: Guest[] = [
    gst('g1', 'Priya Rao', 'priya.rao@gmail.com', '+91 99870 22113', 'client', 86, '2026-09-26T15:48:00'),
    gst('g2', 'Neha Kapoor', 'neha.k@gmail.com', '+91 98190 44102', 'guest', 24, '2026-09-26T14:00:00'),
    gst('g3', 'Aman Rao', 'aman.rao@gmail.com', '+91 98200 11873', 'host', 61, '2026-09-25T20:10:00'),
    gst('g4', 'Dev Malhotra', 'dev.m@outlook.com', '+91 90040 55219', 'guest', 9, '2026-09-24T11:30:00'),
    gst('g5', 'Sara Thomas', 'sara.t@gmail.com', '+91 97690 30114', 'guest', 17, '2026-09-23T19:05:00'),
    gst('g6', 'Ishaan Verma', 'ishaan.v@gmail.com', '+91 99300 77120', 'guest', 0, '2026-09-22T09:12:00'),
  ]

  return {
    studio: {
      id: 'st_northlight', name: 'Northlight Studio', handle: 'northlight', brandColor: '#8C2F39',
      phone: '+91 98200 41177', whatsapp: '+91 98200 41177', email: 'studio@northlight.in', website: 'https://northlight.in', instagram: '@northlight.studio',
      city: 'Mumbai', followCode: 'FA-KCGWHY', about: 'Wedding and event photography from Mumbai, since 2014.',
      studioType: 'wedding', referralSource: 'Instagram',
      services: [
        { id: 'sv1', name: 'Wedding coverage', price: 'From ₹1,50,000', description: '2 photographers, all functions, edited gallery in 3 weeks' },
        { id: 'sv2', name: 'Pre-wedding shoot', price: 'From ₹35,000', description: 'Half day, 2 locations, 60 edited photos' },
        { id: 'sv3', name: 'Events and corporate', price: 'From ₹25,000 / day', description: 'Live gallery with face search for every guest' },
        { id: 'sv4', name: 'Family and baby', price: 'From ₹12,000', description: 'At home or in studio, 40 edited photos' },
      ],
      testimonials: [
        { id: 'tm1', quote: 'Our guests found their photos the same night. Nobody had to ask twice.', name: 'Riya & Kabir', detail: 'Udaipur, 2026' },
        { id: 'tm2', quote: 'Calm, invisible, and the album made my parents cry (the good kind).', name: 'Aditi Kapoor', detail: 'Delhi, 2026' },
      ],
      faq: [
        { id: 'fq1', q: 'How long until we get our photos?', a: 'A preview gallery goes live within 48 hours. The full edited set follows in about 3 weeks.' },
        { id: 'fq2', q: 'Do you travel for weddings?', a: 'Yes, anywhere in India and abroad. Travel and stay are billed at cost.' },
        { id: 'fq3', q: 'Can guests find their own photos?', a: 'Yes. Guests take a selfie in the gallery and see the photos they are in.' },
        { id: 'fq4', q: 'Can guests order prints?', a: 'Yes. Prints can be ordered from the gallery; we print on matte paper and ship in about 5 days.' },
        { id: 'fq5', q: 'How do we book a date?', a: 'Send an enquiry with your date and city. A 30% advance confirms the booking.' },
      ],
      socialLinks: [
        { platform: 'instagram', url: 'https://instagram.com/northlight.studio' },
        { platform: 'youtube', url: 'https://youtube.com/@northlightstudio' },
        { platform: 'whatsapp', url: 'https://wa.me/919820041177' },
      ],
      portfolioLinks: ['https://northlight.in/portfolio'],
      app: { featuredEventIds: ['ev_riya', 'ev_kapoor', 'ev_marathon', 'ev_portfolio'], showServices: true, showFaq: true, showPrivate: false },
      followers: 1920,
    },
    storeSettings: defaultStoreSettings(),
    notificationPrefs: { enquiryEmails: ['studio@northlight.in'], eventExpiry: true, planExpiry: true, weeklySummary: false },
    purchases: [
      { id: 'pu3', at: iso('2026-09-21T11:30:00'), description: '3,000-photo pack', kind: 'pack', amount: 1350, method: 'credits', invoiceNumber: 'FL-2026-0193' },
      { id: 'pu2', at: iso('2026-06-02T10:00:00'), description: 'AI enhance · 40 photos', kind: 'enhance', amount: 320, method: 'credits', invoiceNumber: 'FL-2026-0121' },
      { id: 'pu1', at: iso('2026-03-03T09:00:00'), description: 'Starter plan · yearly', kind: 'plan', amount: 10018.2, method: 'card', invoiceNumber: 'FL-2026-0042' },
    ],
    cameraUploads: cameraUploads(),
    zipRequests: [],
    usage: {
      planId: 'starter', period: 'yearly', validTill: iso('2027-03-03'), photosUsed: 12480, photosLimit: 50000,
      guestReserved: 1200, walletCredits: 1200, renewalMultiplier: 2,
    },
    events,
    albums,
    films: [
      { id: 'f1', eventId: 'ev_riya', name: 'Wedding film (4 min)', url: 'https://youtu.be/dQw4w9WgXcQ' },
      { id: 'f2', eventId: 'ev_riya', name: 'Sangeet highlights', url: 'https://youtu.be/9bZkp7q19f0' },
    ],
    people,
    guests,
    accessRequests: [
      { id: 'ar1', eventId: 'ev_riya', name: 'Rohan Mehta', email: 'rohan.m@gmail.com', note: 'Wants full access as the couple’s cousin', createdAt: iso('2026-09-26T10:00:00') },
      { id: 'ar2', eventId: 'ev_riya', name: 'Studio Lumen', email: 'hello@lumen.in', note: 'Second shooter, wants to upload', createdAt: iso('2026-09-25T18:30:00') },
    ],
    activity: [
      { id: 'a1', kind: 'face', title: 'Priya S. found 24 photos of herself', detail: 'Riya & Kabir', at: iso('2026-09-26T17:56:00') },
      { id: 'a2', kind: 'order', title: 'Order #1043 · ₹1,199', detail: 'Mehta Sangeet', at: iso('2026-09-26T17:42:00') },
      { id: 'a3', kind: 'camera', title: 'Canon R6 sent 212 photos', detail: 'Tessera Offsite', at: iso('2026-09-26T17:00:00') },
      { id: 'a4', kind: 'guest-upload', title: '12 guest uploads to review', detail: 'Riya & Kabir', at: iso('2026-09-26T16:00:00') },
      { id: 'a5', kind: 'enquiry', title: 'New enquiry from Anjali Desai', detail: 'Website', at: iso('2026-09-26T13:20:00') },
    ],
    orders: [
      { id: 'o1043', number: 1043, buyer: 'Priya S.', eventId: 'ev_mehta', eventName: 'Mehta Sangeet Night', items: 'All my photos', paid: 1199, currency: 'INR', share: 1079.1, status: 'paid', at: iso('2026-09-26T21:12:00') },
      { id: 'o1042', number: 1042, buyer: 'Arjun K.', eventId: 'ev_marathon', eventName: 'Coastal Half Marathon', items: '3 photos', paid: 447, currency: 'INR', share: 402.3, status: 'paid', at: iso('2026-09-26T18:40:00') },
      { id: 'o1041', number: 1041, buyer: 'Neha R.', eventId: 'ev_riya', eventName: 'Riya & Kabir Wedding', items: 'Print 8×12 ×2', paid: 798, currency: 'INR', share: 718.2, status: 'printing', at: iso('2026-09-25T12:10:00') },
      { id: 'o1040', number: 1040, buyer: 'Dev M.', eventId: 'ev_marathon', eventName: 'Coastal Half Marathon', items: '1 photo', paid: 149, currency: 'INR', share: 134.1, status: 'refunded', at: iso('2026-09-23T16:18:00') },
      { id: 'o1039', number: 1039, buyer: 'John D. (UK)', eventId: 'ev_marathon', eventName: 'Coastal Half Marathon', items: 'Single photo', paid: 12, currency: 'USD', share: 12, status: 'paid-direct', at: iso('2026-09-22T08:05:00') },
      { id: 'o1038', number: 1038, buyer: 'Kavya N.', eventId: 'ev_riya', eventName: 'Riya & Kabir Wedding', items: 'All my photos', paid: 998, currency: 'INR', share: 898.2, status: 'paid', at: iso('2026-09-21T11:30:00') },
      { id: 'o1037', number: 1037, buyer: 'Rahul P.', eventId: 'ev_riya', eventName: 'Riya & Kabir Wedding', items: '1 photo', paid: 149, currency: 'INR', share: 134.1, status: 'pending', at: iso('2026-09-20T21:02:00') },
    ],
    ledger: [
      { id: 'l7', at: iso('2026-09-26T21:12:00'), description: 'Order #1043 · Mehta Sangeet', type: 'sale', amount: 1079.1, balance: 31840 },
      { id: 'l6', at: iso('2026-09-26T18:40:00'), description: 'Order #1042 · Coastal Half Marathon', type: 'sale', amount: 402.3, balance: 30760.9 },
      { id: 'l5', at: iso('2026-09-24T10:00:00'), description: 'Payout to HDFC ••4471', type: 'payout', amount: -18200, balance: 30358.6 },
      { id: 'l4', at: iso('2026-09-23T16:18:00'), description: 'Order #1040 refunded', type: 'refund', amount: -134.1, balance: 48558.6 },
      { id: 'l3', at: iso('2026-09-22T13:05:00'), description: 'Client renewal · Kapoor Engagement (2× price)', type: 'renewal-markup', amount: 600, balance: 48692.7 },
      { id: 'l2', at: iso('2026-09-21T11:30:00'), description: '3,000-photo pack · paid from wallet', type: 'credits-used', amount: -1350, balance: 48092.7 },
      { id: 'l1', at: iso('2026-09-20T21:02:00'), description: 'Order #1037 · Riya & Kabir', type: 'sale', amount: 134.1, balance: 49442.7 },
    ],
    cameras: [
      { id: 'c1', label: 'Canon R6 · Aarav', eventId: 'ev_tessera', albumId: 'ev_tessera_al0', mode: 'live-2k', ftpUser: 'nl_r6_aarav', status: 'receiving', today: 212, lastFile: 'IMG_4172.JPG', lastUploadAt: iso('2026-09-26T16:40:00Z') },
      { id: 'c2', label: 'Sony A7 IV · Meera', eventId: 'ev_tessera', albumId: 'ev_tessera_al1', mode: 'review-first', ftpUser: 'nl_a7_meera', status: 'idle', today: 148, lastFile: 'DSC08812.JPG', lastUploadAt: iso('2026-09-26T15:40:00Z') },
      { id: 'c3', label: 'Nikon Z6 · backup', eventId: 'ev_portfolio', albumId: 'ev_portfolio_al0', mode: 'originals', ftpUser: 'nl_z6_backup', status: 'offline', today: 0 },
    ],
    qrs: [
      { id: 'q1', name: 'Studio front desk', slug: 'desk', eventId: 'ev_riya', target: 'web', scans: 1204, color: '#1B1712' },
      { id: 'q2', name: 'Reception standee', slug: 'stand', eventId: 'ev_tessera', target: 'smart', scans: 318, color: '#8C2F39' },
      { id: 'q3', name: 'Race finish arch', slug: 'finish', eventId: 'ev_marathon', target: 'web', scans: 6870, color: '#1B1712' },
    ],
    broadcasts: [
      { id: 'b1', title: 'New photos: Riya & Kabir', body: 'The wedding album is live.', audience: 'ev_riya', sentAt: iso('2026-09-15T20:00:00'), openRate: 0.62 },
      { id: 'b2', title: 'Sangeet highlights are live', body: 'Watch the 3-minute film.', audience: 'all', sentAt: iso('2026-09-21T19:00:00'), openRate: 0.48 },
      { id: 'b3', title: 'Monsoon offer · 20% off prints', body: 'Until 30 Sep.', audience: 'all', sentAt: iso('2026-08-02T11:00:00'), openRate: 0.21 },
    ],
    tickets: [
      {
        id: 't1', subject: 'Watermark missing on downloads', eventId: 'ev_riya', platform: 'web-gallery', status: 'answered',
        messages: [
          { from: 'me', body: 'Downloads from the web gallery have no watermark.', at: iso('2026-09-24T10:00:00') },
          { from: 'support', body: '"Guest downloads" was off in Watermarks → Apply to. We\'ve switched it on; existing photos update within an hour.', at: iso('2026-09-24T11:20:00') },
        ],
      },
      { id: 't2', subject: 'Payout delayed', platform: 'admin', status: 'waiting', messages: [{ from: 'me', body: 'Tuesday payout has not arrived.', at: iso('2026-09-25T09:00:00') }] },
      { id: 't3', subject: 'Add second FTP camera', platform: 'admin', status: 'closed', messages: [{ from: 'me', body: 'How do I add another camera?', at: iso('2026-09-10T09:00:00') }] },
    ],
    team: [
      { id: 'u1', name: 'Aarav Mehta', email: 'aarav@northlight.in', role: 'owner', access: 'All events, billing, payouts', lastActive: iso('2026-09-26T18:00:00') },
      { id: 'u2', name: 'Meera Iyer', email: 'meera@northlight.in', role: 'editor', access: 'All events', lastActive: iso('2026-09-26T16:00:00') },
      { id: 'u3', name: 'Kunal Shah', email: 'kunal.shah@gmail.com', role: 'uploader', access: 'Tessera Labs Offsite only', lastActive: iso('2026-09-25T12:00:00') },
    ],
    watermark: {
      mode: 'text', text: 'Northlight Studio', subtitle: '', position: 'br', size: 'normal', opacity: 70, font: 'Fraunces',
      applyTo: { previews: true, downloads: true, guestUploads: false, originals: false }, edgeOffset: 3,
    },
    website: {
      published: false, template: 'editorial', headline: 'Weddings photographed like films.',
      sections: [
        { id: 'cover', label: 'Cover', enabled: true }, { id: 'about', label: 'About', enabled: true },
        { id: 'galleries', label: 'Galleries', enabled: true }, { id: 'services', label: 'Services', enabled: true },
        { id: 'testimonials', label: 'Testimonials', enabled: true }, { id: 'faq', label: 'Questions', enabled: false },
        { id: 'contact', label: 'Contact', enabled: true }, { id: 'location', label: 'Location', enabled: false },
        { id: 'social', label: 'Social', enabled: true },
      ],
    },
    enquiries: [
      { id: 'e1', status: 'new', name: 'Anjali Desai', phone: '+91 98331 20455', email: 'anjali.d@gmail.com', message: 'Looking for wedding coverage on 14 Feb 2027 in Goa, about 250 guests.', source: 'Website', at: iso('2026-09-26T13:20:00') },
      { id: 'e2', status: 'replied', name: 'Farhan Ali', phone: '+91 99200 18833', email: 'farhan@alico.in', message: 'Corporate offsite, 2 days in November.', source: 'Riya & Kabir gallery', at: iso('2026-09-24T17:45:00'), note: 'Sent quote' },
      { id: 'e3', status: 'new', name: 'Meenal Joshi', phone: '+91 97022 61190', email: 'meenal.j@gmail.com', message: 'Baby shoot for my daughter, 6 months.', source: 'Website', at: iso('2026-09-22T10:05:00') },
      { id: 'e4', status: 'new', name: 'Tarun Bhatia', phone: '+91 98670 44100', email: 'tarun.b@gmail.com', message: 'Pre-wedding shoot in Udaipur?', source: 'Studio app', at: iso('2026-09-20T21:40:00') },
    ],
    prices: [
      { id: 'single', label: 'Single photo', detail: 'Full resolution', price: 149 },
      { id: 'multi', label: 'Multiple photos', detail: 'Each, from 3 photos', price: 129 },
      { id: 'all', label: 'All my photos', detail: 'Everything the guest is in', price: 999 },
      { id: 'print812', label: 'Print 8×12 in', detail: 'Matte, 5 days', price: 399 },
    ],
  }
}

function ev(
  id: string, shortId: string, name: string, type: PhotoEvent['type'], date: string, city: string, status: PhotoEvent['status'],
  photoCount: number, photoLimit: number, v: [number, number, number], faceMatches: number, expires: string, tones: [number, number, number],
  settings: Partial<EventSettings> = {}, plan: PhotoEvent['plan'] = 'subscription',
): PhotoEvent {
  return {
    id, shortId, name, type, date: iso(date), city, status, photoCount, photoLimit,
    visits: { web: v[0], android: v[1], ios: v[2] }, faceMatches, expiresAt: iso(expires),
    createdAt: iso(date), coverTones: [tone(tones[0]), tone(tones[1]), tone(tones[2])],
    settings: defaultSettings(settings), hosts: [], highlights: true, plan,
  }
}

function gst(id: string, name: string, email: string, phone: string, role: Guest['role'], favs: number, last: string): Guest {
  return {
    id, eventId: 'ev_riya', name, email, phone, role,
    favourites: Array.from({ length: favs }, (_, i) => `ev_riya_al${i % 4}_p${(i * 7) % 240}`),
    lastActive: iso(last), registeredAt: iso('2026-09-15T12:00:00'),
  }
}

const CAMERAS = [
  { camera: 'Canon EOS R6', lens: 'RF 35mm F1.8 Macro IS STM' },
  { camera: 'Sony A7 IV', lens: 'FE 85mm F1.8' },
  { camera: 'Canon EOS R6', lens: 'RF 70-200mm F2.8L IS USM' },
  { camera: 'Nikon Z6 II', lens: 'NIKKOR Z 24-70mm f/4 S' },
]
const EXPOSURES = ['1/200 s · f/2.2 · ISO 800', '1/160 s · f/1.8 · ISO 1600', '1/500 s · f/4 · ISO 200', '1/250 s · f/2.8 · ISO 640']
const SHOOTERS = ['Aarav', 'Meera', 'Kunal']

/** Deterministically generate the photos of one album. */
export function generatePhotos(album: Album, event: PhotoEvent): Photo[] {
  if (album.kind === 'guest' && album.photoCount === 0) return []
  const r = rng(hash(album.id))
  const start = new Date(event.date).getTime() + album.order * 86_400_000 * 0.9 + 11 * 3_600_000
  const out: Photo[] = []
  for (let i = 0; i < album.photoCount; i++) {
    const cam = CAMERAS[Math.floor(r() * CAMERAS.length)]
    const faces = event.settings.faceSearch ? Math.floor(r() * 4) : 0
    const portrait = r() < 0.3
    const favourites = Math.floor(r() * r() * 30)
    const downloads = Math.floor(r() * 60)
    out.push({
      id: `${album.id}_p${i}`,
      eventId: event.id,
      albumId: album.id,
      filename: album.kind === 'guest' ? `guest_${1000 + i}.jpg` : `IMG_${String(4100 + i * 3 + album.order * 700).padStart(4, '0')}.JPG`,
      index: i + 1,
      capturedAt: new Date(start + i * 41_000 + Math.floor(r() * 30_000)).toISOString(),
      tone: tone(Math.floor(r() * 1000)),
      status: 'ready',
      hidden: r() < 0.02,
      favourites,
      downloads,
      // Guests open a photo more often than they download or heart it.
      views: downloads * 9 + favourites * 14 + (hash(`${album.id}:${i}`) % 40),
      quality: 'web',
      rotation: 0,
      faces: Array.from({ length: faces }, (_, k) => ({
        personId: ['p_riya', 'p_kabir', 'p_priya', 'p_g1', 'p_g2', 'p_g3'][Math.floor(r() * 6)],
        box: [0.2 + k * 0.22, 0.2 + r() * 0.1, 0.1, 0.16] as [number, number, number, number],
      })),
      exif: {
        camera: album.kind === 'guest' ? 'iPhone 15' : cam.camera,
        lens: album.kind === 'guest' ? undefined : cam.lens,
        exposure: EXPOSURES[Math.floor(r() * EXPOSURES.length)],
        width: portrait ? 4000 : 6000,
        height: portrait ? 6000 : 4000,
        sizeBytes: Math.floor(9_000_000 + r() * 4_000_000),
      },
      uploadedBy: album.kind === 'guest' ? 'Guest' : SHOOTERS[Math.floor(r() * SHOOTERS.length)],
      source: album.kind === 'guest' ? 'guest' : r() < 0.3 ? 'camera' : 'web',
      ...(album.kind === 'guest' ? { reviewStatus: i < 5 ? 'pending' as const : 'approved' as const } : {}),
    })
  }
  return out
}

export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export const DEFAULT_STORE_TERMS = `Photo-selling terms

1. What you buy. Digital downloads are full-resolution JPG files for personal use: sharing with family and friends and posting on social media with credit to the studio. Commercial use (ads, resale, publications) needs written permission from the studio.

2. Delivery. Downloads are available right after payment and stay in your account for 12 months. Prints ship within 5 working days of payment.

3. Refunds. You can ask for a refund within 3 days of purchase if a download is broken or a print arrives damaged. Refunds go back to the original payment method within 7 working days.

4. Watermarks. Preview photos carry a watermark. Purchased photos are delivered without it.

5. Privacy. Your email and phone number are used only to deliver your order and send its receipt.

6. Contact. Questions about an order go to the studio first; you can also reach Frameline support from your receipt.`

export function defaultStoreSettings(): StoreSettings {
  return {
    kyc: {
      legalName: 'Northlight Studio LLP', pan: 'AAKFN4521Q', gstRegistered: true, gstin: '27AAKFN4521Q1Z8',
      address: { street: '14 Hill Road, Bandra West', city: 'Mumbai', state: 'Maharashtra', postal: '400050' },
      documents: [
        { kind: 'pan', status: 'verified', fileName: 'pan-card.pdf' },
        { kind: 'id', status: 'verified', fileName: 'aadhaar.jpg' },
        { kind: 'gst', status: 'review', fileName: 'gst-cert.pdf' },
        { kind: 'cheque', status: 'needed', fileName: '' },
      ],
    },
    payout: { holder: 'Northlight Studio LLP', accountLast4: '4471', ifsc: 'HDFC0001234', bank: 'HDFC Bank', branch: 'Andheri West', verified: true },
    saleWatermark: { template: 'forsale', text: 'FOR SALE · NORTHLIGHT', orientation: 'diagonal', size: 2, opacity: 35, color: '#FFFFFF' },
    international: { enabled: false, plan: 'starter', paymentLink: '', upiQrUrl: '', upiQrName: '', email: 'studio@northlight.in', whatsapp: '+91 98200 41177' },
    terms: DEFAULT_STORE_TERMS,
  }
}

/** Empty studio-level settings for a brand-new studio. */
export function blankStoreSettings(email = ''): StoreSettings {
  return {
    kyc: { legalName: '', pan: '', gstRegistered: false, gstin: '', address: { street: '', city: '', state: '', postal: '' },
      documents: (['pan', 'id', 'gst', 'cheque'] as const).map((kind) => ({ kind, status: 'needed' as const, fileName: '' })) },
    payout: { holder: '', accountLast4: '', ifsc: '', bank: '', branch: '', verified: false },
    saleWatermark: { template: 'forsale', text: 'FOR SALE', orientation: 'diagonal', size: 2, opacity: 35, color: '#FFFFFF' },
    international: { enabled: false, email },
    terms: DEFAULT_STORE_TERMS,
  }
}

function cameraUploads(): CameraUpload[] {
  const out: CameraUpload[] = []
  const base = new Date('2026-09-26T16:40:00Z').getTime()
  for (let i = 0; i < 12; i++) {
    out.push({
      id: `cu1_${i}`, cameraId: 'c1', filename: `IMG_${4172 - i}.JPG`, at: new Date(base - i * 95_000).toISOString(),
      sizeBytes: 9_400_000 + ((i * 7919) % 2_000_000), status: i === 4 ? 'failed' : 'uploaded', ...(i === 4 ? { error: 'Connection dropped; the camera will resend it' } : {}),
    })
  }
  for (let i = 0; i < 6; i++) {
    out.push({ id: `cu2_${i}`, cameraId: 'c2', filename: `DSC0${8812 - i}.JPG`, at: new Date(base - 3_600_000 - i * 140_000).toISOString(), sizeBytes: 11_200_000, status: i === 2 ? 'skipped' : 'uploaded' })
  }
  return out
}
