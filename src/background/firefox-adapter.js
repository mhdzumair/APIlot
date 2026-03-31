// Firefox-specific adapter for persistent background script
class FirefoxAdapter {
    constructor() {
        this.tabStates = new Map(); // Can maintain in-memory state
        this.iconManager = new IconManager('firefox');
        this.setupTabListeners();
    }

    /** MV2: blocking webRequest redirects are available for &lt;script src&gt; etc. */
    supportsBlockingWebRequestRedirects() {
        return true;
    }

    async loadFromStorage(keys) {
        const storage = chrome.storage || browser.storage;
        return await storage.local.get(keys) || {};
    }

    async saveToStorage(data) {
        const storage = chrome.storage || browser.storage;
        await storage.local.set(data);
    }

    async initializeTabStates(tabStatesData) {
        if (tabStatesData) {
            this.tabStates = new Map();
            for (const [k, v] of Object.entries(tabStatesData)) {
                const num = Number(k);
                const key = !Number.isNaN(num) && String(num) === String(k).trim() ? num : k;
                this.tabStates.set(key, v);
            }
        }
    }

    async getTabStatesForStorage() {
        return Object.fromEntries(this.tabStates);
    }

    peekTabState(tabId) {
        if (this.tabStates.has(tabId)) {
            return this.tabStates.get(tabId);
        }
        const n = Number(tabId);
        if (!Number.isNaN(n) && this.tabStates.has(n)) {
            return this.tabStates.get(n);
        }
        const s = String(tabId);
        if (this.tabStates.has(s)) {
            return this.tabStates.get(s);
        }
        return null;
    }

    async getTabState(tabId) {
        const canonical = typeof tabId === 'number' && !Number.isNaN(tabId)
            ? tabId
            : /^\d+$/.test(String(tabId))
                ? Number(tabId)
                : tabId;

        if (!this.tabStates.has(canonical)) {
            this.tabStates.set(canonical, {
                enabled: false,
                requestLog: [],
                devToolsOpen: false
            });
        }
        return this.tabStates.get(canonical);
    }

    async setTabDevToolsState(tabId, isOpen) {
        const tabState = await this.getTabState(tabId);
        tabState.devToolsOpen = isOpen;
        this.updateTabBadge(tabId);
        
        // Update icon based on new state
        await this.iconManager.updateIconForTabState(tabState, tabId);
    }

    updateTabBadge(tabId) {
        const tabState = this.peekTabState(tabId);
        if (!tabState) return;

        const isActive = tabState.enabled && tabState.devToolsOpen;
        const browserAction = chrome.browserAction || browser.browserAction;

        if (browserAction) {
            try {
                if (isActive) {
                    if (browserAction.setBadgeText) {
                        browserAction.setBadgeText({ text: "ON", tabId });
                    }
                    if (browserAction.setBadgeBackgroundColor) {
                        browserAction.setBadgeBackgroundColor({ color: "#4CAF50", tabId });
                    }
                } else {
                    if (browserAction.setBadgeText) {
                        browserAction.setBadgeText({ text: "", tabId });
                    }
                }
            } catch (error) {
                console.warn(`⚠️ [FIREFOX] Could not update badge for tab ${tabId}:`, error.message);
            }
        }
    }

    setupTabListeners() {
        const tabs = chrome.tabs || browser.tabs;

        if (tabs && tabs.onUpdated) {
            tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
                if (changeInfo.status === 'loading') {
                    this.resetTabState(tabId);
                }
            });
        }

        if (tabs && tabs.onRemoved) {
            tabs.onRemoved.addListener((tabId) => {
                this.cleanupTabState(tabId);
            });
        }
    }

    async resetTabState(tabId) {
        if (this.tabStates.has(tabId)) {
            const tabState = this.tabStates.get(tabId);
            const preservedEnabled = tabState.enabled;
            const preservedDevToolsOpen = tabState.devToolsOpen;

            tabState.requestLog = [];
            tabState.enabled = preservedEnabled;
            tabState.devToolsOpen = preservedDevToolsOpen;

            this.updateTabBadge(tabId);
            
            // Update icon based on reset state
            await this.iconManager.updateIconForTabState(tabState, tabId);
        }
    }

    async cleanupTabState(tabId) {
        this.tabStates.delete(tabId);
        
        // Reset icon to default for this tab
        await this.iconManager.resetIcon(tabId);
    }

    async addRequestLog(tabId, logEntry) {
        const tabState = await this.getTabState(tabId);
        tabState.requestLog.push(logEntry);

        // Keep log size manageable
        if (tabState.requestLog.length > 1000) {
            tabState.requestLog = tabState.requestLog.slice(-1000);
        }

        console.log(`✅ [FIREFOX] Request logged for tab ${tabId}, total requests: ${tabState.requestLog.length}`);
    }

    async updateRequestLog(tabId, requestId, responseData) {
        const tabState = await this.getTabState(tabId);
        const requestEntry = tabState.requestLog.find(entry => entry.id === requestId);

        if (requestEntry) {
            Object.assign(requestEntry, responseData);
            console.log(`✅ [FIREFOX] Response logged for request: ${requestId} in tab ${tabId}`);
            return requestEntry;
        } else {
            console.warn(`⚠️ [FIREFOX] Could not find request entry for response: ${requestId} in tab ${tabId}`);
            return null;
        }
    }

    async clearTabLog(tabId) {
        const tabState = await this.getTabState(tabId);
        tabState.requestLog = [];
        console.log(`🗑️ [FIREFOX] Cleared request log for tab ${tabId}`);
    }

    async notifyContentScript(tabId, type, data) {
        const tabs = chrome.tabs || browser.tabs;
        try {
            const result = tabs.sendMessage(tabId, { type, data });

            if (result && typeof result.then === 'function') {
                result.then(() => {
                    console.log(`📡 [FIREFOX] Content script notified for tab ${tabId}: ${type}`);
                }).catch(error => {
                    if (error.message.includes('Could not establish connection')) {
                        console.log(`⏸️ [FIREFOX] Content script not ready for tab ${tabId} (${type}) - will retry when ready`);
                    } else {
                        console.log(`❌ [FIREFOX] Could not notify content script for tab ${tabId}:`, error.message);
                    }
                });
            } else {
                console.log(`📡 [FIREFOX] Content script notified for tab ${tabId}: ${type}`);
            }
        } catch (error) {
            console.log(`❌ [FIREFOX] Error sending message to tab ${tabId}:`, error.message);
        }
    }

    async notifyDevTools(type, data, tabId = null) {
        try {
            const runtime = chrome.runtime || browser.runtime;
            if (runtime && runtime.sendMessage) {
                const messagePromise = runtime.sendMessage({
                    type: 'DEVTOOLS_' + type,
                    data,
                    tabId
                });
                if (messagePromise && messagePromise.catch) {
                    messagePromise.catch(() => {
                        console.log(`📋 [FIREFOX] DevTools not available for notification: ${type}`);
                    });
                }
            }
        } catch (error) {
            console.log(`📋 [FIREFOX] DevTools notification skipped:`, error.message);
        }
    }

    async notifyPopup(type, data, tabId = null) {
        try {
            const runtime = chrome.runtime || browser.runtime;
            if (runtime && runtime.sendMessage) {
                const messagePromise = runtime.sendMessage({
                    action: type,
                    data,
                    tabId
                });
                if (messagePromise && messagePromise.catch) {
                    messagePromise.catch(() => {
                        console.log(`📋 [FIREFOX] Popup not available for notification: ${type}`);
                    });
                }
            }
        } catch (error) {
            console.log(`📋 [FIREFOX] Popup notification skipped:`, error.message);
        }
    }

        async handleBrowserSpecificMessage(message, sender, sendResponse) {
        // Handle Firefox-specific messages
        switch (message.type) {
            case 'DEVTOOLS_OPENED':
                const previousDevToolsState = this.peekTabState(message.tabId)?.devToolsOpen || false;
                await this.setTabDevToolsState(message.tabId, true);

                const tabState = await this.getTabState(message.tabId);
                if (tabState.enabled && !previousDevToolsState) {
                    setTimeout(() => {
                        this.notifyContentScript(message.tabId, 'START_MONITORING', {});
                    }, 100);
                }

                await this.notifyPopup('TAB_STATUS_UPDATED', {
                    devToolsOpen: true,
                    isMonitoring: tabState.enabled,
                    enabled: tabState.enabled
                }, message.tabId);

                sendResponse({ success: true });
                break;

            case 'DEVTOOLS_CLOSED':
                await this.setTabDevToolsState(message.tabId, false);
                await this.notifyContentScript(message.tabId, 'STOP_MONITORING', {});

                const closedTabState = await this.getTabState(message.tabId);
                await this.notifyPopup('TAB_STATUS_UPDATED', {
                    devToolsOpen: false,
                    isMonitoring: false,
                    enabled: closedTabState.enabled
                }, message.tabId);

                sendResponse({ success: true });
                break;

            case 'TOGGLE_TAB_ENABLED':
                const toggleTabState = await this.getTabState(message.tabId);
                toggleTabState.enabled = message.enabled;

                if (message.enabled && toggleTabState.devToolsOpen) {
                    await this.notifyContentScript(message.tabId, 'START_MONITORING', {});
                } else if (!message.enabled) {
                    await this.notifyContentScript(message.tabId, 'STOP_MONITORING', {});
                }

                this.updateTabBadge(message.tabId);
                
                // Update icon based on new enabled state
                await this.iconManager.updateIconForTabState(toggleTabState, message.tabId);

                await this.notifyPopup('TAB_STATUS_UPDATED', {
                    enabled: message.enabled,
                    isMonitoring: message.enabled && toggleTabState.devToolsOpen,
                    devToolsOpen: toggleTabState.devToolsOpen
                }, message.tabId);

                await this.notifyDevTools('TAB_STATUS_UPDATED', {
                    enabled: message.enabled,
                    isMonitoring: message.enabled && toggleTabState.devToolsOpen,
                    devToolsOpen: toggleTabState.devToolsOpen
                }, message.tabId);

                sendResponse({ success: true });
                break;

            default:
                sendResponse({ success: false, error: 'Unknown message type' });
        }
    }
}
