/**
 * Pure, dependency-free risk heuristic.
 *
 * This is the SAME keyword logic the mock LLM provider uses, factored out so it
 * can run in three places without duplication:
 *   - the server `classifyRisk()` mock path (packages/ai/src/index.ts)
 *   - the secure web API route (apps/web/src/app/api/ai/classify-risk)
 *   - the mobile app's OFFLINE fallback, when the API route is unreachable
 *
 * It reads no environment variables and imports nothing runtime-specific, so it
 * is safe to bundle into the React Native app. Results are always flagged
 * `simulated: true` - this is never presented as a real model.
 */

import type { RiskClassificationInput, RiskClassificationResult } from './types';

const CRITICAL =
  /(fatal|fatalit|explos|inrush|entrap|collapse|engulf|asphyxia|electrocut|toxic release|fire\b)/i;
const HIGH =
  /(fall from height|unprotected edge|slope failure|crack|overhang|loose boulder|brake fail|no guard|guard missing|gas\b|methane|live (wire|cable)|exposed (cable|conductor)|overload|struck by|runaway)/i;
const MEDIUM =
  /(ppe|housekeep|signage|first aid|dust|spill|leak|minor|near miss|blocked access|trip hazard)/i;

/** Deterministic keyword-based risk band. */
export function localRiskHeuristic(input: RiskClassificationInput): RiskClassificationResult {
  const haystack = [input.title, input.description, input.category, input.context]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let risk: RiskClassificationResult['risk'] = 'low';
  if (CRITICAL.test(haystack)) risk = 'critical';
  else if (HIGH.test(haystack)) risk = 'high';
  else if (MEDIUM.test(haystack)) risk = 'medium';

  const recommendations: Record<RiskClassificationResult['risk'], string[]> = {
    critical: [
      'Stop the activity and make the area safe immediately.',
      'Notify the mine manager and safety officer now.',
      'Raise a critical corrective action with a same-day due date.',
    ],
    high: [
      'Isolate or barricade the hazard and restrict access.',
      'Raise a high-priority corrective action with a named owner.',
      'Re-inspect before the area or equipment is returned to use.',
    ],
    medium: [
      'Log the observation and assign a corrective action owner.',
      'Attach photo evidence with GPS and timestamp.',
      'Verify the fix on the next scheduled inspection.',
    ],
    low: [
      'Record for trend tracking; no immediate action required.',
      'Mention at the next toolbox talk if it recurs.',
    ],
  };

  return {
    risk,
    confidence: 0.35,
    rationale:
      'Simulated classification from an on-device keyword heuristic - not a real AI model. ' +
      'Matched risk band: ' +
      risk +
      '.',
    recommendations: recommendations[risk],
    simulated: true,
  };
}
