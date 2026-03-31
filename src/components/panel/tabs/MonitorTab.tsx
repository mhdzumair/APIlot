import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useMonitorStore } from '@/stores/useMonitorStore';
import { RequestList } from '../monitor/RequestList';
import { RequestFilters } from '../monitor/RequestFilters';
import { sendMsg } from '@/lib/messaging';
import { browser } from '@/lib/browser';

export function MonitorTab() {
  const filteredLog = useMonitorStore((s) => s.filteredLog);
  const requestLog = useMonitorStore((s) => s.requestLog);
  const autoScroll = useMonitorStore((s) => s.autoScroll);
  const isEnabled = useMonitorStore((s) => s.isEnabled);
  const tabId = useMonitorStore((s) => s.tabId);
  const setAutoScroll = useMonitorStore((s) => s.setAutoScroll);
  const setEnabled = useMonitorStore((s) => s.setEnabled);
  const clearLog = useMonitorStore((s) => s.clearLog);

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
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b shrink-0">
        {/* Enable/disable toggle */}
        <div className="flex items-center gap-1.5">
          <Switch
            id="monitor-enabled"
            checked={isEnabled}
            onCheckedChange={handleToggleEnabled}
            className="h-4 w-7"
          />
          <label htmlFor="monitor-enabled" className="text-xs cursor-pointer select-none">
            {isEnabled ? 'On' : 'Off'}
          </label>
        </div>

        {/* Request count */}
        <span className="text-xs text-muted-foreground tabular-nums">
          {isFiltered
            ? `${filteredCount} / ${totalCount} requests`
            : `${totalCount} request${totalCount !== 1 ? 's' : ''}`}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Auto-scroll toggle */}
        <div className="flex items-center gap-1.5">
          <Switch
            id="auto-scroll"
            checked={autoScroll}
            onCheckedChange={setAutoScroll}
            className="h-4 w-7"
          />
          <label htmlFor="auto-scroll" className="text-xs cursor-pointer select-none">
            Auto-scroll
          </label>
        </div>

        {/* Clear log */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleClearLog}
          disabled={requestLog.length === 0}
        >
          Clear
        </Button>
      </div>

      {/* Filters */}
      <RequestFilters />

      {/* Request list */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <RequestList requests={filteredLog} />
      </div>
    </div>
  );
}
