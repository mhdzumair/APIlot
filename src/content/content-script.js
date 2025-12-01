// Content script for GraphQL Testing Toolkit
class GraphQLInterceptor {
  constructor() {
    this.isMonitoring = false;
    this.setupMessageListener();
    // Don't inject interceptor immediately - wait for DevTools to open
    this.checkInitialDevToolsState();
  }
  
  setupMessageListener() {
    const runtime = chrome.runtime || browser.runtime;
    runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'PING') {
        sendResponse({ success: true, message: 'Content script active' });
      } else if (message.type === 'START_MONITORING') {
        console.log('🟢 [CONTENT] Starting GraphQL monitoring');
        this.startMonitoring();
        sendResponse({ success: true });
      } else if (message.type === 'STOP_MONITORING') {
        console.log('🔴 [CONTENT] Stopping GraphQL monitoring');
        this.stopMonitoring();
        sendResponse({ success: true });
      }
      return true;
    });
  }
  
  checkInitialDevToolsState() {
    // Check if DevTools is already open by asking background script
    const runtime = chrome.runtime || browser.runtime;
    runtime.sendMessage({
      type: 'GET_TAB_STATE'
    }).then(response => {
      if (response && response.devToolsOpen && response.enabled) {
        console.log('🟢 [CONTENT] DevTools already open and tab enabled, starting monitoring');
        this.startMonitoring();
      } else {
        console.log('📡 [CONTENT] Tab not ready for monitoring:', response);
      }
    }).catch(error => {
      console.log('📡 [CONTENT] Could not check initial DevTools state:', error.message);
    });
  }
  
  startMonitoring() {
    if (!this.isMonitoring) {
      this.isMonitoring = true;
      this.injectInterceptor();
      console.log('✅ [CONTENT] GraphQL monitoring started');
    } else {
      console.log('ℹ️ [CONTENT] GraphQL monitoring already active, skipping start');
    }
  }
  
  stopMonitoring() {
    if (this.isMonitoring) {
      this.isMonitoring = false;
      // Send message to injected script to stop monitoring
      window.postMessage({
        type: 'STOP_GRAPHQL_MONITORING'
      }, '*');
      console.log('⏹️ [CONTENT] GraphQL monitoring stopped');
    }
  }
  
  injectInterceptor() {
    // Inject script into page context to intercept fetch/XHR
    const script = document.createElement('script');
    const runtime = chrome.runtime || browser.runtime;
    script.src = runtime.getURL('src/content/injected-script.js');
    script.onload = () => script.remove();
    script.onerror = () => console.error('Failed to inject GraphQL interceptor script');
    (document.head || document.documentElement).appendChild(script);
    
    // Listen for messages from injected script
    window.addEventListener('message', async (event) => {
      if (event.source !== window || !event.data.type) return;
      
      switch (event.data.type) {
        case 'GRAPHQL_REQUEST_DETECTED':
          await this.handleGraphQLRequest(event.data.payload);
          break;
          
        case 'GRAPHQL_RESPONSE_CAPTURED':
          await this.handleGraphQLResponse(event.data.payload);
          break;
      }
    });
  }
  
  async handleGraphQLRequest(payload) {
    console.log(`🔍 [CONTENT] Handling GraphQL request:`, {
      requestId: payload.requestId,
      operationName: payload.operationName,
      url: payload.url
    });
    
    try {
      const runtime = chrome.runtime || browser.runtime;
      
      // First check if extension is enabled
      const enabledResponse = await runtime.sendMessage({
        type: 'GET_ENABLED_STATUS'
      });
      
      console.log(`🔄 [CONTENT] Extension enabled status:`, enabledResponse);
      
      // If disabled, don't log or process the request
      if (!enabledResponse.enabled) {
        console.log('🚫 [CONTENT] Extension disabled - skipping request processing');
        window.postMessage({
          type: 'GRAPHQL_REQUEST_PROCEED',
          payload: {
            requestId: payload.requestId
          }
        }, '*');
        return;
      }
      
      // Log the request only if enabled
      console.log(`📝 [CONTENT] Logging request to background:`, {
        requestId: payload.requestId,
        hasHeaders: !!payload.requestHeaders,
        headerCount: payload.requestHeaders ? Object.keys(payload.requestHeaders).length : 0
      });
      const logResponse = await runtime.sendMessage({
        type: 'LOG_REQUEST',
        data: {
          requestId: payload.requestId,
          url: payload.url,
          operationName: payload.operationName,
          query: payload.query,
          variables: payload.variables,
          requestHeaders: payload.requestHeaders,
          timestamp: payload.timestamp,
          tabId: payload.tabId
        }
      });
      console.log(`✅ [CONTENT] Request logged:`, logResponse);
      
      // Check for matching rule
      console.log(`🔎 [CONTENT] Checking for matching rule...`);
      const response = await runtime.sendMessage({
        type: 'GET_MATCHING_RULE',
        data: {
          graphqlData: {
            operationName: payload.operationName,
            query: payload.query,
            variables: payload.variables
          },
          url: payload.url
        }
      });
      console.log(`📊 [CONTENT] Rule check response:`, response);
      console.log(`🔍 [CONTENT] Rules found: ${response.rules ? response.rules.length : 0}, Single rule: ${response.rule ? 'yes' : 'no'}`);
      
      if (response.success && response.enabled !== false) {
        // Always check for rules array first, then fall back to single rule for compatibility
        const rulesToApply = response.rules && response.rules.length > 0 ? response.rules : 
                           (response.rule ? [response.rule] : []);
        
        if (rulesToApply.length > 0) {
          console.log(`🎯 [CONTENT] Found ${rulesToApply.length} matching rule(s) for ${payload.operationName}:`, 
                     rulesToApply.map(r => `${r.name} (${r.action})`).join(', '));
          
          // Always use the multi-rule handler for consistency
          window.postMessage({
            type: 'APPLY_GRAPHQL_RULES',
            payload: {
              requestId: payload.requestId,
              rules: rulesToApply
            }
          }, '*');
        } else {
          // No rules apply, proceed normally
          console.log(`➡️ [CONTENT] No rules apply, proceeding normally`);
          window.postMessage({
            type: 'GRAPHQL_REQUEST_PROCEED',
            payload: {
              requestId: payload.requestId
            }
          }, '*');
        }
      } else {
        // Extension disabled, proceed normally
        console.log(`➡️ [CONTENT] Extension disabled, proceeding normally`);
        window.postMessage({
          type: 'GRAPHQL_REQUEST_PROCEED',
          payload: {
            requestId: payload.requestId
          }
        }, '*');
      }
      
    } catch (error) {
      console.error('Error handling GraphQL request:', error);
      // Let request proceed on error
      window.postMessage({
        type: 'GRAPHQL_REQUEST_PROCEED',
        payload: {
          requestId: payload.requestId
        }
      }, '*');
    }
  }
  
  async handleGraphQLResponse(payload) {
    console.log('📥 [CONTENT] Received response from injected script:', {
      requestId: payload.requestId,
      status: payload.status,
      hasResponse: !!payload.response,
      error: payload.error
    });
    
    try {
      const runtime = chrome.runtime || browser.runtime;
      
      // Log the response
      console.log(`📝 [CONTENT] Logging response to background:`, payload.requestId);
      const logResponse = await runtime.sendMessage({
        type: 'LOG_RESPONSE',
        data: {
          requestId: payload.requestId,
          response: payload.response,
          status: payload.status,
          statusText: payload.statusText,
          headers: payload.headers,
          error: payload.error,
          timestamp: payload.timestamp
        }
      });
      
      console.log('✅ [CONTENT] Response logged to background:', {
        requestId: payload.requestId,
        success: logResponse?.success
      });
    } catch (error) {
      console.error('❌ [CONTENT] Error handling GraphQL response:', error);
    }
  }
}

// Initialize interceptor when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new GraphQLInterceptor();
  });
} else {
  new GraphQLInterceptor();
}

console.log('GraphQL Testing Toolkit content script loaded');
