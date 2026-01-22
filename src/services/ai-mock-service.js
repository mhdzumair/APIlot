// AI Mock Generation Service for APIlot
// Supports multiple AI providers with latest 2025 models
// Features: Single/Multi-request generation, User context input, Thinking models support

class AIMockService {
  constructor() {
    this.providers = {
      openai: new OpenAIProvider(),
      'azure-openai': new AzureOpenAIProvider(),
      anthropic: new AnthropicProvider(),
      gemini: new GeminiProvider(),
      openrouter: new OpenRouterProvider(),
      local: new LocalMockProvider()
    };
    this.currentProvider = 'local';
    this.settings = null;
  }

  async initialize(settings) {
    this.settings = settings;
    this.currentProvider = settings.provider || 'local';
    
    // Initialize provider based on settings
    switch (settings.provider) {
      case 'openai':
        if (settings.openaiApiKey) {
          this.providers.openai.setApiKey(settings.openaiApiKey);
          this.providers.openai.setModel(settings.openaiModel || 'gpt-4o');
          if (settings.openaiBaseUrl) {
            this.providers.openai.setBaseUrl(settings.openaiBaseUrl);
          }
          // Configure advanced settings
          this.providers.openai.configure({
            temperature: settings.openaiTemperature ?? 0.7,
            maxTokens: settings.openaiMaxTokens ?? 4000,
            reasoningEffort: settings.openaiReasoningEffort || 'medium'
          });
        }
        break;
        
      case 'azure-openai':
        if (settings.azureApiKey && settings.azureEndpoint) {
          this.providers['azure-openai'].configure({
            apiKey: settings.azureApiKey,
            endpoint: settings.azureEndpoint,
            deploymentName: settings.azureDeploymentName || 'gpt-4o',
            apiVersion: settings.azureApiVersion || '2025-04-01-preview',
            maxOutputTokens: settings.azureMaxOutputTokens ?? 16384
          });
        }
        break;
        
      case 'anthropic':
        if (settings.anthropicApiKey) {
          this.providers.anthropic.setApiKey(settings.anthropicApiKey);
          this.providers.anthropic.setModel(settings.anthropicModel || 'claude-sonnet-4-5');
          // Configure advanced settings
          this.providers.anthropic.configure({
            maxTokens: settings.anthropicMaxTokens ?? 4000,
            thinkingBudget: settings.anthropicThinkingBudget ?? 2000
          });
        }
        break;
        
      case 'gemini':
        if (settings.geminiApiKey) {
          this.providers.gemini.setApiKey(settings.geminiApiKey);
          this.providers.gemini.setModel(settings.geminiModel || 'gemini-2.5-flash');
          // Configure advanced settings
          this.providers.gemini.configure({
            temperature: settings.geminiTemperature ?? 0.7,
            maxOutputTokens: settings.geminiMaxOutputTokens ?? 4000,
            thinkingBudget: settings.geminiThinkingBudget ?? 2000
          });
        }
        break;
        
      case 'openrouter':
        if (settings.openrouterApiKey) {
          this.providers.openrouter.setApiKey(settings.openrouterApiKey);
          this.providers.openrouter.setModel(settings.openrouterModel || 'anthropic/claude-sonnet-4-5');
        }
        break;
    }
    
    // Handle custom model override
    if (settings.useCustomModel && settings.customModelName) {
      const provider = this.providers[this.currentProvider];
      if (provider && provider.setModel) {
        provider.setModel(settings.customModelName);
      }
    }
  }

  // Generate mock for a single request
  async generateMock(request, options = {}) {
    const startTime = Date.now();
    const provider = this.providers[this.currentProvider];
    
    try {
      const result = await provider.generateMock(request, options);
      return {
        success: true,
        data: result.data,
        generationTime: Date.now() - startTime,
        provider: this.currentProvider,
        model: provider.model || provider.deploymentName,
        tokensUsed: result.tokensUsed || 0
      };
    } catch (error) {
      console.error(`[AI-MOCK] Error with ${this.currentProvider}:`, error);
      
      // Fallback to local provider if AI fails
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
            tokensUsed: 0
          };
        } catch (fallbackError) {
          return {
            success: false,
            error: error.message,
            generationTime: Date.now() - startTime
          };
        }
      }
      
      return {
        success: false,
        error: error.message,
        generationTime: Date.now() - startTime
      };
    }
  }

  // Generate mocks for multiple requests in a single LLM call
  async generateMultipleMocks(requests, options = {}) {
    const startTime = Date.now();
    const provider = this.providers[this.currentProvider];
    
    if (!requests || requests.length === 0) {
      return { success: false, error: 'No requests provided' };
    }
    
    // If only one request, use single generation
    if (requests.length === 1) {
      return this.generateMock(requests[0], options);
    }
    
    try {
      const result = await provider.generateMultipleMocks(requests, options);
      return {
        success: true,
        data: result.data,
        mocks: result.mocks, // Array of individual mocks
        generationTime: Date.now() - startTime,
        provider: this.currentProvider,
        model: provider.model || provider.deploymentName,
        tokensUsed: result.tokensUsed || 0,
        requestCount: requests.length
      };
    } catch (error) {
      console.error(`[AI-MOCK] Error generating multiple mocks with ${this.currentProvider}:`, error);
      
      // Fallback to local provider
      if (this.currentProvider !== 'local') {
        console.log('[AI-MOCK] Falling back to local provider for multiple mocks');
        try {
          const fallbackResult = await this.providers.local.generateMultipleMocks(requests, options);
          return {
            success: true,
            data: fallbackResult.data,
            mocks: fallbackResult.mocks,
            generationTime: Date.now() - startTime,
            provider: 'local',
            fallback: true,
            tokensUsed: 0,
            requestCount: requests.length
          };
        } catch (fallbackError) {
          return {
            success: false,
            error: error.message,
            generationTime: Date.now() - startTime
          };
        }
      }
      
      return {
        success: false,
        error: error.message,
        generationTime: Date.now() - startTime
      };
    }
  }

  // Legacy method for backward compatibility
  async generateGraphQLMocks(schema, operationName, operationType = 'query', userContext = '') {
    return this.generateMock({
      requestType: 'graphql',
      query: schema,
      operationName,
      operationType
    }, { userContext });
  }

  // Legacy method for backward compatibility
  async generateRESTMocks(endpoint, method, responseSchema = null, userContext = '') {
    return this.generateMock({
      requestType: 'rest',
      url: endpoint,
      method,
      responseSchema
    }, { userContext });
  }

  async testConnection() {
    const provider = this.providers[this.currentProvider];
    
    if (this.currentProvider === 'local') {
      return { success: true, message: 'Local provider is always available' };
    }
    
    try {
      await provider.testConnection();
      return { success: true, message: `Connected to ${this.currentProvider}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getAvailableProviders() {
    return [
      { id: 'openai', name: 'OpenAI', description: 'GPT-5.1, GPT-5.1 Codex, GPT-4o, o1, o3' },
      { id: 'azure-openai', name: 'Azure OpenAI', description: 'Azure-hosted OpenAI models (API 2024-12-01)' },
      { id: 'anthropic', name: 'Anthropic', description: 'Claude 4.5 Opus, Sonnet, Haiku (Thinking models)' },
      { id: 'gemini', name: 'Google Gemini', description: 'Gemini 3 Pro, 2.5 Pro/Flash (Thinking models)' },
      { id: 'openrouter', name: 'OpenRouter', description: 'Access all models via OpenRouter' },
      { id: 'local', name: 'Local / Fallback', description: 'Pattern-based generation (no API key required)' }
    ];
  }

  getAvailableModels(provider) {
    const models = {
      openai: [
        { id: 'gpt-5.1', name: 'GPT-5.1', description: 'Latest flagship model with multimodal & thinking', recommended: true },
        { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', description: 'Optimized for code generation' },
        { id: 'gpt-5.1-thinking', name: 'GPT-5.1 Thinking', description: 'Extended reasoning mode' },
        { id: 'o3', name: 'o3', description: 'Advanced reasoning model' },
        { id: 'o3-mini', name: 'o3-mini', description: 'Faster reasoning model' },
        { id: 'o1', name: 'o1', description: 'Reasoning model' },
        { id: 'o1-mini', name: 'o1-mini', description: 'Faster o1 variant' },
        { id: 'gpt-4o', name: 'GPT-4o', description: 'Previous generation flagship' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster, cost-effective' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Legacy high-performance' }
      ],
      'azure-openai': [
        { id: 'gpt-5.1', name: 'GPT-5.1', description: 'Latest flagship model', recommended: true },
        { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', description: 'Code optimized' },
        { id: 'o3', name: 'o3', description: 'Advanced reasoning' },
        { id: 'o1', name: 'o1', description: 'Reasoning model' },
        { id: 'gpt-4o', name: 'GPT-4o', description: 'Previous flagship' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Cost-effective' }
      ],
      anthropic: [
        { id: 'claude-opus-4-5-20251124', name: 'Claude 4.5 Opus', description: 'Most capable, best for complex tasks', recommended: true },
        { id: 'claude-opus-4-5-high-20251124', name: 'Claude 4.5 Opus High', description: 'Enhanced reasoning mode' },
        { id: 'claude-sonnet-4-5-20250514', name: 'Claude 4.5 Sonnet', description: 'Balanced performance & speed' },
        { id: 'claude-sonnet-4-5-thinking-20250514', name: 'Claude 4.5 Sonnet Thinking', description: 'Extended thinking mode' },
        { id: 'claude-haiku-4-5-20251101', name: 'Claude 4.5 Haiku', description: 'Fast & efficient' },
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Previous Sonnet' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Legacy model' }
      ],
      gemini: [
        { id: 'gemini-3-pro', name: 'Gemini 3 Pro', description: 'Latest flagship, top benchmarks', recommended: true },
        { id: 'gemini-3-pro-thinking', name: 'Gemini 3 Pro Thinking', description: 'Extended reasoning' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Advanced reasoning' },
        { id: 'gemini-2.5-pro-thinking', name: 'Gemini 2.5 Pro Thinking', description: 'Deep thinking mode' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast & efficient' },
        { id: 'gemini-2.5-flash-thinking', name: 'Gemini 2.5 Flash Thinking', description: 'Fast with reasoning' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Previous fast model' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Legacy pro model' }
      ],
      openrouter: [
        { id: 'anthropic/claude-opus-4-5', name: 'Claude 4.5 Opus', description: 'Via OpenRouter', recommended: true },
        { id: 'anthropic/claude-sonnet-4-5', name: 'Claude 4.5 Sonnet', description: 'Via OpenRouter' },
        { id: 'anthropic/claude-sonnet-4-5-thinking', name: 'Claude 4.5 Sonnet Thinking', description: 'Thinking mode' },
        { id: 'openai/gpt-5.1', name: 'GPT-5.1', description: 'Via OpenRouter' },
        { id: 'openai/o3', name: 'o3', description: 'Reasoning via OpenRouter' },
        { id: 'google/gemini-3-pro', name: 'Gemini 3 Pro', description: 'Via OpenRouter' },
        { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Via OpenRouter' },
        { id: 'mistralai/mistral-large-2', name: 'Mistral Large 2', description: 'Mistral flagship' },
        { id: 'meta-llama/llama-3.3-70b', name: 'Llama 3.3 70B', description: 'Meta open model' }
      ]
    };
    
    return models[provider] || [];
  }
}

// Base Provider class with common functionality
class BaseProvider {
  constructor() {
    this.apiKey = null;
    this.model = null;
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  setModel(model) {
    this.model = model;
  }

  // ============================================
  // Response Sanitization Methods
  // ============================================

  /**
   * Sanitize response data while preserving structure
   * @param {any} data - The response data to sanitize
   * @param {string} mode - 'full', 'sanitized', 'structure', or 'none'
   * @returns {any} - Sanitized data or null
   */
  sanitizeResponse(data, mode = 'sanitized') {
    if (mode === 'none' || data === undefined) return null;
    if (mode === 'full') return data;
    
    return this.processValue(data, mode, 0);
  }

  /**
   * Process a value recursively based on sanitization mode
   */
  processValue(value, mode, depth) {
    // Handle null/undefined
    if (value === null || value === undefined) return null;
    
    // Handle arrays - limit to first 2 items to save tokens
    if (Array.isArray(value)) {
      const limited = value.slice(0, 2);
      return limited.map(item => this.processValue(item, mode, depth + 1));
    }
    
    // Handle objects
    if (typeof value === 'object') {
      const result = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.processValue(val, mode, depth + 1);
      }
      return result;
    }
    
    // For 'structure' mode - replace with type indicators
    if (mode === 'structure') {
      if (typeof value === 'string') return '<string>';
      if (typeof value === 'number') return '<number>';
      if (typeof value === 'boolean') return '<boolean>';
      return '<unknown>';
    }
    
    // For 'sanitized' mode - detect and replace sensitive data
    return this.sanitizeValue(value);
  }

  /**
   * Sanitize individual values while preserving non-sensitive data
   */
  sanitizeValue(value) {
    // Keep numbers and booleans as-is (usually not sensitive)
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value;
    
    if (typeof value === 'string') {
      // Keep __typename and similar GraphQL metadata
      if (value.startsWith('__')) return value;
      
      // Keep short status-like values (active, pending, completed, etc.)
      if (value.length <= 15 && /^[a-z_]+$/i.test(value)) return value;
      
      // Detect and replace sensitive patterns
      if (this.isEmail(value)) return 'user@example.com';
      if (this.isUUID(value)) return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
      if (this.isHexId(value)) return 'ffffffff00000000xxxxxxxxxxxxxxxx';
      if (this.isPhoneNumber(value)) return '+1-555-000-0000';
      if (this.looksLikeUrl(value)) return 'https://example.com/path';
      if (this.looksLikeName(value)) return 'Sample Name';
      if (this.looksLikeAddress(value)) return '123 Example Street, City, ST 00000';
      
      // Keep short strings that don't match patterns
      if (value.length < 30) return value;
      
      // Redact longer strings that might be sensitive
      return '<redacted>';
    }
    
    return value;
  }

  // ============================================
  // Sensitive Data Detection Helpers
  // ============================================

  isEmail(str) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  }

  isUUID(str) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  }

  isHexId(str) {
    // Matches MongoDB ObjectIds, long hex IDs, etc.
    return /^[0-9a-f]{24,}$/i.test(str);
  }

  isPhoneNumber(str) {
    return /^\+?[\d\s\-()]{10,}$/.test(str);
  }

  looksLikeUrl(str) {
    return /^https?:\/\//.test(str);
  }

  looksLikeName(str) {
    // Matches "First Last" or "First Middle Last" patterns
    return /^[A-Z][a-z]+(?: [A-Z][a-z]+){1,2}$/.test(str);
  }

  looksLikeAddress(str) {
    // Matches common address patterns
    return /\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)/i.test(str);
  }

  // Build prompt for single request mock generation
  buildMockPrompt(request, options = {}) {
    const { userContext = '', responseMode = 'sanitized' } = options;
    // Support legacy includeExampleResponse option
    const effectiveMode = options.includeExampleResponse === false ? 'none' : (options.responseMode || responseMode);
    
    let prompt = '';
    
    if (request.requestType === 'graphql') {
      prompt = this.buildGraphQLPrompt(request, { ...options, responseMode: effectiveMode });
    } else {
      prompt = this.buildRESTPrompt(request, { ...options, responseMode: effectiveMode });
    }
    
    // Add user context if provided
    if (userContext && userContext.trim()) {
      prompt += `\n\nAdditional Context from User:\n${userContext.trim()}`;
    }
    
    return prompt;
  }

  // Build prompt for multiple requests mock generation
  buildMultiMockPrompt(requests, options = {}) {
    const { userContext = '', responseMode = 'sanitized' } = options;
    
    let prompt = `Generate realistic mock data for the following ${requests.length} API requests. 
These requests are related and may share common IDs or data relationships.
IMPORTANT: Use consistent IDs and data across all mocks so they can work together in a UI.
CRITICAL: Match the EXACT structure from each response template - if a field is an array [], keep it as array; if it's an object {}, keep it as object.

`;

    requests.forEach((request, index) => {
      prompt += `\n--- REQUEST ${index + 1} ---\n`;
      
      if (request.requestType === 'graphql') {
        prompt += `Type: GraphQL ${request.operationType || 'query'}
Operation: ${request.operationName || 'Unknown'}
Query:
${request.query || request.body || 'N/A'}
Variables: ${JSON.stringify(request.variables || {}, null, 2)}
`;
      } else {
        prompt += `Type: REST API
Method: ${request.method || 'GET'}
Endpoint: ${request.url || request.endpoint}
${request.body ? `Request Body: ${typeof request.body === 'string' ? request.body : JSON.stringify(request.body, null, 2)}` : ''}
`;
      }
      
      // Include response template based on mode
      if (responseMode !== 'none' && request.response) {
        const sanitizedResponse = this.sanitizeResponse(request.response, responseMode);
        
        if (sanitizedResponse) {
          const responseStr = JSON.stringify(sanitizedResponse, null, 2);
          const modeDescription = this.getResponseModeDescription(responseMode);
          prompt += `\n${modeDescription}:
${responseStr.substring(0, 1000)}${responseStr.length > 1000 ? '...' : ''}
`;
        }
      }
    });

    prompt += `\n--- OUTPUT FORMAT ---
Return a JSON object with a "mocks" array containing mock responses for each request in order.
Each mock should match the structure expected by its request type.

For GraphQL: { "data": { "operationName": { ... } } }
For REST: The response body JSON

Example output format:
{
  "mocks": [
    { "data": { "GetUsers": [...] } },
    { "items": [...], "total": 10 }
  ]
}

Requirements:
1. Generate realistic, contextually appropriate data
2. Use CONSISTENT IDs across related requests (e.g., if request 1 returns user IDs, use same IDs in request 2)
3. Maintain data relationships (parent-child, foreign keys, etc.)
4. Use proper data types based on field names
5. Return ONLY valid JSON, no explanation
`;

    // Add user context if provided
    if (userContext && userContext.trim()) {
      prompt += `\n\nUser Instructions:\n${userContext.trim()}`;
    }

    return prompt;
  }

  buildGraphQLPrompt(request, options = {}) {
    const { responseMode = 'sanitized' } = options;
    const operationName = request.operationName || 'Unknown';
    const operationType = request.operationType || 'query';
    const query = request.query || request.body || '';
    const variables = request.variables || {};
    
    let prompt = `Generate realistic mock data for this GraphQL ${operationType}:

Operation Name: ${operationName}
Query:
${query}

Variables: ${JSON.stringify(variables, null, 2)}
`;

    // Include response template based on mode
    if (responseMode !== 'none' && request.response) {
      const sanitizedResponse = this.sanitizeResponse(request.response, responseMode);
      
      if (sanitizedResponse) {
        const responseStr = JSON.stringify(sanitizedResponse, null, 2);
        const modeDescription = this.getResponseModeDescription(responseMode);
        
        prompt += `
${modeDescription}:
${responseStr.substring(0, 2000)}${responseStr.length > 2000 ? '\n... (truncated)' : ''}
`;
      }
    }

    prompt += `
Requirements:
1. Generate realistic, contextually appropriate data based on field names
2. Use proper data types (strings for names, valid emails, realistic dates, etc.)
3. For arrays, generate 2-5 items with varied but realistic data
4. For IDs, use realistic formats (numeric IDs, UUIDs, or contextual IDs)
5. IMPORTANT: Match the EXACT structure from the response template - if a field is an array [], keep it as array; if it's an object {}, keep it as object
6. Return ONLY valid JSON wrapped in a "data" key

Output the mock response JSON only, no explanation.`;

    return prompt;
  }

  getResponseModeDescription(mode) {
    switch (mode) {
      case 'full':
        return 'Existing Response (use as template, generate new realistic values)';
      case 'sanitized':
        return 'Response Structure (sensitive data redacted - MATCH THIS EXACT STRUCTURE)';
      case 'structure':
        return 'Response Structure (types only - MATCH THIS EXACT STRUCTURE, replace type placeholders with real values)';
      default:
        return 'Response Template';
    }
  }

  buildRESTPrompt(request, options = {}) {
    const { responseMode = 'sanitized' } = options;
    const method = request.method || 'GET';
    const endpoint = request.url || request.endpoint || '';
    const body = request.body;
    
    let prompt = `Generate realistic mock data for this REST API endpoint:

Endpoint: ${endpoint}
HTTP Method: ${method}
${body ? `Request Body: ${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}` : ''}
`;

    // Include response template based on mode
    if (responseMode !== 'none' && request.response) {
      const sanitizedResponse = this.sanitizeResponse(request.response, responseMode);
      
      if (sanitizedResponse) {
        const responseStr = JSON.stringify(sanitizedResponse, null, 2);
        const modeDescription = this.getResponseModeDescription(responseMode);
        
        prompt += `
${modeDescription}:
${responseStr.substring(0, 2000)}${responseStr.length > 2000 ? '\n... (truncated)' : ''}
`;
      }
    }

    prompt += `
Requirements:
1. Generate realistic, contextually appropriate data based on the endpoint pattern
2. For GET requests returning lists, generate 3-5 items
3. For POST/PUT requests, generate a typical success response
4. Use proper data types based on field names
5. Include common fields like id, createdAt, updatedAt where appropriate
6. IMPORTANT: Match the EXACT structure from the response template - if a field is an array [], keep it as array; if it's an object {}, keep it as object
7. Return ONLY valid JSON

Output the mock response JSON only, no explanation.`;

    return prompt;
  }

  // Parse LLM response to extract JSON
  parseJSONResponse(content) {
    // Try to extract JSON from code blocks first
    const codeBlockMatch = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1].trim());
    }
    
    // Try to find JSON object or array
    const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // Try parsing the whole content
    return JSON.parse(content.trim());
  }
}

// OpenAI Provider - Updated for latest API (responses endpoint for thinking models)
class OpenAIProvider extends BaseProvider {
  constructor() {
    super();
    this.model = 'gpt-4o'; // Default to gpt-4o as it's more widely available
    this.baseUrl = 'https://api.openai.com/v1';
    // Provider-specific settings
    this.settings = {
      temperature: 0.7,
      maxTokens: 4000,
      reasoningEffort: 'medium' // low, medium, high - for thinking models
    };
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  configure(settings) {
    if (settings.temperature !== undefined) this.settings.temperature = settings.temperature;
    if (settings.maxTokens !== undefined) this.settings.maxTokens = settings.maxTokens;
    if (settings.reasoningEffort !== undefined) this.settings.reasoningEffort = settings.reasoningEffort;
  }

  async testConnection() {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    return true;
  }

  // Check if model uses the new responses endpoint (thinking models: o1, o3, gpt-5.1)
  usesResponsesEndpoint() {
    return this.model.startsWith('o1') || 
           this.model.startsWith('o3') || 
           this.model.startsWith('gpt-5');
  }

  // Check if model supports reasoning parameter
  supportsReasoning() {
    return this.model.startsWith('o3') || this.model.startsWith('gpt-5');
  }

  async generateMock(request, options = {}) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = this.buildMockPrompt(request, options);
    const systemPrompt = 'You are an expert at generating realistic mock data for APIs. Generate data that looks real and contextually appropriate. Always return valid JSON only, no explanation or markdown.';
    
    // Use responses endpoint for thinking models, chat/completions for others
    if (this.usesResponsesEndpoint()) {
      return this.generateWithResponsesAPI(prompt, systemPrompt, false);
    } else {
      return this.generateWithChatAPI(prompt, systemPrompt, false);
    }
  }

  async generateWithResponsesAPI(prompt, systemPrompt, isMulti = false) {
    // Responses API uses 'input' instead of 'messages'
    const requestBody = {
      model: this.model,
      input: `${systemPrompt}\n\n${prompt}`
    };

    // Add reasoning config for models that support it
    if (this.supportsReasoning()) {
      requestBody.reasoning = {
        effort: this.settings.reasoningEffort || 'medium'
      };
    }

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    
    // The Responses API returns an array of items (reasoning + message)
    // We need to find the message item and extract the text from output_text
    let content = '';
    
    // Handle array response format (new Responses API)
    if (Array.isArray(result)) {
      const messageItem = result.find(item => item.type === 'message');
      if (messageItem && messageItem.content) {
        const outputTextItem = messageItem.content.find(c => c.type === 'output_text');
        if (outputTextItem && outputTextItem.text) {
          content = outputTextItem.text;
        }
      }
    }
    // Handle object response format
    else if (result.output) {
      // Check if output is an array (newer format)
      if (Array.isArray(result.output)) {
        const messageItem = result.output.find(item => item.type === 'message');
        if (messageItem && messageItem.content) {
          const outputTextItem = messageItem.content.find(c => c.type === 'output_text');
          if (outputTextItem && outputTextItem.text) {
            content = outputTextItem.text;
          }
        }
      } else {
        // Direct output field
        content = typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
      }
    } else if (result.output_text) {
      content = result.output_text;
    } else if (result.choices && result.choices[0]) {
      content = result.choices[0].message?.content || result.choices[0].text || '';
    } else if (result.content) {
      content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    }
    
    return {
      data: this.parseJSONResponse(content),
      tokensUsed: result.usage?.total_tokens || 0
    };
  }

  async generateWithChatAPI(prompt, systemPrompt, isMulti = false) {
    const requestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: this.settings.temperature,
      max_tokens: isMulti ? this.settings.maxTokens * 2 : this.settings.maxTokens
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices[0].message.content;
    
    return {
      data: this.parseJSONResponse(content),
      tokensUsed: result.usage?.total_tokens || 0
    };
  }

  async generateMultipleMocks(requests, options = {}) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = this.buildMultiMockPrompt(requests, options);
    const systemPrompt = 'You are an expert at generating realistic mock data for APIs. Generate consistent, related data across multiple requests. Always return valid JSON only.';
    
    let result;
    if (this.usesResponsesEndpoint()) {
      result = await this.generateWithResponsesAPI(prompt, systemPrompt, true);
    } else {
      result = await this.generateWithChatAPI(prompt, systemPrompt, true);
    }

    const parsed = result.data;
    
    return {
      data: parsed,
      mocks: parsed.mocks || [parsed],
      tokensUsed: result.tokensUsed
    };
  }
}

// Azure OpenAI Provider - Updated for latest API (responses endpoint with Bearer auth)
class AzureOpenAIProvider extends BaseProvider {
  constructor() {
    super();
    this.endpoint = null;
    this.model = 'gpt-4o'; // The model name to use in requests
    this.apiVersion = '2025-04-01-preview';
    // Provider-specific settings
    this.settings = {
      maxOutputTokens: 16384
    };
  }

  configure({ apiKey, endpoint, deploymentName, apiVersion, maxOutputTokens, maxCompletionTokens }) {
    if (apiKey !== undefined) this.apiKey = apiKey;
    if (endpoint !== undefined) this.endpoint = endpoint?.replace(/\/$/, '');
    if (deploymentName !== undefined) this.model = deploymentName || 'gpt-4o';
    if (apiVersion !== undefined) this.apiVersion = apiVersion || '2025-04-01-preview';
    // Support both names for backwards compatibility
    if (maxOutputTokens !== undefined) this.settings.maxOutputTokens = maxOutputTokens;
    if (maxCompletionTokens !== undefined) this.settings.maxOutputTokens = maxCompletionTokens;
  }

  setModel(model) {
    this.model = model;
  }

  async testConnection() {
    if (!this.apiKey || !this.endpoint) {
      throw new Error('Azure OpenAI configuration incomplete');
    }

    // Use a minimal request to test connection (min 16 tokens required)
    const url = `${this.endpoint}/openai/responses?api-version=${this.apiVersion}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: 'Say "ok"'
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Azure OpenAI API error: ${response.status}`);
    }

    return true;
  }

  async generateMock(request, options = {}) {
    if (!this.apiKey || !this.endpoint) {
      throw new Error('Azure OpenAI configuration incomplete');
    }

    const prompt = this.buildMockPrompt(request, options);
    const systemPrompt = 'You are an expert at generating realistic mock data for APIs. Always return valid JSON only.';
    
    // Use the new responses endpoint with Bearer auth and 'input' parameter
    const url = `${this.endpoint}/openai/responses?api-version=${this.apiVersion}`;
    
    // Build request body - max_output_tokens is optional
    const requestBody = {
      model: this.model,
      input: `${systemPrompt}\n\n${prompt}`
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Azure OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    // Handle various response formats from the responses API
    const content = this.extractContent(result);
    
    return {
      data: this.parseJSONResponse(content),
      tokensUsed: result.usage?.total_tokens || 0
    };
  }

  extractContent(result) {
    // The Responses API returns an array of items (reasoning + message)
    // We need to find the message item and extract the text from output_text
    
    // Handle array response format (new Responses API)
    if (Array.isArray(result)) {
      const messageItem = result.find(item => item.type === 'message');
      if (messageItem && messageItem.content) {
        const outputTextItem = messageItem.content.find(c => c.type === 'output_text');
        if (outputTextItem && outputTextItem.text) {
          return outputTextItem.text;
        }
      }
    }
    
    // Handle object response format
    if (result.output) {
      // Check if output is an array (newer format)
      if (Array.isArray(result.output)) {
        const messageItem = result.output.find(item => item.type === 'message');
        if (messageItem && messageItem.content) {
          const outputTextItem = messageItem.content.find(c => c.type === 'output_text');
          if (outputTextItem && outputTextItem.text) {
            return outputTextItem.text;
          }
        }
      } else {
        return typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
      }
    }
    if (result.output_text) {
      return result.output_text;
    }
    if (result.choices && result.choices[0]) {
      return result.choices[0].message?.content || result.choices[0].text || '';
    }
    if (result.content) {
      return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    }
    return '';
  }

  async generateMultipleMocks(requests, options = {}) {
    if (!this.apiKey || !this.endpoint) {
      throw new Error('Azure OpenAI configuration incomplete');
    }

    const prompt = this.buildMultiMockPrompt(requests, options);
    const systemPrompt = 'You are an expert at generating realistic mock data for APIs. Generate consistent data across requests. Always return valid JSON only.';
    
    const url = `${this.endpoint}/openai/responses?api-version=${this.apiVersion}`;
    
    // Build request body - max_output_tokens is optional
    const requestBody = {
      model: this.model,
      input: `${systemPrompt}\n\n${prompt}`
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Azure OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    const content = this.extractContent(result);
    const parsed = this.parseJSONResponse(content);
    
    return {
      data: parsed,
      mocks: parsed.mocks || [parsed],
      tokensUsed: result.usage?.total_tokens || 0
    };
  }
}

// Anthropic Provider - Updated for latest API format
class AnthropicProvider extends BaseProvider {
  constructor() {
    super();
    this.model = 'claude-sonnet-4-5'; // Use short model name format
    this.baseUrl = 'https://api.anthropic.com/v1';
    this.anthropicVersion = '2023-06-01';
    // Provider-specific settings
    this.settings = {
      maxTokens: 4000,
      thinkingBudget: 2000
    };
  }

  configure(settings) {
    if (settings.maxTokens !== undefined) this.settings.maxTokens = settings.maxTokens;
    if (settings.thinkingBudget !== undefined) this.settings.thinkingBudget = settings.thinkingBudget;
  }

  async testConnection() {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
    }

    return true;
  }

  async generateMock(request, options = {}) {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const prompt = this.buildMockPrompt(request, options);
    const isThinkingModel = this.model.includes('thinking');
    
    const requestBody = {
      model: this.model,
      max_tokens: this.settings.maxTokens,
      messages: [{ role: 'user', content: prompt }]
    };

    // Add system prompt for non-thinking models
    if (!isThinkingModel) {
      requestBody.system = 'You are an expert at generating realistic mock data for APIs. Generate data that looks real and contextually appropriate. Always return valid JSON only, no explanation.';
    }

    // Thinking models may need extended thinking
    if (isThinkingModel) {
      requestBody.thinking = {
        type: 'enabled',
        budget_tokens: this.settings.thinkingBudget
      };
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
    }

    const result = await response.json();
    
    // Handle thinking model response format
    let content;
    if (isThinkingModel && result.content) {
      const textBlock = result.content.find(block => block.type === 'text');
      content = textBlock ? textBlock.text : result.content[0].text;
    } else {
      content = result.content[0].text;
    }
    
    return {
      data: this.parseJSONResponse(content),
      tokensUsed: (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0)
    };
  }

  async generateMultipleMocks(requests, options = {}) {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const prompt = this.buildMultiMockPrompt(requests, options);
    const isThinkingModel = this.model.includes('thinking');
    
    const requestBody = {
      model: this.model,
      max_tokens: this.settings.maxTokens * 2, // Double for multiple mocks
      messages: [{ role: 'user', content: prompt }]
    };

    if (!isThinkingModel) {
      requestBody.system = 'You are an expert at generating realistic mock data for APIs. Generate consistent data across requests. Always return valid JSON only.';
    }

    if (isThinkingModel) {
      requestBody.thinking = {
        type: 'enabled',
        budget_tokens: this.settings.thinkingBudget * 2
      };
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
    }

    const result = await response.json();
    
    let content;
    if (isThinkingModel && result.content) {
      const textBlock = result.content.find(block => block.type === 'text');
      content = textBlock ? textBlock.text : result.content[0].text;
    } else {
      content = result.content[0].text;
    }
    
    const parsed = this.parseJSONResponse(content);
    
    return {
      data: parsed,
      mocks: parsed.mocks || [parsed],
      tokensUsed: (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0)
    };
  }
}

// Google Gemini Provider - Updated for latest API format (x-goog-api-key header)
class GeminiProvider extends BaseProvider {
  constructor() {
    super();
    this.model = 'gemini-2.5-flash'; // Use flash as default for speed
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    // Provider-specific settings
    this.settings = {
      temperature: 0.7,
      maxOutputTokens: 4000,
      thinkingBudget: 2000
    };
  }

  configure(settings) {
    if (settings.temperature !== undefined) this.settings.temperature = settings.temperature;
    if (settings.maxOutputTokens !== undefined) this.settings.maxOutputTokens = settings.maxOutputTokens;
    if (settings.thinkingBudget !== undefined) this.settings.thinkingBudget = settings.thinkingBudget;
  }

  async testConnection() {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        'x-goog-api-key': this.apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    return true;
  }

  async generateMock(request, options = {}) {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const prompt = this.buildMockPrompt(request, options);
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const isThinkingModel = this.model.includes('thinking');
    
    const requestBody = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    // Add generation config for non-thinking models
    if (!isThinkingModel) {
      requestBody.generationConfig = {
        temperature: this.settings.temperature,
        maxOutputTokens: this.settings.maxOutputTokens
      };
      requestBody.systemInstruction = {
        parts: [{ text: 'You are an expert at generating realistic mock data for APIs. Generate data that looks real and contextually appropriate. Always return valid JSON only, no explanation.' }]
      };
    }

    // Thinking models configuration
    if (isThinkingModel) {
      requestBody.generationConfig = {
        maxOutputTokens: this.settings.maxOutputTokens,
        thinkingConfig: {
          thinkingBudget: this.settings.thinkingBudget
        }
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.candidates[0].content.parts[0].text;
    
    return {
      data: this.parseJSONResponse(content),
      tokensUsed: result.usageMetadata?.totalTokenCount || 0
    };
  }

  async generateMultipleMocks(requests, options = {}) {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const prompt = this.buildMultiMockPrompt(requests, options);
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const isThinkingModel = this.model.includes('thinking');
    
    const requestBody = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    // Add generation config for non-thinking models
    if (!isThinkingModel) {
      requestBody.generationConfig = {
        temperature: this.settings.temperature,
        maxOutputTokens: this.settings.maxOutputTokens * 2 // Double for multiple mocks
      };
      requestBody.systemInstruction = {
        parts: [{ text: 'You are an expert at generating realistic mock data for APIs. Generate consistent data across requests. Always return valid JSON only.' }]
      };
    }

    if (isThinkingModel) {
      requestBody.generationConfig = {
        maxOutputTokens: this.settings.maxOutputTokens * 2,
        thinkingConfig: {
          thinkingBudget: this.settings.thinkingBudget * 2
        }
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.candidates[0].content.parts[0].text;
    const parsed = this.parseJSONResponse(content);
    
    return {
      data: parsed,
      mocks: parsed.mocks || [parsed],
      tokensUsed: result.usageMetadata?.totalTokenCount || 0
    };
  }
}

// OpenRouter Provider
class OpenRouterProvider extends BaseProvider {
  constructor() {
    super();
    this.model = 'anthropic/claude-sonnet-4-5';
    this.baseUrl = 'https://openrouter.ai/api/v1';
  }

  async testConnection() {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'APIlot'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    return true;
  }

  async generateMock(request, options = {}) {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const prompt = this.buildMockPrompt(request, options);
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'APIlot'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at generating realistic mock data for APIs. Always return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `OpenRouter API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices[0].message.content;
    
    return {
      data: this.parseJSONResponse(content),
      tokensUsed: result.usage?.total_tokens || 0
    };
  }

  async generateMultipleMocks(requests, options = {}) {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const prompt = this.buildMultiMockPrompt(requests, options);
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'APIlot'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at generating realistic mock data for APIs. Generate consistent data across requests. Always return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 8000
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `OpenRouter API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices[0].message.content;
    const parsed = this.parseJSONResponse(content);
    
    return {
      data: parsed,
      mocks: parsed.mocks || [parsed],
      tokensUsed: result.usage?.total_tokens || 0
    };
  }
}

// Local Mock Provider (Pattern-based, no API required)
class LocalMockProvider extends BaseProvider {
  constructor() {
    super();
    this.generators = {
      // String patterns
      id: () => this.generateId(),
      uuid: () => this.generateUUID(),
      name: () => this.generateName(),
      firstName: () => this.generateFirstName(),
      lastName: () => this.generateLastName(),
      email: () => this.generateEmail(),
      phone: () => this.generatePhone(),
      address: () => this.generateAddress(),
      city: () => this.generateCity(),
      country: () => this.generateCountry(),
      url: () => this.generateUrl(),
      title: () => this.generateTitle(),
      description: () => this.generateDescription(),
      
      // Numbers
      age: () => this.randomInt(18, 80),
      count: () => this.randomInt(0, 100),
      price: () => this.randomFloat(1, 1000, 2),
      amount: () => this.randomFloat(1, 10000, 2),
      score: () => this.randomFloat(0, 100, 1),
      rating: () => this.randomFloat(1, 5, 1),
      percentage: () => this.randomFloat(0, 100, 1),
      
      // Dates
      date: () => this.generateDate(),
      createdAt: () => this.generatePastDate(),
      updatedAt: () => this.generateRecentDate(),
      timestamp: () => new Date().toISOString(),
      
      // Booleans
      active: () => Math.random() > 0.3,
      enabled: () => Math.random() > 0.3,
      verified: () => Math.random() > 0.5,
      
      // Default
      string: () => this.generateString(),
      number: () => this.randomInt(1, 1000),
      boolean: () => Math.random() > 0.5
    };
  }

  async testConnection() {
    return true;
  }

  async generateMock(request, options = {}) {
    if (request.requestType === 'graphql') {
      return this.generateGraphQLMocks(request);
    } else {
      return this.generateRESTMocks(request);
    }
  }

  async generateMultipleMocks(requests, options = {}) {
    // Generate consistent IDs for related requests
    const sharedIds = {
      userId: this.generateId(),
      courseId: this.generateId(),
      orderId: this.generateId(),
      productId: this.generateId()
    };
    
    const mocks = [];
    
    for (const request of requests) {
      const result = await this.generateMock(request, { ...options, sharedIds });
      mocks.push(result.data);
    }
    
    return {
      data: { mocks },
      mocks,
      tokensUsed: 0
    };
  }

  async generateGraphQLMocks(request) {
    const operationName = request.operationName || 'Unknown';
    const query = request.query || request.body || '';
    
    try {
      // If there's an existing response, use it as a template
      if (request.response && typeof request.response === 'object') {
        const mockData = this.generateFromTemplate(request.response);
        return { data: mockData, tokensUsed: 0 };
      }
      
      const mockData = this.parseAndGenerateMocks(query, operationName);
      return { data: { data: mockData }, tokensUsed: 0 };
    } catch (error) {
      return {
        data: {
          data: {
            [operationName]: this.generateBasicMock(operationName)
          }
        },
        tokensUsed: 0
      };
    }
  }

  async generateRESTMocks(request) {
    const endpoint = request.url || request.endpoint || '';
    const method = request.method || 'GET';
    
    // If there's an existing response, use it as a template
    if (request.response && typeof request.response === 'object') {
      const mockData = this.generateFromTemplate(request.response);
      return { data: mockData, tokensUsed: 0 };
    }
    
    const endpointParts = endpoint.split('/').filter(p => p && !p.startsWith(':') && !p.startsWith('{'));
    const resourceName = endpointParts[endpointParts.length - 1] || 'item';
    
    if (method === 'GET') {
      const isListEndpoint = !endpoint.match(/\/\d+$/) && !endpoint.match(/\/:[^/]+$/) && !endpoint.match(/\/\{[^}]+\}$/);
      
      if (isListEndpoint) {
        return { data: this.generateListResponse(resourceName), tokensUsed: 0 };
      } else {
        return { data: this.generateSingleResponse(resourceName), tokensUsed: 0 };
      }
    } else if (method === 'POST') {
      return {
        data: { ...this.generateSingleResponse(resourceName), message: 'Created successfully' },
        tokensUsed: 0
      };
    } else if (method === 'PUT' || method === 'PATCH') {
      return {
        data: { ...this.generateSingleResponse(resourceName), message: 'Updated successfully' },
        tokensUsed: 0
      };
    } else if (method === 'DELETE') {
      return {
        data: { success: true, message: 'Deleted successfully' },
        tokensUsed: 0
      };
    }
    
    return { data: this.generateSingleResponse(resourceName), tokensUsed: 0 };
  }

  // Generate mock data from an existing response template
  generateFromTemplate(template, depth = 0) {
    if (depth > 10) return template; // Prevent infinite recursion
    
    if (Array.isArray(template)) {
      // Generate 2-4 items for arrays
      const count = Math.min(4, Math.max(2, template.length || 3));
      const result = [];
      const itemTemplate = template[0] || {};
      
      for (let i = 0; i < count; i++) {
        result.push(this.generateFromTemplate(itemTemplate, depth + 1));
      }
      return result;
    }
    
    if (template && typeof template === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(template)) {
        result[key] = this.generateValueForField(key, typeof value, value, depth);
      }
      return result;
    }
    
    return this.generateValueForType(typeof template);
  }

  generateValueForField(fieldName, fieldType, currentValue, depth = 0) {
    const lowerName = fieldName.toLowerCase();
    
    // Check for specific field name patterns
    for (const [pattern, generator] of Object.entries(this.generators)) {
      if (lowerName.includes(pattern.toLowerCase())) {
        return generator();
      }
    }
    
    // Handle nested objects and arrays
    if (currentValue && typeof currentValue === 'object') {
      return this.generateFromTemplate(currentValue, depth + 1);
    }
    
    // Generate based on type
    return this.generateValueForType(fieldType);
  }

  generateValueForType(type) {
    switch (type) {
      case 'number':
        return this.randomInt(1, 1000);
      case 'boolean':
        return Math.random() > 0.5;
      case 'string':
      default:
        return this.generateString();
    }
  }

  parseAndGenerateMocks(schema, operationName) {
    const fieldPattern = /(\w+)(?:\s*:\s*(\w+))?/g;
    const fields = {};
    let match;
    
    while ((match = fieldPattern.exec(schema)) !== null) {
      const fieldName = match[1];
      const fieldType = match[2];
      
      if (!['query', 'mutation', 'subscription', 'type', 'input', 'enum', 'fragment', 'on'].includes(fieldName.toLowerCase())) {
        fields[fieldName] = this.generateValueForField(fieldName, fieldType);
      }
    }
    
    return { [operationName]: Object.keys(fields).length > 0 ? fields : this.generateBasicMock(operationName) };
  }

  generateBasicMock(name) {
    return {
      id: this.generateId(),
      name: this.generateName(),
      createdAt: this.generatePastDate(),
      updatedAt: this.generateRecentDate()
    };
  }

  generateListResponse(resourceName) {
    const items = [];
    const count = this.randomInt(3, 5);
    
    for (let i = 0; i < count; i++) {
      items.push(this.generateSingleResponse(resourceName));
    }
    
    return {
      [resourceName]: items,
      total: count,
      page: 1,
      pageSize: 10
    };
  }

  generateSingleResponse(resourceName) {
    return {
      id: this.generateId(),
      name: this.generateName(),
      description: this.generateDescription(),
      status: this.randomChoice(['active', 'inactive', 'pending']),
      createdAt: this.generatePastDate(),
      updatedAt: this.generateRecentDate()
    };
  }

  // Generator helpers
  generateId() {
    return String(this.randomInt(10000, 99999));
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  generateName() {
    const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'James', 'Emma', 'Robert', 'Olivia', 'William', 'Sophia'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Anderson', 'Taylor', 'Thomas'];
    return `${this.randomChoice(firstNames)} ${this.randomChoice(lastNames)}`;
  }

  generateFirstName() {
    const names = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'James', 'Emma', 'Robert', 'Olivia'];
    return this.randomChoice(names);
  }

  generateLastName() {
    const names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Anderson'];
    return this.randomChoice(names);
  }

  generateEmail() {
    const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'example.com', 'company.com'];
    const firstName = this.generateFirstName().toLowerCase();
    const lastName = this.generateLastName().toLowerCase();
    return `${firstName}.${lastName}${this.randomInt(1, 99)}@${this.randomChoice(domains)}`;
  }

  generatePhone() {
    return `+1-${this.randomInt(200, 999)}-${this.randomInt(100, 999)}-${this.randomInt(1000, 9999)}`;
  }

  generateAddress() {
    const streets = ['Main St', 'Oak Ave', 'Park Blvd', 'Cedar Lane', 'Maple Dr', 'First St', 'Second Ave'];
    return `${this.randomInt(100, 9999)} ${this.randomChoice(streets)}`;
  }

  generateCity() {
    const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'San Francisco', 'Seattle', 'Boston', 'Denver', 'Austin'];
    return this.randomChoice(cities);
  }

  generateCountry() {
    const countries = ['United States', 'Canada', 'United Kingdom', 'Germany', 'France', 'Australia', 'Japan', 'Singapore'];
    return this.randomChoice(countries);
  }

  generateUrl() {
    const domains = ['example.com', 'test.org', 'sample.net', 'demo.io'];
    return `https://www.${this.randomChoice(domains)}/${this.generateString(8)}`;
  }

  generateTitle() {
    const adjectives = ['Amazing', 'Incredible', 'Essential', 'Complete', 'Ultimate', 'Professional', 'Advanced'];
    const nouns = ['Guide', 'Solution', 'System', 'Platform', 'Service', 'Tool', 'Framework'];
    return `${this.randomChoice(adjectives)} ${this.randomChoice(nouns)}`;
  }

  generateDescription() {
    const descriptions = [
      'A comprehensive solution for modern needs.',
      'Designed to improve efficiency and productivity.',
      'Built with the latest technology standards.',
      'Trusted by thousands of users worldwide.',
      'Your go-to solution for everyday challenges.',
      'Streamlined workflow for better results.',
      'Enterprise-grade reliability and performance.'
    ];
    return this.randomChoice(descriptions);
  }

  generateString(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  generateDate() {
    const start = new Date(2023, 0, 1);
    const end = new Date();
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
  }

  generatePastDate() {
    const now = new Date();
    const past = new Date(now.getTime() - Math.random() * 365 * 24 * 60 * 60 * 1000);
    return past.toISOString();
  }

  generateRecentDate() {
    const now = new Date();
    const recent = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
    return recent.toISOString();
  }

  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  randomFloat(min, max, decimals = 2) {
    const value = Math.random() * (max - min) + min;
    return parseFloat(value.toFixed(decimals));
  }

  randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.AIMockService = AIMockService;
  window.OpenAIProvider = OpenAIProvider;
  window.AzureOpenAIProvider = AzureOpenAIProvider;
  window.AnthropicProvider = AnthropicProvider;
  window.GeminiProvider = GeminiProvider;
  window.OpenRouterProvider = OpenRouterProvider;
  window.LocalMockProvider = LocalMockProvider;
}
