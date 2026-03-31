import * as React from 'react';
import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { sendMsg } from '@/lib/messaging';
import type { Settings, AISettings, AIProvider } from '@/types/settings';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="space-y-1 mb-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <Separator />
    </div>
  );
}

function SettingRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">{children}</div>
  );
}

// ---------------------------------------------------------------------------
// Network capture toggle fields
// ---------------------------------------------------------------------------

type NetworkCaptureKey =
  | 'captureRequests'
  | 'captureResponses'
  | 'captureHeaders'
  | 'captureRequestBody'
  | 'captureResponseBody';

const NETWORK_CAPTURE_FIELDS: { key: NetworkCaptureKey; label: string }[] = [
  { key: 'captureRequests', label: 'Capture Requests' },
  { key: 'captureResponses', label: 'Capture Responses' },
  { key: 'captureHeaders', label: 'Capture Headers' },
  { key: 'captureRequestBody', label: 'Capture Request Body' },
  { key: 'captureResponseBody', label: 'Capture Response Body' },
];

// The Settings type has networkCapture as optional and typed differently from
// the legacy boolean-toggle pattern, so we manage capture toggles locally as
// a flat map and merge them into settings.networkCapture when persisting.
type CaptureToggles = Record<NetworkCaptureKey, boolean>;

const DEFAULT_CAPTURE_TOGGLES: CaptureToggles = {
  captureRequests: true,
  captureResponses: true,
  captureHeaders: true,
  captureRequestBody: true,
  captureResponseBody: true,
};

// ---------------------------------------------------------------------------
// AI provider field configs
// ---------------------------------------------------------------------------

interface ProviderFieldConfig {
  apiKeyField: keyof AISettings;
  modelField: keyof AISettings;
  apiKeyLabel: string;
  modelLabel: string;
  modelPlaceholder: string;
}

const PROVIDER_FIELDS: Partial<Record<AIProvider, ProviderFieldConfig>> = {
  openai: {
    apiKeyField: 'openaiApiKey',
    modelField: 'openaiModel',
    apiKeyLabel: 'OpenAI API Key',
    modelLabel: 'Model',
    modelPlaceholder: 'gpt-4o',
  },
  anthropic: {
    apiKeyField: 'anthropicApiKey',
    modelField: 'anthropicModel',
    apiKeyLabel: 'Anthropic API Key',
    modelLabel: 'Model',
    modelPlaceholder: 'claude-sonnet-4-20250514',
  },
  azure: {
    apiKeyField: 'azureApiKey',
    modelField: 'azureModel',
    apiKeyLabel: 'Azure API Key',
    modelLabel: 'Model',
    modelPlaceholder: 'gpt-4o',
  },
  gemini: {
    apiKeyField: 'geminiApiKey',
    modelField: 'geminiModel',
    apiKeyLabel: 'Gemini API Key',
    modelLabel: 'Model',
    modelPlaceholder: 'gemini-pro',
  },
  openrouter: {
    apiKeyField: 'openrouterApiKey',
    modelField: 'openrouterModel',
    apiKeyLabel: 'OpenRouter API Key',
    modelLabel: 'Model',
    modelPlaceholder: 'openai/gpt-4o',
  },
  local: {
    apiKeyField: 'localUrl',
    modelField: 'localModel',
    apiKeyLabel: 'Local Endpoint URL',
    modelLabel: 'Model',
    modelPlaceholder: 'llama3',
  },
};

// ---------------------------------------------------------------------------
// SettingsTab component
// ---------------------------------------------------------------------------

export function SettingsTab() {
  const { settings, aiSettings, updateSettings, updateAISettings } =
    useSettingsStore();

  // Local capture toggle state (merged from/to settings.networkCapture)
  const [captureToggles, setCaptureToggles] = useState<CaptureToggles>(() => {
    const nc = settings.networkCapture as unknown as Partial<CaptureToggles> | undefined;
    if (!nc) return DEFAULT_CAPTURE_TOGGLES;
    return {
      captureRequests: nc.captureRequests ?? DEFAULT_CAPTURE_TOGGLES.captureRequests,
      captureResponses: nc.captureResponses ?? DEFAULT_CAPTURE_TOGGLES.captureResponses,
      captureHeaders: nc.captureHeaders ?? DEFAULT_CAPTURE_TOGGLES.captureHeaders,
      captureRequestBody: nc.captureRequestBody ?? DEFAULT_CAPTURE_TOGGLES.captureRequestBody,
      captureResponseBody: nc.captureResponseBody ?? DEFAULT_CAPTURE_TOGGLES.captureResponseBody,
    };
  });

  // Load current settings from background on mount
  useEffect(() => {
    async function load() {
      try {
        const settingsRes = await sendMsg({ type: 'GET_SETTINGS' });
        if (settingsRes?.success && settingsRes.settings) {
          updateSettings(settingsRes.settings);
          // Update capture toggles from loaded settings
          const nc = settingsRes.settings.networkCapture as unknown as Partial<CaptureToggles> | undefined;
          if (nc) {
            setCaptureToggles((prev) => ({
              ...prev,
              captureRequests: nc.captureRequests ?? prev.captureRequests,
              captureResponses: nc.captureResponses ?? prev.captureResponses,
              captureHeaders: nc.captureHeaders ?? prev.captureHeaders,
              captureRequestBody: nc.captureRequestBody ?? prev.captureRequestBody,
              captureResponseBody: nc.captureResponseBody ?? prev.captureResponseBody,
            }));
          }
        }
      } catch (err) {
        console.warn('[SettingsTab] Failed to load settings:', err);
      }

      try {
        const aiRes = await sendMsg({ type: 'GET_AI_SETTINGS' });
        if (aiRes?.success && aiRes.aiSettings) {
          updateAISettings(aiRes.aiSettings);
        }
      } catch (err) {
        console.warn('[SettingsTab] Failed to load AI settings:', err);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Handlers — General Settings
  // -------------------------------------------------------------------------

  async function handleThemeChange(value: string) {
    const theme = value as Settings['theme'];
    updateSettings({ theme });
    try {
      await sendMsg({ type: 'UPDATE_SETTINGS', settings: { theme } });
    } catch (err) {
      console.warn('[SettingsTab] Failed to update theme:', err);
    }
  }

  async function handleLogProfileChange(value: string) {
    const logProfile = value as Settings['logProfile'];
    updateSettings({ logProfile });
    try {
      await sendMsg({ type: 'UPDATE_SETTINGS', settings: { logProfile } });
    } catch (err) {
      console.warn('[SettingsTab] Failed to update logProfile:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Handlers — Network Capture
  // -------------------------------------------------------------------------

  async function handleCaptureToggle(key: NetworkCaptureKey, checked: boolean) {
    const updated = { ...captureToggles, [key]: checked };
    setCaptureToggles(updated);
    // Merge into settings.networkCapture — cast via unknown since the base type
    // uses a different NetworkCapture shape from the legacy boolean toggles.
    const networkCapture = updated as unknown as Settings['networkCapture'];
    updateSettings({ networkCapture });
    try {
      await sendMsg({ type: 'UPDATE_SETTINGS', settings: { networkCapture } });
    } catch (err) {
      console.warn('[SettingsTab] Failed to update network capture:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Handlers — AI Settings
  // -------------------------------------------------------------------------

  async function handleAIProviderChange(value: string) {
    const provider = value as AIProvider;
    updateAISettings({ provider });
    try {
      await sendMsg({ type: 'UPDATE_AI_SETTINGS', aiSettings: { provider } });
    } catch (err) {
      console.warn('[SettingsTab] Failed to update AI provider:', err);
    }
  }

  async function handleAIFieldChange(field: keyof AISettings, value: string) {
    updateAISettings({ [field]: value } as Partial<AISettings>);
    try {
      await sendMsg({
        type: 'UPDATE_AI_SETTINGS',
        aiSettings: { [field]: value } as Partial<AISettings>,
      });
    } catch (err) {
      console.warn('[SettingsTab] Failed to update AI field:', err);
    }
  }

  async function handleResetAIStats() {
    try {
      const res = await sendMsg({ type: 'RESET_AI_USAGE_STATS' });
      if (res?.success && res.aiSettings) {
        updateAISettings(res.aiSettings);
      }
    } catch (err) {
      console.warn('[SettingsTab] Failed to reset AI stats:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const providerFields = PROVIDER_FIELDS[aiSettings.provider];

  return (
    <div className="p-4 space-y-8 max-w-2xl mx-auto">
      {/* ------------------------------------------------------------------ */}
      {/* General Settings                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <SectionHeader title="General Settings" />

        <SettingRow>
          <Label htmlFor="theme-select" className="text-sm">
            Theme
          </Label>
          <Select value={settings.theme} onValueChange={handleThemeChange}>
            <SelectTrigger id="theme-select" size="sm" className="w-36">
              <SelectValue placeholder="Select theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow>
          <Label htmlFor="log-profile-select" className="text-sm">
            Log Profile
          </Label>
          <Select value={settings.logProfile} onValueChange={handleLogProfileChange}>
            <SelectTrigger id="log-profile-select" size="sm" className="w-36">
              <SelectValue placeholder="Select profile" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="basic">Basic</SelectItem>
              <SelectItem value="detailed">Detailed</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Network Capture                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <SectionHeader title="Network Capture" />

        <div className="space-y-1">
          {NETWORK_CAPTURE_FIELDS.map(({ key, label }) => (
            <SettingRow key={key}>
              <Label htmlFor={`capture-${key}`} className="text-sm cursor-pointer">
                {label}
              </Label>
              <Switch
                id={`capture-${key}`}
                checked={captureToggles[key]}
                onCheckedChange={(checked) => handleCaptureToggle(key, checked)}
              />
            </SettingRow>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* AI Settings                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <SectionHeader title="AI Settings" />

        <SettingRow>
          <Label htmlFor="ai-provider-select" className="text-sm">
            Provider
          </Label>
          <Select value={aiSettings.provider} onValueChange={handleAIProviderChange}>
            <SelectTrigger id="ai-provider-select" size="sm" className="w-36">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="azure">Azure OpenAI</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
              <SelectItem value="openrouter">OpenRouter</SelectItem>
              <SelectItem value="local">Local / Self-hosted</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        {providerFields && (
          <>
            <div className="py-2 space-y-2">
              <Label htmlFor="ai-api-key" className="text-sm">
                {providerFields.apiKeyLabel}
              </Label>
              <Input
                id="ai-api-key"
                type={aiSettings.provider === 'local' ? 'text' : 'password'}
                value={(aiSettings[providerFields.apiKeyField] as string) ?? ''}
                onChange={(e) =>
                  handleAIFieldChange(providerFields.apiKeyField, e.target.value)
                }
                placeholder={
                  aiSettings.provider === 'local'
                    ? 'http://localhost:11434'
                    : 'sk-...'
                }
                className="h-8 text-sm font-mono"
              />
            </div>

            <div className="py-2 space-y-2">
              <Label htmlFor="ai-model" className="text-sm">
                {providerFields.modelLabel}
              </Label>
              <Input
                id="ai-model"
                type="text"
                value={(aiSettings[providerFields.modelField] as string) ?? ''}
                onChange={(e) =>
                  handleAIFieldChange(providerFields.modelField, e.target.value)
                }
                placeholder={providerFields.modelPlaceholder}
                className="h-8 text-sm"
              />
            </div>
          </>
        )}

        {/* Azure-specific endpoint field */}
        {aiSettings.provider === 'azure' && (
          <div className="py-2 space-y-2">
            <Label htmlFor="azure-endpoint" className="text-sm">
              Azure Endpoint
            </Label>
            <Input
              id="azure-endpoint"
              type="text"
              value={aiSettings.azureEndpoint ?? ''}
              onChange={(e) => handleAIFieldChange('azureEndpoint', e.target.value)}
              placeholder="https://<resource>.openai.azure.com"
              className="h-8 text-sm"
            />
          </div>
        )}

        {/* Usage stats */}
        <div className="mt-4 rounded-md border bg-muted/40 px-4 py-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Usage Stats
          </p>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center">
              <p className="text-lg font-semibold tabular-nums">
                {aiSettings.callsCount}
              </p>
              <p className="text-xs text-muted-foreground">Calls</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold tabular-nums">
                {aiSettings.tokensUsed}
              </p>
              <p className="text-xs text-muted-foreground">Tokens</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold tabular-nums">
                {aiSettings.mocksGenerated}
              </p>
              <p className="text-xs text-muted-foreground">Mocks</p>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetAIStats}
            className="text-xs"
          >
            Reset Stats
          </Button>
        </div>
      </section>
    </div>
  );
}
