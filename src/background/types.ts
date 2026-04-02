import type { LogEntry } from '../types/requests';
import type { ApiRule } from '../types/rules';

export interface TabState {
  enabled: boolean;
  requestLog: LogEntry[];
  devToolsOpen: boolean;
}

export interface StorageData {
  apiRules?: Record<string, ApiRule>;
  graphqlRules?: Record<string, ApiRule>;
  tabStates?: Record<string, TabState>;
  settings?: unknown;
  aiSettings?: unknown;
  performanceData?: unknown;
  sessions?: unknown;
}

export interface BrowserAdapter {
  supportsBlockingWebRequestRedirects(): boolean;
  loadFromStorage(keys: string[]): Promise<Partial<StorageData>>;
  saveToStorage(data: Partial<StorageData>): Promise<void>;
  initializeTabStates(tabStatesData?: Record<string, TabState>): Promise<void>;
  getTabStatesForStorage(): Promise<Record<string, TabState>>;
  peekTabState(tabId: number | string): TabState | null;
  getTabState(tabId: number): Promise<TabState>;
  setTabDevToolsState(tabId: number, isOpen: boolean): Promise<void>;
  persistTabState(tabId: number): Promise<void>;
  updateTabBadge(tabId: number): void;
  resetTabState(tabId: number): Promise<void>;
  cleanupTabState(tabId: number): Promise<void>;
  addRequestLog(tabId: number, logEntry: LogEntry): Promise<void>;
  updateRequestLog(tabId: number, requestId: string, responseData: Partial<LogEntry>): Promise<LogEntry | null>;
  clearTabLog(tabId: number): Promise<void>;
  notifyContentScript(tabId: number, type: string, data: unknown): Promise<void>;
  notifyDevTools(type: string, data: unknown, tabId?: number | null): Promise<void>;
  notifyPopup(type: string, data: unknown, tabId?: number | null): Promise<void>;
  handleBrowserSpecificMessage(message: unknown, sender: browser.runtime.MessageSender, sendResponse: (response: unknown) => void): Promise<void>;
  /** Chrome MV3 only — DNR script/XHR redirects */
  syncDeclarativeRedirectRules?(rulesMap: Map<string, ApiRule>): Promise<void>;
}
