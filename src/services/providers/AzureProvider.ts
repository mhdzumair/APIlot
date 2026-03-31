// Azure OpenAI Provider — uses the responses endpoint with Bearer auth
import { BaseProvider } from './BaseProvider.js';
import type { AIProvider, MockRequest, MockOptions, MockResult, MultiMockResult } from './index.js';

interface AzureSettings {
  maxOutputTokens: number;
}

interface AzureConfigureOptions {
  apiKey?: string;
  endpoint?: string;
  deploymentName?: string;
  apiVersion?: string;
  maxOutputTokens?: number;
  maxCompletionTokens?: number;
}

export class AzureProvider extends BaseProvider implements AIProvider {
  protected model: string = 'gpt-4o';
  private endpoint: string | null = null;
  private apiVersion: string = '2025-04-01-preview';
  private settings: AzureSettings = {
    maxOutputTokens: 16384,
  };

  configure(options: AzureConfigureOptions): void {
    if (options.apiKey !== undefined) this.apiKey = options.apiKey;
    if (options.endpoint !== undefined) this.endpoint = options.endpoint?.replace(/\/$/, '') ?? null;
    if (options.deploymentName !== undefined) this.model = options.deploymentName || 'gpt-4o';
    if (options.apiVersion !== undefined) this.apiVersion = options.apiVersion || '2025-04-01-preview';
    // Support both names for backwards compatibility
    if (options.maxOutputTokens !== undefined) this.settings.maxOutputTokens = options.maxOutputTokens;
    if (options.maxCompletionTokens !== undefined) this.settings.maxOutputTokens = options.maxCompletionTokens;
  }

  setModel(model: string): void {
    this.model = model;
  }

  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0 && this.endpoint !== null;
  }

  async testConnection(): Promise<boolean> {
    if (!this.apiKey || !this.endpoint) {
      throw new Error('Azure OpenAI configuration incomplete');
    }

    const url = `${this.endpoint}/openai/responses?api-version=${this.apiVersion}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: 'Say "ok"',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `Azure OpenAI API error: ${response.status}`);
    }

    return true;
  }

  async generateMock(request: MockRequest, options: MockOptions = {}): Promise<MockResult> {
    if (!this.apiKey || !this.endpoint) {
      throw new Error('Azure OpenAI configuration incomplete');
    }

    const prompt = this.buildMockPrompt(request, options);
    const systemPrompt =
      'You are an expert at generating realistic mock data for APIs. Always return valid JSON only.';

    const url = `${this.endpoint}/openai/responses?api-version=${this.apiVersion}`;
    const requestBody = {
      model: this.model,
      input: `${systemPrompt}\n\n${prompt}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `Azure OpenAI API error: ${response.status}`);
    }

    const result = await response.json() as unknown;
    const content = this.extractContent(result);

    return {
      data: this.parseJSONResponse(content),
      tokensUsed: (result as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? 0,
    };
  }

  async generateMultipleMocks(requests: MockRequest[], options: MockOptions = {}): Promise<MultiMockResult> {
    if (!this.apiKey || !this.endpoint) {
      throw new Error('Azure OpenAI configuration incomplete');
    }

    const prompt = this.buildMultiMockPrompt(requests, options);
    const systemPrompt =
      'You are an expert at generating realistic mock data for APIs. Generate consistent data across requests. Always return valid JSON only.';

    const url = `${this.endpoint}/openai/responses?api-version=${this.apiVersion}`;
    const requestBody = {
      model: this.model,
      input: `${systemPrompt}\n\n${prompt}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `Azure OpenAI API error: ${response.status}`);
    }

    const result = await response.json() as unknown;
    const content = this.extractContent(result);
    const parsed = this.parseJSONResponse(content) as { mocks?: unknown[] };

    return {
      data: parsed,
      mocks: parsed.mocks ?? [parsed],
      tokensUsed: (result as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? 0,
    };
  }

  private extractContent(result: unknown): string {
    // Array format: newer Responses API
    if (Array.isArray(result)) {
      const messageItem = (result as Array<{ type: string; content?: Array<{ type: string; text?: string }> }>).find(
        (item) => item.type === 'message'
      );
      if (messageItem?.content) {
        const outputTextItem = messageItem.content.find((c) => c.type === 'output_text');
        if (outputTextItem?.text) return outputTextItem.text;
      }
      return '';
    }

    const r = result as Record<string, unknown>;

    if (r['output']) {
      if (Array.isArray(r['output'])) {
        const msgItem = (r['output'] as Array<{ type: string; content?: Array<{ type: string; text?: string }> }>).find(
          (item) => item.type === 'message'
        );
        if (msgItem?.content) {
          const textItem = msgItem.content.find((c) => c.type === 'output_text');
          if (textItem?.text) return textItem.text;
        }
      } else {
        return typeof r['output'] === 'string' ? r['output'] : JSON.stringify(r['output']);
      }
    }
    if (typeof r['output_text'] === 'string') return r['output_text'];
    if (Array.isArray(r['choices']) && r['choices'][0]) {
      const choice = r['choices'][0] as { message?: { content?: string }; text?: string };
      return choice.message?.content ?? choice.text ?? '';
    }
    if (r['content']) {
      return typeof r['content'] === 'string' ? r['content'] : JSON.stringify(r['content']);
    }

    return '';
  }
}
