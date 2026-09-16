import * as React from 'react';
import { useState } from 'react';
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
  const { updateRule, addRule } = useRulesStore();
  const [copied, setCopied] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

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

  /** Duplicates this rule as a new, independent rule. */
  async function handleCopy() {
    if (duplicating) return;
    setDuplicating(true);
    const { id: _id, ...rest } = rule;
    const duplicateData: Omit<ApiRule, 'id'> = { ...rest, name: `${rule.name} (copy)` };
    try {
      const resp = await sendMsg({ type: 'ADD_RULE', rule: duplicateData });
      if (resp?.success) {
        addRule(resp.ruleId, { ...duplicateData, id: resp.ruleId });
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } else {
        toast.error('Failed to duplicate rule.');
      }
    } catch (err) {
      console.error('[RuleCard] duplicate error:', err);
      toast.error('An error occurred while duplicating the rule.');
    } finally {
      setDuplicating(false);
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
    <article
      className={`rounded-xl border border-border bg-card px-5 py-4 transition-opacity ${
        rule.enabled ? 'opacity-100' : 'opacity-60'
      }`}
    >
      {/* Top row: name + toggle */}
      <div className="flex items-center gap-3">
        <h3
          className={`flex-1 min-w-0 truncate text-sm font-bold ${
            rule.enabled ? 'text-foreground' : 'text-[var(--text3)]'
          }`}
        >
          {rule.name}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <Switch
            checked={rule.enabled}
            onCheckedChange={handleToggle}
            aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
          />
          <span
            className={`text-xs font-semibold w-14 ${
              rule.enabled ? 'text-primary' : 'text-[var(--text3)]'
            }`}
          >
            {rule.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-2 my-3.5">
        <Badge
          variant={requestTypeBadgeVariant(rule.requestType)}
          className="rounded-full border-transparent bg-[var(--accent-strong)] text-[var(--accent-on)] capitalize text-[11px] font-semibold"
        >
          {requestTypeLabel(rule.requestType)}
        </Badge>
        <Badge variant="outline" className="rounded-full text-[11px]">
          {actionLabel(rule)}
        </Badge>
        {rule.requestType !== 'rest' && rule.requestType !== 'static' && rule.operationName && (
          <Badge variant="outline" className="rounded-full text-[11px] font-mono">
            {rule.operationName}
          </Badge>
        )}
        {(rule.requestType === 'rest') && rule.httpMethod && rule.httpMethod !== 'ALL' && (
          <Badge variant="outline" className="rounded-full text-[11px] font-mono uppercase">
            {rule.httpMethod}
          </Badge>
        )}
        {rule.requestType === 'static' && rule.redirectFilenameOnly && (
          <Badge variant="outline" className="rounded-full text-[11px]">
            filename-only
          </Badge>
        )}
      </div>

      {/* URL pattern */}
      {urlSummary && (
        <p className="text-xs text-[var(--text3)] font-mono truncate mb-3.5">{urlSummary}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 rounded-[9px] text-xs"
          onClick={() => onEdit(ruleId)}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 rounded-[9px] text-xs"
          onClick={handleCopy}
          disabled={duplicating}
          aria-label={`Duplicate rule ${rule.name}`}
          title={`Duplicate rule ${rule.name}`}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 rounded-[9px] text-xs border-[var(--err)] text-[var(--err)] hover:bg-[var(--err-bg)] hover:text-[var(--err)]"
          onClick={() => onDelete(ruleId)}
        >
          Delete
        </Button>
      </div>
    </article>
  );
}
