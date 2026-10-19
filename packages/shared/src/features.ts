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

/**
 * Switches the server sets per deployment, read at run time (GET /v1/meta) so flipping one needs no release.
 * `ai`: face finding and selfie search. Off until the image processor is deployed; while off the server already
 * gives every gallery settings that don't need it (withoutAi), and the apps hide the AI controls.
 */
export interface ServerFeatures {
  ai: boolean
  /** Support's WhatsApp number (SUPPORT_WHATSAPP), when there is one: the Help page shows a chat link. */
  supportWhatsapp?: string
  /** Where Book a call goes (SUPPORT_CALL_URL), when there is one. */
  supportCallUrl?: string
}

/** Sample data (no API URL) shows everything; a server that can't be asked is treated as AI off, the safe side. */
export async function fetchServerFeatures(apiUrl: string | undefined): Promise<ServerFeatures> {
  if (!apiUrl) return { ai: true }
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/meta`)
    const body = (await res.json()) as { features?: Partial<ServerFeatures> }
    const wa = body.features?.supportWhatsapp
    const call = body.features?.supportCallUrl
    return {
      ai: body.features?.ai === true,
      ...(typeof wa === 'string' && wa ? { supportWhatsapp: wa } : {}),
      ...(typeof call === 'string' && /^https:\/\//.test(call) ? { supportCallUrl: call } : {}),
    }
  } catch {
    return { ai: false }
  }
}
