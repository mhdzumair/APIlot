/**
 * Settings types for APIlot.
 * Derived from src-legacy/background/core.js initializeCore() and
 * UPDATE_SETTINGS / GET_SETTINGS message handling.
 */

export interface NetworkCapture {
  useFilters: boolean;
  includeSubstrings: string[];
  excludeSubstrings: string[];
  skipStaticExtensions: boolean;
}

export interface Settings {
  logProfile: 'basic' | 'detailed' | 'minimal';
  theme: 'light' | 'dark' | 'system';
  networkCapture?: NetworkCapture;
}

export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'azure'
  | 'gemini'
  | 'openrouter'
  | 'local';

export interface ProviderStats {
  calls: number;
  tokens: number;
}

export interface AISettings {
  provider: AIProvider;
  // OpenAI
  openaiApiKey: string;
  openaiModel: string;
  // Anthropic
  anthropicApiKey: string;
  anthropicModel: string;
  // Azure OpenAI
  azureApiKey?: string;
  azureEndpoint?: string;
  azureModel?: string;
  // Gemini
  geminiApiKey?: string;
  geminiModel?: string;
  // OpenRouter
  openrouterApiKey?: string;
  openrouterModel?: string;
  // Local / self-hosted
  localUrl?: string;
  localModel?: string;
  // Usage stats
  callsCount: number;
  tokensUsed: number;
  mocksGenerated: number;
  providerStats?: Record<string, ProviderStats>;
}

export interface PerformanceAggregates {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  totalResponseTime: number;
}

export interface PerformanceData {
  requests: unknown[];
  aggregates: PerformanceAggregates;
}
