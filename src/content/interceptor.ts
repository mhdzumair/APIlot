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

export class APIInterceptor {
  private isMonitoring: boolean = false;
  private pendingNetworkCapture: NetworkCaptureSettings;
  private _pageMessageListenerAttached: boolean = false;

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
              window.location.origin || '*',
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
    window.postMessage({ type: 'START_API_MONITORING' }, window.location.origin || '*');
    // Push latest network capture settings
    window.postMessage({ type: 'APILOT_SET_NETWORK_CAPTURE', payload: { ...this.pendingNetworkCapture } }, window.location.origin || '*');
    console.log('[CONTENT] API monitoring started');
  }

  stopMonitoring(): void {
    this.isMonitoring = false;
    // Always sync the page context — it can be out of sync if STOP was skipped earlier
    // or the injected script used its default state before any START.
    window.postMessage({ type: 'STOP_API_MONITORING' }, window.location.origin || '*');
    console.log('[CONTENT] API monitoring stopped');
  }

  private injectInterceptor(): void {
    this.setupPageMessageBridge();
    const script = document.createElement('script');
    script.src = browser.runtime.getURL('injected.js');
    const payload = { ...this.pendingNetworkCapture };
    script.onload = () => {
      script.remove();
      window.postMessage({ type: 'APILOT_SET_NETWORK_CAPTURE', payload }, window.location.origin || '*');
      // If checkInitialDevToolsState() resolved BEFORE this script finished loading,
      // the START_API_MONITORING it sent was silently dropped (no listener yet).
      // Re-send it now that the injected script's message listener is live.
      if (this.isMonitoring) {
        window.postMessage({ type: 'START_API_MONITORING' }, window.location.origin || '*');
      }
    };
    script.onerror = () => console.error('Failed to inject API interceptor script');
    (document.head ?? document.documentElement).appendChild(script);
  }

  private async handleAPIRequest(payload: Record<string, unknown>): Promise<void> {
    const requestType = (payload.requestType as string) || 'graphql';
    console.log(`[CONTENT] Handling ${requestType.toUpperCase()} request:`, {
      requestId: payload.requestId,
      operationName: payload.operationName,
      method: payload.method,
      url: payload.url,
    });

    try {
      // First check if extension is enabled
      const enabledResponse = (await browser.runtime.sendMessage({
        type: 'GET_ENABLED_STATUS',
      })) as MessageResponses['GET_ENABLED_STATUS'];

      console.log('[CONTENT] Extension enabled status:', enabledResponse);

      // If disabled, don't log or process the request
      if (!enabledResponse.enabled) {
        console.log('[CONTENT] Extension disabled - skipping request processing');
        window.postMessage(
          { type: 'API_REQUEST_PROCEED', payload: { requestId: payload.requestId } },
          window.location.origin || '*',
        );
        return;
      }

      // Tab-level enable: resolve before logging so we never log or apply rules when the tab is off.
      const ruleResponse = (await browser.runtime.sendMessage({
        type: 'GET_MATCHING_RULE',
        data: {
          requestType: requestType,
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
        console.log('[CONTENT] Tab monitoring disabled or rule check failed — proceeding without rules');
        window.postMessage(
          { type: 'API_REQUEST_PROCEED', payload: { requestId: payload.requestId } },
          window.location.origin || '*',
        );
        return;
      }

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

      console.log(`[CONTENT] Logging ${requestType} request to background:`, {
        requestId: payload.requestId,
        hasHeaders: !!payload.requestHeaders,
        headerCount: payload.requestHeaders
          ? Object.keys(payload.requestHeaders as object).length
          : 0,
      });

      const logResponse = (await browser.runtime.sendMessage({
        type: 'LOG_REQUEST',
        data: requestData,
      })) as MessageResponses['LOG_REQUEST'];
      console.log('[CONTENT] Request logged:', logResponse);

      console.log('[CONTENT] Rule check response:', ruleResponse);
      console.log(
        `[CONTENT] Rules found: ${ruleResponse.rules ? ruleResponse.rules.length : 0}, Single rule: ${ruleResponse.rule ? 'yes' : 'no'}`,
      );

      // Always check for rules array first, then fall back to single rule for compatibility
      const rulesToApply =
        ruleResponse.rules && ruleResponse.rules.length > 0
          ? ruleResponse.rules
          : ruleResponse.rule
            ? [ruleResponse.rule]
            : [];

      if (rulesToApply.length > 0) {
        console.log(
          `[CONTENT] Found ${rulesToApply.length} matching rule(s) for ${(payload.operationName as string) || (payload.endpoint as string)}:`,
          rulesToApply.map((r) => `${r.name} (${r.action})`).join(', '),
        );

        window.postMessage(
          {
            type: 'APPLY_API_RULES',
            payload: { requestId: payload.requestId, rules: rulesToApply },
          },
          window.location.origin || '*',
        );
      } else {
        console.log('[CONTENT] No rules apply, proceeding normally');
        window.postMessage(
          { type: 'API_REQUEST_PROCEED', payload: { requestId: payload.requestId } },
          window.location.origin || '*',
        );
      }
    } catch (error: unknown) {
      console.error('Error handling API request:', error);
      // Let request proceed on error
      window.postMessage(
        { type: 'API_REQUEST_PROCEED', payload: { requestId: payload.requestId } },
        window.location.origin || '*',
      );
    }
  }

  private async handleAPIResponse(payload: Record<string, unknown>): Promise<void> {
    const requestType = (payload.requestType as string) || 'graphql';
    console.log(`[CONTENT] Received ${requestType} response from injected script:`, {
      requestId: payload.requestId,
      status: payload.status,
      hasResponse: !!payload.response,
      error: payload.error,
    });

    try {
      const enabledResp = (await browser.runtime.sendMessage({
        type: 'GET_ENABLED_STATUS',
      })) as MessageResponses['GET_ENABLED_STATUS'] | undefined;

      if (!enabledResp?.enabled) {
        return;
      }

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

      // Log the response
      console.log('[CONTENT] Logging response to background:', payload.requestId);
      const logResponse = (await browser.runtime.sendMessage({
        type: 'LOG_RESPONSE',
        data: responseData,
      })) as MessageResponses['LOG_RESPONSE'];

      console.log('[CONTENT] Response logged to background:', {
        requestId: payload.requestId,
        success: logResponse?.success,
      });
    } catch (error: unknown) {
      console.error('[CONTENT] Error handling API response:', error);
    }
  }
}
