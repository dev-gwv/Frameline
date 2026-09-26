/*
 * Services and questions shown in the app preview. The API has no endpoint for website
 * services/FAQ yet, so the preview uses this page-local sample content.
 */
export const SERVICES = [
  { name: 'Wedding coverage', price: 'From ₹1,50,000' },
  { name: 'Pre-wedding shoot', price: 'From ₹35,000' },
  { name: 'Family portraits', price: 'From ₹12,000' },
]

export const QUESTIONS = [
  { q: 'How long until we get photos?', a: 'Previews within 48 hours, the full gallery in 3 weeks.' },
  { q: 'Do you travel for weddings?', a: 'Yes, anywhere in India and abroad.' },
  { q: 'Can guests find their own photos?', a: 'Yes, with a selfie in the gallery.' },
  { q: 'Do you deliver prints?', a: 'Prints and albums can be ordered from the gallery.' },
  { q: 'How do we book a date?', a: 'Send an enquiry; we reply the same day.' },
]

export interface AppConfig {
  showServices: boolean
  showQuestions: boolean
  showPrivate: boolean
  featured: string[]
}

export const DEFAULT_CONFIG: AppConfig = {
  showServices: true,
  showQuestions: true,
  showPrivate: false,
  featured: ['ev_riya', 'ev_kapoor', 'ev_marathon', 'ev_portfolio'],
}

/** Nominal follower count until the API exposes followers. */
export const FOLLOWERS = 1920
