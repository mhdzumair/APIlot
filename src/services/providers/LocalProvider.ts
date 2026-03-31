// Local Mock Provider — pattern-based generation, no API key required
import { BaseProvider } from './BaseProvider.js';
import type { AIProvider, MockRequest, MockOptions, MockResult, MultiMockResult } from './index.js';

type GeneratorFn = () => string | number | boolean;

export class LocalProvider extends BaseProvider implements AIProvider {
  private readonly generators: Record<string, GeneratorFn>;

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
      // Defaults
      string: () => this.generateString(),
      number: () => this.randomInt(1, 1000),
      boolean: () => Math.random() > 0.5,
    };
  }

  isConfigured(): boolean {
    // Local provider is always available
    return true;
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  async generateMock(request: MockRequest, options: MockOptions = {}): Promise<MockResult> {
    if (request.requestType === 'graphql') {
      return this.generateGraphQLMocks(request);
    } else {
      return this.generateRESTMocks(request);
    }
  }

  async generateMultipleMocks(requests: MockRequest[], options: MockOptions = {}): Promise<MultiMockResult> {
    // Generate consistent IDs for related requests
    const sharedIds: Record<string, string> = {
      userId: this.generateId(),
      courseId: this.generateId(),
      orderId: this.generateId(),
      productId: this.generateId(),
    };

    const mocks: unknown[] = [];

    for (const request of requests) {
      const result = await this.generateMock(request, { ...options, sharedIds });
      mocks.push(result.data);
    }

    return {
      data: { mocks },
      mocks,
      tokensUsed: 0,
    };
  }

  private async generateGraphQLMocks(request: MockRequest): Promise<MockResult> {
    const operationName = request.operationName ?? 'Unknown';
    const query = request.query ?? (typeof request.body === 'string' ? request.body : '') ?? '';

    try {
      if (request.response && typeof request.response === 'object') {
        const mockData = this.generateFromTemplate(request.response);
        return { data: mockData, tokensUsed: 0 };
      }

      const mockData = this.parseAndGenerateMocks(query, operationName);
      return { data: { data: mockData }, tokensUsed: 0 };
    } catch {
      return {
        data: {
          data: {
            [operationName]: this.generateBasicMock(),
          },
        },
        tokensUsed: 0,
      };
    }
  }

  private async generateRESTMocks(request: MockRequest): Promise<MockResult> {
    const endpoint = request.url ?? request.endpoint ?? '';
    const method = request.method ?? 'GET';

    if (request.response && typeof request.response === 'object') {
      const mockData = this.generateFromTemplate(request.response);
      return { data: mockData, tokensUsed: 0 };
    }

    const endpointParts = endpoint
      .split('/')
      .filter((p) => p && !p.startsWith(':') && !p.startsWith('{'));
    const resourceName = endpointParts[endpointParts.length - 1] ?? 'item';

    if (method === 'GET') {
      const isListEndpoint =
        !endpoint.match(/\/\d+$/) &&
        !endpoint.match(/\/:[^/]+$/) &&
        !endpoint.match(/\/\{[^}]+\}$/);

      if (isListEndpoint) {
        return { data: this.generateListResponse(resourceName), tokensUsed: 0 };
      } else {
        return { data: this.generateSingleResponse(), tokensUsed: 0 };
      }
    } else if (method === 'POST') {
      return {
        data: { ...this.generateSingleResponse(), message: 'Created successfully' },
        tokensUsed: 0,
      };
    } else if (method === 'PUT' || method === 'PATCH') {
      return {
        data: { ...this.generateSingleResponse(), message: 'Updated successfully' },
        tokensUsed: 0,
      };
    } else if (method === 'DELETE') {
      return {
        data: { success: true, message: 'Deleted successfully' },
        tokensUsed: 0,
      };
    }

    return { data: this.generateSingleResponse(), tokensUsed: 0 };
  }

  private generateFromTemplate(template: unknown, depth = 0): unknown {
    if (depth > 10) return template;

    if (Array.isArray(template)) {
      const count = Math.min(4, Math.max(2, template.length || 3));
      const itemTemplate = template[0] ?? {};
      return Array.from({ length: count }, () =>
        this.generateFromTemplate(itemTemplate, depth + 1)
      );
    }

    if (template !== null && typeof template === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
        result[key] = this.generateValueForField(key, typeof value, value, depth);
      }
      return result;
    }

    return this.generateValueForType(typeof template);
  }

  private generateValueForField(
    fieldName: string,
    fieldType: string,
    currentValue: unknown,
    depth = 0
  ): unknown {
    const lowerName = fieldName.toLowerCase();

    for (const [pattern, generator] of Object.entries(this.generators)) {
      if (lowerName.includes(pattern.toLowerCase())) {
        return generator();
      }
    }

    if (currentValue !== null && typeof currentValue === 'object') {
      return this.generateFromTemplate(currentValue, depth + 1);
    }

    return this.generateValueForType(fieldType);
  }

  private generateValueForType(type: string): unknown {
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

  private parseAndGenerateMocks(schema: string, operationName: string): Record<string, unknown> {
    const fieldPattern = /(\w+)(?:\s*:\s*(\w+))?/g;
    const fields: Record<string, unknown> = {};
    const graphqlKeywords = new Set([
      'query', 'mutation', 'subscription', 'type', 'input', 'enum', 'fragment', 'on',
    ]);

    let match: RegExpExecArray | null;
    while ((match = fieldPattern.exec(schema)) !== null) {
      const fieldName = match[1];
      const fieldType = match[2];

      if (!graphqlKeywords.has(fieldName.toLowerCase())) {
        fields[fieldName] = this.generateValueForField(fieldName, fieldType ?? 'string', null, 0);
      }
    }

    return {
      [operationName]:
        Object.keys(fields).length > 0 ? fields : this.generateBasicMock(),
    };
  }

  private generateBasicMock(): Record<string, unknown> {
    return {
      id: this.generateId(),
      name: this.generateName(),
      createdAt: this.generatePastDate(),
      updatedAt: this.generateRecentDate(),
    };
  }

  private generateListResponse(resourceName: string): Record<string, unknown> {
    const count = this.randomInt(3, 5);
    const items = Array.from({ length: count }, () => this.generateSingleResponse());

    return {
      [resourceName]: items,
      total: count,
      page: 1,
      pageSize: 10,
    };
  }

  private generateSingleResponse(): Record<string, unknown> {
    return {
      id: this.generateId(),
      name: this.generateName(),
      description: this.generateDescription(),
      status: this.randomChoice(['active', 'inactive', 'pending']),
      createdAt: this.generatePastDate(),
      updatedAt: this.generateRecentDate(),
    };
  }

  // ============================================
  // Generator helpers
  // ============================================

  private generateId(): string {
    return String(this.randomInt(10000, 99999));
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private generateName(): string {
    const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'James', 'Emma', 'Robert', 'Olivia', 'William', 'Sophia'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Anderson', 'Taylor', 'Thomas'];
    return `${this.randomChoice(firstNames)} ${this.randomChoice(lastNames)}`;
  }

  private generateFirstName(): string {
    const names = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'James', 'Emma', 'Robert', 'Olivia'];
    return this.randomChoice(names);
  }

  private generateLastName(): string {
    const names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Anderson'];
    return this.randomChoice(names);
  }

  private generateEmail(): string {
    const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'example.com', 'company.com'];
    const firstName = this.generateFirstName().toLowerCase();
    const lastName = this.generateLastName().toLowerCase();
    return `${firstName}.${lastName}${this.randomInt(1, 99)}@${this.randomChoice(domains)}`;
  }

  private generatePhone(): string {
    return `+1-${this.randomInt(200, 999)}-${this.randomInt(100, 999)}-${this.randomInt(1000, 9999)}`;
  }

  private generateAddress(): string {
    const streets = ['Main St', 'Oak Ave', 'Park Blvd', 'Cedar Lane', 'Maple Dr', 'First St', 'Second Ave'];
    return `${this.randomInt(100, 9999)} ${this.randomChoice(streets)}`;
  }

  private generateCity(): string {
    const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'San Francisco', 'Seattle', 'Boston', 'Denver', 'Austin'];
    return this.randomChoice(cities);
  }

  private generateCountry(): string {
    const countries = ['United States', 'Canada', 'United Kingdom', 'Germany', 'France', 'Australia', 'Japan', 'Singapore'];
    return this.randomChoice(countries);
  }

  private generateUrl(): string {
    const domains = ['example.com', 'test.org', 'sample.net', 'demo.io'];
    return `https://www.${this.randomChoice(domains)}/${this.generateString(8)}`;
  }

  private generateTitle(): string {
    const adjectives = ['Amazing', 'Incredible', 'Essential', 'Complete', 'Ultimate', 'Professional', 'Advanced'];
    const nouns = ['Guide', 'Solution', 'System', 'Platform', 'Service', 'Tool', 'Framework'];
    return `${this.randomChoice(adjectives)} ${this.randomChoice(nouns)}`;
  }

  private generateDescription(): string {
    const descriptions = [
      'A comprehensive solution for modern needs.',
      'Designed to improve efficiency and productivity.',
      'Built with the latest technology standards.',
      'Trusted by thousands of users worldwide.',
      'Your go-to solution for everyday challenges.',
      'Streamlined workflow for better results.',
      'Enterprise-grade reliability and performance.',
    ];
    return this.randomChoice(descriptions);
  }

  private generateString(length = 10): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateDate(): string {
    const start = new Date(2023, 0, 1);
    const end = new Date();
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
  }

  private generatePastDate(): string {
    const now = new Date();
    const past = new Date(now.getTime() - Math.random() * 365 * 24 * 60 * 60 * 1000);
    return past.toISOString();
  }

  private generateRecentDate(): string {
    const now = new Date();
    const recent = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
    return recent.toISOString();
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomFloat(min: number, max: number, decimals = 2): number {
    const value = Math.random() * (max - min) + min;
    return parseFloat(value.toFixed(decimals));
  }

  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }
}
