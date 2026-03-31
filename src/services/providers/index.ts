// AI Provider interface and factory for APIlot
// Defines the contract all AI providers must implement

export interface MockRequest {
  requestType: 'graphql' | 'rest';
  // GraphQL fields
  query?: string;
  operationName?: string;
  operationType?: string;
  variables?: Record<string, unknown>;
  // REST fields
  url?: string;
  endpoint?: string;
  method?: string;
  body?: unknown;
  // Optional existing response for template use
  response?: unknown;
}

export interface MockOptions {
  userContext?: string;
  responseMode?: 'full' | 'sanitized' | 'structure' | 'none';
  includeExampleResponse?: boolean;
  sharedIds?: Record<string, string>;
}

export interface MockResult {
  data: unknown;
  tokensUsed: number;
}

export interface MultiMockResult {
  data: unknown;
  mocks: unknown[];
  tokensUsed: number;
}

export interface AIProvider {
  generateMock(request: MockRequest, options?: MockOptions): Promise<MockResult>;
  generateMultipleMocks(requests: MockRequest[], options?: MockOptions): Promise<MultiMockResult>;
  testConnection(): Promise<boolean>;
  isConfigured(): boolean;
}

export type ProviderKey = 'openai' | 'azure-openai' | 'anthropic' | 'gemini' | 'openrouter' | 'local';

export interface AISettings {
  provider: ProviderKey;
  // OpenAI
  openaiApiKey: string;
  openaiModel: string;
  openaiBaseUrl?: string;
  openaiTemperature?: number;
  openaiMaxTokens?: number;
  openaiReasoningEffort?: 'low' | 'medium' | 'high';
  // Azure OpenAI
  azureApiKey?: string;
  azureEndpoint?: string;
  azureDeploymentName?: string;
  azureApiVersion?: string;
  azureMaxOutputTokens?: number;
  // Anthropic
  anthropicApiKey: string;
  anthropicModel: string;
  anthropicMaxTokens?: number;
  anthropicThinkingBudget?: number;
  // Gemini
  geminiApiKey?: string;
  geminiModel?: string;
  geminiTemperature?: number;
  geminiMaxOutputTokens?: number;
  geminiThinkingBudget?: number;
  // OpenRouter
  openrouterApiKey?: string;
  openrouterModel?: string;
  // Custom model override
  useCustomModel?: boolean;
  customModelName?: string;
  // Usage tracking
  callsCount: number;
  tokensUsed: number;
}

export interface ProviderInfo {
  id: ProviderKey;
  name: string;
  description: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  recommended?: boolean;
}
