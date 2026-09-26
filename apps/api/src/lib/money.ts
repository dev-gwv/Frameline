/**
 * Money is stored as integer paise (1 INR = 100 paise; USD amounts are stored in cents the same way).
 * The public contract (`@frameline/shared` types) uses major units, so we convert at the edge.
 */
export const toMinor = (major: number): number => Math.round(major * 100)
export const toMajor = (minor: number): number => Math.round(minor) / 100
