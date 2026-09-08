/**
 * Mobile-side entry point for AI risk analysis.
 *
 * The real analysis lives on the server (`@coalguard/ai`), reached through the
 * secure web route `POST /api/ai/classify-risk`. The mobile app NEVER holds an
 * AI provider key.
 *
 * Order of preference:
 *   1. Call the web route with the user's Supabase access token.
 *   2. If the route is not configured, unreachable, slow or errors, fall back to
 *      the shared on-device keyword heuristic.
 *
 * Both paths return a `source` so the UI can be honest about where the result
 * came from. `simulated` is true whenever a real model was not used.
 */
import { localRiskHeuristic } from '@coalguard/ai/heuristic';
import type { RiskClassificationInput, RiskClassificationResult } from '@coalguard/ai/types';
import { env, isWebApiConfigured } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export interface RiskAnalysis extends RiskClassificationResult {
  /** where the result was produced */
  source: 'server' | 'on-device';
  provider?: string;
  model?: string;
}

const TIMEOUT_MS = 12_000;

export async function classifyRisk(input: RiskClassificationInput): Promise<RiskAnalysis> {
  if (isWebApiConfigured) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('no session');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(`${env.webApiUrl}/api/ai/classify-risk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) throw new Error(`server ${res.status}`);
      const json = (await res.json()) as RiskClassificationResult & {
        provider?: string;
        model?: string;
      };
      return { ...json, source: 'server' };
    } catch {
      // fall through to the on-device heuristic
    }
  }

  return { ...localRiskHeuristic(input), source: 'on-device' };
}
