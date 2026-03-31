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
  let isMonitoringEnabled = true;

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

  // Capture response data and send to content script
  async function captureResponse(requestId: string, response: Response, requestType = 'graphql') {
    console.log(`📥 [APILOT] Capturing ${requestType} response for request ${requestId}`, {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
    });

    try {
      // Clone the response to read it without consuming the original
      const responseClone = response.clone();
      const responseText = await responseClone.text();
      let responseData: any;

      try {
        responseData = JSON.parse(responseText);
        console.log(`✅ [APILOT] Response data parsed for ${requestId}:`, responseData);
      } catch (parseError) {
        console.log(`⚠️ [APILOT] Response is not JSON for ${requestId}, treating as text`);
        responseData = responseText;
      }

      const payload = {
        requestId,
        requestType,
        response: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        timestamp: new Date().toISOString(),
      };

      window.postMessage({ type: 'API_RESPONSE_CAPTURED', payload }, '*');
      console.log(`📤 [APILOT] Response message sent for ${requestId}`, payload);
    } catch (error: any) {
      console.error(`❌ [APILOT] Failed to capture response for ${requestId}:`, {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });

      const errorPayload = {
        requestId,
        requestType,
        response: null,
        error: `${error.name}: ${error.message}`,
        status: (response as any)?.status || 0,
        statusText: (response as any)?.statusText || 'Unknown',
        timestamp: new Date().toISOString(),
      };

      window.postMessage({ type: 'API_RESPONSE_CAPTURED', payload: errorPayload }, '*');
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
    if (!nc.useFilters) {
      return true;
    }

    const urlLower = policyUrl.toLowerCase();
    const urlPath = urlLower.split('?')[0];
    if (
      nc.skipStaticExtensions &&
      NETWORK_CAPTURE_STATIC_EXTENSIONS.some((ext) => urlPath.endsWith(ext))
    ) {
      return false;
    }

    const exclude = (nc.excludeSubstrings || []).map((s: string) => String(s).toLowerCase());
    if (exclude.some((sub: string) => sub && urlLower.includes(sub))) {
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
    let requestBody = options.body;

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

      console.log(`📋 [APILOT] ${requestType.toUpperCase()} request detected:`, payload);

      // Notify content script about detected request
      window.postMessage({ type: 'API_REQUEST_DETECTED', payload }, '*');

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
            console.log(
              `⏰ [APILOT] Request ${requestId} timed out waiting for rule check, proceeding normally`,
            );
            pendingRequests.delete(requestId);
            // Use try-catch to handle any network errors during the actual fetch
            originalFetch
              .call(window, url, options)
              .then((response: Response) => {
                captureResponse(requestId, response.clone(), requestType).catch(console.error);
                resolve(response);
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
          const response = await originalFetch.apply(window, args as [RequestInfo, RequestInit?]);
          await captureResponse(requestId, response.clone(), requestType);
          resolve(response);
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
          await captureResponse(requestId, defaultResponse.clone(), requestType);
          resolve(defaultResponse);
        }
      }
    } catch (error) {
      console.error('❌ [APILOT] Error handling intercepted request:', error);
      try {
        const fallbackResponse = await originalFetch.apply(window, originalArgs as [RequestInfo, RequestInit?]);
        await captureResponse(requestId, fallbackResponse.clone(), requestType);
        resolve(fallbackResponse);
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

        window.postMessage({ type: 'API_RESPONSE_CAPTURED', payload: errorPayload }, '*');
        reject(new Error(`Request blocked by APIlot rule: ${blockRule.name}`));
        return;
      }

      let argsForFetch = originalArgs;
      const redirectRule = rules.find((rule: any) => rule.action === 'redirect');
      if (redirectRule) {
        const resolvedSource = resolveArgUrlToString(originalArgs[0], originalArgs[1]);
        const targetUrl = buildRedirectTargetUrl(redirectRule, resolvedSource);
        if (targetUrl) {
          argsForFetch = buildFetchArgsAfterRedirect(redirectRule, originalArgs, resolvedSource);
          console.log(`🔀 [APILOT] Redirect rule "${redirectRule.name}" → ${targetUrl}`);
        }
      }

      // Separate rules by type
      const delayRules = rules.filter((rule: any) => rule.action === 'delay');
      const modifyRules = rules.filter((rule: any) => rule.action === 'modify');
      const mockRules = rules.filter((rule: any) => rule.action === 'mock');

      // Apply all delay rules (sum delays)
      const totalDelay = delayRules.reduce(
        (sum: number, rule: any) => sum + (rule.delayMs || 1000),
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

      // Execute the request
      const response = await originalFetch.apply(window, finalArgs as [RequestInfo, RequestInit?]);
      await captureResponse(requestId, response.clone(), requestType);
      resolve(response);
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
          console.log(`⏱️ [APILOT] Applying ${rule.delayMs || 1000}ms delay`);
          await new Promise((delayResolve) =>
            setTimeout(delayResolve, rule.delayMs || 1000),
          );
          const delayedResponse = await originalFetch.apply(window, originalArgs as [RequestInfo, RequestInit?]);
          await captureResponse(requestId, delayedResponse.clone(), requestType);
          resolve(delayedResponse);
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

          await captureResponse(requestId, mockResponse.clone(), requestType);
          resolve(mockResponse);
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
          await captureResponse(requestId, modifiedResponse.clone(), requestType);
          resolve(modifiedResponse);
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

          window.postMessage({ type: 'API_RESPONSE_CAPTURED', payload: errorPayload }, '*');
          reject(new Error(`Request blocked by APIlot rule: ${rule.name}`));
          break;
        }

        case 'redirect': {
          const resolvedSource = resolveArgUrlToString(originalArgs[0], originalArgs[1]);
          const targetUrl = buildRedirectTargetUrl(rule, resolvedSource);
          if (!targetUrl) {
            const fallbackResponse = await originalFetch.apply(window, originalArgs as [RequestInfo, RequestInit?]);
            await captureResponse(requestId, fallbackResponse.clone(), requestType);
            resolve(fallbackResponse);
            break;
          }
          const nextArgs = buildFetchArgsAfterRedirect(rule, originalArgs, resolvedSource);
          console.log(
            `🔀 [APILOT] Redirect rule "${rule.name}" ${resolvedSource} → ${targetUrl}`,
          );
          const redirectResponse = await originalFetch.apply(window, nextArgs as [RequestInfo, RequestInit?]);
          await captureResponse(requestId, redirectResponse.clone(), requestType);
          resolve(redirectResponse);
          break;
        }

        default: {
          const defaultResponse = await originalFetch.apply(window, originalArgs as [RequestInfo, RequestInit?]);
          await captureResponse(requestId, defaultResponse.clone(), requestType);
          resolve(defaultResponse);
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

  // Override XMLHttpRequest for better coverage
  console.log('🔧 [APILOT] Installing XMLHttpRequest overrides...');

  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, async?: boolean, user?: string | null, password?: string | null) {
    (this as any)._apilot_method = method;
    (this as any)._apilot_url = url;
    (this as any)._apilot_headers = {};
    (this as any)._apilot_async = async !== false; // Default to true
    return originalXHROpen.call(this, method, url, async as boolean, user, password);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (!(this as any)._apilot_headers) (this as any)._apilot_headers = {};
    (this as any)._apilot_headers[name] = value;
    return originalXHRSetRequestHeader.call(this, name, value);
  };

  // Override addEventListener to capture events added before send()
  const originalXHRAddEventListener = XMLHttpRequest.prototype.addEventListener;
  XMLHttpRequest.prototype.addEventListener = function (this: XMLHttpRequest, type: string, listener: any, options?: any) {
    const xhr = this as any;

    // Wrap load/loadend/error listeners to ensure we capture the response
    if (type === 'load' || type === 'loadend') {
      const wrappedListener = (_event: Event) => {
        // Trigger our response capture if this XHR was being monitored
        if (xhr._apilot_requestId && !xhr._apilot_responseCaptured && xhr._apilot_handleResponse) {
          xhr._apilot_handleResponse();
        }
        listener(_event);
      };
      return originalXHRAddEventListener.call(this, type, wrappedListener, options);
    }

    if (type === 'error') {
      const wrappedListener = (_event: Event) => {
        if (xhr._apilot_requestId && !xhr._apilot_responseCaptured) {
          xhr._apilot_responseCaptured = true;
          window.postMessage(
            {
              type: 'API_RESPONSE_CAPTURED',
              payload: {
                requestId: xhr._apilot_requestId,
                requestType: xhr._apilot_requestType,
                response: null,
                error: 'Network error',
                status: 0,
                statusText: 'Error',
                headers: {},
                timestamp: new Date().toISOString(),
              },
            },
            '*',
          );
        }
        listener(_event);
      };
      return originalXHRAddEventListener.call(this, type, wrappedListener, options);
    }

    return originalXHRAddEventListener.call(this, type, listener, options);
  } as any;

  XMLHttpRequest.prototype.send = function (data?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this as any;

    if (isMonitoringEnabled && xhr._apilot_url) {
      const options = {
        method: xhr._apilot_method || 'GET',
        body: data,
        headers: xhr._apilot_headers || {},
      };

      // Convert relative URL to absolute URL
      let absoluteUrl = xhr._apilot_url;
      try {
        if (
          xhr._apilot_url &&
          !xhr._apilot_url.startsWith('http') &&
          !xhr._apilot_url.startsWith('//')
        ) {
          if (xhr._apilot_url.startsWith('/')) {
            absoluteUrl = window.location.origin + xhr._apilot_url;
          } else {
            absoluteUrl = new URL(xhr._apilot_url, window.location.href).href;
          }
        }
      } catch (e) {
        console.warn('[APILOT] Could not parse XHR URL:', xhr._apilot_url);
        absoluteUrl = xhr._apilot_url;
      }

      const requestType = detectRequestType(absoluteUrl, options);

      if (requestType) {
        const requestId = generateRequestId();
        xhr._apilot_requestId = requestId;
        xhr._apilot_requestType = requestType;
        xhr._apilot_startTime = Date.now();

        // Get frame context for grouping
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
            frameContext: frameContext,
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
            frameContext: frameContext,
          };
        }

        console.log(`📋 [APILOT] XHR ${requestType.toUpperCase()} request detected:`, payload);

        window.postMessage({ type: 'API_REQUEST_DETECTED', payload }, '*');

        // Create response handler function and store on xhr for addEventListener wrapper
        const handleXHRResponse = function () {
          if (xhr._apilot_responseCaptured) return;
          xhr._apilot_responseCaptured = true;

          let responseData: any;
          try {
            if (xhr.responseType === '' || xhr.responseType === 'text') {
              responseData = xhr.responseText ? JSON.parse(xhr.responseText) : null;
            } else if (xhr.responseType === 'json') {
              responseData = xhr.response;
            } else {
              responseData = xhr.response;
            }
          } catch (e) {
            responseData = xhr.responseText || xhr.response;
          }

          // Get response headers
          const responseHeaders: Record<string, string> = {};
          try {
            const headerStr = xhr.getAllResponseHeaders();
            if (headerStr) {
              headerStr.split('\r\n').forEach((line: string) => {
                const parts = line.split(': ');
                if (parts.length === 2) {
                  responseHeaders[parts[0]] = parts[1];
                }
              });
            }
          } catch (e) {
            // Ignore header parsing errors
          }

          console.log(`📥 [APILOT] XHR response captured for ${requestId}:`, xhr.status);

          window.postMessage(
            {
              type: 'API_RESPONSE_CAPTURED',
              payload: {
                requestId,
                requestType,
                response: responseData,
                status: xhr.status,
                statusText: xhr.statusText,
                headers: responseHeaders,
                timestamp: new Date().toISOString(),
              },
            },
            '*',
          );
        };

        // Store the handler on the xhr object so addEventListener wrapper can access it
        xhr._apilot_handleResponse = handleXHRResponse;

        // Handle response via multiple event types for better coverage
        const originalOnReadyStateChange = xhr.onreadystatechange;
        const originalOnLoad = xhr.onload;
        const originalOnError = xhr.onerror;
        const originalOnTimeout = xhr.ontimeout;

        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            handleXHRResponse();
          }
          if (originalOnReadyStateChange) {
            return originalOnReadyStateChange.apply(this, arguments);
          }
        };

        xhr.onload = function () {
          handleXHRResponse();
          if (originalOnLoad) {
            return originalOnLoad.apply(this, arguments);
          }
        };

        xhr.onerror = function () {
          if (!xhr._apilot_responseCaptured) {
            xhr._apilot_responseCaptured = true;
            window.postMessage(
              {
                type: 'API_RESPONSE_CAPTURED',
                payload: {
                  requestId,
                  requestType,
                  response: null,
                  error: 'Network error',
                  status: 0,
                  statusText: 'Error',
                  headers: {},
                  timestamp: new Date().toISOString(),
                },
              },
              '*',
            );
          }
          if (originalOnError) {
            return originalOnError.apply(this, arguments);
          }
        };

        xhr.ontimeout = function () {
          if (!xhr._apilot_responseCaptured) {
            xhr._apilot_responseCaptured = true;
            window.postMessage(
              {
                type: 'API_RESPONSE_CAPTURED',
                payload: {
                  requestId,
                  requestType,
                  response: null,
                  error: 'Request timeout',
                  status: 0,
                  statusText: 'Timeout',
                  headers: {},
                  timestamp: new Date().toISOString(),
                },
              },
              '*',
            );
          }
          if (originalOnTimeout) {
            return originalOnTimeout.apply(this, arguments);
          }
        };

        // Also listen via addEventListener for libraries that use it
        xhr.addEventListener('load', handleXHRResponse);
        xhr.addEventListener('error', function () {
          if (!xhr._apilot_responseCaptured) {
            xhr._apilot_responseCaptured = true;
            window.postMessage(
              {
                type: 'API_RESPONSE_CAPTURED',
                payload: {
                  requestId,
                  requestType,
                  response: null,
                  error: 'Network error',
                  status: 0,
                  statusText: 'Error',
                  headers: {},
                  timestamp: new Date().toISOString(),
                },
              },
              '*',
            );
          }
        });
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
    '✅ [APILOT] API request interception active (GraphQL + REST, fetch + XHR)',
    frameInfo,
  );

  // Mark this frame as the active interceptor
  if (!(window.top as any).__APILOT_ACTIVE_FRAME__) {
    (window.top as any).__APILOT_ACTIVE_FRAME__ = window.location.href;
    console.log('🎯 [APILOT] This frame will handle API interception:', window.location.href);
  }
});
