// Base provider with shared utilities: sanitization, prompt building, JSON parsing
import type { MockRequest, MockOptions } from './index.js';

type SanitizeMode = 'full' | 'sanitized' | 'structure' | 'none';

export abstract class BaseProvider {
  protected apiKey: string | null = null;
  protected model: string | null = null;

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  setModel(model: string): void {
    this.model = model;
  }

  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  // ============================================
  // Response Sanitization Methods
  // ============================================

  sanitizeResponse(data: unknown, mode: SanitizeMode = 'sanitized'): unknown {
    if (mode === 'none' || data === undefined) return null;
    if (mode === 'full') return data;
    return this.processValue(data, mode, 0);
  }

  private processValue(value: unknown, mode: SanitizeMode, depth: number): unknown {
    if (value === null || value === undefined) return null;

    if (Array.isArray(value)) {
      const limited = value.slice(0, 2);
      return limited.map((item) => this.processValue(item, mode, depth + 1));
    }

    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        result[key] = this.processValue(val, mode, depth + 1);
      }
      return result;
    }

    if (mode === 'structure') {
      if (typeof value === 'string') return '<string>';
      if (typeof value === 'number') return '<number>';
      if (typeof value === 'boolean') return '<boolean>';
      return '<unknown>';
    }

    return this.sanitizeValue(value);
  }

  private sanitizeValue(value: unknown): unknown {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value;

    if (typeof value === 'string') {
      if (value.startsWith('__')) return value;
      if (value.length <= 15 && /^[a-z_]+$/i.test(value)) return value;

      if (this.isEmail(value)) return 'user@example.com';
      if (this.isUUID(value)) return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
      if (this.isHexId(value)) return 'ffffffff00000000xxxxxxxxxxxxxxxx';
      if (this.isPhoneNumber(value)) return '+1-555-000-0000';
      if (this.looksLikeUrl(value)) return 'https://example.com/path';
      if (this.looksLikeName(value)) return 'Sample Name';
      if (this.looksLikeAddress(value)) return '123 Example Street, City, ST 00000';

      if (value.length < 30) return value;
      return '<redacted>';
    }

    return value;
  }

  // ============================================
  // Sensitive Data Detection Helpers
  // ============================================

  private isEmail(str: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  }

  private isUUID(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  }

  private isHexId(str: string): boolean {
    return /^[0-9a-f]{24,}$/i.test(str);
  }

  private isPhoneNumber(str: string): boolean {
    return /^\+?[\d\s\-()]{10,}$/.test(str);
  }

  private looksLikeUrl(str: string): boolean {
    return /^https?:\/\//.test(str);
  }

  private looksLikeName(str: string): boolean {
    return /^[A-Z][a-z]+(?: [A-Z][a-z]+){1,2}$/.test(str);
  }

  private looksLikeAddress(str: string): boolean {
    return /\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)/i.test(str);
  }

  // ============================================
  // Prompt Building Methods
  // ============================================

  protected buildMockPrompt(request: MockRequest, options: MockOptions = {}): string {
    const { userContext = '' } = options;
    const responseMode = options.includeExampleResponse === false
      ? 'none'
      : ((options.responseMode ?? 'sanitized') as SanitizeMode);

    let prompt = request.requestType === 'graphql'
      ? this.buildGraphQLPrompt(request, { ...options, responseMode })
      : this.buildRESTPrompt(request, { ...options, responseMode });

    if (userContext && userContext.trim()) {
      prompt += `\n\nAdditional Context from User:\n${userContext.trim()}`;
    }

    return prompt;
  }

  protected buildMultiMockPrompt(requests: MockRequest[], options: MockOptions = {}): string {
    const { userContext = '' } = options;
    const responseMode = (options.responseMode ?? 'sanitized') as SanitizeMode;

    let prompt = `Generate realistic mock data for the following ${requests.length} API requests. \nThese requests are related and may share common IDs or data relationships.\nIMPORTANT: Use consistent IDs and data across all mocks so they can work together in a UI.\nCRITICAL: Match the EXACT structure from each response template - if a field is an array [], keep it as array; if it's an object {}, keep it as object.\n\n`;

    requests.forEach((request, index) => {
      prompt += `\n--- REQUEST ${index + 1} ---\n`;

      if (request.requestType === 'graphql') {
        prompt += `Type: GraphQL ${request.operationType ?? 'query'}\nOperation: ${request.operationName ?? 'Unknown'}\nQuery:\n${request.query ?? request.body ?? 'N/A'}\nVariables: ${JSON.stringify(request.variables ?? {}, null, 2)}\n`;
      } else {
        const bodyStr = request.body
          ? `Request Body: ${typeof request.body === 'string' ? request.body : JSON.stringify(request.body, null, 2)}`
          : '';
        prompt += `Type: REST API\nMethod: ${request.method ?? 'GET'}\nEndpoint: ${request.url ?? request.endpoint ?? ''}\n${bodyStr}\n`;
      }

      if (responseMode !== 'none' && request.response) {
        const sanitizedResponse = this.sanitizeResponse(request.response, responseMode);
        if (sanitizedResponse) {
          const responseStr = JSON.stringify(sanitizedResponse, null, 2);
          const modeDescription = this.getResponseModeDescription(responseMode);
          prompt += `\n${modeDescription}:\n${responseStr.substring(0, 1000)}${responseStr.length > 1000 ? '...' : ''}\n`;
        }
      }
    });

    prompt += `\n--- OUTPUT FORMAT ---\nReturn a JSON object with a "mocks" array containing mock responses for each request in order.\nEach mock should match the structure expected by its request type.\n\nFor GraphQL: { "data": { "operationName": { ... } } }\nFor REST: The response body JSON\n\nExample output format:\n{\n  "mocks": [\n    { "data": { "GetUsers": [...] } },\n    { "items": [...], "total": 10 }\n  ]\n}\n\nRequirements:\n1. Generate realistic, contextually appropriate data\n2. Use CONSISTENT IDs across related requests (e.g., if request 1 returns user IDs, use same IDs in request 2)\n3. Maintain data relationships (parent-child, foreign keys, etc.)\n4. Use proper data types based on field names\n5. Return ONLY valid JSON, no explanation\n`;

    if (userContext && userContext.trim()) {
      prompt += `\n\nUser Instructions:\n${userContext.trim()}`;
    }

    return prompt;
  }

  private buildGraphQLPrompt(request: MockRequest, options: MockOptions & { responseMode?: string } = {}): string {
    const responseMode = (options.responseMode ?? 'sanitized') as SanitizeMode;
    const operationName = request.operationName ?? 'Unknown';
    const operationType = request.operationType ?? 'query';
    const query = request.query ?? (typeof request.body === 'string' ? request.body : '') ?? '';
    const variables = request.variables ?? {};

    let prompt = `Generate realistic mock data for this GraphQL ${operationType}:\n\nOperation Name: ${operationName}\nQuery:\n${query}\n\nVariables: ${JSON.stringify(variables, null, 2)}\n`;

    if (responseMode !== 'none' && request.response) {
      const sanitizedResponse = this.sanitizeResponse(request.response, responseMode);
      if (sanitizedResponse) {
        const responseStr = JSON.stringify(sanitizedResponse, null, 2);
        const modeDescription = this.getResponseModeDescription(responseMode);
        prompt += `\n${modeDescription}:\n${responseStr.substring(0, 2000)}${responseStr.length > 2000 ? '\n... (truncated)' : ''}\n`;
      }
    }

    prompt += `\nRequirements:\n1. Generate realistic, contextually appropriate data based on field names\n2. Use proper data types (strings for names, valid emails, realistic dates, etc.)\n3. For arrays, generate 2-5 items with varied but realistic data\n4. For IDs, use realistic formats (numeric IDs, UUIDs, or contextual IDs)\n5. IMPORTANT: Match the EXACT structure from the response template - if a field is an array [], keep it as array; if it's an object {}, keep it as object\n6. Return ONLY valid JSON wrapped in a "data" key\n\nOutput the mock response JSON only, no explanation.`;

    return prompt;
  }

  private buildRESTPrompt(request: MockRequest, options: MockOptions & { responseMode?: string } = {}): string {
    const responseMode = (options.responseMode ?? 'sanitized') as SanitizeMode;
    const method = request.method ?? 'GET';
    const endpoint = request.url ?? request.endpoint ?? '';
    const body = request.body;

    let prompt = `Generate realistic mock data for this REST API endpoint:\n\nEndpoint: ${endpoint}\nHTTP Method: ${method}\n`;
    if (body) {
      prompt += `Request Body: ${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}\n`;
    }

    if (responseMode !== 'none' && request.response) {
      const sanitizedResponse = this.sanitizeResponse(request.response, responseMode);
      if (sanitizedResponse) {
        const responseStr = JSON.stringify(sanitizedResponse, null, 2);
        const modeDescription = this.getResponseModeDescription(responseMode);
        prompt += `\n${modeDescription}:\n${responseStr.substring(0, 2000)}${responseStr.length > 2000 ? '\n... (truncated)' : ''}\n`;
      }
    }

    prompt += `\nRequirements:\n1. Generate realistic, contextually appropriate data based on the endpoint pattern\n2. For GET requests returning lists, generate 3-5 items\n3. For POST/PUT requests, generate a typical success response\n4. Use proper data types based on field names\n5. Include common fields like id, createdAt, updatedAt where appropriate\n6. IMPORTANT: Match the EXACT structure from the response template - if a field is an array [], keep it as array; if it's an object {}, keep it as object\n7. Return ONLY valid JSON\n\nOutput the mock response JSON only, no explanation.`;

    return prompt;
  }

  protected getResponseModeDescription(mode: string): string {
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

  // ============================================
  // JSON Parsing
  // ============================================

  protected parseJSONResponse(content: string): unknown {
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
