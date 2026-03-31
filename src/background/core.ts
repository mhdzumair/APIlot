import type { LogEntry, RequestData, ResponseData } from '../types/requests';
import type { ApiRule } from '../types/rules';
import type { Settings, AISettings, PerformanceData } from '../types/settings';
import type { Session } from '../types/sessions';
import { getMatchingRules } from '../shared/ruleMatch';
import type { RequestMatchData } from '../shared/ruleMatch';
import type { BrowserAdapter } from './types';

// Internal performance entry shape (not exported; extends LogEntry usage)
interface PerformanceEntry {
  id: unknown;
  timestamp: string;
  requestType: string;
  operationName?: string;
  method?: string;
  endpoint?: string;
  url: string;
  responseTime: number;
  status: unknown;
  success: boolean;
  requestSize: number;
  responseSize: number;
  [key: string]: unknown;
}

// Internal webRequest buffer entry shape
interface WebRequestBufferEntry {
  webRequestId: string;
  browserRequestId: string;
  url: string;
  method: string;
  timestamp: string;
  startTime: number;
  tabId: number;
  type: string;
  frameId: number;
  parentFrameId: number;
  source: string;
  responseStatus?: number;
  responseStatusText?: string;
  responseHeaders?: unknown;
  endTime?: number;
  responseTime?: number;
  completed?: boolean;
}

export class APITestingCore {
  private adapter: BrowserAdapter;
  private maxLogSize: number;
  private readyPromise: Promise<void>;

  // Initialized in initializeCore
  private rules!: Map<string, ApiRule>;
  private settings!: Settings;
  private aiSettings!: AISettings;
  private performanceData!: PerformanceData;
  private sessions!: Session[];
  private capturedRequestIds!: Set<string>;
  private webRequestBuffer!: Map<number, WebRequestBufferEntry[]>;

  constructor(adapter: BrowserAdapter) {
    this.adapter = adapter;
    this.maxLogSize = 1000;
    this.readyPromise = this.initializeCore();
  }

  async waitForReady(): Promise<void> {
    await this.readyPromise;
  }

  private async initializeCore(): Promise<void> {
    const data = await this.adapter.loadFromStorage([
      'apiRules',
      'graphqlRules',
      'tabStates',
      'settings',
      'aiSettings',
      'performanceData',
      'sessions',
    ]);

    // Initialize rules (support both old graphqlRules and new apiRules)
    this.rules = new Map();
    if (data.apiRules) {
      this.rules = new Map(Object.entries(data.apiRules));
    } else if (data.graphqlRules) {
      // Migrate old GraphQL rules
      this.rules = new Map(Object.entries(data.graphqlRules));
      for (const [, rule] of this.rules) {
        if (!rule.requestType) {
          rule.requestType = 'graphql';
        }
      }
    }

    // Initialize tab states using adapter
    await this.adapter.initializeTabStates(
      data.tabStates as Record<string, import('./types').TabState> | undefined
    );

    // Initialize settings
    this.settings = (data.settings as Settings) || {
      logProfile: 'basic',
      theme: 'system',
    };

    // Initialize AI settings
    this.aiSettings = (data.aiSettings as AISettings) || {
      provider: 'local',
      openaiApiKey: '',
      openaiModel: 'gpt-4o',
      anthropicApiKey: '',
      anthropicModel: 'claude-sonnet-4-20250514',
      callsCount: 0,
      tokensUsed: 0,
      mocksGenerated: 0,
    };

    // Initialize performance data
    this.performanceData = (data.performanceData as PerformanceData) || {
      requests: [],
      aggregates: {
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        totalResponseTime: 0,
      },
    };

    // Initialize sessions for time-travel
    this.sessions = (data.sessions as Session[]) || [];

    // Track captured request IDs to deduplicate between injected script and webRequest
    this.capturedRequestIds = new Set();
    this.webRequestBuffer = new Map();

    // Setup browser-level network capture for early requests
    this.setupWebRequestCapture();

    console.log(
      `[CORE] APIlot initialized - Rules: ${this.rules.size}, Profile: ${this.settings.logProfile}`
    );
  }

  private setupWebRequestCapture(): void {
    const webRequest =
      (typeof chrome !== 'undefined' && chrome.webRequest) ||
      (typeof browser !== 'undefined' && (browser as unknown as Record<string, unknown>).webRequest);
    if (!webRequest) {
      console.log('[CORE] webRequest API not available');
      return;
    }

    const apiPatterns = [
      '/api/',
      '/v1/',
      '/v2/',
      '/v3/',
      '/rest/',
      '/graphql',
      '/query',
      '/services/',
    ];
    const staticExtensions = [
      '.js',
      '.css',
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.svg',
      '.ico',
      '.woff',
      '.woff2',
      '.ttf',
      '.eot',
      '.map',
      '.html',
      '.htm',
    ];

    const isApiRequest = (url: string): boolean => {
      if (!url) return false;
      const urlLower = url.toLowerCase();
      const urlPath = urlLower.split('?')[0];
      if (staticExtensions.some((ext) => urlPath.endsWith(ext))) return false;
      if (
        urlLower.includes('chrome-extension://') ||
        urlLower.includes('moz-extension://')
      )
        return false;
      return apiPatterns.some((pattern) => urlLower.includes(pattern));
    };

    const wr = webRequest as {
      onBeforeRequest: {
        addListener: (
          cb: (details: Record<string, unknown>) => void,
          filter: unknown,
          extra?: string[]
        ) => void;
      };
      onHeadersReceived: {
        addListener: (
          cb: (details: Record<string, unknown>) => void,
          filter: unknown,
          extra?: string[]
        ) => void;
      };
      onCompleted: {
        addListener: (
          cb: (details: Record<string, unknown>) => Promise<void>,
          filter: unknown
        ) => void;
      };
      onErrorOccurred: {
        addListener: (
          cb: (details: Record<string, unknown>) => void,
          filter: unknown
        ) => void;
      };
    };

    wr.onBeforeRequest.addListener(
      (details) => {
        const tabState = this.adapter.peekTabState(details.tabId as number);
        if (!tabState || !tabState.devToolsOpen || !tabState.enabled) {
          return;
        }
        if (!isApiRequest(details.url as string)) return;

        const webRequestId = `webreq_${details.requestId}_${details.tabId}`;

        const requestData: WebRequestBufferEntry = {
          webRequestId,
          browserRequestId: details.requestId as string,
          url: details.url as string,
          method: details.method as string,
          timestamp: new Date().toISOString(),
          startTime: Date.now(),
          tabId: details.tabId as number,
          type: details.type as string,
          frameId: details.frameId as number,
          parentFrameId: details.parentFrameId as number,
          source: 'webRequest',
        };

        const tabId = details.tabId as number;
        if (!this.webRequestBuffer.has(tabId)) {
          this.webRequestBuffer.set(tabId, []);
        }
        this.webRequestBuffer.get(tabId)!.push(requestData);

        console.log('[CORE] WebRequest captured:', {
          url: details.url,
          method: details.method,
          tabId: details.tabId,
        });
      },
      { urls: ['<all_urls>'] },
      ['requestBody']
    );

    wr.onHeadersReceived.addListener(
      (details) => {
        const tabBuffer = this.webRequestBuffer.get(details.tabId as number);
        if (!tabBuffer) return;

        const request = tabBuffer.find(
          (r) => r.browserRequestId === (details.requestId as string)
        );
        if (request) {
          request.responseStatus = details.statusCode as number;
          request.responseStatusText = details.statusLine as string;
          request.responseHeaders = details.responseHeaders;
        }
      },
      { urls: ['<all_urls>'] },
      ['responseHeaders']
    );

    wr.onCompleted.addListener(
      async (details) => {
        const tabBuffer = this.webRequestBuffer.get(details.tabId as number);
        if (!tabBuffer) return;

        const requestIndex = tabBuffer.findIndex(
          (r) => r.browserRequestId === (details.requestId as string)
        );
        if (requestIndex === -1) return;

        const request = tabBuffer[requestIndex];
        request.endTime = Date.now();
        request.responseTime = request.endTime - request.startTime;
        request.completed = true;

        const isDuplicate = this.isLikelyDuplicate(
          request,
          details.tabId as number
        );

        if (!isDuplicate) {
          console.log(
            '[CORE] WebRequest completing (not captured by injector):',
            {
              url: request.url,
              method: request.method,
              status: details.statusCode,
              time: request.responseTime + 'ms',
            }
          );
          await this.logWebRequest(request, details);
        }

        tabBuffer.splice(requestIndex, 1);
      },
      { urls: ['<all_urls>'] }
    );

    wr.onErrorOccurred.addListener(
      (details) => {
        const tabBuffer = this.webRequestBuffer.get(details.tabId as number);
        if (!tabBuffer) return;

        const requestIndex = tabBuffer.findIndex(
          (r) => r.browserRequestId === (details.requestId as string)
        );
        if (requestIndex !== -1) {
          tabBuffer.splice(requestIndex, 1);
        }
      },
      { urls: ['<all_urls>'] }
    );

    const tabs =
      (typeof chrome !== 'undefined' && chrome.tabs) ||
      (typeof browser !== 'undefined' && browser.tabs);
    if (tabs) {
      tabs.onUpdated.addListener((tabId: number, changeInfo: { status?: string }) => {
        if (changeInfo.status === 'loading') {
          this.clearWebRequestBuffer(tabId);
        }
      });

      tabs.onRemoved.addListener((tabId: number) => {
        this.clearWebRequestBuffer(tabId);
      });
    }

    console.log('[CORE] WebRequest capture initialized');
  }

  private isLikelyDuplicate(
    webRequest: WebRequestBufferEntry,
    tabId: number
  ): boolean {
    const tabState = this.adapter.peekTabState(tabId);
    if (!tabState || !tabState.requestLog) return false;

    const recentCutoff = Date.now() - 2000;

    for (const logEntry of tabState.requestLog) {
      if (!logEntry.timestamp) continue;

      const logTime = new Date(logEntry.timestamp).getTime();
      if (logTime < recentCutoff) continue;

      if (
        logEntry.url === webRequest.url &&
        (logEntry.method ?? 'POST') === webRequest.method
      ) {
        console.log(
          '[CORE] Duplicate detected, skipping webRequest:',
          webRequest.url
        );
        return true;
      }
    }

    return false;
  }

  private async logWebRequest(
    request: WebRequestBufferEntry,
    details: Record<string, unknown>
  ): Promise<void> {
    const requestType = this.detectRequestType(request.url, request.method);

    const logEntry = {
      id: request.webRequestId,
      requestType,
      url: request.url,
      method: request.method,
      timestamp: request.timestamp,
      startTime: request.startTime,
      responseStatus: request.responseStatus ?? (details.statusCode as number),
      responseTimestamp: new Date().toISOString(),
      endTime: request.endTime,
      source: 'webRequest' as const,
      frameId: request.frameId,
      operationName:
        requestType === 'rest'
          ? this.generateOperationName(request.url, request.method)
          : 'WebRequest',
    };

    await this.adapter.notifyDevTools(
      'REQUEST_LOGGED',
      logEntry,
      request.tabId
    );

    await this.adapter.notifyDevTools(
      'RESPONSE_LOGGED',
      {
        ...logEntry,
        response: null,
        responseHeaders: request.responseHeaders,
      },
      request.tabId
    );
  }

  private detectRequestType(url: string, _method: string): 'graphql' | 'rest' {
    if (!url) return 'rest';
    const urlLower = url.toLowerCase();
    if (urlLower.includes('/graphql') || urlLower.includes('/query')) {
      return 'graphql';
    }
    return 'rest';
  }

  private generateOperationName(url: string, method: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter((p) => p);
      const meaningfulParts = pathParts.filter((part) => {
        if (/^\d+$/.test(part)) return false;
        if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(part)) return false;
        if (/^v\d+$/i.test(part)) return false;
        if (part.toLowerCase() === 'api') return false;
        return true;
      });

      if (meaningfulParts.length > 0) {
        const resource = meaningfulParts[meaningfulParts.length - 1];
        const titleCase =
          resource.charAt(0).toUpperCase() + resource.slice(1).toLowerCase();
        return `${method} ${titleCase}`;
      }
    } catch {
      // Ignore URL parsing errors
    }
    return `${method} Request`;
  }

  private markRequestCaptured(
    _requestId: string,
    _url: string,
    _tabId: number
  ): void {
    // Deduplication key — simple implementation; clean-up is handled by
    // removing matching webRequest buffer entries in logRequest.
  }

  private clearWebRequestBuffer(tabId: number): void {
    if (this.webRequestBuffer && this.webRequestBuffer.has(tabId)) {
      console.log(`[CORE] Clearing webRequest buffer for tab ${tabId}`);
      this.webRequestBuffer.delete(tabId);
    }
  }

  private async saveRules(): Promise<void> {
    const rulesObj = Object.fromEntries(this.rules);
    const tabStatesObj = await this.adapter.getTabStatesForStorage();

    await this.adapter.saveToStorage({
      apiRules: rulesObj,
      tabStates: tabStatesObj,
      settings: this.settings,
      aiSettings: this.aiSettings,
      performanceData: this.performanceData,
      sessions: this.sessions as unknown as undefined,
    });
  }

  private addRule(rule: Partial<ApiRule>): string {
    const ruleId =
      'rule_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const newRule: ApiRule = {
      ...(rule as ApiRule),
      id: ruleId,
      enabled: rule.enabled !== false,
      createdAt: new Date().toISOString(),
      requestType: rule.requestType ?? 'graphql',
      action: rule.action ?? 'mock',
      name: rule.name ?? ruleId,
    };

    this.rules.set(ruleId, newRule);
    return ruleId;
  }

  private updateRule(ruleId: string, updates: Partial<ApiRule>): void {
    if (this.rules.has(ruleId)) {
      const existingRule = this.rules.get(ruleId)!;
      const updatedRule: ApiRule = { ...existingRule, ...updates, id: ruleId };
      this.rules.set(ruleId, updatedRule);
    }
  }

  private deleteRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  private findMatchingRules(
    requestData: Partial<RequestData>,
    url: string
  ): ApiRule[] {
    const matchData: RequestMatchData = {
      requestType: requestData.requestType ?? 'graphql',
      url,
      operationName: requestData.operationName,
      method: requestData.method,
      body: requestData.body,
      variables: requestData.variables,
    };

    return getMatchingRules(this.rules, matchData);
  }

  private exportRules(): {
    version: string;
    application: string;
    timestamp: string;
    totalRules: number;
    rules: ApiRule[];
  } {
    return {
      version: '2.0.0',
      application: 'APIlot',
      timestamp: new Date().toISOString(),
      totalRules: this.rules.size,
      rules: Array.from(this.rules.values()),
    };
  }

  private importRules(data: { rules?: unknown }): void {
    if (!data.rules || !Array.isArray(data.rules)) {
      throw new Error('Invalid rules data');
    }

    (data.rules as Partial<ApiRule>[]).forEach((rule) => {
      this.addRule(rule);
    });
  }

  // ---------------------------------------------------------------------------
  // Performance tracking
  // ---------------------------------------------------------------------------

  private trackPerformance(
    requestData: Partial<LogEntry>,
    responseData: { responseTime?: number; status?: number; response?: unknown }
  ): void {
    const entry: PerformanceEntry = {
      id: (requestData as unknown as Record<string, unknown>).requestId,
      timestamp: new Date().toISOString(),
      requestType: requestData.requestType ?? 'graphql',
      operationName: requestData.operationName,
      method: requestData.method,
      endpoint: requestData.endpoint,
      url: requestData.url ?? '',
      responseTime: responseData.responseTime ?? 0,
      status: responseData.status,
      success:
        typeof responseData.status === 'number' &&
        responseData.status >= 200 &&
        responseData.status < 400,
      requestSize: JSON.stringify(requestData).length,
      responseSize: responseData.response
        ? JSON.stringify(responseData.response).length
        : 0,
    };

    if (this.performanceData.requests.length >= 1000) {
      this.performanceData.requests.shift();
    }
    this.performanceData.requests.push(entry);

    this.performanceData.aggregates.totalRequests++;
    if (entry.success) {
      this.performanceData.aggregates.successCount++;
    } else {
      this.performanceData.aggregates.errorCount++;
    }
    this.performanceData.aggregates.totalResponseTime += entry.responseTime;
  }

  private getPerformanceMetrics(timeRange = 'all'): unknown {
    let requests = (this.performanceData.requests as PerformanceEntry[]) || [];

    if (timeRange !== 'all') {
      const now = Date.now();
      let cutoff = 0;
      switch (timeRange) {
        case 'hour':
          cutoff = now - 3600000;
          break;
        case 'day':
          cutoff = now - 86400000;
          break;
        case 'week':
          cutoff = now - 604800000;
          break;
        default:
          cutoff = 0;
      }
      requests = requests.filter(
        (r) => new Date(r.timestamp).getTime() > cutoff
      );
    }

    if (requests.length === 0) {
      return {
        avgResponseTime: 0,
        totalRequests: 0,
        successRate: 100,
        activeRequests: 0,
        slowestRequests: [],
        requestsByType: { graphql: 0, rest: 0 },
        timeSeriesData: [],
      };
    }

    const totalResponseTime = requests.reduce(
      (sum, r) => sum + (r.responseTime || 0),
      0
    );
    const successCount = requests.filter(
      (r) => r.success || r.status === 'success'
    ).length;

    const slowestRequests = [...requests]
      .sort((a, b) => (b.responseTime || 0) - (a.responseTime || 0))
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        requestType: r.requestType || 'graphql',
        operationName: r.operationName,
        endpoint: r.endpoint,
        url: r.url,
        responseTime: r.responseTime,
        status: r.status || (r.success ? 'success' : 'error'),
        httpStatus: r.httpStatus || r.responseStatus,
        timestamp: r.timestamp,
      }));

    const requestsByType = {
      graphql: requests.filter((r) => r.requestType === 'graphql').length,
      rest: requests.filter((r) => r.requestType === 'rest').length,
    };

    const timeSeriesData = requests.slice(-50).map((r) => ({
      timestamp: r.timestamp,
      responseTime: r.responseTime,
      status: r.status || (r.success ? 'success' : 'error'),
      requestType: r.requestType,
    }));

    return {
      avgResponseTime: Math.round(totalResponseTime / requests.length),
      totalRequests: requests.length,
      successRate: Math.round((successCount / requests.length) * 100),
      activeRequests: 0,
      slowestRequests,
      requestsByType,
      timeSeriesData,
    };
  }

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  private createSession(name?: string): Session {
    const session: Session = {
      id: 'session_' + Date.now(),
      name: name ?? `Session ${this.sessions.length + 1}`,
      startTime: new Date().toISOString(),
      endTime: null,
      requests: [],
      status: 'recording',
      metadata: { userAgent: '', url: '' },
    };
    this.sessions.push(session);
    return session;
  }

  private endSession(sessionId: string): Session | null {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.endTime = new Date().toISOString();
      session.status = 'completed';
    }
    return session ?? null;
  }

  private addRequestToSession(
    sessionId: string,
    requestData: Partial<LogEntry>,
    responseData: unknown
  ): void {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session && session.status === 'recording') {
      session.requests.push({
        id: (requestData as Record<string, string>).requestId ?? Date.now().toString(),
        sequenceNumber: session.requests.length,
        timestamp: new Date().toISOString(),
        relativeTime: 0,
        requestType: requestData.requestType ?? 'graphql',
        url: requestData.url ?? '',
        method: requestData.method ?? 'POST',
        operationName: requestData.operationName,
        request: requestData,
        response: responseData,
        modified: false,
      } as unknown as import('../types/sessions').RecordedRequest);
    }
  }

  private getSessions(): Session[] {
    return this.sessions;
  }

  private deleteSession(sessionId: string): boolean {
    const index = this.sessions.findIndex((s) => s.id === sessionId);
    if (index !== -1) {
      this.sessions.splice(index, 1);
      return true;
    }
    return false;
  }

  private exportSession(sessionId: string): unknown {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    return {
      version: '1.0.0',
      application: 'APIlot',
      exportedAt: new Date().toISOString(),
      session,
    };
  }

  private importSession(data: { session?: unknown }): Session {
    if (!data.session) {
      throw new Error('Invalid session data');
    }

    const session: Session = {
      ...(data.session as Session),
      id: 'session_' + Date.now(),
      importedAt: new Date().toISOString(),
    };
    this.sessions.push(session);
    return session;
  }

  // ---------------------------------------------------------------------------
  // Request / response logging
  // ---------------------------------------------------------------------------

  async logRequest(
    requestData: RequestData,
    tabId: number | undefined
  ): Promise<void> {
    const requestType = requestData.requestType ?? 'graphql';
    console.log(`[CORE] Logging ${requestType} request for tab ${tabId}:`, {
      requestId: requestData.requestId,
      operationName: requestData.operationName,
      method: requestData.method,
      url: requestData.url,
    });

    if (!tabId) {
      console.warn('[CORE] No tab ID provided for request logging');
      return;
    }

    this.markRequestCaptured(
      requestData.requestId ?? '',
      requestData.url,
      tabId
    );

    const tabBuffer = this.webRequestBuffer?.get(tabId);
    if (tabBuffer) {
      const matchIndex = tabBuffer.findIndex(
        (r) =>
          r.url === requestData.url &&
          Math.abs(Date.now() - r.startTime) < 3000
      );
      if (matchIndex !== -1) {
        console.log(
          '[CORE] Removing duplicate webRequest buffer entry for:',
          requestData.url
        );
        tabBuffer.splice(matchIndex, 1);
      }
    }

    const logEntry: LogEntry = {
      id: requestData.requestId ?? String(Date.now() + Math.random()),
      timestamp: requestData.timestamp ?? new Date().toISOString(),
      requestType,
      url: requestData.url,
      // GraphQL fields
      operationName: requestData.operationName,
      query: requestData.query,
      variables: requestData.variables,
      // REST fields
      method: requestData.method,
      endpoint: requestData.endpoint,
      path: requestData.path,
      queryParams: requestData.queryParams,
      body: requestData.body,
      // Common fields
      requestHeaders: requestData.requestHeaders ?? {},
      tabId,
      startTime: Date.now(),
      source: 'injectedScript',
    };

    await this.adapter.addRequestLog(tabId, logEntry);

    await this.adapter.notifyDevTools('REQUEST_LOGGED', logEntry, tabId);
    await this.adapter.notifyPopup('REQUEST_LOGGED', logEntry, tabId);
  }

  async logResponse(
    responseData: ResponseData,
    tabId: number | undefined
  ): Promise<void> {
    const requestType = responseData.requestType ?? 'graphql';
    console.log(`[CORE] Logging ${requestType} response for tab ${tabId}:`, {
      requestId: responseData.requestId,
      status: responseData.status,
      hasResponse: !!responseData.response,
      error: responseData.error,
    });

    if (!tabId) {
      console.warn('[CORE] No tab ID provided for response logging');
      return;
    }

    const updatedEntry = await this.adapter.updateRequestLog(
      tabId,
      responseData.requestId,
      {
        response: responseData.response,
        responseStatus: responseData.status,
        responseStatusText: responseData.statusText,
        responseHeaders: responseData.headers,
        responseError: responseData.error,
        responseTimestamp: responseData.timestamp,
        endTime: Date.now(),
      }
    );

    if (updatedEntry) {
      const responseTime =
        updatedEntry.endTime! - (updatedEntry.startTime || updatedEntry.endTime!);

      this.trackPerformance(updatedEntry, {
        ...responseData,
        responseTime,
      });

      const recordingSession = this.sessions.find(
        (s) => s.status === 'recording'
      );
      if (recordingSession) {
        this.addRequestToSession(
          recordingSession.id,
          updatedEntry,
          responseData
        );
      }

      await this.adapter.notifyDevTools('RESPONSE_LOGGED', updatedEntry, tabId);
    }
  }

  // ---------------------------------------------------------------------------
  // Message handler
  // ---------------------------------------------------------------------------

  async handleMessage(
    message: unknown,
    sender: browser.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ): Promise<void> {
    await this.waitForReady();

    const msg = message as Record<string, unknown>;

    try {
      switch (msg.type) {
        case 'GET_RULES': {
          const tabId = msg.tabId as number;
          const tabState = await this.adapter.getTabState(tabId);

          sendResponse({
            success: true,
            data: {
              rules: Array.from(this.rules.entries()),
              tabEnabled: tabState ? tabState.enabled : true,
              requestLog: tabState ? tabState.requestLog : [],
              tabId,
            },
          });
          break;
        }

        case 'ADD_RULE': {
          const ruleId = this.addRule(msg.rule as Partial<ApiRule>);
          await this.saveRules();

          await this.adapter.notifyDevTools('RULE_ADDED', {
            ruleId,
            rule: this.rules.get(ruleId),
          });
          await this.adapter.notifyPopup('RULES_UPDATED', {
            ruleId,
            rule: this.rules.get(ruleId),
          });

          sendResponse({ success: true, ruleId });
          break;
        }

        case 'UPDATE_RULE': {
          this.updateRule(
            msg.ruleId as string,
            msg.rule as Partial<ApiRule>
          );
          await this.saveRules();

          await this.adapter.notifyDevTools('RULE_UPDATED', {
            ruleId: msg.ruleId,
            rule: this.rules.get(msg.ruleId as string),
          });

          sendResponse({ success: true });
          break;
        }

        case 'DELETE_RULE': {
          const deletedRule = this.rules.get(msg.ruleId as string);
          this.deleteRule(msg.ruleId as string);
          await this.saveRules();

          await this.adapter.notifyDevTools('RULE_DELETED', {
            ruleId: msg.ruleId,
            rule: deletedRule,
          });

          sendResponse({ success: true });
          break;
        }

        case 'GET_MATCHING_RULE': {
          const matchTabId = sender.tab?.id;
          const matchTabState = matchTabId
            ? await this.adapter.getTabState(matchTabId)
            : null;
          const tabEnabled = matchTabState ? matchTabState.enabled : false;

          let rules: ApiRule[] = [];
          if (tabEnabled) {
            const data = msg.data as {
              requestType?: string;
              url?: string;
              graphqlData?: Partial<RequestData>;
              restData?: Partial<RequestData>;
            };
            const requestData: Partial<RequestData> =
              data.graphqlData || data.restData || {};
            requestData.requestType =
              (data.requestType as 'graphql' | 'rest') ?? 'graphql';
            rules = this.findMatchingRules(requestData, data.url ?? '');
          }

          const rule = rules.length > 0 ? rules[0] : null;
          sendResponse({ success: true, rule, rules, enabled: tabEnabled });
          break;
        }

        case 'EXPORT_RULES': {
          sendResponse({ success: true, data: this.exportRules() });
          break;
        }

        case 'IMPORT_RULES': {
          this.importRules(msg.data as { rules?: unknown });
          await this.saveRules();
          sendResponse({ success: true });
          break;
        }

        case 'LOG_REQUEST': {
          await this.logRequest(
            msg.data as RequestData,
            sender.tab?.id
          );
          sendResponse({ success: true });
          break;
        }

        case 'LOG_RESPONSE': {
          await this.logResponse(
            msg.data as ResponseData,
            sender.tab?.id
          );
          sendResponse({ success: true });
          break;
        }

        case 'CLEAR_LOG': {
          const clearTabId =
            (msg.tabId as number | undefined) ?? sender.tab?.id;
          if (clearTabId) {
            await this.adapter.clearTabLog(clearTabId);
          }
          sendResponse({ success: true });
          break;
        }

        case 'GET_SETTINGS': {
          sendResponse({ success: true, settings: this.settings });
          break;
        }

        case 'UPDATE_SETTINGS': {
          this.settings = { ...this.settings, ...(msg.settings as Partial<Settings>) };
          await this.saveRules();
          await this.adapter.notifyPopup(
            'SETTINGS_UPDATED',
            msg.settings
          );
          sendResponse({ success: true });
          break;
        }

        case 'RESET_SETTINGS': {
          this.settings = { logProfile: 'basic', theme: 'system' };
          await this.saveRules();
          sendResponse({ success: true });
          break;
        }

        case 'GET_AI_SETTINGS': {
          sendResponse({ success: true, aiSettings: this.aiSettings });
          break;
        }

        case 'UPDATE_AI_SETTINGS': {
          this.aiSettings = {
            ...this.aiSettings,
            ...(msg.aiSettings as Partial<AISettings>),
          };
          await this.saveRules();
          sendResponse({ success: true });
          break;
        }

        case 'INCREMENT_AI_STATS': {
          if (msg.stats) {
            const stats = msg.stats as {
              calls?: number;
              tokens?: number;
              mocks?: number;
              provider?: string;
            };
            this.aiSettings.callsCount =
              (this.aiSettings.callsCount || 0) + (stats.calls || 0);
            this.aiSettings.tokensUsed =
              (this.aiSettings.tokensUsed || 0) + (stats.tokens || 0);
            this.aiSettings.mocksGenerated =
              (this.aiSettings.mocksGenerated || 0) + (stats.mocks || 0);

            const provider = stats.provider ?? 'unknown';
            if (!this.aiSettings.providerStats) {
              this.aiSettings.providerStats = {};
            }
            if (!this.aiSettings.providerStats[provider]) {
              this.aiSettings.providerStats[provider] = { calls: 0, tokens: 0 };
            }
            this.aiSettings.providerStats[provider].calls += stats.calls || 0;
            this.aiSettings.providerStats[provider].tokens += stats.tokens || 0;

            await this.saveRules();
          }
          sendResponse({ success: true, aiSettings: this.aiSettings });
          break;
        }

        case 'RESET_AI_USAGE_STATS': {
          this.aiSettings.callsCount = 0;
          this.aiSettings.tokensUsed = 0;
          this.aiSettings.mocksGenerated = 0;
          this.aiSettings.providerStats = {};
          await this.saveRules();
          sendResponse({ success: true, aiSettings: this.aiSettings });
          break;
        }

        case 'GET_PERFORMANCE_METRICS': {
          const metrics = this.getPerformanceMetrics(
            (msg.timeRange as string) ?? 'all'
          );
          sendResponse({ success: true, metrics });
          break;
        }

        case 'CLEAR_PERFORMANCE_DATA': {
          this.performanceData = {
            requests: [],
            aggregates: {
              totalRequests: 0,
              successCount: 0,
              errorCount: 0,
              totalResponseTime: 0,
            },
          };
          await this.saveRules();
          sendResponse({ success: true });
          break;
        }

        case 'GET_SESSIONS': {
          sendResponse({ success: true, sessions: this.getSessions() });
          break;
        }

        case 'CREATE_SESSION': {
          const newSession = this.createSession(msg.name as string | undefined);
          await this.saveRules();
          sendResponse({ success: true, session: newSession });
          break;
        }

        case 'END_SESSION': {
          const endedSession = this.endSession(msg.sessionId as string);
          await this.saveRules();
          sendResponse({ success: true, session: endedSession });
          break;
        }

        case 'DELETE_SESSION': {
          const deleted = this.deleteSession(msg.sessionId as string);
          await this.saveRules();
          sendResponse({ success: true, deleted });
          break;
        }

        case 'EXPORT_SESSION': {
          const exportedSession = this.exportSession(msg.sessionId as string);
          sendResponse({ success: true, data: exportedSession });
          break;
        }

        case 'IMPORT_SESSION': {
          const importedSession = this.importSession(
            msg.data as { session?: unknown }
          );
          await this.saveRules();
          sendResponse({ success: true, session: importedSession });
          break;
        }

        case 'GET_ENABLED_STATUS': {
          const statusTabId = sender.tab?.id;
          const statusTabState = statusTabId
            ? await this.adapter.getTabState(statusTabId)
            : null;
          const statusEnabled = statusTabState
            ? statusTabState.enabled
            : false;
          sendResponse({ enabled: statusEnabled });
          break;
        }

        case 'GET_TAB_STATUS': {
          const popupTabId = msg.tabId as number | undefined;
          if (popupTabId) {
            const popupTabState = await this.adapter.getTabState(popupTabId);
            const requestCount = popupTabState.requestLog.length;
            const activeRules = this.rules.size;
            const isMonitoring =
              popupTabState.enabled && popupTabState.devToolsOpen;

            sendResponse({
              success: true,
              requestCount,
              activeRules,
              isMonitoring,
              enabled: popupTabState.enabled,
              devToolsOpen: popupTabState.devToolsOpen,
            });
          } else {
            sendResponse({ success: false, error: 'No tab ID provided' });
          }
          break;
        }

        case 'GET_TAB_STATE': {
          const requestTabId = sender.tab ? sender.tab.id : null;
          const requestTabState = requestTabId
            ? await this.adapter.getTabState(requestTabId)
            : null;
          sendResponse({
            success: true,
            devToolsOpen: requestTabState ? requestTabState.devToolsOpen : false,
            enabled: requestTabState ? requestTabState.enabled : false,
          });
          break;
        }

        default:
          // Delegate browser-specific messages to adapter
          return await this.adapter.handleBrowserSpecificMessage(
            message,
            sender,
            sendResponse
          );
      }
    } catch (error) {
      console.error('Core message handling error:', error);
      sendResponse({ success: false, error: (error as Error).message });
    }
  }
}
