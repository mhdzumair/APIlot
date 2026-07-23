import type { StorageData, TabState } from './types';

const QUOTA_WARN_BYTES = 8 * 1024 * 1024;
const BULKY_KEYS = ['performanceData', 'sessions'] as const;

/** Strip heavy fields from tab state before persisting or loading. */
export function slimTabState(state: TabState): TabState {
  return {
    enabled: !!state.enabled,
    devToolsOpen: !!state.devToolsOpen,
    requestLog: [],
  };
}

export function slimTabStatesRecord(
  tabStates: Record<string, TabState> | undefined
): Record<string, TabState> {
  if (!tabStates) return {};
  const out: Record<string, TabState> = {};
  for (const [k, v] of Object.entries(tabStates)) {
    out[k] = slimTabState(v);
  }
  return out;
}

function isQuotaError(error: unknown): boolean {
  const msg = (error as Error)?.message ?? String(error);
  return msg.includes('quota') || msg.includes('Quota');
}

/**
 * Remove bulky storage keys and rewrite slim tabStates so future writes succeed.
 * Call on extension startup when quota is near or exceeded.
 */
export async function repairChromeStorageIfNeeded(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return false;

  try {
    const bytes = await chrome.storage.local.getBytesInUse(null);
    if (bytes < QUOTA_WARN_BYTES) return false;

    console.warn(
      `[CHROME] Storage high (${bytes} bytes) — pruning bulky keys`
    );

    const data = (await chrome.storage.local.get([
      ...BULKY_KEYS,
      'tabStates',
      'apiRules',
      'settings',
    ])) as Partial<StorageData>;

    await chrome.storage.local.remove([...BULKY_KEYS]);

    const slimTabs = slimTabStatesRecord(
      data.tabStates as Record<string, TabState> | undefined
    );
    await chrome.storage.local.set({
      tabStates: slimTabs,
      apiRules: data.apiRules,
      settings: data.settings,
    });

    const after = await chrome.storage.local.getBytesInUse(null);
    console.log(`[CHROME] Storage repaired: ${bytes} → ${after} bytes`);
    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      console.warn('[CHROME] Storage repair: quota on read, clearing all storage');
      await chrome.storage.local.clear();
      return true;
    }
    console.warn('[CHROME] Storage repair failed:', (error as Error)?.message ?? error);
    return false;
  }
}

/** Persist with quota recovery: drop bulky keys, then retry with minimal payload. */
export async function safeChromeStorageSet(
  data: Partial<StorageData>
): Promise<void> {
  const payload: Partial<StorageData> = {
    ...data,
    tabStates: data.tabStates
      ? slimTabStatesRecord(data.tabStates as Record<string, TabState>)
      : data.tabStates,
  };

  try {
    await chrome.storage.local.set(payload);
    return;
  } catch (error) {
    if (!isQuotaError(error)) throw error;
  }

  console.warn('[CHROME] Storage quota exceeded — pruning and retrying save');
  await chrome.storage.local.remove([...BULKY_KEYS]);

  try {
    await chrome.storage.local.set({
      apiRules: payload.apiRules,
      settings: payload.settings,
      tabStates: payload.tabStates,
      aiSettings: payload.aiSettings,
    });
    return;
  } catch (error) {
    if (!isQuotaError(error)) throw error;
  }

  console.warn('[CHROME] Storage still full — saving apiRules only');
  await chrome.storage.local.set({
    apiRules: payload.apiRules,
    settings: payload.settings,
  });
}
