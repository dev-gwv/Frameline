/**
 * Product feature flags. Switching a flag off hides the feature in every app; its code, API routes and tables
 * stay in place so it can come back by flipping the flag.
 */
export interface Features {
  /** Website builder, custom domain and the Enquiries inbox (admin), plus the guest "Enquire" entry points that feed it. */
  website: boolean
}

export const FEATURES: Readonly<Features> = {
  website: false,
}
