import { browser } from '../lib/browser';

type IconState = 'default' | 'enabled' | 'disabled';

interface IconSet {
  16: string;
  32: string;
  48: string;
  128: string;
}

interface IconSets {
  default: IconSet;
  enabled: IconSet;
  disabled: IconSet;
}

export class IconManager {
  private browserType: 'chrome' | 'firefox';
  private iconSets: IconSets;

  constructor(browserType: 'chrome' | 'firefox') {
    this.browserType = browserType;
    this.iconSets = {
      default: {
        16: 'assets/icons/icon-16.png',
        32: 'assets/icons/icon-32.png',
        48: 'assets/icons/icon-48.png',
        128: 'assets/icons/icon-128.png',
      },
      enabled: {
        16: 'assets/icons/icon-16-enabled.png',
        32: 'assets/icons/icon-32-enabled.png',
        48: 'assets/icons/icon-48-enabled.png',
        128: 'assets/icons/icon-128-enabled.png',
      },
      disabled: {
        16: 'assets/icons/icon-16-disabled.png',
        32: 'assets/icons/icon-32-disabled.png',
        48: 'assets/icons/icon-48-disabled.png',
        128: 'assets/icons/icon-128-disabled.png',
      },
    };

    console.log(`[ICON] Icon manager initialized for ${browserType}`);
  }

  /**
   * Set browser action icon based on extension state.
   * @param state - 'default', 'enabled', or 'disabled'
   * @param tabId - Optional tab ID for tab-specific icon
   */
  async setIcon(state: IconState, tabId: number | null = null): Promise<void> {
    try {
      const iconSet = this.iconSets[state] ?? this.iconSets.default;

      console.log(`[ICON] Setting ${state} icon for tab ${tabId ?? 'global'}`);

      if (this.browserType === 'chrome') {
        await this.setChromeIcon(iconSet, tabId);
      } else {
        await this.setFirefoxIcon(iconSet, tabId);
      }

      console.log(`[ICON] Successfully set ${state} icon`);
    } catch (error) {
      console.error(`[ICON] Failed to set ${state} icon:`, error);
    }
  }

  /**
   * Set icon for Chrome using chrome.action API.
   */
  private async setChromeIcon(iconSet: IconSet, tabId: number | null): Promise<void> {
    const iconOptions: { path: IconSet; tabId?: number } = { path: iconSet };

    if (tabId !== null) {
      iconOptions.tabId = tabId;
    }

    if (
      typeof chrome !== 'undefined' &&
      chrome.action &&
      chrome.action.setIcon
    ) {
      await chrome.action.setIcon(iconOptions);
    } else {
      console.warn('[ICON] Chrome action API not available');
    }
  }

  /**
   * Set icon for Firefox using browserAction API.
   */
  private async setFirefoxIcon(iconSet: IconSet, tabId: number | null): Promise<void> {
    // Use webextension-polyfill browser.browserAction for Firefox MV2
    const browserAction = (browser as unknown as Record<string, unknown>).browserAction as
      | { setIcon?: (opts: { path: IconSet; tabId?: number }) => Promise<void> }
      | undefined;

    if (browserAction && browserAction.setIcon) {
      const iconOptions: { path: IconSet; tabId?: number } = { path: iconSet };

      if (tabId !== null) {
        iconOptions.tabId = tabId;
      }

      await browserAction.setIcon(iconOptions);
    } else {
      console.warn('[ICON] Firefox browserAction API not available');
    }
  }

  /**
   * Update icon based on tab state.
   * @param tabState - Tab state object with enabled and devToolsOpen properties
   * @param tabId - Tab ID
   */
  async updateIconForTabState(
    tabState: { enabled: boolean; devToolsOpen: boolean },
    tabId: number | null = null
  ): Promise<IconState> {
    let iconState: IconState = 'default';

    if (tabState.enabled && tabState.devToolsOpen) {
      iconState = 'enabled';
    } else if (tabState.enabled && !tabState.devToolsOpen) {
      iconState = 'enabled';
    } else {
      iconState = 'disabled';
    }

    await this.setIcon(iconState, tabId);
    return iconState;
  }

  /**
   * Reset icon to default state.
   * @param tabId - Optional tab ID
   */
  async resetIcon(tabId: number | null = null): Promise<void> {
    await this.setIcon('default', tabId);
  }

  /**
   * Get current icon set for a given state.
   * @param state - Icon state
   */
  getIconSet(state: IconState): IconSet {
    return this.iconSets[state] ?? this.iconSets.default;
  }

  /**
   * Preload all icon sets to ensure they're available.
   */
  async preloadIcons(): Promise<void> {
    try {
      console.log('[ICON] Preloading icon sets...');
      const states = Object.keys(this.iconSets);
      console.log(`[ICON] Icon sets available: ${states.join(', ')}`);
    } catch (error) {
      console.error('[ICON] Failed to preload icons:', error);
    }
  }

  /**
   * Validate that all required icon files exist.
   */
  validateIconSets(): boolean {
    const requiredSizes = [16, 32, 48, 128] as const;
    const states = Object.keys(this.iconSets) as IconState[];

    let allValid = true;

    for (const state of states) {
      const iconSet = this.iconSets[state];

      for (const size of requiredSizes) {
        if (!iconSet[size]) {
          console.error(`[ICON] Missing ${size}x${size} icon for ${state} state`);
          allValid = false;
        }
      }
    }

    if (allValid) {
      console.log('[ICON] All icon sets are valid');
    }

    return allValid;
  }
}
