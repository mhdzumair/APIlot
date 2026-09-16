import * as React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import type { LogEntry } from '@/types/requests';
import { CodeBlock } from './CodeBlock';
import { cn } from '@/lib/utils';

interface RequestDetailsProps {
  request: LogEntry;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatBytes(bytes: number | undefined): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatMs(ms: number | undefined): string | null {
  if (ms === undefined) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Builds a shell-safe curl command reproducing this captured request. */
function buildCurl(request: LogEntry): string {
  const method = (request.method ?? (request.requestType === 'graphql' ? 'POST' : 'GET')).toUpperCase();
  const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

  let body: string | undefined;
  if (request.requestType === 'graphql' && (request.query || request.variables)) {
    body = JSON.stringify({
      operationName: request.operationName,
      query: request.query,
      variables: request.variables ?? {},
    });
  } else if (request.body !== undefined) {
    body = typeof request.body === 'string' ? request.body : safeStringify(request.body);
  }

  const parts = [`curl -X ${method} ${quote(request.url)}`];
  for (const [key, value] of Object.entries(request.requestHeaders ?? {})) {
    parts.push(`  -H ${quote(`${key}: ${value}`)}`);
  }
  if (body) {
    parts.push(`  --data-raw ${quote(body)}`);
  }
  return parts.join(' \\\n');
}

/** Re-issues the captured request against its original URL and reports the outcome. */
async function replayRequest(request: LogEntry): Promise<void> {
  const method = (request.method ?? (request.requestType === 'graphql' ? 'POST' : 'GET')).toUpperCase();
  const headers: Record<string, string> = { ...(request.requestHeaders ?? {}) };

  let body: string | undefined;
  if (request.requestType === 'graphql' && (request.query || request.variables)) {
    body = JSON.stringify({
      operationName: request.operationName,
      query: request.query,
      variables: request.variables ?? {},
    });
    headers['Content-Type'] ??= 'application/json';
  } else if (request.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    body = typeof request.body === 'string' ? request.body : safeStringify(request.body);
  }

  const toastId = toast.loading('Replaying request…');
  try {
    const start = performance.now();
    const res = await fetch(request.url, { method, headers, body });
    const elapsed = Math.round(performance.now() - start);
    if (res.ok) {
      toast.success(`Replayed — ${res.status} in ${elapsed}ms`, { id: toastId });
    } else {
      toast.warning(`Replayed — ${res.status} ${res.statusText} in ${elapsed}ms`, { id: toastId });
    }
  } catch (err) {
    toast.error(`Replay failed: ${(err as Error).message ?? 'network error'}`, { id: toastId });
  }
}

// ---------------------------------------------------------------------------
// Pane definitions
// ---------------------------------------------------------------------------

interface Pane {
  key: string;
  label: string;
  content: string;
  language: 'json' | 'graphql';
}

export function RequestDetails({ request }: RequestDetailsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isGraphql = request.requestType === 'graphql';

  const headersContent = useMemo(
    () =>
      safeStringify({
        ...(request.requestHeaders ? { request: request.requestHeaders } : {}),
        ...(request.responseHeaders ? { response: request.responseHeaders } : {}),
      }),
    [request.requestHeaders, request.responseHeaders]
  );

  const responseContent = useMemo(() => {
    if (request.response !== undefined) {
      return typeof request.response === 'string' ? request.response : safeStringify(request.response);
    }
    if (request.responseError) return request.responseError;
    return '';
  }, [request.response, request.responseError]);

  const isPending = request.response === undefined && !request.responseError;

  const panes = useMemo<Pane[]>(() => {
    if (isGraphql) {
      return [
        { key: 'query', label: 'Query', content: request.query ?? '', language: 'graphql' },
        {
          key: 'variables',
          label: 'Variables',
          content: request.variables ? safeStringify(request.variables) : '',
          language: 'json',
        },
        { key: 'headers', label: 'Headers', content: headersContent, language: 'json' },
        { key: 'response', label: 'Response', content: responseContent, language: 'json' },
      ];
    }
    return [
      {
        key: 'query',
        label: 'Request',
        content: `${(request.method ?? 'GET').toUpperCase()} ${request.url}`,
        language: 'json',
      },
      {
        key: 'variables',
        label: 'Payload',
        content:
          request.body !== undefined
            ? typeof request.body === 'string'
              ? request.body
              : safeStringify(request.body)
            : '—',
        language: 'json',
      },
      { key: 'headers', label: 'Headers', content: headersContent, language: 'json' },
      { key: 'response', label: 'Response', content: responseContent, language: 'json' },
    ];
  }, [isGraphql, request, headersContent, responseContent]);

  const [activePane, setActivePane] = useState(panes[0].key);
  const current = panes.find((p) => p.key === activePane) ?? panes[0];

  // Ctrl+F opens the in-pane search bar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [showSearch]);

  const statusColor =
    !request.responseStatus
      ? 'text-muted-foreground bg-muted'
      : request.responseStatus < 300
      ? 'text-[var(--ok)] bg-[var(--ok-bg)]'
      : request.responseStatus < 400
      ? 'text-[var(--warn)] bg-[var(--warn-bg)]'
      : 'text-[var(--err)] bg-[var(--err-bg)]';
  const isOk = !!request.responseStatus && request.responseStatus < 400;

  return (
    <div className="border-t-2 border-border/60 bg-card/30">
      {/* Header bar: status + url + timing/size + actions */}
      <div className="flex items-center gap-3 px-3.5 py-2.5 border-b border-border/60 flex-wrap">
        <span className={cn('inline-flex items-center gap-1 font-mono font-bold tabular-nums shrink-0 rounded-[6px] px-2 py-0.5 text-[12px]', statusColor)}>
          {request.responseStatus ? (isOk ? '✓' : '⚠') : ''} {request.responseStatus ?? '—'}
        </span>
        <span className="text-muted-foreground font-mono text-[12px] truncate flex-1 min-w-0" title={request.url}>
          {request.url}
        </span>
        {(formatMs(request.responseTime) || formatBytes(request.transferSize)) && (
          <span className="font-mono text-[12px] text-[var(--text3)] shrink-0">
            {[formatMs(request.responseTime), formatBytes(request.transferSize)].filter(Boolean).join(' · ')}
          </span>
        )}
        <button
          className="shrink-0 text-[12px] font-semibold text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-md border border-border/50 hover:border-border transition-colors"
          title="Search in this pane (Ctrl+F)"
          onClick={() => {
            setShowSearch((v) => !v);
            if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 0);
          }}
        >
          ⌕ Find
        </button>
        <button
          className="shrink-0 text-[12px] font-semibold text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-md border border-border/50 hover:border-border transition-colors"
          title="Copy this request as a cURL command"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(buildCurl(request));
              toast.success('cURL command copied to clipboard.');
            } catch {
              toast.error('Failed to copy cURL command.');
            }
          }}
        >
          Copy cURL
        </button>
        <button
          className="shrink-0 text-[12px] font-semibold text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-md border border-border/50 hover:border-border transition-colors"
          title="Re-send this request"
          onClick={() => void replayRequest(request)}
        >
          Replay
        </button>
      </div>

      {/* In-pane search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3.5 py-1.5 border-b border-border/60 bg-muted/30">
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search in ${current.label}…`}
            className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60 min-w-0"
          />
          <button
            onClick={() => { setShowSearch(false); setSearchTerm(''); }}
            className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Pane tabs */}
      <div role="tablist" aria-label="Detail panes" className="flex items-center gap-1 px-3 py-2 border-b border-border/60">
        {panes.map((p) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={activePane === p.key}
            onClick={() => setActivePane(p.key)}
            className={cn(
              'px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors',
              activePane === p.key
                ? 'bg-[var(--surface2)] text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Pane content */}
      <div className="p-3">
        {current.key === 'response' && isPending ? (
          <div className="text-[13px] text-[var(--warn)] py-2 apilot-pending-pulse">Response pending…</div>
        ) : (
          <CodeBlock
            content={current.content || '—'}
            language={current.language}
            searchTerm={showSearch ? searchTerm : ''}
          />
        )}
      </div>
    </div>
  );
}
