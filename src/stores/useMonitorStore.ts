import { create } from 'zustand';
import type { LogEntry } from '../types/requests';

interface Filters {
  search: string;
  type: 'all' | 'graphql' | 'rest';
  status: 'all' | 'success' | 'error' | 'pending';
}

interface MonitorState {
  requestLog: LogEntry[];
  filteredLog: LogEntry[];
  filters: Filters;
  expandedIds: Set<string>;
  autoScroll: boolean;
  isEnabled: boolean;
  tabId: number;
  aiMockRequest: LogEntry | null;
  ruleFromRequest: LogEntry | null;

  // actions
  setTabId: (tabId: number) => void;
  setEnabled: (enabled: boolean) => void;
  addRequest: (entry: LogEntry) => void;
  updateRequest: (id: string, updates: Partial<LogEntry>) => void;
  setRequestLog: (log: LogEntry[]) => void;
  setFilters: (filters: Partial<Filters>) => void;
  toggleExpanded: (id: string) => void;
  setAutoScroll: (autoScroll: boolean) => void;
  clearLog: () => void;
  setAiMockRequest: (request: LogEntry | null) => void;
  setRuleFromRequest: (request: LogEntry | null) => void;
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  type: 'all',
  status: 'all',
};

function applyFilters(log: LogEntry[], filters: Filters): LogEntry[] {
  let result = log;

  if (filters.type !== 'all') {
    result = result.filter((entry) => entry.requestType === filters.type);
  }

  if (filters.status !== 'all') {
    result = result.filter((entry) => {
      if (filters.status === 'pending') {
        return entry.endTime === undefined && entry.responseError === undefined;
      }
      if (filters.status === 'error') {
        return (
          entry.responseError !== undefined ||
          (entry.responseStatus !== undefined && entry.responseStatus >= 400)
        );
      }
      if (filters.status === 'success') {
        return (
          entry.responseError === undefined &&
          entry.endTime !== undefined &&
          (entry.responseStatus === undefined || entry.responseStatus < 400)
        );
      }
      return true;
    });
  }

  if (filters.search.trim() !== '') {
    const search = filters.search.trim().toLowerCase();
    result = result.filter((entry) => {
      return (
        entry.url.toLowerCase().includes(search) ||
        (entry.operationName?.toLowerCase().includes(search) ?? false) ||
        (entry.method?.toLowerCase().includes(search) ?? false) ||
        (entry.endpoint?.toLowerCase().includes(search) ?? false) ||
        (entry.path?.toLowerCase().includes(search) ?? false)
      );
    });
  }

  return result;
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  requestLog: [],
  filteredLog: [],
  filters: DEFAULT_FILTERS,
  expandedIds: new Set<string>(),
  autoScroll: true,
  isEnabled: false,
  tabId: -1,
  aiMockRequest: null,
  ruleFromRequest: null,

  setTabId: (tabId) => set({ tabId }),

  setEnabled: (enabled) => set({ isEnabled: enabled }),

  addRequest: (entry) =>
    set((state) => {
      const requestLog = [...state.requestLog, entry];
      return {
        requestLog,
        filteredLog: applyFilters(requestLog, state.filters),
      };
    }),

  updateRequest: (id, updates) =>
    set((state) => {
      const requestLog = state.requestLog.map((entry) =>
        entry.id === id ? { ...entry, ...updates } : entry,
      );
      return {
        requestLog,
        filteredLog: applyFilters(requestLog, state.filters),
      };
    }),

  setRequestLog: (log) =>
    set((state) => ({
      requestLog: log,
      filteredLog: applyFilters(log, state.filters),
    })),

  setFilters: (filters) =>
    set((state) => {
      const newFilters = { ...state.filters, ...filters };
      return {
        filters: newFilters,
        filteredLog: applyFilters(state.requestLog, newFilters),
      };
    }),

  toggleExpanded: (id) =>
    set((state) => {
      const expandedIds = new Set(state.expandedIds);
      if (expandedIds.has(id)) {
        expandedIds.delete(id);
      } else {
        expandedIds.add(id);
      }
      return { expandedIds };
    }),

  setAutoScroll: (autoScroll) => set({ autoScroll }),

  clearLog: () =>
    set({
      requestLog: [],
      filteredLog: [],
    }),

  setAiMockRequest: (request) => set({ aiMockRequest: request }),

  setRuleFromRequest: (request) => set({ ruleFromRequest: request }),
}));
