import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { useMonitorStore } from '@/stores/useMonitorStore';
import { RequestList } from '../monitor/RequestList';
import { RequestFilters } from '../monitor/RequestFilters';
import { WaterfallView } from '../monitor/WaterfallView';
import { RuleEditorDialog } from '../rules/RuleEditorDialog';
import { sendMsg } from '@/lib/messaging';
import { browser } from '@/lib/browser';
import { downloadHAR } from '@/lib/harExport';
import type { ApiRule } from '@/types/rules';

type ViewMode = 'list' | 'waterfall';

export function MonitorTab() {
  const filteredLog = useMonitorStore((s) => s.filteredLog);
  const requestLog = useMonitorStore((s) => s.requestLog);
  const autoScroll = useMonitorStore((s) => s.autoScroll);
  const isEnabled = useMonitorStore((s) => s.isEnabled);
  const tabId = useMonitorStore((s) => s.tabId);
  const setAutoScroll = useMonitorStore((s) => s.setAutoScroll);
  const setEnabled = useMonitorStore((s) => s.setEnabled);
  const clearLog = useMonitorStore((s) => s.clearLog);
  const ruleFromRequest = useMonitorStore((s) => s.ruleFromRequest);
  const setRuleFromRequest = useMonitorStore((s) => s.setRuleFromRequest);

  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Rule editor dialog state — opened when user clicks "+ Rule" on a request row
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [prefillRule, setPrefillRule] = useState<ApiRule | null>(null);

  useEffect(() => {
    if (ruleFromRequest) {
      const isRest = ruleFromRequest.requestType === 'rest' || !ruleFromRequest.query;
      setPrefillRule({
        id: '',
        name: '',
        enabled: true,
        requestType: isRest ? 'rest' : 'graphql',
        urlPattern: ruleFromRequest.url ?? '',
        operationName: ruleFromRequest.operationName,
        action: 'mock',
        statusCode: 200,
        mockResponse: '{}',
      } as ApiRule);
      setRuleEditorOpen(true);
      setRuleFromRequest(null);
    }
  }, [ruleFromRequest, setRuleFromRequest]);

  const handleToggleEnabled = async (checked: boolean) => {
    setEnabled(checked);
    try {
      await browser.runtime.sendMessage({ type: 'TOGGLE_TAB_ENABLED', tabId, enabled: checked });
    } catch (err) {
      console.error('[MonitorTab] Failed to toggle enabled:', err);
      setEnabled(!checked); // revert on failure
    }
  };

  const handleClearLog = async () => {
    clearLog();
    try {
      await sendMsg({ type: 'CLEAR_LOG', tabId });
    } catch (err) {
      console.error('[MonitorTab] Failed to clear log:', err);
    }
  };

  const filteredCount = filteredLog.length;
  const totalCount = requestLog.length;
  const isFiltered = filteredCount !== totalCount;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Rule editor dialog — triggered from request rows */}
      <RuleEditorDialog
        open={ruleEditorOpen}
        onOpenChange={(open) => {
          setRuleEditorOpen(open);
          if (!open) setPrefillRule(null);
        }}
        editingRuleId={null}
        editingRule={prefillRule}
      />
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border/50 shrink-0 bg-card/40">
        {/* Enable/disable toggle */}
        <div className="flex items-center gap-1.5">
          <Switch
            id="monitor-enabled"
            checked={isEnabled}
            onCheckedChange={handleToggleEnabled}
            className="h-4 w-7"
          />
          <label htmlFor="monitor-enabled" className="text-[12px] font-medium cursor-pointer select-none text-muted-foreground">
            {isEnabled ? <span className="text-emerald-400">Capturing</span> : 'Paused'}
          </label>
        </div>

        <div className="h-3 w-px bg-border/60" />

        {/* Request count */}
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {isFiltered
            ? `${filteredCount}/${totalCount}`
            : `${totalCount}`}
          <span className="ml-1 text-muted-foreground/70">req</span>
        </span>

        <div className="flex-1" />

        {/* Auto-scroll toggle */}
        <div className="flex items-center gap-1.5">
          <Switch
            id="auto-scroll"
            checked={autoScroll}
            onCheckedChange={setAutoScroll}
            className="h-4 w-7"
          />
          <label htmlFor="auto-scroll" className="text-[12px] cursor-pointer select-none text-foreground/70">
            Scroll
          </label>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center rounded border border-border/40 overflow-hidden">
          <button
            className={`h-6 px-2 text-[11px] font-medium transition-colors ${viewMode === 'list' ? 'bg-muted text-foreground' : 'text-foreground/60 hover:text-foreground hover:bg-muted/40'}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            ≡
          </button>
          <button
            className={`h-6 px-2 text-[11px] font-medium transition-colors ${viewMode === 'waterfall' ? 'bg-muted text-foreground' : 'text-foreground/60 hover:text-foreground hover:bg-muted/40'}`}
            onClick={() => setViewMode('waterfall')}
            title="Waterfall view"
          >
            ▤
          </button>
        </div>

        {/* HAR export */}
        <button
          className="h-6 px-2 rounded text-[11px] font-medium text-foreground/65 hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-transparent hover:border-border/40"
          onClick={() => downloadHAR(requestLog)}
          disabled={requestLog.length === 0}
          title="Export as HAR"
        >
          HAR
        </button>

        {/* Clear log */}
        <button
          className="h-6 px-2 rounded text-[11px] font-medium text-foreground/65 hover:text-red-400 hover:bg-red-500/8 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-transparent hover:border-red-500/20"
          onClick={handleClearLog}
          disabled={requestLog.length === 0}
        >
          Clear
        </button>
      </div>

      {/* Filters */}
      <RequestFilters />

      {/* Request list / waterfall */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {viewMode === 'waterfall'
          ? <WaterfallView requests={filteredLog} />
          : <RequestList requests={filteredLog} />
        }
      </div>
    </div>
  );
}
