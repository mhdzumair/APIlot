import { browser } from '../lib/browser';
import type { LogEntry } from '../types/requests';
import type { BrowserAdapter, StorageData, TabState } from './types';
import { IconManager } from './iconManager';

export class FirefoxAdapter implements BrowserAdapter {
  private tabStates: Map<number | string, TabState>;
  private iconManager: IconManager;

  constructor() {
    this.tabStates = new Map();
    this.iconManager = new IconManager('firefox');
    this.setupTabListeners();
  }

  /** MV2: blocking webRequest redirects are available for <script src> etc. */
  supportsBlockingWebRequestRedirects(): boolean {
    return true;
  }

  async loadFromStorage(keys: string[]): Promise<Partial<StorageData>> {
    return (await browser.storage.local.get(keys)) || {};
  }

  async saveToStorage(data: Partial<StorageData>): Promise<void> {
    await browser.storage.local.set(data);
  }

  async initializeTabStates(tabStatesData?: Record<string, TabState>): Promise<void> {
    if (tabStatesData) {
      this.tabStates = new Map();
      for (const [k, v] of Object.entries(tabStatesData)) {
        const num = Number(k);
        const key =
          !Number.isNaN(num) && String(num) === String(k).trim() ? num : k;
        this.tabStates.set(key, v);
      }
    }
  }

  async getTabStatesForStorage(): Promise<Record<string, TabState>> {
    return Object.fromEntries(this.tabStates);
  }

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

  async getTabState(tabId: number): Promise<TabState> {
    const canonical: number | string =
      typeof tabId === 'number' && !Number.isNaN(tabId)
        ? tabId
        : /^\d+$/.test(String(tabId))
        ? Number(tabId)
        : tabId;

    if (!this.tabStates.has(canonical)) {
      this.tabStates.set(canonical, {
        enabled: false,
        requestLog: [],
        devToolsOpen: false,
      });
    }
    return this.tabStates.get(canonical)!;
  }

  async setTabDevToolsState(tabId: number, isOpen: boolean): Promise<void> {
    const tabState = await this.getTabState(tabId);
    tabState.devToolsOpen = isOpen;
    this.updateTabBadge(tabId);
    await this.iconManager.updateIconForTabState(tabState, tabId);
  }

  // Firefox MV2 persistent background: no need to persist on every mutation.
  async persistTabState(_tabId: number): Promise<void> {
    // no-op for Firefox — in-memory state persists for the lifetime of the background page
  }

  updateTabBadge(tabId: number): void {
    const tabState = this.peekTabState(tabId);
    if (!tabState) return;

    const isActive = tabState.enabled && tabState.devToolsOpen;
    const browserAction = (browser as unknown as Record<string, unknown>).browserAction as
      | {
          setBadgeText?: (opts: { text: string; tabId: number }) => void;
          setBadgeBackgroundColor?: (opts: { color: string; tabId: number }) => void;
        }
      | undefined;

    if (browserAction) {
      try {
        if (isActive) {
          browserAction.setBadgeText?.({ text: 'ON', tabId });
          browserAction.setBadgeBackgroundColor?.({
            color: '#4CAF50',
            tabId,
          });
        } else {
          browserAction.setBadgeText?.({ text: '', tabId });
        }
      } catch (error) {
        console.warn(
          `[FIREFOX] Could not update badge for tab ${tabId}:`,
          (error as Error).message
        );
      }
    }
  }

  private setupTabListeners(): void {
    if (browser.tabs && browser.tabs.onUpdated) {
      browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'loading') {
          void this.resetTabState(tabId);
        }
      });
    }

    if (browser.tabs && browser.tabs.onRemoved) {
      browser.tabs.onRemoved.addListener((tabId) => {
        void this.cleanupTabState(tabId);
      });
    }
  }

  async resetTabState(tabId: number): Promise<void> {
    if (this.tabStates.has(tabId)) {
      const tabState = this.tabStates.get(tabId)!;
      const preservedEnabled = tabState.enabled;
      const preservedDevToolsOpen = tabState.devToolsOpen;

      tabState.requestLog = [];
      tabState.enabled = preservedEnabled;
      tabState.devToolsOpen = preservedDevToolsOpen;

      this.updateTabBadge(tabId);
      await this.iconManager.updateIconForTabState(tabState, tabId);
    }
  }

  async cleanupTabState(tabId: number): Promise<void> {
    this.tabStates.delete(tabId);
    await this.iconManager.resetIcon(tabId);
  }

  async addRequestLog(tabId: number, logEntry: LogEntry): Promise<void> {
    const tabState = await this.getTabState(tabId);
    tabState.requestLog.push(logEntry);

    if (tabState.requestLog.length > 1000) {
      tabState.requestLog = tabState.requestLog.slice(-1000);
    }

    console.log(
      `[FIREFOX] Request logged for tab ${tabId}, total requests: ${tabState.requestLog.length}`
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
        `[FIREFOX] Response logged for request: ${requestId} in tab ${tabId}`
      );
      return requestEntry;
    } else {
      console.warn(
        `[FIREFOX] Could not find request entry for response: ${requestId} in tab ${tabId}`
      );
      return null;
    }
  }

  async clearTabLog(tabId: number): Promise<void> {
    const tabState = await this.getTabState(tabId);
    tabState.requestLog = [];
    console.log(`[FIREFOX] Cleared request log for tab ${tabId}`);
  }

  async notifyContentScript(
    tabId: number,
    type: string,
    data: unknown
  ): Promise<void> {
    try {
      const result = browser.tabs.sendMessage(tabId, { type, data });

      if (result && typeof result.then === 'function') {
        result
          .then(() => {
            console.log(
              `[FIREFOX] Content script notified for tab ${tabId}: ${type}`
            );
          })
          .catch((error: Error) => {
            if (error.message.includes('Could not establish connection')) {
              console.log(
                `[FIREFOX] Content script not ready for tab ${tabId} (${type}) - will retry when ready`
              );
            } else {
              console.log(
                `[FIREFOX] Could not notify content script for tab ${tabId}:`,
                error.message
              );
            }
          });
      } else {
        console.log(
          `[FIREFOX] Content script notified for tab ${tabId}: ${type}`
        );
      }
    } catch (error) {
      console.log(
        `[FIREFOX] Error sending message to tab ${tabId}:`,
        (error as Error).message
      );
    }
  }

  async notifyDevTools(
    type: string,
    data: unknown,
    tabId: number | null = null
  ): Promise<void> {
    try {
      const messagePromise = browser.runtime.sendMessage({
        type: 'DEVTOOLS_' + type,
        data,
        tabId,
      });
      if (messagePromise && messagePromise.catch) {
        messagePromise.catch(() => {
          console.log(
            `[FIREFOX] DevTools not available for notification: ${type}`
          );
        });
      }
    } catch (error) {
      console.log(
        `[FIREFOX] DevTools notification skipped:`,
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
      const messagePromise = browser.runtime.sendMessage({
        action: type,
        data,
        tabId,
      });
      if (messagePromise && messagePromise.catch) {
        messagePromise.catch(() => {
          console.log(
            `[FIREFOX] Popup not available for notification: ${type}`
          );
        });
      }
    } catch (error) {
      console.log(
        `[FIREFOX] Popup notification skipped:`,
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
}
