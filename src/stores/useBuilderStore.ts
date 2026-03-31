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

  setOperationType: (type: OperationType) => void;
  setSelectedOperation: (op: SelectedOperation | null) => void;
  toggleField: (fieldPath: string) => void;
  toggleArgument: (argName: string) => void;
  setArgumentValue: (argName: string, value: string) => void;
  setVariables: (vars: Record<string, unknown>) => void;
  setGeneratedQuery: (query: string) => void;
  setResponse: (response: string | null, responseTime?: number) => void;
  setLoading: (loading: boolean) => void;
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
    }),

  setSelectedOperation: (op) =>
    set({
      selectedOperation: op,
      selectedFields: op
        ? new Set(op.selectedSubFields)
        : new Set<string>(),
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
      return { selectedFields: next, selectedOperation: op };
    }),

  toggleArgument: (argName) =>
    set((state) => {
      if (!state.selectedOperation) return {};
      const prev = state.selectedOperation.selectedArguments;
      const next = prev.includes(argName)
        ? prev.filter((a) => a !== argName)
        : [...prev, argName];
      return {
        selectedOperation: {
          ...state.selectedOperation,
          selectedArguments: next,
        },
      };
    }),

  setArgumentValue: (argName, value) =>
    set((state) => {
      if (!state.selectedOperation) return {};
      return {
        selectedOperation: {
          ...state.selectedOperation,
          argumentValues: {
            ...state.selectedOperation.argumentValues,
            [argName]: value,
          },
        },
      };
    }),

  setVariables: (vars) => set({ variables: vars }),

  setGeneratedQuery: (query) => set({ generatedQuery: query }),

  setResponse: (response, responseTime) =>
    set({ response, responseTime: responseTime ?? null }),

  setLoading: (loading) => set({ loading }),

  reset: () =>
    set({
      ...initialState,
      selectedFields: new Set<string>(),
    }),
}));
