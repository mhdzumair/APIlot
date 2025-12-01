// Chrome-specific adapter for service worker
class ChromeAdapter {
    constructor() {
        this.tabStates = new Map(); // Will be reloaded from storage on worker restart
        this.iconManager = new IconManager('chrome');
        this.setupTabListeners();
    }

    async loadFromStorage(keys) {
        return await chrome.storage.local.get(keys) || {};
    }

    async saveToStorage(data) {
        await chrome.storage.local.set(data);
    }

    async initializeTabStates(tabStatesData) {
        // Service worker: always reload from storage
        if (tabStatesData) {
            this.tabStates = new Map(Object.entries(tabStatesData));
        }
    }

    async getTabStatesForStorage() {
        return Object.fromEntries(this.tabStates);
    }

    async getTabState(tabId) {
        // Service worker: check storage first in case we restarted
        if (!this.tabStates.has(tabId)) {
            const data = await chrome.storage.local.get(['tabStates']);
            if (data.tabStates && data.tabStates[tabId]) {
                this.tabStates.set(tabId, data.tabStates[tabId]);
            } else {
                this.tabStates.set(tabId, {
                    enabled: false,
                    requestLog: [],
                    devToolsOpen: false
                });
            }
        }
        return this.tabStates.get(tabId);
    }

    async setTabDevToolsState(tabId, isOpen) {
        const tabState = await this.getTabState(tabId);
        tabState.devToolsOpen = isOpen;
        this.updateTabBadge(tabId);
        
        // Update icon based on new state
        await this.iconManager.updateIconForTabState(tabState, tabId);

        // Service worker: persist immediately
        await this.persistTabState(tabId);
    }

    async persistTabState(tabId) {
        const data = await chrome.storage.local.get(['tabStates']);
        const tabStates = data.tabStates || {};
        tabStates[tabId] = this.tabStates.get(tabId);
        await chrome.storage.local.set({ tabStates });
    }

    updateTabBadge(tabId) {
        const tabState = this.tabStates.get(tabId);
        if (!tabState) return;

        const isActive = tabState.enabled && tabState.devToolsOpen;

        try {
            if (isActive) {
                chrome.action.setBadgeText({ text: "ON", tabId });
                chrome.action.setBadgeBackgroundColor({ color: "#4CAF50", tabId });
            } else {
                chrome.action.setBadgeText({ text: "", tabId });
            }
        } catch (error) {
            console.warn(`⚠️ [CHROME] Could not update badge for tab ${tabId}:`, error.message);
        }
    }

    setupTabListeners() {
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
            if (changeInfo.status === 'loading') {
                await this.resetTabState(tabId);
            }
        });

        chrome.tabs.onRemoved.addListener(async (tabId) => {
            await this.cleanupTabState(tabId);
        });
    }

    async resetTabState(tabId) {
        const tabState = await this.getTabState(tabId);
        const preservedEnabled = tabState.enabled;
        const preservedDevToolsOpen = tabState.devToolsOpen;

        tabState.requestLog = [];
        tabState.enabled = preservedEnabled;
        tabState.devToolsOpen = preservedDevToolsOpen;

        this.updateTabBadge(tabId);
        
        // Update icon based on reset state
        await this.iconManager.updateIconForTabState(tabState, tabId);
        
        await this.persistTabState(tabId);
    }

        async cleanupTabState(tabId) {
        this.tabStates.delete(tabId);
        
        // Reset icon to default for this tab
        await this.iconManager.resetIcon(tabId);

        // Remove from storage
        const data = await chrome.storage.local.get(['tabStates']);
        if (data.tabStates && data.tabStates[tabId]) {
            delete data.tabStates[tabId];
            await chrome.storage.local.set({ tabStates: data.tabStates });
        }
    }

    async addRequestLog(tabId, logEntry) {
        const tabState = await this.getTabState(tabId);
        tabState.requestLog.push(logEntry);

        // Keep log size manageable
        if (tabState.requestLog.length > 1000) {
            tabState.requestLog = tabState.requestLog.slice(-1000);
        }

        console.log(`✅ [CHROME] Request logged for tab ${tabId}, total requests: ${tabState.requestLog.length}`);

        // Service worker: persist immediately
        await this.persistTabState(tabId);
    }

    async updateRequestLog(tabId, requestId, responseData) {
        const tabState = await this.getTabState(tabId);
        const requestEntry = tabState.requestLog.find(entry => entry.id === requestId);

        if (requestEntry) {
            Object.assign(requestEntry, responseData);
            console.log(`✅ [CHROME] Response logged for request: ${requestId} in tab ${tabId}`);

            // Service worker: persist immediately
            await this.persistTabState(tabId);
            return requestEntry;
        } else {
            console.warn(`⚠️ [CHROME] Could not find request entry for response: ${requestId} in tab ${tabId}`);
            return null;
        }
    }

    async clearTabLog(tabId) {
        const tabState = await this.getTabState(tabId);
        tabState.requestLog = [];
        console.log(`🗑️ [CHROME] Cleared request log for tab ${tabId}`);

        // Service worker: persist immediately
        await this.persistTabState(tabId);
    }

    async notifyContentScript(tabId, type, data) {
        try {
            await chrome.tabs.sendMessage(tabId, { type, data });
            console.log(`📡 [CHROME] Content script notified for tab ${tabId}: ${type}`);
        } catch (error) {
            // This is expected when content script isn't ready or tab is loading
            if (error.message.includes('Could not establish connection')) {
                console.log(`⏸️ [CHROME] Content script not ready for tab ${tabId} (${type}) - will retry when ready`);
            } else {
                console.log(`❌ [CHROME] Could not notify content script for tab ${tabId}:`, error.message);
            }
        }
    }

    async notifyDevTools(type, data, tabId = null) {
        try {
            chrome.runtime.sendMessage({
                type: 'DEVTOOLS_' + type,
                data,
                tabId
            }).catch(() => {
                console.log(`📋 [CHROME] DevTools not available for notification: ${type}`);
            });
        } catch (error) {
            console.log(`📋 [CHROME] DevTools notification skipped:`, error.message);
        }
    }

    async notifyPopup(type, data, tabId = null) {
        try {
            chrome.runtime.sendMessage({
                action: type,
                data,
                tabId
            }).catch(() => {
                console.log(`📋 [CHROME] Popup not available for notification: ${type}`);
            });
        } catch (error) {
            console.log(`📋 [CHROME] Popup notification skipped:`, error.message);
        }
    }

        async handleBrowserSpecificMessage(message, sender, sendResponse) {
        // Handle Chrome-specific messages
        switch (message.type) {
            case 'DEVTOOLS_OPENED':
                const previousDevToolsState = this.tabStates.get(message.tabId)?.devToolsOpen || false;
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
                
                await this.persistTabState(message.tabId);

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
