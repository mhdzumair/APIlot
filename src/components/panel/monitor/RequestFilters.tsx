import * as React from 'react';
import { Input } from '@/components/ui/input';
import { useMonitorStore } from '@/stores/useMonitorStore';
import { cn } from '@/lib/utils';

type FilterType = 'all' | 'graphql' | 'rest';

const TYPE_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'rest', label: 'REST' },
];

export function RequestFilters() {
  const filters = useMonitorStore((s) => s.filters);
  const setFilters = useMonitorStore((s) => s.setFilters);

  const hasActiveFilters = filters.search !== '' || filters.type !== 'all' || filters.status !== 'all';

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/50 shrink-0">
      {/* Search */}
      <div className="relative flex-1 min-w-0">
        <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40 pointer-events-none" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 2.5 2.5" strokeLinecap="round"/>
        </svg>
        <Input
          placeholder="Filter requests…"
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          className="h-6 text-[11px] pl-6 bg-muted/30 border-border/40 hover:border-border focus:border-primary/50 placeholder:text-muted-foreground/35 flex-1 min-w-0"
        />
      </div>

      {/* Type pills */}
      <div className="flex items-center gap-0.5 shrink-0">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={cn(
              'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
              filters.type === opt.value
                ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40'
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
          className="shrink-0 h-5 w-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors text-[10px]"
          onClick={() => setFilters({ search: '', type: 'all', status: 'all' })}
          title="Clear filters"
        >
          ✕
        </button>
      )}
    </div>
  );
}
