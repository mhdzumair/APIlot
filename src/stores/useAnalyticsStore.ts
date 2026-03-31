import { create } from 'zustand';
import type { PerformanceMetrics } from '../services/PerformanceTracker';

interface AnalyticsState {
  metrics: PerformanceMetrics | null;
  setMetrics: (metrics: PerformanceMetrics | null) => void;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  metrics: null,
  setMetrics: (metrics) => set({ metrics }),
}));
