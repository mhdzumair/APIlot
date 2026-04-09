import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { sendMsg } from '@/lib/messaging';
import { useRulesStore } from '@/stores/useRulesStore';
import type { ApiRule } from '@/types/rules';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requestTypeBadgeVariant(
  requestType: ApiRule['requestType']
): 'default' | 'secondary' | 'outline' {
  if (requestType === 'graphql') return 'default';
  if (requestType === 'rest') return 'secondary';
  return 'outline';
}

function requestTypeLabel(requestType: ApiRule['requestType']): string {
  if (requestType === 'static') return 'static asset';
  if (requestType === 'both') return 'gql + rest';
  return requestType;
}

function actionLabel(rule: ApiRule): string {
  switch (rule.action) {
    case 'mock':
      return `mock ${rule.statusCode ?? 200}`;
    case 'delay':
      return `delay ${rule.delay ?? 0}ms`;
    case 'block':
      return 'block';
    case 'modify':
      return 'modify';
    case 'redirect':
      return 'redirect';
    case 'passthrough':
      return 'passthrough';
    default:
      return rule.action;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RuleCardProps {
  ruleId: string;
  rule: ApiRule;
  onEdit: (ruleId: string) => void;
  onDelete: (ruleId: string) => void;
}

// ---------------------------------------------------------------------------
// RuleCard
// ---------------------------------------------------------------------------

export function RuleCard({ ruleId, rule, onEdit, onDelete }: RuleCardProps) {
  const { updateRule } = useRulesStore();

  async function handleToggle(enabled: boolean) {
    const updated: ApiRule = { ...rule, enabled };
    try {
      const resp = await sendMsg({ type: 'UPDATE_RULE', ruleId, rule: { enabled } });
      if (resp?.success) {
        updateRule(ruleId, updated);
      } else {
        toast.error('Failed to update rule.');
      }
    } catch (err) {
      console.error('[RuleCard] toggle error:', err);
      toast.error('An error occurred while toggling the rule.');
    }
  }

  // URL/endpoint summary line
  const urlSummary =
    rule.urlPattern ??
    rule.graphqlEndpoint ??
    rule.restPath ??
    rule.restEndpoint ??
    null;

  return (
    <div
      className={`border rounded-md px-4 py-3 space-y-2 transition-opacity ${
        rule.enabled ? 'opacity-100' : 'opacity-50'
      }`}
    >
      {/* Top row: name + toggle */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm truncate flex-1">{rule.name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <Switch
            checked={rule.enabled}
            onCheckedChange={handleToggle}
            aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
          />
          <span className="text-xs text-muted-foreground w-14">
            {rule.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={requestTypeBadgeVariant(rule.requestType)} className="capitalize text-[11px]">
          {requestTypeLabel(rule.requestType)}
        </Badge>
        <Badge variant="outline" className="text-[11px]">
          {actionLabel(rule)}
        </Badge>
        {rule.requestType !== 'rest' && rule.requestType !== 'static' && rule.operationName && (
          <Badge variant="outline" className="text-[11px] font-mono">
            {rule.operationName}
          </Badge>
        )}
        {(rule.requestType === 'rest') && rule.httpMethod && rule.httpMethod !== 'ALL' && (
          <Badge variant="outline" className="text-[11px] font-mono uppercase">
            {rule.httpMethod}
          </Badge>
        )}
        {rule.requestType === 'static' && rule.redirectFilenameOnly && (
          <Badge variant="outline" className="text-[11px]">
            filename-only
          </Badge>
        )}
      </div>

      {/* URL pattern */}
      {urlSummary && (
        <p className="text-xs text-muted-foreground font-mono truncate">{urlSummary}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onEdit(ruleId)}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => onDelete(ruleId)}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
