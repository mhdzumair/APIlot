// Injected script for APIlot - Supports both GraphQL and REST APIs
(function() {
  'use strict';

  // Prevent multiple injections from interfering with each other
  if (window.__APILOT_INJECTED__) {
    console.log('🔄 [APILOT] Script already injected in this context, skipping');
    return;
  }
  window.__APILOT_INJECTED__ = true;

  const originalFetch = window.fetch;
  const pendingRequests = new Map();
  let isMonitoringEnabled = true;
  let restApiPatterns = ['/api/', '/v1/', '/v2/', '/v3/', '/rest/', '/services/'];

  // Generate unique request IDs
  function generateRequestId() {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Get frame context information
  function getFrameContext() {
    return {
      isTopFrame: window === window.top,
      isIframe: window !== window.top,
      frameUrl: window.location.href,
      frameName: window.name || null,
      parentOrigin: window !== window.top ? (document.referrer ? new URL(document.referrer).origin : 'unknown') : null
    };
  }

  // Capture response data and send to content script
  async function captureResponse(requestId, response, requestType = 'graphql') {
    console.log(`📥 [APILOT] Capturing ${requestType} response for request ${requestId}`, {
      status: response.status,
      statusText: response.statusText,
      url: response.url
    });

    try {
      // Clone the response to read it without consuming the original
      const responseClone = response.clone();
      const responseText = await responseClone.text();
      let responseData;

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
        timestamp: new Date().toISOString()
      };

      window.postMessage({
        type: 'API_RESPONSE_CAPTURED',
        payload
      }, '*');

      console.log(`📤 [APILOT] Response message sent for ${requestId}`, payload);
    } catch (error) {
      console.error(`❌ [APILOT] Failed to capture response for ${requestId}:`, {
        message: error.message,
        name: error.name,
        stack: error.stack
      });

      const errorPayload = {
        requestId,
        requestType,
        response: null,
        error: `${error.name}: ${error.message}`,
        status: response?.status || 0,
        statusText: response?.statusText || 'Unknown',
        timestamp: new Date().toISOString()
      };

      window.postMessage({
        type: 'API_RESPONSE_CAPTURED',
        payload: errorPayload
      }, '*');

      console.log(`📤 [APILOT] Error response message sent for ${requestId}`, errorPayload);
    }
  }

  // Check if a request contains GraphQL
  function isGraphQLRequest(url, options) {
    const actualUrl = url;
    const actualOptions = options || {};
    
    // Only process POST requests for GraphQL
    const method = actualOptions?.method?.toUpperCase();
    if (!actualOptions || method !== 'POST') {
      return false;
    }

    // Check for common GraphQL URL patterns
    const graphqlUrlPatterns = ['/graphql', '/api/graphql', '/query', '/api/query', '/graphql/proxy', 'graphql/proxy'];
    const hasGraphQLUrl = graphqlUrlPatterns.some(pattern => actualUrl.includes(pattern));

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
        hasGraphQLContent = actualOptions.body.includes('query') || actualOptions.body.includes('mutation') || actualOptions.body.includes('subscription');
      }
    }

    // Check Content-Type header for GraphQL
    const contentType = actualOptions.headers?.['content-type'] || actualOptions.headers?.['Content-Type'] || '';
    const hasGraphQLContentType = contentType.includes('application/json') || contentType.includes('application/graphql');

    // GraphQL detection logic
    const isGraphQL = (hasGraphQLContent && (hasGraphQLUrl || hasGraphQLContentType)) ||
                      (hasGraphQLUrl && hasGraphQLContentType && !actualOptions.body);

    return isGraphQL;
  }

  // Check if a request is a REST API request
  function isRESTRequest(url, options) {
    const actualUrl = url || '';
    const actualOptions = options || {};
    const method = actualOptions?.method?.toUpperCase() || 'GET';
    
    // Skip if it's a GraphQL request
    if (isGraphQLRequest(url, options)) {
      return false;
    }

    // Skip non-HTTP requests (but allow relative URLs)
    if (actualUrl && !actualUrl.startsWith('http://') && !actualUrl.startsWith('https://') && !actualUrl.startsWith('/') && !actualUrl.startsWith('./')) {
      // Check if it's a relative URL without leading slash
      if (!actualUrl.includes('://') && !actualUrl.startsWith('data:') && !actualUrl.startsWith('blob:')) {
        // Allow relative URLs
      } else {
        return false;
      }
    }

    // Skip static resources
    const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map', '.html', '.htm'];
    const urlPath = actualUrl.split('?')[0].toLowerCase();
    if (staticExtensions.some(ext => urlPath.endsWith(ext))) {
      return false;
    }

    // Skip browser internal requests
    if (actualUrl.startsWith('chrome-extension://') || actualUrl.startsWith('moz-extension://') || actualUrl.startsWith('chrome://') || actualUrl.startsWith('about:')) {
      return false;
    }

    // Skip data and blob URLs
    if (actualUrl.startsWith('data:') || actualUrl.startsWith('blob:')) {
      return false;
    }

    // Check for common REST API patterns
    const hasRestPattern = restApiPatterns.some(pattern => actualUrl.toLowerCase().includes(pattern));
    
    // Check Content-Type for JSON (common in REST APIs)
    const contentType = actualOptions.headers?.['content-type'] || actualOptions.headers?.['Content-Type'] || '';
    const acceptHeader = actualOptions.headers?.['accept'] || actualOptions.headers?.['Accept'] || '';
    const hasJsonContentType = contentType.includes('application/json') || acceptHeader.includes('application/json');

    // Check if it looks like an API endpoint (contains common API path segments)
    const apiPathPatterns = ['/api', '/v1', '/v2', '/v3', '/rest', '/services', '/data', '/ajax', '/backend', '/rpc'];
    const hasApiPath = apiPathPatterns.some(pattern => actualUrl.toLowerCase().includes(pattern));

    // Check if URL looks like a REST resource (ends with ID or resource name)
    const urlParts = actualUrl.split('?')[0].split('/').filter(p => p);
    const lastPart = urlParts[urlParts.length - 1] || '';
    const looksLikeResource = lastPart && !lastPart.includes('.') && lastPart.length > 0;

    // REST detection: 
    // 1. Has REST URL pattern
    // 2. Has JSON content type with data methods
    // 3. Has API path pattern
    // 4. POST/PUT/PATCH/DELETE with no file extension (likely API call)
    const isDataMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const isRest = hasRestPattern || 
                   (hasJsonContentType && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) ||
                   hasApiPath ||
                   (isDataMethod && looksLikeResource);

    return isRest;
  }

  // Detect request type
  function detectRequestType(url, options) {
    if (isGraphQLRequest(url, options)) {
      return 'graphql';
    }
    if (isRESTRequest(url, options)) {
      return 'rest';
    }
    return null;
  }

  // Parse GraphQL request data
  function parseGraphQLRequest(body) {
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
        variables: parsed.variables || {}
      };
    } catch (e) {
      return {
        query: body,
        operationName: 'UnnamedQuery',
        variables: {}
      };
    }
  }

  // Parse REST request data
  function parseRESTRequest(url, options) {
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
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    
    // Generate a meaningful operation name from the endpoint
    // Skip numeric IDs and common path segments to get the resource name
    const meaningfulParts = pathParts.filter(part => {
      // Skip numeric IDs (like /users/123)
      if (/^\d+$/.test(part)) return false;
      // Skip UUID-like strings
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) return false;
      // Skip common API version prefixes
      if (/^v\d+$/i.test(part)) return false;
      // Skip 'api' prefix
      if (part.toLowerCase() === 'api') return false;
      return true;
    });
    
    // Get the last meaningful part as the resource name
    const resourceName = meaningfulParts.length > 0 
      ? meaningfulParts[meaningfulParts.length - 1] 
      : 'resource';
    
    // Convert to title case and create operation name
    const titleCase = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    const operationName = `${method} ${titleCase(resourceName)}`;
    
    const endpoint = pathParts.length > 0 ? pathParts[pathParts.length - 1] : urlObj.pathname;

    return {
      method,
      endpoint,
      operationName,
      path: urlObj.pathname,
      queryParams: Object.fromEntries(urlObj.searchParams.entries()),
      body
    };
  }

  // Override fetch
  window.fetch = async function(url, options = {}) {
    // Skip monitoring for extension's own requests
    const runtime = typeof chrome !== 'undefined' ? chrome.runtime : 
                   typeof browser !== 'undefined' ? browser.runtime : null;
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
        headers: {},
        body: null
      };
      
      // Extract headers from Request object
      if (url.headers) {
        for (const [key, value] of url.headers.entries()) {
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
      const requestHeaders = {};
      if (actualOptions.headers) {
        if (actualOptions.headers instanceof Headers) {
          for (const [key, value] of actualOptions.headers.entries()) {
            requestHeaders[key] = value;
          }
        } else if (typeof actualOptions.headers === 'object') {
          Object.assign(requestHeaders, actualOptions.headers);
        }
      }

      let payload;
      
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
          frameContext: frameContext
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
          frameContext: frameContext
        };
      }

      console.log(`📋 [APILOT] ${requestType.toUpperCase()} request detected:`, payload);

      // Notify content script about detected request
      window.postMessage({
        type: 'API_REQUEST_DETECTED',
        payload
      }, '*');

      // Create a promise for rule handling
      const interceptPromise = new Promise((resolve, reject) => {
        pendingRequests.set(requestId, {
          resolve,
          reject,
          originalArgs: [url, options],
          requestType,
          startTime: Date.now()
        });

        // Set a shorter timeout to prevent hanging (5 seconds for rule check)
        setTimeout(() => {
          if (pendingRequests.has(requestId)) {
            console.log(`⏰ [APILOT] Request ${requestId} timed out waiting for rule check, proceeding normally`);
            pendingRequests.delete(requestId);
            // Use try-catch to handle any network errors during the actual fetch
            originalFetch.call(window, url, options)
              .then(response => {
                captureResponse(requestId, response.clone(), requestType).catch(console.error);
                resolve(response);
              })
              .catch(error => {
                console.warn(`⚠️ [APILOT] Fetch failed after timeout for ${requestId}:`, error.message);
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
    if (event.source !== window || !event.data.type) return;

    // Handle monitoring control messages
    if (event.data.type === 'STOP_API_MONITORING') {
      console.log('🔴 [APILOT] Stopping API monitoring');
      isMonitoringEnabled = false;
      return;
    }

    // Legacy support for GraphQL-specific stop message
    if (event.data.type === 'STOP_GRAPHQL_MONITORING') {
      console.log('🔴 [APILOT] Stopping API monitoring (legacy)');
      isMonitoringEnabled = false;
      return;
    }

    // Only process valid incoming message types
    const validIncomingTypes = [
      'API_REQUEST_PROCEED', 'APPLY_API_RULE', 'APPLY_API_RULES',
      'GRAPHQL_REQUEST_PROCEED', 'APPLY_GRAPHQL_RULE', 'APPLY_GRAPHQL_RULES'
    ];
    if (!validIncomingTypes.includes(event.data.type)) {
      return;
    }

    console.log(`🔄 [APILOT] Received message:`, event.data.type, event.data.payload);

    const { requestId } = event.data.payload || {};
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
      switch (event.data.type) {
        case 'API_REQUEST_PROCEED':
        case 'GRAPHQL_REQUEST_PROCEED':
          const args = event.data.payload.modifiedArgs || originalArgs;
          const response = await originalFetch.apply(window, args);
          await captureResponse(requestId, response.clone(), requestType);
          resolve(response);
          break;

        case 'APPLY_API_RULE':
        case 'APPLY_GRAPHQL_RULE':
          const rule = event.data.payload.rule;
          await applyRule(rule, resolve, reject, originalArgs, requestId, requestType);
          break;

        case 'APPLY_API_RULES':
        case 'APPLY_GRAPHQL_RULES':
          const rules = event.data.payload.rules;
          await applyMultipleRules(rules, resolve, reject, originalArgs, requestId, requestType);
          break;

        default:
          const defaultResponse = await originalFetch.apply(window, originalArgs);
          await captureResponse(requestId, defaultResponse.clone(), requestType);
          resolve(defaultResponse);
      }
    } catch (error) {
      console.error('❌ [APILOT] Error handling intercepted request:', error);
      try {
        const fallbackResponse = await originalFetch.apply(window, originalArgs);
        await captureResponse(requestId, fallbackResponse.clone(), requestType);
        resolve(fallbackResponse);
      } catch (fallbackError) {
        reject(error);
      }
    }
  });

  // Apply multiple rules to request
  async function applyMultipleRules(rules, resolve, reject, originalArgs, requestId, requestType) {
    console.log(`🎯 [APILOT] Applying ${rules.length} rules for ${requestType} request`);

    try {
      // Check for block rules first
      const blockRule = rules.find(rule => rule.action === 'block');
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
          timestamp: new Date().toISOString()
        };

        window.postMessage({
          type: 'API_RESPONSE_CAPTURED',
          payload: errorPayload
        }, '*');

        reject(new Error(`Request blocked by APIlot rule: ${blockRule.name}`));
        return;
      }

      // Separate rules by type
      const delayRules = rules.filter(rule => rule.action === 'delay');
      const modifyRules = rules.filter(rule => rule.action === 'modify');
      const mockRules = rules.filter(rule => rule.action === 'mock');

      // Apply all delay rules (sum delays)
      const totalDelay = delayRules.reduce((sum, rule) => sum + (rule.delayMs || 1000), 0);
      if (totalDelay > 0) {
        console.log(`⏱️ [APILOT] Applying combined delay of ${totalDelay}ms`);
        await new Promise(delayResolve => setTimeout(delayResolve, totalDelay));
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
          headers: new Headers(responseHeaders)
        });

        await captureResponse(requestId, mockResponse.clone(), requestType);
        resolve(mockResponse);
        return;
      }

      // Apply all modify rules
      let finalArgs = originalArgs;
      if (modifyRules.length > 0) {
        console.log(`🔧 [APILOT] Applying modifications from ${modifyRules.length} rule(s)`);

        const combinedModifications = modifyRules.reduce((combined, rule) => {
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
        }, { variables: {}, body: {} });

        const [url, options] = originalArgs;
        let modifiedOptions = { ...options };

        if (options.body) {
          try {
            const bodyData = JSON.parse(options.body);

            if (requestType === 'graphql') {
              if (Object.keys(combinedModifications.variables).length > 0) {
                bodyData.variables = { ...bodyData.variables, ...combinedModifications.variables };
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
      const response = await originalFetch.apply(window, finalArgs);
      await captureResponse(requestId, response.clone(), requestType);
      resolve(response);

    } catch (error) {
      console.error('Error applying multiple rules:', error);
      reject(error);
    }
  }

  // Apply single rule to request
  async function applyRule(rule, resolve, reject, originalArgs, requestId, requestType) {
    try {
      switch (rule.action) {
        case 'delay':
          console.log(`⏱️ [APILOT] Applying ${rule.delayMs || 1000}ms delay`);
          await new Promise(delayResolve => setTimeout(delayResolve, rule.delayMs || 1000));
          const delayedResponse = await originalFetch.apply(window, originalArgs);
          await captureResponse(requestId, delayedResponse.clone(), requestType);
          resolve(delayedResponse);
          break;

        case 'mock':
          console.log(`🎭 [APILOT] Applying mock response`);
          const statusCode = rule.statusCode || 200;
          const responseHeaders = rule.responseHeaders || { 'Content-Type': 'application/json' };

          const mockResponse = new Response(JSON.stringify(rule.mockResponse), {
            status: statusCode,
            statusText: getStatusText(statusCode),
            headers: new Headers(responseHeaders)
          });

          await captureResponse(requestId, mockResponse.clone(), requestType);
          resolve(mockResponse);
          break;

        case 'modify':
          const [url, options] = originalArgs;
          let modifiedOptions = { ...options };

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

        case 'block':
          console.log(`🚫 [APILOT] Blocking request ${requestId}`);
          
          const errorPayload = {
            requestId,
            requestType,
            response: null,
            error: `Request blocked by rule: ${rule.name}`,
            status: 0,
            statusText: 'Blocked',
            headers: {},
            timestamp: new Date().toISOString()
          };

          window.postMessage({
            type: 'API_RESPONSE_CAPTURED',
            payload: errorPayload
          }, '*');

          reject(new Error(`Request blocked by APIlot rule: ${rule.name}`));
          break;

        default:
          const defaultResponse = await originalFetch.apply(window, originalArgs);
          await captureResponse(requestId, defaultResponse.clone(), requestType);
          resolve(defaultResponse);
      }
    } catch (error) {
      console.error('Error applying rule:', error);
      reject(error);
    }
  }

  // Helper function to get status text
  function getStatusText(statusCode) {
    const statusTexts = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable'
    };
    return statusTexts[statusCode] || 'Unknown';
  }

  // Override XMLHttpRequest for better coverage
  console.log('🔧 [APILOT] Installing XMLHttpRequest overrides...');
  
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    this._apilot_method = method;
    this._apilot_url = url;
    this._apilot_headers = {};
    this._apilot_async = async !== false; // Default to true
    return originalXHROpen.call(this, method, url, async, user, password);
  };
  
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (!this._apilot_headers) this._apilot_headers = {};
    this._apilot_headers[name] = value;
    return originalXHRSetRequestHeader.call(this, name, value);
  };
  
  // Override addEventListener to capture events added before send()
  const originalXHRAddEventListener = XMLHttpRequest.prototype.addEventListener;
  XMLHttpRequest.prototype.addEventListener = function(type, listener, options) {
    const xhr = this;
    
    // Wrap load/loadend/error listeners to ensure we capture the response
    if (type === 'load' || type === 'loadend') {
      const wrappedListener = function(event) {
        // Trigger our response capture if this XHR was being monitored
        if (xhr._apilot_requestId && !xhr._apilot_responseCaptured && xhr._apilot_handleResponse) {
          xhr._apilot_handleResponse();
        }
        return listener.apply(this, arguments);
      };
      return originalXHRAddEventListener.call(this, type, wrappedListener, options);
    }
    
    if (type === 'error') {
      const wrappedListener = function(event) {
        if (xhr._apilot_requestId && !xhr._apilot_responseCaptured) {
          xhr._apilot_responseCaptured = true;
          window.postMessage({
            type: 'API_RESPONSE_CAPTURED',
            payload: {
              requestId: xhr._apilot_requestId,
              requestType: xhr._apilot_requestType,
              response: null,
              error: 'Network error',
              status: 0,
              statusText: 'Error',
              headers: {},
              timestamp: new Date().toISOString()
            }
          }, '*');
        }
        return listener.apply(this, arguments);
      };
      return originalXHRAddEventListener.call(this, type, wrappedListener, options);
    }
    
    return originalXHRAddEventListener.call(this, type, listener, options);
  };
  
  XMLHttpRequest.prototype.send = function(data) {
    const xhr = this;
    
    if (isMonitoringEnabled && xhr._apilot_url) {
      const options = {
        method: xhr._apilot_method || 'GET',
        body: data,
        headers: xhr._apilot_headers || {}
      };
      
      // Convert relative URL to absolute URL
      let absoluteUrl = xhr._apilot_url;
      try {
        if (xhr._apilot_url && !xhr._apilot_url.startsWith('http') && !xhr._apilot_url.startsWith('//')) {
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
        
        let payload;
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
            frameContext: frameContext
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
            frameContext: frameContext
          };
        }

        console.log(`📋 [APILOT] XHR ${requestType.toUpperCase()} request detected:`, payload);
        
        window.postMessage({
          type: 'API_REQUEST_DETECTED',
          payload
        }, '*');
        
        // Create response handler function and store on xhr for addEventListener wrapper
        const handleXHRResponse = function() {
          if (xhr._apilot_responseCaptured) return;
          xhr._apilot_responseCaptured = true;
          
          let responseData;
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
          const responseHeaders = {};
          try {
            const headerStr = xhr.getAllResponseHeaders();
            if (headerStr) {
              headerStr.split('\r\n').forEach(line => {
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
          
          window.postMessage({
            type: 'API_RESPONSE_CAPTURED',
            payload: {
              requestId,
              requestType,
              response: responseData,
              status: xhr.status,
              statusText: xhr.statusText,
              headers: responseHeaders,
              timestamp: new Date().toISOString()
            }
          }, '*');
        };
        
        // Store the handler on the xhr object so addEventListener wrapper can access it
        xhr._apilot_handleResponse = handleXHRResponse;
        
        // Handle response via multiple event types for better coverage
        const originalOnReadyStateChange = xhr.onreadystatechange;
        const originalOnLoad = xhr.onload;
        const originalOnError = xhr.onerror;
        const originalOnTimeout = xhr.ontimeout;
        
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            handleXHRResponse();
          }
          if (originalOnReadyStateChange) {
            return originalOnReadyStateChange.apply(this, arguments);
          }
        };
        
        xhr.onload = function() {
          handleXHRResponse();
          if (originalOnLoad) {
            return originalOnLoad.apply(this, arguments);
          }
        };
        
        xhr.onerror = function() {
          if (!xhr._apilot_responseCaptured) {
            xhr._apilot_responseCaptured = true;
            window.postMessage({
              type: 'API_RESPONSE_CAPTURED',
              payload: {
                requestId,
                requestType,
                response: null,
                error: 'Network error',
                status: 0,
                statusText: 'Error',
                headers: {},
                timestamp: new Date().toISOString()
              }
            }, '*');
          }
          if (originalOnError) {
            return originalOnError.apply(this, arguments);
          }
        };
        
        xhr.ontimeout = function() {
          if (!xhr._apilot_responseCaptured) {
            xhr._apilot_responseCaptured = true;
            window.postMessage({
              type: 'API_RESPONSE_CAPTURED',
              payload: {
                requestId,
                requestType,
                response: null,
                error: 'Request timeout',
                status: 0,
                statusText: 'Timeout',
                headers: {},
                timestamp: new Date().toISOString()
              }
            }, '*');
          }
          if (originalOnTimeout) {
            return originalOnTimeout.apply(this, arguments);
          }
        };
        
        // Also listen via addEventListener for libraries that use it
        xhr.addEventListener('load', handleXHRResponse);
        xhr.addEventListener('error', function() {
          if (!xhr._apilot_responseCaptured) {
            xhr._apilot_responseCaptured = true;
            window.postMessage({
              type: 'API_RESPONSE_CAPTURED',
              payload: {
                requestId,
                requestType,
                response: null,
                error: 'Network error',
                status: 0,
                statusText: 'Error',
                headers: {},
                timestamp: new Date().toISOString()
              }
            }, '*');
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
    parentUrl: window !== window.top ? document.referrer : 'N/A'
  };
  
  console.log('✅ [APILOT] API request interception active (GraphQL + REST, fetch + XHR)', frameInfo);
  
  // Mark this frame as the active interceptor
  if (!window.top.__APILOT_ACTIVE_FRAME__) {
    window.top.__APILOT_ACTIVE_FRAME__ = window.location.href;
    console.log('🎯 [APILOT] This frame will handle API interception:', window.location.href);
  }
})();
