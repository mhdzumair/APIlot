import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useMonitorStore } from '@/stores/useMonitorStore';

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
    <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
      {/* Search */}
      <Input
        placeholder="Search operations, URLs..."
        value={filters.search}
        onChange={(e) => setFilters({ search: e.target.value })}
        className="h-7 text-xs flex-1 min-w-0"
      />

      {/* Type filter tabs */}
      <div className="flex items-center rounded border overflow-hidden shrink-0">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={
              'px-2 py-1 text-[10px] font-medium transition-colors ' +
              (filters.type === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted text-muted-foreground')
            }
            onClick={() => setFilters({ type: opt.value })}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Clear button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs shrink-0"
          onClick={() => setFilters({ search: '', type: 'all', status: 'all' })}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
