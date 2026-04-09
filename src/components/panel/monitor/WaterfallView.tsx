import * as React from 'react';
import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import type { LogEntry } from '@/types/requests';
import { getOperationDisplayName, getRequestMethod } from '@/lib/requestUtils';
import { useMonitorStore } from '@/stores/useMonitorStore';
import { cn } from '@/lib/utils';

// ─── Bar color by type / state ────────────────────────────────────────────────

function barColor(entry: LogEntry): string {
  const isError =
    !!entry.responseError ||
    (entry.responseStatus !== undefined && entry.responseStatus >= 400);
  if (isError) return 'bg-red-500/70';
  if (entry.requestType === 'graphql') return 'bg-pink-500/70';
  if (entry.requestType === 'static') return 'bg-zinc-500/50';
  return 'bg-blue-500/70';
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipInfo {
  entry: LogEntry;
  x: number;
  y: number;
}

function Tooltip({ info }: { info: TooltipInfo }) {
  const { entry } = info;
  const name = getOperationDisplayName(entry);
  const method = getRequestMethod(entry);
  const ms = entry.responseTime;
  const isPending = ms === undefined && !entry.responseError;

  return (
    <div
      className="fixed z-50 pointer-events-none bg-popover border border-border/60 rounded-md shadow-lg px-2.5 py-2 text-[11px] max-w-[280px]"
      style={{ left: info.x + 12, top: info.y + 12 }}
    >
      <div className="font-medium text-foreground truncate">{name}</div>
      <div className="text-muted-foreground font-mono mt-0.5 truncate text-[10px]">{entry.url}</div>
      <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono">
        <span className="text-muted-foreground">{method}</span>
        {entry.responseStatus !== undefined && (
          <span className={entry.responseStatus >= 400 ? 'text-red-400' : 'text-emerald-400'}>
            {entry.responseStatus}
          </span>
        )}
        {isPending ? (
          <span className="text-amber-400">pending…</span>
        ) : ms !== undefined ? (
          <span>{ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`}</span>
        ) : null}
        {entry.transferSize !== undefined && (
          <span className="text-muted-foreground/70">
            {entry.transferSize < 1024
              ? `${entry.transferSize}B`
              : entry.transferSize < 1024 * 1024
              ? `${(entry.transferSize / 1024).toFixed(1)}kB`
              : `${(entry.transferSize / (1024 * 1024)).toFixed(1)}MB`}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Scale axis ───────────────────────────────────────────────────────────────

function TimeAxis({ totalMs }: { totalMs: number }) {
  if (totalMs <= 0) return null;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="relative flex h-5 border-b border-border/30 select-none">
      {ticks.map((t) => {
        const ms = t * totalMs;
        const label = ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
        return (
          <div
            key={t}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: `${t * 100}%`, transform: 'translateX(-50%)' }}
          >
            <div className="h-2 w-px bg-border/40" />
            <span className="text-[9px] text-muted-foreground/50 tabular-nums">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── WaterfallView ────────────────────────────────────────────────────────────

interface WaterfallViewProps {
  requests: LogEntry[];
}

export function WaterfallView({ requests }: WaterfallViewProps) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const autoScroll = useMonitorStore((s) => s.autoScroll);
  const setAutoScroll = useMonitorStore((s) => s.setAutoScroll);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    const scrollingUp = el.scrollTop < lastScrollTop.current;
    lastScrollTop.current = el.scrollTop;
    if (isAtBottom) setAutoScroll(true);
    else if (scrollingUp) setAutoScroll(false);
  }, [setAutoScroll]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [requests.length, autoScroll]);

  const { minStart, totalSpan } = useMemo(() => {
    const completed = requests.filter((r) => r.startTime !== undefined);
    if (completed.length === 0) return { minStart: 0, totalSpan: 1 };
    const min = Math.min(...completed.map((r) => r.startTime));
    const max = Math.max(
      ...completed.map((r) => r.endTime ?? (r.startTime + (r.responseTime ?? 0)))
    );
    return { minStart: min, totalSpan: Math.max(max - min, 1) };
  }, [requests]);

  if (requests.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
        No requests captured yet
      </div>
    );
  }

  const ROW_LABEL_WIDTH = 160; // px

  return (
    <div ref={scrollContainerRef} className="flex flex-col overflow-auto h-full text-[11px]" onScroll={handleScroll}>
      {/* Header row */}
      <div className="flex shrink-0 border-b border-border/40 bg-muted/20 sticky top-0 z-10">
        <div
          className="shrink-0 px-2 py-1 text-[10px] text-muted-foreground font-medium border-r border-border/30"
          style={{ width: ROW_LABEL_WIDTH }}
        >
          Request
        </div>
        <div className="flex-1 min-w-0 px-1">
          <TimeAxis totalMs={totalSpan} />
        </div>
      </div>

      {/* Rows */}
      {requests.map((entry) => {
        const offsetMs = entry.startTime - minStart;
        const durationMs = entry.responseTime ?? (entry.endTime ? entry.endTime - entry.startTime : 0);
        const isPending = !entry.responseTime && !entry.responseError;

        const leftPct = (offsetMs / totalSpan) * 100;
        const widthPct = Math.max((durationMs / totalSpan) * 100, 0.5); // min 0.5% to stay visible

        const name = getOperationDisplayName(entry);

        return (
          <div
            key={entry.id}
            className="flex items-center border-b border-border/20 hover:bg-muted/15 group/wf"
          >
            {/* Label column */}
            <div
              className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-r border-border/20 min-w-0"
              style={{ width: ROW_LABEL_WIDTH }}
            >
              <span
                className={cn(
                  'inline-flex items-center justify-center rounded px-1 py-px text-[9px] font-bold uppercase shrink-0 font-mono',
                  entry.requestType === 'graphql'
                    ? 'bg-pink-500/15 text-pink-400'
                    : entry.requestType === 'static'
                    ? 'bg-zinc-500/10 text-zinc-400'
                    : 'bg-blue-500/12 text-blue-400',
                )}
              >
                {entry.requestType === 'graphql' ? 'GQL' : getRequestMethod(entry).slice(0, 4)}
              </span>
              <span className="truncate text-foreground/80 min-w-0" title={name}>
                {name}
              </span>
            </div>

            {/* Bar column */}
            <div className="flex-1 min-w-0 relative h-6 px-1">
              <div
                className={cn(
                  'absolute top-1 h-4 rounded-sm cursor-pointer transition-opacity focus:outline-none focus:ring-1 focus:ring-primary/60',
                  barColor(entry),
                  isPending && 'apilot-pending-pulse opacity-60',
                )}
                role="button"
                tabIndex={0}
                aria-label={`${getOperationDisplayName(entry)} — ${durationMs > 0 ? (durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`) : 'pending'}`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  minWidth: '3px',
                }}
                onMouseEnter={(e) =>
                  setTooltip({ entry, x: e.clientX, y: e.clientY })
                }
                onMouseMove={(e) =>
                  setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null)
                }
                onMouseLeave={() => setTooltip(null)}
                onFocus={(e) => setTooltip({ entry, x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom })}
                onBlur={() => setTooltip(null)}
                onKeyDown={() => { /* bar is info-only */ }}
              />
              {/* Duration label inside bar (only if wide enough) */}
              {widthPct > 8 && durationMs > 0 && (
                <span
                  className="absolute top-1 h-4 flex items-center px-1 text-[9px] font-mono text-white/80 pointer-events-none"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                >
                  {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <div ref={bottomRef} />

      {/* Tooltip portal */}
      {tooltip && <Tooltip info={tooltip} />}
    </div>
  );
}
