import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useMonitorStore } from '@/stores/useMonitorStore';
import { RequestList } from '../monitor/RequestList';
import { RequestFilters } from '../monitor/RequestFilters';
import { WaterfallView } from '../monitor/WaterfallView';
import { RuleEditorDialog } from '../rules/RuleEditorDialog';
import { sendMsg } from '@/lib/messaging';
import { browser } from '@/lib/browser';
import { downloadHAR, harImport, type HARRoot } from '@/lib/harExport';
import type { ApiRule } from '@/types/rules';
import {
  extractGraphqlEndpointFromUrl,
  formatResponseForMock,
} from '@/lib/requestUtils';

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
  const setRequestLog = useMonitorStore((s) => s.setRequestLog);
  const ruleFromRequest = useMonitorStore((s) => s.ruleFromRequest);
  const setRuleFromRequest = useMonitorStore((s) => s.setRuleFromRequest);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const harInputRef = useRef<HTMLInputElement>(null);

  // Rule editor dialog state — opened when user clicks "+ Rule" on a request row
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [prefillRule, setPrefillRule] = useState<ApiRule | null>(null);

  useEffect(() => {
    if (ruleFromRequest) {
      const isRest = ruleFromRequest.requestType === 'rest' || !ruleFromRequest.query;
      const isGraphql = ruleFromRequest.requestType === 'graphql' || !!ruleFromRequest.query;
      setPrefillRule({
        id: '',
        name: '',
        enabled: true,
        requestType: isRest ? 'rest' : 'graphql',
        urlPattern: ruleFromRequest.url ?? '',
        operationName: ruleFromRequest.operationName,
        graphqlEndpoint: isGraphql
          ? extractGraphqlEndpointFromUrl(ruleFromRequest.url ?? '')
          : undefined,
        httpMethod: ruleFromRequest.method ?? 'ALL',
        restPath: ruleFromRequest.path,
        restEndpoint: ruleFromRequest.endpoint,
        action: 'mock',
        statusCode: ruleFromRequest.responseStatus ?? 200,
        mockResponse: formatResponseForMock(ruleFromRequest.response),
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

  const handleImportHAR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const har = JSON.parse(text) as HARRoot;
      const imported = harImport(har, tabId);
      setRequestLog([...requestLog, ...imported]);
      toast.success(`Imported ${imported.length} request${imported.length !== 1 ? 's' : ''} from HAR.`);
    } catch (err) {
      console.error('[MonitorTab] Failed to import HAR:', err);
      toast.error('Failed to import HAR file — make sure it is a valid HAR 1.2 document.');
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
      {/* Toolbar — wraps into two rows on narrow screens */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-2.5 border-b border-border/50 shrink-0 bg-card/40">
        {/* Left group: enable/disable + request count */}
        <div className="flex items-center gap-2">
          <Switch
            id="monitor-enabled"
            checked={isEnabled}
            onCheckedChange={handleToggleEnabled}
          />
          <label htmlFor="monitor-enabled" className="text-[13px] font-bold cursor-pointer select-none">
            {isEnabled ? <span className="text-[var(--ok)]">Capturing</span> : <span className="text-muted-foreground">Paused</span>}
          </label>
        </div>

        {/* Request count */}
        <span className="text-[13px] text-muted-foreground tabular-nums">
          <strong className="text-foreground font-semibold">
            {isFiltered ? `${filteredCount}/${totalCount}` : `${totalCount}`}
          </strong>{' '}
          requests
        </span>

        {/* Push right-side controls to the end */}
        <div className="flex-1" />

        {/* Right group: all secondary controls together */}
        <div className="flex items-center gap-2.5 flex-wrap justify-end">
          {/* Auto-scroll toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="auto-scroll"
              checked={autoScroll}
              onCheckedChange={setAutoScroll}
              size="sm"
            />
            <label htmlFor="auto-scroll" className="text-[12px] cursor-pointer select-none text-foreground/70">
              Auto-scroll
            </label>
          </div>

          {/* View mode toggle — segmented control */}
          <div role="group" className="flex items-center gap-0.5 bg-[var(--surface2)] rounded-[9px] p-[3px]">
            <button
              className={cn(
                'h-6 px-2.5 rounded-md text-[12px] font-medium transition-colors',
                viewMode === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              List
            </button>
            <button
              className={cn(
                'h-6 px-2.5 rounded-md text-[12px] font-medium transition-colors',
                viewMode === 'waterfall' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setViewMode('waterfall')}
              title="Waterfall view"
            >
              Waterfall
            </button>
          </div>

          {/* HAR import/export */}
          <input
            ref={harInputRef}
            type="file"
            accept=".har,application/json"
            className="hidden"
            onChange={handleImportHAR}
          />
          <div role="group" aria-label="HAR" className="flex items-center">
            <span className="h-7 px-2 flex items-center rounded-l-[8px] border border-r-0 border-border/50 text-[11px] font-medium text-muted-foreground bg-muted/20">
              HAR
            </span>
            <button
              className="h-7 px-2.5 rounded-none border-y border-border/50 text-[12px] font-medium text-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors"
              onClick={() => harInputRef.current?.click()}
              title="Import a HAR file"
            >
              Import
            </button>
            <button
              className="h-7 px-2.5 rounded-r-[8px] border border-l-0 border-border/50 text-[12px] font-medium text-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => downloadHAR(requestLog)}
              disabled={requestLog.length === 0}
              title="Export as HAR"
            >
              Export
            </button>
          </div>

          {/* Clear log */}
          <button
            className="h-7 px-2.5 rounded-[8px] text-[11px] font-medium text-foreground/70 hover:text-[var(--err)] hover:bg-[var(--err-bg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-border/50 hover:border-[var(--err)]/30"
            onClick={handleClearLog}
            disabled={requestLog.length === 0}
          >
            Clear
          </button>
        </div>
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
