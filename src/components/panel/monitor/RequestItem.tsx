import * as React from 'react';
import type { LogEntry } from '@/types/requests';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RequestDetails } from './RequestDetails';
import {
  getOperationDisplayName,
  getRequestMethod,
  getStatusVariant,
  getTimingDisplay,
} from '@/lib/requestUtils';
import { cn } from '@/lib/utils';
import { useMonitorStore } from '@/stores/useMonitorStore';

interface RequestItemProps {
  request: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}

function StatusBadge({ status }: { status: number | undefined }) {
  const variant = getStatusVariant(status);

  const classes = {
    success: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30',
    warning: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
    error: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
    pending: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
        classes[variant]
      )}
    >
      {status ?? 'Pending'}
    </span>
  );
}

function TypeBadge({ type }: { type: 'graphql' | 'rest' }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[9px] px-1 py-0 h-4 font-bold uppercase',
        type === 'graphql'
          ? 'border-pink-500/40 text-pink-600 dark:text-pink-400 bg-pink-500/10'
          : 'border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10'
      )}
    >
      {type}
    </Badge>
  );
}

export function RequestItem({ request, isExpanded, onToggle }: RequestItemProps) {
  const operationName = getOperationDisplayName(request);
  const method = getRequestMethod(request);
  const timing = getTimingDisplay(request);
  const hasMatchedRules = (request.matchedRules?.length ?? 0) > 0;
  const timestamp = new Date(request.timestamp).toLocaleTimeString();
  const setAiMockRequest = useMonitorStore((s) => s.setAiMockRequest);

  return (
    <div
      className={cn(
        'border-b last:border-b-0 text-xs',
        hasMatchedRules && 'bg-amber-500/5'
      )}
    >
      {/* Request header row — clickable to toggle details */}
      <div
        className="flex items-start gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer select-none"
        onClick={onToggle}
        role="button"
        aria-expanded={isExpanded}
      >
        {/* Left: type badge + operation name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <TypeBadge type={request.requestType} />
            <span className="font-medium truncate max-w-[200px]" title={operationName}>
              {operationName}
            </span>
            {hasMatchedRules && (
              <span
                className="text-amber-600 dark:text-amber-400"
                title={`Matched rules: ${request.matchedRules!.join(', ')}`}
              >
                &#x25C6;
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-muted-foreground">
            <span className="font-mono">{method}</span>
            <span className="tabular-nums">{timing}</span>
            <span>{timestamp}</span>
          </div>
        </div>

        {/* Right: status + action buttons */}
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={request.responseStatus} />
          <Button
            variant="outline"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            title="Create mock rule from this request"
            onClick={(e) => {
              e.stopPropagation();
              // Rule creation will be wired in a future phase
            }}
          >
            + Rule
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            title="Generate AI mock"
            onClick={(e) => {
              e.stopPropagation();
              setAiMockRequest(request);
            }}
          >
            AI Mock
          </Button>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && <RequestDetails request={request} />}
    </div>
  );
}
