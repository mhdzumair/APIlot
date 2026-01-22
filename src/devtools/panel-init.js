// Panel Extensions Initialization
// This file initializes the panel extensions after the main panel is ready
// Separated from HTML for CSP compliance

(function() {
  'use strict';

  let retryCount = 0;
  const maxRetries = 50; // Max 5 seconds of retrying

  function initializeExtensions() {
    console.log('[PANEL-INIT] Checking for panel initialization...');
    
    // Check for window.panel (the actual variable name used in panel.js)
    if (window.panel) {
      console.log('[PANEL-INIT] Panel found, initializing extensions...');
      try {
        window.panelExtensions = new PanelExtensions(window.panel);
        console.log('[PANEL-INIT] ✅ Extensions initialized successfully');
      } catch (error) {
        console.error('[PANEL-INIT] ❌ Failed to initialize extensions:', error);
      }
    } else {
      retryCount++;
      if (retryCount < maxRetries) {
        console.log(`[PANEL-INIT] Panel not found, retrying... (${retryCount}/${maxRetries})`);
        setTimeout(initializeExtensions, 100);
      } else {
        console.error('[PANEL-INIT] ❌ Panel not found after maximum retries. Extensions not initialized.');
      }
    }
  }

  // Start initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Small delay to ensure panel.js has initialized
      setTimeout(initializeExtensions, 200);
    });
  } else {
    // DOM already ready
    setTimeout(initializeExtensions, 200);
  }
})();

