import * as React from 'react';
import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { browser } from '@/lib/browser';
import { sendMsg } from '@/lib/messaging';
import type { BackgroundToDevToolsMessage } from '@/types/messages';
import { useMonitorStore } from '@/stores/useMonitorStore';
import { useRulesStore } from '@/stores/useRulesStore';
import { ThemeProvider } from './ThemeProvider';
import { MonitorTab } from './tabs/MonitorTab';
import { RulesTab } from './tabs/RulesTab';
import { SettingsTab } from './tabs/SettingsTab';
import { SchemaExplorerTab } from './tabs/SchemaExplorerTab';
import { QueryBuilderTab } from './tabs/QueryBuilderTab';
import { AIMockDialog } from './extensions/AIMockDialog';
import { AnalyticsDashboard } from './extensions/AnalyticsDashboard';
import { TimeTravelPanel } from './extensions/TimeTravelPanel';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const PANEL_TABS = [
  { value: 'monitor', label: 'Monitor' },
  { value: 'rules', label: 'Rules' },
  { value: 'settings', label: 'Settings' },
  { value: 'schema', label: 'Schema Explorer' },
  { value: 'builder', label: 'Query Builder' },
] as const;

type PanelTab = (typeof PANEL_TABS)[number]['value'];

// ---------------------------------------------------------------------------
// PanelApp
// ---------------------------------------------------------------------------

interface PanelAppProps {
  tabId: number;
}

export function PanelApp({ tabId }: PanelAppProps) {
  const monitorStore = useMonitorStore();
  const rulesStore = useRulesStore();
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showTimeTravel, setShowTimeTravel] = useState(false);

  // ------------------------------------------------------------------
  // Set tabId in monitor store + signal DevTools open/closed to background
  // ------------------------------------------------------------------

  useEffect(() => {
    monitorStore.setTabId(tabId);
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tabId === -1) return;
    // Tell the background this DevTools panel is now open for this tab.
    // The background will start monitoring and send START_MONITORING to content.
    void browser.runtime.sendMessage({ type: 'DEVTOOLS_OPENED', tabId });
    return () => {
      void browser.runtime.sendMessage({ type: 'DEVTOOLS_CLOSED', tabId });
    };
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Load initial data from the background script
  // ------------------------------------------------------------------

  useEffect(() => {
    async function loadInitialData() {
      try {
        const response = await sendMsg({ type: 'GET_RULES', tabId });
        if (response?.success) {
          rulesStore.setRules(response.data.rules);
          monitorStore.setEnabled(response.data.tabEnabled);
          if (response.data.requestLog?.length) {
            monitorStore.setRequestLog(response.data.requestLog);
          }
        }
      } catch (err) {
        console.error('[PanelApp] Failed to load initial data:', err);
      }
    }

    if (tabId !== -1) {
      loadInitialData();
    }
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Listen for push messages from the background script
  // ------------------------------------------------------------------

  useEffect(() => {
    function handleMessage(message: BackgroundToDevToolsMessage) {
      switch (message.type) {
        case 'DEVTOOLS_REQUEST_LOGGED':
        case 'REQUEST_LOGGED':
          // Only process request logs for this specific tab
          if (message.tabId && message.tabId !== tabId) return;
          monitorStore.addRequest(message.data);
          break;

        case 'DEVTOOLS_RESPONSE_LOGGED':
        case 'RESPONSE_LOGGED':
          // Only process response logs for this specific tab
          if (message.tabId && message.tabId !== tabId) return;
          monitorStore.updateRequest(message.data.id, message.data);
          break;

        // Rule sync messages — processed globally (no tabId filter)
        case 'DEVTOOLS_RULE_ADDED':
        case 'RULE_ADDED':
          rulesStore.addRule(message.data.ruleId, message.data.rule);
          break;

        case 'DEVTOOLS_RULE_UPDATED':
        case 'RULE_UPDATED':
          if (message.data.rule) {
            rulesStore.updateRule(message.data.ruleId, message.data.rule);
          }
          break;

        case 'DEVTOOLS_RULE_DELETED':
        case 'RULE_DELETED':
          rulesStore.deleteRule(message.data.ruleId);
          break;

        default:
          break;
      }
    }

    browser.runtime.onMessage.addListener(
      handleMessage as Parameters<typeof browser.runtime.onMessage.addListener>[0]
    );

    return () => {
      browser.runtime.onMessage.removeListener(
        handleMessage as Parameters<typeof browser.runtime.onMessage.removeListener>[0]
      );
    };
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <ThemeProvider>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0">
          <h1 className="text-sm font-bold">APIlot</h1>
          <span className="text-xs text-muted-foreground">
            Tab&nbsp;
            <span className="font-mono">{tabId === -1 ? 'unknown' : tabId}</span>
          </span>
          {/* Extension toolbar buttons */}
          <div className="ml-auto flex gap-1.5">
            <button
              onClick={() => { setShowAnalytics((v) => !v); setShowTimeTravel(false); }}
              title="Analytics"
              className={`rounded px-2 py-1 text-xs border transition-colors ${
                showAnalytics
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted border-border'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => { setShowTimeTravel((v) => !v); setShowAnalytics(false); }}
              title="Time Travel"
              className={`rounded px-2 py-1 text-xs border transition-colors ${
                showTimeTravel
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted border-border'
              }`}
            >
              Time Travel
            </button>
          </div>
        </div>

        {/* Extension overlay panels */}
        {showAnalytics && (
          <div className="border-b bg-card max-h-[60vh] overflow-y-auto shrink-0">
            <AnalyticsDashboard />
          </div>
        )}
        {showTimeTravel && (
          <div className="border-b bg-card max-h-[60vh] overflow-y-auto shrink-0">
            <TimeTravelPanel />
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="monitor" className="flex-1 flex flex-col overflow-hidden px-2 pt-2">
          <TabsList variant="line" className="shrink-0 w-full justify-start border-b rounded-none">
            {PANEL_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="monitor" className="flex-1 overflow-hidden flex flex-col mt-0 pt-2">
            <MonitorTab />
          </TabsContent>

          {PANEL_TABS.filter((t) => t.value !== 'monitor').map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
              className="flex-1 overflow-auto"
            >
              {tab.value === 'rules' ? (
                <RulesTab />
              ) : tab.value === 'settings' ? (
                <SettingsTab />
              ) : tab.value === 'schema' ? (
                <SchemaExplorerTab />
              ) : tab.value === 'builder' ? (
                <QueryBuilderTab />
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <Toaster />
      <AIMockDialog />
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// Placeholder shown in non-implemented tabs
// ---------------------------------------------------------------------------

function ComingSoon({ tabLabel }: { tabLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground select-none">
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l2 2" />
      </svg>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-foreground">{tabLabel}</p>
        <p className="text-xs">Coming soon</p>
      </div>
    </div>
  );
}
