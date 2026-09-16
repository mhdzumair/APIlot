import * as React from 'react';
import { cn } from '@/lib/utils';
import type { SchemaField } from '@/stores/useSchemaStore';

interface OperationCardProps {
  operation: SchemaField;
  operationType: 'query' | 'mutation' | 'subscription';
  isSelected: boolean;
  onClick: () => void;
}

const TYPE_BADGE_COLORS: Record<string, string> = {
  query: 'bg-[var(--t-rest-bg)] text-[var(--t-rest-fg)]',
  mutation: 'bg-[var(--warn-bg)] text-[var(--warn)]',
  subscription: 'bg-[var(--t-gql-bg)] text-[var(--t-gql-fg)]',
};

export function OperationCard({
  operation,
  operationType,
  isSelected,
  onClick,
}: OperationCardProps) {
  const previewArgs = (operation.args ?? []).slice(0, 3);
  const hasMoreArgs = (operation.args?.length ?? 0) > 3;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-[10px] border px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isSelected
          ? 'border-primary bg-primary/5 dark:bg-primary/10'
          : 'border-border bg-background hover:bg-accent hover:text-accent-foreground'
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            'shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10px] font-bold uppercase',
            TYPE_BADGE_COLORS[operationType] ?? TYPE_BADGE_COLORS.query
          )}
        >
          {operationType}
        </span>
        <span
          className={cn(
            'font-mono font-semibold truncate',
            isSelected ? 'text-primary' : 'text-foreground'
          )}
        >
          {operation.name}
        </span>
        <span className="ml-auto shrink-0 text-[var(--t-rest-fg)] font-mono truncate max-w-[120px]">
          {operation.type}
        </span>
      </div>

      {/* Args preview */}
      {previewArgs.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {previewArgs.map((arg) => (
            <span
              key={arg.name}
              className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground font-mono"
            >
              {arg.name}:{' '}
              <span className="text-foreground">{arg.type}</span>
            </span>
          ))}
          {hasMoreArgs && (
            <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
              +{(operation.args?.length ?? 0) - 3} more
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {operation.description && (
        <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
          {operation.description}
        </p>
      )}
    </button>
  );
}
