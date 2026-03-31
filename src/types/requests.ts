/**
 * Request / response log entry types for APIlot.
 * Derived from logRequest() and logResponse() in src-legacy/background/core.js
 * and recordRequest()/recordResponse() in src-legacy/services/session-recorder.js.
 */

export type RequestSource = 'injectedScript' | 'webRequest';

export interface RequestData {
  requestId?: string;
  requestType: 'graphql' | 'rest';
  url: string;
  timestamp?: string;
  // GraphQL fields
  operationName?: string;
  query?: string;
  variables?: Record<string, unknown>;
  // REST fields
  method?: string;
  endpoint?: string;
  path?: string;
  queryParams?: Record<string, string>;
  body?: unknown;
  // Common
  requestHeaders?: Record<string, string>;
}

export interface ResponseData {
  requestId: string;
  requestType?: 'graphql' | 'rest';
  response?: unknown;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  error?: string;
  timestamp?: string;
}

export interface LogEntry {
  id: string;
  tabId: number;
  timestamp: string;
  requestType: 'graphql' | 'rest';
  url: string;
  source?: RequestSource;

  // GraphQL fields
  operationName?: string;
  query?: string;
  variables?: Record<string, unknown>;

  // REST fields
  method?: string;
  endpoint?: string;
  path?: string;
  queryParams?: Record<string, string>;
  body?: unknown;

  // Common request fields
  requestHeaders?: Record<string, string>;
  startTime: number;

  // Response fields (populated after logResponse)
  response?: unknown;
  responseStatus?: number;
  responseStatusText?: string;
  responseHeaders?: Record<string, string>;
  responseError?: string;
  responseTimestamp?: string;
  endTime?: number;

  // Derived fields
  responseTime?: number;

  // WebRequest-only fields
  frameId?: number;
  browserRequestId?: string;

  // Session / page group info
  pageGroupId?: string;
  matchedRules?: string[];
}
