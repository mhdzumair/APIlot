// Icon management utility for dynamic browser action icon switching
class IconManager {
    constructor(browserType) {
        this.browserType = browserType;
        this.iconSets = {
            default: {
                16: "assets/icons/icon-16.png",
                32: "assets/icons/icon-32.png", 
                48: "assets/icons/icon-48.png",
                128: "assets/icons/icon-128.png"
            },
            enabled: {
                16: "assets/icons/icon-16-enabled.png",
                32: "assets/icons/icon-32-enabled.png",
                48: "assets/icons/icon-48-enabled.png", 
                128: "assets/icons/icon-128-enabled.png"
            },
            disabled: {
                16: "assets/icons/icon-16-disabled.png",
                32: "assets/icons/icon-32-disabled.png",
                48: "assets/icons/icon-48-disabled.png",
                128: "assets/icons/icon-128-disabled.png"
            }
        };

        console.log(`🎨 [ICON] Icon manager initialized for ${browserType}`);
    }

    /**
     * Set browser action icon based on extension state
     * @param {string} state - 'default', 'enabled', or 'disabled'
     * @param {number} tabId - Optional tab ID for tab-specific icon
     */
    async setIcon(state, tabId = null) {
        try {
            const iconSet = this.iconSets[state] || this.iconSets.default;
            
            console.log(`🎨 [ICON] Setting ${state} icon for tab ${tabId || 'global'}`);

            if (this.browserType === 'chrome') {
                await this.setChromeIcon(iconSet, tabId);
            } else if (this.browserType === 'firefox') {
                await this.setFirefoxIcon(iconSet, tabId);
            }

            console.log(`✅ [ICON] Successfully set ${state} icon`);
        } catch (error) {
            console.error(`❌ [ICON] Failed to set ${state} icon:`, error);
        }
    }

    /**
     * Set icon for Chrome using chrome.action API
     */
    async setChromeIcon(iconSet, tabId) {
        const iconOptions = { path: iconSet };
        
        if (tabId) {
            iconOptions.tabId = tabId;
        }

        if (chrome.action && chrome.action.setIcon) {
            await chrome.action.setIcon(iconOptions);
        } else {
            console.warn('⚠️ [ICON] Chrome action API not available');
        }
    }

    /**
     * Set icon for Firefox using browserAction API
     */
    async setFirefoxIcon(iconSet, tabId) {
        const browserAction = chrome.browserAction || browser.browserAction;
        
        if (browserAction && browserAction.setIcon) {
            const iconOptions = { path: iconSet };
            
            if (tabId) {
                iconOptions.tabId = tabId;
            }

            await browserAction.setIcon(iconOptions);
        } else {
            console.warn('⚠️ [ICON] Firefox browserAction API not available');
        }
    }

    /**
     * Update icon based on tab state
     * @param {Object} tabState - Tab state object with enabled and devToolsOpen properties
     * @param {number} tabId - Tab ID
     */
    async updateIconForTabState(tabState, tabId = null) {
        let iconState = 'default';

        if (tabState.enabled && tabState.devToolsOpen) {
            // Extension is enabled and actively monitoring
            iconState = 'enabled';
        } else if (tabState.enabled && !tabState.devToolsOpen) {
            // Extension is enabled but not actively monitoring
            iconState = 'enabled';
        } else {
            // Extension is disabled or not configured
            iconState = 'disabled';
        }

        await this.setIcon(iconState, tabId);
        return iconState;
    }

    /**
     * Reset icon to default state
     * @param {number} tabId - Optional tab ID
     */
    async resetIcon(tabId = null) {
        await this.setIcon('default', tabId);
    }

    /**
     * Get current icon set for a given state
     * @param {string} state - Icon state
     * @returns {Object} Icon set object
     */
    getIconSet(state) {
        return this.iconSets[state] || this.iconSets.default;
    }

    /**
     * Preload all icon sets to ensure they're available
     */
    async preloadIcons() {
        try {
            console.log('🔄 [ICON] Preloading icon sets...');
            
            // For browser extensions, icons are preloaded by the browser
            // This method can be used for validation or caching if needed
            
            const states = Object.keys(this.iconSets);
            console.log(`✅ [ICON] Icon sets available: ${states.join(', ')}`);
            
        } catch (error) {
            console.error('❌ [ICON] Failed to preload icons:', error);
        }
    }

    /**
     * Validate that all required icon files exist
     * This is mainly for development/debugging purposes
     */
    validateIconSets() {
        const requiredSizes = [16, 32, 48, 128];
        const states = Object.keys(this.iconSets);
        
        let allValid = true;
        
        for (const state of states) {
            const iconSet = this.iconSets[state];
            
            for (const size of requiredSizes) {
                if (!iconSet[size]) {
                    console.error(`❌ [ICON] Missing ${size}x${size} icon for ${state} state`);
                    allValid = false;
                }
            }
        }
        
        if (allValid) {
            console.log('✅ [ICON] All icon sets are valid');
        }
        
        return allValid;
    }
}
