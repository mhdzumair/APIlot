// Shared core logic for both Firefox background script and Chrome service worker
// APIlot - Supports both GraphQL and REST APIs
class APITestingCore {
    constructor(browserAdapter) {
        this.adapter = browserAdapter;
        this.maxLogSize = 1000;

        // Create a ready promise that resolves when initialization is complete
        this.readyPromise = this.initializeCore();
    }

    // Wait for core to be ready before handling messages
    async waitForReady() {
        await this.readyPromise;
    }

    async initializeCore() {
        // Load data using browser-specific adapter
        const data = await this.adapter.loadFromStorage(['apiRules', 'graphqlRules', 'tabStates', 'settings', 'aiSettings', 'performanceData', 'sessions']);

        // Initialize rules (support both old graphqlRules and new apiRules)
        this.rules = new Map();
        if (data.apiRules) {
            this.rules = new Map(Object.entries(data.apiRules));
        } else if (data.graphqlRules) {
            // Migrate old GraphQL rules
            this.rules = new Map(Object.entries(data.graphqlRules));
            // Mark them as GraphQL type
            for (const [id, rule] of this.rules) {
                if (!rule.requestType) {
                    rule.requestType = 'graphql';
                }
            }
        }

        // Initialize tab states using adapter
        await this.adapter.initializeTabStates(data.tabStates);

        // Initialize settings
        this.settings = data.settings || { logProfile: 'basic', theme: 'system' };

        // Initialize AI settings
        this.aiSettings = data.aiSettings || {
            provider: 'local',
            openaiApiKey: '',
            openaiModel: 'gpt-4o',
            anthropicApiKey: '',
            anthropicModel: 'claude-sonnet-4-20250514',
            callsCount: 0,
            tokensUsed: 0,
            mocksGenerated: 0
        };

        // Initialize performance data
        this.performanceData = data.performanceData || {
            requests: [],
            aggregates: {
                totalRequests: 0,
                successCount: 0,
                errorCount: 0,
                totalResponseTime: 0
            }
        };

        // Initialize sessions for time-travel
        this.sessions = data.sessions || [];

        // Track captured request IDs to deduplicate between injected script and webRequest
        this.capturedRequestIds = new Set();
        this.webRequestBuffer = new Map(); // tabId -> array of buffered requests
        
        // Setup browser-level network capture for early requests
        this.setupWebRequestCapture();

        console.log(`🚀 [CORE] APIlot initialized - Rules: ${this.rules.size}, Profile: ${this.settings.logProfile}`);
    }

    // Setup browser-level network request capture as backup for early requests
    setupWebRequestCapture() {
        const webRequest = chrome.webRequest || browser.webRequest;
        if (!webRequest) {
            console.log('[CORE] webRequest API not available');
            return;
        }

        // Patterns to identify API requests (REST and GraphQL)
        const apiPatterns = ['/api/', '/v1/', '/v2/', '/v3/', '/rest/', '/graphql', '/query', '/services/'];
        const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map', '.html', '.htm'];

        // Check if URL looks like an API request
        const isApiRequest = (url) => {
            if (!url) return false;
            const urlLower = url.toLowerCase();
            const urlPath = urlLower.split('?')[0];
            
            // Skip static resources
            if (staticExtensions.some(ext => urlPath.endsWith(ext))) return false;
            // Skip extension URLs
            if (urlLower.includes('chrome-extension://') || urlLower.includes('moz-extension://')) return false;
            
            // Check for API patterns
            return apiPatterns.some(pattern => urlLower.includes(pattern));
        };

        // Listen for request start
        webRequest.onBeforeRequest.addListener(
            (details) => {
                // Only capture for tabs with DevTools open and monitoring enabled
                const tabState = this.adapter.getTabState(details.tabId);
                if (!tabState || !tabState.devToolsOpen || !tabState.enabled) {
                    return;
                }

                if (!isApiRequest(details.url)) return;

                // Generate a unique ID for deduplication
                const webRequestId = `webreq_${details.requestId}_${details.tabId}`;
                
                // Check if this might be a duplicate (same URL within short time window)
                // We'll do proper deduplication when the request is logged
                
                const requestData = {
                    webRequestId,
                    browserRequestId: details.requestId,
                    url: details.url,
                    method: details.method,
                    timestamp: new Date().toISOString(),
                    startTime: Date.now(),
                    tabId: details.tabId,
                    type: details.type,
                    frameId: details.frameId,
                    parentFrameId: details.parentFrameId,
                    source: 'webRequest'
                };

                // Buffer the request
                if (!this.webRequestBuffer.has(details.tabId)) {
                    this.webRequestBuffer.set(details.tabId, []);
                }
                this.webRequestBuffer.get(details.tabId).push(requestData);

                console.log(`🌐 [CORE] WebRequest captured:`, {
                    url: details.url,
                    method: details.method,
                    tabId: details.tabId
                });
            },
            { urls: ['<all_urls>'] },
            ['requestBody']
        );

        // Listen for response headers to capture status
        webRequest.onHeadersReceived.addListener(
            (details) => {
                const tabBuffer = this.webRequestBuffer.get(details.tabId);
                if (!tabBuffer) return;

                const request = tabBuffer.find(r => r.browserRequestId === details.requestId);
                if (request) {
                    request.responseStatus = details.statusCode;
                    request.responseStatusText = details.statusLine;
                    request.responseHeaders = details.responseHeaders;
                }
            },
            { urls: ['<all_urls>'] },
            ['responseHeaders']
        );

        // Listen for request completion
        webRequest.onCompleted.addListener(
            async (details) => {
                const tabBuffer = this.webRequestBuffer.get(details.tabId);
                if (!tabBuffer) return;

                const requestIndex = tabBuffer.findIndex(r => r.browserRequestId === details.requestId);
                if (requestIndex === -1) return;

                const request = tabBuffer[requestIndex];
                request.endTime = Date.now();
                request.responseTime = request.endTime - request.startTime;
                request.completed = true;

                // Check if this request was already captured by injected script
                const isDuplicate = this.isLikelyDuplicate(request, details.tabId);
                
                if (!isDuplicate) {
                    // This request wasn't captured by injected script, log it
                    console.log(`🌐 [CORE] WebRequest completing (not captured by injector):`, {
                        url: request.url,
                        method: request.method,
                        status: details.statusCode,
                        time: request.responseTime + 'ms'
                    });

                    await this.logWebRequest(request, details);
                }

                // Remove from buffer
                tabBuffer.splice(requestIndex, 1);
            },
            { urls: ['<all_urls>'] }
        );

        // Clean up on request error
        webRequest.onErrorOccurred.addListener(
            (details) => {
                const tabBuffer = this.webRequestBuffer.get(details.tabId);
                if (!tabBuffer) return;

                const requestIndex = tabBuffer.findIndex(r => r.browserRequestId === details.requestId);
                if (requestIndex !== -1) {
                    tabBuffer.splice(requestIndex, 1);
                }
            },
            { urls: ['<all_urls>'] }
        );

        // Clear buffer when tabs navigate or close
        const tabs = chrome.tabs || browser.tabs;
        if (tabs) {
            tabs.onUpdated.addListener((tabId, changeInfo) => {
                if (changeInfo.status === 'loading') {
                    this.clearWebRequestBuffer(tabId);
                }
            });
            
            tabs.onRemoved.addListener((tabId) => {
                this.clearWebRequestBuffer(tabId);
            });
        }

        console.log('🌐 [CORE] WebRequest capture initialized');
    }

    // Check if a webRequest capture is likely a duplicate of an injected script capture
    isLikelyDuplicate(webRequest, tabId) {
        const tabState = this.adapter.getTabState(tabId);
        if (!tabState || !tabState.requestLog) return false;

        // Check recent requests (within 2 seconds) with same URL and method
        const recentCutoff = Date.now() - 2000;
        
        for (const logEntry of tabState.requestLog) {
            if (!logEntry.timestamp) continue;
            
            const logTime = new Date(logEntry.timestamp).getTime();
            if (logTime < recentCutoff) continue;

            // Match by URL and method
            if (logEntry.url === webRequest.url && 
                (logEntry.method || 'POST') === webRequest.method) {
                console.log(`🔄 [CORE] Duplicate detected, skipping webRequest:`, webRequest.url);
                return true;
            }
        }

        return false;
    }

    // Log a request captured via webRequest API
    async logWebRequest(request, details) {
        const requestType = this.detectRequestType(request.url, request.method);
        
        const logEntry = {
            id: request.webRequestId,
            requestType: requestType,
            url: request.url,
            method: request.method,
            timestamp: request.timestamp,
            startTime: request.startTime,
            responseStatus: request.responseStatus || details.statusCode,
            responseTimestamp: new Date().toISOString(),
            endTime: request.endTime,
            source: 'webRequest',
            frameId: request.frameId,
            // Generate operation name for REST
            operationName: requestType === 'rest' ? this.generateOperationName(request.url, request.method) : 'WebRequest'
        };

        // Notify DevTools panel
        await this.adapter.notifyDevTools('REQUEST_LOGGED', logEntry, request.tabId);
        
        // Also notify as response since we have the completion
        await this.adapter.notifyDevTools('RESPONSE_LOGGED', {
            ...logEntry,
            response: null, // webRequest can't capture response body easily
            responseHeaders: request.responseHeaders
        }, request.tabId);
    }

    // Detect if URL is GraphQL or REST
    detectRequestType(url, method) {
        if (!url) return 'rest';
        const urlLower = url.toLowerCase();
        if (urlLower.includes('/graphql') || urlLower.includes('/query')) {
            return 'graphql';
        }
        return 'rest';
    }

    // Generate operation name from URL for REST requests
    generateOperationName(url, method) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            const meaningfulParts = pathParts.filter(part => {
                if (/^\d+$/.test(part)) return false;
                if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(part)) return false;
                if (/^v\d+$/i.test(part)) return false;
                if (part.toLowerCase() === 'api') return false;
                return true;
            });
            
            if (meaningfulParts.length > 0) {
                const resource = meaningfulParts[meaningfulParts.length - 1];
                const titleCase = resource.charAt(0).toUpperCase() + resource.slice(1).toLowerCase();
                return `${method} ${titleCase}`;
            }
        } catch (e) {
            // Ignore URL parsing errors
        }
        return `${method} Request`;
    }

    // Mark a request ID as captured (called when injected script logs a request)
    markRequestCaptured(requestId, url, tabId) {
        // Add to captured set for deduplication
        const key = `${tabId}_${url}_${Date.now()}`;
        this.capturedRequestIds.add(key);
        
        // Clean up old entries (older than 5 seconds)
        // This is a simple approach; a more sophisticated one would use a Map with timestamps
    }

    // Clear webRequest buffer for a tab (called when tab navigates or closes)
    clearWebRequestBuffer(tabId) {
        if (this.webRequestBuffer && this.webRequestBuffer.has(tabId)) {
            console.log(`🧹 [CORE] Clearing webRequest buffer for tab ${tabId}`);
            this.webRequestBuffer.delete(tabId);
        }
    }

    async saveRules() {
        const rulesObj = Object.fromEntries(this.rules);
        const tabStatesObj = await this.adapter.getTabStatesForStorage();

        await this.adapter.saveToStorage({
            apiRules: rulesObj,
            tabStates: tabStatesObj,
            settings: this.settings,
            aiSettings: this.aiSettings,
            performanceData: this.performanceData,
            sessions: this.sessions
        });
    }

    // Core business logic methods (same for both browsers)
    addRule(rule) {
        const ruleId = 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        rule.id = ruleId;
        rule.enabled = rule.enabled !== false;
        rule.createdAt = new Date().toISOString();
        // Default to graphql if not specified for backward compatibility
        rule.requestType = rule.requestType || 'graphql';

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

    findMatchingRules(requestData, url) {
        const matchingRules = [];
        const requestType = requestData.requestType || 'graphql';

        for (const [ruleId, rule] of this.rules) {
            if (!rule.enabled) continue;

            if (this.ruleMatches(rule, requestData, url, requestType)) {
                matchingRules.push(rule);
            }
        }

        return matchingRules;
    }

    ruleMatches(rule, requestData, url, requestType) {
        // Check request type match
        const ruleRequestType = rule.requestType || 'graphql';
        if (ruleRequestType !== 'both' && ruleRequestType !== requestType) {
            return false;
        }

        // GraphQL-specific matching
        if (requestType === 'graphql' && (ruleRequestType === 'graphql' || ruleRequestType === 'both')) {
            // Check operation name (supports wildcards)
            if (rule.operationName && requestData.operationName) {
                if (!this.patternMatches(rule.operationName, requestData.operationName)) {
                    return false;
                }
            } else if (rule.operationName && !requestData.operationName) {
                return false;
            }
            
            // Check GraphQL endpoint path
            if (rule.graphqlEndpoint) {
                const urlPath = this.getUrlPath(url);
                if (!this.patternMatches(rule.graphqlEndpoint, urlPath)) {
                    return false;
                }
            }
        }

        // REST-specific matching
        if (requestType === 'rest' && (ruleRequestType === 'rest' || ruleRequestType === 'both')) {
            // Check HTTP method
            if (rule.httpMethod && rule.httpMethod !== 'ALL') {
                if (requestData.method && rule.httpMethod !== requestData.method) {
                    return false;
                }
            }
            
            // Check REST path pattern
            if (rule.restPath) {
                const urlPath = this.getUrlPath(url);
                if (!this.pathPatternMatches(rule.restPath, urlPath)) {
                    return false;
                }
            }
            
            // Check REST endpoint name (last path segment)
            if (rule.restEndpoint) {
                const endpoint = this.getEndpointFromUrl(url);
                if (!this.patternMatches(rule.restEndpoint, endpoint)) {
                    return false;
                }
            }
            
            // Check query parameter filter
            if (rule.queryFilter && Object.keys(rule.queryFilter).length > 0) {
                const urlParams = this.getQueryParamsFromUrl(url);
                if (!this.queryParamsMatch(rule.queryFilter, urlParams)) {
                    return false;
                }
            }
            
            // Check request body pattern (regex)
            if (rule.bodyPattern) {
                const requestBody = this.getRequestBodyString(requestData);
                if (!this.bodyPatternMatches(rule.bodyPattern, requestBody)) {
                    return false;
                }
            }
        }

        // Check domain/host pattern match (common for both)
        if (rule.urlPattern) {
            if (!this.urlPatternMatches(rule.urlPattern, url)) {
                return false;
            }
        }

        return true;
    }

    // Get path from URL
    getUrlPath(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname;
        } catch (e) {
            return url;
        }
    }

    // Get endpoint name (last path segment)
    getEndpointFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const segments = urlObj.pathname.split('/').filter(s => s);
            return segments.length > 0 ? segments[segments.length - 1].split('?')[0] : '';
        } catch (e) {
            return '';
        }
    }

    // Simple pattern matching with wildcards
    patternMatches(pattern, value) {
        if (!pattern || !value) return false;
        
        // Exact match
        if (!pattern.includes('*')) {
            return pattern.toLowerCase() === value.toLowerCase();
        }
        
        // Wildcard match
        const regexPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(value);
    }

    // Path pattern matching (supports * and :param)
    pathPatternMatches(pattern, path) {
        if (!pattern || !path) return false;
        
        // Convert pattern to regex
        // :param matches any segment, * matches anything
        const regexPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/:\w+/g, '[^/]+')  // :param matches one segment
            .replace(/\*/g, '.*');       // * matches anything
        
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(path);
    }

    // Get query parameters from URL
    getQueryParamsFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const params = {};
            urlObj.searchParams.forEach((value, key) => {
                params[key] = value;
            });
            return params;
        } catch (e) {
            return {};
        }
    }

    // Check if query parameters match the filter
    queryParamsMatch(filter, urlParams) {
        for (const [key, expectedValue] of Object.entries(filter)) {
            const actualValue = urlParams[key];
            
            // If key doesn't exist in URL params, no match
            if (actualValue === undefined) {
                return false;
            }
            
            // If expected value is "*", match any value (just check key exists)
            if (expectedValue === '*') {
                continue;
            }
            
            // Support wildcard in value
            if (typeof expectedValue === 'string' && expectedValue.includes('*')) {
                if (!this.patternMatches(expectedValue, String(actualValue))) {
                    return false;
                }
            } else {
                // Exact match
                if (String(actualValue) !== String(expectedValue)) {
                    return false;
                }
            }
        }
        return true;
    }

    // Get request body as string for regex matching
    getRequestBodyString(requestData) {
        const body = requestData.body || requestData.variables;
        if (!body) return '';
        
        if (typeof body === 'string') {
            return body;
        }
        
        try {
            return JSON.stringify(body);
        } catch (e) {
            return String(body);
        }
    }

    // Check if request body matches the regex pattern
    bodyPatternMatches(pattern, bodyString) {
        if (!pattern || !bodyString) return false;
        
        try {
            const regex = new RegExp(pattern, 'i');
            return regex.test(bodyString);
        } catch (e) {
            // If regex is invalid, try simple string contains
            return bodyString.toLowerCase().includes(pattern.toLowerCase());
        }
    }

    urlPatternMatches(pattern, url) {
        const trimmedPattern = pattern.trim();

        // Regex pattern (starts and ends with /)
        if (trimmedPattern.startsWith('/') && trimmedPattern.endsWith('/')) {
            try {
                const regexPattern = trimmedPattern.slice(1, -1);
                const regex = new RegExp(regexPattern);
                return regex.test(url);
            } catch (e) {
                return false;
            }
        }

        // Wildcard pattern (contains *)
        if (trimmedPattern.includes('*')) {
            const regexPattern = trimmedPattern
                .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special chars except *
                .replace(/\*/g, '.*');  // Convert * to .*
            try {
                const regex = new RegExp(regexPattern, 'i');
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

        // Simple string matching (case-insensitive)
        return url.toLowerCase().includes(trimmedPattern.toLowerCase());
    }

    exportRules() {
        return {
            version: '2.0.0',
            application: 'APIlot',
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

    // Performance tracking methods
    trackPerformance(requestData, responseData) {
        const entry = {
            id: requestData.requestId,
            timestamp: new Date().toISOString(),
            requestType: requestData.requestType || 'graphql',
            operationName: requestData.operationName,
            method: requestData.method,
            endpoint: requestData.endpoint,
            url: requestData.url,
            responseTime: responseData.responseTime || 0,
            status: responseData.status,
            success: responseData.status >= 200 && responseData.status < 400,
            requestSize: JSON.stringify(requestData).length,
            responseSize: responseData.response ? JSON.stringify(responseData.response).length : 0
        };

        // Keep only last 1000 entries
        if (this.performanceData.requests.length >= 1000) {
            this.performanceData.requests.shift();
        }
        this.performanceData.requests.push(entry);

        // Update aggregates
        this.performanceData.aggregates.totalRequests++;
        if (entry.success) {
            this.performanceData.aggregates.successCount++;
        } else {
            this.performanceData.aggregates.errorCount++;
        }
        this.performanceData.aggregates.totalResponseTime += entry.responseTime;
    }

    getPerformanceMetrics(timeRange = 'all') {
        let requests = this.performanceData.requests || [];
        
        // Filter by time range
        if (timeRange !== 'all') {
            const now = Date.now();
            let cutoff;
            switch (timeRange) {
                case 'hour':
                    cutoff = now - 3600000;
                    break;
                case 'day':
                    cutoff = now - 86400000;
                    break;
                case 'week':
                    cutoff = now - 604800000;
                    break;
                default:
                    cutoff = 0;
            }
            requests = requests.filter(r => new Date(r.timestamp).getTime() > cutoff);
        }

        if (requests.length === 0) {
            return {
                avgResponseTime: 0,
                totalRequests: 0,
                successRate: 100,
                activeRequests: 0,
                slowestRequests: [],
                requestsByType: { graphql: 0, rest: 0 },
                timeSeriesData: []
            };
        }

        const totalResponseTime = requests.reduce((sum, r) => sum + (r.responseTime || 0), 0);
        const successCount = requests.filter(r => r.success || r.status === 'success').length;

        // Get top 5 slowest requests
        const slowestRequests = [...requests]
            .sort((a, b) => (b.responseTime || 0) - (a.responseTime || 0))
            .slice(0, 5)
            .map(r => ({
                id: r.id,
                requestType: r.requestType || 'graphql',
                operationName: r.operationName,
                endpoint: r.endpoint,
                url: r.url,
                responseTime: r.responseTime,
                status: r.status || (r.success ? 'success' : 'error'),
                httpStatus: r.httpStatus || r.responseStatus,
                timestamp: r.timestamp
            }));

        // Count by type
        const requestsByType = {
            graphql: requests.filter(r => r.requestType === 'graphql').length,
            rest: requests.filter(r => r.requestType === 'rest').length
        };

        // Generate time series data for charts (last 50 points)
        const timeSeriesData = requests
            .slice(-50)
            .map(r => ({
                timestamp: r.timestamp,
                responseTime: r.responseTime,
                status: r.status || (r.success ? 'success' : 'error'),
                requestType: r.requestType
            }));

        return {
            avgResponseTime: Math.round(totalResponseTime / requests.length),
            totalRequests: requests.length,
            successRate: Math.round((successCount / requests.length) * 100),
            activeRequests: 0, // Would need to track active requests separately
            slowestRequests,
            requestsByType,
            timeSeriesData
        };
    }

    // Session management for time-travel
    createSession(name) {
        const session = {
            id: 'session_' + Date.now(),
            name: name || `Session ${this.sessions.length + 1}`,
            startTime: new Date().toISOString(),
            endTime: null,
            requests: [],
            status: 'recording'
        };
        this.sessions.push(session);
        return session;
    }

    endSession(sessionId) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            session.endTime = new Date().toISOString();
            session.status = 'completed';
        }
        return session;
    }

    addRequestToSession(sessionId, requestData, responseData) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session && session.status === 'recording') {
            session.requests.push({
                id: requestData.requestId,
                timestamp: new Date().toISOString(),
                requestType: requestData.requestType || 'graphql',
                url: requestData.url,
                method: requestData.method,
                operationName: requestData.operationName,
                request: requestData,
                response: responseData
            });
        }
    }

    getSessions() {
        return this.sessions;
    }

    deleteSession(sessionId) {
        const index = this.sessions.findIndex(s => s.id === sessionId);
        if (index !== -1) {
            this.sessions.splice(index, 1);
            return true;
        }
        return false;
    }

    exportSession(sessionId) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) return null;

        return {
            version: '1.0.0',
            application: 'APIlot',
            exportedAt: new Date().toISOString(),
            session: session
        };
    }

    importSession(data) {
        if (!data.session) {
            throw new Error('Invalid session data');
        }

        const session = {
            ...data.session,
            id: 'session_' + Date.now(), // Generate new ID
            importedAt: new Date().toISOString()
        };
        this.sessions.push(session);
        return session;
    }

    // Message handling (same logic, different implementations)
    async handleMessage(message, sender, sendResponse) {
        // Wait for initialization to complete before handling messages
        await this.waitForReady();
        
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
                        // Support both GraphQL and REST data
                        const requestData = message.data.graphqlData || message.data.restData || {};
                        requestData.requestType = message.data.requestType || 'graphql';
                        rules = this.findMatchingRules(requestData, message.data.url);
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
                    this.settings = { logProfile: 'basic', theme: 'system' };
                    await this.saveRules();
                    sendResponse({ success: true });
                    break;

                case 'GET_AI_SETTINGS':
                    sendResponse({ success: true, aiSettings: this.aiSettings });
                    break;

                case 'UPDATE_AI_SETTINGS':
                    this.aiSettings = { ...this.aiSettings, ...message.aiSettings };
                    await this.saveRules();
                    sendResponse({ success: true });
                    break;

                case 'INCREMENT_AI_STATS':
                    if (message.stats) {
                        // Update global stats
                        this.aiSettings.callsCount = (this.aiSettings.callsCount || 0) + (message.stats.calls || 0);
                        this.aiSettings.tokensUsed = (this.aiSettings.tokensUsed || 0) + (message.stats.tokens || 0);
                        this.aiSettings.mocksGenerated = (this.aiSettings.mocksGenerated || 0) + (message.stats.mocks || 0);
                        
                        // Update per-provider stats
                        const provider = message.stats.provider || 'unknown';
                        if (!this.aiSettings.providerStats) {
                            this.aiSettings.providerStats = {};
                        }
                        if (!this.aiSettings.providerStats[provider]) {
                            this.aiSettings.providerStats[provider] = { calls: 0, tokens: 0 };
                        }
                        this.aiSettings.providerStats[provider].calls += (message.stats.calls || 0);
                        this.aiSettings.providerStats[provider].tokens += (message.stats.tokens || 0);
                        
                        await this.saveRules();
                    }
                    sendResponse({ success: true, aiSettings: this.aiSettings });
                    break;
                
                case 'RESET_AI_USAGE_STATS':
                    this.aiSettings.callsCount = 0;
                    this.aiSettings.tokensUsed = 0;
                    this.aiSettings.mocksGenerated = 0;
                    this.aiSettings.providerStats = {};
                    await this.saveRules();
                    sendResponse({ success: true, aiSettings: this.aiSettings });
                    break;

                case 'GET_PERFORMANCE_METRICS':
                    const metrics = this.getPerformanceMetrics(message.timeRange || 'all');
                    sendResponse({ success: true, metrics });
                    break;

                case 'CLEAR_PERFORMANCE_DATA':
                    this.performanceData = {
                        requests: [],
                        aggregates: { totalRequests: 0, successCount: 0, errorCount: 0, totalResponseTime: 0 }
                    };
                    await this.saveRules();
                    sendResponse({ success: true });
                    break;

                case 'GET_SESSIONS':
                    sendResponse({ success: true, sessions: this.getSessions() });
                    break;

                case 'CREATE_SESSION':
                    const newSession = this.createSession(message.name);
                    await this.saveRules();
                    sendResponse({ success: true, session: newSession });
                    break;

                case 'END_SESSION':
                    const endedSession = this.endSession(message.sessionId);
                    await this.saveRules();
                    sendResponse({ success: true, session: endedSession });
                    break;

                case 'DELETE_SESSION':
                    const deleted = this.deleteSession(message.sessionId);
                    await this.saveRules();
                    sendResponse({ success: true, deleted });
                    break;

                case 'EXPORT_SESSION':
                    const exportedSession = this.exportSession(message.sessionId);
                    sendResponse({ success: true, data: exportedSession });
                    break;

                case 'IMPORT_SESSION':
                    const importedSession = this.importSession(message.data);
                    await this.saveRules();
                    sendResponse({ success: true, session: importedSession });
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
        const requestType = requestData.requestType || 'graphql';
        console.log(`📝 [CORE] Logging ${requestType} request for tab ${tabId}:`, {
            requestId: requestData.requestId,
            operationName: requestData.operationName,
            method: requestData.method,
            url: requestData.url
        });

        if (!tabId) {
            console.warn('⚠️ [CORE] No tab ID provided for request logging');
            return;
        }

        // Mark this request as captured by injected script (for deduplication with webRequest)
        this.markRequestCaptured(requestData.requestId, requestData.url, tabId);
        
        // Remove any matching buffered webRequest entry
        const tabBuffer = this.webRequestBuffer?.get(tabId);
        if (tabBuffer) {
            const matchIndex = tabBuffer.findIndex(r => 
                r.url === requestData.url && 
                Math.abs(Date.now() - r.startTime) < 3000 // Within 3 seconds
            );
            if (matchIndex !== -1) {
                console.log(`🔄 [CORE] Removing duplicate webRequest buffer entry for:`, requestData.url);
                tabBuffer.splice(matchIndex, 1);
            }
        }

        const logEntry = {
            id: requestData.requestId || Date.now() + Math.random(),
            timestamp: requestData.timestamp || new Date().toISOString(),
            requestType: requestType,
            url: requestData.url,
            // GraphQL fields
            operationName: requestData.operationName,
            query: requestData.query,
            variables: requestData.variables,
            // REST fields
            method: requestData.method,
            endpoint: requestData.endpoint,
            path: requestData.path,
            queryParams: requestData.queryParams,
            body: requestData.body,
            // Common fields
            requestHeaders: requestData.requestHeaders || {},
            tabId: tabId,
            startTime: Date.now(),
            source: 'injectedScript'
        };

        await this.adapter.addRequestLog(tabId, logEntry);

        // Notify DevTools and popup
        await this.adapter.notifyDevTools('REQUEST_LOGGED', logEntry, tabId);
        await this.adapter.notifyPopup('REQUEST_LOGGED', logEntry, tabId);
    }

    async logResponse(responseData, tabId) {
        const requestType = responseData.requestType || 'graphql';
        console.log(`📥 [CORE] Logging ${requestType} response for tab ${tabId}:`, {
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
            responseTimestamp: responseData.timestamp,
            endTime: Date.now()
        });

        if (updatedEntry) {
            // Calculate response time
            const responseTime = updatedEntry.endTime - (updatedEntry.startTime || updatedEntry.endTime);
            
            // Track performance
            this.trackPerformance(updatedEntry, {
                ...responseData,
                responseTime
            });

            // Check if we're recording a session
            const recordingSession = this.sessions.find(s => s.status === 'recording');
            if (recordingSession) {
                this.addRequestToSession(recordingSession.id, updatedEntry, responseData);
            }

            await this.adapter.notifyDevTools('RESPONSE_LOGGED', updatedEntry, tabId);
        }
    }
}

// Export for backward compatibility
const GraphQLTestingCore = APITestingCore;
