import * as React from 'react';
import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { browser } from '@/lib/browser';
import { sendMsg } from '@/lib/messaging';
import type { BackgroundToDevToolsMessage } from '@/types/messages';
import { useMonitorStore } from '@/stores/useMonitorStore';
import { useRulesStore } from '@/stores/useRulesStore';
import { useBuilderStore } from '@/stores/useBuilderStore';
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
  { value: 'analytics', label: 'Analytics' },
  { value: 'timetravel', label: 'Time Travel' },
  { value: 'schema', label: 'Schema' },
  { value: 'builder', label: 'Builder' },
  { value: 'settings', label: 'Settings' },
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
  const pendingNewRule = useRulesStore((s) => s.pendingNewRule);
  const setPendingNewRule = useRulesStore((s) => s.setPendingNewRule);
  const [activeTab, setActiveTab] = useState<PanelTab>('monitor');

  const pendingNavigate = useBuilderStore((s) => s.pendingNavigateToBuilder);
  const setPendingNavigateToBuilder = useBuilderStore((s) => s.setPendingNavigateToBuilder);

  // Clear pendingNewRule if it was set via tab switching (legacy - no longer needed)
  useEffect(() => {
    if (pendingNewRule) setPendingNewRule(null);
  }, [pendingNewRule, setPendingNewRule]);

  // Navigate to builder tab when Schema Explorer triggers it
  useEffect(() => {
    if (pendingNavigate) {
      setActiveTab('builder');
      setPendingNavigateToBuilder(false);
    }
  }, [pendingNavigate, setPendingNavigateToBuilder]);

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
          if (message.data?.ruleId != null) {
            rulesStore.deleteRule(String(message.data.ruleId));
          }
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
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as PanelTab)}
        className="flex flex-col h-screen bg-background text-foreground overflow-hidden"
      >
        {/* Header chrome */}
        <div className="shrink-0 border-b bg-card">
          <div className="flex items-center gap-2.5 px-3 pt-2 pb-0">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" className="shrink-0">
              <rect x="0" y="0" width="18" height="18" rx="4" fill="hsl(var(--primary))" fillOpacity="0.15"/>
              <circle cx="9" cy="9" r="3.5" stroke="hsl(var(--primary))" strokeWidth="1.5"/>
              <circle cx="9" cy="9" r="1" fill="hsl(var(--primary))"/>
              <path d="M9 2v2M9 14v2M2 9h2M14 9h2" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
            </svg>
            <span className="text-[13px] font-bold tracking-tight text-primary">APIlot</span>
            <div className="h-3 w-px bg-border" />
            <span className="font-mono text-[11px] text-muted-foreground/75">
              tab&nbsp;{tabId === -1 ? '—' : tabId}
            </span>
          </div>

          {/* Tab bar */}
          <TabsList variant="line" className="w-full justify-start bg-transparent rounded-none h-auto p-0 gap-0 overflow-x-auto overflow-y-hidden mt-1">
            {PANEL_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="relative rounded-none h-8 px-3.5 text-[12px] font-medium shrink-0 shadow-none bg-transparent border-0
                  text-muted-foreground hover:text-foreground transition-colors duration-150
                  data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:bg-transparent
                  after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-t after:bg-transparent
                  data-[state=active]:after:bg-primary"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="monitor" className="flex-1 overflow-hidden flex flex-col mt-0">
          <MonitorTab />
        </TabsContent>
        <TabsContent value="rules" className="flex-1 overflow-auto mt-0">
          <RulesTab />
        </TabsContent>
        <TabsContent value="settings" className="flex-1 overflow-auto mt-0">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="analytics" className="flex-1 overflow-auto mt-0">
          <AnalyticsDashboard />
        </TabsContent>
        <TabsContent value="timetravel" className="flex-1 overflow-auto mt-0">
          <TimeTravelPanel />
        </TabsContent>
        <TabsContent value="schema" className="flex-1 overflow-auto mt-0">
          <SchemaExplorerTab />
        </TabsContent>
        <TabsContent value="builder" className="flex-1 overflow-auto mt-0">
          <QueryBuilderTab />
        </TabsContent>
      </Tabs>

      <Toaster />
      <AIMockDialog />
    </ThemeProvider>
  );
}

