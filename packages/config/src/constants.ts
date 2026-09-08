/** Small app-wide constants that both apps and the backend agree on. */

// User-facing product brand. Internal identifiers (packages, @coalguard/*,
// Supabase objects, AI provider ids) intentionally keep the CoalGuard name.
export const APP_NAME = 'MineX';
export const APP_TAGLINE = 'Field-to-boardroom compliance intelligence';

/** Supabase Storage bucket names. Created manually - see docs/SETUP.md. */
export const STORAGE_BUCKETS = {
  /** Inspection / observation / incident evidence (photos, video, voice). */
  evidence: 'evidence',
  /** Compliance PDFs and statutory documents. */
  documents: 'documents',
  /** Profile pictures. */
  avatars: 'avatars',
} as const;

/** Label required by the brief for any non-real evidence. */
export const SIMULATED_EVIDENCE_LABEL = 'SIMULATED FIELD EVIDENCE';

/** Name of the offline outbox table kept on the device (mobile only). */
export const OFFLINE_QUEUE_TABLE = 'sync_outbox';

/** Risk band -> design-system status colour token (see @coalguard/ui). */
export const RISK_COLOR_TOKEN = {
  low: 'safe',
  medium: 'warning',
  high: 'highRisk',
  critical: 'critical',
} as const;

export const DEFAULT_PAGE_SIZE = 25;
