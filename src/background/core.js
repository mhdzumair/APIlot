// Shared core logic for both Firefox background script and Chrome service worker
class GraphQLTestingCore {
    constructor(browserAdapter) {
        this.adapter = browserAdapter;
        this.maxLogSize = 1000;

        // Initialize based on browser capabilities
        this.initializeCore();
    }

    async initializeCore() {
        // Load data using browser-specific adapter
        const data = await this.adapter.loadFromStorage(['graphqlRules', 'tabStates', 'settings']);

        // Initialize rules
        this.rules = new Map();
        if (data.graphqlRules) {
            this.rules = new Map(Object.entries(data.graphqlRules));
        }

        // Initialize tab states using adapter
        await this.adapter.initializeTabStates(data.tabStates);

        // Initialize settings
        this.settings = data.settings || { logProfile: 'basic' };

        console.log(`🚀 [CORE] Extension initialized - Rules: ${this.rules.size}, Profile: ${this.settings.logProfile}`);
    }

    async saveRules() {
        const rulesObj = Object.fromEntries(this.rules);
        const tabStatesObj = await this.adapter.getTabStatesForStorage();

        await this.adapter.saveToStorage({
            graphqlRules: rulesObj,
            tabStates: tabStatesObj,
            settings: this.settings
        });
    }

    // Core business logic methods (same for both browsers)
    addRule(rule) {
        const ruleId = 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        rule.id = ruleId;
        rule.enabled = rule.enabled !== false;
        rule.createdAt = new Date().toISOString();

        this.rules.set(ruleId, rule);
        return ruleId;
    }

    updateRule(ruleId, updates) {
        if (this.rules.has(ruleId)) {
            const existingRule = this.rules.get(ruleId);
            const updatedRule = { ...existingRule, ...updates, id: ruleId };
            this.rules.set(ruleId, updatedRule);
        }
    }

    deleteRule(ruleId) {
        return this.rules.delete(ruleId);
    }

    findMatchingRules(graphqlData, url) {
        const matchingRules = [];

        for (const [ruleId, rule] of this.rules) {
            if (!rule.enabled) continue;

            if (this.ruleMatches(rule, graphqlData, url)) {
                matchingRules.push(rule);
            }
        }

        return matchingRules;
    }

    ruleMatches(rule, graphqlData, url) {
        // Check operation name match
        if (rule.operationName && rule.operationName !== graphqlData.operationName) {
            return false;
        }

        // Check URL pattern match
        if (rule.urlPattern) {
            return this.urlPatternMatches(rule.urlPattern, url);
        }

        return true;
    }

    urlPatternMatches(pattern, url) {
        const trimmedPattern = pattern.trim();

        // Regex pattern
        if (trimmedPattern.startsWith('/') && trimmedPattern.endsWith('/')) {
            try {
                const regexPattern = trimmedPattern.slice(1, -1);
                const regex = new RegExp(regexPattern);
                return regex.test(url);
            } catch (e) {
                return false;
            }
        }

        // Auto-regex for special chars
        if (/[.*+?^${}()|[\]\\]/.test(trimmedPattern)) {
            try {
                const regex = new RegExp(trimmedPattern);
                return regex.test(url);
            } catch (e) {
                // Fall back to string matching
            }
        }

        // Simple string matching
        return url.toLowerCase().includes(trimmedPattern.toLowerCase());
    }

    exportRules() {
        return {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            totalRules: this.rules.size,
            rules: Array.from(this.rules.values())
        };
    }

    importRules(data) {
        if (!data.rules || !Array.isArray(data.rules)) {
            throw new Error('Invalid rules data');
        }

        data.rules.forEach(rule => {
            this.addRule(rule);
        });
    }

    // Message handling (same logic, different implementations)
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'GET_RULES':
                    const tabId = message.tabId;
                    const tabState = await this.adapter.getTabState(tabId);

                    sendResponse({
                        success: true,
                        data: {
                            rules: Array.from(this.rules.entries()),
                            tabEnabled: tabState ? tabState.enabled : true,
                            requestLog: tabState ? tabState.requestLog : [],
                            tabId: tabId
                        }
                    });
                    break;

                case 'ADD_RULE':
                    const ruleId = this.addRule(message.rule);
                    await this.saveRules();

                    // Notify using adapter
                    await this.adapter.notifyDevTools('RULE_ADDED', { ruleId, rule: this.rules.get(ruleId) });
                    await this.adapter.notifyPopup('RULES_UPDATED', { ruleId, rule: this.rules.get(ruleId) });

                    sendResponse({ success: true, ruleId });
                    break;

                case 'UPDATE_RULE':
                    this.updateRule(message.ruleId, message.rule);
                    await this.saveRules();

                    await this.adapter.notifyDevTools('RULE_UPDATED', { ruleId: message.ruleId, rule: this.rules.get(message.ruleId) });

                    sendResponse({ success: true });
                    break;

                case 'DELETE_RULE':
                    const deletedRule = this.rules.get(message.ruleId);
                    this.deleteRule(message.ruleId);
                    await this.saveRules();

                    await this.adapter.notifyDevTools('RULE_DELETED', { ruleId: message.ruleId, rule: deletedRule });

                    sendResponse({ success: true });
                    break;

                case 'GET_MATCHING_RULE':
                    const matchTabId = sender.tab?.id;
                    const matchTabState = await this.adapter.getTabState(matchTabId);
                    const tabEnabled = matchTabState ? matchTabState.enabled : false;

                    let rules = [];
                    if (tabEnabled) {
                        rules = this.findMatchingRules(message.data.graphqlData, message.data.url);
                    }

                    const rule = rules.length > 0 ? rules[0] : null;
                    sendResponse({ success: true, rule, rules, enabled: tabEnabled });
                    break;

                case 'EXPORT_RULES':
                    sendResponse({
                        success: true,
                        data: this.exportRules()
                    });
                    break;

                case 'IMPORT_RULES':
                    this.importRules(message.data);
                    await this.saveRules();
                    sendResponse({ success: true });
                    break;

                case 'LOG_REQUEST':
                    await this.logRequest(message.data, sender.tab?.id);
                    sendResponse({ success: true });
                    break;

                case 'LOG_RESPONSE':
                    await this.logResponse(message.data, sender.tab?.id);
                    sendResponse({ success: true });
                    break;

                case 'CLEAR_LOG':
                    const clearTabId = message.tabId || sender.tab?.id;
                    if (clearTabId) {
                        await this.adapter.clearTabLog(clearTabId);
                    }
                    sendResponse({ success: true });
                    break;

                case 'GET_SETTINGS':
                    sendResponse({ success: true, settings: this.settings });
                    break;

                case 'UPDATE_SETTINGS':
                    this.settings = { ...this.settings, ...message.settings };
                    await this.saveRules();
                    await this.adapter.notifyPopup('SETTINGS_UPDATED', message.settings);
                    sendResponse({ success: true });
                    break;

                case 'RESET_SETTINGS':
                    this.settings = { logProfile: 'basic' };
                    await this.saveRules();
                    sendResponse({ success: true });
                    break;

                case 'GET_ENABLED_STATUS':
                    const statusTabId = sender.tab?.id;
                    const statusTabState = await this.adapter.getTabState(statusTabId);
                    const statusEnabled = statusTabState ? statusTabState.enabled : false;
                    sendResponse({ enabled: statusEnabled });
                    break;

                case 'GET_TAB_STATUS':
                    const popupTabId = message.tabId;
                    if (popupTabId) {
                        const popupTabState = await this.adapter.getTabState(popupTabId);
                        const requestCount = popupTabState.requestLog.length;
                        const activeRules = this.rules.size;
                        const isMonitoring = popupTabState.enabled && popupTabState.devToolsOpen;

                        sendResponse({
                            success: true,
                            requestCount,
                            activeRules,
                            isMonitoring,
                            enabled: popupTabState.enabled,
                            devToolsOpen: popupTabState.devToolsOpen
                        });
                    } else {
                        sendResponse({ success: false, error: 'No tab ID provided' });
                    }
                    break;

                case 'GET_TAB_STATE':
                    const requestTabId = sender.tab ? sender.tab.id : null;
                    const requestTabState = requestTabId ? await this.adapter.getTabState(requestTabId) : null;
                    sendResponse({
                        success: true,
                        devToolsOpen: requestTabState ? requestTabState.devToolsOpen : false,
                        enabled: requestTabState ? requestTabState.enabled : false
                    });
                    break;

                default:
                    // Delegate browser-specific messages to adapter
                    return await this.adapter.handleBrowserSpecificMessage(message, sender, sendResponse);
            }
        } catch (error) {
            console.error('Core message handling error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async logRequest(requestData, tabId) {
        console.log(`📝 [CORE] Logging request for tab ${tabId}:`, {
            requestId: requestData.requestId,
            operationName: requestData.operationName,
            url: requestData.url
        });

        if (!tabId) {
            console.warn('⚠️ [CORE] No tab ID provided for request logging');
            return;
        }

        const logEntry = {
            id: requestData.requestId || Date.now() + Math.random(),
            timestamp: requestData.timestamp || new Date().toISOString(),
            url: requestData.url,
            operationName: requestData.operationName,
            query: requestData.query,
            variables: requestData.variables,
            requestHeaders: requestData.requestHeaders || {},
            tabId: tabId
        };

        await this.adapter.addRequestLog(tabId, logEntry);

        // Notify DevTools and popup
        await this.adapter.notifyDevTools('REQUEST_LOGGED', logEntry, tabId);
        await this.adapter.notifyPopup('REQUEST_LOGGED', logEntry, tabId);
    }

    async logResponse(responseData, tabId) {
        console.log(`📥 [CORE] Logging response for tab ${tabId}:`, {
            requestId: responseData.requestId,
            status: responseData.status,
            hasResponse: !!responseData.response,
            error: responseData.error
        });

        if (!tabId) {
            console.warn('⚠️ [CORE] No tab ID provided for response logging');
            return;
        }

        const updatedEntry = await this.adapter.updateRequestLog(tabId, responseData.requestId, {
            response: responseData.response,
            responseStatus: responseData.status,
            responseStatusText: responseData.statusText,
            responseHeaders: responseData.headers,
            responseError: responseData.error,
            responseTimestamp: responseData.timestamp
        });

        if (updatedEntry) {
            await this.adapter.notifyDevTools('RESPONSE_LOGGED', updatedEntry, tabId);
        }
    }
}
