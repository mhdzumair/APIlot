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
  { value: 'all',     label: 'All',     title: 'Show GraphQL + REST + static assets' },
  { value: 'graphql', label: 'GQL',     title: 'GraphQL only' },
  { value: 'rest',    label: 'REST',    title: 'REST API only' },
  { value: 'static',  label: 'Static',  title: 'JS / CSS / HTML / static assets' },
];

const STATUS_OPTIONS: { value: FilterStatus; label: string; activeClass: string }[] = [
  {
    value: 'all',
    label: 'Any',
    activeClass: 'bg-primary/15 text-primary border-primary/30',
  },
  {
    value: 'success',
    label: '2xx',
    activeClass: 'bg-[var(--ok-bg)] text-[var(--ok)] border-[var(--ok)]/30',
  },
  {
    value: 'error',
    label: '4xx+',
    activeClass: 'bg-[var(--err-bg)] text-[var(--err)] border-[var(--err)]/30',
  },
  {
    value: 'pending',
    label: '⏳',
    activeClass: 'bg-[var(--warn-bg)] text-[var(--warn)] border-[var(--warn)]/30',
  },
];

const METHODS = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const METHOD_STYLES: Record<string, string> = {
  GET:    'bg-[var(--m-get-bg)] text-[var(--m-get-fg)] border-[var(--m-get-fg)]/25',
  POST:   'bg-[var(--m-post-bg)] text-[var(--m-post-fg)] border-[var(--m-post-fg)]/25',
  PUT:    'bg-[var(--m-put-bg)] text-[var(--m-put-fg)] border-[var(--m-put-fg)]/25',
  PATCH:  'bg-[var(--m-patch-bg)] text-[var(--m-patch-fg)] border-[var(--m-patch-fg)]/25',
  DELETE: 'bg-[var(--m-del-bg)] text-[var(--m-del-fg)] border-[var(--m-del-fg)]/25',
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
    <div className="flex flex-col gap-2.5 border-b border-border/50 shrink-0 bg-card/20 px-3.5 py-2.5">
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/55 pointer-events-none"
          fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"
        >
          <circle cx="7" cy="7" r="4.5"/>
          <path d="m10.5 10.5 2.5 2.5" strokeLinecap="round"/>
        </svg>
        <Input
          placeholder="Filter by URL, operation, method…"
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          className="h-8 text-[12px] pl-9 rounded-[9px] bg-muted/30 border-border/40 hover:border-border focus-visible:border-primary/50 placeholder:text-muted-foreground/55"
        />
      </div>

      {/* Filter chip row — label + chips inline, single non-wrapping scrollable row */}
      <div className="flex items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Type — segmented control */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[12px] text-muted-foreground select-none font-semibold">Type</span>
          <div className="flex items-center gap-0.5 bg-[var(--surface2)] rounded-[9px] p-[3px]">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                title={opt.title}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap',
                  filters.type === opt.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setFilters({ type: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status — pill chips */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[12px] text-muted-foreground select-none font-semibold">Status</span>
          <div className="flex items-center gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors tabular-nums border whitespace-nowrap',
                  filters.status === opt.value
                    ? opt.activeClass
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40'
                )}
                onClick={() => setFilters({ status: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Method — pill chips */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[12px] text-muted-foreground select-none font-semibold">Method</span>
          <div className="flex items-center gap-1">
            {METHODS.map((m) => (
              <button
                key={m}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[12px] font-mono font-medium transition-colors shrink-0 border whitespace-nowrap',
                  filters.method === m
                    ? m === 'ALL'
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : (METHOD_STYLES[m] ?? 'text-foreground border-border')
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40'
                )}
                onClick={() => setFilters({ method: m })}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Clear */}
        {hasActiveFilters && (
          <button
            className="shrink-0 h-6 px-2 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-[12px] font-medium whitespace-nowrap"
            onClick={() => setFilters({ search: '', type: 'all', status: 'all', method: 'ALL' })}
            title="Clear all filters"
          >
            ✕ Clear
          </button>
        )}
      </div>
    </div>
  );
}
