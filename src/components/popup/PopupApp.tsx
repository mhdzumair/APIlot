import * as React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { StatusCard, type TabStatus } from './StatusCard';
import { sendMsg } from '@/lib/messaging';
import { browser } from '@/lib/browser';
import type { BackgroundToPopupMessage } from '@/types/messages';

// ---------------------------------------------------------------------------
// Feature list shown in the popup footer area
// ---------------------------------------------------------------------------

const FEATURES = [
  'Monitor GraphQL & REST APIs',
  'AI-Powered Mock Generation',
  'Performance Analytics',
  'Time-Travel Debugging',
] as const;

// ---------------------------------------------------------------------------
// PopupApp
// ---------------------------------------------------------------------------

export function PopupApp() {
  const [status, setStatus] = useState<TabStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);

  // ------------------------------------------------------------------
  // Load tab data on mount
  // ------------------------------------------------------------------

  const loadStatus = useCallback(async (tabId: number) => {
    try {
      const response = await sendMsg({ type: 'GET_TAB_STATUS', tabId });
      if (response.success) {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const url = tabs[0]?.url ?? '';
        setStatus({
          url,
          requestCount: response.requestCount,
          activeRules: response.activeRules,
          isMonitoring: response.isMonitoring,
          enabled: response.enabled,
          devToolsOpen: response.devToolsOpen,
        });
      }
    } catch (err) {
      console.error('[PopupApp] loadStatus error:', err);
    }
  }, []);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    async function init() {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id) {
        setLoading(false);
        return;
      }
      setCurrentTabId(tab.id);
      await loadStatus(tab.id);
      setLoading(false);

      // Poll every 2 s (mirrors legacy popup)
      intervalId = setInterval(() => {
        loadStatus(tab.id!);
      }, 2000);
    }

    init();
    return () => clearInterval(intervalId);
  }, [loadStatus]);

  // ------------------------------------------------------------------
  // Listen for push notifications from the background
  // ------------------------------------------------------------------

  useEffect(() => {
    function handleMessage(message: BackgroundToPopupMessage) {
      if (!currentTabId) return;
      switch (message.type) {
        case 'REQUEST_LOGGED':
          if (message.tabId === currentTabId) {
            setStatus((prev) => prev ? { ...prev, requestCount: prev.requestCount + 1 } : prev);
          }
          break;
        case 'RULES_UPDATED':
          // Reload full status to get fresh rule count
          loadStatus(currentTabId);
          break;
        case 'SETTINGS_UPDATED':
          // Nothing theme-specific needed; theme is handled via CSS variables
          break;
      }
    }

    browser.runtime.onMessage.addListener(handleMessage as Parameters<typeof browser.runtime.onMessage.addListener>[0]);
    return () => {
      browser.runtime.onMessage.removeListener(handleMessage as Parameters<typeof browser.runtime.onMessage.removeListener>[0]);
    };
  }, [currentTabId, loadStatus]);

  // ------------------------------------------------------------------
  // Toggle monitoring enabled state
  // ------------------------------------------------------------------

  const handleToggleEnabled = useCallback(async (enabled: boolean) => {
    if (!currentTabId) return;
    // Optimistic update
    setStatus((prev) => prev ? { ...prev, enabled } : prev);
    try {
      // TOGGLE_TAB_ENABLED is not a typed message in PanelToBackgroundMessage,
      // so we use the raw browser sendMessage matching legacy popup behaviour.
      await browser.runtime.sendMessage({ type: 'TOGGLE_TAB_ENABLED', tabId: currentTabId, enabled });
    } catch (err) {
      // Revert on failure
      console.error('[PopupApp] toggleEnabled error:', err);
      setStatus((prev) => prev ? { ...prev, enabled: !enabled } : prev);
    }
  }, [currentTabId]);

  // ------------------------------------------------------------------
  // Manual refresh
  // ------------------------------------------------------------------

  const handleRefresh = useCallback(async () => {
    if (!currentTabId || refreshing) return;
    setRefreshing(true);
    try {
      await loadStatus(currentTabId);
    } finally {
      setRefreshing(false);
    }
  }, [currentTabId, loadStatus, refreshing]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex flex-col min-w-[300px] max-w-[360px] bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <div className="flex-1">
          <h1 className="text-base font-bold leading-none">APIlot</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Your AI Copilot for API Testing</p>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">v2.1.0</span>
      </div>

      {/* Main content */}
      <div className="p-3 space-y-3">
        <StatusCard
          status={status}
          loading={loading}
          onToggleEnabled={handleToggleEnabled}
        />

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={handleRefresh}
          disabled={refreshing || loading}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={refreshing ? 'animate-spin' : ''}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="m3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {refreshing ? 'Refreshing…' : 'Refresh Status'}
        </Button>
      </div>

      <Separator />

      {/* Feature list */}
      <div className="px-4 py-3 space-y-1.5">
        {FEATURES.map((feature) => (
          <div key={feature} className="flex items-center gap-2 text-xs text-muted-foreground">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="shrink-0 text-primary"
            >
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="10" />
            </svg>
            {feature}
          </div>
        ))}
      </div>

      <Separator />

      {/* Footer */}
      <div className="px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Developed by <strong className="font-semibold text-foreground">Mohamed Zumair</strong>
        </span>
        <a
          href="https://github.com/mhdzumair"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="GitHub profile"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
        </a>
      </div>
    </div>
  );
}
