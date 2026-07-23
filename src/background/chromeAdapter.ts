import type { LogEntry } from '../types/requests';
import type { ApiRule } from '../types/rules';
import { buildAllChromeDeclarativeRedirects } from '../shared/ruleMatch';
import type { BrowserAdapter, StorageData, TabState } from './types';
import { broadcastTabMessage } from './broadcastTabMessage';
import { IconManager } from './iconManager';
import {
  repairChromeStorageIfNeeded,
  safeChromeStorageSet,
  slimTabStatesRecord,
} from './storageUtils';

export class ChromeAdapter implements BrowserAdapter {
  private tabStates: Map<number | string, TabState>;
  private iconManager: IconManager;

  constructor() {
    this.tabStates = new Map();
    this.iconManager = new IconManager('chrome');
    this.setupTabListeners();
  }

  /** MV3: blocking webRequest not available; use declarativeNetRequest.syncDeclarativeRedirectRules instead. */
  supportsBlockingWebRequestRedirects(): boolean {
    return false;
  }

  async loadFromStorage(keys: string[]): Promise<Partial<StorageData>> {
    await repairChromeStorageIfNeeded();
    const data = (await chrome.storage.local.get(keys)) as Partial<StorageData>;
    if (data.tabStates) {
      data.tabStates = slimTabStatesRecord(
        data.tabStates as Record<string, TabState>
      );
    }
    return data;
  }

  async saveToStorage(data: Partial<StorageData>): Promise<void> {
    await safeChromeStorageSet(data);
  }

  async initializeTabStates(tabStatesData?: Record<string, TabState>): Promise<void> {
    if (tabStatesData) {
      this.tabStates = new Map();
      for (const [k, v] of Object.entries(slimTabStatesRecord(tabStatesData))) {
        const num = Number(k);
        const key =
          !Number.isNaN(num) && String(num) === String(k).trim() ? num : k;
        this.tabStates.set(key, v);
      }
    }
  }

  async getTabStatesForStorage(): Promise<Record<string, TabState>> {
    const out: Record<string, TabState> = {};
    for (const [k, v] of this.tabStates) {
      out[String(k)] = { enabled: v.enabled, devToolsOpen: v.devToolsOpen, requestLog: [] };
    }
    return out;
  }

  /** Synchronous read for webRequest hot path. */
  peekTabState(tabId: number | string): TabState | null {
    if (this.tabStates.has(tabId)) {
      return this.tabStates.get(tabId)!;
    }
    const n = Number(tabId);
    if (!Number.isNaN(n) && this.tabStates.has(n)) {
      return this.tabStates.get(n)!;
    }
    const s = String(tabId);
    if (this.tabStates.has(s)) {
      return this.tabStates.get(s)!;
    }
    return null;
  }

  getFirstEnabledTabId(): number | null {
    for (const [id, state] of this.tabStates) {
      if (state.enabled) {
        const n = typeof id === 'number' ? id : Number(id);
        return Number.isNaN(n) ? null : n;
      }
    }
    return null;
  }

  async getTabState(tabId: number): Promise<TabState> {
    const canonical: number | string =
      typeof tabId === 'number' && !Number.isNaN(tabId)
        ? tabId
        : /^\d+$/.test(String(tabId))
        ? Number(tabId)
        : tabId;

    if (!this.tabStates.has(canonical)) {
      const data = await chrome.storage.local.get(['tabStates']);
      const stored = slimTabStatesRecord(
        (data.tabStates as Record<string, TabState>) || {}
      );
      const fromStore =
        stored[canonical as unknown as string] ?? stored[String(canonical)];
      if (fromStore) {
        this.tabStates.set(canonical, fromStore);
      } else {
        this.tabStates.set(canonical, {
          enabled: false,
          requestLog: [],
          devToolsOpen: false,
        });
      }
    }
    return this.tabStates.get(canonical)!;
  }

  async setTabDevToolsState(tabId: number, isOpen: boolean): Promise<void> {
    const tabState = await this.getTabState(tabId);
    tabState.devToolsOpen = isOpen;
    this.updateTabBadge(tabId);

    await this.iconManager.updateIconForTabState(tabState, tabId);

    // Service worker: persist immediately
    await this.persistTabState(tabId);
  }

  async persistTabState(_tabId: number): Promise<void> {
    try {
      await safeChromeStorageSet({
        tabStates: await this.getTabStatesForStorage(),
      });
    } catch (error) {
      console.warn(
        '[CHROME] Could not persist tab states:',
        (error as Error)?.message ?? error
      );
    }
  }

  updateTabBadge(tabId: number): void {
    const tabState = this.peekTabState(tabId);
    if (!tabState) return;

    const isActive = tabState.enabled && tabState.devToolsOpen;

    try {
      if (isActive) {
        chrome.action.setBadgeText({ text: 'ON', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
      } else {
        chrome.action.setBadgeText({ text: '', tabId });
      }
    } catch (error) {
      console.warn(
        `[CHROME] Could not update badge for tab ${tabId}:`,
        (error as Error).message
      );
    }
  }

  private setupTabListeners(): void {
    chrome.tabs.onUpdated.addListener(async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === 'loading') {
        await this.resetTabState(tabId);
      }
    });

    chrome.tabs.onRemoved.addListener(async (tabId: number) => {
      await this.cleanupTabState(tabId);
    });
  }

  async resetTabState(tabId: number): Promise<void> {
    const tabState = await this.getTabState(tabId);
    const preservedEnabled = tabState.enabled;
    const preservedDevToolsOpen = tabState.devToolsOpen;

    tabState.requestLog = [];
    tabState.enabled = preservedEnabled;
    tabState.devToolsOpen = preservedDevToolsOpen;

    this.updateTabBadge(tabId);
    await this.iconManager.updateIconForTabState(tabState, tabId);
  }

  async cleanupTabState(tabId: number): Promise<void> {
    this.tabStates.delete(tabId);

    await this.iconManager.resetIcon(tabId);

    try {
      const data = await chrome.storage.local.get(['tabStates']);
      const tabStates = slimTabStatesRecord(
        (data.tabStates as Record<string, TabState>) || {}
      );
      if (tabStates[tabId]) {
        delete tabStates[tabId];
        await safeChromeStorageSet({ tabStates });
      }
    } catch (error) {
      console.warn(
        `[CHROME] Could not cleanup tab state for ${tabId}:`,
        (error as Error)?.message ?? error
      );
    }
  }

  async addRequestLog(tabId: number, logEntry: LogEntry): Promise<void> {
    const tabState = await this.getTabState(tabId);
    tabState.requestLog.push(logEntry);

    if (tabState.requestLog.length > 1000) {
      tabState.requestLog = tabState.requestLog.slice(-1000);
    }

    console.log(
      `[CHROME] Request logged for tab ${tabId}, total requests: ${tabState.requestLog.length}`
    );
  }

  async updateRequestLog(
    tabId: number,
    requestId: string,
    responseData: Partial<LogEntry>
  ): Promise<LogEntry | null> {
    const tabState = await this.getTabState(tabId);
    const requestEntry = tabState.requestLog.find(
      (entry) => entry.id === requestId
    );

    if (requestEntry) {
      Object.assign(requestEntry, responseData);
      console.log(
        `[CHROME] Response logged for request: ${requestId} in tab ${tabId}`
      );
      return requestEntry;
    } else {
      console.warn(
        `[CHROME] Could not find request entry for response: ${requestId} in tab ${tabId}`
      );
      return null;
    }
  }

  async clearTabLog(tabId: number): Promise<void> {
    const tabState = await this.getTabState(tabId);
    tabState.requestLog = [];
    console.log(`[CHROME] Cleared request log for tab ${tabId}`);
  }

  async notifyContentScript(
    tabId: number,
    type: string,
    data: unknown
  ): Promise<void> {
    try {
      await broadcastTabMessage(tabId, { type, data });
      console.log(
        `[CHROME] Content script notified (all frames) for tab ${tabId}: ${type}`
      );
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes('Could not establish connection')) {
        console.log(
          `[CHROME] Content script not ready for tab ${tabId} (${type}) - will retry when ready`
        );
      } else {
        console.log(
          `[CHROME] Could not notify content script for tab ${tabId}:`,
          msg
        );
      }
    }
  }

  async notifyDevTools(
    type: string,
    data: unknown,
    tabId: number | null = null
  ): Promise<void> {
    try {
      chrome.runtime
        .sendMessage({
          type: 'DEVTOOLS_' + type,
          data,
          tabId,
        })
        .catch(() => {
          console.log(
            `[CHROME] DevTools not available for notification: ${type}`
          );
        });
    } catch (error) {
      console.log(
        `[CHROME] DevTools notification skipped:`,
        (error as Error).message
      );
    }
  }

  async notifyPopup(
    type: string,
    data: unknown,
    tabId: number | null = null
  ): Promise<void> {
    try {
      chrome.runtime
        .sendMessage({
          type,
          data,
          tabId,
        })
        .catch(() => {
          console.log(
            `[CHROME] Popup not available for notification: ${type}`
          );
        });
    } catch (error) {
      console.log(
        `[CHROME] Popup notification skipped:`,
        (error as Error).message
      );
    }
  }

  async handleBrowserSpecificMessage(
    message: unknown,
    _sender: browser.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ): Promise<void> {
    const msg = message as Record<string, unknown>;

    switch (msg.type) {
      case 'DEVTOOLS_OPENED': {
        const previousDevToolsState =
          this.peekTabState(msg.tabId as number)?.devToolsOpen ?? false;
        await this.setTabDevToolsState(msg.tabId as number, true);

        const tabState = await this.getTabState(msg.tabId as number);
        if (tabState.enabled && !previousDevToolsState) {
          setTimeout(() => {
            void this.notifyContentScript(
              msg.tabId as number,
              'START_MONITORING',
              {}
            );
          }, 100);
        }

        await this.notifyPopup(
          'TAB_STATUS_UPDATED',
          {
            devToolsOpen: true,
            isMonitoring: tabState.enabled,
            enabled: tabState.enabled,
          },
          msg.tabId as number
        );

        sendResponse({ success: true });
        break;
      }

      case 'DEVTOOLS_CLOSED': {
        await this.setTabDevToolsState(msg.tabId as number, false);
        await this.notifyContentScript(
          msg.tabId as number,
          'STOP_MONITORING',
          {}
        );

        const closedTabState = await this.getTabState(msg.tabId as number);
        await this.notifyPopup(
          'TAB_STATUS_UPDATED',
          {
            devToolsOpen: false,
            isMonitoring: false,
            enabled: closedTabState.enabled,
          },
          msg.tabId as number
        );

        sendResponse({ success: true });
        break;
      }

      case 'TOGGLE_TAB_ENABLED': {
        const toggleTabState = await this.getTabState(msg.tabId as number);
        toggleTabState.enabled = msg.enabled as boolean;

        if (msg.enabled && toggleTabState.devToolsOpen) {
          await this.notifyContentScript(
            msg.tabId as number,
            'START_MONITORING',
            {}
          );
        } else if (!msg.enabled) {
          await this.notifyContentScript(
            msg.tabId as number,
            'STOP_MONITORING',
            {}
          );
        }

        this.updateTabBadge(msg.tabId as number);
        await this.iconManager.updateIconForTabState(
          toggleTabState,
          msg.tabId as number
        );
        await this.persistTabState(msg.tabId as number);

        await this.notifyPopup(
          'TAB_STATUS_UPDATED',
          {
            enabled: msg.enabled,
            isMonitoring: msg.enabled && toggleTabState.devToolsOpen,
            devToolsOpen: toggleTabState.devToolsOpen,
          },
          msg.tabId as number
        );

        await this.notifyDevTools(
          'TAB_STATUS_UPDATED',
          {
            enabled: msg.enabled,
            isMonitoring: msg.enabled && toggleTabState.devToolsOpen,
            devToolsOpen: toggleTabState.devToolsOpen,
          },
          msg.tabId as number
        );

        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  }

  /**
   * Chrome MV3: applies redirect rules to <script src>, import(), and XHR at
   * the network layer via declarativeNetRequest.
   */
  async syncDeclarativeRedirectRules(rulesMap: Map<string, ApiRule>): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
      console.warn('[APILOT DNR] declarativeNetRequest API not available');
      return;
    }

    const MIN_ID = 900000;
    const MAX_ID = 909999;

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeIds = existing
      .filter((r: chrome.declarativeNetRequest.Rule) => r.id >= MIN_ID && r.id <= MAX_ID)
      .map((r: chrome.declarativeNetRequest.Rule) => r.id);

    const addRules: chrome.declarativeNetRequest.Rule[] = [];
    let nid = MIN_ID;

    for (const rule of rulesMap.values()) {
      if (!rule || !rule.enabled || rule.action !== 'redirect') continue;
      // DNR only handles static asset redirects (<script>, <link>, etc.).
      // REST/GraphQL redirect rules are handled by the injected script, which
      // already respects tab-enabled state. Registering them here would cause
      // redirects to fire globally even when monitoring is off.
      if (rule.requestType !== 'static') continue;
      const target = (rule.redirectUrl ?? '').trim();
      if (!target) continue;

      const dnrRules = buildAllChromeDeclarativeRedirects(rule);
      if (dnrRules.length === 0) {
        console.warn(
          '[APILOT DNR] Redirect needs Host/Domain (urlPattern) and valid redirectUrl:',
          rule.name || rule.id
        );
        continue;
      }

      for (const dnr of dnrRules) {
        if (!dnr.regexFilter || !dnr.redirect) continue;

        const condition: chrome.declarativeNetRequest.RuleCondition = {
          regexFilter: dnr.regexFilter,
          ...(dnr.requestDomains?.length
            ? { requestDomains: dnr.requestDomains }
            : {}),
        };

        addRules.push({
          id: nid++,
          priority: dnr.requestDomains?.length ? 2 : 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
            redirect: dnr.redirect as chrome.declarativeNetRequest.Redirect,
          },
          condition,
        });

        if (nid > MAX_ID) {
          console.warn('[APILOT DNR] Max redirect rule count reached');
          break;
        }
      }

      if (nid > MAX_ID) break;
    }

    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: removeIds,
        addRules,
      });
      console.log('[APILOT DNR] Synced redirect rules:', addRules.length);
      for (const r of addRules) {
        const cond = r.condition as chrome.declarativeNetRequest.RuleCondition;
        console.log(
          '[APILOT DNR] Rule',
          r.id,
          cond.requestDomains ? `domains=${cond.requestDomains.join(',')}` : 'regex',
          cond.regexFilter
        );
      }
    } catch (error) {
      console.error(
        '[APILOT DNR] updateDynamicRules failed:',
        (error as Error)?.message ?? error
      );
      throw error;
    }
  }
}
