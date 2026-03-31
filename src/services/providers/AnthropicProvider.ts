// Anthropic Provider — supports standard and extended-thinking models
import { BaseProvider } from './BaseProvider.js';
import type { AIProvider, MockRequest, MockOptions, MockResult, MultiMockResult } from './index.js';

interface AnthropicSettings {
  maxTokens: number;
  thinkingBudget: number;
}

export class AnthropicProvider extends BaseProvider implements AIProvider {
  protected model: string = 'claude-sonnet-4-20250514';
  private readonly baseUrl: string = 'https://api.anthropic.com/v1';
  private readonly anthropicVersion: string = '2023-06-01';
  private settings: AnthropicSettings = {
    maxTokens: 4000,
    thinkingBudget: 2000,
  };

  configure(settings: Partial<AnthropicSettings>): void {
    if (settings.maxTokens !== undefined) this.settings.maxTokens = settings.maxTokens;
    if (settings.thinkingBudget !== undefined) this.settings.thinkingBudget = settings.thinkingBudget;
  }

  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  async testConnection(): Promise<boolean> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `Anthropic API error: ${response.status}`);
    }

    return true;
  }

  async generateMock(request: MockRequest, options: MockOptions = {}): Promise<MockResult> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const prompt = this.buildMockPrompt(request, options);
    const isThinkingModel = this.model.includes('thinking');

    const requestBody: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.settings.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    };

    if (!isThinkingModel) {
      requestBody['system'] =
        'You are an expert at generating realistic mock data for APIs. Generate data that looks real and contextually appropriate. Always return valid JSON only, no explanation.';
    }

    if (isThinkingModel) {
      requestBody['thinking'] = {
        type: 'enabled',
        budget_tokens: this.settings.thinkingBudget,
      };
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `Anthropic API error: ${response.status}`);
    }

    const result = await response.json() as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    let content: string;
    if (isThinkingModel && result.content) {
      const textBlock = result.content.find((block) => block.type === 'text');
      content = textBlock?.text ?? result.content[0].text;
    } else {
      content = result.content[0].text;
    }

    return {
      data: this.parseJSONResponse(content),
      tokensUsed: (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0),
    };
  }

  async generateMultipleMocks(requests: MockRequest[], options: MockOptions = {}): Promise<MultiMockResult> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const prompt = this.buildMultiMockPrompt(requests, options);
    const isThinkingModel = this.model.includes('thinking');

    const requestBody: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.settings.maxTokens * 2,
      messages: [{ role: 'user', content: prompt }],
    };

    if (!isThinkingModel) {
      requestBody['system'] =
        'You are an expert at generating realistic mock data for APIs. Generate consistent data across requests. Always return valid JSON only.';
    }

    if (isThinkingModel) {
      requestBody['thinking'] = {
        type: 'enabled',
        budget_tokens: this.settings.thinkingBudget * 2,
      };
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `Anthropic API error: ${response.status}`);
    }

    const result = await response.json() as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    let content: string;
    if (isThinkingModel && result.content) {
      const textBlock = result.content.find((block) => block.type === 'text');
      content = textBlock?.text ?? result.content[0].text;
    } else {
      content = result.content[0].text;
    }

    const parsed = this.parseJSONResponse(content) as { mocks?: unknown[] };

    return {
      data: parsed,
      mocks: parsed.mocks ?? [parsed],
      tokensUsed: (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0),
    };
  }
}
