import type {
  AccessRequest, ActivityItem, Album, Broadcast, Camera, Enquiry, Film, Guest, LedgerEntry, Order, Person, Photo,
  PhotoEvent, SmartQR, Studio, Ticket, Usage, Website,
} from '@frameline/shared'
import { toMajor } from '../lib/money'
import type * as s from './schema'

/** Row → contract mappers. `null` columns become omitted optional fields. */
const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v)

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect']

export function studioOut(r: Row<typeof s.studios>): Studio {
  return {
    id: r.id, name: r.name, handle: r.handle, logoUrl: opt(r.logoUrl), brandColor: r.brandColor, phone: r.phone, email: r.email,
    website: opt(r.website), instagram: opt(r.instagram), city: r.city, followCode: r.followCode, about: opt(r.about),
  }
}

export function usageOut(r: Row<typeof s.studios>): Usage {
  return {
    planId: r.planId, period: r.planPeriod, validTill: r.validTill, photosUsed: r.photosUsed, photosLimit: r.photosLimit,
    guestReserved: r.guestReserved, walletCredits: toMajor(r.walletPaise), renewalMultiplier: r.renewalMultiplier,
  }
}

export function eventOut(r: Row<typeof s.events>): PhotoEvent {
  return {
    id: r.id, shortId: r.shortId, name: r.name, type: r.type as PhotoEvent['type'], date: r.date, endDate: opt(r.endDate), city: r.city,
    status: r.status, photoCount: r.photoCount, photoLimit: r.photoLimit, visits: r.visits, faceMatches: r.faceMatches,
    expiresAt: r.expiresAt, createdAt: r.createdAt, coverTones: r.coverTones, settings: r.settings, hosts: r.hosts,
    highlights: r.highlights, plan: r.plan,
  }
}

export function albumOut(r: Row<typeof s.albums>): Album {
  return {
    id: r.id, eventId: r.eventId, name: r.name, order: r.order, photoCount: r.photoCount, kind: r.kind,
    firstCapture: opt(r.firstCapture), lastCapture: opt(r.lastCapture),
  }
}

export function photoOut(r: Row<typeof s.photos>, mediaBase?: string): Photo {
  const url = r.url ?? (r.r2Key && r.status === 'ready' ? mediaUrl(r.r2Key, mediaBase) : undefined)
  return {
    id: r.id, eventId: r.eventId, albumId: r.albumId, filename: r.filename, index: r.index, capturedAt: r.capturedAt, tone: r.tone,
    url, status: r.status, hidden: r.hidden, favourites: r.favourites, downloads: r.downloads, faces: r.faces, exif: r.exif,
    uploadedBy: r.uploadedBy, source: r.source,
  }
}

/** Public URL for an R2 object: CDN base in production, the Worker's /v1/media route in dev. */
export function mediaUrl(key: string, base?: string): string {
  const path = key.split('/').map(encodeURIComponent).join('/')
  return base ? `${base.replace(/\/$/, '')}/${path}` : `/v1/media/${path}`
}

export const personOut = (r: Row<typeof s.people>): Person => ({ id: r.id, eventId: r.eventId, name: opt(r.name), photoCount: r.photoCount, tone: r.tone })
export const filmOut = (r: Row<typeof s.films>): Film => ({ id: r.id, eventId: r.eventId, name: r.name, url: r.url })
export const guestOut = (r: Row<typeof s.guests>): Guest => ({
  id: r.id, eventId: r.eventId, name: r.name, email: r.email, phone: r.phone, role: r.role, favourites: r.favourites,
  lastActive: r.lastActive, registeredAt: r.registeredAt,
})
export const accessRequestOut = (r: Row<typeof s.accessRequests>): AccessRequest => ({
  id: r.id, eventId: r.eventId, name: r.name, email: r.email, note: r.note, createdAt: r.createdAt,
})
export const activityOut = (r: Row<typeof s.activity>): ActivityItem => ({ id: r.id, kind: r.kind, title: r.title, detail: r.detail, at: r.at })
export const orderOut = (r: Row<typeof s.orders>): Order => ({
  id: r.id, number: r.number, buyer: r.buyer, eventId: r.eventId, eventName: r.eventName, items: r.items,
  paid: toMajor(r.paidPaise), currency: r.currency, share: toMajor(r.sharePaise), status: r.status, at: r.at,
})
export const ledgerOut = (r: Row<typeof s.ledgerEntries>): LedgerEntry => ({
  id: r.id, at: r.at, description: r.description, type: r.type, amount: toMajor(r.amountPaise), balance: toMajor(r.balancePaise),
})
export const priceOut = (r: Row<typeof s.prices>) => ({ id: r.id, label: r.label, detail: r.detail, price: toMajor(r.pricePaise) })
export const cameraOut = (r: Row<typeof s.cameras>): Camera => ({
  id: r.id, label: r.label, eventId: r.eventId, albumId: r.albumId, mode: r.mode, ftpUser: r.ftpUser, status: r.status, today: r.today, lastFile: opt(r.lastFile),
})
export const qrOut = (r: Row<typeof s.smartQrs>): SmartQR => ({ id: r.id, name: r.name, slug: r.slug, eventId: r.eventId, target: r.target, scans: r.scans, color: r.color })
export const broadcastOut = (r: Row<typeof s.broadcasts>): Broadcast => ({
  id: r.id, title: r.title, body: r.body, audience: r.audience, sentAt: opt(r.sentAt), scheduledAt: opt(r.scheduledAt), openRate: opt(r.openRate),
})
export const ticketOut = (r: Row<typeof s.tickets>, msgs: Row<typeof s.ticketMessages>[]): Ticket => ({
  id: r.id, subject: r.subject, eventId: opt(r.eventId), platform: r.platform, status: r.status,
  messages: msgs.map((m) => ({ from: m.from, body: m.body, at: m.at })),
})
export const websiteOut = (r: Row<typeof s.websites>): Website => ({
  published: r.published, template: r.template, headline: r.headline, sections: r.sections, customDomain: opt(r.customDomain),
})
export const enquiryOut = (r: Row<typeof s.enquiries>): Enquiry => ({
  id: r.id, name: r.name, phone: r.phone, email: r.email, message: r.message, source: r.source, at: r.at, note: opt(r.note),
})
