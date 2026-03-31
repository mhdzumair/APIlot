// OpenAI Provider — supports chat/completions and the new responses endpoint (o1, o3, gpt-5.x)
import { BaseProvider } from './BaseProvider.js';
import type { AIProvider, MockRequest, MockOptions, MockResult, MultiMockResult } from './index.js';

interface OpenAISettings {
  temperature: number;
  maxTokens: number;
  reasoningEffort: 'low' | 'medium' | 'high';
}

export class OpenAIProvider extends BaseProvider implements AIProvider {
  protected model: string = 'gpt-4o';
  private baseUrl: string = 'https://api.openai.com/v1';
  private settings: OpenAISettings = {
    temperature: 0.7,
    maxTokens: 4000,
    reasoningEffort: 'medium',
  };

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
  }

  configure(settings: Partial<OpenAISettings>): void {
    if (settings.temperature !== undefined) this.settings.temperature = settings.temperature;
    if (settings.maxTokens !== undefined) this.settings.maxTokens = settings.maxTokens;
    if (settings.reasoningEffort !== undefined) this.settings.reasoningEffort = settings.reasoningEffort;
  }

  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  async testConnection(): Promise<boolean> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    return true;
  }

  // Thinking models (o1, o3, gpt-5.x) use the responses endpoint
  private usesResponsesEndpoint(): boolean {
    return (
      this.model.startsWith('o1') ||
      this.model.startsWith('o3') ||
      this.model.startsWith('gpt-5')
    );
  }

  // Only o3 and gpt-5.x support the reasoning parameter
  private supportsReasoning(): boolean {
    return this.model.startsWith('o3') || this.model.startsWith('gpt-5');
  }

  async generateMock(request: MockRequest, options: MockOptions = {}): Promise<MockResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = this.buildMockPrompt(request, options);
    const systemPrompt =
      'You are an expert at generating realistic mock data for APIs. Generate data that looks real and contextually appropriate. Always return valid JSON only, no explanation or markdown.';

    if (this.usesResponsesEndpoint()) {
      return this.generateWithResponsesAPI(prompt, systemPrompt, false);
    } else {
      return this.generateWithChatAPI(prompt, systemPrompt, false);
    }
  }

  async generateMultipleMocks(requests: MockRequest[], options: MockOptions = {}): Promise<MultiMockResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = this.buildMultiMockPrompt(requests, options);
    const systemPrompt =
      'You are an expert at generating realistic mock data for APIs. Generate consistent, related data across multiple requests. Always return valid JSON only.';

    let result: MockResult;
    if (this.usesResponsesEndpoint()) {
      result = await this.generateWithResponsesAPI(prompt, systemPrompt, true);
    } else {
      result = await this.generateWithChatAPI(prompt, systemPrompt, true);
    }

    const parsed = result.data as { mocks?: unknown[] };

    return {
      data: parsed,
      mocks: parsed.mocks ?? [parsed],
      tokensUsed: result.tokensUsed,
    };
  }

  private async generateWithResponsesAPI(
    prompt: string,
    systemPrompt: string,
    _isMulti: boolean
  ): Promise<MockResult> {
    const requestBody: Record<string, unknown> = {
      model: this.model,
      input: `${systemPrompt}\n\n${prompt}`,
    };

    if (this.supportsReasoning()) {
      requestBody['reasoning'] = { effort: this.settings.reasoningEffort };
    }

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `OpenAI API error: ${response.status}`);
    }

    const result = await response.json() as unknown;
    const content = this.extractResponsesAPIContent(result);

    return {
      data: this.parseJSONResponse(content),
      tokensUsed: (result as Record<string, unknown> & { usage?: { total_tokens?: number } }).usage?.total_tokens ?? 0,
    };
  }

  private extractResponsesAPIContent(result: unknown): string {
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

  private async generateWithChatAPI(
    prompt: string,
    systemPrompt: string,
    isMulti: boolean
  ): Promise<MockResult> {
    const requestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: this.settings.temperature,
      max_tokens: isMulti ? this.settings.maxTokens * 2 : this.settings.maxTokens,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `OpenAI API error: ${response.status}`);
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
}
