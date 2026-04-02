import * as React from 'react';
import { useState, useEffect } from 'react';
import type { LogEntry } from '@/types/requests';
import { RequestDetails } from './RequestDetails';
import { getOperationDisplayName, getRequestMethod } from '@/lib/requestUtils';
import { cn } from '@/lib/utils';
import { useMonitorStore } from '@/stores/useMonitorStore';

interface RequestItemProps {
  request: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}

// ─── Method badge ─────────────────────────────────────────────────────────────

const METHOD_STYLES: Record<string, string> = {
  GQL:    'bg-pink-500/15 text-pink-400 ring-1 ring-pink-500/25',
  GET:    'bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-500/20',
  POST:   'bg-blue-500/12 text-blue-400 ring-1 ring-blue-500/20',
  PUT:    'bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/20',
  PATCH:  'bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/20',
  DELETE: 'bg-red-500/12 text-red-400 ring-1 ring-red-500/20',
  HEAD:   'bg-purple-500/12 text-purple-400 ring-1 ring-purple-500/20',
  ALL:    'bg-muted text-muted-foreground ring-1 ring-border',
};

// Extended method styles for static assets
const STATIC_EXT_STYLES: Record<string, string> = {
  js:   'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/25',
  mjs:  'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/25',
  jsx:  'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/25',
  ts:   'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/25',
  tsx:  'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/25',
  css:  'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/25',
  html: 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25',
  htm:  'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25',
  json: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25',
  svg:  'bg-pink-500/15 text-pink-400 ring-1 ring-pink-500/25',
  xml:  'bg-muted text-muted-foreground ring-1 ring-border',
  wasm: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/25',
};

function getStaticBadge(url: string): { label: string; style: string } {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const ext = pathname.split('.').pop() ?? '';
    return {
      label: ext.slice(0, 4).toUpperCase() || 'ASSET',
      style: STATIC_EXT_STYLES[ext] ?? 'bg-muted text-muted-foreground ring-1 ring-border',
    };
  } catch {
    return { label: 'ASSET', style: 'bg-muted text-muted-foreground ring-1 ring-border' };
  }
}

function MethodBadge({ method, type, url }: { method: string; type: 'graphql' | 'rest' | 'static'; url: string }) {
  if (type === 'static') {
    const { label, style } = getStaticBadge(url);
    return (
      <span className={cn(
        'inline-flex items-center justify-center rounded px-1 py-px text-[10px] font-bold uppercase shrink-0 w-[34px] font-mono tracking-wide',
        style
      )}>
        {label}
      </span>
    );
  }
  const key = type === 'graphql' ? 'GQL' : method.toUpperCase();
  const style = METHOD_STYLES[key] ?? METHOD_STYLES['ALL'];
  return (
    <span className={cn(
      'inline-flex items-center justify-center rounded px-1.5 py-px text-[10px] font-bold uppercase shrink-0 w-[34px] font-mono tracking-wide',
      style
    )}>
      {key}
    </span>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: number | undefined }) {
  if (status === undefined) return null;

  const style =
    status >= 500 ? 'text-red-400 bg-red-500/10 ring-red-500/25' :
    status >= 400 ? 'text-red-400 bg-red-500/10 ring-red-500/25' :
    status >= 300 ? 'text-amber-400 bg-amber-500/10 ring-amber-500/25' :
    status >= 200 ? 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/25' :
                    'text-muted-foreground bg-muted ring-border';

  return (
    <span className={cn(
      'inline-flex items-center rounded px-1.5 py-px text-[10px] font-mono font-medium tabular-nums shrink-0 ring-1',
      style
    )}>
      {status}
    </span>
  );
}

// ─── Timing badge ─────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function TimingBadge({ request }: { request: LogEntry }) {
  const isPending = !request.responseStatus && request.responseTime === undefined && !request.responseError;

  const [elapsed, setElapsed] = useState(() => Date.now() - request.startTime);
  useEffect(() => {
    if (!isPending) return;
    const id = setInterval(() => setElapsed(Date.now() - request.startTime), 250);
    return () => clearInterval(id);
  }, [isPending, request.startTime]);

  if (isPending) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-px text-[10px] font-mono font-medium tabular-nums shrink-0',
        'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 apilot-pending-pulse'
      )}>
        {formatDuration(elapsed)}
      </span>
    );
  }

  const ms = request.responseTime;
  if (ms === undefined) return null;

  const style =
    ms > 3000 ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20' :
    ms > 1000  ? 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20' :
                 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20';

  return (
    <span className={cn(
      'inline-flex items-center rounded px-1.5 py-px text-[10px] font-mono font-medium tabular-nums shrink-0',
      style
    )}>
      {formatDuration(ms)}
    </span>
  );
}

// ─── RequestItem ──────────────────────────────────────────────────────────────

// ─── Rule action badge ────────────────────────────────────────────────────────

const ACTION_BADGE_STYLES: Record<string, { cls: string; label: string }> = {
  mock:        { cls: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',       label: 'mock' },
  block:       { cls: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',          label: 'blocked' },
  redirect:    { cls: 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30', label: 'redirect' },
  delay:       { cls: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',    label: 'delay' },
  modify:      { cls: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30', label: 'modify' },
  passthrough: { cls: 'bg-muted text-muted-foreground ring-1 ring-border',           label: 'pass' },
};

function RuleBadge({ request }: { request: LogEntry }) {
  const hasRules = (request.matchedRules?.length ?? 0) > 0;
  if (!hasRules) return null;

  const action = request.appliedRuleAction ?? 'match';
  const style = ACTION_BADGE_STYLES[action] ?? {
    cls: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
    label: action,
  };
  const names = request.matchedRules!.join(', ');
  const extra = (request.matchedRules!.length > 1)
    ? ` +${request.matchedRules!.length - 1}`
    : '';

  return (
    <span
      className={cn('inline-flex items-center rounded px-1.5 py-px text-[10px] font-medium shrink-0', style.cls)}
      title={`Rules applied: ${names}`}
    >
      ◆ {style.label}{extra}
    </span>
  );
}

// ─── RequestItem ──────────────────────────────────────────────────────────────

export function RequestItem({ request, isExpanded, onToggle }: RequestItemProps) {
  const operationName = getOperationDisplayName(request);
  const method = getRequestMethod(request);
  const hasMatchedRules = (request.matchedRules?.length ?? 0) > 0; // used for row highlight
  const timestamp = new Date(request.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const setAiMockRequest = useMonitorStore((s) => s.setAiMockRequest);
  const setRuleFromRequest = useMonitorStore((s) => s.setRuleFromRequest);

  return (
    <div className={cn(
      'border-b border-border/50 last:border-b-0 group/row',
      hasMatchedRules && 'bg-amber-500/[0.04]',
      isExpanded && 'bg-muted/30'
    )}>
      {/* Row */}
      <div
        className={cn(
          'flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none',
          'hover:bg-muted/25 transition-colors duration-100'
        )}
        onClick={onToggle}
        role="button"
        aria-expanded={isExpanded}
      >
        {/* Timestamp */}
        <span className="font-mono text-[11px] text-muted-foreground shrink-0 tabular-nums w-[64px]">
          {timestamp}
        </span>

        {/* Method */}
        <MethodBadge method={method} type={request.requestType} url={request.url} />

        {/* Name + URL */}
        <div className="flex-1 min-w-0 leading-none">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn(
              'text-[12px] font-medium truncate',
              isExpanded ? 'text-foreground' : 'text-foreground/85'
            )} title={operationName}>
              {operationName}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground truncate mt-px font-mono" title={request.url}>
            {request.url}
          </div>
        </div>

        {/* Right actions — visible on hover */}
        <div
          className="flex items-center gap-1.5 shrink-0 ml-1"
          onClick={(e) => e.stopPropagation()}
        >
          <RuleBadge request={request} />
          <TimingBadge request={request} />
          <StatusBadge status={request.responseStatus} />

          {/* Action buttons — shown on row hover */}
          <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity duration-100">
            <button
              className="h-5 px-1.5 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors border border-border/50 hover:border-border"
              title="Create rule from this request"
              onClick={() => setRuleFromRequest(request)}
            >
              + Rule
            </button>
            <button
              className="h-5 px-1.5 rounded text-[10px] font-medium text-primary/70 hover:text-primary hover:bg-primary/10 transition-colors border border-primary/20 hover:border-primary/40"
              title="Generate AI mock"
              onClick={() => setAiMockRequest(request)}
            >
              AI
            </button>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && <RequestDetails request={request} />}
    </div>
  );
}
