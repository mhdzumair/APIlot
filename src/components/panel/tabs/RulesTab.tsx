import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { sendMsg } from '@/lib/messaging';
import { useRulesStore } from '@/stores/useRulesStore';
import { RulesList } from '../rules/RulesList';
import { RuleEditorDialog } from '../rules/RuleEditorDialog';
import type { ApiRule } from '@/types/rules';

// ---------------------------------------------------------------------------
// RulesTab
// ---------------------------------------------------------------------------

export function RulesTab() {
  const { rules, deleteRule: storeDeleteRule, setRules } = useRulesStore();
  const pendingNewRule = useRulesStore((s) => s.pendingNewRule);
  const setPendingNewRule = useRulesStore((s) => s.setPendingNewRule);

  // Editor dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<ApiRule | null>(null);

  // Hidden file input for import
  const importInputRef = useRef<HTMLInputElement>(null);

  // Open Add dialog pre-filled when triggered from a request row
  useEffect(() => {
    if (pendingNewRule) {
      setEditingRuleId(null);
      setEditingRule(pendingNewRule as ApiRule);
      setEditorOpen(true);
      setPendingNewRule(null);
    }
  }, [pendingNewRule, setPendingNewRule]);

  // ------------------------------------------------------------------
  // Add / Edit handlers
  // ------------------------------------------------------------------

  function openAddDialog() {
    setEditingRuleId(null);
    setEditingRule(null);
    setEditorOpen(true);
  }

  function openEditDialog(ruleId: string) {
    const rule = rules.get(ruleId);
    if (!rule) return;
    setEditingRuleId(ruleId);
    setEditingRule(rule);
    setEditorOpen(true);
  }

  // ------------------------------------------------------------------
  // Delete handler
  // ------------------------------------------------------------------

  async function handleDelete(ruleId: string) {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;

    try {
      const resp = await sendMsg({ type: 'DELETE_RULE', ruleId });
      if (resp?.success) {
        storeDeleteRule(ruleId);
        toast.success('Rule deleted.');
      } else {
        toast.error('Failed to delete rule.');
      }
    } catch (err) {
      console.error('[RulesTab] delete error:', err);
      toast.error('An error occurred while deleting the rule.');
    }
  }

  // ------------------------------------------------------------------
  // Export
  // ------------------------------------------------------------------

  function handleExport() {
    try {
      const data = JSON.stringify(Array.from(rules.entries()), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apilot-rules-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rules.size} rule${rules.size !== 1 ? 's' : ''}.`);
    } catch (err) {
      console.error('[RulesTab] export error:', err);
      toast.error('Failed to export rules.');
    }
  }

  // ------------------------------------------------------------------
  // Import
  // ------------------------------------------------------------------

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const raw = JSON.parse(text);

      // Normalise two supported formats into Array<[id, rule]>:
      //  1. Current format: [[id, rule], ...] (Map.entries() array)
      //  2. Legacy v2 format: { version, rules: [rule, ...] } envelope
      let parsed: Array<[string, ApiRule]>;
      if (Array.isArray(raw)) {
        parsed = raw as Array<[string, ApiRule]>;
      } else if (raw && typeof raw === 'object' && Array.isArray(raw.rules)) {
        parsed = (raw.rules as ApiRule[]).map((r) => [r.id ?? '', r]);
      } else {
        toast.error('Invalid file format. Expected a JSON array of rules.');
        return;
      }

      // Send all rules one by one via ADD_RULE so background assigns proper IDs
      let imported = 0;
      const newEntries: Array<[string, ApiRule]> = [];

      for (const [, ruleData] of parsed) {
        try {
          // Strip the existing id so background creates a fresh one
          const { id: _id, ...ruleWithoutId } = ruleData as ApiRule;
          const resp = await sendMsg({ type: 'ADD_RULE', rule: ruleWithoutId });
          if (resp?.success) {
            newEntries.push([resp.ruleId, { ...ruleWithoutId, id: resp.ruleId }]);
            imported++;
          }
        } catch {
          // Skip individual failures silently; report at the end
        }
      }

      if (newEntries.length > 0) {
        // Merge imported rules into the existing store rules
        const merged = new Map<string, ApiRule>(rules);
        for (const [id, rule] of newEntries) {
          merged.set(id, rule);
        }
        setRules(merged);
      }

      if (imported === parsed.length) {
        toast.success(`Imported ${imported} rule${imported !== 1 ? 's' : ''}.`);
      } else {
        toast.warning(`Imported ${imported} of ${parsed.length} rule(s). Some rules failed.`);
      }
    } catch (err) {
      console.error('[RulesTab] import error:', err);
      toast.error('Failed to import rules. Please check the file format.');
    }

    // Reset so the same file can be re-imported if needed
    e.target.value = '';
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full gap-3 p-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={openAddDialog}>
          + Add Rule
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={rules.size === 0}>
            Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => importInputRef.current?.click()}
          >
            Import
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {rules.size} rule{rules.size !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Rules list */}
      <div className="flex-1 overflow-y-auto">
        <RulesList
          rules={rules}
          onEdit={openEditDialog}
          onDelete={handleDelete}
        />
      </div>

      {/* Editor dialog */}
      <RuleEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editingRuleId={editingRuleId}
        editingRule={editingRule}
      />
    </div>
  );
}
