export default defineUnlistedScript(() => {
  // Injected script for APIlot - Supports both GraphQL and REST APIs
  // This runs in the PAGE context, NOT extension context.
  // ZERO browser extension API imports allowed.
  'use strict';

  // Prevent multiple injections from interfering with each other
  if ((window as any).__APILOT_INJECTED__) {
    console.log('🔄 [APILOT] Script already injected in this context, skipping');
    return;
  }
  (window as any).__APILOT_INJECTED__ = true;

  const originalFetch = window.fetch;
  const pendingRequests = new Map<string, any>();
  /** Must stay false until content script sends START_API_MONITORING (see interceptor). */
  let isMonitoringEnabled = false;

  /** Synced from extension settings. If useFilters is false, all HTTP(S) fetch/XHR is captured (except GraphQL + special URLs). */
  let networkCaptureSettings: {
    useFilters: boolean;
    includeSubstrings: string[];
    excludeSubstrings: string[];
    skipStaticExtensions: boolean;
  } = {
    useFilters: false,
    includeSubstrings: [],
    excludeSubstrings: [],
    skipStaticExtensions: false,
  };

  /** Keep in sync with DEFAULT_STATIC_EXTENSIONS in background/core.js */
  const NETWORK_CAPTURE_STATIC_EXTENSIONS = [
    '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.woff', '.woff2', '.ttf', '.eot', '.map', '.html', '.htm',
  ];

  // about:blank and sandboxed iframes expose window.location.origin as the string
  // "null" (not JS null). Using "null" as a postMessage targetOrigin throws:
  //   "Invalid target origin 'null'". Fall back to '*' in that case.
  function pageOrigin(): string {
    const o = window.location.origin;
    return o && o !== 'null' ? o : '*';
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || (event.data as any)?.type !== 'APILOT_SET_NETWORK_CAPTURE') return;
    networkCaptureSettings = {
      useFilters: false,
      includeSubstrings: [],
      excludeSubstrings: [],
      skipStaticExtensions: false,
      ...((event.data as any).payload || {}),
    };
  });

  // Generate unique request IDs
  function generateRequestId(): string {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Get frame context information
  function getFrameContext() {
    return {
      isTopFrame: window === window.top,
      isIframe: window !== window.top,
      frameUrl: window.location.href,
      frameName: (window as any).name || null,
      parentOrigin:
        window !== window.top
          ? document.referrer
            ? new URL(document.referrer).origin
            : 'unknown'
          : null,
    };
  }

  function diagLog(level: 'log' | 'warn' | 'error', msg: string): void {
    window.postMessage(
      { type: 'APILOT_DIAG', payload: { level, src: 'injected', msg, ts: new Date().toISOString() } },
      pageOrigin(),
    );
  }

  const MEDIA_CONTENT_TYPES = [
    'video/', 'audio/', 'application/vnd.apple.mpegurl', 'application/x-mpegurl',
    'application/octet-stream', 'application/mp4', 'video/mp2t',
  ];

  function isMediaResponse(response: Response): boolean {
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    return MEDIA_CONTENT_TYPES.some((t) => ct.startsWith(t));
  }

  // Capture response data and send to content script
  async function captureResponse(requestId: string, response: Response, requestType = 'graphql') {
    try {
      const contentLengthHeader = response.headers.get('content-length');
      let responseData: any = null;
      let responseText = '';

      // Skip reading the body for binary/media responses — just record metadata
      if (!isMediaResponse(response)) {
        const responseClone = response.clone();
        responseText = await responseClone.text();
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = responseText;
        }
      }

      const transferSize = contentLengthHeader
        ? parseInt(contentLengthHeader, 10)
        : responseText
          ? new TextEncoder().encode(responseText).length
          : 0;

      const payload = {
        requestId,
        requestType,
        response: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        timestamp: new Date().toISOString(),
        transferSize: transferSize || undefined,
      };

      window.postMessage({ type: 'API_RESPONSE_CAPTURED', payload }, pageOrigin());
    } catch (error: any) {
      console.error(`❌ [APILOT] Failed to capture response for ${requestId}:`, error.message);

      const errorPayload = {
        requestId,
        requestType,
        response: null,
        error: `${error.name}: ${error.message}`,
        status: (response as any)?.status || 0,
        statusText: (response as any)?.statusText || 'Unknown',
        timestamp: new Date().toISOString(),
      };

      window.postMessage({ type: 'API_RESPONSE_CAPTURED', payload: errorPayload }, pageOrigin());
      console.log(`📤 [APILOT] Error response message sent for ${requestId}`, errorPayload);
    }
  }

  // Check if a request contains GraphQL
  function isGraphQLRequest(url: any, options: any): boolean {
    const actualUrl = url;
    const actualOptions = options || {};

    // Only process POST requests for GraphQL
    const method = actualOptions?.method?.toUpperCase();
    if (!actualOptions || method !== 'POST') {
      return false;
    }

    // Check for common GraphQL URL patterns
    const graphqlUrlPatterns = [
      '/graphql', '/api/graphql', '/query', '/api/query', '/graphql/proxy', 'graphql/proxy',
    ];
    const hasGraphQLUrl = graphqlUrlPatterns.some((pattern) => actualUrl.includes(pattern));

    // Check for GraphQL content in body
    let hasGraphQLContent = false;
    try {
      if (actualOptions.body && typeof actualOptions.body === 'string') {
        const parsed = JSON.parse(actualOptions.body);
        hasGraphQLContent = !!(parsed.query || parsed.operationName || parsed.variables);
      }
    } catch (e) {
      // Not JSON, might still be GraphQL
      if (actualOptions.body && typeof actualOptions.body === 'string') {
        hasGraphQLContent =
          actualOptions.body.includes('query') ||
          actualOptions.body.includes('mutation') ||
          actualOptions.body.includes('subscription');
      }
    }

    // Check Content-Type header for GraphQL
    const contentType =
      actualOptions.headers?.['content-type'] || actualOptions.headers?.['Content-Type'] || '';
    const hasGraphQLContentType =
      contentType.includes('application/json') || contentType.includes('application/graphql');

    // GraphQL detection logic
    const isGraphQL =
      (hasGraphQLContent && (hasGraphQLUrl || hasGraphQLContentType)) ||
      (hasGraphQLUrl && hasGraphQLContentType && !actualOptions.body);

    return isGraphQL;
  }

  /**
   * Whether to wrap this fetch/XHR as a captured "rest" request.
   * No URL filtering unless Settings → Background network capture → Apply URL filters is enabled.
   */
  function shouldInterceptAsRest(url: any, options: any): boolean {
    if (isGraphQLRequest(url, options)) {
      return false;
    }

    const actualUrl = url || '';

    if (
      actualUrl &&
      !actualUrl.startsWith('http://') &&
      !actualUrl.startsWith('https://') &&
      !actualUrl.startsWith('/') &&
      !actualUrl.startsWith('./')
    ) {
      if (!actualUrl.includes('://') && !actualUrl.startsWith('data:') && !actualUrl.startsWith('blob:')) {
        // relative segment without leading slash
      } else {
        return false;
      }
    }

    const lower = actualUrl.toLowerCase();
    if (lower.includes('chrome-extension://') || lower.includes('moz-extension://')) {
      return false;
    }
    if (actualUrl.startsWith('chrome://') || actualUrl.startsWith('about:')) {
      return false;
    }
    if (actualUrl.startsWith('data:') || actualUrl.startsWith('blob:')) {
      return false;
    }

    let policyUrl = actualUrl;
    if (actualUrl && !actualUrl.startsWith('http') && !actualUrl.startsWith('//')) {
      try {
        policyUrl = new URL(actualUrl, window.location.href).href;
      } catch (e) {
        policyUrl = actualUrl;
      }
    }

    const nc = networkCaptureSettings || { useFilters: false };
    const urlLower = policyUrl.toLowerCase();

    // excludeSubstrings always applies — even when useFilters is false.
    // This lets users exclude streaming/media URLs without enabling full filter mode.
    const exclude = (nc.excludeSubstrings || []).map((s: string) => String(s).toLowerCase());
    if (exclude.some((sub: string) => sub && urlLower.includes(sub))) {
      return false;
    }

    if (!nc.useFilters) {
      return true;
    }

    const urlPath = urlLower.split('?')[0];
    if (
      nc.skipStaticExtensions &&
      NETWORK_CAPTURE_STATIC_EXTENSIONS.some((ext) => urlPath.endsWith(ext))
    ) {
      return false;
    }

    const include = (nc.includeSubstrings || [])
      .map((s: string) => String(s).toLowerCase())
      .filter(Boolean);
    if (include.length === 0) {
      return true;
    }
    return include.some((sub: string) => urlLower.includes(sub));
  }

  // Detect request type
  function detectRequestType(url: any, options: any): string | null {
    if (isGraphQLRequest(url, options)) {
      return 'graphql';
    }
    if (shouldInterceptAsRest(url, options)) {
      return 'rest';
    }
    return null;
  }

  // Parse GraphQL request data
  function parseGraphQLRequest(body: any) {
    try {
      const parsed = JSON.parse(body);
      let operationName = parsed.operationName || '';

      // If no operationName provided, try to extract from query
      if (!operationName && parsed.query) {
        const queryMatch = parsed.query.match(/(?:query|mutation|subscription)\s+(\w+)/i);
        if (queryMatch) {
          operationName = queryMatch[1];
        } else {
          // For unnamed queries, generate a descriptive name based on the first field
          const fieldMatch = parsed.query.match(/{\s*(\w+)/);
          if (fieldMatch) {
            operationName = `Unnamed_${fieldMatch[1]}`;
          } else {
            operationName = 'UnnamedQuery';
          }
        }
      }

      return {
        query: parsed.query || '',
        operationName: operationName,
        variables: parsed.variables || {},
      };
    } catch (e) {
      return {
        query: body,
        operationName: 'UnnamedQuery',
        variables: {},
      };
    }
  }

  // Parse REST request data
  function parseRESTRequest(url: string, options: any) {
    const method = options?.method?.toUpperCase() || 'GET';
    let body = null;

    try {
      if (options.body && typeof options.body === 'string') {
        body = JSON.parse(options.body);
      }
    } catch (e) {
      body = options.body || null;
    }

    // Extract endpoint name from URL
    const urlObj = new URL(url, window.location.origin);
    const pathParts = urlObj.pathname.split('/').filter((p) => p);

    // Generate a meaningful operation name from the endpoint
    // Skip numeric IDs and common path segments to get the resource name
    const meaningfulParts = pathParts.filter((part) => {
      // Skip numeric IDs (like /users/123)
      if (/^\d+$/.test(part)) return false;
      // Skip UUID-like strings
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part))
        return false;
      // Skip common API version prefixes
      if (/^v\d+$/i.test(part)) return false;
      // Skip 'api' prefix
      if (part.toLowerCase() === 'api') return false;
      return true;
    });

    // Get the last meaningful part as the resource name
    const resourceName =
      meaningfulParts.length > 0 ? meaningfulParts[meaningfulParts.length - 1] : 'resource';

    // Convert to title case and create operation name
    const titleCase = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    const operationName = `${method} ${titleCase(resourceName)}`;

    const endpoint =
      pathParts.length > 0 ? pathParts[pathParts.length - 1] : urlObj.pathname;

    return {
      method,
      endpoint,
      operationName,
      path: urlObj.pathname,
      queryParams: Object.fromEntries(urlObj.searchParams.entries()),
      body,
    };
  }

  // Override fetch
  (window as any).fetch = async function (url: any, options: any = {}) {
    // Skip monitoring for extension's own requests
    const runtime =
      typeof (globalThis as any).chrome !== 'undefined'
        ? (globalThis as any).chrome.runtime
        : typeof (globalThis as any).browser !== 'undefined'
          ? (globalThis as any).browser.runtime
          : null;
    if (runtime && runtime.getURL) {
      try {
        const extensionUrl = runtime.getURL('');
        if (url && url.startsWith(extensionUrl)) {
          console.log('🔧 [APILOT] Skipping extension internal request:', url);
          return originalFetch.call(this, url, options);
        }
      } catch (e) {
        // Ignore errors accessing extension API from content context
      }
    }

    // Handle Request object properly
    let actualUrl = url;
    let actualOptions = options;
    let requestBody: BodyInit | null | undefined;

    if (url instanceof Request) {
      actualUrl = url.url;
      actualOptions = {
        method: url.method,
        headers: {} as Record<string, string>,
        body: null as any,
      };

      // Extract headers from Request object
      if (url.headers) {
        for (const [key, value] of (url.headers as any).entries()) {
          actualOptions.headers[key] = value;
        }
      }

      // Clone the request to read the body
      try {
        if (url.bodyUsed) {
          console.warn('⚠️ [APILOT] Request body already consumed, cannot read');
          requestBody = null;
        } else {
          const clonedRequest = url.clone();
          requestBody = await clonedRequest.text();
          actualOptions.body = requestBody;
        }
      } catch (error) {
        console.warn('⚠️ [APILOT] Could not read request body:', error);
        requestBody = null;
      }
    } else {
      requestBody = options.body;
      actualOptions.body = requestBody;
    }

    // Convert relative URLs to absolute URLs
    let resolvedUrl = actualUrl;
    if (actualUrl && !actualUrl.startsWith('http') && !actualUrl.startsWith('//')) {
      if (actualUrl.startsWith('/')) {
        resolvedUrl = window.location.origin + actualUrl;
      } else {
        resolvedUrl = new URL(actualUrl, window.location.href).href;
      }
    }

    // Detect request type
    const requestType = detectRequestType(resolvedUrl, actualOptions);

    if (isMonitoringEnabled && requestType) {
      const requestId = generateRequestId();

      // Extract request headers
      const requestHeaders: Record<string, string> = {};
      if (actualOptions.headers) {
        if (actualOptions.headers instanceof Headers) {
          for (const [key, value] of (actualOptions.headers as any).entries()) {
            requestHeaders[key] = value;
          }
        } else if (typeof actualOptions.headers === 'object') {
          Object.assign(requestHeaders, actualOptions.headers);
        }
      }

      let payload: any;

      // Get frame context for grouping
      const frameContext = getFrameContext();

      if (requestType === 'graphql') {
        const requestData = parseGraphQLRequest(requestBody || actualOptions.body);
        payload = {
          requestId,
          requestType: 'graphql',
          url: resolvedUrl,
          operationName: requestData.operationName,
          query: requestData.query,
          variables: requestData.variables,
          requestHeaders: requestHeaders,
          timestamp: new Date().toISOString(),
          frameContext: frameContext,
        };
      } else {
        const requestData = parseRESTRequest(resolvedUrl, actualOptions);
        payload = {
          requestId,
          requestType: 'rest',
          url: resolvedUrl,
          method: requestData.method,
          operationName: requestData.operationName,
          endpoint: requestData.endpoint,
          path: requestData.path,
          queryParams: requestData.queryParams,
          body: requestData.body,
          requestHeaders: requestHeaders,
          timestamp: new Date().toISOString(),
          frameContext: frameContext,
        };
      }

      diagLog('log', `INTERCEPT ${requestType} ${(payload as any).method ?? 'GET'} ${resolvedUrl}`);

      // Notify content script about detected request
      window.postMessage({ type: 'API_REQUEST_DETECTED', payload }, pageOrigin());

      // Create a promise for rule handling
      const interceptPromise = new Promise((resolve, reject) => {
        pendingRequests.set(requestId, {
          resolve,
          reject,
          originalArgs: [url, options],
          requestType,
          startTime: Date.now(),
        });

        // Set a shorter timeout to prevent hanging (5 seconds for rule check)
        setTimeout(() => {
          if (pendingRequests.has(requestId)) {
            diagLog('warn', `TIMEOUT ${requestType} id=${requestId} — proceeding without rule check`);
            pendingRequests.delete(requestId);
            // Use try-catch to handle any network errors during the actual fetch
            originalFetch
              .call(window, url, options)
              .then((response: Response) => {
                resolve(response);
                captureResponse(requestId, response.clone(), requestType).catch(console.error);
              })
              .catch((error: Error) => {
                console.warn(
                  `⚠️ [APILOT] Fetch failed after timeout for ${requestId}:`,
                  error.message,
                );
                reject(error);
              });
          }
        }, 5000);
      });

      return interceptPromise;
    }

    // Not a monitored request, proceed normally
    return originalFetch.call(this, url, options);
  };

  // Listen for messages from content script
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !(event.data as any).type) return;

    // Handle monitoring control messages
    if ((event.data as any).type === 'START_API_MONITORING') {
      console.log('🟢 [APILOT] Resuming API monitoring');
      isMonitoringEnabled = true;
      return;
    }

    if ((event.data as any).type === 'STOP_API_MONITORING') {
      console.log('🔴 [APILOT] Stopping API monitoring');
      isMonitoringEnabled = false;
      return;
    }

    // Legacy support for GraphQL-specific stop message
    if ((event.data as any).type === 'STOP_GRAPHQL_MONITORING') {
      console.log('🔴 [APILOT] Stopping API monitoring (legacy)');
      isMonitoringEnabled = false;
      return;
    }

    // Only process valid incoming message types
    const validIncomingTypes = [
      'API_REQUEST_PROCEED',
      'APPLY_API_RULE',
      'APPLY_API_RULES',
      'GRAPHQL_REQUEST_PROCEED',
      'APPLY_GRAPHQL_RULE',
      'APPLY_GRAPHQL_RULES',
    ];
    if (!validIncomingTypes.includes((event.data as any).type)) {
      return;
    }

    console.log(`🔄 [APILOT] Received message:`, (event.data as any).type, (event.data as any).payload);

    const { requestId } = (event.data as any).payload || {};
    if (!requestId) {
      console.warn(`⚠️ [APILOT] No requestId in message:`, event.data);
      return;
    }

    if (!pendingRequests.has(requestId)) {
      console.warn(`⚠️ [APILOT] Request ${requestId} not found in pending requests`);
      return;
    }

    const { resolve, reject, originalArgs, requestType } = pendingRequests.get(requestId);
    pendingRequests.delete(requestId);

    try {
      switch ((event.data as any).type) {
        case 'API_REQUEST_PROCEED':
        case 'GRAPHQL_REQUEST_PROCEED': {
          const args = (event.data as any).payload.modifiedArgs || originalArgs;
          diagLog('log', `PROCEED ${requestType} id=${requestId}`);
          const response = await originalFetch.apply(window, args as [RequestInfo, RequestInit?]);
          diagLog('log', `RESPONSE ${requestType} id=${requestId} status=${response.status} ct=${response.headers.get('content-type') ?? '-'}`);
          resolve(response);
          captureResponse(requestId, response.clone(), requestType).catch(console.error);
          break;
        }

        case 'APPLY_API_RULE':
        case 'APPLY_GRAPHQL_RULE': {
          const rule = (event.data as any).payload.rule;
          await applyRule(rule, resolve, reject, originalArgs, requestId, requestType);
          break;
        }

        case 'APPLY_API_RULES':
        case 'APPLY_GRAPHQL_RULES': {
          const rules = (event.data as any).payload.rules;
          await applyMultipleRules(rules, resolve, reject, originalArgs, requestId, requestType);
          break;
        }

        default: {
          const defaultResponse = await originalFetch.apply(window, originalArgs as [RequestInfo, RequestInit?]);
          resolve(defaultResponse);
          captureResponse(requestId, defaultResponse.clone(), requestType).catch(console.error);
        }
      }
    } catch (error) {
      console.error('❌ [APILOT] Error handling intercepted request:', error);
      try {
        const fallbackResponse = await originalFetch.apply(window, originalArgs as [RequestInfo, RequestInit?]);
        resolve(fallbackResponse);
        captureResponse(requestId, fallbackResponse.clone(), requestType).catch(console.error);
      } catch (fallbackError) {
        reject(error);
      }
    }
  });

  function resolveArgUrlToString(url: any, options: any): string {
    if (url instanceof Request) {
      return url.url;
    }
    if (typeof url === 'string') {
      if (url && !url.startsWith('http') && !url.startsWith('//')) {
        if (url.startsWith('/')) {
          return window.location.origin + url;
        }
        try {
          return new URL(url, window.location.href).href;
        } catch (e) {
          return url;
        }
      }
      return url;
    }
    return String(url || '');
  }

  function buildRedirectTargetUrl(rule: any, sourceAbsoluteUrl: string): string | null {
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
        return (
          b.origin.replace(/\/$/, '') + '/' + filename + src.search + (src.hash || '')
        );
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
    } catch (e) {
      return base;
    }
  }

  /**
   * Proxy a fetch through the extension background to bypass CORS restrictions.
   * Used for redirect rules inside cross-origin iframes where the page's origin
   * may not be allowed by the redirect target's CORS policy.
   */
  function proxyFetchThroughBackground(targetUrl: string, method: string, headers: Record<string, string>, body?: string): Promise<Response> {
    return new Promise((resolve, reject) => {
      const proxyId = generateRequestId();
      const timeout = setTimeout(() => {
        window.removeEventListener('message', listener);
        reject(new TypeError('APILOT proxy fetch timeout'));
      }, 30000);

      function listener(event: MessageEvent) {
        if (event.source !== window) return;
        const d = (event.data as any);
        if (d?.type !== 'PROXY_REDIRECT_RESPONSE' || d?.payload?.requestId !== proxyId) return;
        clearTimeout(timeout);
        window.removeEventListener('message', listener);
        const p = d.payload;
        if (!p.success) {
          reject(new TypeError(p.error || 'Proxy fetch failed'));
          return;
        }
        resolve(new Response(p.body, {
          status: p.status,
          statusText: p.statusText,
          headers: new Headers(p.headers || {}),
        }));
      }

      window.addEventListener('message', listener);
      window.postMessage(
        { type: 'PROXY_REDIRECT_REQUEST', payload: { requestId: proxyId, url: targetUrl, method, headers, body } },
        pageOrigin(),
      );
    });
  }

  /** Build [url, init] for fetch after a redirect rule (handles string URL or Request). */
  function buildFetchArgsAfterRedirect(rule: any, originalArgs: any[], resolvedSourceUrl: string): any[] {
    const targetUrl = buildRedirectTargetUrl(rule, resolvedSourceUrl);
    if (!targetUrl) {
      return originalArgs;
    }
    const [url, options = {}] = originalArgs;

    if (url instanceof Request) {
      const req = url;
      const nextOpts = {
        method: req.method,
        headers: new Headers(req.headers),
        body: options.body != null ? options.body : null,
        mode: req.mode,
        credentials: req.credentials,
        cache: req.cache,
        redirect: req.redirect,
        referrer: req.referrer,
        referrerPolicy: req.referrerPolicy,
        integrity: req.integrity,
        keepalive: req.keepalive,
        signal: options.signal || req.signal,
      };
      return [targetUrl, nextOpts];
    }

    const nextOpts =
      typeof options === 'object' && options !== null ? { ...options } : {};
    return [targetUrl, nextOpts];
  }

  // Apply multiple rules to request
  async function applyMultipleRules(
    rules: any[],
    resolve: (value: any) => void,
    reject: (reason?: any) => void,
    originalArgs: any[],
    requestId: string,
    requestType: string,
  ) {
    console.log(`🎯 [APILOT] Applying ${rules.length} rules for ${requestType} request`);

    try {
      // Check for block rules first
      const blockRule = rules.find((rule: any) => rule.action === 'block');
      if (blockRule) {
        console.log(`🚫 [APILOT] Blocking request ${requestId} due to rule: ${blockRule.name}`);

        const errorPayload = {
          requestId,
          requestType,
          response: null,
          error: `Request blocked by rule: ${blockRule.name}`,
          status: 0,
          statusText: 'Blocked',
          headers: {},
          timestamp: new Date().toISOString(),
        };

        window.postMessage({ type: 'API_RESPONSE_CAPTURED', payload: errorPayload }, pageOrigin());
        reject(new Error(`Request blocked by APIlot rule: ${blockRule.name}`));
        return;
      }

      let argsForFetch = originalArgs;
      let redirectTargetUrl: string | null = null;
      const redirectRule = rules.find((rule: any) => rule.action === 'redirect');
      if (redirectRule) {
        const resolvedSource = resolveArgUrlToString(originalArgs[0], originalArgs[1]);
        const targetUrl = buildRedirectTargetUrl(redirectRule, resolvedSource);
        if (targetUrl) {
          argsForFetch = buildFetchArgsAfterRedirect(redirectRule, originalArgs, resolvedSource);
          redirectTargetUrl = targetUrl;
          console.log(`🔀 [APILOT] Redirect rule "${redirectRule.name}" → ${targetUrl}`);
        }
      }

      // Separate rules by type
      const delayRules = rules.filter((rule: any) => rule.action === 'delay');
      const modifyRules = rules.filter((rule: any) => rule.action === 'modify');
      const mockRules = rules.filter((rule: any) => rule.action === 'mock');

      // Apply all delay rules (sum delays)
      const totalDelay = delayRules.reduce(
        (sum: number, rule: any) => sum + (rule.delay || 1000),
        0,
      );
      if (totalDelay > 0) {
        console.log(`⏱️ [APILOT] Applying combined delay of ${totalDelay}ms`);
        await new Promise((delayResolve) => setTimeout(delayResolve, totalDelay));
      }

      // If there are mock rules, apply the first one
      if (mockRules.length > 0) {
        const mockRule = mockRules[0];
        console.log(`🎭 [APILOT] Applying mock response from rule: ${mockRule.name}`);

        const statusCode = mockRule.statusCode || 200;
        const responseHeaders = mockRule.responseHeaders || { 'Content-Type': 'application/json' };

        const mockResponse = new Response(JSON.stringify(mockRule.mockResponse), {
          status: statusCode,
          statusText: getStatusText(statusCode),
          headers: new Headers(responseHeaders),
        });

        await captureResponse(requestId, mockResponse.clone(), requestType);
        resolve(mockResponse);
        return;
      }

      // Apply all modify rules
      let finalArgs = argsForFetch;
      if (modifyRules.length > 0) {
        console.log(`🔧 [APILOT] Applying modifications from ${modifyRules.length} rule(s)`);

        const combinedModifications = modifyRules.reduce(
          (combined: any, rule: any) => {
            if (rule.modifications) {
              if (rule.modifications.variables) {
                combined.variables = { ...combined.variables, ...rule.modifications.variables };
              }
              if (rule.modifications.query) {
                combined.query = rule.modifications.query;
              }
              if (rule.modifications.operationName) {
                combined.operationName = rule.modifications.operationName;
              }
              if (rule.modifications.body) {
                combined.body = { ...combined.body, ...rule.modifications.body };
              }
            }
            return combined;
          },
          { variables: {}, body: {} },
        );

        const [url, options] = argsForFetch;
        const modifiedOptions = { ...options };

        if (options.body) {
          try {
            const bodyData = JSON.parse(options.body);

            if (requestType === 'graphql') {
              if (Object.keys(combinedModifications.variables).length > 0) {
                bodyData.variables = {
                  ...bodyData.variables,
                  ...combinedModifications.variables,
                };
              }
              if (combinedModifications.query) {
                bodyData.query = combinedModifications.query;
              }
              if (combinedModifications.operationName) {
                bodyData.operationName = combinedModifications.operationName;
              }
            } else {
              // REST API body modification
              Object.assign(bodyData, combinedModifications.body);
            }

            modifiedOptions.body = JSON.stringify(bodyData);
          } catch (error) {
            console.error('Failed to apply modifications:', error);
          }
        }

        finalArgs = [url, modifiedOptions];
      }

      // Execute the request — use background proxy for redirect in iframes to avoid CORS
      let response: Response;
      if (redirectTargetUrl && getFrameContext().isIframe) {
        const [, opts = {}] = finalArgs as [unknown, RequestInit?];
        const method = (opts?.method || 'GET').toString().toUpperCase();
        const hdrs: Record<string, string> = {};
        if (opts?.headers) {
          new Headers(opts.headers as HeadersInit).forEach((v, k) => { hdrs[k] = v; });
        }
        const bodyStr = opts?.body != null ? String(opts.body) : undefined;
        response = await proxyFetchThroughBackground(redirectTargetUrl, method, hdrs, bodyStr);
      } else {
        response = await originalFetch.apply(window, finalArgs as [RequestInfo, RequestInit?]);
      }
      resolve(response);
      captureResponse(requestId, response.clone(), requestType).catch(console.error);
    } catch (error) {
      console.error('Error applying multiple rules:', error);
      reject(error);
    }
  }

  // Apply single rule to request
  async function applyRule(
    rule: any,
    resolve: (value: any) => void,
    reject: (reason?: any) => void,
    originalArgs: any[],
    requestId: string,
    requestType: string,
  ) {
    try {
      switch (rule.action) {
        case 'delay': {
          console.log(`⏱️ [APILOT] Applying ${rule.delay || 1000}ms delay`);
          await new Promise((delayResolve) =>
            setTimeout(delayResolve, rule.delay || 1000),
          );
          const delayedResponse = await originalFetch.apply(window, originalArgs as [RequestInfo, RequestInit?]);
          resolve(delayedResponse);
          captureResponse(requestId, delayedResponse.clone(), requestType).catch(console.error);
          break;
        }

        case 'mock': {
          console.log(`🎭 [APILOT] Applying mock response`);
          const statusCode = rule.statusCode || 200;
          const responseHeaders = rule.responseHeaders || { 'Content-Type': 'application/json' };

          const mockResponse = new Response(JSON.stringify(rule.mockResponse), {
            status: statusCode,
            statusText: getStatusText(statusCode),
            headers: new Headers(responseHeaders),
          });

          resolve(mockResponse);
          captureResponse(requestId, mockResponse.clone(), requestType).catch(console.error);
          break;
        }

        case 'modify': {
          const [url, options] = originalArgs;
          const modifiedOptions = { ...options };

          if (rule.modifications && options.body) {
            try {
              const bodyData = JSON.parse(options.body);

              if (requestType === 'graphql') {
                if (rule.modifications.variables) {
                  bodyData.variables = { ...bodyData.variables, ...rule.modifications.variables };
                }
                if (rule.modifications.query) {
                  bodyData.query = rule.modifications.query;
                }
                if (rule.modifications.operationName) {
                  bodyData.operationName = rule.modifications.operationName;
                }
              } else {
                // REST API modifications
                if (rule.modifications.body) {
                  Object.assign(bodyData, rule.modifications.body);
                }
              }

              modifiedOptions.body = JSON.stringify(bodyData);
            } catch (error) {
              console.error('Failed to modify request:', error);
            }
          }

          const modifiedResponse = await originalFetch.call(window, url, modifiedOptions);
          resolve(modifiedResponse);
          captureResponse(requestId, modifiedResponse.clone(), requestType).catch(console.error);
          break;
        }

        case 'block': {
          console.log(`🚫 [APILOT] Blocking request ${requestId}`);

          const errorPayload = {
            requestId,
            requestType,
            response: null,
            error: `Request blocked by rule: ${rule.name}`,
            status: 0,
            statusText: 'Blocked',
            headers: {},
            timestamp: new Date().toISOString(),
          };

          window.postMessage({ type: 'API_RESPONSE_CAPTURED', payload: errorPayload }, pageOrigin());
          reject(new Error(`Request blocked by APIlot rule: ${rule.name}`));
          break;
        }

        case 'redirect': {
          const resolvedSource = resolveArgUrlToString(originalArgs[0], originalArgs[1]);
          const targetUrl = buildRedirectTargetUrl(rule, resolvedSource);
          if (!targetUrl) {
            const fallbackResponse = await originalFetch.apply(window, originalArgs as [RequestInfo, RequestInit?]);
            resolve(fallbackResponse);
            captureResponse(requestId, fallbackResponse.clone(), requestType).catch(console.error);
            break;
          }
          const nextArgs = buildFetchArgsAfterRedirect(rule, originalArgs, resolvedSource);
          console.log(
            `🔀 [APILOT] Redirect rule "${rule.name}" ${resolvedSource} → ${targetUrl}`,
          );
          let redirectResponse: Response;
          if (getFrameContext().isIframe) {
            // Inside an iframe the fetch carries the iframe's origin which may be
            // rejected by the redirect target's CORS policy. Route through the
            // background script which has <all_urls> and is not CORS-restricted.
            const [, opts = {}] = nextArgs as [unknown, RequestInit?];
            const method = (opts?.method || 'GET').toString().toUpperCase();
            const hdrs: Record<string, string> = {};
            if (opts?.headers) {
              new Headers(opts.headers as HeadersInit).forEach((v, k) => { hdrs[k] = v; });
            }
            const bodyStr = opts?.body != null ? String(opts.body) : undefined;
            redirectResponse = await proxyFetchThroughBackground(targetUrl, method, hdrs, bodyStr);
          } else {
            redirectResponse = await originalFetch.apply(window, nextArgs as [RequestInfo, RequestInit?]);
          }
          resolve(redirectResponse);
          captureResponse(requestId, redirectResponse.clone(), requestType).catch(console.error);
          break;
        }

        default: {
          const defaultResponse = await originalFetch.apply(window, originalArgs as [RequestInfo, RequestInit?]);
          resolve(defaultResponse);
          captureResponse(requestId, defaultResponse.clone(), requestType).catch(console.error);
        }
      }
    } catch (error) {
      console.error('Error applying rule:', error);
      reject(error);
    }
  }

  // Helper function to get status text
  function getStatusText(statusCode: number): string {
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };
    return statusTexts[statusCode] || 'Unknown';
  }

  // Override XMLHttpRequest for better coverage.
  // We keep a reference to the ORIGINAL addEventListener so our passive observers
  // always bypass any future wrapper — including our own send() override.
  // We do NOT override addEventListener on the prototype, which would wrap every
  // load/error listener the page registers and could silently break callbacks if
  // our wrapper throws (e.g. anti-bot–protected AES key endpoints).

  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalXHRAddEventListener = XMLHttpRequest.prototype.addEventListener;

  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, async?: boolean, user?: string | null, password?: string | null) {
    (this as any)._apilot_method = method;
    (this as any)._apilot_url = url;
    (this as any)._apilot_headers = {};
    return originalXHROpen.call(this, method, url, async as boolean, user, password);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (!(this as any)._apilot_headers) (this as any)._apilot_headers = {};
    (this as any)._apilot_headers[name] = value;
    return originalXHRSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (data?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this as any;

    if (isMonitoringEnabled && xhr._apilot_url) {
      const options = {
        method: xhr._apilot_method || 'GET',
        body: data,
        headers: xhr._apilot_headers || {},
      };

      let absoluteUrl = xhr._apilot_url;
      try {
        if (xhr._apilot_url && !xhr._apilot_url.startsWith('http') && !xhr._apilot_url.startsWith('//')) {
          absoluteUrl = xhr._apilot_url.startsWith('/')
            ? window.location.origin + xhr._apilot_url
            : new URL(xhr._apilot_url, window.location.href).href;
        }
      } catch (e) {
        console.warn('[APILOT] Could not parse XHR URL:', xhr._apilot_url);
      }

      const requestType = detectRequestType(absoluteUrl, options);

      if (requestType) {
        const requestId = generateRequestId();
        xhr._apilot_requestId = requestId;
        xhr._apilot_requestType = requestType;

        const frameContext = getFrameContext();
        let payload: any;

        if (requestType === 'graphql') {
          const requestData = parseGraphQLRequest(data);
          payload = {
            requestId,
            requestType: 'graphql',
            url: absoluteUrl,
            operationName: requestData.operationName,
            query: requestData.query,
            variables: requestData.variables,
            requestHeaders: xhr._apilot_headers || {},
            timestamp: new Date().toISOString(),
            frameContext,
          };
        } else {
          const requestData = parseRESTRequest(absoluteUrl, options);
          payload = {
            requestId,
            requestType: 'rest',
            url: absoluteUrl,
            method: requestData.method,
            operationName: requestData.operationName,
            endpoint: requestData.endpoint,
            path: requestData.path,
            queryParams: requestData.queryParams,
            body: requestData.body,
            requestHeaders: xhr._apilot_headers || {},
            timestamp: new Date().toISOString(),
            frameContext,
          };
        }

        window.postMessage({ type: 'API_REQUEST_DETECTED', payload }, pageOrigin());

        // Passive response observer — attached via the ORIGINAL addEventListener so
        // we never replace or wrap any handler the page already registered.
        // This means our capture can't throw and block a player's load callback.
        const captureXHRResponse = function () {
          if (xhr._apilot_responseCaptured) return;
          xhr._apilot_responseCaptured = true;

          // responseType 'arraybuffer'/'blob'/'document' throw InvalidStateError when
          // accessing responseText — only read it for the two text-compatible types.
          let responseData: any = null;
          let responseTextBytes = 0;
          try {
            if (xhr.responseType === '' || xhr.responseType === 'text') {
              const text = xhr.responseText || '';
              if (text) {
                responseTextBytes = new TextEncoder().encode(text).length;
                try { responseData = JSON.parse(text); } catch (_e) { responseData = text; }
              }
            } else if (xhr.responseType === 'json') {
              responseData = xhr.response;
            }
            // arraybuffer / blob / document: leave responseData null
          } catch (_e) { /* guard against any responseType access error */ }

          const responseHeaders: Record<string, string> = {};
          try {
            const headerStr = xhr.getAllResponseHeaders();
            if (headerStr) {
              headerStr.split('\r\n').forEach((line: string) => {
                const idx = line.indexOf(': ');
                if (idx !== -1) responseHeaders[line.slice(0, idx)] = line.slice(idx + 2);
              });
            }
          } catch (_e) { /* ignore */ }

          const xhrContentLength = parseInt(responseHeaders['content-length'] || responseHeaders['Content-Length'] || '0', 10);
          const xhrTransferSize = xhrContentLength || responseTextBytes;

          try {
            window.postMessage({
              type: 'API_RESPONSE_CAPTURED',
              payload: {
                requestId,
                requestType,
                response: responseData,
                status: xhr.status,
                statusText: xhr.statusText,
                headers: responseHeaders,
                timestamp: new Date().toISOString(),
                transferSize: xhrTransferSize || undefined,
              },
            }, pageOrigin());
          } catch (_e) { /* ignore postMessage errors */ }
        };

        const captureXHRError = function (label: string) {
          if (xhr._apilot_responseCaptured) return;
          xhr._apilot_responseCaptured = true;
          window.postMessage({
            type: 'API_RESPONSE_CAPTURED',
            payload: {
              requestId,
              requestType,
              response: null,
              error: label,
              status: 0,
              statusText: label,
              headers: {},
              timestamp: new Date().toISOString(),
            },
          }, pageOrigin());
        };

        originalXHRAddEventListener.call(xhr, 'readystatechange', function () {
          if (xhr.readyState === 4) captureXHRResponse();
        });
        originalXHRAddEventListener.call(xhr, 'error', function () { captureXHRError('Network error'); });
        originalXHRAddEventListener.call(xhr, 'timeout', function () { captureXHRError('Timeout'); });
        originalXHRAddEventListener.call(xhr, 'abort', function () { captureXHRError('Aborted'); });
      }
    }

    return originalXHRSend.call(this, data);
  };

  // Log frame context
  const frameInfo = {
    isTopFrame: window === window.top,
    frameUrl: window.location.href,
    parentUrl: window !== window.top ? document.referrer : 'N/A',
  };

  console.log(
    '✅ [APILOT] Hooks installed (GraphQL + REST, fetch + XHR). Monitoring starts when the panel enables it.',
    frameInfo,
  );

  // Mark this frame as the active interceptor.
  // Accessing window.top from a cross-origin iframe throws DOMException — guard it.
  try {
    if (!(window.top as any).__APILOT_ACTIVE_FRAME__) {
      (window.top as any).__APILOT_ACTIVE_FRAME__ = window.location.href;
      console.log('🎯 [APILOT] This frame will handle API interception:', window.location.href);
    }
  } catch {
    // Cross-origin iframe: cannot access window.top properties — each frame runs independently
  }
});
