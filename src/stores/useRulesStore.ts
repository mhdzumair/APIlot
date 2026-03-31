import { create } from 'zustand';
import type { ApiRule } from '../types/rules';

interface RulesState {
  rules: Map<string, ApiRule>;
  editingRule: ApiRule | null;
  editingRuleId: string | null;
  pendingNewRule: Partial<ApiRule> | null;

  // actions
  setRules: (rules: Map<string, ApiRule> | [string, ApiRule][]) => void;
  addRule: (id: string, rule: ApiRule) => void;
  updateRule: (id: string, rule: ApiRule) => void;
  deleteRule: (id: string) => void;
  setEditingRule: (id: string | null, rule: ApiRule | null) => void;
  setPendingNewRule: (rule: Partial<ApiRule> | null) => void;
}

export const useRulesStore = create<RulesState>((set) => ({
  rules: new Map<string, ApiRule>(),
  editingRule: null,
  editingRuleId: null,
  pendingNewRule: null,

  setRules: (input) => {
    const rules =
      input instanceof Map ? new Map(input) : new Map<string, ApiRule>(input);
    set({ rules });
  },

  addRule: (id, rule) =>
    set((state) => {
      const rules = new Map(state.rules);
      rules.set(id, rule);
      return { rules };
    }),

  updateRule: (id, rule) =>
    set((state) => {
      const rules = new Map(state.rules);
      rules.set(id, rule);
      return { rules };
    }),

  deleteRule: (id) =>
    set((state) => {
      const rules = new Map(state.rules);
      rules.delete(id);
      return { rules };
    }),

  setEditingRule: (id, rule) =>
    set({ editingRuleId: id, editingRule: rule }),

  setPendingNewRule: (rule) => set({ pendingNewRule: rule }),
}));
