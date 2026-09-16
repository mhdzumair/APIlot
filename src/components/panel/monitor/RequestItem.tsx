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
  GQL:    'bg-[var(--t-gql-bg)] text-[var(--t-gql-fg)]',
  GET:    'bg-[var(--m-get-bg)] text-[var(--m-get-fg)]',
  POST:   'bg-[var(--m-post-bg)] text-[var(--m-post-fg)]',
  PUT:    'bg-[var(--m-put-bg)] text-[var(--m-put-fg)]',
  PATCH:  'bg-[var(--m-patch-bg)] text-[var(--m-patch-fg)]',
  DELETE: 'bg-[var(--m-del-bg)] text-[var(--m-del-fg)]',
  HEAD:   'bg-[var(--t-rest-bg)] text-[var(--t-rest-fg)]',
  ALL:    'bg-muted text-muted-foreground',
};

// Extended method styles for static assets
const STATIC_EXT_STYLES: Record<string, string> = {
  js:   'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]',
  mjs:  'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]',
  jsx:  'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]',
  ts:   'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]',
  tsx:  'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]',
  css:  'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]',
  html: 'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]',
  htm:  'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]',
  json: 'bg-[var(--t-json-bg)] text-[var(--t-json-fg)]',
  svg:  'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]',
  xml:  'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]',
  wasm: 'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]',
};

function getStaticBadge(url: string): { label: string; style: string } {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const ext = pathname.split('.').pop() ?? '';
    return {
      label: ext.slice(0, 4).toUpperCase() || 'ASSET',
      style: STATIC_EXT_STYLES[ext] ?? 'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]',
    };
  } catch {
    return { label: 'ASSET', style: 'bg-[var(--t-static-bg)] text-[var(--t-static-fg)]' };
  }
}

function MethodBadge({ method, type, url }: { method: string; type: 'graphql' | 'rest' | 'static'; url: string }) {
  if (type === 'static') {
    const { label, style } = getStaticBadge(url);
    return (
      <span className={cn(
        'inline-flex items-center justify-center rounded-[6px] px-1 py-0.5 text-[11px] font-bold uppercase shrink-0 w-[52px] font-mono tracking-wide',
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
      'inline-flex items-center justify-center rounded-[6px] px-1 py-0.5 text-[11px] font-bold uppercase shrink-0 w-[52px] font-mono tracking-wide',
      style
    )}>
      {key}
    </span>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: number | undefined }) {
  if (status === undefined) return null;

  const isOk = status < 400;
  const isWarn = status >= 300 && status < 400;
  const style = isWarn
    ? 'text-[var(--warn)] bg-[var(--warn-bg)]'
    : isOk
    ? 'text-[var(--ok)] bg-[var(--ok-bg)]'
    : 'text-[var(--err)] bg-[var(--err-bg)]';

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] font-mono font-bold tabular-nums shrink-0',
      style
    )}>
      {isOk ? '✓' : '⚠'} {status}
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
        'inline-flex items-center justify-end gap-1 text-[12px] font-mono font-bold tabular-nums shrink-0 w-[52px]',
        'text-[var(--warn)] apilot-pending-pulse'
      )}>
        {formatDuration(elapsed)}
      </span>
    );
  }

  const ms = request.responseTime;
  if (ms === undefined) return null;

  const isSlow = ms > 1000;

  return (
    <span className={cn(
      'inline-flex items-center justify-end text-[12px] font-mono font-bold tabular-nums shrink-0 w-[52px]',
      isSlow ? 'text-[var(--warn)]' : 'text-[var(--ok)]'
    )}>
      {formatDuration(ms)}
    </span>
  );
}

// ─── Size badge ───────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function SizeBadge({ bytes }: { bytes: number | undefined }) {
  if (!bytes) return null;
  return (
    <span className="inline-flex items-center justify-end text-[12px] font-mono tabular-nums shrink-0 w-[64px] text-[var(--text3)]">
      {formatSize(bytes)}
    </span>
  );
}

// ─── Rule action badge ────────────────────────────────────────────────────────

const ACTION_BADGE_STYLES: Record<string, { cls: string; label: string }> = {
  mock:        { cls: 'bg-[var(--t-rest-bg)] text-[var(--t-rest-fg)]', label: 'mock' },
  block:       { cls: 'bg-[var(--err-bg)] text-[var(--err)]',          label: 'blocked' },
  redirect:    { cls: 'bg-[var(--t-gql-bg)] text-[var(--t-gql-fg)]',   label: 'redirect' },
  delay:       { cls: 'bg-[var(--warn-bg)] text-[var(--warn)]',        label: 'delay' },
  modify:      { cls: 'bg-[var(--ok-bg)] text-[var(--ok)]',            label: 'modify' },
  passthrough: { cls: 'bg-muted text-muted-foreground',                label: 'pass' },
};

function RuleBadge({ request }: { request: LogEntry }) {
  const hasRules = (request.matchedRules?.length ?? 0) > 0;
  if (!hasRules) return null;

  const action = request.appliedRuleAction ?? 'match';
  const style = ACTION_BADGE_STYLES[action] ?? {
    cls: 'bg-[var(--warn-bg)] text-[var(--warn)]',
    label: action,
  };
  const names = request.matchedRules!.join(', ');
  const extra = (request.matchedRules!.length > 1)
    ? ` +${request.matchedRules!.length - 1}`
    : '';

  return (
    <span
      className={cn('inline-flex items-center rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold shrink-0', style.cls)}
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
      'border-b border-border/50 last:border-b-0 group/row border-l-[3px]',
      isExpanded ? 'border-l-[var(--accent-strong)]' : 'border-l-transparent',
      hasMatchedRules && !isExpanded && 'bg-[var(--warn-bg)]',
      isExpanded && 'bg-muted/30'
    )}>
      {/* Row */}
      <div
        role="row"
        className={cn(
          'flex items-center gap-3 px-3.5 py-[9px] cursor-pointer select-none',
          'hover:bg-muted/25 active:bg-muted/30 transition-colors duration-100'
        )}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        {/* Expand caret */}
        <span className="text-[10px] text-muted-foreground/70 shrink-0 w-3 text-center">
          {isExpanded ? '▼' : '▶'}
        </span>

        {/* Timestamp — hidden on screens narrower than 400px */}
        <span className="[@media(max-width:400px)]:hidden font-mono text-[11px] text-[var(--text3)] shrink-0 tabular-nums w-[58px]">
          {timestamp}
        </span>

        {/* Method */}
        <MethodBadge method={method} type={request.requestType} url={request.url} />

        {/* Name + URL */}
        <div className="flex-1 min-w-0 leading-none">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn(
              'text-[12px] font-semibold truncate',
              isExpanded ? 'text-foreground' : 'text-foreground/90'
            )} title={operationName}>
              {operationName}
            </span>
          </div>
          <div className="text-[12px] text-muted-foreground truncate mt-px font-mono" title={request.url}>
            {request.url}
          </div>
          {/* On mobile: show timing + status inline below the URL */}
          <div className="flex items-center gap-1 mt-0.5 sm:hidden">
            <TimingBadge request={request} />
            <StatusBadge status={request.responseStatus} />
            <RuleBadge request={request} />
          </div>
        </div>

        {/* Right actions — on desktop: badges + hover-only buttons; on mobile: action buttons always visible */}
        <div
          className="flex items-center gap-1.5 shrink-0 ml-1"
          onClick={(e) => e.stopPropagation()}
          role="presentation"
        >
          {/* Badges — hidden on mobile (shown inline under URL instead) */}
          <div className="hidden sm:flex items-center gap-1.5">
            <RuleBadge request={request} />
            <SizeBadge bytes={request.transferSize} />
            <TimingBadge request={request} />
            <StatusBadge status={request.responseStatus} />
          </div>

          {/* Action buttons:
              - pointer:fine (mouse) → hidden, fade in on row hover
              - pointer:coarse (touch) → always visible */}
          <div className="flex items-center gap-1 [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover/row:opacity-100 transition-opacity duration-100">
            <button
              className="h-6 sm:h-5 px-2 sm:px-1.5 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground active:text-foreground hover:bg-muted/60 active:bg-muted/60 transition-colors border border-border/50 hover:border-border"
              title="Create rule from this request"
              onClick={() => setRuleFromRequest(request)}
            >
              + Rule
            </button>
            <button
              className="h-6 sm:h-5 px-2 sm:px-1.5 rounded-md text-[10px] font-medium text-primary/70 hover:text-primary active:text-primary hover:bg-primary/10 active:bg-primary/10 transition-colors border border-primary/20 hover:border-primary/40"
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
