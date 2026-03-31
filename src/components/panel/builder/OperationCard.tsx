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
  query: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  mutation: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  subscription: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
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
        'w-full text-left rounded-md border px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isSelected
          ? 'border-primary bg-primary/5 dark:bg-primary/10'
          : 'border-border bg-background hover:bg-accent hover:text-accent-foreground'
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
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
        <span className="ml-auto shrink-0 text-muted-foreground font-mono truncate max-w-[120px]">
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
