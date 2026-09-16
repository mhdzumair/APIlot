/**
 * TypeScript port of src-legacy/content/content-script.js
 * Bridges the injected page script and the extension background script.
 */

import browser from 'webextension-polyfill';
import type { RequestData, ResponseData } from '../types/requests';
import type {
  MessageResponses,
} from '../types/messages';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface NetworkCaptureSettings {
  useFilters: boolean;
  includeSubstrings: string[];
  excludeSubstrings: string[];
  skipStaticExtensions: boolean;
}

/** Shape of raw page-message events posted by the injected script. */
interface PageMessageEvent extends MessageEvent {
  data: {
    type: string;
    payload: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// APIInterceptor
// ---------------------------------------------------------------------------

/** How long a computed redirect-proxy target stays valid, waiting for the matching PROXY_REDIRECT_REQUEST. */
const REDIRECT_PROXY_TTL_MS = 15000;

export class APIInterceptor {
  private isMonitoring: boolean = false;
  private pendingNetworkCapture: NetworkCaptureSettings;
  private _pageMessageListenerAttached: boolean = false;
  /**
   * requestId -> extension-computed redirect target, one-shot and short-lived.
   * The page (untrusted) only ever supplies a requestId here — the actual
   * fetch target always comes from this map, never from the page's message,
   * so a page script cannot direct the background's CORS-bypassing fetch
   * (which runs with <all_urls> host permission) at an arbitrary URL.
   */
  private pendingRedirectProxies = new Map<string, { url: string; expiresAt: number }>();

  constructor() {
    this.pendingNetworkCapture = this.defaultNetworkCapture();
    this.setupMessageListener();
    this.setupPageMessageBridge();
    // Inject immediately at document_start so window.fetch is patched BEFORE
    // any page scripts run and save a reference to the original fetch.
    // The injected script's GET_ENABLED_STATUS check gates what actually gets forwarded.
    this.injectInterceptor();
    // After injection, check if DevTools is open to set the isMonitoring flag
    this.checkInitialDevToolsState();
  }

  private defaultNetworkCapture(): NetworkCaptureSettings {
    return {
      useFilters: false,
      includeSubstrings: [],
      excludeSubstrings: [],
      skipStaticExtensions: false,
    };
  }

  private async refreshNetworkCaptureSettings(): Promise<void> {
    try {
      const res = (await browser.runtime.sendMessage({
        type: 'GET_SETTINGS',
      })) as MessageResponses['GET_SETTINGS'] | undefined;
      const nc = res?.settings?.networkCapture as Partial<NetworkCaptureSettings> | undefined;
      this.pendingNetworkCapture = {
        ...this.defaultNetworkCapture(),
        ...(nc ?? {}),
      };
    } catch {
      this.pendingNetworkCapture = this.defaultNetworkCapture();
    }
  }

  setupMessageListener(): void {
    browser.runtime.onMessage.addListener(
      (
        message: unknown,
        _sender: browser.Runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
      ): true | void => {
        const msg = message as { type: string; data?: Record<string, unknown> };

        if (msg.type === 'PING') {
          sendResponse({ success: true, message: 'Content script active' });
          return;
        } else if (msg.type === 'START_MONITORING') {
          console.log('[CONTENT] Starting API monitoring');
          this.startMonitoring()
            .then(() => sendResponse({ success: true }))
            .catch((err: unknown) =>
              sendResponse({
                success: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          return true;
        } else if (msg.type === 'STOP_MONITORING') {
          console.log('[CONTENT] Stopping API monitoring');
          this.stopMonitoring();
          sendResponse({ success: true });
          return;
        } else if (msg.type === 'NETWORK_CAPTURE_SETTINGS') {
          const nc = msg.data?.networkCapture as Partial<NetworkCaptureSettings> | undefined;
          if (nc) {
            this.pendingNetworkCapture = { ...this.defaultNetworkCapture(), ...nc };
            window.postMessage(
              { type: 'APILOT_SET_NETWORK_CAPTURE', payload: this.pendingNetworkCapture },
              (window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'),
            );
          }
          sendResponse({ success: true });
          return;
        }
      },
    );
  }

  setupPageMessageBridge(): void {
    if (this._pageMessageListenerAttached) return;
    this._pageMessageListenerAttached = true;

    window.addEventListener('message', async (event: MessageEvent) => {
      const e = event as PageMessageEvent;
      if (e.source !== window || !e.data?.type) return;

      switch (e.data.type) {
        case 'API_REQUEST_DETECTED':
          await this.handleAPIRequest(e.data.payload);
          break;

        case 'API_RESPONSE_CAPTURED':
          await this.handleAPIResponse(e.data.payload);
          break;

        case 'GRAPHQL_REQUEST_DETECTED':
          e.data.payload.requestType = 'graphql';
          await this.handleAPIRequest(e.data.payload);
          break;

        case 'GRAPHQL_RESPONSE_CAPTURED':
          e.data.payload.requestType = 'graphql';
          await this.handleAPIResponse(e.data.payload);
          break;

        case 'APILOT_DIAG':
          // Forward diagnostic log from injected/page script to background buffer
          browser.runtime.sendMessage({
            type: 'LOG_DIAG',
            level: e.data.payload.level ?? 'log',
            src: e.data.payload.src ?? 'injected',
            msg: e.data.payload.msg ?? '',
            ts: e.data.payload.ts,
          }).catch(() => {});
          break;

        case 'PROXY_REDIRECT_REQUEST':
          this.handleProxyRedirectRequest(e.data.payload);
          break;
      }
    });
  }

  private checkInitialDevToolsState(): void {
    // Check if DevTools is already open by asking background script
    (
      browser.runtime.sendMessage({ type: 'GET_TAB_STATE' }) as Promise<
        MessageResponses['GET_TAB_STATE'] | undefined
      >
    )
      .then((response) => {
        if (response?.devToolsOpen && response?.enabled) {
          console.log('[CONTENT] DevTools already open and tab enabled, starting monitoring');
          this.startMonitoring();
        } else {
          console.log('[CONTENT] Tab not ready for monitoring:', response);
        }
      })
      .catch((error: unknown) => {
        console.log(
          '[CONTENT] Could not check initial DevTools state:',
          error instanceof Error ? error.message : error,
        );
      });
  }

  async startMonitoring(): Promise<void> {
    await this.refreshNetworkCaptureSettings();
    this.isMonitoring = true;
    // Re-enable the injected script in case it was stopped by a previous stopMonitoring() call
    window.postMessage({ type: 'START_API_MONITORING' }, (window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'));
    // Push latest network capture settings
    window.postMessage({ type: 'APILOT_SET_NETWORK_CAPTURE', payload: { ...this.pendingNetworkCapture } }, (window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'));
    console.log('[CONTENT] API monitoring started');
  }

  stopMonitoring(): void {
    this.isMonitoring = false;
    // Always sync the page context — it can be out of sync if STOP was skipped earlier
    // or the injected script used its default state before any START.
    window.postMessage({ type: 'STOP_API_MONITORING' }, (window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'));
    console.log('[CONTENT] API monitoring stopped');
  }

  private injectInterceptor(): void {
    this.setupPageMessageBridge();
    const script = document.createElement('script');
    script.src = browser.runtime.getURL('injected.js');
    const payload = { ...this.pendingNetworkCapture };
    script.onload = () => {
      script.remove();
      window.postMessage({ type: 'APILOT_SET_NETWORK_CAPTURE', payload }, (window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'));
      // If checkInitialDevToolsState() resolved BEFORE this script finished loading,
      // the START_API_MONITORING it sent was silently dropped (no listener yet).
      // Re-send it now that the injected script's message listener is live.
      if (this.isMonitoring) {
        window.postMessage({ type: 'START_API_MONITORING' }, (window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'));
      }
    };
    script.onerror = () => console.error('Failed to inject API interceptor script');
    (document.head ?? document.documentElement).appendChild(script);
  }

  private async handleAPIRequest(payload: Record<string, unknown>): Promise<void> {
    const requestType = (payload.requestType as string) || 'graphql';

    try {
      // Single round-trip: GET_MATCHING_RULE returns both enabled status and matching rules.
      // Eliminates the separate GET_ENABLED_STATUS call that was adding a full extra RTT.
      const ruleResponse = (await browser.runtime.sendMessage({
        type: 'GET_MATCHING_RULE',
        data: {
          requestType,
          graphqlData:
            requestType === 'graphql'
              ? {
                  operationName: payload.operationName,
                  query: payload.query,
                  variables: payload.variables,
                }
              : null,
          restData:
            requestType === 'rest'
              ? {
                  method: payload.method,
                  endpoint: payload.endpoint,
                  path: payload.path,
                  queryParams: payload.queryParams,
                  body: payload.body,
                }
              : null,
          url: payload.url,
        },
      })) as MessageResponses['GET_MATCHING_RULE'];

      if (!ruleResponse.success || ruleResponse.enabled !== true) {
        window.postMessage(
          { type: 'API_REQUEST_PROCEED', payload: { requestId: payload.requestId } },
          (window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'),
        );
        return;
      }

      // Determine rules before proceeding so the proceed/apply message goes out immediately.
      const rulesToApply =
        ruleResponse.rules && ruleResponse.rules.length > 0
          ? ruleResponse.rules
          : ruleResponse.rule
            ? [ruleResponse.rule]
            : [];

      // Send proceed/apply to the injected script RIGHT AWAY — do not wait for LOG_REQUEST.
      if (rulesToApply.length > 0) {
        const redirectRule = rulesToApply.find((rule: { action?: string }) => rule.action === 'redirect');
        if (redirectRule) {
          const targetUrl = this.buildRedirectTargetUrl(redirectRule, payload.url as string);
          if (targetUrl && payload.requestId) {
            this.pruneExpiredRedirectProxies();
            this.pendingRedirectProxies.set(payload.requestId as string, {
              url: targetUrl,
              expiresAt: Date.now() + REDIRECT_PROXY_TTL_MS,
            });
          }
        }
        window.postMessage(
          {
            type: 'APPLY_API_RULES',
            payload: { requestId: payload.requestId, rules: rulesToApply },
          },
          (window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'),
        );
      } else {
        window.postMessage(
          { type: 'API_REQUEST_PROCEED', payload: { requestId: payload.requestId } },
          (window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'),
        );
      }

      // Log the request to background after unblocking the fetch — fire-and-forget.
      const requestData: RequestData = {
        requestId: payload.requestId as string | undefined,
        requestType: requestType as 'graphql' | 'rest',
        url: payload.url as string,
        operationName: payload.operationName as string | undefined,
        query: payload.query as string | undefined,
        variables: payload.variables as Record<string, unknown> | undefined,
        method: payload.method as string | undefined,
        endpoint: payload.endpoint as string | undefined,
        path: payload.path as string | undefined,
        queryParams: payload.queryParams as Record<string, string> | undefined,
        body: payload.body,
        requestHeaders: payload.requestHeaders as Record<string, string> | undefined,
        timestamp: payload.timestamp as string | undefined,
      };
      browser.runtime.sendMessage({ type: 'LOG_REQUEST', data: requestData }).catch(() => {});
    } catch (error: unknown) {
      console.error('Error handling API request:', error);
      window.postMessage(
        { type: 'API_REQUEST_PROCEED', payload: { requestId: payload.requestId } },
        (window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'),
      );
    }
  }

  private handleProxyRedirectRequest(payload: Record<string, unknown>): void {
    const requestId = payload.requestId as string;
    const origin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*';

    // Only ever proxy to a URL the content script itself computed from a real,
    // rule-matched redirect for this requestId — never the page-supplied payload.url.
    // This is what stops an arbitrary page script from steering the background's
    // <all_urls> fetch (which bypasses CORS) at a URL of its own choosing.
    if (!this.isMonitoring || !requestId) {
      window.postMessage(
        { type: 'PROXY_REDIRECT_RESPONSE', payload: { requestId, success: false, error: 'Not monitoring' } },
        origin,
      );
      return;
    }

    const pending = this.pendingRedirectProxies.get(requestId);
    this.pendingRedirectProxies.delete(requestId); // one-shot regardless of outcome

    if (!pending || Date.now() > pending.expiresAt) {
      window.postMessage(
        { type: 'PROXY_REDIRECT_RESPONSE', payload: { requestId, success: false, error: 'No matching redirect rule pending' } },
        origin,
      );
      return;
    }

    browser.runtime.sendMessage({
      type: 'PROXY_FETCH',
      url: pending.url,
      method: payload.method,
      headers: payload.headers,
      body: payload.body,
    }).then((res: unknown) => {
      window.postMessage(
        { type: 'PROXY_REDIRECT_RESPONSE', payload: { requestId, ...(res as Record<string, unknown>) } },
        origin,
      );
    }).catch((err: unknown) => {
      window.postMessage(
        { type: 'PROXY_REDIRECT_RESPONSE', payload: { requestId, success: false, error: String(err) } },
        origin,
      );
    });
  }

  private pruneExpiredRedirectProxies(): void {
    const now = Date.now();
    for (const [id, entry] of this.pendingRedirectProxies) {
      if (now > entry.expiresAt) this.pendingRedirectProxies.delete(id);
    }
  }

  /** Mirrors the injected page script's redirect-target computation (see entrypoints/injected.ts). */
  private buildRedirectTargetUrl(rule: { redirectUrl?: string; redirectFilenameOnly?: boolean; redirectPreservePath?: boolean }, sourceAbsoluteUrl: string): string | null {
    const base = (rule.redirectUrl || '').trim();
    if (!base) return null;
    try {
      const { protocol } = new URL(base);
      if (protocol !== 'http:' && protocol !== 'https:') return null;
    } catch {
      return null;
    }
    try {
      const src = new URL(sourceAbsoluteUrl);
      if (rule.redirectFilenameOnly) {
        const segments = src.pathname.split('/').filter(Boolean);
        const filename = segments[segments.length - 1] || '';
        if (!filename) return null;
        const b = new URL(base);
        return b.origin.replace(/\/$/, '') + '/' + filename + src.search + (src.hash || '');
      }
      if (rule.redirectPreservePath) {
        return new URL(src.pathname + src.search + src.hash, base).href;
      }
      const b = new URL(base);
      let out = b.origin + b.pathname;
      if (b.search) {
        out += b.search;
      } else if (src.search) {
        out += src.search;
      }
      if (src.hash && !out.includes('#')) out += src.hash;
      return out;
    } catch {
      return base;
    }
  }

  private async handleAPIResponse(payload: Record<string, unknown>): Promise<void> {
    const requestType = (payload.requestType as string) || 'graphql';

    const responseData: ResponseData = {
      requestId: payload.requestId as string,
      requestType: requestType as 'graphql' | 'rest',
      response: payload.response,
      status: payload.status as number | undefined,
      statusText: payload.statusText as string | undefined,
      headers: payload.headers as Record<string, string> | undefined,
      error: payload.error as string | undefined,
      timestamp: payload.timestamp as string | undefined,
      transferSize: payload.transferSize as number | undefined,
    };

    // Fire-and-forget — response logging is never on the critical path.
    browser.runtime.sendMessage({ type: 'LOG_RESPONSE', data: responseData }).catch(() => {});
  }
}
