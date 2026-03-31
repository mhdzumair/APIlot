// Google Gemini Provider — uses x-goog-api-key header, supports thinking models
import { BaseProvider } from './BaseProvider.js';
import type { AIProvider, MockRequest, MockOptions, MockResult, MultiMockResult } from './index.js';

interface GeminiSettings {
  temperature: number;
  maxOutputTokens: number;
  thinkingBudget: number;
}

export class GeminiProvider extends BaseProvider implements AIProvider {
  protected model: string = 'gemini-2.5-flash';
  private readonly baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta';
  private settings: GeminiSettings = {
    temperature: 0.7,
    maxOutputTokens: 4000,
    thinkingBudget: 2000,
  };

  configure(settings: Partial<GeminiSettings>): void {
    if (settings.temperature !== undefined) this.settings.temperature = settings.temperature;
    if (settings.maxOutputTokens !== undefined) this.settings.maxOutputTokens = settings.maxOutputTokens;
    if (settings.thinkingBudget !== undefined) this.settings.thinkingBudget = settings.thinkingBudget;
  }

  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  async testConnection(): Promise<boolean> {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/models`, {
      headers: { 'x-goog-api-key': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    return true;
  }

  async generateMock(request: MockRequest, options: MockOptions = {}): Promise<MockResult> {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const prompt = this.buildMockPrompt(request, options);
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const isThinkingModel = this.model.includes('thinking');

    const requestBody: Record<string, unknown> = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    if (!isThinkingModel) {
      requestBody['generationConfig'] = {
        temperature: this.settings.temperature,
        maxOutputTokens: this.settings.maxOutputTokens,
      };
      requestBody['systemInstruction'] = {
        parts: [
          {
            text: 'You are an expert at generating realistic mock data for APIs. Generate data that looks real and contextually appropriate. Always return valid JSON only, no explanation.',
          },
        ],
      };
    } else {
      requestBody['generationConfig'] = {
        maxOutputTokens: this.settings.maxOutputTokens,
        thinkingConfig: {
          thinkingBudget: this.settings.thinkingBudget,
        },
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `Gemini API error: ${response.status}`);
    }

    const result = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      usageMetadata?: { totalTokenCount?: number };
    };
    const content = result.candidates[0].content.parts[0].text;

    return {
      data: this.parseJSONResponse(content),
      tokensUsed: result.usageMetadata?.totalTokenCount ?? 0,
    };
  }

  async generateMultipleMocks(requests: MockRequest[], options: MockOptions = {}): Promise<MultiMockResult> {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const prompt = this.buildMultiMockPrompt(requests, options);
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const isThinkingModel = this.model.includes('thinking');

    const requestBody: Record<string, unknown> = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    if (!isThinkingModel) {
      requestBody['generationConfig'] = {
        temperature: this.settings.temperature,
        maxOutputTokens: this.settings.maxOutputTokens * 2,
      };
      requestBody['systemInstruction'] = {
        parts: [
          {
            text: 'You are an expert at generating realistic mock data for APIs. Generate consistent data across requests. Always return valid JSON only.',
          },
        ],
      };
    } else {
      requestBody['generationConfig'] = {
        maxOutputTokens: this.settings.maxOutputTokens * 2,
        thinkingConfig: {
          thinkingBudget: this.settings.thinkingBudget * 2,
        },
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `Gemini API error: ${response.status}`);
    }

    const result = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      usageMetadata?: { totalTokenCount?: number };
    };
    const content = result.candidates[0].content.parts[0].text;
    const parsed = this.parseJSONResponse(content) as { mocks?: unknown[] };

    return {
      data: parsed,
      mocks: parsed.mocks ?? [parsed],
      tokensUsed: result.usageMetadata?.totalTokenCount ?? 0,
    };
  }
}
