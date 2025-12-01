// Injected script for GraphQL Testing Toolkit
(function() {
  'use strict';

  // Prevent multiple injections from interfering with each other
  if (window.__GRAPHQL_TESTING_TOOLKIT_INJECTED__) {
    console.log('🔄 [INJECTED] Script already injected in this context, skipping');
    return;
  }
  window.__GRAPHQL_TESTING_TOOLKIT_INJECTED__ = true;

  const originalFetch = window.fetch;
  const pendingRequests = new Map();
  let isMonitoringEnabled = true;

  // Generate unique request IDs
  function generateRequestId() {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Capture response data and send to content script
  async function captureResponse(requestId, response) {
    console.log(`📥 [INJECTED] Capturing response for request ${requestId}`, {
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
        console.log(`✅ [INJECTED] Response data parsed for ${requestId}:`, responseData);
      } catch (parseError) {
        console.log(`⚠️ [INJECTED] Response is not JSON for ${requestId}, treating as text`);
        responseData = responseText;
      }

      const payload = {
        requestId,
        response: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        timestamp: new Date().toISOString()
      };

      window.postMessage({
        type: 'GRAPHQL_RESPONSE_CAPTURED',
        payload
      }, '*');

      console.log(`📤 [INJECTED] Response message sent for ${requestId}`, payload);
    } catch (error) {
      console.error(`❌ [INJECTED] Failed to capture response for ${requestId}:`, {
        message: error.message,
        name: error.name,
        stack: error.stack
      });

      const errorPayload = {
        requestId,
        response: null,
        error: `${error.name}: ${error.message}`,
        status: response?.status || 0,
        statusText: response?.statusText || 'Unknown',
        timestamp: new Date().toISOString()
      };

      window.postMessage({
        type: 'GRAPHQL_RESPONSE_CAPTURED',
        payload: errorPayload
      }, '*');

      console.log(`📤 [INJECTED] Error response message sent for ${requestId}`, errorPayload);
    }
  }

  // Check if a request contains GraphQL
  function isGraphQLRequest(url, options) {
    const actualUrl = url;
    const actualOptions = options || {};
    
    // Only process POST requests (filter out OPTIONS, GET, etc.)
    const method = actualOptions?.method?.toUpperCase();
    if (!actualOptions || method !== 'POST') {
      console.log(`🚫 [INJECTED] Skipping ${method || 'unknown'} request to ${actualUrl}`);
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

    // GraphQL detection logic:
    // 1. If we have GraphQL content in body AND (GraphQL URL OR GraphQL content type) - definitely GraphQL
    // 2. If we have GraphQL URL AND JSON content type but no body content (body read failed) - likely GraphQL
    const isGraphQL = (hasGraphQLContent && (hasGraphQLUrl || hasGraphQLContentType)) ||
                      (hasGraphQLUrl && hasGraphQLContentType && !actualOptions.body);

    // Always log the decision for POST requests to help with debugging
    if (method === 'POST') {
      const detectionReason = isGraphQL ? 
        (hasGraphQLContent ? 'has GraphQL content' : 'GraphQL URL + JSON content type (no body)') :
        'missing required criteria';
        
      console.log(`${isGraphQL ? '✅' : '🚫'} [INJECTED] GraphQL detection result:`, {
        url: actualUrl,
        originalUrl: url,
        method: method,
        hasGraphQLUrl,
        hasGraphQLContent,
        hasGraphQLContentType,
        contentType,
        detectionReason,
        isGraphQL
      });
    }

    return isGraphQL;
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

  // Override fetch
  window.fetch = async function(url, options = {}) {
    // Skip monitoring for extension's own requests (DevTools, background, etc.)
    const runtime = typeof chrome !== 'undefined' ? chrome.runtime : 
                   typeof browser !== 'undefined' ? browser.runtime : null;
    if (runtime && runtime.getURL) {
      try {
        const extensionUrl = runtime.getURL('');
        if (url && url.startsWith(extensionUrl)) {
          console.log('🔧 [INJECTED] Skipping extension internal request:', url);
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
      
      // Clone the request to read the body (since it can only be read once)
      try {
        // Check if the request has a body to read
        if (url.bodyUsed) {
          console.warn('⚠️ [INJECTED] Request body already consumed, cannot read');
          requestBody = null;
        } else {
          const clonedRequest = url.clone();
          requestBody = await clonedRequest.text();
          actualOptions.body = requestBody;
          console.log('📖 [INJECTED] Successfully read request body:', {
            bodyLength: requestBody ? requestBody.length : 0,
            bodyPreview: requestBody ? requestBody.substring(0, 100) : 'empty'
          });
        }
      } catch (error) {
        console.warn('⚠️ [INJECTED] Could not read request body:', error);
        requestBody = null;
      }
    } else {
      // For regular fetch calls, use the body from options
      requestBody = options.body;
      actualOptions.body = requestBody;
    }
    
    // Debug logging for all requests
    console.log(`🔍 [INJECTED] Evaluating request:`, {
      url: actualUrl,
      method: actualOptions.method,
      isMonitoringEnabled,
      hasBody: !!requestBody,
      bodyLength: requestBody ? requestBody.length : 0,
      contentType: actualOptions.headers?.['content-type'] || actualOptions.headers?.['Content-Type'] || 'none'
    });
    
    // Convert relative URLs to absolute URLs
    let resolvedUrl = actualUrl;
    if (actualUrl && !actualUrl.startsWith('http') && !actualUrl.startsWith('//')) {
      if (actualUrl.startsWith('/')) {
        // Absolute path: /graphql/proxy -> https://domain.com/graphql/proxy
        resolvedUrl = window.location.origin + actualUrl;
      } else {
        // Relative path: graphql/proxy -> https://domain.com/current-path/graphql/proxy
        resolvedUrl = new URL(actualUrl, window.location.href).href;
      }
      console.log(`🔗 [FETCH] Converted relative URL: ${actualUrl} → ${resolvedUrl}`);
    }
    
    // Check if monitoring is enabled and this is a GraphQL request
    // Use resolved URL for both detection and messaging
    if (isMonitoringEnabled && isGraphQLRequest(resolvedUrl, actualOptions)) {
      const requestId = generateRequestId();
      const requestData = parseGraphQLRequest(requestBody || actualOptions.body);


      // Extract request headers
      const requestHeaders = {};
      if (actualOptions.headers) {
        // Handle different header formats (Headers object, plain object, etc.)
        if (actualOptions.headers instanceof Headers) {
          // Headers object - iterate through entries
          for (const [key, value] of actualOptions.headers.entries()) {
            requestHeaders[key] = value;
          }
        } else if (typeof actualOptions.headers === 'object') {
          // Plain object - copy directly
          Object.assign(requestHeaders, actualOptions.headers);
        }
      }

      console.log(`📋 [INJECTED] Captured request headers for ${requestId}:`, {
        headerCount: Object.keys(requestHeaders).length,
        headers: requestHeaders,
        hasAuth: Object.keys(requestHeaders).some(key => 
          key.toLowerCase().includes('auth') || key.toLowerCase().includes('token')
        )
      });

      // Always notify content script about detected requests (for monitoring)
      window.postMessage({
        type: 'GRAPHQL_REQUEST_DETECTED',
        payload: {
          requestId,
          url: resolvedUrl,
          operationName: requestData.operationName,
          query: requestData.query,
          variables: requestData.variables,
          requestHeaders: requestHeaders,
          timestamp: new Date().toISOString()
        }
      }, '*');

      console.log(`📋 [INJECTED] Adding request ${requestId} to pending requests`);

      // Create a promise that will be resolved based on rules
      const interceptPromise = new Promise((resolve, reject) => {
        pendingRequests.set(requestId, {
          resolve,
          reject,
          originalArgs: [url, options],
          startTime: Date.now()
        });

        console.log(`✅ [INJECTED] Request ${requestId} added to pending requests. Total pending: ${pendingRequests.size}`);

        // Set a timeout to prevent hanging
        setTimeout(() => {
          if (pendingRequests.has(requestId)) {
            console.log(`⏰ [INJECTED] Request ${requestId} timed out, proceeding normally`);
            pendingRequests.delete(requestId);
            resolve(originalFetch.call(window, url, options));
          }
        }, 30000); // 30 second timeout
      });

      return interceptPromise;
    }

    // Not a GraphQL request, proceed normally
    return originalFetch.call(this, url, options);
  };

    // Listen for messages from content script
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data.type) return;

    // Handle monitoring control messages
    if (event.data.type === 'STOP_GRAPHQL_MONITORING') {
      console.log('🔴 [INJECTED] Stopping GraphQL monitoring');
      isMonitoringEnabled = false;
      return;
    }

    // Only process messages that are responses from content script, not our own outgoing messages
    const validIncomingTypes = ['GRAPHQL_REQUEST_PROCEED', 'APPLY_GRAPHQL_RULE', 'APPLY_GRAPHQL_RULES'];
    if (!validIncomingTypes.includes(event.data.type)) {
      return; // Ignore our own outgoing messages like GRAPHQL_REQUEST_DETECTED, GRAPHQL_RESPONSE_CAPTURED
    }

    console.log(`🔄 [INJECTED] Received message:`, event.data.type, event.data.payload);

    const { requestId } = event.data.payload || {};
    if (!requestId) {
      console.warn(`⚠️ [INJECTED] No requestId in message:`, event.data);
      return;
    }

    if (!pendingRequests.has(requestId)) {
      console.warn(`⚠️ [INJECTED] Request ${requestId} not found in pending requests. Available:`, Array.from(pendingRequests.keys()));
      return;
    }

    console.log(`✅ [INJECTED] Processing ${event.data.type} for request ${requestId}`);
    const { resolve, reject, originalArgs } = pendingRequests.get(requestId);
    pendingRequests.delete(requestId);
    console.log(`🗑️ [INJECTED] Removed request ${requestId} from pending requests. Remaining: ${pendingRequests.size}`);

    try {
      switch (event.data.type) {
        case 'GRAPHQL_REQUEST_PROCEED':
          // Proceed with original request
          const args = event.data.payload.modifiedArgs || originalArgs;
          const response = await originalFetch.apply(window, args);

          // Capture response data
          await captureResponse(requestId, response.clone());
          resolve(response);
          break;

        case 'APPLY_GRAPHQL_RULE':
          const rule = event.data.payload.rule;
          await applyRule(rule, resolve, reject, originalArgs, requestId);
          break;

        case 'APPLY_GRAPHQL_RULES':
          const rules = event.data.payload.rules;
          await applyMultipleRules(rules, resolve, reject, originalArgs, requestId);
          break;

        default:
          // Unknown message, proceed normally
          const defaultResponse = await originalFetch.apply(window, originalArgs);
          // Capture response data even for unknown message types
          await captureResponse(requestId, defaultResponse.clone());
          resolve(defaultResponse);
      }
    } catch (error) {
      console.error('❌ [INJECTED] Error handling intercepted request:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        requestId: requestId,
        type: event.data.type
      });

      // Try to proceed with original request as fallback
      try {
        const fallbackResponse = await originalFetch.apply(window, originalArgs);
        await captureResponse(requestId, fallbackResponse.clone());
        resolve(fallbackResponse);
      } catch (fallbackError) {
        console.error('❌ [INJECTED] Fallback request also failed:', fallbackError.message);
        reject(error); // Reject with original error
      }
    }
  });

  // Apply multiple rules to request
  async function applyMultipleRules(rules, resolve, reject, originalArgs, requestId) {
    console.log(`🎯 [INJECTED] Applying ${rules.length} rules for ${rules[0]?.operationName || 'unknown operation'}:`,
               rules.map(r => `${r.name} (${r.action})`).join(', '));

    try {
      // Check for block rules first - if any rule blocks, block immediately
      const blockRule = rules.find(rule => rule.action === 'block');
      if (blockRule) {
        console.log(`🚫 [INJECTED] Blocking request ${requestId} due to rule: ${blockRule.name}`);

        // Capture blocked response for logging and timer cleanup
        const errorPayload = {
          requestId,
          response: null,
          error: `Request blocked by rule: ${blockRule.name}`,
          status: 0,
          statusText: 'Blocked',
          headers: {},
          timestamp: new Date().toISOString()
        };

        window.postMessage({
          type: 'GRAPHQL_RESPONSE_CAPTURED',
          payload: errorPayload
        }, '*');

        reject(new Error(`Request blocked by GraphQL Testing Toolkit rule: ${blockRule.name}`));
        return;
      }

      // Separate rules by type
      const delayRules = rules.filter(rule => rule.action === 'delay');
      const modifyRules = rules.filter(rule => rule.action === 'modify');
      const mockRules = rules.filter(rule => rule.action === 'mock');

      // Apply all delay rules first (sum delays)
      const totalDelay = delayRules.reduce((sum, rule) => sum + (rule.delayMs || 1000), 0);
      if (totalDelay > 0) {
        console.log(`⏱️ [INJECTED] Applying combined delay of ${totalDelay}ms from ${delayRules.length} rule(s): ${delayRules.map(r => r.name).join(', ')}`);
        await new Promise(delayResolve => setTimeout(delayResolve, totalDelay));
      }

      // If there are mock rules, apply the first mock rule and return (can't combine mocks)
      if (mockRules.length > 0) {
        const mockRule = mockRules[0];
        if (mockRules.length > 1) {
          console.log(`🎭 [INJECTED] Multiple mock rules found, applying first: ${mockRule.name}, ignoring: ${mockRules.slice(1).map(r => r.name).join(', ')}`);
        } else {
          console.log(`🎭 [INJECTED] Applying mock response from rule: ${mockRule.name}`);
        }

        const mockResponse = new Response(JSON.stringify(mockRule.mockResponse), {
          status: 200,
          statusText: 'OK',
          headers: new Headers({
            'Content-Type': 'application/json'
          })
        });

        // Capture mock response data
        await captureResponse(requestId, mockResponse.clone());
        resolve(mockResponse);
        return;
      }

      // Apply all modify rules (merge modifications)
      let finalArgs = originalArgs;
      if (modifyRules.length > 0) {
        console.log(`🔧 [INJECTED] Applying combined modifications from ${modifyRules.length} rule(s): ${modifyRules.map(r => r.name).join(', ')}`);

        const combinedModifications = modifyRules.reduce((combined, rule) => {
          if (rule.modifications) {
            // Merge variables
            if (rule.modifications.variables) {
              combined.variables = { ...combined.variables, ...rule.modifications.variables };
            }
            // Use the last query modification (they can't be merged)
            if (rule.modifications.query) {
              combined.query = rule.modifications.query;
            }
            // Use the last operation name modification
            if (rule.modifications.operationName) {
              combined.operationName = rule.modifications.operationName;
            }
          }
          return combined;
        }, { variables: {} });

        console.log('Combined modifications:', combinedModifications);

        const [url, options] = originalArgs;
        let modifiedOptions = { ...options };

        if (options.body) {
          try {
            const bodyData = JSON.parse(options.body);

            // Apply combined variable modifications
            if (Object.keys(combinedModifications.variables).length > 0) {
              bodyData.variables = {
                ...bodyData.variables,
                ...combinedModifications.variables
              };
              console.log('Combined modified variables:', bodyData.variables);
            }

            // Apply query modification if provided
            if (combinedModifications.query) {
              bodyData.query = combinedModifications.query;
              console.log('Modified query:', bodyData.query);
            }

            // Apply operation name modification if provided
            if (combinedModifications.operationName) {
              bodyData.operationName = combinedModifications.operationName;
              console.log('Modified operation name:', bodyData.operationName);
            }

            modifiedOptions.body = JSON.stringify(bodyData);
            console.log('Combined modified request body applied');
          } catch (error) {
            console.error('Failed to apply combined modifications:', error);
          }
        }

        finalArgs = [url, modifiedOptions];
      }

      // Execute the request with all modifications applied
      const response = await originalFetch.apply(window, finalArgs);

      // Capture response data
      await captureResponse(requestId, response.clone());
      resolve(response);

    } catch (error) {
      console.error('Error applying multiple rules:', error);
      reject(error);
    }
  }

  // Apply rule to request
  async function applyRule(rule, resolve, reject, originalArgs, requestId) {
    try {
      switch (rule.action) {
        case 'delay':
          console.log(`⏱️ [INJECTED] Applying ${rule.delayMs || 1000}ms delay to ${rule.operationName || 'unknown operation'}`);
          await new Promise(delayResolve => setTimeout(delayResolve, rule.delayMs || 1000));
          const delayedResponse = await originalFetch.apply(window, originalArgs);

          // Capture response data
          await captureResponse(requestId, delayedResponse.clone());
          resolve(delayedResponse);
          break;

        case 'mock':
          console.log(`🎭 [INJECTED] Applying mock response for ${rule.operationName || 'unknown operation'}`);
          const mockResponse = new Response(JSON.stringify(rule.mockResponse), {
            status: 200,
            statusText: 'OK',
            headers: new Headers({
              'Content-Type': 'application/json'
            })
          });

          // Capture mock response data
          await captureResponse(requestId, mockResponse.clone());
          resolve(mockResponse);
          break;

        case 'modify':
          const [url, options] = originalArgs;
          let modifiedOptions = { ...options };

          console.log(`🔧 Modifying request for ${rule.operationName || 'unknown operation'}`);
          console.log('Original options:', options);
          console.log('Rule modifications:', rule.modifications);

          if (rule.modifications && options.body) {
            try {
              const bodyData = JSON.parse(options.body);

              // Apply variable modifications
              if (rule.modifications.variables) {
                bodyData.variables = {
                  ...bodyData.variables,
                  ...rule.modifications.variables
                };
                console.log('Modified variables:', bodyData.variables);
              }

              // Apply query modifications if provided
              if (rule.modifications.query) {
                bodyData.query = rule.modifications.query;
                console.log('Modified query:', bodyData.query);
              }

              // Apply operation name modifications if provided
              if (rule.modifications.operationName) {
                bodyData.operationName = rule.modifications.operationName;
                console.log('Modified operation name:', bodyData.operationName);
              }

              modifiedOptions.body = JSON.stringify(bodyData);
              console.log('Modified request body:', modifiedOptions.body);
            } catch (error) {
              console.error('Failed to modify request:', error);
            }
          }

          const modifiedResponse = await originalFetch.call(window, url, modifiedOptions);

          // Capture response data
          await captureResponse(requestId, modifiedResponse.clone());
          resolve(modifiedResponse);
          break;

        case 'block':
          console.log(`🚫 [INJECTED] Blocking request ${requestId} for operation ${rule.operationName || 'unknown'}`);

          // Capture blocked response for logging and timer cleanup
          const errorPayload = {
            requestId,
            response: null,
            error: `Request blocked by rule: ${rule.name}`,
            status: 0,
            statusText: 'Blocked',
            headers: {},
            timestamp: new Date().toISOString()
          };

          window.postMessage({
            type: 'GRAPHQL_RESPONSE_CAPTURED',
            payload: errorPayload
          }, '*');

          reject(new Error(`Request blocked by GraphQL Testing Toolkit rule: ${rule.name}`));
          break;

        default:
          // Unknown action, proceed normally
          const defaultResponse = await originalFetch.apply(window, originalArgs);

          // Capture response data
          await captureResponse(requestId, defaultResponse.clone());
          resolve(defaultResponse);
      }
    } catch (error) {
      console.error('Error applying rule:', error);
      reject(error);
    }
  }

  // Override XMLHttpRequest for better coverage
  console.log('🔧 [INJECTED] Installing XMLHttpRequest overrides...');
  
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    this._method = method;
    this._url = url;
    this._headers = {}; // Initialize headers tracking
    return originalXHROpen.call(this, method, url, async, user, password);
  };
  
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    // Track headers being set
    if (!this._headers) this._headers = {};
    this._headers[name] = value;
    return originalXHRSetRequestHeader.call(this, name, value);
  };
  
  XMLHttpRequest.prototype.send = function(data) {
    if (isMonitoringEnabled && this._method && this._method.toUpperCase() === 'POST' && this._url) {
      // Check if this looks like a GraphQL request
      const options = {
        method: this._method,
        body: data,
        headers: this._headers || {}
      };
      
      if (isGraphQLRequest(this._url, options)) {
        const requestId = generateRequestId();
        const requestData = parseGraphQLRequest(data);
        
        // Convert relative URL to absolute URL for content script
        let absoluteUrl = this._url;
        if (this._url && !this._url.startsWith('http') && !this._url.startsWith('//')) {
          if (this._url.startsWith('/')) {
            // Absolute path: /graphql/proxy -> https://domain.com/graphql/proxy
            absoluteUrl = window.location.origin + this._url;
          } else {
            // Relative path: graphql/proxy -> https://domain.com/current-path/graphql/proxy
            absoluteUrl = new URL(this._url, window.location.href).href;
          }
          console.log(`🔗 [XHR] Converted relative URL: ${this._url} → ${absoluteUrl}`);
        }
        
        console.log(`📋 [INJECTED] XHR GraphQL request detected:`, {
          requestId,
          url: absoluteUrl,
          originalUrl: this._url,
          operationName: requestData.operationName,
          frameUrl: window.location.href,
          isTopFrame: window === window.top
        });
        
        // Notify content script with absolute URL
        window.postMessage({
          type: 'GRAPHQL_REQUEST_DETECTED',
          payload: {
            requestId,
            url: absoluteUrl,
            operationName: requestData.operationName,
            query: requestData.query,
            variables: requestData.variables,
            requestHeaders: this._headers || {},
            timestamp: new Date().toISOString()
          }
        }, '*');
        
        // Monitor the response
        const originalOnReadyStateChange = this.onreadystatechange;
        this.onreadystatechange = function() {
          if (this.readyState === 4) {
            let responseData;
            try {
              responseData = JSON.parse(this.responseText);
            } catch (e) {
              responseData = this.responseText;
            }
            
            window.postMessage({
              type: 'GRAPHQL_RESPONSE_CAPTURED',
              payload: {
                requestId,
                response: responseData,
                status: this.status,
                statusText: this.statusText,
                headers: {},
                timestamp: new Date().toISOString()
              }
            }, '*');
          }
          
          if (originalOnReadyStateChange) {
            return originalOnReadyStateChange.apply(this, arguments);
          }
        };
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
  
  console.log('✅ [INJECTED] GraphQL request interception active (fetch + XHR)', frameInfo);
  
  // Mark this frame as the active interceptor for debugging
  if (!window.top.__GRAPHQL_ACTIVE_FRAME__) {
    window.top.__GRAPHQL_ACTIVE_FRAME__ = window.location.href;
    console.log('🎯 [INJECTED] This frame will handle GraphQL interception:', window.location.href);
  } else {
    console.log('ℹ️ [INJECTED] Another frame is already handling interception:', window.top.__GRAPHQL_ACTIVE_FRAME__);
  }
})();
