/**
 * Entry point for CoalGuard AI services. SERVER-SIDE ONLY.
 *
 * Never import this from client components / the mobile UI. It reads secret
 * environment variables. Feature code should import the high-level helpers
 * (e.g. `classifyRisk`) rather than talking to a provider directly.
 */

import type {
  LlmProvider,
  OcrProvider,
  RiskClassificationInput,
  RiskClassificationResult,
} from './types';
import { MockLlmProvider, MockOcrProvider } from './providers/mock';
import { localRiskHeuristic } from './heuristic';

export * from './types';
export { localRiskHeuristic } from './heuristic';
export { analyzeObservation, type ObservationAnalysis } from './observation';
export {
  getTranscriptionProvider,
  type TranscriptionProvider,
  type TranscriptionInput,
  type TranscriptionResult,
} from './transcription';

/* -------------------------------------------------------------------------- */
/* Provider factory                                                           */
/* -------------------------------------------------------------------------- */

let llmSingleton: LlmProvider | null = null;
let ocrSingleton: OcrProvider | null = null;

/**
 * Pick the LLM provider from env. Phase 0 only ships `mock`.
 * A later phase adds e.g. `case 'groq':` returning a real provider that reads
 * `AI_API_KEY`. The rest of the codebase does not change.
 */
export function getLlmProvider(): LlmProvider {
  if (llmSingleton) return llmSingleton;

  const provider = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();
  switch (provider) {
    case 'mock':
    default:
      llmSingleton = new MockLlmProvider();
      return llmSingleton;
  }
}

export function getOcrProvider(): OcrProvider {
  if (ocrSingleton) return ocrSingleton;

  const provider = (process.env.OCR_PROVIDER ?? 'mock').toLowerCase();
  switch (provider) {
    case 'mock':
    default:
      ocrSingleton = new MockOcrProvider();
      return ocrSingleton;
  }
}

/** For tests. */
export function __resetAiProviders(): void {
  llmSingleton = null;
  ocrSingleton = null;
}

/* -------------------------------------------------------------------------- */
/* High-level tasks (feature code calls these)                                */
/* -------------------------------------------------------------------------- */

const RISK_SYSTEM_PROMPT = `You are a mine-safety risk classifier for Indian coal mines.
Given a field observation, respond with strict JSON:
{ "risk": "low|medium|high|critical", "confidence": 0..1, "rationale": string, "recommendations": string[] }`;

export async function classifyRisk(
  input: RiskClassificationInput,
): Promise<RiskClassificationResult> {
  const llm = getLlmProvider();
  const isMock = llm.name === 'mock';

  const res = await llm.complete({
    json: true,
    temperature: 0,
    messages: [
      { role: 'system', content: RISK_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(input),
      },
    ],
  });

  if (isMock) {
    return localRiskHeuristic(input);
  }

  // Real provider path (Phase 1+): parse res.text as JSON defensively.
  try {
    const parsed = JSON.parse(res.text) as Partial<RiskClassificationResult>;
    return {
      risk: parsed.risk ?? 'medium',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      rationale: parsed.rationale ?? '',
      recommendations: parsed.recommendations ?? [],
      simulated: false,
    };
  } catch {
    return {
      risk: 'medium',
      confidence: 0.2,
      rationale: 'Provider returned non-JSON output; defaulted to medium.',
      recommendations: [],
      simulated: false,
    };
  }
}
