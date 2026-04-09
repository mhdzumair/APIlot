import * as React from 'react';
import { Input } from '@/components/ui/input';
import { useMonitorStore } from '@/stores/useMonitorStore';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type FilterType = 'all' | 'graphql' | 'rest' | 'static';
type FilterStatus = 'all' | 'success' | 'error' | 'pending';

const TYPE_OPTIONS: { value: FilterType; label: string; title: string }[] = [
  { value: 'all',     label: 'All',     title: 'Show GraphQL + REST' },
  { value: 'graphql', label: 'GQL',     title: 'GraphQL only' },
  { value: 'rest',    label: 'REST',    title: 'REST API only' },
  { value: 'static',  label: 'Static',  title: 'JS / CSS / HTML / static assets' },
];

const STATUS_OPTIONS: { value: FilterStatus; label: string; activeClass: string }[] = [
  {
    value: 'all',
    label: 'Any',
    activeClass: 'bg-primary/15 text-primary ring-1 ring-primary/30',
  },
  {
    value: 'success',
    label: '2xx',
    activeClass: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
  },
  {
    value: 'error',
    label: '4xx+',
    activeClass: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  },
  {
    value: 'pending',
    label: '⏳',
    activeClass: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
  },
];

const METHODS = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const METHOD_STYLES: Record<string, string> = {
  GET:    'text-emerald-400',
  POST:   'text-blue-400',
  PUT:    'text-amber-400',
  PATCH:  'text-amber-400',
  DELETE: 'text-red-400',
};

// ---------------------------------------------------------------------------
// RequestFilters
// ---------------------------------------------------------------------------

export function RequestFilters() {
  const filters = useMonitorStore((s) => s.filters);
  const setFilters = useMonitorStore((s) => s.setFilters);

  const hasActiveFilters =
    filters.search !== '' ||
    filters.type !== 'all' ||
    filters.status !== 'all' ||
    filters.method !== 'ALL';

  return (
    <div className="flex flex-col border-b border-border/50 shrink-0 bg-card/20">
      {/* Row 1: search + type pills */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/55 pointer-events-none"
            fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"
          >
            <circle cx="7" cy="7" r="4.5"/>
            <path d="m10.5 10.5 2.5 2.5" strokeLinecap="round"/>
          </svg>
          <Input
            placeholder="Filter by URL, operation, method…"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            className="h-6 text-[11px] pl-6 bg-muted/30 border-border/40 hover:border-border focus:border-primary/50 placeholder:text-muted-foreground/55"
          />
        </div>

        {/* Type pills */}
        <div className="flex items-center gap-0.5 shrink-0">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              title={opt.title}
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors',
                filters.type === opt.value
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  : 'text-foreground/65 hover:text-foreground hover:bg-muted/40'
              )}
              onClick={() => setFilters({ type: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Clear */}
        {hasActiveFilters && (
          <button
            className="shrink-0 h-5 w-5 flex items-center justify-center rounded text-foreground/65 hover:text-foreground hover:bg-muted/40 transition-colors text-[10px]"
            onClick={() => setFilters({ search: '', type: 'all', status: 'all', method: 'ALL' })}
            title="Clear all filters"
          >
            ✕
          </button>
        )}
      </div>

      {/* Row 2: status + method */}
      <div className="flex items-center gap-1.5 px-2.5 pb-1.5">
        {/* Status label */}
        <span className="text-[10px] text-muted-foreground shrink-0 select-none font-medium">
          Status
        </span>

        {/* Status pills */}
        <div className="flex items-center gap-0.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={cn(
                'px-1.5 py-px rounded text-[10px] font-medium transition-colors tabular-nums',
                filters.status === opt.value
                  ? opt.activeClass
                  : 'text-foreground/65 hover:text-foreground hover:bg-muted/40'
              )}
              onClick={() => setFilters({ status: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="h-3 w-px bg-border/40 shrink-0 mx-0.5" />

        {/* Method label */}
        <span className="text-[10px] text-muted-foreground shrink-0 select-none font-medium">
          Method
        </span>

        {/* Method pills */}
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {METHODS.map((m) => (
            <button
              key={m}
              className={cn(
                'px-1.5 py-px rounded text-[10px] font-mono font-medium transition-colors shrink-0',
                filters.method === m
                  ? cn(
                      'ring-1',
                      m === 'ALL'
                        ? 'bg-primary/15 text-primary ring-primary/30'
                        : `bg-muted ${METHOD_STYLES[m] ?? 'text-foreground'} ring-border`
                    )
                  : 'text-foreground/65 hover:text-foreground hover:bg-muted/40'
              )}
              onClick={() => setFilters({ method: m })}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
