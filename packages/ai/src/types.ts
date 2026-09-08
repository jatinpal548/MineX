/**
 * Provider-agnostic AI contracts for CoalGuard.
 *
 * Nothing in the apps talks to an LLM vendor directly. They call these
 * interfaces; a concrete provider is chosen at runtime from environment
 * variables (see ./index.ts). This keeps API keys server-side and lets us swap
 * the free-tier provider later without touching feature code.
 */

import type { RiskLevel } from '@coalguard/types';

export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  /** 0 = deterministic. Default 0.2. */
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider to return strict JSON when supported. */
  json?: boolean;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LlmCompletionResponse {
  text: string;
  model: string;
  usage?: LlmUsage;
  raw?: unknown;
}

/**
 * The one interface every LLM provider must implement.
 * Add streaming / embeddings here later if a feature needs them.
 */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}

/* ----------------------- higher-level task contracts --------------------- */

export interface RiskClassificationInput {
  title: string;
  description?: string | null;
  category?: string | null;
  mineType?: string | null;
  context?: string | null;
}

export interface RiskClassificationResult {
  risk: RiskLevel;
  confidence: number; // 0..1
  rationale: string;
  recommendations: string[];
  /** Free-tier friendly: whether this came from a real model or the mock. */
  simulated: boolean;
}

/** OCR is kept as its own tiny contract so it can be a different vendor. */
export interface OcrProvider {
  readonly name: string;
  extractText(input: { storagePath?: string; bytes?: Uint8Array; mimeType?: string }): Promise<{
    text: string;
    confidence: number;
    simulated: boolean;
  }>;
}
