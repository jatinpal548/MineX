/**
 * Observation-level analysis built on top of the pure risk heuristic.
 *
 * `localRiskHeuristic` gives a risk band + generic recommendations. Field and
 * command users also want two things stated plainly:
 *   - the LIKELY CONSEQUENCE if the hazard is left unaddressed
 *   - a single RECOMMENDED ACTION (the most important next step)
 *
 * This module derives both from the same keyword signal, so it stays
 * dependency-free and safe to bundle into the mobile app. Everything it returns
 * is flagged `simulated: true` - it is never presented as a real model.
 */

import type { RiskClassificationInput, RiskClassificationResult } from './types';
import { localRiskHeuristic } from './heuristic';

export interface ObservationAnalysis extends RiskClassificationResult {
  /** One sentence: what happens if this is not acted on. */
  consequence: string;
  /** One imperative sentence: the single most important next step. */
  recommendedAction: string;
}

type Band = RiskClassificationResult['risk'];

interface Signature {
  test: RegExp;
  consequence: string;
  recommendedAction: string;
}

/**
 * Hazard families we can speak to specifically. Checked in order; the first
 * match wins. Falls back to the generic band text below.
 */
const SIGNATURES: Signature[] = [
  {
    test: /(tension crack|slope failure|highwall|overhang|loose boulder|bench|batter|spoil dump|slip circle)/i,
    consequence:
      'Progressive slope failure could bury the bench or haul road below and trap personnel and equipment.',
    recommendedAction:
      'Barricade the crest and the bench below, stop work in the run-out zone, and arrange controlled scaling with a geotechnical review.',
  },
  {
    test: /(ht panel|lt panel|interlock|earthing|live (wire|cable)|exposed (cable|conductor)|switchgear|substation|electrocut|shock)/i,
    consequence:
      'A worker could receive a fatal electric shock during switching or maintenance while the protection is defeated.',
    recommendedAction:
      'Isolate and lock out the affected panel, restore the interlock and earthing, and display the statutory danger and shock-treatment boards before re-energising.',
  },
  {
    test: /(methane|gas\b|inrush|inundation|water accumulation|firedamp|black damp)/i,
    consequence:
      'An ignition or sudden inrush in the affected area could cause an explosion or engulfment with multiple casualties.',
    recommendedAction:
      'Withdraw personnel from the affected district, increase monitoring and ventilation, and do not restore work until readings are within statutory limits.',
  },
  {
    test: /(brake fail|reverse alarm|seatbelt|runaway|haul road|berm|dumper|hemm|tyre|operator cabin)/i,
    consequence:
      'A vehicle could run away or collide on the haul road, injuring the operator or nearby workers.',
    recommendedAction:
      'Withdraw the machine from service, tag it out, and return it only after the defect is repaired and re-checked by the workshop.',
  },
  {
    test: /(ppe|helmet|glove|safety shoe|hi-viz|goggles|ear ?plug|respirator|dust mask)/i,
    consequence:
      'Repeated exposure without protection raises the chance of a head, hand or respiratory injury during routine work.',
    recommendedAction:
      'Stop the activity until the correct PPE is worn, and reinforce the requirement at the next toolbox talk.',
  },
  {
    test: /(first[- ]?aid|rescue|stretcher|emergency|assembly point|fire extinguisher|hydrant)/i,
    consequence:
      'A delayed or disorganised response to an incident could turn a survivable injury into a fatality.',
    recommendedAction:
      'Restore the emergency provision immediately and verify the response plan and contact list are current and displayed.',
  },
];

const BAND_CONSEQUENCE: Record<Band, string> = {
  critical:
    'If left unaddressed this hazard is likely to cause a fatal or disabling injury in the near term.',
  high: 'If left unaddressed this hazard is likely to cause a serious injury or significant loss.',
  medium:
    'If left unaddressed this hazard could cause a minor injury or escalate into a more serious condition.',
  low: 'This is a housekeeping-level issue with limited injury potential, but it should be tracked for trend.',
};

const BAND_ACTION: Record<Band, string> = {
  critical:
    'Stop the activity, make the area safe now, notify the mine manager and safety officer, and raise a critical corrective action with a same-day due date.',
  high: 'Isolate or barricade the hazard, restrict access, and raise a high-priority corrective action with a named owner and a short due date.',
  medium:
    'Log the observation, assign a corrective action owner, and verify the fix on the next scheduled inspection.',
  low: 'Record for trend tracking and raise at the next toolbox talk if it recurs.',
};

/**
 * Full observation analysis: risk band + rationale + recommendations from the
 * shared heuristic, plus a specific consequence and single recommended action.
 */
export function analyzeObservation(input: RiskClassificationInput): ObservationAnalysis {
  const base = localRiskHeuristic(input);
  const haystack = [input.title, input.description, input.category, input.context]
    .filter(Boolean)
    .join(' ');

  const sig = SIGNATURES.find((s) => s.test.test(haystack));

  return {
    ...base,
    consequence: sig?.consequence ?? BAND_CONSEQUENCE[base.risk],
    recommendedAction: sig?.recommendedAction ?? BAND_ACTION[base.risk],
  };
}
