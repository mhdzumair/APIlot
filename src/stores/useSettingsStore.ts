import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Settings, AISettings } from '../types/settings';

const DEFAULT_SETTINGS: Settings = {
  logProfile: 'basic',
  theme: 'light',
};

const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'local',
  openaiApiKey: '',
  openaiModel: 'gpt-4o',
  anthropicApiKey: '',
  anthropicModel: 'claude-sonnet-4-20250514',
  callsCount: 0,
  tokensUsed: 0,
  mocksGenerated: 0,
};

interface SettingsState {
  settings: Settings;
  aiSettings: AISettings;

  // actions
  updateSettings: (settings: Partial<Settings>) => void;
  updateAISettings: (aiSettings: Partial<AISettings>) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      aiSettings: DEFAULT_AI_SETTINGS,

      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),

      updateAISettings: (updates) =>
        set((state) => ({
          aiSettings: { ...state.aiSettings, ...updates },
        })),

      resetSettings: () =>
        set({
          settings: DEFAULT_SETTINGS,
          aiSettings: DEFAULT_AI_SETTINGS,
        }),
    }),
    {
      name: 'apilot-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
