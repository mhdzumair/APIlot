// OpenRouter Provider — proxies to any model via the OpenRouter API
import { BaseProvider } from './BaseProvider.js';
import type { AIProvider, MockRequest, MockOptions, MockResult, MultiMockResult } from './index.js';

export class OpenRouterProvider extends BaseProvider implements AIProvider {
  protected model: string = 'anthropic/claude-sonnet-4-5';
  private readonly baseUrl: string = 'https://openrouter.ai/api/v1';

  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  async testConnection(): Promise<boolean> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const referer =
      typeof window !== 'undefined' ? window.location.origin : 'https://apilot.extension';

    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': referer,
        'X-Title': 'APIlot',
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    return true;
  }

  async generateMock(request: MockRequest, options: MockOptions = {}): Promise<MockResult> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const prompt = this.buildMockPrompt(request, options);
    const referer =
      typeof window !== 'undefined' ? window.location.origin : 'https://apilot.extension';

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': referer,
        'X-Title': 'APIlot',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert at generating realistic mock data for APIs. Always return valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `OpenRouter API error: ${response.status}`);
    }

    const result = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens?: number };
    };
    const content = result.choices[0].message.content;

    return {
      data: this.parseJSONResponse(content),
      tokensUsed: result.usage?.total_tokens ?? 0,
    };
  }

  async generateMultipleMocks(requests: MockRequest[], options: MockOptions = {}): Promise<MultiMockResult> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const prompt = this.buildMultiMockPrompt(requests, options);
    const referer =
      typeof window !== 'undefined' ? window.location.origin : 'https://apilot.extension';

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': referer,
        'X-Title': 'APIlot',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert at generating realistic mock data for APIs. Generate consistent data across requests. Always return valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `OpenRouter API error: ${response.status}`);
    }

    const result = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens?: number };
    };
    const content = result.choices[0].message.content;
    const parsed = this.parseJSONResponse(content) as { mocks?: unknown[] };

    return {
      data: parsed,
      mocks: parsed.mocks ?? [parsed],
      tokensUsed: result.usage?.total_tokens ?? 0,
    };
  }
}
