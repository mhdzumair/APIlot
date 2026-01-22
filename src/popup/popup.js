class PopupManager {
    constructor() {
        this.currentTab = null;
        this.tabData = {
            url: '',
            requestCount: 0,
            activeRules: 0,
            isMonitoring: false,
            enabled: false,
            devToolsOpen: false
        };

        // Debouncing and state tracking
        this.updateTimeout = null;
        this.lastUpdateTime = 0;
        this.isUpdating = false;

        // Browser compatibility layer
        this.setupBrowserAPIs();

        this.initializeTheme();
        this.initializeElements();
        this.setupEventListeners();
        this.loadTabData();
        this.setupPeriodicRefresh();
    }

    setupBrowserAPIs() {
        // Create a unified API layer that works in both browsers
        this.browser = {
            runtime: null,
            tabs: null,
            storage: null
        };

        // Detect browser and set up APIs
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            // Chrome/Chromium
            this.browser.runtime = chrome.runtime;
            this.browser.tabs = chrome.tabs;
            this.browser.storage = chrome.storage;
            this.browserType = 'chrome';
        } else if (typeof browser !== 'undefined' && browser.runtime) {
            // Firefox
            this.browser.runtime = browser.runtime;
            this.browser.tabs = browser.tabs;
            this.browser.storage = browser.storage;
            this.browserType = 'firefox';
        } else {
            console.error('❌ [POPUP] No compatible browser API found');
            this.browserType = 'unknown';
        }

        console.log(`🌐 [POPUP] Browser detected: ${this.browserType}`);
    }

    async initializeTheme() {
        try {
            // First, try to get theme from extension settings
            const response = await this.sendMessage({
                type: 'GET_SETTINGS'
            });

            let theme = 'system'; // default
            if (response && response.success && response.settings && response.settings.theme) {
                theme = response.settings.theme;
            } else {
                // Fallback to localStorage (same as panel)
                theme = localStorage.getItem('apilot-theme') || 'system';
            }

            console.log('🎨 [POPUP] Initializing theme:', theme);
            this.applyTheme(theme);

            // Listen for theme changes from panel via storage
            // Note: localStorage events don't work across extension contexts
            if (this.browser.storage && this.browser.storage.onChanged) {
                this.browser.storage.onChanged.addListener((changes, namespace) => {
                    if (namespace === 'local' && changes.settings && changes.settings.newValue && changes.settings.newValue.theme) {
                        console.log('🎨 [POPUP] Theme changed via storage:', changes.settings.newValue.theme);
                        this.applyTheme(changes.settings.newValue.theme);
                    }
                });
            }

        } catch (error) {
            console.error('❌ [POPUP] Error initializing theme:', error);
            // Fallback to system theme
            this.applyTheme('system');
        }
    }

    applyTheme(theme) {
        const html = document.documentElement;

        if (theme === 'system') {
            // Remove explicit theme attribute to use system preference
            html.removeAttribute('data-theme');

            // Listen for system theme changes when in system mode
            if (!this.systemThemeListener) {
                this.systemThemeListener = (e) => {
                    // Only apply if we're still in system mode
                    if (!html.hasAttribute('data-theme')) {
                        console.log('🎨 [POPUP] System theme changed:', e.matches ? 'dark' : 'light');
                    }
                };
                window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', this.systemThemeListener);
            }
        } else {
            // Set explicit theme
            html.setAttribute('data-theme', theme);
        }

        console.log('🎨 [POPUP] Theme applied:', theme);
    }

    initializeElements() {
        // Status elements
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.tabUrl = document.getElementById('tabUrl');
        this.requestCount = document.getElementById('requestCount');
        this.activeRules = document.getElementById('activeRules');

        // Toggle elements
        this.monitoringToggle = document.getElementById('monitoringToggle');
        this.toggleDescription = document.getElementById('toggleDescription');
        this.devtoolsInfo = document.getElementById('devtoolsInfo');

        // Action buttons
        this.refreshStatusBtn = document.getElementById('refreshStatus');
    }

    setupEventListeners() {
        // Monitoring toggle
        this.monitoringToggle.addEventListener('change', () => {
            this.toggleMonitoring();
        });

        // Refresh status button
        this.refreshStatusBtn.addEventListener('click', () => {
            this.refreshStatus();
        });

        // Listen for messages from background script
        if (this.browser.runtime && this.browser.runtime.onMessage) {
            this.browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
                this.handleMessage(message, sender, sendResponse);
            });
        }
    }

    async loadTabData() {
        try {
            // Get current active tab
            const tabs = await this.getCurrentTab();
            if (tabs && tabs.length > 0) {
                this.currentTab = tabs[0];
                this.updateTabInfo();
                await this.checkTabStatus();
            }
        } catch (error) {
            console.error('Error loading tab data:', error);
            this.updateStatus('error', 'Error loading tab data');
        }
    }

    setupPeriodicRefresh() {
        // Refresh popup data every 2 seconds to ensure sync
        this.refreshInterval = setInterval(() => {
            if (!this.isUpdating) {
                this.checkTabStatus();
            }
        }, 2000);

        // Clean up interval when popup is closed
        window.addEventListener('beforeunload', () => {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
        });
    }

    getCurrentTab() {
        return new Promise((resolve, reject) => {
            if (this.browser.tabs && this.browser.tabs.query) {
                this.browser.tabs.query({ active: true, currentWindow: true }, resolve);
            } else {
                reject(new Error('Browser tabs API not available'));
            }
        });
    }

    updateTabInfo() {
        if (!this.currentTab) return;

        // Update URL (truncate if too long)
        const url = this.currentTab.url;
        const maxLength = 35;
        const displayUrl = url.length > maxLength ?
            url.substring(0, maxLength) + '...' : url;

        this.tabUrl.textContent = displayUrl;
        this.tabUrl.title = url; // Full URL on hover

        this.tabData.url = url;
    }

    async checkTabStatus() {
        if (!this.currentTab) return;

        try {
            console.log('🔍 [POPUP] Checking tab status for tab:', this.currentTab.id);

            // Check if tab has GraphQL monitoring enabled
            const response = await this.sendMessage({
                type: 'GET_TAB_STATUS',
                tabId: this.currentTab.id
            });

            console.log('📊 [POPUP] Tab status response:', response);

            if (response && response.success) {
                this.tabData.requestCount = response.requestCount || 0;
                this.tabData.activeRules = response.activeRules || 0;
                this.tabData.isMonitoring = response.isMonitoring || false;
                this.tabData.enabled = response.enabled || false;
                this.tabData.devToolsOpen = response.devToolsOpen || false;

                console.log('📊 [POPUP] Updated tab data:', this.tabData);

                this.updateRequestCount();
                this.updateActiveRules();
                this.updateToggleState();
                this.updateMonitoringStatus();
            } else {
                console.warn('⚠️ [POPUP] Invalid response:', response);
                this.updateStatus('inactive', 'Not monitoring');
            }
        } catch (error) {
            console.error('❌ [POPUP] Error checking tab status:', error);
            this.updateStatus('error', 'Error checking status');
        }
    }

    updateStatus(type, text) {
        this.statusDot.className = `status-dot ${type}`;
        this.statusText.textContent = text;
    }

    updateMonitoringStatus() {
        console.log('🔄 [POPUP] Updating monitoring status:', {
            isMonitoring: this.tabData.isMonitoring,
            enabled: this.tabData.enabled,
            devToolsOpen: this.tabData.devToolsOpen,
            url: this.tabData.url
        });

        if (this.tabData.isMonitoring) {
            this.updateStatus('active', 'Monitoring active');
        } else if (this.tabData.enabled && !this.tabData.devToolsOpen) {
            this.updateStatus('inactive', 'Enabled - Open DevTools');
        } else if (!this.tabData.enabled) {
            // Check if URL supports GraphQL monitoring
            const url = this.tabData.url;
            if (url.startsWith('http://') || url.startsWith('https://')) {
                this.updateStatus('inactive', 'Ready to monitor');
            } else {
                this.updateStatus('inactive', 'Unsupported page');
            }
        } else {
            this.updateStatus('inactive', 'Not monitoring');
        }
    }

    updateRequestCount() {
        this.requestCount.textContent = this.tabData.requestCount.toString();
    }

    updateActiveRules() {
        this.activeRules.textContent = this.tabData.activeRules.toString();
    }

    debouncedUpdate(updateFn, delay = 100) {
        // Clear existing timeout
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        // Set new timeout
        this.updateTimeout = setTimeout(() => {
            if (!this.isUpdating) {
                this.isUpdating = true;
                try {
                    updateFn();
                } finally {
                    this.isUpdating = false;
                    this.lastUpdateTime = Date.now();
                }
            }
        }, delay);
    }

    updateToggleState() {
        // Prevent rapid successive updates
        const now = Date.now();
        if (now - this.lastUpdateTime < 50) {
            this.debouncedUpdate(() => this.updateToggleState(), 100);
            return;
        }

        const isEnabled = this.tabData.enabled || false;

        // Only update if state actually changed
        if (this.monitoringToggle.checked !== isEnabled) {
            this.monitoringToggle.checked = isEnabled;
        }

        // Update toggle section styling based on state
        const toggleSection = document.querySelector('.toggle-section');
        if (toggleSection) {
            const hasEnabled = toggleSection.classList.contains('enabled');
            const hasDisabled = toggleSection.classList.contains('disabled');

            if (isEnabled && !hasEnabled) {
                toggleSection.classList.add('enabled');
                toggleSection.classList.remove('disabled');
            } else if (!isEnabled && !hasDisabled) {
                toggleSection.classList.add('disabled');
                toggleSection.classList.remove('enabled');
            }
        }

        // Update description and color
        let newText = '';
        let newColor = '';

        if (isEnabled) {
            if (this.tabData.devToolsOpen) {
                newText = 'Monitoring active - DevTools is open';
                newColor = 'var(--success-color)';
            } else {
                newText = 'Monitoring enabled - Open DevTools to start';
                newColor = 'var(--text-accent)';
            }
        } else {
            newText = 'Enable to start monitoring API requests';
            newColor = 'var(--text-secondary)';
        }

        // Only update if text or color changed
        if (this.toggleDescription.textContent !== newText) {
            this.toggleDescription.textContent = newText;
        }
        if (this.toggleDescription.style.color !== newColor) {
            this.toggleDescription.style.color = newColor;
        }

        console.log('🔄 [POPUP] Toggle state updated:', { enabled: isEnabled, devToolsOpen: this.tabData.devToolsOpen });
    }

    async toggleMonitoring() {
        if (!this.currentTab) return;

        const isEnabled = this.monitoringToggle.checked;
        console.log('🔄 [POPUP] Toggling monitoring:', isEnabled);

        try {
            // Send message to background script to toggle monitoring
            const response = await this.sendMessage({
                type: 'TOGGLE_TAB_ENABLED',
                tabId: this.currentTab.id,
                enabled: isEnabled
            });

            if (response.success) {
                // Update UI based on new state
                this.tabData.enabled = isEnabled;
                this.updateToggleState();
                this.updateMonitoringStatus();

                // Show DevTools info if enabled
                if (isEnabled) {
                    this.devtoolsInfo.style.display = 'block';
                    setTimeout(() => {
                        this.devtoolsInfo.style.display = 'none';
                    }, 5000); // Hide after 5 seconds
                } else {
                    this.devtoolsInfo.style.display = 'none';
                }
            } else {
                // Revert toggle if failed
                this.monitoringToggle.checked = !isEnabled;
                console.error('Failed to toggle monitoring:', response.error);
            }
        } catch (error) {
            // Revert toggle if failed
            this.monitoringToggle.checked = !isEnabled;
            console.error('Error toggling monitoring:', error);
        }
    }

    async refreshStatus() {
        // Prevent multiple simultaneous refreshes
        if (this.isUpdating) {
            console.log('⏸️ [POPUP] Refresh already in progress, skipping');
            return;
        }

        // Add loading state
        this.refreshStatusBtn.classList.add('loading');
        this.updateStatus('active', 'Refreshing...');

        try {
            // Only refresh if enough time has passed since last update
            const now = Date.now();
            if (now - this.lastUpdateTime > 500) {
                await this.checkTabStatus();
            } else {
                console.log('⏸️ [POPUP] Recent update detected, skipping refresh');
            }
        } finally {
            // Remove loading state
            this.refreshStatusBtn.classList.remove('loading');
        }
    }

    sendMessage(message) {
        return new Promise((resolve, reject) => {
            console.log('📤 [POPUP] Sending message:', message);

            if (!this.browser.runtime || !this.browser.runtime.sendMessage) {
                reject(new Error('Browser runtime API not available'));
                return;
            }

            this.browser.runtime.sendMessage(message, (response) => {
                // Handle errors differently based on browser
                let lastError = null;
                if (this.browserType === 'chrome') {
                    lastError = chrome.runtime.lastError;
                } else if (this.browserType === 'firefox') {
                    lastError = browser.runtime.lastError;
                }

                if (lastError) {
                    console.error('❌ [POPUP] Message error:', lastError);
                    reject(lastError);
                } else {
                    console.log('✅ [POPUP] Message response:', response);
                    resolve(response);
                }
            });
        });
    }

    handleMessage(message, sender, sendResponse) {
        console.log('📨 [POPUP] Received message:', message);

        // Prevent processing messages too frequently
        const now = Date.now();
        if (this.isUpdating || (now - this.lastUpdateTime < 50)) {
            console.log('⏸️ [POPUP] Skipping message due to recent update');
            return;
        }

        switch (message.action) {
            case 'TAB_STATUS_UPDATED':
                if (message.tabId === this.currentTab?.id) {
                    console.log('🔄 [POPUP] Tab status updated:', message.data);

                    // Check if data actually changed before updating
                    const hasChanges = this.hasDataChanged(message.data);
                    if (hasChanges) {
                        this.tabData = { ...this.tabData, ...message.data };
                        this.debouncedUpdate(() => {
                            this.updateRequestCount();
                            this.updateActiveRules();
                            this.updateToggleState();
                            this.updateMonitoringStatus();
                        }, 50);
                    } else {
                        console.log('⏸️ [POPUP] No changes detected, skipping update');
                    }
                }
                break;

            case 'REQUEST_LOGGED':
                if (message.tabId === this.currentTab?.id) {
                    console.log('📝 [POPUP] Request logged, updating count');
                    this.tabData.requestCount++;
                    this.debouncedUpdate(() => {
                        this.updateRequestCount();
                        this.updateMonitoringStatus();
                    }, 50);
                }
                break;

            case 'RULES_UPDATED':
                console.log('📋 [POPUP] Rules updated, refreshing status');
                this.debouncedUpdate(() => {
                    this.checkTabStatus(); // Refresh to get updated rule count
                }, 200);
                break;

            case 'SETTINGS_UPDATED':
                console.log('🎨 [POPUP] Settings updated:', message.data);
                if (message.data && message.data.theme) {
                    this.applyTheme(message.data.theme);
                }
                break;

            default:
                console.log('❓ [POPUP] Unknown message action:', message.action);
                break;
        }
    }

    hasDataChanged(newData) {
        // Check if any relevant data has actually changed
        const relevantFields = ['enabled', 'devToolsOpen', 'isMonitoring', 'requestCount', 'activeRules'];

        for (const field of relevantFields) {
            if (newData.hasOwnProperty(field) && newData[field] !== this.tabData[field]) {
                console.log(`📊 [POPUP] Data changed - ${field}: ${this.tabData[field]} → ${newData[field]}`);
                return true;
            }
        }

        return false;
    }

    cleanup() {
        // Clear any pending timeouts
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }

        console.log('🧹 [POPUP] Cleanup completed');
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const popupManager = new PopupManager();

    // Cleanup when popup is closed
    window.addEventListener('beforeunload', () => {
        popupManager.cleanup();
    });

    // Also cleanup when popup becomes hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            popupManager.cleanup();
        }
    });
});

// Export for global access
window.PopupManager = PopupManager;
