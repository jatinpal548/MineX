/**
 * Deterministic offline provider used for Phase 0 and for demos with no network.
 * It never calls out anywhere. Results are clearly marked `simulated: true`.
 */

import type {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmProvider,
  OcrProvider,
} from '../types';

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';
  readonly model = 'coalguard-mock-v0';

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const prompt = lastUser?.content ?? '';
    const text = request.json
      ? JSON.stringify({
          note: 'Simulated response from MockLlmProvider',
          echo: prompt.slice(0, 240),
        })
      : `Simulated response from MockLlmProvider.\n\nYou asked: "${prompt.slice(0, 240)}"`;

    return {
      text,
      model: this.model,
      usage: {
        promptTokens: prompt.length,
        completionTokens: text.length,
        totalTokens: prompt.length + text.length,
      },
    };
  }
}

export class MockOcrProvider implements OcrProvider {
  readonly name = 'mock';

  async extractText(): Promise<{ text: string; confidence: number; simulated: boolean }> {
    return {
      text: 'SIMULATED OCR TEXT - replace with a real OCR provider in a later phase.',
      confidence: 0.0,
      simulated: true,
    };
  }
}
