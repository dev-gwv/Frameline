/**
 * Product feature flags. Switching a flag off hides the feature in every app; its code, API routes and tables
 * stay in place so it can come back by flipping the flag.
 *
 * Off until the thing behind it is real -- each of these looked finished and did nothing, or worse:
 * - driveImport: made photo rows with no file (`DRV_*.JPG`) that used up the plan's quota.
 * - aiEnhance: took ₹8 from the wallet; the processor has no enhance step.
 * - cameraSync: issued FTP logins for an FTP server that doesn't exist.
 * - broadcasts: marked messages "sent"; nothing was delivered.
 */
export interface Features {
  /** Website builder, custom domain and the Enquiries inbox (admin), plus the guest "Enquire" entry points that feed it. */
  website: boolean
  driveImport: boolean
  aiEnhance: boolean
  cameraSync: boolean
  broadcasts: boolean
}

export const FEATURES: Readonly<Features> = {
  website: false,
  driveImport: false,
  aiEnhance: false,
  cameraSync: false,
  broadcasts: false,
}
