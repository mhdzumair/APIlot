// AI Mock Generation Service for APIlot
// Orchestrates multiple AI providers for single and multi-request mock generation
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { AzureProvider } from './providers/AzureProvider.js';
import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';
import { LocalProvider } from './providers/LocalProvider.js';
import type {
  AIProvider,
  AISettings,
  MockRequest,
  MockOptions,
  ProviderKey,
  ProviderInfo,
  ModelInfo,
} from './providers/index.js';

export interface MockResponse {
  success: true;
  data: unknown;
  generationTime: number;
  provider: ProviderKey | 'local';
  model?: string;
  tokensUsed: number;
  fallback?: boolean;
}

export interface MultiMockResponse {
  success: true;
  data: unknown;
  mocks: unknown[];
  generationTime: number;
  provider: ProviderKey | 'local';
  model?: string;
  tokensUsed: number;
  requestCount: number;
  fallback?: boolean;
}

export interface MockErrorResponse {
  success: false;
  error: string;
  generationTime: number;
}

type GenerateMockResult = MockResponse | MockErrorResponse;
type GenerateMultipleMocksResult = MultiMockResponse | MockErrorResponse;

type ProviderMap = {
  openai: OpenAIProvider;
  'azure-openai': AzureProvider;
  anthropic: AnthropicProvider;
  gemini: GeminiProvider;
  openrouter: OpenRouterProvider;
  local: LocalProvider;
};

export class AIMockService {
  private readonly providers: ProviderMap;
  private currentProvider: ProviderKey = 'local';
  private settings: AISettings | null = null;

  constructor() {
    this.providers = {
      openai: new OpenAIProvider(),
      'azure-openai': new AzureProvider(),
      anthropic: new AnthropicProvider(),
      gemini: new GeminiProvider(),
      openrouter: new OpenRouterProvider(),
      local: new LocalProvider(),
    };
  }

  async initialize(settings: AISettings): Promise<void> {
    this.settings = settings;
    this.currentProvider = settings.provider ?? 'local';

    switch (settings.provider) {
      case 'openai':
        if (settings.openaiApiKey) {
          this.providers.openai.setApiKey(settings.openaiApiKey);
          this.providers.openai.setModel(settings.openaiModel ?? 'gpt-4o');
          if (settings.openaiBaseUrl) {
            this.providers.openai.setBaseUrl(settings.openaiBaseUrl);
          }
          this.providers.openai.configure({
            temperature: settings.openaiTemperature ?? 0.7,
            maxTokens: settings.openaiMaxTokens ?? 4000,
            reasoningEffort: settings.openaiReasoningEffort ?? 'medium',
          });
        }
        break;

      case 'azure-openai':
        if (settings.azureApiKey && settings.azureEndpoint) {
          this.providers['azure-openai'].configure({
            apiKey: settings.azureApiKey,
            endpoint: settings.azureEndpoint,
            deploymentName: settings.azureDeploymentName ?? 'gpt-4o',
            apiVersion: settings.azureApiVersion ?? '2025-04-01-preview',
            maxOutputTokens: settings.azureMaxOutputTokens ?? 16384,
          });
        }
        break;

      case 'anthropic':
        if (settings.anthropicApiKey) {
          this.providers.anthropic.setApiKey(settings.anthropicApiKey);
          this.providers.anthropic.setModel(settings.anthropicModel ?? 'claude-sonnet-4-20250514');
          this.providers.anthropic.configure({
            maxTokens: settings.anthropicMaxTokens ?? 4000,
            thinkingBudget: settings.anthropicThinkingBudget ?? 2000,
          });
        }
        break;

      case 'gemini':
        if (settings.geminiApiKey) {
          this.providers.gemini.setApiKey(settings.geminiApiKey);
          this.providers.gemini.setModel(settings.geminiModel ?? 'gemini-2.5-flash');
          this.providers.gemini.configure({
            temperature: settings.geminiTemperature ?? 0.7,
            maxOutputTokens: settings.geminiMaxOutputTokens ?? 4000,
            thinkingBudget: settings.geminiThinkingBudget ?? 2000,
          });
        }
        break;

      case 'openrouter':
        if (settings.openrouterApiKey) {
          this.providers.openrouter.setApiKey(settings.openrouterApiKey);
          this.providers.openrouter.setModel(settings.openrouterModel ?? 'anthropic/claude-sonnet-4-5');
        }
        break;
    }

    // Handle custom model override
    if (settings.useCustomModel && settings.customModelName) {
      const provider: AIProvider = this.providers[this.currentProvider];
      if ('setModel' in provider && typeof (provider as { setModel?: unknown }).setModel === 'function') {
        (provider as { setModel: (m: string) => void }).setModel(settings.customModelName);
      }
    }
  }

  // Generate mock for a single request
  async generateMock(
    request: MockRequest,
    options: MockOptions = {}
  ): Promise<GenerateMockResult> {
    const startTime = Date.now();
    const provider = this.providers[this.currentProvider];

    try {
      const result = await provider.generateMock(request, options);
      const resolvedModel = this.getProviderModel(this.currentProvider);
      return {
        success: true,
        data: result.data,
        generationTime: Date.now() - startTime,
        provider: this.currentProvider,
        model: resolvedModel,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      console.error(`[AI-MOCK] Error with ${this.currentProvider}:`, error);

      if (this.currentProvider !== 'local') {
        console.log('[AI-MOCK] Falling back to local provider');
        try {
          const fallbackResult = await this.providers.local.generateMock(request, options);
          return {
            success: true,
            data: fallbackResult.data,
            generationTime: Date.now() - startTime,
            provider: 'local',
            fallback: true,
            tokensUsed: 0,
          };
        } catch {
          return {
            success: false,
            error: (error as Error).message,
            generationTime: Date.now() - startTime,
          };
        }
      }

      return {
        success: false,
        error: (error as Error).message,
        generationTime: Date.now() - startTime,
      };
    }
  }

  // Generate mocks for multiple requests in a single LLM call
  async generateMultipleMocks(
    requests: MockRequest[],
    options: MockOptions = {}
  ): Promise<GenerateMultipleMocksResult> {
    const startTime = Date.now();
    const provider = this.providers[this.currentProvider];

    if (!requests || requests.length === 0) {
      return { success: false, error: 'No requests provided', generationTime: 0 };
    }

    if (requests.length === 1) {
      const single = await this.generateMock(requests[0], options);
      if (!single.success) return single;
      return {
        success: true,
        data: single.data,
        mocks: [single.data],
        generationTime: single.generationTime,
        provider: single.provider,
        model: single.model,
        tokensUsed: single.tokensUsed,
        requestCount: 1,
        fallback: single.fallback,
      };
    }

    try {
      const result = await provider.generateMultipleMocks(requests, options);
      const resolvedModel = this.getProviderModel(this.currentProvider);
      return {
        success: true,
        data: result.data,
        mocks: result.mocks,
        generationTime: Date.now() - startTime,
        provider: this.currentProvider,
        model: resolvedModel,
        tokensUsed: result.tokensUsed,
        requestCount: requests.length,
      };
    } catch (error) {
      console.error(
        `[AI-MOCK] Error generating multiple mocks with ${this.currentProvider}:`,
        error
      );

      if (this.currentProvider !== 'local') {
        console.log('[AI-MOCK] Falling back to local provider for multiple mocks');
        try {
          const fallbackResult = await this.providers.local.generateMultipleMocks(
            requests,
            options
          );
          return {
            success: true,
            data: fallbackResult.data,
            mocks: fallbackResult.mocks,
            generationTime: Date.now() - startTime,
            provider: 'local',
            fallback: true,
            tokensUsed: 0,
            requestCount: requests.length,
          };
        } catch {
          return {
            success: false,
            error: (error as Error).message,
            generationTime: Date.now() - startTime,
          };
        }
      }

      return {
        success: false,
        error: (error as Error).message,
        generationTime: Date.now() - startTime,
      };
    }
  }

  // Legacy method for backward compatibility
  async generateGraphQLMocks(
    schema: string,
    operationName: string,
    operationType = 'query',
    userContext = ''
  ): Promise<GenerateMockResult> {
    return this.generateMock(
      { requestType: 'graphql', query: schema, operationName, operationType },
      { userContext }
    );
  }

  // Legacy method for backward compatibility
  async generateRESTMocks(
    endpoint: string,
    method: string,
    responseSchema: unknown = null,
    userContext = ''
  ): Promise<GenerateMockResult> {
    return this.generateMock(
      { requestType: 'rest', url: endpoint, method, response: responseSchema ?? undefined },
      { userContext }
    );
  }

  async testConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
    const provider = this.providers[this.currentProvider];

    if (this.currentProvider === 'local') {
      return { success: true, message: 'Local provider is always available' };
    }

    try {
      await provider.testConnection();
      return { success: true, message: `Connected to ${this.currentProvider}` };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  getAvailableProviders(): ProviderInfo[] {
    return [
      { id: 'openai', name: 'OpenAI', description: 'GPT-5.1, GPT-5.1 Codex, GPT-4o, o1, o3' },
      {
        id: 'azure-openai',
        name: 'Azure OpenAI',
        description: 'Azure-hosted OpenAI models (API 2024-12-01)',
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        description: 'Claude 4.5 Opus, Sonnet, Haiku (Thinking models)',
      },
      {
        id: 'gemini',
        name: 'Google Gemini',
        description: 'Gemini 3 Pro, 2.5 Pro/Flash (Thinking models)',
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        description: 'Access all models via OpenRouter',
      },
      {
        id: 'local',
        name: 'Local / Fallback',
        description: 'Pattern-based generation (no API key required)',
      },
    ];
  }

  getAvailableModels(provider: ProviderKey): ModelInfo[] {
    const models: Record<string, ModelInfo[]> = {
      openai: [
        {
          id: 'gpt-5.1',
          name: 'GPT-5.1',
          description: 'Latest flagship model with multimodal & thinking',
          recommended: true,
        },
        { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', description: 'Optimized for code generation' },
        { id: 'gpt-5.1-thinking', name: 'GPT-5.1 Thinking', description: 'Extended reasoning mode' },
        { id: 'o3', name: 'o3', description: 'Advanced reasoning model' },
        { id: 'o3-mini', name: 'o3-mini', description: 'Faster reasoning model' },
        { id: 'o1', name: 'o1', description: 'Reasoning model' },
        { id: 'o1-mini', name: 'o1-mini', description: 'Faster o1 variant' },
        { id: 'gpt-4o', name: 'GPT-4o', description: 'Previous generation flagship' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster, cost-effective' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Legacy high-performance' },
      ],
      'azure-openai': [
        {
          id: 'gpt-5.1',
          name: 'GPT-5.1',
          description: 'Latest flagship model',
          recommended: true,
        },
        { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', description: 'Code optimized' },
        { id: 'o3', name: 'o3', description: 'Advanced reasoning' },
        { id: 'o1', name: 'o1', description: 'Reasoning model' },
        { id: 'gpt-4o', name: 'GPT-4o', description: 'Previous flagship' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Cost-effective' },
      ],
      anthropic: [
        {
          id: 'claude-opus-4-5-20251124',
          name: 'Claude 4.5 Opus',
          description: 'Most capable, best for complex tasks',
          recommended: true,
        },
        {
          id: 'claude-opus-4-5-high-20251124',
          name: 'Claude 4.5 Opus High',
          description: 'Enhanced reasoning mode',
        },
        {
          id: 'claude-sonnet-4-5-20250514',
          name: 'Claude 4.5 Sonnet',
          description: 'Balanced performance & speed',
        },
        {
          id: 'claude-sonnet-4-5-thinking-20250514',
          name: 'Claude 4.5 Sonnet Thinking',
          description: 'Extended thinking mode',
        },
        {
          id: 'claude-haiku-4-5-20251101',
          name: 'Claude 4.5 Haiku',
          description: 'Fast & efficient',
        },
        {
          id: 'claude-sonnet-4-20250514',
          name: 'Claude Sonnet 4',
          description: 'Previous Sonnet',
        },
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: 'Legacy model',
        },
      ],
      gemini: [
        {
          id: 'gemini-3-pro',
          name: 'Gemini 3 Pro',
          description: 'Latest flagship, top benchmarks',
          recommended: true,
        },
        {
          id: 'gemini-3-pro-thinking',
          name: 'Gemini 3 Pro Thinking',
          description: 'Extended reasoning',
        },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Advanced reasoning' },
        {
          id: 'gemini-2.5-pro-thinking',
          name: 'Gemini 2.5 Pro Thinking',
          description: 'Deep thinking mode',
        },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast & efficient' },
        {
          id: 'gemini-2.5-flash-thinking',
          name: 'Gemini 2.5 Flash Thinking',
          description: 'Fast with reasoning',
        },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Previous fast model' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Legacy pro model' },
      ],
      openrouter: [
        {
          id: 'anthropic/claude-opus-4-5',
          name: 'Claude 4.5 Opus',
          description: 'Via OpenRouter',
          recommended: true,
        },
        {
          id: 'anthropic/claude-sonnet-4-5',
          name: 'Claude 4.5 Sonnet',
          description: 'Via OpenRouter',
        },
        {
          id: 'anthropic/claude-sonnet-4-5-thinking',
          name: 'Claude 4.5 Sonnet Thinking',
          description: 'Thinking mode',
        },
        { id: 'openai/gpt-5.1', name: 'GPT-5.1', description: 'Via OpenRouter' },
        { id: 'openai/o3', name: 'o3', description: 'Reasoning via OpenRouter' },
        { id: 'google/gemini-3-pro', name: 'Gemini 3 Pro', description: 'Via OpenRouter' },
        { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Via OpenRouter' },
        {
          id: 'mistralai/mistral-large-2',
          name: 'Mistral Large 2',
          description: 'Mistral flagship',
        },
        {
          id: 'meta-llama/llama-3.3-70b',
          name: 'Llama 3.3 70B',
          description: 'Meta open model',
        },
      ],
    };

    return models[provider] ?? [];
  }

  private getProviderModel(providerKey: ProviderKey): string | undefined {
    const p = this.providers[providerKey] as unknown as { model?: string };
    return p.model;
  }
}
