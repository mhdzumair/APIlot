/**
 * Discriminated union message types for all extension message passing.
 * Derived from the handleMessage() switch block in src-legacy/background/core.js
 * and the adapter notifyDevTools / notifyPopup calls throughout core.js.
 */

import type { ApiRule } from './rules';
import type { LogEntry, RequestData, ResponseData } from './requests';
import type { Settings, AISettings, PerformanceData } from './settings';
import type { Session, SessionSummary, SessionExport } from './sessions';

// ---------------------------------------------------------------------------
// Background → DevTools push notifications
// ---------------------------------------------------------------------------

export type BackgroundToDevToolsMessage =
  | { type: 'DEVTOOLS_REQUEST_LOGGED'; tabId: number; data: LogEntry }
  | { type: 'DEVTOOLS_RESPONSE_LOGGED'; tabId: number; data: LogEntry }
  | { type: 'DEVTOOLS_RULE_ADDED'; data: { ruleId: string; rule: ApiRule } }
  | { type: 'DEVTOOLS_RULE_UPDATED'; data: { ruleId: string; rule: ApiRule } }
  | { type: 'DEVTOOLS_RULE_DELETED'; data: { ruleId: string; rule?: ApiRule } }
  | { type: 'TAB_NAVIGATED'; tabId: number; url: string }
  // raw push names used by notifyDevTools (without the DEVTOOLS_ prefix)
  | { type: 'REQUEST_LOGGED'; tabId: number; data: LogEntry }
  | { type: 'RESPONSE_LOGGED'; tabId: number; data: LogEntry }
  | { type: 'RULE_ADDED'; data: { ruleId: string; rule: ApiRule } }
  | { type: 'RULE_UPDATED'; data: { ruleId: string; rule: ApiRule } }
  | { type: 'RULE_DELETED'; data: { ruleId: string; rule?: ApiRule } };

// ---------------------------------------------------------------------------
// Background → Popup push notifications
// ---------------------------------------------------------------------------

export type BackgroundToPopupMessage =
  | { type: 'RULES_UPDATED'; data: { ruleId: string; rule: ApiRule } }
  | { type: 'SETTINGS_UPDATED'; data: Partial<Settings> }
  | { type: 'REQUEST_LOGGED'; tabId: number; data: LogEntry };

// ---------------------------------------------------------------------------
// Panel / DevTools → Background request messages
// (switch cases in handleMessage)
// ---------------------------------------------------------------------------

export type PanelToBackgroundMessage =
  // Rules CRUD
  | { type: 'GET_RULES'; tabId: number }
  | { type: 'ADD_RULE'; rule: Omit<ApiRule, 'id'> }
  | { type: 'UPDATE_RULE'; ruleId: string; rule: Partial<ApiRule> }
  | { type: 'DELETE_RULE'; ruleId: string }
  | { type: 'EXPORT_RULES' }
  | { type: 'IMPORT_RULES'; data: Array<[string, ApiRule]> }
  // Request matching (sent from content script context too)
  | {
      type: 'GET_MATCHING_RULE';
      data: {
        requestType: 'graphql' | 'rest';
        url: string;
        graphqlData?: Partial<RequestData>;
        restData?: Partial<RequestData>;
      };
    }
  // Request / response logging (from content script)
  | { type: 'LOG_REQUEST'; data: RequestData }
  | { type: 'LOG_RESPONSE'; data: ResponseData }
  | { type: 'CLEAR_LOG'; tabId?: number }
  // Settings
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'RESET_SETTINGS' }
  // AI settings
  | { type: 'GET_AI_SETTINGS' }
  | { type: 'UPDATE_AI_SETTINGS'; aiSettings: Partial<AISettings> }
  | {
      type: 'INCREMENT_AI_STATS';
      stats: { calls?: number; tokens?: number; mocks?: number; provider?: string };
    }
  | { type: 'RESET_AI_USAGE_STATS' }
  // Performance metrics
  | { type: 'GET_PERFORMANCE_METRICS'; timeRange?: 'all' | '1h' | '24h' | '7d' }
  | { type: 'CLEAR_PERFORMANCE_DATA' }
  // Sessions
  | { type: 'GET_SESSIONS' }
  | { type: 'CREATE_SESSION'; name?: string }
  | { type: 'END_SESSION'; sessionId: string }
  | { type: 'DELETE_SESSION'; sessionId: string }
  | { type: 'EXPORT_SESSION'; sessionId: string }
  | { type: 'IMPORT_SESSION'; data: SessionExport }
  // Tab / devtools state queries
  | { type: 'GET_ENABLED_STATUS' }
  | { type: 'GET_TAB_STATUS'; tabId: number }
  | { type: 'GET_TAB_STATE' }
  // Schema introspection — fetched directly by background script (has <all_urls> host permission)
  | { type: 'FETCH_INTROSPECTION'; endpoint: string; headers: Record<string, string>; body: string };

// ---------------------------------------------------------------------------
// Background → Content script messages
// ---------------------------------------------------------------------------

export type BackgroundToContentMessage =
  | { type: 'TAB_ENABLED'; enabled: boolean }
  | { type: 'RULES_UPDATED'; rules: Array<[string, ApiRule]> }
  | { type: 'SETTINGS_UPDATED'; settings: Partial<Settings> };

// ---------------------------------------------------------------------------
// Content → Background messages
// (a subset of PanelToBackgroundMessage — content script only sends these)
// ---------------------------------------------------------------------------

export type ContentToBackgroundMessage =
  | { type: 'GET_MATCHING_RULE'; data: PanelToBackgroundMessage & { type: 'GET_MATCHING_RULE' } extends { data: infer D } ? D : never }
  | { type: 'LOG_REQUEST'; data: RequestData }
  | { type: 'LOG_RESPONSE'; data: ResponseData }
  | { type: 'GET_ENABLED_STATUS' }
  | { type: 'GET_TAB_STATE' };

// ---------------------------------------------------------------------------
// Typed response map: what each PanelToBackgroundMessage type returns
// ---------------------------------------------------------------------------

export interface MessageResponses {
  GET_RULES: {
    success: true;
    data: {
      rules: Array<[string, ApiRule]>;
      tabEnabled: boolean;
      requestLog: LogEntry[];
      tabId: number;
    };
  };
  ADD_RULE: { success: true; ruleId: string };
  UPDATE_RULE: { success: true };
  DELETE_RULE:
    | { success: true }
    | { success: false; error: string };
  EXPORT_RULES: { success: true; data: Array<[string, ApiRule]> };
  IMPORT_RULES: { success: true };
  GET_MATCHING_RULE: {
    success: true;
    rule: ApiRule | null;
    rules: ApiRule[];
    enabled: boolean;
  };
  LOG_REQUEST: { success: true };
  LOG_RESPONSE: { success: true };
  CLEAR_LOG: { success: true };
  GET_SETTINGS: { success: true; settings: Settings };
  UPDATE_SETTINGS: { success: true };
  RESET_SETTINGS: { success: true };
  GET_AI_SETTINGS: { success: true; aiSettings: AISettings };
  UPDATE_AI_SETTINGS: { success: true };
  INCREMENT_AI_STATS: { success: true; aiSettings: AISettings };
  RESET_AI_USAGE_STATS: { success: true; aiSettings: AISettings };
  GET_PERFORMANCE_METRICS: { success: true; metrics: PerformanceData };
  CLEAR_PERFORMANCE_DATA: { success: true };
  GET_SESSIONS: { success: true; sessions: SessionSummary[] };
  CREATE_SESSION: { success: true; session: Session };
  END_SESSION: { success: true; session: Session | null };
  DELETE_SESSION: { success: true; deleted: boolean };
  EXPORT_SESSION: { success: true; data: SessionExport | null };
  IMPORT_SESSION: { success: true; session: Session };
  GET_ENABLED_STATUS: { enabled: boolean };
  GET_TAB_STATUS: {
    success: true;
    requestCount: number;
    activeRules: number;
    isMonitoring: boolean;
    enabled: boolean;
    devToolsOpen: boolean;
  };
  GET_TAB_STATE: {
    success: true;
    devToolsOpen: boolean;
    enabled: boolean;
  };
  FETCH_INTROSPECTION:
    | { success: true; status: number; ok: boolean; body: string }
    | { success: false; error: string };
}

// Convenience: error response shape returned on unhandled exceptions
export interface ErrorResponse {
  success: false;
  error: string;
}

// Union of all possible response types
export type AnyMessageResponse =
  | MessageResponses[keyof MessageResponses]
  | ErrorResponse;
