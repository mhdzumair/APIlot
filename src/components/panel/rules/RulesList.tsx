import * as React from 'react';
import { RuleCard } from './RuleCard';
import type { ApiRule } from '@/types/rules';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RulesListProps {
  rules: Map<string, ApiRule>;
  onEdit: (ruleId: string) => void;
  onDelete: (ruleId: string) => void;
}

// ---------------------------------------------------------------------------
// RulesList
// ---------------------------------------------------------------------------

export function RulesList({ rules, onEdit, onDelete }: RulesListProps) {
  if (rules.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground select-none gap-2">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" ry="1" />
        </svg>
        <p className="text-sm">No rules configured yet.</p>
        <p className="text-xs">Click &ldquo;Add Rule&rdquo; to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {Array.from(rules.entries()).map(([id, rule]) => (
        <RuleCard
          key={id}
          ruleId={id}
          rule={rule}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
