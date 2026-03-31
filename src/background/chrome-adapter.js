// Chrome-specific adapter for service worker
class ChromeAdapter {
    constructor() {
        this.tabStates = new Map(); // Will be reloaded from storage on worker restart
        this.iconManager = new IconManager('chrome');
        this.setupTabListeners();
    }

    /** MV3: blocking webRequest not available; use declarativeNetRequest.syncDeclarativeRedirectRules instead. */
    supportsBlockingWebRequestRedirects() {
        return false;
    }

    async loadFromStorage(keys) {
        return await chrome.storage.local.get(keys) || {};
    }

    async saveToStorage(data) {
        await chrome.storage.local.set(data);
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

    /** Synchronous read for webRequest (hot path). */
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
            const data = await chrome.storage.local.get(['tabStates']);
            const stored = data.tabStates || {};
            const fromStore = stored[canonical] ?? stored[String(canonical)];
            if (fromStore) {
                this.tabStates.set(canonical, fromStore);
            } else {
                this.tabStates.set(canonical, {
                    enabled: false,
                    requestLog: [],
                    devToolsOpen: false
                });
            }
        }
        return this.tabStates.get(canonical);
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
        const state = this.peekTabState(tabId) || (await this.getTabState(tabId));
        tabStates[String(tabId)] = state;
        await chrome.storage.local.set({ tabStates });
    }

    updateTabBadge(tabId) {
        const tabState = this.peekTabState(tabId);
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

    /**
     * Chrome MV3: applies redirect rules to &lt;script src&gt;, import(), and XHR at the network layer.
     */
    async syncDeclarativeRedirectRules(rulesMap) {
        if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
            return;
        }
        if (typeof ApilotRuleMatch === 'undefined' || !ApilotRuleMatch.buildRedirectRegexFilter) {
            console.warn('[CHROME] ApilotRuleMatch missing; declarative redirects disabled');
            return;
        }

        const MIN_ID = 900000;
        const MAX_ID = 909999;

        const existing = await chrome.declarativeNetRequest.getDynamicRules();
        const removeIds = existing.filter((r) => r.id >= MIN_ID && r.id <= MAX_ID).map((r) => r.id);

        const addRules = [];
        let nid = MIN_ID;

        for (const rule of rulesMap.values()) {
            if (!rule || !rule.enabled || rule.action !== 'redirect') continue;
            const target = (rule.redirectUrl || '').trim();
            if (!target) continue;

            const dnr = ApilotRuleMatch.buildChromeDeclarativeRedirect
                ? ApilotRuleMatch.buildChromeDeclarativeRedirect(rule)
                : null;
            if (!dnr || !dnr.regexFilter || !dnr.redirect) {
                console.warn(
                    '[APILOT DNR] Redirect needs Host/Domain (urlPattern) and valid redirectUrl:',
                    rule.name || rule.id
                );
                continue;
            }

            // Omit resourceTypes / requestMethods so script, XHR, cached loads, etc. all match (Chrome defaults).
            const condition = { regexFilter: dnr.regexFilter };

            addRules.push({
                id: nid++,
                priority: 1,
                action: {
                    type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
                    redirect: dnr.redirect
                },
                condition
            });

            if (nid > MAX_ID) {
                console.warn('[APILOT DNR] Max redirect rule count reached');
                break;
            }
        }

        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: removeIds,
            addRules
        });
        console.log('[APILOT DNR] Synced redirect rules:', addRules.length);
    }
}
