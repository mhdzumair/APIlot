import { create } from 'zustand';

type OperationType = 'query' | 'mutation' | 'subscription';

export interface SelectedOperation {
  id: string;
  name: string;
  operationType: OperationType;
  /** Argument names that the user has toggled on */
  selectedArguments: string[];
  /** Argument values keyed by arg name */
  argumentValues: Record<string, string>;
  /** Dot-separated paths of selected response fields, e.g. "user.id" */
  selectedSubFields: string[];
}

interface BuilderState {
  operationType: OperationType;
  selectedOperation: SelectedOperation | null;
  /** Flat set of dot-separated field paths toggled on within the selected operation */
  selectedFields: Set<string>;
  variables: Record<string, unknown>;
  generatedQuery: string;
  response: string | null;
  loading: boolean;
  responseTime: number | null;
  /** Set true when Schema tab wants to navigate to builder */
  pendingNavigateToBuilder: boolean;
  /** false = visual mode, true = custom raw query mode */
  customQueryMode: boolean;
  /** Raw query text in custom mode */
  customQuery: string;

  /** All open operation tabs */
  operationTabs: SelectedOperation[];
  /** ID of the currently active tab */
  activeTabId: string | null;

  setOperationType: (type: OperationType) => void;
  setSelectedOperation: (op: SelectedOperation | null) => void;
  toggleField: (fieldPath: string) => void;
  toggleArgument: (argName: string) => void;
  setArgumentValue: (argName: string, value: string) => void;
  setVariables: (vars: Record<string, unknown>) => void;
  setGeneratedQuery: (query: string) => void;
  setResponse: (response: string | null, responseTime?: number) => void;
  setLoading: (loading: boolean) => void;
  setPendingNavigateToBuilder: (val: boolean) => void;
  setCustomQueryMode: (mode: boolean) => void;
  setCustomQuery: (query: string) => void;

  /** Add or activate an operation tab */
  addOperationTab: (op: SelectedOperation) => void;
  /** Remove a tab by ID; switches active tab if needed */
  removeOperationTab: (id: string) => void;
  /** Switch active tab and sync selectedOperation / selectedFields */
  setActiveTabId: (id: string | null) => void;

  reset: () => void;
}

const initialState = {
  operationType: 'query' as OperationType,
  selectedOperation: null,
  selectedFields: new Set<string>(),
  variables: {},
  generatedQuery: '',
  response: null,
  loading: false,
  responseTime: null,
  pendingNavigateToBuilder: false,
  customQueryMode: false,
  customQuery: '',
  operationTabs: [] as SelectedOperation[],
  activeTabId: null as string | null,
};

export const useBuilderStore = create<BuilderState>((set) => ({
  ...initialState,

  setOperationType: (type) =>
    set({
      operationType: type,
      selectedOperation: null,
      selectedFields: new Set<string>(),
      generatedQuery: '',
      response: null,
      operationTabs: [],
      activeTabId: null,
    }),

  setSelectedOperation: (op) =>
    set({
      selectedOperation: op,
      operationType: op?.operationType ?? 'query',
      selectedFields: op ? new Set(op.selectedSubFields) : new Set<string>(),
      generatedQuery: '',
      response: null,
    }),

  toggleField: (fieldPath) =>
    set((state) => {
      const next = new Set(state.selectedFields);
      if (next.has(fieldPath)) {
        next.delete(fieldPath);
      } else {
        next.add(fieldPath);
      }
      const op = state.selectedOperation
        ? { ...state.selectedOperation, selectedSubFields: Array.from(next) }
        : null;
      const operationTabs =
        op && state.activeTabId
          ? state.operationTabs.map((t) => (t.id === state.activeTabId ? op : t))
          : state.operationTabs;
      return { selectedFields: next, selectedOperation: op, operationTabs };
    }),

  toggleArgument: (argName) =>
    set((state) => {
      if (!state.selectedOperation) return {};
      const prev = state.selectedOperation.selectedArguments;
      const next = prev.includes(argName)
        ? prev.filter((a) => a !== argName)
        : [...prev, argName];
      const op = { ...state.selectedOperation, selectedArguments: next };
      const operationTabs = state.activeTabId
        ? state.operationTabs.map((t) => (t.id === state.activeTabId ? op : t))
        : state.operationTabs;
      return { selectedOperation: op, operationTabs };
    }),

  setArgumentValue: (argName, value) =>
    set((state) => {
      if (!state.selectedOperation) return {};
      const op = {
        ...state.selectedOperation,
        argumentValues: {
          ...state.selectedOperation.argumentValues,
          [argName]: value,
        },
      };
      const operationTabs = state.activeTabId
        ? state.operationTabs.map((t) => (t.id === state.activeTabId ? op : t))
        : state.operationTabs;
      return { selectedOperation: op, operationTabs };
    }),

  setVariables: (vars) => set({ variables: vars }),

  setGeneratedQuery: (query) => set({ generatedQuery: query }),

  setResponse: (response, responseTime) =>
    set({ response, responseTime: responseTime ?? null }),

  setLoading: (loading) => set({ loading }),

  setPendingNavigateToBuilder: (val) => set({ pendingNavigateToBuilder: val }),

  setCustomQueryMode: (mode) => set({ customQueryMode: mode }),

  setCustomQuery: (query) => set({ customQuery: query }),

  addOperationTab: (op) =>
    set((state) => {
      // If already open, just switch to it
      const existing = state.operationTabs.find((t) => t.id === op.id);
      if (existing) {
        return {
          activeTabId: existing.id,
          selectedOperation: existing,
          operationType: existing.operationType,
          selectedFields: new Set(existing.selectedSubFields),
          generatedQuery: '',
          response: null,
        };
      }
      const newTabs = [...state.operationTabs, op];
      return {
        operationTabs: newTabs,
        activeTabId: op.id,
        selectedOperation: op,
        operationType: op.operationType,
        selectedFields: new Set(op.selectedSubFields),
        generatedQuery: '',
        response: null,
      };
    }),

  removeOperationTab: (id) =>
    set((state) => {
      const newTabs = state.operationTabs.filter((t) => t.id !== id);
      // If removing an inactive tab, just remove it
      if (state.activeTabId !== id) {
        return { operationTabs: newTabs };
      }
      // Active tab removed — switch to adjacent tab
      const removedIndex = state.operationTabs.findIndex((t) => t.id === id);
      const nextTab = newTabs[Math.min(removedIndex, newTabs.length - 1)] ?? null;
      return {
        operationTabs: newTabs,
        activeTabId: nextTab?.id ?? null,
        selectedOperation: nextTab ?? null,
        operationType: nextTab?.operationType ?? 'query',
        selectedFields: nextTab ? new Set(nextTab.selectedSubFields) : new Set<string>(),
        generatedQuery: '',
        response: null,
      };
    }),

  setActiveTabId: (id) =>
    set((state) => {
      if (!id) {
        return { activeTabId: null, selectedOperation: null, selectedFields: new Set<string>() };
      }
      const tab = state.operationTabs.find((t) => t.id === id) ?? null;
      return {
        activeTabId: id,
        selectedOperation: tab,
        operationType: tab?.operationType ?? state.operationType,
        selectedFields: tab ? new Set(tab.selectedSubFields) : new Set<string>(),
        generatedQuery: '',
        response: null,
      };
    }),

  reset: () =>
    set({
      ...initialState,
      selectedFields: new Set<string>(),
      operationTabs: [],
    }),
}));
