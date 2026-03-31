/**
 * Session recording / time-travel debugging types for APIlot.
 * Derived from src-legacy/services/session-recorder.js.
 */

export interface RecordedRequest {
  id: string;
  sequenceNumber: number;
  timestamp: string;
  /** Milliseconds from session start */
  relativeTime: number;
  requestType: 'graphql' | 'rest';
  url: string;
  method: string;
  // GraphQL specific
  operationName?: string;
  query?: string;
  variables?: Record<string, unknown>;
  // REST specific
  endpoint?: string;
  path?: string;
  queryParams?: Record<string, string>;
  body?: unknown;
  // Common
  requestHeaders?: Record<string, string>;
  // Response (filled in after recording)
  response?: unknown;
  responseStatus?: number;
  responseStatusText?: string;
  responseHeaders?: Record<string, string>;
  responseTime?: number;
  error?: string;
  modified: boolean;
}

export type SessionStatus = 'recording' | 'completed' | 'paused';

export interface SessionMetadata {
  userAgent: string;
  url: string;
}

export interface Session {
  id: string;
  name: string;
  startTime: string;
  endTime: string | null;
  /** Duration in milliseconds */
  duration?: number;
  status: SessionStatus;
  requests: RecordedRequest[];
  metadata: SessionMetadata;
  // Import tracking
  importedAt?: string;
  importedFrom?: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  startTime: string;
  endTime: string | null;
  duration?: number;
  requestCount: number;
  status: SessionStatus;
}

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped';

export interface PlaybackStatus {
  state: PlaybackState;
  currentIndex: number;
  total: number;
  sessionId?: string;
  speed?: number;
  currentRequest?: RecordedRequest | null;
}

export interface SessionExport {
  version: string;
  application: string;
  exportedAt: string;
  session: Session;
}
