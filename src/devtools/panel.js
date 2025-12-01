// Panel JavaScript for GraphQL Testing Toolkit

class GraphQLTestingPanel {
  constructor() {
    try {
      console.log("🚀 [PANEL] Initializing GraphQL Testing Panel...");

      this.rules = new Map();
      this.requestLog = [];
      this.filteredRequestLog = [];
      this.isEnabled = true;
      this.currentEditingRule = null;

      // Get current tab ID with browser compatibility
      const devtools = chrome.devtools || browser.devtools;
      if (!devtools || !devtools.inspectedWindow) {
        throw new Error("DevTools API not available");
      }

      this.tabId = devtools.inspectedWindow.tabId;
      console.log(`📊 [PANEL] Tab ID: ${this.tabId}`);

      // Filter state
      this.filters = {
        search: "",
      };

      // Live timing state
      this.liveTimers = new Map(); // requestId -> intervalId

      // Schema explorer state
      this.currentSchema = null;
      this.schemaData = {
        queries: [],
        mutations: [],
        subscriptions: [],
        types: [],
      };
      this.detectedGraphQLEndpoints = new Map(); // url -> {headers, lastSeen}

      // Search state
      this.searchState = {
        isActive: false,
        currentCodeBlock: null,
        matches: [],
        currentMatchIndex: -1,
        searchTerm: "",
      };

      // Visual Query Builder state
      this.builderState = {
        selectedFields: [],
        currentOperationType: "query",
        currentOperationName: "",
        variables: {},
      };

      this.initializeElements();
      this.setupEventListeners();
      this.setupMessageListener();
      this.loadInitialData();

      console.log("✅ [PANEL] Panel initialized successfully");
    } catch (error) {
      console.error("❌ [PANEL] Failed to initialize panel:", error);
      this.showError("Failed to initialize panel: " + error.message);
    }
  }

  showError(message) {
    const app = document.getElementById("app");
    if (app) {
      app.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #d32f2f;">
          <h2>⚠️ Error</h2>
          <p>${message}</p>
          <p>Please check the browser console for more details.</p>
        </div>
      `;
    }
  }

  initializeElements() {
    console.log("🔧 [PANEL] Initializing DOM elements...");

    // Check if main app container exists
    const app = document.getElementById("app");
    if (!app) {
      throw new Error("Main app container not found");
    }

    // Toolbar elements
    this.enabledToggle = document.getElementById("enabledToggle");
    if (!this.enabledToggle) {
      throw new Error("Enabled toggle not found");
    }
    this.clearLogBtn = document.getElementById("clearLogBtn");
    this.exportBtn = document.getElementById("exportBtn");
    this.importBtn = document.getElementById("importBtn");
    this.importFile = document.getElementById("importFile");

    // Tab elements
    this.tabBtns = document.querySelectorAll(".tab-btn");
    this.tabContents = document.querySelectorAll(".tab-content");

    // Monitor elements
    this.autoScrollToggle = document.getElementById("autoScrollToggle");
    this.requestCount = document.getElementById("requestCount");
    this.requestLogElement = document.getElementById("requestLog");

    // Filter elements
    this.unifiedFilter = document.getElementById("unifiedFilter");
    this.clearFiltersBtn = document.getElementById("clearFiltersBtn");

    // Rules elements
    this.addRuleBtn = document.getElementById("addRuleBtn");
    this.rulesList = document.getElementById("rulesList");

    // Modal elements
    this.ruleEditorModal = document.getElementById("ruleEditorModal");
    this.ruleEditorForm = document.getElementById("ruleEditorForm");
    this.ruleEditorTitle = document.getElementById("ruleEditorTitle");
    this.cancelRuleBtn = document.getElementById("cancelRuleBtn");
    this.modalClose = document.querySelector(".modal-close");

    // Confirmation modal elements
    this.confirmationModal = document.getElementById("confirmationModal");
    this.confirmationMessage = document.getElementById("confirmationMessage");
    this.confirmCancel = document.getElementById("confirmCancel");
    this.confirmDelete = document.getElementById("confirmDelete");

    // Form elements
    this.ruleName = document.getElementById("ruleName");
    this.ruleOperationName = document.getElementById("ruleOperationName");
    this.ruleUrlPattern = document.getElementById("ruleUrlPattern");
    this.ruleAction = document.getElementById("ruleAction");
    this.delayFields = document.getElementById("delayFields");
    this.mockFields = document.getElementById("mockFields");
    this.modifyFields = document.getElementById("modifyFields");
    this.delayMs = document.getElementById("delayMs");
    this.mockResponse = document.getElementById("mockResponse");
    this.modifyVariables = document.getElementById("modifyVariables");
    this.modifyQuery = document.getElementById("modifyQuery");
    this.modifyOperationName = document.getElementById("modifyOperationName");

    // Settings elements
    this.logProfileInputs = document.querySelectorAll(
      'input[name="logProfile"]'
    );
    this.themeInputs = document.querySelectorAll('input[name="theme"]');
    this.saveSettingsBtn = document.getElementById("saveSettingsBtn");
    this.resetSettingsBtn = document.getElementById("resetSettingsBtn");

    // Schema Explorer elements
    this.schemaEndpoint = document.getElementById("schemaEndpoint");
    this.endpointSelect = document.getElementById("endpointSelect");
    this.detectedEndpoints = document.getElementById("detectedEndpoints");
    this.manualEndpoint = document.getElementById("manualEndpoint");
    this.clearEndpointBtn = document.getElementById("clearEndpointBtn");
    this.loadSchemaBtn = document.getElementById("loadSchemaBtn");
    this.schemaSearch = document.getElementById("schemaSearch");
    this.authType = document.getElementById("authType");
    this.authFields = document.getElementById("authFields");
    this.schemaTabBtns = document.querySelectorAll(".schema-tab-btn");
    this.schemaQueries = document.getElementById("schemaQueries");
    this.schemaMutations = document.getElementById("schemaMutations");
    this.schemaSubscriptions = document.getElementById("schemaSubscriptions");
    this.schemaTypes = document.getElementById("schemaTypes");
    this.queryEditor = document.getElementById("queryEditor");

    // Visual Query Builder elements
    this.queryTabBtns = document.querySelectorAll(".query-tab-btn");
    this.operationType = document.getElementById("operationType");
    this.operationName = document.getElementById("operationName");
    this.selectedOperations = document.getElementById("selectedOperations");
    this.selectedFields = document.getElementById("selectedFields");
    this.queryPreview = document.getElementById("queryPreview");
    this.copyQueryBtn = document.getElementById("copyQueryBtn");
    this.executeBuilderQueryBtn = document.getElementById(
      "executeBuilderQueryBtn"
    );
    this.switchToEditorBtn = document.getElementById("switchToEditorBtn");
    this.clearBuilderBtn = document.getElementById("clearBuilderBtn");
    this.builderResponse = document.getElementById("builderResponse");
    this.builderResponseContent = document.getElementById(
      "builderResponseContent"
    );
    this.clearResponseBtn = document.getElementById("clearResponseBtn");
    this.variablesEditor = document.getElementById("variablesEditor");
    this.headersEditor = document.getElementById("headersEditor");
    this.queryResponse = document.getElementById("queryResponse");
    this.executeQueryBtn = document.getElementById("executeQueryBtn");
    this.schemaLoading = document.getElementById("schemaLoading");
    this.schemaError = document.getElementById("schemaError");

    // Search overlay elements
    this.codeSearchOverlay = document.getElementById("codeSearchOverlay");
    this.searchInput = document.getElementById("searchInput");
    this.searchPrevBtn = document.getElementById("searchPrevBtn");
    this.searchNextBtn = document.getElementById("searchNextBtn");
    this.searchResults = document.getElementById("searchResults");
    this.searchCloseBtn = document.getElementById("searchCloseBtn");
    this.searchCaseSensitive = document.getElementById("searchCaseSensitive");
    this.searchWholeWord = document.getElementById("searchWholeWord");
    this.searchRegex = document.getElementById("searchRegex");
  }

  setupEventListeners() {
    // Toolbar events
    this.enabledToggle.addEventListener("change", () => this.toggleEnabled());
    this.clearLogBtn.addEventListener("click", () => this.clearLog());
    this.exportBtn.addEventListener("click", () => this.exportRules());
    this.importBtn.addEventListener("click", () => this.importFile.click());
    this.importFile.addEventListener("change", (e) => this.importRules(e));

    // Tab events
    this.tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => this.switchTab(btn.dataset.tab));
    });

    // Rules events
    this.addRuleBtn.addEventListener("click", () => this.showRuleEditor());

    // Modal events
    this.modalClose.addEventListener("click", () => this.hideRuleEditor());
    this.cancelRuleBtn.addEventListener("click", () => this.hideRuleEditor());
    this.ruleEditorForm.addEventListener("submit", (e) => this.saveRule(e));

    // Confirmation modal events
    this.confirmCancel.addEventListener("click", () => this.hideConfirmation());
    this.confirmDelete.addEventListener("click", () =>
      this.confirmDeleteAction()
    );

    // Form events
    this.ruleAction.addEventListener("change", () => this.updateActionFields());

    // Filter events
    this.unifiedFilter.addEventListener("input", () => this.updateFilters());
    this.clearFiltersBtn.addEventListener("click", () => this.clearFilters());

    // Settings events
    this.saveSettingsBtn.addEventListener("click", () => this.saveSettings());
    this.resetSettingsBtn.addEventListener("click", () => this.resetSettings());

    // Theme change events
    this.themeInputs.forEach((input) => {
      input.addEventListener("change", () => this.handleThemeChange());
    });

    // Schema Explorer events
    this.loadSchemaBtn.addEventListener("click", () => this.loadSchema());
    this.endpointSelect.addEventListener("change", () =>
      this.selectDetectedEndpoint()
    );
    this.clearEndpointBtn.addEventListener("click", () =>
      this.clearSelectedEndpoint()
    );
    this.schemaSearch.addEventListener("input", () => this.filterSchema());
    this.executeQueryBtn.addEventListener("click", () => this.executeQuery());
    this.authType.addEventListener("change", () => this.updateAuthFields());

    // Schema tab events
    this.schemaTabBtns.forEach((btn) => {
      btn.addEventListener("click", () =>
        this.switchSchemaTab(btn.dataset.schemaTab)
      );
    });

    // Visual Query Builder events
    this.queryTabBtns.forEach((btn) => {
      btn.addEventListener("click", () =>
        this.switchQueryTab(btn.dataset.queryTab)
      );
    });
    this.operationType.addEventListener("change", () =>
      this.updateQueryPreview()
    );
    this.operationName.addEventListener("input", () =>
      this.updateQueryPreview()
    );
    this.copyQueryBtn.addEventListener("click", () =>
      this.copyGeneratedQuery()
    );
    this.executeBuilderQueryBtn.addEventListener("click", () =>
      this.executeBuilderQuery()
    );
    this.switchToEditorBtn.addEventListener("click", () =>
      this.switchToEditor()
    );
    this.clearBuilderBtn.addEventListener("click", () => this.clearBuilder());
    this.clearResponseBtn.addEventListener("click", () =>
      this.clearBuilderResponse()
    );

    // Search overlay events
    this.searchInput.addEventListener("input", () => this.performSearch());
    this.searchInput.addEventListener("keydown", (e) =>
      this.handleSearchKeydown(e)
    );
    this.searchPrevBtn.addEventListener("click", () => this.navigateSearch(-1));
    this.searchNextBtn.addEventListener("click", () => this.navigateSearch(1));
    this.searchCloseBtn.addEventListener("click", () => this.closeSearch());
    this.searchCaseSensitive.addEventListener("change", () =>
      this.performSearch()
    );
    this.searchWholeWord.addEventListener("change", () => this.performSearch());
    this.searchRegex.addEventListener("change", () => this.performSearch());

    // Global keyboard events for search
    document.addEventListener("keydown", (e) => this.handleGlobalKeydown(e));

    // Message listeners are set up in setupMessageListener()

    // Modal backdrop click
    this.ruleEditorModal.addEventListener("click", (e) => {
      if (e.target === this.ruleEditorModal) {
        this.hideRuleEditor();
      }
    });
  }

  setupMessageListener() {
    const runtime = chrome.runtime || browser.runtime;
    runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log(
        "📨 [PANEL] Received message:",
        message.type,
        `for tab ${message.tabId}, current tab: ${this.tabId}`
      );

      switch (message.type) {
        case "DEVTOOLS_REQUEST_LOGGED":
          // Only process request logs for this specific tab
          if (message.tabId && message.tabId !== this.tabId) {
            console.log(
              `🚫 [PANEL] Ignoring request log for tab ${message.tabId}, current tab is ${this.tabId}`
            );
            return;
          }
          console.log(
            `✅ [PANEL] Processing request logged for tab ${this.tabId}:`,
            message.data
          );
          this.addRequestToLog(message.data);
          break;

        case "DEVTOOLS_RESPONSE_LOGGED":
          // Only process response logs for this specific tab
          if (message.tabId && message.tabId !== this.tabId) {
            console.log(
              `🚫 [PANEL] Ignoring response log for tab ${message.tabId}, current tab is ${this.tabId}`
            );
            return;
          }
          console.log(
            `✅ [PANEL] Processing response logged for tab ${this.tabId}:`,
            message.data
          );
          this.updateRequestResponse(message.data.id, message.data);
          break;

        // Rule synchronization messages - processed globally for all tabs
        case "DEVTOOLS_RULE_ADDED":
          console.log(`🌐 [PANEL] Rule added globally: ${message.data.ruleId}`);
          this.rules.set(message.data.ruleId, message.data.rule);
          this.updateRulesList();
          break;

        case "DEVTOOLS_RULE_UPDATED":
          console.log(
            `🌐 [PANEL] Rule updated globally: ${message.data.ruleId}`
          );
          if (message.data.rule) {
            this.rules.set(message.data.ruleId, message.data.rule);
          }
          this.updateRulesList();
          break;

        case "DEVTOOLS_RULE_DELETED":
          console.log(
            `🌐 [PANEL] Rule deleted globally: ${message.data.ruleId}`
          );
          this.rules.delete(message.data.ruleId);
          this.updateRulesList();
          break;

        case "DEVTOOLS_TAB_STATUS_UPDATED":
          // Handle tab status updates from popup or other sources
          if (message.tabId && message.tabId === this.tabId) {
            console.log(
              `🔄 [PANEL] Tab status updated for tab ${this.tabId}:`,
              message.data
            );
            if (typeof message.data.enabled !== "undefined") {
              this.isEnabled = message.data.enabled;
              this.enabledToggle.checked = message.data.enabled;
              console.log(
                `🔄 [PANEL] Updated toggle state to: ${message.data.enabled}`
              );
            }
          }
          break;

        // All other messages are processed globally for all tabs
        default:
          console.log(`🌐 [PANEL] Processing global message: ${message.type}`);
          // Handle other message types here if needed in the future
          break;
      }
    });
  }

  async loadInitialData() {
    try {
      // Notify background that DevTools panel is open for this tab
      await this.sendMessage({
        type: "DEVTOOLS_OPENED",
        tabId: this.tabId,
      });

      const response = await this.sendMessage({
        type: "GET_RULES",
        tabId: this.tabId,
      });

      if (response && response.success) {
        console.log(
          `📥 [PANEL] Loaded data from background for tab ${this.tabId}:`,
          response.data
        );
        this.rules = new Map(response.data.rules);
        this.isEnabled = response.data.tabEnabled; // Tab-specific enabled state
        this.requestLog = response.data.requestLog || [];

        console.log(
          `📋 [PANEL] Panel rules after loading:`,
          Array.from(this.rules.keys())
        );
        console.log(`🔍 [PANEL] Tab enabled state:`, this.isEnabled);

        this.updateUI();
      } else {
        console.log("No initial data available, starting fresh");
        this.updateUI();
      }

      // Load settings
      await this.loadSettings();

      // Initialize theme
      this.initializeTheme();

      // Initialize auth fields
      this.updateAuthFields();
    } catch (error) {
      console.error("Failed to load initial data:", error);
      this.updateUI(); // Still show UI even if data load fails
    }
  }

  updateUI() {
    this.enabledToggle.checked = this.isEnabled;
    // Initialize filtered log
    this.applyFilters();
    this.updateRequestLog();
    this.updateRulesList();
  }

  switchTab(tabName) {
    // Update tab buttons
    this.tabBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    // Update tab contents
    this.tabContents.forEach((content) => {
      content.classList.toggle("active", content.id === `${tabName}-tab`);
    });
  }

  async toggleEnabled() {
    const newState = this.enabledToggle.checked;

    try {
      const response = await this.sendMessage({
        type: "TOGGLE_TAB_ENABLED",
        tabId: this.tabId,
        enabled: newState,
      });

      if (response && response.success) {
        this.isEnabled = newState;
        console.log(
          `📤 [PANEL] Tab ${this.tabId} monitoring state updated:`,
          newState
        );

        // Update UI to reflect new state
        this.updateUI();
      } else {
        // Revert toggle if failed
        this.enabledToggle.checked = !newState;
        console.error("❌ [PANEL] Failed to toggle state, reverting");
      }
    } catch (error) {
      console.error("❌ [PANEL] Failed to toggle tab enabled state:", error);
      // Revert toggle if failed
      this.enabledToggle.checked = !newState;
    }
  }

  async clearLog() {
    this.requestLog = [];
    this.filteredRequestLog = []; // Also clear filtered log

    try {
      await this.sendMessage({
        type: "CLEAR_LOG",
        tabId: this.tabId,
      });
      this.updateRequestLog();
    } catch (error) {
      console.error("Failed to clear log:", error);
    }
  }

  addRequestToLog(request) {
    // Debug: Log the request structure to understand timestamp fields
    if (this.requestLog.length < 3) {
      // Only log first few requests to avoid spam
      console.log("Request structure:", {
        id: request.id,
        allKeys: Object.keys(request),
        timestamp: request.timestamp,
        responseTimestamp: request.responseTimestamp,
        startTime: request.startTime,
        endTime: request.endTime,
        requestTimestamp: request.requestTimestamp,
        completedTime: request.completedTime,
      });
    }

    // Detect GraphQL endpoints for schema explorer
    this.detectGraphQLEndpoint(request);

    this.requestLog.push(request);

    // Start live timing for pending requests
    if (!request.response && !request.responseError) {
      this.startLiveTiming(request.id);
    }

    // Keep log size manageable
    if (this.requestLog.length > 100) {
      this.requestLog = this.requestLog.slice(-100);
    }

    // Apply filters and update display
    this.applyFilters();
    this.updateRequestLog();

    // Auto-scroll if enabled
    if (this.autoScrollToggle.checked) {
      const lastItem = this.requestLogElement.lastElementChild;
      if (lastItem) {
        lastItem.scrollIntoView({ behavior: "smooth" });
      }
    }
  }

  // Update filter state and apply filters
  updateFilters() {
    this.filters.search = this.unifiedFilter.value.trim().toLowerCase();

    this.applyFilters();
    this.updateRequestLog();
  }

  // Apply current filters to request log
  applyFilters() {
    this.filteredRequestLog = this.requestLog.filter((request) => {
      // Unified search filter - searches in URL, operation name, and error content
      if (this.filters.search) {
        const searchTerm = this.filters.search;
        let matchFound = false;

        // Search in URL
        if (request.url && request.url.toLowerCase().includes(searchTerm)) {
          matchFound = true;
        }

        // Search in operation name
        if (
          !matchFound &&
          request.operationName &&
          request.operationName.toLowerCase().includes(searchTerm)
        ) {
          matchFound = true;
        }

        // Search for error-related terms
        if (
          !matchFound &&
          (searchTerm === "error" || searchTerm === "errors")
        ) {
          if (
            request.responseError ||
            (request.responseStatus && request.responseStatus >= 400)
          ) {
            matchFound = true;
          }
        }

        // Search in error messages
        if (
          !matchFound &&
          request.responseError &&
          request.responseError.toLowerCase().includes(searchTerm)
        ) {
          matchFound = true;
        }

        // Search in response data for error content
        if (
          !matchFound &&
          request.response &&
          typeof request.response === "object"
        ) {
          const responseStr = JSON.stringify(request.response).toLowerCase();
          if (responseStr.includes(searchTerm)) {
            matchFound = true;
          }
        }

        if (!matchFound) {
          return false;
        }
      }

      return true;
    });
  }

  // Clear all filters
  clearFilters() {
    this.unifiedFilter.value = "";

    this.filters = {
      search: "",
    };

    this.applyFilters();
    this.updateRequestLog();
  }

  updateRequestResponse(requestId, responseData) {
    console.log(
      `🔄 [PANEL] Updating response for request ${requestId}:`,
      responseData
    );

    // Find the request in the log and update it
    const request = this.requestLog.find((req) => req.id === requestId);
    if (request) {
      console.log(
        `✅ [PANEL] Found request ${requestId}, updating response data`
      );
      request.response = responseData.response;
      request.responseStatus =
        responseData.responseStatus || responseData.status;
      request.responseStatusText =
        responseData.responseStatusText || responseData.statusText;
      request.responseHeaders =
        responseData.responseHeaders || responseData.headers;
      request.responseError = responseData.responseError || responseData.error;

      // Set response timestamp - try multiple possible field names
      request.responseTimestamp =
        responseData.responseTimestamp ||
        responseData.timestamp ||
        responseData.endTime ||
        responseData.completedTime ||
        Date.now(); // Fallback to current time

      // Stop live timing for this request
      this.stopLiveTiming(requestId);

      // Debug timing data
      const startMs =
        typeof request.timestamp === "string"
          ? new Date(request.timestamp).getTime()
          : request.timestamp;
      const endMs =
        typeof request.responseTimestamp === "string"
          ? new Date(request.responseTimestamp).getTime()
          : request.responseTimestamp;

      console.log("Timing data for response:", {
        requestId,
        originalTimestamp: request.timestamp,
        responseTimestamp: request.responseTimestamp,
        startMs,
        endMs,
        calculatedDuration: endMs - startMs,
      });

      // Reapply filters since response data might affect filtering (errors only)
      this.applyFilters();
      this.updateRequestLog();
      console.log(`🎨 [PANEL] Request log updated for ${requestId}`);
    } else {
      console.warn(
        `⚠️ [PANEL] Could not find request ${requestId} in log. Available IDs:`,
        this.requestLog.map((r) => r.id)
      );
    }
  }

  // Highlight code using highlight.js
  highlightCode(code, language) {
    if (!code) return '<span class="no-data">N/A</span>';

    // For objects, stringify them first
    if (typeof code === "object") {
      code = JSON.stringify(code, null, 2);
    }

    try {
      if (window.hljs) {
        const result = window.hljs.highlight(code, { language });
        return result.value;
      } else {
        // Fallback if hljs isn't loaded yet
        return this.escapeHtml(code);
      }
    } catch (error) {
      console.warn("Highlight.js error:", error);
      return this.escapeHtml(code);
    }
  }

  // Escape HTML to prevent XSS
  escapeHtml(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Apply highlight.js to all code blocks
  applyHighlighting() {
    if (window.hljs) {
      // Highlight all code blocks that haven't been highlighted yet
      document.querySelectorAll("pre code:not(.hljs)").forEach((block) => {
        window.hljs.highlightElement(block);
      });
    }
  }

  updateRequestLog() {
    // Show total and filtered counts
    const totalCount = this.requestLog.length;
    const filteredCount = this.filteredRequestLog.length;

    if (totalCount !== filteredCount) {
      this.requestCount.textContent = `${filteredCount} of ${totalCount} requests`;
    } else {
      this.requestCount.textContent = `${totalCount} requests`;
    }

    if (this.filteredRequestLog.length === 0) {
      if (totalCount === 0) {
        this.requestLogElement.innerHTML =
          '<div class="no-requests">No GraphQL requests detected yet...</div>';
      } else {
        this.requestLogElement.innerHTML =
          '<div class="no-requests">No requests match current filters...</div>';
      }
      return;
    }

    const html = this.filteredRequestLog
      .map((request, filteredIndex) => {
        // Find the original index in the full request log for proper data access
        const originalIndex = this.requestLog.findIndex(
          (r) => r.id === request.id
        );

        const responseStatus = request.responseStatus
          ? `<span class="response-status ${
              request.responseStatus < 300 ? "success" : "error"
            }">${request.responseStatus}</span>`
          : '<span class="response-status pending">Pending</span>';

        // Calculate timing if available
        const timing = this.calculateRequestTiming(request);
        const timingDisplay = timing
          ? `<span class="request-timing" data-request-id="${request.id}">${timing}</span>`
          : "";

        // Check if request matches any rules
        const matchedRules = this.checkRuleMatch(request);
        const ruleClass = matchedRules.length > 0 ? "rule-matched" : "";
        const ruleIndicator =
          matchedRules.length > 0
            ? `<span class="rule-indicator" title="Matched Rules: ${matchedRules.join(
                ", "
              )}">🎯 ${matchedRules.join(", ")}</span>`
            : "";

        return `
      <div class="request-item ${ruleClass}" data-request-index="${originalIndex}" data-filtered-index="${filteredIndex}">
        <div class="request-header" data-request-index="${originalIndex}">
          <div class="request-info">
            <span class="operation-name">${
              request.operationName || "Unnamed Operation"
            }</span>
            <div class="request-meta">
              <span class="request-method">POST</span>
              ${timingDisplay}
              ${ruleIndicator}
              <span class="request-timestamp">${new Date(
                request.timestamp
              ).toLocaleTimeString()}</span>
            </div>
          </div>
          <div class="request-status-actions">
            ${responseStatus}
            <button class="btn-create-rule" data-request-index="${originalIndex}">Create Rule</button>
          </div>
        </div>
        <div class="request-url" style="padding: 0 12px 8px 12px; font-size: 11px; color: var(--text-secondary);">${
          request.url
        }</div>
        <div class="request-details" id="details-${originalIndex}" style="display: none; padding: 0 12px 12px 12px;">
          <div class="detail-section">
            <div class="detail-header" data-section="query-${originalIndex}">
              <strong>Query</strong>
              <div class="detail-actions">
                <button class="btn-copy" data-copy-type="query" data-request-index="${originalIndex}">Copy</button>
                <span class="expand-indicator">▶</span>
              </div>
            </div>
            <div class="code-block collapsed" id="query-${originalIndex}" data-content="query"></div>
          </div>
          <div class="detail-section">
            <div class="detail-header" data-section="variables-${originalIndex}">
              <strong>Variables</strong>
              <div class="detail-actions">
                <button class="btn-copy" data-copy-type="variables" data-request-index="${originalIndex}">Copy</button>
                <span class="expand-indicator">▶</span>
              </div>
            </div>
            <div class="code-block collapsed" id="variables-${originalIndex}" data-content="variables"></div>
          </div>
          <div class="detail-section">
            <div class="detail-header" data-section="response-${originalIndex}">
              <strong>Response</strong>
              <div class="detail-actions">
                <button class="btn-copy" data-copy-type="response" data-request-index="${originalIndex}">Copy</button>
                <span class="expand-indicator">▶</span>
              </div>
            </div>
            <div class="code-block collapsed" id="response-${originalIndex}" data-content="response"></div>
          </div>
          ${
            request.requestHeaders || request.responseHeaders
              ? `
          <div class="detail-section">
            <div class="detail-header" data-section="headers-${originalIndex}">
              <strong>Headers</strong>
              <div class="detail-actions">
                <button class="btn-copy" data-copy-type="headers" data-request-index="${originalIndex}">Copy</button>
                <span class="expand-indicator">▶</span>
              </div>
            </div>
            <div class="code-block collapsed" id="headers-${originalIndex}" data-content="headers"></div>
          </div>`
              : ""
          }
        </div>
      </div>`;
      })
      .join("");

    this.requestLogElement.innerHTML = html;

    // Populate code blocks with syntax highlighting
    this.populateCodeBlocks();

    // Make code blocks searchable
    this.makeCodeBlocksSearchable();

    // Add event listeners for request header clicks (main expand/collapse)
    this.requestLogElement
      .querySelectorAll(".request-header")
      .forEach((header) => {
        header.addEventListener("click", (e) => {
          // Don't trigger if clicking on buttons
          if (e.target.tagName === "BUTTON") return;

          const index = parseInt(header.dataset.requestIndex);
          this.toggleRequestDetails(index);
        });
      });

    // Add event listeners for detail section headers (individual section expand/collapse)
    this.requestLogElement
      .querySelectorAll(".detail-header")
      .forEach((header) => {
        header.addEventListener("click", (e) => {
          // Don't trigger if clicking on copy button
          if (e.target.classList.contains("btn-copy")) return;

          e.stopPropagation();
          const sectionId = header.dataset.section;
          this.toggleDetailSection(header, sectionId);
        });
      });

    // Add event listeners for create rule buttons
    this.requestLogElement
      .querySelectorAll(".btn-create-rule")
      .forEach((button) => {
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          const index = parseInt(button.dataset.requestIndex);
          this.createRuleFromRequest(index);
        });
      });

    // Add event listeners for copy buttons
    this.requestLogElement.querySelectorAll(".btn-copy").forEach((button) => {
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        this.copyToClipboard(button);
      });
    });
  }

  populateCodeBlocks() {
    // Populate code blocks for all filtered requests using their original indices
    this.filteredRequestLog.forEach((request) => {
      const originalIndex = this.requestLog.findIndex(
        (r) => r.id === request.id
      );

      // Populate query
      const queryBlock = document.getElementById(`query-${originalIndex}`);
      if (queryBlock) {
        const queryCode = this.escapeHtml(request.query || "");
        queryBlock.innerHTML = `<pre><code class="language-graphql">${queryCode}</code></pre>`;
        queryBlock.classList.add("collapsed");
      }

      // Populate variables
      const variablesBlock = document.getElementById(
        `variables-${originalIndex}`
      );
      if (variablesBlock) {
        const variablesCode = this.escapeHtml(
          typeof request.variables === "object"
            ? JSON.stringify(request.variables, null, 2)
            : request.variables || "{}"
        );
        variablesBlock.innerHTML = `<pre><code class="language-json">${variablesCode}</code></pre>`;
        variablesBlock.classList.add("collapsed");
      }

      // Populate response
      const responseBlock = document.getElementById(
        `response-${originalIndex}`
      );
      if (responseBlock) {
        if (request.response) {
          const responseCode = this.escapeHtml(
            typeof request.response === "object"
              ? JSON.stringify(request.response, null, 2)
              : request.response
          );
          responseBlock.innerHTML = `<pre><code class="language-json">${responseCode}</code></pre>`;
        } else if (request.responseError) {
          // Don't put HTML spans inside code blocks - just use plain text with CSS classes on the container
          const errorText = `Error: ${request.responseError}`;
          responseBlock.innerHTML = `<pre class="error-response"><code>${this.escapeHtml(
            errorText
          )}</code></pre>`;
        } else {
          // Don't put HTML spans inside code blocks - just use plain text with CSS classes on the container
          const pendingText = "Waiting for response...";
          responseBlock.innerHTML = `<pre class="pending-response"><code>${this.escapeHtml(
            pendingText
          )}</code></pre>`;
        }
        responseBlock.classList.add("collapsed");
      }

      // Populate headers if available (both request and response headers)
      const headersBlock = document.getElementById(`headers-${originalIndex}`);
      if (headersBlock && (request.requestHeaders || request.responseHeaders)) {
        let headersData = {};

        if (request.requestHeaders) {
          headersData["Request Headers"] = request.requestHeaders;
        }
        if (request.responseHeaders) {
          headersData["Response Headers"] = request.responseHeaders;
        }

        const headersCode = this.escapeHtml(
          JSON.stringify(headersData, null, 2)
        );
        headersBlock.innerHTML = `<pre><code class="language-json">${headersCode}</code></pre>`;
        headersBlock.classList.add("collapsed");
      }
    });

    // Apply highlight.js after populating all blocks
    setTimeout(() => this.applyHighlighting(), 100);
  }

  async copyToClipboard(button) {
    const requestIndex = parseInt(button.dataset.requestIndex);
    const copyType = button.dataset.copyType;
    const request = this.requestLog[requestIndex];

    if (!request) return;

    let textToCopy = "";

    switch (copyType) {
      case "query":
        textToCopy = request.query || "";
        break;
      case "variables":
        textToCopy = JSON.stringify(request.variables, null, 2);
        break;
      case "response":
        textToCopy = request.response
          ? JSON.stringify(request.response, null, 2)
          : request.responseError || "No response available";
        break;
      case "headers":
        let headersData = {};
        if (request.requestHeaders) {
          headersData["Request Headers"] = request.requestHeaders;
        }
        if (request.responseHeaders) {
          headersData["Response Headers"] = request.responseHeaders;
        }
        textToCopy =
          Object.keys(headersData).length > 0
            ? JSON.stringify(headersData, null, 2)
            : "";
        break;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);

      // Show feedback
      const originalText = button.textContent;
      button.textContent = "✓ Copied";
      button.style.background = "#28a745";
      button.style.color = "white";

      setTimeout(() => {
        button.textContent = originalText;
        button.style.background = "";
        button.style.color = "";
      }, 1000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);

      // Fallback: show text in a modal or alert
      const fallbackText = `Failed to copy automatically. Here's the content:\n\n${textToCopy}`;
      alert(fallbackText);
    }
  }

  updateRulesList() {
    if (this.rules.size === 0) {
      this.rulesList.innerHTML =
        '<div class="no-rules">No rules configured yet. Click "Add Rule" to get started.</div>';
      return;
    }

    const html = Array.from(this.rules.values())
      .map(
        (rule) => `
      <div class="rule-item ${
        rule.enabled ? "rule-enabled" : "rule-disabled"
      }" data-rule-id="${rule.id}">
        <div class="rule-header">
          <span class="rule-name">${rule.name}</span>
          <div class="rule-actions">
            <label class="rule-toggle">
              <input type="checkbox" ${
                rule.enabled ? "checked" : ""
              } data-rule-id="${rule.id}" class="rule-toggle-input">
              <span>Enabled</span>
            </label>
            <button class="btn btn-secondary rule-edit-btn" data-rule-id="${
              rule.id
            }">Edit</button>
            <button class="btn btn-secondary rule-delete-btn" data-rule-id="${
              rule.id
            }">Delete</button>
          </div>
        </div>
        <div class="rule-details">
          <div><strong>Operation:</strong> ${rule.operationName || "Any"}</div>
          ${
            rule.urlPattern
              ? `<div><strong>URL:</strong> ${rule.urlPattern}</div>`
              : ""
          }
          <div><strong>Action:</strong> ${rule.action}${
          rule.action === "delay" ? ` (${rule.delayMs}ms)` : ""
        }</div>
        </div>
      </div>
    `
      )
      .join("");

    this.rulesList.innerHTML = html;

    // Add event listeners for rule controls
    this.rulesList
      .querySelectorAll(".rule-toggle-input")
      .forEach((checkbox) => {
        checkbox.addEventListener("change", (e) => {
          const ruleId = e.target.dataset.ruleId;
          this.toggleRule(ruleId);
        });
      });

    this.rulesList.querySelectorAll(".rule-edit-btn").forEach((button) => {
      button.addEventListener("click", (e) => {
        const ruleId = e.target.dataset.ruleId;
        this.editRule(ruleId);
      });
    });

    const deleteButtons = this.rulesList.querySelectorAll(".rule-delete-btn");
    console.log(
      `🔧 [PANEL] Found ${deleteButtons.length} delete buttons to attach listeners`
    );

    deleteButtons.forEach((button, index) => {
      const ruleId = button.dataset.ruleId;
      console.log(
        `🔧 [PANEL] Attaching delete listener to button ${
          index + 1
        } for rule: ${ruleId}`
      );

      button.addEventListener("click", (e) => {
        console.log(`🗑️ [PANEL] Delete button clicked for rule: ${ruleId}`);
        this.deleteRule(ruleId);
      });
    });
  }

  showRuleEditor(rule = null) {
    this.currentEditingRule = rule;

    if (rule) {
      this.ruleEditorTitle.textContent = "Edit Rule";
      this.ruleName.value = rule.name;
      this.ruleOperationName.value = rule.operationName || "";
      this.ruleUrlPattern.value = rule.urlPattern || "";
      this.ruleAction.value = rule.action;

      if (rule.action === "delay") {
        this.delayMs.value = rule.delayMs || 1000;
      } else if (rule.action === "mock") {
        this.mockResponse.value = JSON.stringify(rule.mockResponse, null, 2);
      } else if (rule.action === "modify") {
        this.modifyVariables.value = JSON.stringify(
          rule.modifications?.variables || {},
          null,
          2
        );
        this.modifyQuery.value = rule.modifications?.query || "";
        this.modifyOperationName.value =
          rule.modifications?.operationName || "";
      }
    } else {
      this.ruleEditorTitle.textContent = "Add New Rule";
      this.ruleEditorForm.reset();
    }

    this.updateActionFields();
    this.ruleEditorModal.classList.add("active");
  }

  hideRuleEditor() {
    this.ruleEditorModal.classList.remove("active");
    this.currentEditingRule = null;
  }

  updateActionFields() {
    const action = this.ruleAction.value;

    this.delayFields.style.display = action === "delay" ? "block" : "none";
    this.mockFields.style.display = action === "mock" ? "block" : "none";
    this.modifyFields.style.display = action === "modify" ? "block" : "none";
  }

  async saveRule(e) {
    e.preventDefault();

    const rule = {
      name: this.ruleName.value,
      operationName: this.ruleOperationName.value,
      urlPattern: this.ruleUrlPattern.value.trim() || null, // null if empty
      action: this.ruleAction.value,
      enabled: true,
    };

    // Add action-specific data
    if (rule.action === "delay") {
      rule.delayMs = parseInt(this.delayMs.value) || 1000;
    } else if (rule.action === "mock") {
      try {
        rule.mockResponse = JSON.parse(this.mockResponse.value);
      } catch (error) {
        alert("Invalid JSON in mock response");
        return;
      }
    } else if (rule.action === "modify") {
      try {
        rule.modifications = {};

        // Parse variables if provided
        if (this.modifyVariables.value.trim()) {
          rule.modifications.variables = JSON.parse(this.modifyVariables.value);
        }

        // Add query if provided
        if (this.modifyQuery.value.trim()) {
          rule.modifications.query = this.modifyQuery.value.trim();
        }

        // Add operation name if provided
        if (this.modifyOperationName.value.trim()) {
          rule.modifications.operationName =
            this.modifyOperationName.value.trim();
        }

        // Ensure at least one modification is specified
        if (Object.keys(rule.modifications).length === 0) {
          alert(
            "Please specify at least one modification (variables, query, or operation name)"
          );
          return;
        }
      } catch (error) {
        alert("Invalid JSON in modify variables: " + error.message);
        return;
      }
    }

    try {
      const runtime = chrome.runtime || browser.runtime;

      if (this.currentEditingRule) {
        // Update existing rule
        const response = await this.sendMessage({
          type: "UPDATE_RULE",
          ruleId: this.currentEditingRule.id,
          rule,
        });

        if (response && response.success) {
          console.log(
            `✅ [PANEL] Rule updated with ID: ${this.currentEditingRule.id}`
          );
          console.log(`📋 [PANEL] Updated rule data:`, rule);
          this.rules.set(this.currentEditingRule.id, {
            ...rule,
            id: this.currentEditingRule.id,
          });
          console.log(
            `📋 [PANEL] Panel rules after update:`,
            Array.from(this.rules.keys())
          );
        }
      } else {
        // Add new rule
        const response = await this.sendMessage({
          type: "ADD_RULE",
          rule,
        });

        if (response && response.success) {
          // Use rule ID returned by background script
          rule.id = response.ruleId;
          console.log(`✅ [PANEL] Rule added with ID: ${rule.id}`);
          console.log(`📋 [PANEL] Adding rule to panel rules:`, rule);
          this.rules.set(rule.id, rule);
          console.log(
            `📋 [PANEL] Panel rules after adding:`,
            Array.from(this.rules.keys())
          );
        }
      }

      this.updateRulesList();
      this.hideRuleEditor();
    } catch (error) {
      console.error("Failed to save rule:", error);
      alert("Failed to save rule: " + error.message);
    }
  }

  // Helper method for reliable message sending
  async sendMessage(message) {
    console.log(`📤 [PANEL] Sending message:`, message.type, message);

    return new Promise((resolve) => {
      const runtime = chrome.runtime || browser.runtime;

      try {
        runtime.sendMessage(message, (response) => {
          if (runtime.lastError) {
            console.error("❌ [PANEL] Runtime error:", runtime.lastError);
            resolve({ success: false, error: runtime.lastError.message });
          } else {
            console.log(`✅ [PANEL] Message response:`, message.type, response);
            resolve(response || { success: false, error: "No response" });
          }
        });
      } catch (error) {
        console.error("❌ [PANEL] Send message error:", error);
        resolve({ success: false, error: error.message });
      }
    });
  }

  async toggleRule(ruleId) {
    console.log(`🔄 [PANEL] Toggling rule ${ruleId}`);
    console.log(
      `📋 [PANEL] Current panel rules:`,
      Array.from(this.rules.keys())
    );

    const rule = this.rules.get(ruleId);
    if (!rule) {
      console.error(`❌ [PANEL] Rule ${ruleId} not found in panel rules`);
      return;
    }

    console.log(`🔍 [PANEL] Current rule state:`, rule);
    rule.enabled = !rule.enabled;
    console.log(`🔄 [PANEL] New rule state:`, rule);

    try {
      await this.sendMessage({
        type: "UPDATE_RULE",
        ruleId,
        rule,
      });

      this.updateRulesList();
    } catch (error) {
      console.error("Failed to toggle rule:", error);
    }
  }

  editRule(ruleId) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      this.showRuleEditor(rule);
    }
  }

  async deleteRule(ruleId) {
    console.log(`🗑️ [PANEL] deleteRule called for: ${ruleId}`);
    console.log(
      `📋 [PANEL] Current panel rules before delete:`,
      Array.from(this.rules.keys())
    );

    // Store the rule ID for the confirmation action
    this.pendingDeleteRuleId = ruleId;

    // Show custom confirmation modal
    this.showConfirmation(`Are you sure you want to delete this rule?`);
  }

  async performDelete(ruleId) {
    console.log(`✅ [PANEL] User confirmed deletion for rule: ${ruleId}`);

    try {
      console.log(`📤 [PANEL] Sending DELETE_RULE message for: ${ruleId}`);
      const response = await this.sendMessage({
        type: "DELETE_RULE",
        ruleId,
      });

      console.log(`📨 [PANEL] DELETE_RULE response:`, response);

      if (response && response.success) {
        console.log(`🗑️ [PANEL] Removing rule ${ruleId} from panel rules`);
        this.rules.delete(ruleId);
        console.log(
          `📋 [PANEL] Panel rules after delete:`,
          Array.from(this.rules.keys())
        );
        this.updateRulesList();
        console.log(`✅ [PANEL] Rule deletion completed for: ${ruleId}`);
      } else {
        console.error(`❌ [PANEL] DELETE_RULE failed:`, response);
      }
    } catch (error) {
      console.error("❌ [PANEL] Failed to delete rule:", error);
    }
  }

  async exportRules() {
    try {
      const response = await this.sendMessage({ type: "EXPORT_RULES" });
      if (response && response.success) {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], {
          type: "application/json",
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `graphql-testing-rules-${
          new Date().toISOString().split("T")[0]
        }.json`;
        a.click();

        URL.revokeObjectURL(url);
      } else {
        alert(
          "Failed to export rules: " + (response?.error || "Unknown error")
        );
      }
    } catch (error) {
      console.error("Failed to export rules:", error);
      alert("Failed to export rules: " + error.message);
    }
  }

  async importRules(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      await this.sendMessage({
        type: "IMPORT_RULES",
        data,
      });

      await this.loadInitialData();
      alert(`Imported ${data.rules?.length || 0} rules successfully`);
    } catch (error) {
      console.error("Failed to import rules:", error);
      alert("Failed to import rules. Please check the file format.");
    }

    // Reset file input
    e.target.value = "";
  }

  toggleRequestDetails(index) {
    const detailsElement = document.getElementById(`details-${index}`);
    if (detailsElement) {
      const isVisible = detailsElement.style.display !== "none";
      detailsElement.style.display = isVisible ? "none" : "block";
    }
  }

  toggleDetailSection(headerElement, sectionId) {
    const codeBlock = document.getElementById(sectionId);
    const expandIndicator = headerElement.querySelector(".expand-indicator");

    if (codeBlock && expandIndicator) {
      const isCollapsed = codeBlock.classList.contains("collapsed");

      if (isCollapsed) {
        codeBlock.classList.remove("collapsed");
        codeBlock.classList.add("expanded");
        headerElement.classList.add("expanded");
        expandIndicator.textContent = "▼";
      } else {
        codeBlock.classList.remove("expanded");
        codeBlock.classList.add("collapsed");
        headerElement.classList.remove("expanded");
        expandIndicator.textContent = "▶";

        // Close search overlay if this code block is being collapsed and is currently active
        if (
          this.searchState.isActive &&
          this.searchState.currentCodeBlock === codeBlock
        ) {
          this.closeSearch();
        }
      }
    }
  }

  createRuleFromRequest(index) {
    const request = this.requestLog[index];
    if (!request) return;

    // Pre-fill the rule editor with request data
    this.showRuleEditor();

    // Set default values based on request
    this.ruleName.value = `Rule for ${request.operationName || "Unnamed"}`;
    this.ruleOperationName.value = request.operationName || "";
    this.ruleUrlPattern.value = this.extractDomainFromUrl(request.url) || "";
    this.ruleAction.value = "delay";
    this.delayMs.value = "2000";

    this.updateActionFields();
  }

  extractDomainFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      // Fallback to simple string extraction
      const match = url.match(/https?:\/\/([^\/]+)/);
      return match ? match[1] : "";
    }
  }

  showConfirmation(message) {
    console.log(`📋 [PANEL] Showing confirmation modal: ${message}`);
    this.confirmationMessage.textContent = message;
    this.confirmationModal.classList.add("active");
  }

  hideConfirmation() {
    console.log(`❌ [PANEL] User cancelled confirmation`);
    this.confirmationModal.classList.remove("active");
    this.pendingDeleteRuleId = null;
  }

  confirmDeleteAction() {
    console.log(
      `✅ [PANEL] User confirmed action for rule: ${this.pendingDeleteRuleId}`
    );

    if (this.pendingDeleteRuleId) {
      const ruleId = this.pendingDeleteRuleId;
      this.pendingDeleteRuleId = null;
      this.confirmationModal.classList.remove("active");
      this.performDelete(ruleId);
    }
  }

  // Settings methods
  async saveSettings() {
    const selectedProfile = document.querySelector(
      'input[name="logProfile"]:checked'
    );
    const selectedTheme = document.querySelector('input[name="theme"]:checked');

    if (!selectedProfile || !selectedTheme) return;

    const logProfile = selectedProfile.value;
    const theme = selectedTheme.value;

    try {
      const response = await this.sendMessage({
        type: "UPDATE_SETTINGS",
        settings: { logProfile, theme },
      });

      if (response && response.success) {
        console.log(
          `Settings saved: Log profile set to ${logProfile}, Theme set to ${theme}`
        );

        // Apply theme immediately
        this.applyTheme(theme);
        localStorage.setItem("graphql-toolkit-theme", theme);

        // Show success feedback
        this.showSettingsFeedback("Settings saved successfully!", "success");
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      this.showSettingsFeedback("Failed to save settings", "error");
    }
  }

  async resetSettings() {
    try {
      const response = await this.sendMessage({
        type: "RESET_SETTINGS",
      });

      if (response && response.success) {
        // Reset UI to defaults
        document.querySelector(
          'input[name="logProfile"][value="basic"]'
        ).checked = true;
        document.querySelector(
          'input[name="theme"][value="system"]'
        ).checked = true;

        // Reset theme to system
        this.applyTheme("system");
        localStorage.setItem("graphql-toolkit-theme", "system");

        this.showSettingsFeedback("Settings reset to defaults", "success");
      }
    } catch (error) {
      console.error("Failed to reset settings:", error);
      this.showSettingsFeedback("Failed to reset settings", "error");
    }
  }

  async loadSettings() {
    try {
      const response = await this.sendMessage({
        type: "GET_SETTINGS",
      });

      if (response && response.success && response.settings) {
        const logProfile = response.settings.logProfile || "basic";
        const profileInput = document.querySelector(
          `input[name="logProfile"][value="${logProfile}"]`
        );
        if (profileInput) {
          profileInput.checked = true;
        }

        // Theme is handled separately by initializeTheme() since it uses localStorage
        // This allows theme to persist even if the extension's settings are reset
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  showSettingsFeedback(message, type) {
    // Create or update feedback element
    let feedback = document.querySelector(".settings-feedback");
    if (!feedback) {
      feedback = document.createElement("div");
      feedback.className = "settings-feedback";
      this.saveSettingsBtn.parentNode.appendChild(feedback);
    }

    feedback.textContent = message;
    feedback.className = `settings-feedback ${type}`;
    feedback.style.display = "block";

    // Hide after 3 seconds
    setTimeout(() => {
      feedback.style.display = "none";
    }, 3000);
  }

  // Theme Management Methods
  initializeTheme() {
    // Get saved theme preference or default to system
    const savedTheme =
      localStorage.getItem("graphql-toolkit-theme") || "system";

    // Set the radio button
    const themeInput = document.querySelector(
      `input[name="theme"][value="${savedTheme}"]`
    );
    if (themeInput) {
      themeInput.checked = true;
    }

    // Apply the theme (this will also apply highlight.js theme)
    this.applyTheme(savedTheme);

    // Listen for system theme changes
    this.setupSystemThemeListener();
  }

  handleThemeChange() {
    const selectedTheme = document.querySelector('input[name="theme"]:checked');
    if (selectedTheme) {
      const theme = selectedTheme.value;
      this.applyTheme(theme);
      localStorage.setItem("graphql-toolkit-theme", theme);
    }
  }

  applyTheme(theme) {
    const html = document.documentElement;

    if (theme === "system") {
      // Remove explicit theme attribute to use system preference
      html.removeAttribute("data-theme");
    } else {
      // Set explicit theme
      html.setAttribute("data-theme", theme);
    }

    // Apply highlight.js theme
    this.applyHighlightTheme(theme);

    console.log(`Theme applied: ${theme}`);
  }

  applyHighlightTheme(theme) {
    const highlightThemeLink = document.getElementById("highlight-theme");
    if (!highlightThemeLink) {
      console.warn(
        "Highlight theme link not found, deferring theme application"
      );
      // Retry after a short delay if DOM isn't ready
      setTimeout(() => this.applyHighlightTheme(theme), 100);
      return;
    }

    let effectiveTheme = theme;

    // Determine effective theme for system preference
    if (theme === "system") {
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        effectiveTheme = "dark";
      } else {
        effectiveTheme = "light";
      }
    }

    // Switch highlight.js theme
    const themeFile =
      effectiveTheme === "dark"
        ? "../libs/highlight-dark.css"
        : "../libs/highlight-light.css";

    highlightThemeLink.href = themeFile;

    console.log(`Highlight.js theme applied: ${themeFile}`);
  }

  setupSystemThemeListener() {
    // Listen for system theme changes
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const handleSystemThemeChange = (e) => {
        const currentTheme =
          localStorage.getItem("graphql-toolkit-theme") || "system";

        // Only apply system changes if user has selected 'system' theme
        if (currentTheme === "system") {
          console.log(
            `System theme changed to: ${e.matches ? "dark" : "light"}`
          );
          // Apply highlight.js theme for system changes
          this.applyHighlightTheme("system");
        }
      };

      // Add listener for system theme changes
      mediaQuery.addListener(handleSystemThemeChange);

      // Store reference for cleanup if needed
      this.systemThemeMediaQuery = mediaQuery;
    }
  }

  getEffectiveTheme() {
    const savedTheme =
      localStorage.getItem("graphql-toolkit-theme") || "system";

    if (savedTheme === "system") {
      // Detect system preference
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        return "dark";
      }
      return "light";
    }

    return savedTheme;
  }

  calculateRequestTiming(request) {
    // Try different timestamp field names that might be used
    const startTime =
      request.timestamp || request.startTime || request.requestTimestamp;
    const endTime =
      request.responseTimestamp || request.endTime || request.completedTime;

    if (startTime && endTime) {
      // Convert timestamps to Date objects if they're strings, or use as-is if they're numbers
      let startMs, endMs;

      if (typeof startTime === "string") {
        startMs = new Date(startTime).getTime();
      } else {
        startMs = startTime;
      }

      if (typeof endTime === "string") {
        endMs = new Date(endTime).getTime();
      } else {
        endMs = endTime;
      }

      const duration = endMs - startMs;

      if (duration >= 0) {
        if (duration < 1000) {
          return `${Math.round(duration)}ms`;
        } else {
          return `${(duration / 1000).toFixed(2)}s`;
        }
      }
    }

    // If we don't have both timestamps, try to calculate from current time if response is pending
    if (startTime && !endTime && !request.response && !request.responseError) {
      let startMs;
      if (typeof startTime === "string") {
        startMs = new Date(startTime).getTime();
      } else {
        startMs = startTime;
      }

      const currentDuration = Date.now() - startMs;
      if (currentDuration >= 0) {
        return `${Math.round(currentDuration)}ms (pending)`;
      }
    }

    return null;
  }

  checkRuleMatch(request) {
    // Check if this request matches any active rules and return matched rule names
    const matchedRules = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      let matches = true;

      // Check operation name match
      if (rule.operationName && rule.operationName !== request.operationName) {
        matches = false;
      }

      // Check URL pattern match
      if (
        matches &&
        rule.urlPattern &&
        !request.url.includes(rule.urlPattern)
      ) {
        matches = false;
      }

      // If we get here, the rule matches
      if (matches) {
        matchedRules.push(rule.name);
      }
    }

    return matchedRules;
  }

  startLiveTiming(requestId) {
    // Clear any existing timer for this request
    this.stopLiveTiming(requestId);

    // Start a new timer that updates every 100ms
    const intervalId = setInterval(() => {
      this.updateLiveTiming(requestId);
    }, 100);

    this.liveTimers.set(requestId, intervalId);
  }

  stopLiveTiming(requestId) {
    const intervalId = this.liveTimers.get(requestId);
    if (intervalId) {
      clearInterval(intervalId);
      this.liveTimers.delete(requestId);
    }
  }

  updateLiveTiming(requestId) {
    // Find the request and update its timing display
    const request = this.requestLog.find((req) => req.id === requestId);
    if (!request || request.response || request.responseError) {
      // Request completed, stop timing
      this.stopLiveTiming(requestId);
      return;
    }

    // Update the timing display in the DOM
    const timingElement = document.querySelector(
      `[data-request-index] .request-timing[data-request-id="${requestId}"]`
    );
    if (timingElement) {
      const currentTiming = this.calculateRequestTiming(request);
      if (currentTiming) {
        timingElement.textContent = currentTiming;
        // Add pulsing animation class
        timingElement.classList.add("live-timing");
      }
    }
  }

  // Search functionality methods
  handleGlobalKeydown(e) {
    // Check if Ctrl/Cmd + F is pressed and we're focused on a code block
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      const activeElement = document.activeElement;
      const codeBlock = activeElement.closest(".code-block");

      if (codeBlock && codeBlock.classList.contains("expanded")) {
        e.preventDefault();
        this.openSearch(codeBlock);
      }
    }

    // Handle Escape key to close search
    if (e.key === "Escape" && this.searchState.isActive) {
      this.closeSearch();
    }
  }

  openSearch(codeBlock) {
    this.searchState.isActive = true;
    this.searchState.currentCodeBlock = codeBlock;
    this.codeSearchOverlay.style.display = "block";
    this.searchInput.focus();

    // Add search-active class to the code block
    codeBlock.classList.add("search-active");

    // Clear previous search
    this.clearSearchHighlights();
  }

  closeSearch() {
    this.searchState.isActive = false;
    this.codeSearchOverlay.style.display = "none";
    this.clearSearchHighlights();

    if (this.searchState.currentCodeBlock) {
      this.searchState.currentCodeBlock.classList.remove("search-active");
      this.searchState.currentCodeBlock = null;
    }

    this.searchState.matches = [];
    this.searchState.currentMatchIndex = -1;
    this.searchInput.value = "";
    this.updateSearchResults();
  }

  handleSearchKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        this.navigateSearch(-1);
      } else {
        this.navigateSearch(1);
      }
    }
  }

  performSearch() {
    const searchTerm = this.searchInput.value;
    this.searchState.searchTerm = searchTerm;

    if (!searchTerm || !this.searchState.currentCodeBlock) {
      this.clearSearchHighlights();
      return;
    }

    this.clearSearchHighlights();
    this.searchState.matches = [];
    this.searchState.currentMatchIndex = -1;

    const codeElement = this.searchState.currentCodeBlock.querySelector("code");
    if (!codeElement) return;

    // Get the text content
    const textContent = codeElement.textContent;

    // Build search regex based on options
    let flags = "g";
    if (!this.searchCaseSensitive.checked) flags += "i";

    let pattern = searchTerm;

    if (!this.searchRegex.checked) {
      // Escape special regex characters if not in regex mode
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    if (this.searchWholeWord.checked) {
      pattern = `\\b${pattern}\\b`;
    }

    try {
      const regex = new RegExp(pattern, flags);
      const matches = [...textContent.matchAll(regex)];

      if (matches.length > 0) {
        this.highlightMatches(codeElement, matches);
        this.searchState.matches = matches;
        this.searchState.currentMatchIndex = 0;
        this.scrollToCurrentMatch();
      }
    } catch (error) {
      console.warn("Invalid search regex:", error);
    }

    this.updateSearchResults();
  }

  highlightMatches(codeElement, matches) {
    const textContent = codeElement.textContent;
    let highlightedHTML = "";
    let lastIndex = 0;

    matches.forEach((match, index) => {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;

      // Add text before match
      highlightedHTML += this.escapeHtml(
        textContent.slice(lastIndex, matchStart)
      );

      // Add highlighted match
      const isCurrentMatch = index === this.searchState.currentMatchIndex;
      const className = isCurrentMatch
        ? "search-highlight current"
        : "search-highlight";
      highlightedHTML += `<span class="${className}" data-match-index="${index}">${this.escapeHtml(
        match[0]
      )}</span>`;

      lastIndex = matchEnd;
    });

    // Add remaining text
    highlightedHTML += this.escapeHtml(textContent.slice(lastIndex));

    // Update the code element HTML
    codeElement.innerHTML = highlightedHTML;
  }

  clearSearchHighlights() {
    if (this.searchState.currentCodeBlock) {
      const codeElement =
        this.searchState.currentCodeBlock.querySelector("code");
      if (codeElement) {
        // Remove all highlight spans and restore original text
        const highlights = codeElement.querySelectorAll(".search-highlight");
        highlights.forEach((highlight) => {
          const textNode = document.createTextNode(highlight.textContent);
          highlight.parentNode.replaceChild(textNode, highlight);
        });

        // Normalize text nodes
        codeElement.normalize();

        // Re-apply syntax highlighting if hljs is available
        if (window.hljs) {
          window.hljs.highlightElement(codeElement);
        }
      }
    }
  }

  navigateSearch(direction) {
    if (this.searchState.matches.length === 0) return;

    const newIndex = this.searchState.currentMatchIndex + direction;

    if (newIndex >= 0 && newIndex < this.searchState.matches.length) {
      this.searchState.currentMatchIndex = newIndex;
    } else if (direction > 0) {
      // Wrap to beginning
      this.searchState.currentMatchIndex = 0;
    } else {
      // Wrap to end
      this.searchState.currentMatchIndex = this.searchState.matches.length - 1;
    }

    this.updateCurrentMatch();
    this.scrollToCurrentMatch();
    this.updateSearchResults();
  }

  updateCurrentMatch() {
    if (!this.searchState.currentCodeBlock) return;

    const highlights =
      this.searchState.currentCodeBlock.querySelectorAll(".search-highlight");
    highlights.forEach((highlight, index) => {
      if (index === this.searchState.currentMatchIndex) {
        highlight.classList.add("current");
      } else {
        highlight.classList.remove("current");
      }
    });
  }

  scrollToCurrentMatch() {
    if (
      this.searchState.currentMatchIndex >= 0 &&
      this.searchState.currentCodeBlock
    ) {
      const currentHighlight = this.searchState.currentCodeBlock.querySelector(
        ".search-highlight.current"
      );
      if (currentHighlight) {
        currentHighlight.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      }
    }
  }

  updateSearchResults() {
    const total = this.searchState.matches.length;
    const current = this.searchState.currentMatchIndex + 1;

    if (total === 0) {
      this.searchResults.textContent = "0/0";
      this.searchPrevBtn.disabled = true;
      this.searchNextBtn.disabled = true;
    } else {
      this.searchResults.textContent = `${current}/${total}`;
      this.searchPrevBtn.disabled = false;
      this.searchNextBtn.disabled = false;
    }
  }

  // GraphQL Endpoint Detection
  detectGraphQLEndpoint(request) {
    // Check if this looks like a GraphQL request
    if (
      request.query ||
      (request.variables && typeof request.variables === "object")
    ) {
      const url = request.url;
      const headers = request.requestHeaders || request.headers || {};

      console.log("🔍 [SCHEMA] Detected GraphQL request:", {
        url: url,
        operationName: request.operationName,
        requestHeaders: request.requestHeaders,
        headers: request.headers,
        allRequestKeys: Object.keys(request),
        finalHeaders: headers,
        headerKeys: Object.keys(headers),
      });

      // Check for authorization in different possible locations
      let authFound = false;
      Object.keys(headers).forEach((key) => {
        if (
          key.toLowerCase().includes("auth") ||
          key.toLowerCase().includes("token")
        ) {
          console.log(
            `🔐 [SCHEMA] Found potential auth header: ${key} = ${headers[key]}`
          );
          authFound = true;
        }
      });

      if (!authFound) {
        console.warn(
          "⚠️ [SCHEMA] No authorization headers detected in request"
        );
      }

      // Store or update the endpoint information
      this.detectedGraphQLEndpoints.set(url, {
        headers: headers,
        lastSeen: Date.now(),
        operationName: request.operationName,
      });

      // Update the detected endpoints UI
      this.updateDetectedEndpointsUI();
    }
  }

  updateDetectedEndpointsUI() {
    const endpoints = Array.from(this.detectedGraphQLEndpoints.entries())
      .sort((a, b) => b[1].lastSeen - a[1].lastSeen) // Sort by most recent
      .slice(0, 5); // Limit to 5 most recent endpoints

    if (endpoints.length > 0) {
      this.detectedEndpoints.style.display = "block";

      // Clear existing options except the first one
      this.endpointSelect.innerHTML =
        '<option value="">Select a detected endpoint...</option>';

      endpoints.forEach(([url, info]) => {
        const option = document.createElement("option");
        option.value = url;
        option.textContent = url;
        option.dataset.headers = JSON.stringify(info.headers);
        this.endpointSelect.appendChild(option);
      });
    }
  }

  selectDetectedEndpoint() {
    const selectedOption = this.endpointSelect.selectedOptions[0];
    if (selectedOption && selectedOption.value) {
      this.schemaEndpoint.value = selectedOption.value;

      // Hide manual input, show clear button
      this.manualEndpoint.style.display = "none";
      this.clearEndpointBtn.style.display = "inline-flex";

      // Auto-populate headers and auth if available
      try {
        const headers = JSON.parse(selectedOption.dataset.headers || "{}");
        console.log("📋 [SCHEMA] Processing headers for endpoint:", headers);

        // Create case-insensitive header lookup
        const headerLookup = {};
        Object.keys(headers).forEach((key) => {
          headerLookup[key.toLowerCase()] = {
            originalKey: key,
            value: headers[key],
          };
        });

        // Extract and set authorization
        this.extractAndSetAuth(headerLookup);

        // Extract other relevant headers (excluding auth headers since they're handled separately)
        const relevantHeaders = {};
        const authHeaderNames = [
          "authorization",
          "x-api-key",
          "x-auth-token",
          "x-auth-header",
        ];

        [
          "cookie",
          "x-csrf-token",
          "x-request-id",
          "user-agent",
          "referer",
        ].forEach((headerName) => {
          const headerInfo = headerLookup[headerName.toLowerCase()];
          if (headerInfo) {
            relevantHeaders[headerInfo.originalKey] = headerInfo.value;
          }
        });

        // Add any custom headers that aren't standard auth headers
        Object.keys(headers).forEach((key) => {
          const lowerKey = key.toLowerCase();
          if (
            !authHeaderNames.includes(lowerKey) &&
            ![
              "cookie",
              "x-csrf-token",
              "x-request-id",
              "user-agent",
              "referer",
              "content-type",
              "accept",
            ].includes(lowerKey)
          ) {
            relevantHeaders[key] = headers[key];
          }
        });

        if (Object.keys(relevantHeaders).length > 0) {
          this.headersEditor.value = JSON.stringify(relevantHeaders, null, 2);
        }

        console.log(
          "✅ [SCHEMA] Auto-populated headers and auth from detected endpoint"
        );
      } catch (error) {
        console.warn("Failed to parse headers:", error);
      }
    }
  }

  extractAndSetAuth(headerLookup) {
    // Check for Authorization header (Bearer, Basic, etc.)
    const authHeader = headerLookup["authorization"];
    if (authHeader) {
      const authValue = authHeader.value;
      if (authValue.toLowerCase().startsWith("bearer ")) {
        this.authType.value = "bearer";
        this.updateAuthFields();
        const tokenField = this.authFields.querySelector(
          'input[data-auth-field="token"]'
        );
        if (tokenField) {
          tokenField.value = authValue.substring(7); // Remove "Bearer " prefix
        }
        return;
      } else if (authValue.toLowerCase().startsWith("basic ")) {
        this.authType.value = "basic";
        this.updateAuthFields();
        // Decode basic auth if possible
        try {
          const decoded = atob(authValue.substring(6));
          const [username, password] = decoded.split(":");
          const usernameField = this.authFields.querySelector(
            'input[data-auth-field="username"]'
          );
          const passwordField = this.authFields.querySelector(
            'input[data-auth-field="password"]'
          );
          if (usernameField) usernameField.value = username || "";
          if (passwordField) passwordField.value = password || "";
        } catch (e) {
          console.warn("Could not decode basic auth:", e);
        }
        return;
      }
    }

    // Check for API Key headers
    const apiKeyHeaders = ["x-api-key", "x-auth-token", "apikey", "api-key"];
    for (const headerName of apiKeyHeaders) {
      const headerInfo = headerLookup[headerName];
      if (headerInfo) {
        this.authType.value = "apikey";
        this.updateAuthFields();
        const keyField = this.authFields.querySelector(
          'input[data-auth-field="key"]'
        );
        const headerField = this.authFields.querySelector(
          'input[data-auth-field="header"]'
        );
        if (keyField) keyField.value = headerInfo.value;
        if (headerField) headerField.value = headerInfo.originalKey;
        return;
      }
    }

    // If no standard auth found, check for any custom auth-looking headers
    const customAuthHeaders = Object.keys(headerLookup).filter(
      (key) =>
        key.includes("auth") || key.includes("token") || key.includes("key")
    );

    if (customAuthHeaders.length > 0) {
      const firstAuthHeader = headerLookup[customAuthHeaders[0]];
      this.authType.value = "custom";
      this.updateAuthFields();
      const nameField = this.authFields.querySelector(
        'input[data-auth-field="name"]'
      );
      const valueField = this.authFields.querySelector(
        'input[data-auth-field="value"]'
      );
      if (nameField) nameField.value = firstAuthHeader.originalKey;
      if (valueField) valueField.value = firstAuthHeader.value;
    }
  }

  updateAuthFields() {
    const authType = this.authType.value;
    let fieldsHTML = "";

    switch (authType) {
      case "bearer":
        fieldsHTML = `
          <div class="auth-field">
            <label for="bearerToken">Bearer Token</label>
            <input type="text" id="bearerToken" data-auth-field="token" placeholder="Enter your bearer token">
          </div>
        `;
        break;

      case "basic":
        fieldsHTML = `
          <div class="auth-field-group">
            <div class="auth-field">
              <label for="basicUsername">Username</label>
              <input type="text" id="basicUsername" data-auth-field="username" placeholder="Username">
            </div>
            <div class="auth-field">
              <label for="basicPassword">Password</label>
              <input type="password" id="basicPassword" data-auth-field="password" placeholder="Password">
            </div>
          </div>
        `;
        break;

      case "apikey":
        fieldsHTML = `
          <div class="auth-field">
            <label for="apiKeyHeader">Header Name</label>
            <input type="text" id="apiKeyHeader" data-auth-field="header" placeholder="e.g., X-API-Key" value="X-API-Key">
          </div>
          <div class="auth-field">
            <label for="apiKeyValue">API Key</label>
            <input type="text" id="apiKeyValue" data-auth-field="key" placeholder="Enter your API key">
          </div>
        `;
        break;

      case "custom":
        fieldsHTML = `
          <div class="auth-field">
            <label for="customHeaderName">Header Name</label>
            <input type="text" id="customHeaderName" data-auth-field="name" placeholder="e.g., X-Auth-Token">
          </div>
          <div class="auth-field">
            <label for="customHeaderValue">Header Value</label>
            <input type="text" id="customHeaderValue" data-auth-field="value" placeholder="Enter header value">
          </div>
        `;
        break;

      case "none":
      default:
        fieldsHTML = "";
        break;
    }

    this.authFields.innerHTML = fieldsHTML;
  }

  buildAuthHeaders() {
    const authType = this.authType.value;
    const authHeaders = {};

    switch (authType) {
      case "bearer":
        const token = this.authFields.querySelector(
          'input[data-auth-field="token"]'
        )?.value;
        if (token) {
          authHeaders["Authorization"] = `Bearer ${token}`;
        }
        break;

      case "basic":
        const username = this.authFields.querySelector(
          'input[data-auth-field="username"]'
        )?.value;
        const password = this.authFields.querySelector(
          'input[data-auth-field="password"]'
        )?.value;
        if (username && password) {
          const encoded = btoa(`${username}:${password}`);
          authHeaders["Authorization"] = `Basic ${encoded}`;
        }
        break;

      case "apikey":
        const headerName = this.authFields.querySelector(
          'input[data-auth-field="header"]'
        )?.value;
        const apiKey = this.authFields.querySelector(
          'input[data-auth-field="key"]'
        )?.value;
        if (headerName && apiKey) {
          authHeaders[headerName] = apiKey;
        }
        break;

      case "custom":
        const customName = this.authFields.querySelector(
          'input[data-auth-field="name"]'
        )?.value;
        const customValue = this.authFields.querySelector(
          'input[data-auth-field="value"]'
        )?.value;
        if (customName && customValue) {
          authHeaders[customName] = customValue;
        }
        break;
    }

    return authHeaders;
  }

  // Schema Explorer methods
  async loadSchema() {
    const endpoint = this.schemaEndpoint.value.trim();
    if (!endpoint) {
      alert(
        "Please select a detected endpoint or enter a GraphQL endpoint URL"
      );
      return;
    }

    this.showSchemaLoading(true);
    this.hideSchemaError();

    try {
      const introspectionQuery = `
        query IntrospectionQuery {
          __schema {
            queryType { name }
            mutationType { name }
            subscriptionType { name }
            types {
              ...FullType
            }
          }
        }

        fragment FullType on __Type {
          kind
          name
          description
          fields(includeDeprecated: true) {
            name
            description
            args {
              ...InputValue
            }
            type {
              ...TypeRef
            }
            isDeprecated
            deprecationReason
          }
          inputFields {
            ...InputValue
          }
          interfaces {
            ...TypeRef
          }
          enumValues(includeDeprecated: true) {
            name
            description
            isDeprecated
            deprecationReason
          }
          possibleTypes {
            ...TypeRef
          }
        }

        fragment InputValue on __InputValue {
          name
          description
          type { ...TypeRef }
          defaultValue
        }

        fragment TypeRef on __Type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                      ofType {
                        kind
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      // Prepare headers for introspection query
      let headers = {
        "Content-Type": "application/json",
      };

      // Build auth headers from the auth section
      const authHeaders = this.buildAuthHeaders();
      headers = { ...headers, ...authHeaders };

      // Add additional headers from the headers editor
      try {
        const additionalHeaders = this.headersEditor.value.trim();
        if (additionalHeaders) {
          const parsedHeaders = JSON.parse(additionalHeaders);
          headers = { ...headers, ...parsedHeaders };
        }
      } catch (error) {
        console.warn("Invalid additional headers JSON:", error);
      }

      console.log(
        "🔐 [SCHEMA] Using headers for introspection:",
        Object.keys(headers)
      );

      const response = await fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          query: introspectionQuery,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors.map((e) => e.message).join(", "));
      }

      this.currentSchema = result.data.__schema;
      this.parseSchema();
      this.renderSchema();

      // Show success message
      this.showSchemaSuccess();

      // Set up resize observer for dynamic width calculation
      this.setupSidebarResizeObserver();
    } catch (error) {
      console.error("Failed to load schema:", error);
      this.showSchemaError(error.message);
    } finally {
      this.showSchemaLoading(false);
    }
  }

  clearSelectedEndpoint() {
    // Reset endpoint selection
    this.endpointSelect.value = "";
    this.schemaEndpoint.value = "";

    // Show manual input, hide clear button
    this.manualEndpoint.style.display = "flex";
    this.clearEndpointBtn.style.display = "none";

    // Focus on manual input
    this.schemaEndpoint.focus();
  }

  parseSchema() {
    if (!this.currentSchema) return;

    const schema = this.currentSchema;

    // Reset schema data
    this.schemaData = {
      queries: [],
      mutations: [],
      subscriptions: [],
      types: [],
    };

    // Find root types
    const queryType = schema.types.find(
      (t) => t.name === schema.queryType?.name
    );
    const mutationType = schema.types.find(
      (t) => t.name === schema.mutationType?.name
    );
    const subscriptionType = schema.types.find(
      (t) => t.name === schema.subscriptionType?.name
    );

    // Parse queries
    if (queryType && queryType.fields) {
      this.schemaData.queries = queryType.fields.map((field) => ({
        name: field.name,
        description: field.description,
        args: field.args,
        type: field.type,
        isDeprecated: field.isDeprecated,
        deprecationReason: field.deprecationReason,
      }));
    }

    // Parse mutations
    if (mutationType && mutationType.fields) {
      this.schemaData.mutations = mutationType.fields.map((field) => ({
        name: field.name,
        description: field.description,
        args: field.args,
        type: field.type,
        isDeprecated: field.isDeprecated,
        deprecationReason: field.deprecationReason,
      }));
    }

    // Parse subscriptions
    if (subscriptionType && subscriptionType.fields) {
      this.schemaData.subscriptions = subscriptionType.fields.map((field) => ({
        name: field.name,
        description: field.description,
        args: field.args,
        type: field.type,
        isDeprecated: field.isDeprecated,
        deprecationReason: field.deprecationReason,
      }));
    }

    // Parse custom types (excluding built-in types)
    this.schemaData.types = schema.types.filter(
      (type) =>
        !type.name.startsWith("__") &&
        type.name !== schema.queryType?.name &&
        type.name !== schema.mutationType?.name &&
        type.name !== schema.subscriptionType?.name &&
        !["String", "Int", "Float", "Boolean", "ID"].includes(type.name)
    );
  }

  switchSchemaTab(tabName) {
    // Update tab buttons
    this.schemaTabBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.schemaTab === tabName);
    });

    // Update tab contents
    document.querySelectorAll(".schema-tab-content").forEach((content) => {
      content.classList.toggle("active", content.id === `${tabName}-tab`);
    });
  }

  renderSchema() {
    this.renderOperationsTree(
      this.schemaQueries,
      this.schemaData.queries,
      "query"
    );
    this.renderOperationsTree(
      this.schemaMutations,
      this.schemaData.mutations,
      "mutation"
    );
    this.renderOperationsTree(
      this.schemaSubscriptions,
      this.schemaData.subscriptions,
      "subscription"
    );
    this.renderTypesTree();

    // Calculate and set dynamic widths after rendering
    this.calculateSchemaContentWidths();
  }

  renderOperationsTree(container, items, operationType) {
    // Clear container
    container.innerHTML = "";

    if (items.length === 0) {
      const noItemsDiv = document.createElement("div");
      noItemsDiv.className = "no-items";
      noItemsDiv.textContent = "No items found";
      container.appendChild(noItemsDiv);
      return;
    }

    // Sort items alphabetically by name
    const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));

    sortedItems.forEach((item) => {
      const hasArgs = item.args && item.args.length > 0;
      const returnType = this.getTypeString(item.type);
      const returnFields = this.getFieldsForType(item.type);
      const hasReturnFields = returnFields.length > 0;
      const hasContent = hasArgs || hasReturnFields;

      // Create main item container
      const itemDiv = document.createElement("div");
      itemDiv.className = "schema-tree-item";
      itemDiv.dataset.operationType = operationType;
      itemDiv.dataset.name = item.name;

      // Create header
      const headerDiv = document.createElement("div");
      headerDiv.className = `schema-tree-header ${
        hasContent ? "expandable" : ""
      }`;
      headerDiv.dataset.operationType = operationType;
      headerDiv.dataset.name = item.name;

      // Toggle arrow
      const toggleSpan = document.createElement("span");
      toggleSpan.className = "schema-tree-toggle";
      toggleSpan.textContent = hasContent ? "▶" : "";
      headerDiv.appendChild(toggleSpan);

      // Field name with description tooltip
      const nameSpan = document.createElement("span");
      nameSpan.className = "field-name";
      nameSpan.textContent = item.name;
      if (item.description) {
        nameSpan.dataset.description = item.description;
        nameSpan.title = item.description; // Fallback for browsers that don't support CSS tooltips
      }
      headerDiv.appendChild(nameSpan);

      // Field type
      const typeSpan = document.createElement("span");
      typeSpan.className = "field-type";
      typeSpan.textContent = returnType;
      headerDiv.appendChild(typeSpan);

      // Add button
      const addBtn = document.createElement("button");
      addBtn.className = "add-to-builder-btn";
      addBtn.dataset.operationType = operationType;
      addBtn.dataset.name = item.name;
      addBtn.title = "Add to query builder";
      addBtn.textContent = "+";
      headerDiv.appendChild(addBtn);

      // Deprecated indicator
      if (item.isDeprecated) {
        const deprecatedSpan = document.createElement("span");
        deprecatedSpan.className = "deprecated-indicator";
        deprecatedSpan.textContent = "Deprecated";
        headerDiv.appendChild(deprecatedSpan);
      }

      // Description now handled by tooltip on field name

      itemDiv.appendChild(headerDiv);

      // Content section
      if (hasContent) {
        const contentDiv = document.createElement("div");
        contentDiv.className = "schema-tree-content";

        // Arguments
        if (hasArgs) {
          const argsDiv = document.createElement("div");
          argsDiv.className = "field-args";

          const argsTitle = document.createElement("h5");
          argsTitle.textContent = "Arguments";
          argsDiv.appendChild(argsTitle);

          item.args.forEach((arg) => {
            const argDiv = document.createElement("div");
            argDiv.className = "field-arg";

            const argName = document.createElement("span");
            argName.className = "arg-name";
            argName.textContent = arg.name;
            argDiv.appendChild(argName);

            const argType = document.createElement("span");
            argType.className = "arg-type";
            argType.textContent = this.getTypeString(arg.type);
            argDiv.appendChild(argType);

            // Description now handled by tooltip on arg name
            if (arg.description) {
              argName.dataset.description = arg.description;
              argName.title = arg.description;
            }

            argsDiv.appendChild(argDiv);
          });

          contentDiv.appendChild(argsDiv);
        }

        // Return fields
        if (hasReturnFields) {
          const fieldsDiv = document.createElement("div");
          fieldsDiv.className = "return-fields";

          const fieldsTitle = document.createElement("h5");
          fieldsTitle.textContent = "Response Fields";
          fieldsDiv.appendChild(fieldsTitle);

          const fieldsList = document.createElement("div");
          fieldsList.className = "response-fields-list";
          fieldsList.innerHTML = this.renderFieldsTreeViewOnly(returnFields, 0);
          fieldsDiv.appendChild(fieldsList);

          contentDiv.appendChild(fieldsDiv);
        }

        itemDiv.appendChild(contentDiv);
      }

      container.appendChild(itemDiv);
    });

    // Add event listeners
    this.addSchemaTreeListeners(container, operationType);
  }

  renderFieldsTreeViewOnly(fields, depth) {
    if (depth > 2) {
      return '<div class="nested-field-item"><em>... nested fields available</em></div>';
    }

    return fields
      .map((field) => {
        const baseType = this.getBaseType(field.type);
        const isScalar = ["String", "Int", "Float", "Boolean", "ID"].includes(
          baseType
        );
        const nestedFields = isScalar ? [] : this.getFieldsForType(field.type);
        const hasNestedFields = nestedFields.length > 0;

        return `
        <div class="field-item-view-only" style="margin-left: ${depth * 16}px;">
          <span class="field-name"${
            field.description
              ? ` data-description="${field.description.replace(
                  /"/g,
                  "&quot;"
                )}" title="${field.description}"`
              : ""
          }>${field.name}</span>
          <span class="field-type">${this.getTypeString(field.type)}</span>
          ${
            hasNestedFields
              ? `<span class="expand-view-only-btn" data-depth="${depth}">▶</span>`
              : ""
          }
        </div>
        ${
          hasNestedFields
            ? `
          <div class="nested-fields-view-only" style="display: none;">
            ${this.renderFieldsTreeViewOnly(
              nestedFields.slice(0, 8),
              depth + 1
            )}
            ${
              nestedFields.length > 8
                ? `<div class="nested-field-item" style="margin-left: ${
                    (depth + 1) * 16
                  }px;"><em>... and ${
                    nestedFields.length - 8
                  } more fields</em></div>`
                : ""
            }
          </div>
        `
            : ""
        }
      `;
      })
      .join("");
  }

  renderTypesTree() {
    if (this.schemaData.types.length === 0) {
      this.schemaTypes.innerHTML =
        '<div class="no-items">No custom types found</div>';
      return;
    }

    const html = this.schemaData.types
      .map((type) => {
        const hasFields = type.fields && type.fields.length > 0;
        const hasEnumValues = type.enumValues && type.enumValues.length > 0;
        const hasContent = hasFields || hasEnumValues;

        return `
        <div class="schema-tree-item" data-type-name="${type.name}">
          <div class="schema-tree-header ${
            hasContent ? "expandable" : ""
          }" data-type-name="${type.name}">
            ${
              hasContent
                ? '<span class="schema-tree-toggle">▶</span>'
                : '<span class="schema-tree-toggle"></span>'
            }
            <span class="field-name"${
              type.description
                ? ` data-description="${type.description.replace(
                    /"/g,
                    "&quot;"
                  )}" title="${type.description}"`
                : ""
            }>${type.name}</span>
            <span class="type-indicator ${type.kind.toLowerCase()}">${
          type.kind
        }</span>
          </div>
          ${
            hasContent
              ? `
            <div class="schema-tree-content">
              ${
                hasFields
                  ? `
                <div class="type-fields">
                  ${type.fields
                    .map(
                      (field) => `
                    <div class="schema-field" data-field-name="${field.name}">
                      <span class="field-name"${
                        field.description
                          ? ` data-description="${field.description.replace(
                              /"/g,
                              "&quot;"
                            )}" title="${field.description}"`
                          : ""
                      }>${field.name}</span>
                      <span class="field-type">${this.getTypeString(
                        field.type
                      )}</span>
                      ${
                        field.isDeprecated
                          ? '<span class="deprecated-indicator">Deprecated</span>'
                          : ""
                      }
                    </div>
                    ${
                      field.args && field.args.length > 0
                        ? `
                      <div class="field-args">
                        ${field.args
                          .map(
                            (arg) => `
                          <div class="field-arg">
                            <span class="arg-name"${
                              arg.description
                                ? ` data-description="${arg.description.replace(
                                    /"/g,
                                    "&quot;"
                                  )}" title="${arg.description}"`
                                : ""
                            }>${arg.name}</span>
                            <span class="arg-type">${this.getTypeString(
                              arg.type
                            )}</span>
                          </div>
                        `
                          )
                          .join("")}
                      </div>
                    `
                        : ""
                    }
                  `
                    )
                    .join("")}
                </div>
              `
                  : ""
              }
              ${
                hasEnumValues
                  ? `
                <div class="enum-values">
                  ${type.enumValues
                    .map(
                      (enumValue) => `
                    <div class="schema-field">
                      <span class="field-name"${
                        enumValue.description
                          ? ` data-description="${enumValue.description.replace(
                              /"/g,
                              "&quot;"
                            )}" title="${enumValue.description}"`
                          : ""
                      }>${enumValue.name}</span>
                      ${
                        enumValue.isDeprecated
                          ? '<span class="deprecated-indicator">Deprecated</span>'
                          : ""
                      }
                    </div>
                  `
                    )
                    .join("")}
                </div>
              `
                  : ""
              }
            </div>
          `
              : ""
          }
        </div>
      `;
      })
      .join("");

    this.schemaTypes.innerHTML = html;

    // Add event listeners
    this.addSchemaTreeListeners(this.schemaTypes, "type");
  }

  addSchemaTreeListeners(container, itemType) {
    // Add toggle listeners for expandable items
    container
      .querySelectorAll(".schema-tree-header.expandable")
      .forEach((header) => {
        header.addEventListener("click", (e) => {
          // Don't toggle if clicking on the add button
          if (e.target.classList.contains("add-to-builder-btn")) {
            return;
          }
          e.stopPropagation();
          this.toggleSchemaTreeItem(header);
        });
      });

    // Add click-to-add listeners for the + buttons
    container.querySelectorAll(".add-to-builder-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const operationType = btn.dataset.operationType;
        const name = btn.dataset.name;
        this.addOperationToBuilder(operationType, name);
      });
    });

    // Add view-only expand listeners for nested fields
    container.querySelectorAll(".expand-view-only-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleViewOnlyNestedFields(btn);
      });
    });

    // Add click listeners for generating queries (operations only) - fallback for non-expandable items
    if (itemType !== "type") {
      container
        .querySelectorAll(".schema-tree-header[data-operation-type]")
        .forEach((header) => {
          header.addEventListener("click", (e) => {
            if (
              !header.classList.contains("expandable") &&
              !e.target.classList.contains("add-to-builder-btn")
            ) {
              const operationType = header.dataset.operationType;
              const name = header.dataset.name;
              this.generateAdvancedQuery(operationType, name);
            }
          });
        });
    }
  }

  addOperationToBuilder(operationType, operationName) {
    console.log(
      `✅ [BUILDER] Adding operation to builder: ${operationType}.${operationName}`
    );

    const operation = this.findOperation(operationType, operationName);
    if (!operation) {
      console.error(
        "❌ [BUILDER] Operation not found:",
        operationType,
        operationName
      );
      return;
    }

    const fieldData = {
      type: "operation",
      operationType,
      name: operationName,
      operation: operation,
    };

    this.addFieldToBuilder(fieldData);

    // Switch to visual builder tab if not already there
    this.switchQueryTab("builder");
  }

  toggleArgument(operationName, argName, isSelected) {
    console.log(
      `🔧 [BUILDER] Toggling argument: ${operationName}.${argName} = ${isSelected}`
    );

    // Find the operation in the builder
    const builderField = this.builderState.selectedFields.find(
      (f) => f.type === "operation" && f.name === operationName
    );

    if (builderField) {
      if (!builderField.selectedArguments) builderField.selectedArguments = [];

      if (isSelected) {
        if (!builderField.selectedArguments.includes(argName)) {
          builderField.selectedArguments.push(argName);
        }
      } else {
        builderField.selectedArguments = builderField.selectedArguments.filter(
          (name) => name !== argName
        );
      }

      this.updateQueryPreview();
      this.renderSelectedFields();
    } else {
      console.warn(
        "⚠️ [BUILDER] Operation not found in builder state:",
        operationName
      );
    }
  }

  toggleResponseField(operationName, fieldPath, isSelected) {
    console.log(
      `🔧 [BUILDER] Toggling response field: ${operationName}.${fieldPath} = ${isSelected}`
    );

    // Find the operation in the builder
    const builderField = this.builderState.selectedFields.find(
      (f) => f.type === "operation" && f.name === operationName
    );

    if (builderField) {
      if (!builderField.selectedSubFields) builderField.selectedSubFields = [];

      if (isSelected) {
        if (!builderField.selectedSubFields.includes(fieldPath)) {
          builderField.selectedSubFields.push(fieldPath);
        }
      } else {
        builderField.selectedSubFields = builderField.selectedSubFields.filter(
          (path) => path !== fieldPath
        );
      }

      this.updateQueryPreview();
      this.renderSelectedFields();
    } else {
      console.warn(
        "⚠️ [BUILDER] Operation not found in builder state:",
        operationName
      );
    }
  }

  toggleViewOnlyNestedFields(btn) {
    const container = btn.parentElement.nextElementSibling;
    if (container && container.classList.contains("nested-fields-view-only")) {
      const isExpanded = container.style.display !== "none";

      if (isExpanded) {
        container.style.display = "none";
        btn.textContent = "▶";
      } else {
        container.style.display = "block";
        btn.textContent = "▼";
      }
    }
  }

  toggleNestedFields(operationName, fieldPath, btn) {
    const container = document.querySelector(
      `[data-field-path="${fieldPath}"]`
    );
    if (container) {
      const isExpanded = container.style.display !== "none";

      if (isExpanded) {
        container.style.display = "none";
        btn.textContent = "▶";
      } else {
        container.style.display = "block";
        btn.textContent = "▼";
      }
    }
  }

  clearBuilder() {
    this.builderState.selectedFields = [];
    this.renderSelectedFields();
    this.updateQueryPreview();
    console.log("🧹 [BUILDER] Builder cleared");
  }

  toggleSchemaTreeItem(header) {
    const toggle = header.querySelector(".schema-tree-toggle");
    const content = header.parentElement.querySelector(".schema-tree-content");

    if (content) {
      const isExpanded = content.classList.contains("expanded");

      if (isExpanded) {
        content.classList.remove("expanded");
        toggle.classList.remove("expanded");
        toggle.textContent = "▶";
      } else {
        content.classList.add("expanded");
        toggle.classList.add("expanded");
        toggle.textContent = "▼";
      }
    }
  }

  generateAdvancedQuery(operationType, operationName) {
    let operation;

    if (operationType === "query") {
      operation = this.schemaData.queries.find((q) => q.name === operationName);
    } else if (operationType === "mutation") {
      operation = this.schemaData.mutations.find(
        (m) => m.name === operationName
      );
    } else if (operationType === "subscription") {
      operation = this.schemaData.subscriptions.find(
        (s) => s.name === operationName
      );
    }

    if (!operation) return;

    // Generate comprehensive query with field suggestions
    const args = operation.args || [];
    const argString =
      args.length > 0
        ? `(${args.map((arg) => `${arg.name}: $${arg.name}`).join(", ")})`
        : "";

    // Get return type and suggest fields
    const returnType = this.getBaseType(operation.type);
    const fieldSuggestions = this.generateFieldSuggestions(returnType);

    const queryString = `${operationType} ${
      operationName.charAt(0).toUpperCase() + operationName.slice(1)
    }${
      args.length > 0
        ? `(${args
            .map((arg) => `$${arg.name}: ${this.getTypeString(arg.type)}`)
            .join(", ")})`
        : ""
    } {
  ${operationName}${argString} {
${fieldSuggestions}
  }
}`;

    // Generate variables with better defaults
    const variables = {};
    args.forEach((arg) => {
      variables[arg.name] = this.getSmartDefaultValue(arg.type, arg.name);
    });

    this.queryEditor.value = queryString;
    this.variablesEditor.value = JSON.stringify(variables, null, 2);

    // Highlight selected item
    document
      .querySelectorAll(".schema-tree-header.selected")
      .forEach((item) => {
        item.classList.remove("selected");
      });

    const selectedItem = document.querySelector(
      `[data-operation-type="${operationType}"][data-name="${operationName}"]`
    );
    if (selectedItem) {
      selectedItem.classList.add("selected");
    }

    console.log(
      `🎯 [SCHEMA] Generated advanced query for ${operationType}.${operationName}`
    );
  }

  generateFieldSuggestions(typeName, depth = 0, visited = new Set()) {
    if (depth > 2 || visited.has(typeName)) {
      return "    # ... more fields available";
    }

    visited.add(typeName);

    // Find the type in our schema
    const type = this.currentSchema.types.find((t) => t.name === typeName);
    if (!type || !type.fields) {
      return "    # Add fields here";
    }

    const indent = "    " + "  ".repeat(depth);
    const suggestions = [];

    // Add scalar and simple fields first
    const scalarFields = type.fields.filter((field) => {
      const baseType = this.getBaseType(field.type);
      return ["String", "Int", "Float", "Boolean", "ID"].includes(baseType);
    });

    scalarFields.slice(0, 5).forEach((field) => {
      suggestions.push(`${indent}${field.name}`);
    });

    // Add one complex field example
    const complexFields = type.fields.filter((field) => {
      const baseType = this.getBaseType(field.type);
      return !["String", "Int", "Float", "Boolean", "ID"].includes(baseType);
    });

    if (complexFields.length > 0 && depth < 2) {
      const complexField = complexFields[0];
      const baseType = this.getBaseType(complexField.type);
      const nestedFields = this.generateFieldSuggestions(
        baseType,
        depth + 1,
        visited
      );

      suggestions.push(`${indent}${complexField.name} {`);
      suggestions.push(nestedFields);
      suggestions.push(`${indent}}`);
    }

    if (suggestions.length === 0) {
      return `${indent}# Add fields here`;
    }

    return suggestions.join("\n");
  }

  getBaseType(type) {
    if (type.kind === "NON_NULL" || type.kind === "LIST") {
      return this.getBaseType(type.ofType);
    }
    return type.name;
  }

  getSmartDefaultValue(type, argName) {
    const baseType = this.getBaseType(type);
    const lowerName = argName.toLowerCase();

    // Smart defaults based on argument name
    if (lowerName.includes("id")) return "";
    if (lowerName.includes("limit") || lowerName.includes("first")) return 10;
    if (lowerName.includes("offset") || lowerName.includes("skip")) return 0;
    if (lowerName.includes("email")) return "user@example.com";
    if (lowerName.includes("name")) return "Example Name";

    // Default by type
    if (type.kind === "NON_NULL") {
      return this.getSmartDefaultValue(type.ofType, argName);
    } else if (type.kind === "LIST") {
      return [];
    } else {
      switch (baseType) {
        case "String":
          return "";
        case "Int":
          return 0;
        case "Float":
          return 0.0;
        case "Boolean":
          return false;
        case "ID":
          return "";
        default:
          return null;
      }
    }
  }

  // Visual Query Builder Methods
  switchQueryTab(tabName) {
    // Update tab buttons
    this.queryTabBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.queryTab === tabName);
    });

    // Update tab contents
    document.querySelectorAll(".query-tab-content").forEach((content) => {
      content.classList.toggle("active", content.id === `${tabName}-tab`);
    });

    // If switching to builder, update preview
    if (tabName === "builder") {
      this.updateQueryPreview();
    }
  }

  findOperation(operationType, operationName) {
    switch (operationType) {
      case "query":
        return this.schemaData.queries.find((q) => q.name === operationName);
      case "mutation":
        return this.schemaData.mutations.find((m) => m.name === operationName);
      case "subscription":
        return this.schemaData.subscriptions.find(
          (s) => s.name === operationName
        );
      default:
        return null;
    }
  }

  addFieldToBuilder(fieldData) {
    // Check if field already exists
    const existingField = this.builderState.selectedFields.find(
      (f) => f.name === fieldData.name && f.type === fieldData.type
    );

    if (existingField) {
      console.log("⚠️ [BUILDER] Field already added:", fieldData.name);
      return;
    }

    // Add field to builder state
    const fieldItem = {
      id: Date.now() + Math.random(),
      ...fieldData,
      arguments: fieldData.operation?.args || [],
      selectedSubFields: [],
      argumentValues: {},
    };

    this.builderState.selectedFields.push(fieldItem);

    // Update UI
    this.renderSelectedFields();
    this.updateQueryPreview();

    console.log("✅ [BUILDER] Field added to builder:", fieldItem);
  }

  renderSelectedFields() {
    console.log(
      `🎨 [BUILDER] renderSelectedFields called with ${this.builderState.selectedFields.length} fields`
    );

    const container = this.selectedFields;

    if (this.builderState.selectedFields.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-text">No operations selected</div>
          <div class="empty-hint">Click the + button next to queries/mutations in the left sidebar to add them</div>
        </div>
      `;
      return;
    }

    const html = this.builderState.selectedFields
      .map((field) => {
        console.log(
          `🎨 [BUILDER] Rendering field:`,
          field.name,
          `ID: ${field.id}`
        );
        return this.renderSelectedOperation(field);
      })
      .join("");

    container.innerHTML = html;

    // Add event listeners to the rendered operations
    this.addSelectedFieldListeners();
  }

  renderSelectedOperation(field) {
    const hasArguments =
      field.operation &&
      field.operation.args &&
      field.operation.args.length > 0;
    const returnFields = field.operation
      ? this.getFieldsForType(field.operation.type)
      : [];
    const hasReturnFields = returnFields.length > 0;

    return `
      <div class="operation-card" data-field-id="${field.id}">
        <div class="operation-header">
          <div class="operation-title">
            <h3>${field.name}</h3>
            <span class="operation-badge ${field.operationType || "query"}">${
      field.operationType || "query"
    }</span>
            <span class="operation-return-type">${
              field.operation ? this.getTypeString(field.operation.type) : ""
            }</span>
          </div>
          <button class="remove-operation-btn" data-field-id="${
            field.id
          }" title="Remove operation">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        
        ${
          hasArguments
            ? `
          <div class="operation-section">
            <div class="section-header">
              <h4>Arguments</h4>
              <span class="section-count">${field.operation.args.length}</span>
            </div>
            <div class="arguments-list">
              ${field.operation.args
                .map((arg) => {
                  const isSelected =
                    field.selectedArguments &&
                    field.selectedArguments.includes(arg.name);
                  const currentValue =
                    (field.argumentValues && field.argumentValues[arg.name]) ||
                    "";
                  const isRequired = this.getTypeString(arg.type).includes("!");
                  const typeString = this.getTypeString(arg.type);
                  return `
                  <div class="argument-item ${isSelected ? "selected" : ""} ${
                    isRequired ? "required" : "optional"
                  }">
                    <div class="argument-header">
                      <label class="argument-checkbox-label">
                        <input type="checkbox" 
                               class="operation-arg-checkbox" 
                               data-field-id="${field.id}" 
                               data-arg-name="${arg.name}"
                               ${isSelected ? "checked" : ""}>
                        <span class="argument-info">
                          <span class="argument-name">${arg.name}</span>
                          ${
                            isRequired
                              ? '<span class="required-indicator">*</span>'
                              : ""
                          }
                          <span class="argument-type">${typeString}</span>
                        </span>
                      </label>
                    </div>
                    ${
                      arg.description
                        ? `<div class="argument-description">${arg.description}</div>`
                        : ""
                    }
                    <div class="argument-value ${
                      isSelected ? "visible" : "hidden"
                    }">
                      <div class="input-wrapper">
                        <input type="text" 
                               class="operation-arg-value" 
                               data-field-id="${field.id}" 
                               data-arg-name="${arg.name}"
                               placeholder="Enter ${arg.name} value${
                    isRequired ? " (required)" : " (optional)"
                  }..."
                               value="${currentValue}"
                               ${isRequired ? "required" : ""}>
                        <div class="input-hint">Type: ${typeString}</div>
                      </div>
                    </div>
                  </div>
                `;
                })
                .join("")}
            </div>
          </div>
        `
            : ""
        }
        
        ${
          hasReturnFields
            ? `
          <div class="operation-section">
            <div class="section-header">
              <h4>Response Fields</h4>
              <div class="section-actions">
                <button class="select-all-fields-btn btn btn-sm" 
                        data-field-id="${field.id}" 
                        data-action="${
                          field.selectedSubFields.length === 0
                            ? "select-all"
                            : "deselect-all"
                        }"
                        title="${
                          field.selectedSubFields.length === 0
                            ? "Select all fields"
                            : "Deselect all fields"
                        }">
                  ${
                    field.selectedSubFields.length === 0
                      ? "Select All"
                      : "Deselect All"
                  }
                </button>
                <span class="section-count">${returnFields.length}</span>
              </div>
            </div>
            <div class="field-search-container">
              <div class="search-input-wrapper">
                <input type="text" 
                       class="field-search-input" 
                       data-field-id="${field.id}"
                       placeholder="Search fields..." 
                       title="Search field names and types">
                <div class="search-icon">🔍</div>
                <button class="clear-search-btn" 
                        data-field-id="${field.id}" 
                        style="display: none;" 
                        title="Clear search">✕</button>
            </div>
              <div class="search-results-info" data-field-id="${
                field.id
              }" style="display: none;">
                <span class="results-count"></span>
                <button class="expand-all-results-btn" title="Expand all matching fields">Expand All</button>
          </div>
            </div>
            <div class="response-fields-container" data-field-id="${field.id}">
              ${this.renderOperationFieldsTree(returnFields, field, "", 0)}
            </div>
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  renderOperationFieldsTree(
    fields,
    operation,
    parentPath,
    depth,
    lazyLoad = true
  ) {
    if (depth > 5) {
      return '<div class="field-depth-limit">Maximum nesting depth reached</div>';
    }

    return fields
      .map((field) => {
        const fieldPath = parentPath
          ? `${parentPath}.${field.name}`
          : field.name;
        const baseType = this.getBaseType(field.type);
        const isScalar = ["String", "Int", "Float", "Boolean", "ID"].includes(
          baseType
        );
        const hasNestedFields =
          !isScalar && this.getFieldsForType(field.type).length > 0;
        const isSelected =
          operation.selectedSubFields &&
          operation.selectedSubFields.includes(fieldPath);
        const fieldId = `field_${operation.id}_${fieldPath.replace(
          /\./g,
          "_"
        )}`;

        // For performance: only render immediate children (depth 0), lazy-load deeper levels
        const shouldLazyLoad = lazyLoad && depth > 0;

        return `
        <div class="field-item" data-depth="${depth}">
          <div class="field-row">
            <label class="field-checkbox-label" data-field-label="true">
              <input type="checkbox" 
                     class="operation-field-checkbox" 
                     data-field-id="${operation.id}" 
                     data-field-path="${fieldPath}"
                     id="${fieldId}"
                     ${isSelected ? "checked" : ""}>
              <span class="field-info">
                <span class="field-name"${
                  field.description
                    ? ` data-description="${field.description.replace(
                        /"/g,
                        "&quot;"
                      )}" title="${field.description}"`
                    : ""
                }>${field.name}</span>
                <span class="field-type">${this.getTypeString(
                  field.type
                )}</span>
              </span>
            </label>
            ${
              hasNestedFields
                ? `
              <button class="expand-field-btn" 
                      data-field-path="${fieldPath}" 
                      data-operation-id="${operation.id}"
                      data-lazy-load="${shouldLazyLoad}"
                      data-expanded="false">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" class="expand-icon">
                  <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                </svg>
              </button>
            `
                : ""
            }
          </div>
          <!-- Description now handled by tooltip on field name -->
          ${
            hasNestedFields
              ? `
            <div class="nested-fields" 
                 data-field-path="${fieldPath}" 
                 data-operation-id="${operation.id}"
                 data-loaded="${!shouldLazyLoad}"
                 style="display: none;">
              ${
                shouldLazyLoad
                  ? '<div class="lazy-load-placeholder"><em>Click expand button to load nested fields...</em></div>'
                  : this.renderOperationFieldsTree(
                      this.getFieldsForType(field.type),
                      operation,
                      fieldPath,
                      depth + 1,
                      true
                    )
              }
            </div>
          `
              : ""
          }
        </div>
      `;
      })
      .join("");
  }

  renderFieldArguments(field) {
    if (!field.arguments || field.arguments.length === 0) return "";

    const argumentsHtml = field.arguments
      .map((arg) => {
        const value =
          field.argumentValues[arg.name] ||
          this.getSmartDefaultValue(arg.type, arg.name);
        return `
        <div class="argument-item">
          <span class="argument-name">${arg.name}:</span>
          <input type="text" 
                 class="argument-input" 
                 data-field-id="${field.id}" 
                 data-arg-name="${arg.name}"
                 value="${
                   typeof value === "string" ? value : JSON.stringify(value)
                 }"
                 placeholder="${this.getTypeString(arg.type)}">
        </div>
      `;
      })
      .join("");

    return `
      <div class="field-arguments">
        <h5>Arguments</h5>
        ${argumentsHtml}
      </div>
    `;
  }

  getFieldsForType(type) {
    const baseTypeName = this.getBaseType(type);
    const typeData = this.currentSchema?.types?.find(
      (t) => t.name === baseTypeName
    );
    return typeData?.fields || [];
  }

  removeSelectedFieldListeners() {
    // Remove all existing event listeners to prevent duplicates
    const elementsWithHandlers = [
      ".remove-operation-btn",
      ".operation-arg-checkbox",
      ".operation-arg-input",
      ".operation-field-checkbox",
      ".expand-field-btn",
      '.field-checkbox-label[data-field-label="true"]',
      ".select-all-fields-btn",
      ".field-search-input",
      ".clear-search-btn",
      ".expand-all-results-btn",
    ];

    elementsWithHandlers.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        if (element._handler) {
          element.removeEventListener(
            element._eventType || "click",
            element._handler
          );
          delete element._handler;
          delete element._eventType;
        }
        // Clone and replace to remove all listeners
        const newElement = element.cloneNode(true);
        element.parentNode.replaceChild(newElement, element);
      });
    });
  }

  addSelectedFieldListeners() {
    // Remove existing listeners first to prevent duplicates
    this.removeSelectedFieldListeners();

    // Remove operation buttons
    const removeButtons = document.querySelectorAll(".remove-operation-btn");
    removeButtons.forEach((btn) => {
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fieldId =
          e.target.dataset.fieldId ||
          e.target.closest(".remove-operation-btn").dataset.fieldId;
        console.log(`🖱️ [BUILDER] Remove button clicked, fieldId: ${fieldId}`);
        this.removeFieldFromBuilder(fieldId);
      };
      btn.addEventListener("click", handler);
      btn._handler = handler; // Store reference for cleanup
    });

    // Operation argument checkboxes
    const argCheckboxes = document.querySelectorAll(".operation-arg-checkbox");
    argCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const fieldId = e.target.dataset.fieldId;
        const argName = e.target.dataset.argName;
        console.log(
          `🔧 [BUILDER] Argument checkbox clicked: ${argName}, checked: ${e.target.checked}, fieldId: ${fieldId}`
        );
        this.toggleOperationArgument(fieldId, argName, e.target.checked);
      });
    });

    // Operation argument value inputs
    const argInputs = document.querySelectorAll(".operation-arg-value");
    argInputs.forEach((input) => {
      input.addEventListener("input", (e) => {
        const fieldId = e.target.dataset.fieldId;
        const argName = e.target.dataset.argName;
        this.updateArgumentValue(fieldId, argName, e.target.value);
      });
    });

    // Operation field checkboxes (response fields)
    const fieldCheckboxes = document.querySelectorAll(
      ".operation-field-checkbox"
    );
    fieldCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const fieldId = e.target.dataset.fieldId;
        const fieldPath = e.target.dataset.fieldPath;
        console.log(
          `📋 [BUILDER] Response field checkbox clicked: ${fieldPath}, checked: ${e.target.checked}, fieldId: ${fieldId}`
        );
        this.toggleOperationField(fieldId, fieldPath, e.target.checked);
      });
    });

    // Expand nested fields buttons
    const expandButtons = document.querySelectorAll(".expand-field-btn");
    expandButtons.forEach((btn) => {
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Prevent rapid clicking
        if (btn._isProcessing) {
          console.log("🔄 [BUILDER] Ignoring rapid click on expand button");
          return;
        }

        btn._isProcessing = true;
        this.toggleNestedFieldsExpansion(btn);

        // Reset processing flag after a short delay
        setTimeout(() => {
          btn._isProcessing = false;
        }, 300);
      };
      btn.addEventListener("click", handler);
      btn._handler = handler;
      btn._eventType = "click";
    });

    // Double-click to expand functionality for field labels
    const fieldLabels = document.querySelectorAll(
      '.field-checkbox-label[data-field-label="true"]'
    );
    fieldLabels.forEach((label) => {
      label.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const expandBtn = label.nextElementSibling;
        if (expandBtn && expandBtn.classList.contains("expand-field-btn")) {
          expandBtn.click();
        }
      });
    });

    // Select All/Deselect All buttons for response fields
    const selectAllButtons = document.querySelectorAll(
      ".select-all-fields-btn"
    );
    selectAllButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fieldId = btn.dataset.fieldId;
        const currentAction = btn.dataset.action;
        this.toggleAllResponseFields(fieldId, currentAction);
      });
    });

    // Field search inputs with debouncing
    const searchInputs = document.querySelectorAll(".field-search-input");
    searchInputs.forEach((input) => {
      const handler = (e) => {
        const fieldId = e.target.dataset.fieldId;
        const searchTerm = e.target.value.toLowerCase().trim();

        // Clear existing timeout
        if (input._searchTimeout) {
          clearTimeout(input._searchTimeout);
        }

        // For empty search, clear immediately
        if (searchTerm.length === 0) {
          console.log(`🔍 [BUILDER] Field search cleared for field ${fieldId}`);
          this.filterFields(fieldId, searchTerm);
          return;
        }

        // For very short terms (1-2 characters), require longer debounce to avoid partial matches
        if (searchTerm.length <= 2) {
          // Show search pending indicator for short terms
          this.showSearchPending(fieldId, searchTerm);

          input._searchTimeout = setTimeout(() => {
            console.log(
              `🔍 [BUILDER] Field search input: "${searchTerm}" for field ${fieldId} (short term debounced)`
            );
            this.hideSearchPending(fieldId);
            this.filterFields(fieldId, searchTerm);
          }, 500); // Longer delay for short terms
          return;
        }

        // For longer terms, use shorter debounce
        input._searchTimeout = setTimeout(() => {
          console.log(
            `🔍 [BUILDER] Field search input: "${searchTerm}" for field ${fieldId} (debounced)`
          );
          this.filterFields(fieldId, searchTerm);
        }, 250); // Shorter delay for longer terms
      };
      input.addEventListener("input", handler);
      input._handler = handler;
      input._eventType = "input";
    });

    // Clear search buttons
    const clearSearchButtons = document.querySelectorAll(".clear-search-btn");
    clearSearchButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const fieldId = e.target.dataset.fieldId;
        const searchInput = document.querySelector(
          `.field-search-input[data-field-id="${fieldId}"]`
        );
        if (searchInput) {
          searchInput.value = "";
          this.filterFields(fieldId, "");
        }
      });
    });

    // Expand all results buttons
    const expandAllButtons = document.querySelectorAll(
      ".expand-all-results-btn"
    );
    expandAllButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const fieldId = btn.closest("[data-field-id]").dataset.fieldId;
        this.expandAllMatchingFields(fieldId);
      });
    });
  }

  removeFieldFromBuilder(fieldId) {
    console.log(`🗑️ [BUILDER] Removing field with ID: ${fieldId}`);
    console.log(
      `🗑️ [BUILDER] Current fields:`,
      this.builderState.selectedFields.map((f) => ({ id: f.id, name: f.name }))
    );

    const beforeCount = this.builderState.selectedFields.length;
    this.builderState.selectedFields = this.builderState.selectedFields.filter(
      (f) => f.id != fieldId
    ); // Use != for loose comparison
    const afterCount = this.builderState.selectedFields.length;

    console.log(`🗑️ [BUILDER] Removed ${beforeCount - afterCount} fields`);

    this.renderSelectedFields();
    this.updateQueryPreview();
  }

  filterFields(fieldId, searchTerm) {
    console.log(
      `🔍 [BUILDER] Filtering fields for operation ${fieldId} with term: "${searchTerm}"`
    );

    const container = document.querySelector(
      `.response-fields-container[data-field-id="${fieldId}"]`
    );
    const clearBtn = document.querySelector(
      `.clear-search-btn[data-field-id="${fieldId}"]`
    );
    const resultsInfo = document.querySelector(
      `.search-results-info[data-field-id="${fieldId}"]`
    );

    if (!container) return;

    // Show/hide clear button
    if (clearBtn) {
      clearBtn.style.display = searchTerm ? "block" : "none";
    }

    if (!searchTerm) {
      // Show all fields efficiently
      this.showAllFieldsOptimized(container);
      if (resultsInfo) resultsInfo.style.display = "none";
      return;
    }

    // Use requestAnimationFrame to prevent UI blocking
    requestAnimationFrame(() => {
      this.performFieldFiltering(container, searchTerm, resultsInfo, fieldId);
    });
  }

  performFieldFiltering(container, searchTerm, resultsInfo, fieldId) {
    const searchLower = searchTerm.toLowerCase();
    const searchRegex = new RegExp(this.escapeRegex(searchTerm), "gi");

    let matchCount = 0;
    let totalCount = 0;

    // Get all field items once
    const fieldItems = container.querySelectorAll(".field-item");
    const matchingItems = [];
    const nonMatchingItems = [];

    // First pass: categorize items (faster than DOM manipulation in loop)
    fieldItems.forEach((item) => {
      totalCount++;
      const fieldName = item.querySelector(".field-name");
      const fieldType = item.querySelector(".field-type");

      const nameText = fieldName ? fieldName.textContent.toLowerCase() : "";
      const typeText = fieldType ? fieldType.textContent.toLowerCase() : "";

      // Smart matching based on search term length
      let matches = false;

      if (searchTerm.length === 1) {
        // For single character, only match if it's the start of a word
        const wordBoundaryRegex = new RegExp(
          `\\b${this.escapeRegex(searchLower)}`,
          "i"
        );
        matches =
          wordBoundaryRegex.test(nameText) || wordBoundaryRegex.test(typeText);
      } else if (searchTerm.length === 2) {
        // For two characters, prefer word start but allow partial matches
        const wordStartRegex = new RegExp(
          `\\b${this.escapeRegex(searchLower)}`,
          "i"
        );
        const partialMatch =
          nameText.includes(searchLower) || typeText.includes(searchLower);
        // Prioritize word start matches, but allow partial for short terms
        matches =
          wordStartRegex.test(nameText) ||
          wordStartRegex.test(typeText) ||
          partialMatch;
      } else {
        // For longer terms, use standard partial matching
        matches =
          nameText.includes(searchLower) || typeText.includes(searchLower);
      }

      if (matches) {
        matchCount++;
        matchingItems.push({ item, fieldName, fieldType, searchRegex });
      } else {
        nonMatchingItems.push({ item, fieldName, fieldType });
      }
    });

    // Batch DOM operations for better performance
    const fragment = document.createDocumentFragment();

    // Hide non-matching items first (batch operation)
    nonMatchingItems.forEach(({ item, fieldName, fieldType }) => {
      item.style.display = "none";
      this.removeHighlighting(fieldName);
      this.removeHighlighting(fieldType);
    });

    // Process matching items in smaller batches to prevent UI blocking
    const batchSize = 50;
    let processedCount = 0;

    const processBatch = () => {
      const endIndex = Math.min(
        processedCount + batchSize,
        matchingItems.length
      );

      for (let i = processedCount; i < endIndex; i++) {
        const { item, fieldName, fieldType, searchRegex } = matchingItems[i];

        item.style.display = "block";
        this.highlightSearchTextOptimized(fieldName, searchRegex);
        this.highlightSearchTextOptimized(fieldType, searchRegex);
        this.showParentFields(item);
      }

      processedCount = endIndex;

      // Continue processing if there are more items
      if (processedCount < matchingItems.length) {
        requestAnimationFrame(processBatch);
      } else {
        // Update results info after all processing is done
        this.updateSearchResults(resultsInfo, matchCount, totalCount);
        console.log(
          `🔍 [BUILDER] Found ${matchCount} matching fields out of ${totalCount} (optimized)`
        );
      }
    };

    // Start batch processing
    if (matchingItems.length > 0) {
      processBatch();
    } else {
      this.updateSearchResults(resultsInfo, matchCount, totalCount);
      console.log(
        `🔍 [BUILDER] Found ${matchCount} matching fields out of ${totalCount} (optimized)`
      );
    }
  }

  updateSearchResults(resultsInfo, matchCount, totalCount) {
    if (resultsInfo) {
      const resultsCount = resultsInfo.querySelector(".results-count");
      if (resultsCount) {
        resultsCount.textContent = `${matchCount} of ${totalCount} fields`;
      }
      resultsInfo.style.display = matchCount > 0 ? "flex" : "none";
    }
  }

  showAllFields(container) {
    const fieldItems = container.querySelectorAll(".field-item");
    fieldItems.forEach((item) => {
      item.style.display = "block";

      // Remove highlighting
      const fieldName = item.querySelector(".field-name");
      const fieldType = item.querySelector(".field-type");
      this.removeHighlighting(fieldName);
      this.removeHighlighting(fieldType);
    });
  }

  showAllFieldsOptimized(container) {
    // Use CSS class toggle for better performance
    container.classList.remove("search-filtered");

    // Remove all highlighting in one batch operation
    const highlightedElements = container.querySelectorAll(
      "mark.search-highlight"
    );
    highlightedElements.forEach((mark) => {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize(); // Merge adjacent text nodes
    });

    // Show all field items
    const fieldItems = container.querySelectorAll(
      '.field-item[style*="display: none"]'
    );
    fieldItems.forEach((item) => {
      item.style.display = "block";
    });
  }

  highlightSearchTextOptimized(element, searchRegex) {
    if (!element || !element.textContent) return;

    const text = element.textContent;
    const highlightedText = text.replace(
      searchRegex,
      '<mark class="search-highlight">$&</mark>'
    );

    if (highlightedText !== text) {
      element.innerHTML = highlightedText;
    }
  }

  showParentFields(fieldItem) {
    let parent = fieldItem.parentElement;
    while (parent) {
      if (parent.classList.contains("nested-fields")) {
        parent.style.display = "block";

        // Find and update the expand button
        const fieldPath = parent.dataset.fieldPath;
        const operationId = parent.dataset.operationId;
        const expandBtn = document.querySelector(
          `.expand-field-btn[data-field-path="${fieldPath}"][data-operation-id="${operationId}"]`
        );
        if (expandBtn) {
          expandBtn.dataset.expanded = "true";
          const icon = expandBtn.querySelector(".expand-icon");
          if (icon) {
            icon.style.transform = "rotate(90deg)";
          }
        }
      }

      if (parent.classList.contains("field-item")) {
        parent.style.display = "block";
      }

      parent = parent.parentElement;
    }
  }

  highlightSearchText(element, searchTerm) {
    if (!element || !searchTerm) return;

    const originalText = element.textContent;
    const searchRegex = new RegExp(`(${this.escapeRegex(searchTerm)})`, "gi");
    const highlightedText = originalText.replace(
      searchRegex,
      '<mark class="search-highlight">$1</mark>'
    );

    if (highlightedText !== originalText) {
      element.innerHTML = highlightedText;
    }
  }

  removeHighlighting(element) {
    if (!element) return;

    const highlights = element.querySelectorAll(".search-highlight");
    highlights.forEach((highlight) => {
      const parent = highlight.parentNode;
      parent.replaceChild(
        document.createTextNode(highlight.textContent),
        highlight
      );
      parent.normalize();
    });
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  expandAllMatchingFields(fieldId) {
    console.log(
      `📂 [BUILDER] Expanding all matching fields for operation ${fieldId}`
    );

    const container = document.querySelector(
      `.response-fields-container[data-field-id="${fieldId}"]`
    );
    if (!container) return;

    // Find all visible field items with expand buttons
    const visibleFields = container.querySelectorAll(
      '.field-item:not([style*="display: none"]) .expand-field-btn'
    );
    visibleFields.forEach((btn) => {
      if (btn.dataset.expanded !== "true") {
        btn.click();
      }
    });
  }

  toggleAllResponseFields(fieldId, currentAction) {
    console.log(
      `🔄 [BUILDER] Toggle all response fields for operation ${fieldId}, action: ${currentAction}`
    );

    // Find the button and show loading state
    const button = document.querySelector(
      `.select-all-fields-btn[data-field-id="${fieldId}"]`
    );
    if (button) {
      const originalText = button.textContent;
      button.disabled = true;
      button.innerHTML = `<span class="loading-spinner"></span> ${
        currentAction === "select-all" ? "Selecting..." : "Clearing..."
      }`;
      button.classList.add("loading");
    }

    // Use setTimeout to allow UI to update before heavy operation
    setTimeout(() => {
      try {
        // Find the operation
        const field = this.builderState.selectedFields.find(
          (f) => f.id == fieldId
        );
        if (!field || !field.operation) {
          console.warn(
            `🔄 [BUILDER] Operation not found for fieldId: ${fieldId}`
          );
          return;
        }

        const returnFields = this.getFieldsForType(field.operation.type);
        const allFieldPaths = this.getAllFieldPaths(returnFields, "");

        console.log(
          `🔄 [BUILDER] Found ${allFieldPaths.length} total field paths`
        );

        if (currentAction === "select-all") {
          // Select all fields in batches to prevent UI freezing
          const batchSize = 100;
          let processedCount = 0;

          const processBatch = () => {
            const batch = allFieldPaths.slice(
              processedCount,
              processedCount + batchSize
            );
            batch.forEach((fieldPath) => {
              if (!field.selectedSubFields.includes(fieldPath)) {
                field.selectedSubFields.push(fieldPath);
              }
            });

            processedCount += batch.length;

            if (processedCount < allFieldPaths.length) {
              // Update progress and continue
              if (button) {
                button.innerHTML = `<span class="loading-spinner"></span> Selecting... (${processedCount}/${allFieldPaths.length})`;
              }
              setTimeout(processBatch, 10); // Small delay to keep UI responsive
            } else {
              // Finished
              console.log(
                `✅ [BUILDER] Selected all ${allFieldPaths.length} fields`
              );
              this.finishToggleAllFields(button, fieldId, "select-all");
            }
          };

          processBatch();
        } else if (currentAction === "deselect-all") {
          // Deselect all fields (this is fast)
          field.selectedSubFields = [];
          console.log(`🗑️ [BUILDER] Deselected all fields`);
          this.finishToggleAllFields(button, fieldId, "deselect-all");
        }
      } catch (error) {
        console.error(`❌ [BUILDER] Error in toggleAllResponseFields:`, error);
        if (button) {
          button.disabled = false;
          button.classList.remove("loading");
          button.textContent = "Error - Try Again";
        }
      }
    }, 50);
  }

  finishToggleAllFields(button, fieldId, action) {
    // Update UI
    this.renderSelectedFields();
    this.updateQueryPreview();

    // Reset button state
    if (button) {
      button.disabled = false;
      button.classList.remove("loading");

      // Update button text and action for next click
      const newAction = action === "select-all" ? "deselect-all" : "select-all";
      const newText =
        newAction === "select-all" ? "Select All" : "Deselect All";

      button.textContent = newText;
      button.dataset.action = newAction;
      button.title =
        newAction === "select-all"
          ? "Select all fields"
          : "Deselect all fields";
    }
  }

  getAllFieldPaths(
    fields,
    parentPath,
    visitedPaths = new Set(),
    maxDepth = 3,
    currentDepth = 0
  ) {
    let paths = [];

    // Prevent infinite recursion by limiting depth more aggressively
    if (currentDepth >= maxDepth) {
      console.log(
        `🔄 [BUILDER] Max depth reached (${maxDepth}) for path: ${parentPath}`
      );
      return paths;
    }

    fields.forEach((field) => {
      const fieldPath = parentPath ? `${parentPath}.${field.name}` : field.name;

      // Skip if we've already processed this exact path (prevents infinite loops)
      if (visitedPaths.has(fieldPath)) {
        console.log(`🔄 [BUILDER] Skipping already visited path: ${fieldPath}`);
        return;
      }

      paths.push(fieldPath);
      visitedPaths.add(fieldPath);

      // Get nested fields
      const baseType = this.getBaseType(field.type);
      const isScalar = ["String", "Int", "Float", "Boolean", "ID"].includes(
        baseType
      );

      if (!isScalar) {
        // Check for type cycles in the current path
        const pathParts = fieldPath.split(".");
        const typeInCurrentPath = pathParts.some((part, index) => {
          if (index === pathParts.length - 1) return false; // Skip current field
          // Check if any parent field has the same type
          const parentPath = pathParts.slice(0, index + 1).join(".");
          const parentType = this.getFieldTypeFromPath(parentPath, parentPath);
          return parentType === baseType;
        });

        if (typeInCurrentPath) {
          console.log(
            `🔄 [BUILDER] Skipping circular type reference: ${baseType} at path: ${fieldPath}`
          );
          return;
        }

        const nestedFields = this.getFieldsForType(field.type);
        if (nestedFields.length > 0) {
          const nestedPaths = this.getAllFieldPaths(
            nestedFields,
            fieldPath,
            visitedPaths,
            maxDepth,
            currentDepth + 1
          );
          paths = paths.concat(nestedPaths);
        }
      }
    });

    return paths;
  }

  getFieldTypeFromPath(fieldPath, rootPath) {
    // Simple helper to get field type from path (simplified implementation)
    const parts = fieldPath.split(".");
    return parts[parts.length - 1]; // Return last part as type approximation
  }

  autoSelectChildFields(operation, parentPath) {
    console.log(`🔄 [BUILDER] Auto-selecting child fields for: ${parentPath}`);

    // Get the field information from the schema
    const pathParts = parentPath.split(".");
    let currentType = operation.operation.type;
    let currentFields = this.getFieldsForType(currentType);

    // Navigate to the field we're looking for
    for (const part of pathParts) {
      const field = currentFields.find((f) => f.name === part);
      if (!field) {
        console.log(`🔄 [BUILDER] Field not found: ${part}`);
        return;
      }

      currentType = field.type;
      currentFields = this.getFieldsForType(currentType);
    }

    // Get all child field paths with recursion protection
    const childPaths = this.getAllFieldPaths(
      currentFields,
      parentPath,
      new Set(),
      3,
      0
    );

    console.log(
      `🔄 [BUILDER] Found ${childPaths.length} child paths for ${parentPath}:`,
      childPaths
    );

    // Add child paths to selected fields (excluding the parent path itself)
    childPaths.forEach((childPath) => {
      if (
        childPath !== parentPath &&
        !operation.selectedSubFields.includes(childPath)
      ) {
        operation.selectedSubFields.push(childPath);
      }
    });

    // Update UI checkboxes
    setTimeout(() => {
      childPaths.forEach((childPath) => {
        if (childPath !== parentPath) {
          const childCheckbox = document.querySelector(
            `input[data-field-path="${childPath}"][data-field-id="${operation.id}"]`
          );
          if (childCheckbox && !childCheckbox.checked) {
            childCheckbox.checked = true;
          }
        }
      });
    }, 0);
  }

  toggleOperationArgument(fieldId, argName, isSelected) {
    console.log(
      `🔧 [BUILDER] toggleOperationArgument called: fieldId=${fieldId}, argName=${argName}, isSelected=${isSelected}`
    );

    const field = this.builderState.selectedFields.find((f) => f.id == fieldId); // Use loose equality
    console.log(`🔧 [BUILDER] Found field:`, field ? field.name : "NOT FOUND");

    if (field) {
      if (!field.selectedArguments) field.selectedArguments = [];

      console.log(
        `🔧 [BUILDER] Before update - selectedArguments:`,
        field.selectedArguments
      );

      if (isSelected) {
        if (!field.selectedArguments.includes(argName)) {
          field.selectedArguments.push(argName);
        }
      } else {
        field.selectedArguments = field.selectedArguments.filter(
          (name) => name !== argName
        );
        // Also remove the argument value
        if (field.argumentValues) {
          delete field.argumentValues[argName];
        }
      }

      console.log(
        `🔧 [BUILDER] After update - selectedArguments:`,
        field.selectedArguments
      );

      // Re-render to show/hide input fields
      this.renderSelectedFields();
      this.updateQueryPreview();
    } else {
      console.error(`❌ [BUILDER] Field not found with ID: ${fieldId}`);
      console.log(
        `❌ [BUILDER] Available fields:`,
        this.builderState.selectedFields.map((f) => ({
          id: f.id,
          name: f.name,
        }))
      );
    }
  }

  toggleOperationField(fieldId, fieldPath, isSelected) {
    console.log(
      `📋 [BUILDER] toggleOperationField called: fieldId=${fieldId}, fieldPath=${fieldPath}, isSelected=${isSelected}`
    );

    const field = this.builderState.selectedFields.find((f) => f.id == fieldId); // Use loose equality
    console.log(`📋 [BUILDER] Found field:`, field ? field.name : "NOT FOUND");

    if (field) {
      if (!field.selectedSubFields) field.selectedSubFields = [];

      console.log(
        `📋 [BUILDER] Before update - selectedSubFields:`,
        field.selectedSubFields
      );

      if (isSelected) {
        if (!field.selectedSubFields.includes(fieldPath)) {
          field.selectedSubFields.push(fieldPath);
        }

        // Auto-select all child fields when parent is selected
        this.autoSelectChildFields(field, fieldPath);
      } else {
        // Remove this field
        field.selectedSubFields = field.selectedSubFields.filter(
          (path) => path !== fieldPath
        );

        // Also remove all child fields (nested fields that start with this path)
        field.selectedSubFields = field.selectedSubFields.filter(
          (path) => !path.startsWith(fieldPath + ".")
        );

        // Update checkboxes in the UI
        setTimeout(() => {
          // Uncheck all child checkboxes
          const childCheckboxes = document.querySelectorAll(
            `input[data-field-path^="${fieldPath}."]`
          );
          childCheckboxes.forEach((checkbox) => {
            checkbox.checked = false;
          });
        }, 0);
      }

      console.log(
        `📋 [BUILDER] After update - selectedSubFields:`,
        field.selectedSubFields
      );

      this.updateQueryPreview();
    } else {
      console.error(`❌ [BUILDER] Field not found with ID: ${fieldId}`);
      console.log(
        `❌ [BUILDER] Available fields:`,
        this.builderState.selectedFields.map((f) => ({
          id: f.id,
          name: f.name,
        }))
      );
    }
  }

  toggleNestedFieldsExpansion(btn) {
    const fieldPath = btn.dataset.fieldPath;
    const operationId = btn.dataset.operationId;
    const isLazyLoad = btn.dataset.lazyLoad === "true";
    const container = document.querySelector(
      `.nested-fields[data-field-path="${fieldPath}"][data-operation-id="${operationId}"]`
    );
    const icon = btn.querySelector(".expand-icon");

    if (!container || !icon) {
      console.warn(
        `🔄 [BUILDER] Container or icon not found for: ${fieldPath}`
      );
      return;
    }

    const isExpanded = btn.dataset.expanded === "true";
    const isLoaded = container.dataset.loaded === "true";

    if (isExpanded) {
      // Collapse
      this.collapseField(container, icon, btn, fieldPath, isLazyLoad, isLoaded);
    } else {
      // Expand
      this.expandField(
        container,
        icon,
        btn,
        fieldPath,
        operationId,
        isLazyLoad,
        isLoaded
      );
    }
  }

  collapseField(container, icon, btn, fieldPath, isLazyLoad, isLoaded) {
    // First, recursively collapse all child fields to prevent conflicts
    const childExpandButtons = container.querySelectorAll(
      '.expand-field-btn[data-expanded="true"]'
    );
    childExpandButtons.forEach((childBtn) => {
      if (childBtn !== btn) {
        const childIcon = childBtn.querySelector(".expand-icon");
        if (childIcon) {
          childIcon.style.transform = "rotate(0deg)";
          childBtn.dataset.expanded = "false";
        }
      }
    });

    // Hide all nested containers
    const nestedContainers = container.querySelectorAll(".nested-fields");
    nestedContainers.forEach((nestedContainer) => {
      nestedContainer.style.display = "none";
    });

    // Now collapse the main container
    container.style.display = "none";
    icon.style.transform = "rotate(0deg)";
    btn.dataset.expanded = "false";

    // For memory efficiency, remove lazy-loaded content when collapsed
    if (isLazyLoad && isLoaded) {
      // Use setTimeout to avoid conflicts with ongoing operations
      setTimeout(() => {
        container.innerHTML =
          '<div class="lazy-load-placeholder"><em>Click expand button to load nested fields...</em></div>';
        container.dataset.loaded = "false";
        console.log(
          `🧹 [BUILDER] Cleaned up lazy-loaded content for: ${fieldPath}`
        );
      }, 100);
    }

    console.log(`📁 [BUILDER] Collapsed field: ${fieldPath}`);
  }

  expandField(
    container,
    icon,
    btn,
    fieldPath,
    operationId,
    isLazyLoad,
    isLoaded
  ) {
    if (isLazyLoad && !isLoaded) {
      // Lazy load the nested fields
      console.log(`🔄 [BUILDER] Lazy loading nested fields for: ${fieldPath}`);
      this.loadNestedFields(fieldPath, operationId, container);
    }

    container.style.display = "block";
    icon.style.transform = "rotate(90deg)";
    btn.dataset.expanded = "true";
    console.log(`📂 [BUILDER] Expanded field: ${fieldPath}`);
  }

  loadNestedFields(fieldPath, operationId, container) {
    // Find the operation
    const operation = this.builderState.selectedFields.find(
      (f) => f.id == operationId
    );
    if (!operation) {
      console.error(`❌ [BUILDER] Operation not found: ${operationId}`);
      return;
    }

    // Navigate to the field in the schema
    const pathParts = fieldPath.split(".");
    let currentType = operation.operation.type;
    let currentFields = this.getFieldsForType(currentType);

    for (const part of pathParts) {
      const field = currentFields.find((f) => f.name === part);
      if (!field) {
        console.error(`❌ [BUILDER] Field not found in path: ${part}`);
        return;
      }
      currentType = field.type;
      currentFields = this.getFieldsForType(currentType);
    }

    // Get the current depth from the container's parent
    const parentFieldItem = container.closest(".field-item");
    const currentDepth = parentFieldItem
      ? parseInt(parentFieldItem.dataset.depth) + 1
      : 1;

    // Render the nested fields
    const nestedFieldsHtml = this.renderOperationFieldsTree(
      currentFields,
      operation,
      fieldPath,
      currentDepth,
      true
    );

    // Update the container
    container.innerHTML = nestedFieldsHtml;
    container.dataset.loaded = "true";

    // Re-attach event listeners for the newly loaded fields (only for new elements)
    this.attachListenersToNewElements(container);

    console.log(
      `✅ [BUILDER] Loaded ${currentFields.length} nested fields for: ${fieldPath}`
    );
  }

  attachListenersToNewElements(container) {
    // Only attach listeners to new elements within the container

    // Field checkboxes
    const fieldCheckboxes = container.querySelectorAll(
      ".operation-field-checkbox"
    );
    fieldCheckboxes.forEach((checkbox) => {
      if (!checkbox._hasListener) {
        checkbox.addEventListener("change", (e) => {
          const fieldId = e.target.dataset.fieldId;
          const fieldPath = e.target.dataset.fieldPath;
          console.log(
            `📋 [BUILDER] Response field checkbox clicked: ${fieldPath}, checked: ${e.target.checked}, fieldId: ${fieldId}`
          );
          this.toggleOperationField(fieldId, fieldPath, e.target.checked);
        });
        checkbox._hasListener = true;
      }
    });

    // Expand buttons
    const expandButtons = container.querySelectorAll(".expand-field-btn");
    expandButtons.forEach((btn) => {
      if (!btn._hasListener) {
        const handler = (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (btn._isProcessing) {
            console.log("🔄 [BUILDER] Ignoring rapid click on expand button");
            return;
          }

          btn._isProcessing = true;
          this.toggleNestedFieldsExpansion(btn);

          setTimeout(() => {
            btn._isProcessing = false;
          }, 300);
        };
        btn.addEventListener("click", handler);
        btn._hasListener = true;
        btn._handler = handler;
      }
    });
  }

  updateArgumentValue(fieldId, argName, value) {
    console.log(
      `💾 [BUILDER] updateArgumentValue: fieldId=${fieldId}, argName=${argName}, value="${value}"`
    );

    const field = this.builderState.selectedFields.find((f) => f.id == fieldId); // Use loose equality
    if (field) {
      if (!field.argumentValues) field.argumentValues = {};
      field.argumentValues[argName] = value;

      console.log(
        `💾 [BUILDER] Updated ${field.name} argumentValues:`,
        field.argumentValues
      );

      this.updateQueryPreview();
    } else {
      console.error(
        `❌ [BUILDER] Field not found for updateArgumentValue: ${fieldId}`
      );
    }
  }

  toggleSubField(fieldId, subfieldName, isSelected) {
    const field = this.builderState.selectedFields.find(
      (f) => f.id === fieldId
    );
    if (field) {
      if (!field.selectedSubFields) field.selectedSubFields = [];

      if (isSelected) {
        if (!field.selectedSubFields.includes(subfieldName)) {
          field.selectedSubFields.push(subfieldName);
        }
      } else {
        field.selectedSubFields = field.selectedSubFields.filter(
          (name) => name !== subfieldName
        );
      }

      this.updateQueryPreview();
    }
  }

  updateQueryPreview() {
    const operationType = this.operationType.value;
    const operationName = this.operationName.value.trim();

    // Update builder state
    this.builderState.currentOperationType = operationType;
    this.builderState.currentOperationName = operationName;

    // Generate query string
    const query = this.generateBuilderQuery();

    // Update preview
    this.queryPreview.textContent = query;

    // Apply syntax highlighting if available
    if (window.hljs) {
      try {
        const highlighted = window.hljs.highlight(query, {
          language: "graphql",
        });
        this.queryPreview.innerHTML = highlighted.value;
      } catch (e) {
        console.warn("Failed to highlight query:", e);
        this.queryPreview.textContent = query;
      }
    }
  }

  generateBuilderQuery() {
    const { selectedFields, currentOperationType, currentOperationName } =
      this.builderState;

    if (selectedFields.length === 0) {
      return `# Click the + button next to queries/mutations to add them here
# Then select arguments and response fields to build your query`;
    }

    // Build variables and arguments
    const variables = [];
    const queryFields = [];

    selectedFields.forEach((field) => {
      if (field.type === "operation") {
        // Add selected arguments as variables
        if (
          field.selectedArguments &&
          field.selectedArguments.length > 0 &&
          field.operation &&
          field.operation.args
        ) {
          field.selectedArguments.forEach((argName) => {
            const arg = field.operation.args.find((a) => a.name === argName);
            if (arg) {
              variables.push(`$${argName}: ${this.getTypeString(arg.type)}`);
            }
          });
        }

        // Build field string
        let fieldString = field.name;

        // Add selected arguments
        if (field.selectedArguments && field.selectedArguments.length > 0) {
          const args = field.selectedArguments
            .map((argName) => {
              return `${argName}: $${argName}`;
            })
            .join(", ");
          fieldString += `(${args})`;
        }

        // Add sub-fields - ONLY if user has selected some
        if (field.selectedSubFields && field.selectedSubFields.length > 0) {
          const nestedFields = this.buildNestedFieldsString(
            field.selectedSubFields
          );
          fieldString += ` {\n${nestedFields}\n  }`;
        } else {
          // No fields selected - show placeholder
          fieldString += ` {
    # Select response fields to see them here
  }`;
        }

        queryFields.push(fieldString);
      }
    });

    // Build the complete query
    const operationHeader = currentOperationName
      ? `${currentOperationType} ${currentOperationName}`
      : currentOperationType;

    const variableString =
      variables.length > 0 ? `(${variables.join(", ")})` : "";

    return `${operationHeader}${variableString} {
  ${queryFields.join("\n  ")}
}`;
  }

  getDefaultFieldsForType(typeName) {
    const typeData = this.currentSchema?.types?.find(
      (t) => t.name === typeName
    );
    if (!typeData?.fields) return [];

    // Return first 5 scalar fields as defaults
    return typeData.fields
      .filter((field) => {
        const baseType = this.getBaseType(field.type);
        return ["String", "Int", "Float", "Boolean", "ID"].includes(baseType);
      })
      .slice(0, 5)
      .map((field) => field.name);
  }

  buildNestedFieldsString(fieldPaths) {
    // Build a tree structure from dot-separated paths
    const tree = {};

    fieldPaths.forEach((path) => {
      const parts = path.split(".");
      let current = tree;

      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = index === parts.length - 1 ? null : {};
        }
        if (index < parts.length - 1) {
          current = current[part];
        }
      });
    });

    // Convert tree to GraphQL string
    return this.treeToGraphQLString(tree, 2);
  }

  treeToGraphQLString(tree, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    const lines = [];

    Object.keys(tree).forEach((key) => {
      if (tree[key] === null) {
        // Leaf node (scalar field)
        lines.push(`${indent}${key}`);
      } else {
        // Branch node (object field)
        lines.push(`${indent}${key} {`);
        lines.push(this.treeToGraphQLString(tree[key], indentLevel + 1));
        lines.push(`${indent}}`);
      }
    });

    return lines.join("\n");
  }

  copyGeneratedQuery() {
    const query = this.queryPreview.textContent;
    navigator.clipboard
      .writeText(query)
      .then(() => {
        // Show feedback
        const originalText = this.copyQueryBtn.textContent;
        this.copyQueryBtn.textContent = "Copied!";
        setTimeout(() => {
          this.copyQueryBtn.textContent = originalText;
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy query:", err);
      });
  }

  executeBuilderQuery() {
    console.log(`🚀 [BUILDER] Executing builder query...`);

    // Copy the generated query to the editor and execute
    const query = this.queryPreview.textContent;
    console.log(`🚀 [BUILDER] Generated query:`, query);

    this.queryEditor.value = query;

    // Generate variables from builder state
    const variables = this.generateBuilderVariables();
    console.log(`🚀 [BUILDER] Generated variables:`, variables);

    this.variablesEditor.value = JSON.stringify(variables, null, 2);

    // Execute the query and show response in builder
    this.executeQueryForBuilder();
  }

  async executeQueryForBuilder() {
    try {
      // Show loading state
      this.builderResponse.style.display = "block";
      this.builderResponseContent.textContent = "Loading...";
      this.builderResponseContent.className = "response-code loading";

      // Get query details
      const query = this.queryEditor.value;
      const variables = JSON.parse(this.variablesEditor.value || "{}");
      const headers = JSON.parse(this.headersEditor.value || "{}");

      // Execute the query
      const response = await this.performGraphQLRequest(
        query,
        variables,
        headers
      );

      // Display the response
      this.displayBuilderResponse(response);
    } catch (error) {
      console.error("Builder query execution failed:", error);
      this.displayBuilderResponse({
        error: error.message || "Query execution failed",
        details: error,
      });
    }
  }

  async performGraphQLRequest(query, variables, additionalHeaders = {}) {
    const endpoint = this.schemaEndpoint.value.trim();

    if (!endpoint) {
      throw new Error("Please enter endpoint URL");
    }

    // Build headers
    let headers = {
      "Content-Type": "application/json",
    };

    // Build auth headers
    const authHeaders = this.buildAuthHeaders();
    headers = { ...headers, ...authHeaders };

    // Add additional headers
    headers = { ...headers, ...additionalHeaders };

    // Make the request
    const response = await fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        query: query,
        variables: variables,
      }),
    });

    const result = await response.json();
    return result;
  }

  displayBuilderResponse(response) {
    // Show response section
    this.builderResponse.style.display = "block";

    // Format and display the response
    const formattedResponse = JSON.stringify(response, null, 2);
    this.builderResponseContent.textContent = formattedResponse;

    // Apply syntax highlighting
    this.builderResponseContent.className = "response-code";
    if (window.hljs) {
      try {
        const highlighted = window.hljs.highlight(formattedResponse, {
          language: "json",
        });
        this.builderResponseContent.innerHTML = highlighted.value;
      } catch (e) {
        console.warn("Failed to highlight response:", e);
      }
    }

    // Add status class
    if (response.error || response.errors) {
      this.builderResponseContent.classList.add("error");
    } else {
      this.builderResponseContent.classList.add("success");
    }
  }

  clearBuilderResponse() {
    this.builderResponse.style.display = "none";
    this.builderResponseContent.textContent = "";
    this.builderResponseContent.className = "response-code";
  }

  generateBuilderVariables() {
    const variables = {};

    console.log(
      `📦 [BUILDER] Generating variables for ${this.builderState.selectedFields.length} operations`
    );

    this.builderState.selectedFields.forEach((field) => {
      if (
        field.type === "operation" &&
        field.selectedArguments &&
        field.selectedArguments.length > 0
      ) {
        console.log(
          `📦 [BUILDER] Processing ${field.name} with selected args:`,
          field.selectedArguments
        );
        console.log(`📦 [BUILDER] Argument values:`, field.argumentValues);

        field.selectedArguments.forEach((argName) => {
          const value =
            (field.argumentValues && field.argumentValues[argName]) || "";

          console.log(`📦 [BUILDER] Setting variable ${argName} = "${value}"`);

          // Only include variables that have actual values or are required
          if (value !== "" || this.isArgumentRequired(field, argName)) {
            // Try to parse as JSON for complex types, fallback to string
            try {
              // Check if it looks like JSON
              if (
                value.startsWith("{") ||
                value.startsWith("[") ||
                value === "true" ||
                value === "false" ||
                !isNaN(value)
              ) {
                variables[argName] = JSON.parse(value);
              } else {
                variables[argName] = value;
              }
            } catch {
              variables[argName] = value;
            }
          }
        });
      }
    });

    console.log(`📦 [BUILDER] Generated variables:`, variables);
    return variables;
  }

  isArgumentRequired(field, argName) {
    if (!field.operation || !field.operation.args) return false;

    const arg = field.operation.args.find((a) => a.name === argName);
    if (!arg) return false;

    // Check if the type is non-null (required)
    return this.getTypeString(arg.type).includes("!");
  }

  switchToEditor() {
    // Copy current builder query to editor
    const query = this.queryPreview.textContent;
    if (query && !query.startsWith("#")) {
      this.queryEditor.value = query;

      const variables = this.generateBuilderVariables();
      this.variablesEditor.value = JSON.stringify(variables, null, 2);
    }

    // Switch to editor tab
    this.switchQueryTab("editor");
  }

  generateQuery(operationType, operationName) {
    let operation;

    if (operationType === "query") {
      operation = this.schemaData.queries.find((q) => q.name === operationName);
    } else if (operationType === "mutation") {
      operation = this.schemaData.mutations.find(
        (m) => m.name === operationName
      );
    } else if (operationType === "subscription") {
      operation = this.schemaData.subscriptions.find(
        (s) => s.name === operationName
      );
    }

    if (!operation) return;

    // Generate query string
    const args = operation.args || [];
    const argString =
      args.length > 0
        ? `(${args.map((arg) => `${arg.name}: $${arg.name}`).join(", ")})`
        : "";

    const queryString = `${operationType} ${
      operationName.charAt(0).toUpperCase() + operationName.slice(1)
    }${
      args.length > 0
        ? `(${args
            .map((arg) => `$${arg.name}: ${this.getTypeString(arg.type)}`)
            .join(", ")})`
        : ""
    } {
  ${operationName}${argString} {
    # Add fields here
  }
}`;

    // Generate variables
    const variables = {};
    args.forEach((arg) => {
      variables[arg.name] = this.getDefaultValue(arg.type);
    });

    this.queryEditor.value = queryString;
    this.variablesEditor.value = JSON.stringify(variables, null, 2);

    // Highlight selected item
    document.querySelectorAll(".schema-item.selected").forEach((item) => {
      item.classList.remove("selected");
    });

    const selectedItem = document.querySelector(
      `[data-operation-type="${operationType}"][data-name="${operationName}"]`
    );
    if (selectedItem) {
      selectedItem.classList.add("selected");
    }
  }

  getTypeString(type) {
    if (type.kind === "NON_NULL") {
      return this.getTypeString(type.ofType) + "!";
    } else if (type.kind === "LIST") {
      return "[" + this.getTypeString(type.ofType) + "]";
    } else {
      return type.name;
    }
  }

  getDefaultValue(type) {
    if (type.kind === "NON_NULL") {
      return this.getDefaultValue(type.ofType);
    } else if (type.kind === "LIST") {
      return [];
    } else {
      switch (type.name) {
        case "String":
          return "";
        case "Int":
          return 0;
        case "Float":
          return 0.0;
        case "Boolean":
          return false;
        case "ID":
          return "";
        default:
          return null;
      }
    }
  }

  async executeQuery() {
    const endpoint = this.schemaEndpoint.value.trim();
    const query = this.queryEditor.value.trim();

    if (!endpoint || !query) {
      alert("Please enter both endpoint URL and query");
      return;
    }

    let variables = {};
    let headers = {
      "Content-Type": "application/json",
    };

    // Parse variables
    try {
      const variablesText = this.variablesEditor.value.trim();
      if (variablesText) {
        variables = JSON.parse(variablesText);
      }
    } catch (error) {
      alert("Invalid JSON in variables: " + error.message);
      return;
    }

    // Build auth headers
    const authHeaders = this.buildAuthHeaders();
    headers = { ...headers, ...authHeaders };

    // Parse additional headers
    try {
      const headersText = this.headersEditor.value.trim();
      if (headersText) {
        const additionalHeaders = JSON.parse(headersText);
        headers = { ...headers, ...additionalHeaders };
      }
    } catch (error) {
      alert("Invalid JSON in additional headers: " + error.message);
      return;
    }

    // Show loading state
    this.queryResponse.innerHTML =
      '<div class="loading">Executing query...</div>';

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          query: query,
          variables: variables,
        }),
      });

      const result = await response.json();

      // Display response with syntax highlighting
      const responseHtml = `<pre><code class="language-json">${this.escapeHtml(
        JSON.stringify(result, null, 2)
      )}</code></pre>`;
      this.queryResponse.innerHTML = responseHtml;

      // Apply syntax highlighting
      if (window.hljs) {
        const codeElement = this.queryResponse.querySelector("code");
        if (codeElement) {
          window.hljs.highlightElement(codeElement);
        }
      }
    } catch (error) {
      console.error("Query execution failed:", error);
      this.queryResponse.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
  }

  filterSchema() {
    const searchTerm = this.schemaSearch.value.toLowerCase().trim();

    // Filter each section and get counts
    const queriesCount = this.filterSchemaSection(
      this.schemaQueries,
      searchTerm
    );
    const mutationsCount = this.filterSchemaSection(
      this.schemaMutations,
      searchTerm
    );
    const subscriptionsCount = this.filterSchemaSection(
      this.schemaSubscriptions,
      searchTerm
    );
    const typesCount = this.filterSchemaSection(this.schemaTypes, searchTerm);

    // Log search results
    if (searchTerm !== "") {
      const totalResults =
        queriesCount + mutationsCount + subscriptionsCount + typesCount;
      console.log(
        `🔍 Search results for "${searchTerm}": ${totalResults} items (Q:${queriesCount}, M:${mutationsCount}, S:${subscriptionsCount}, T:${typesCount})`
      );
    }
  }

  filterSchemaSection(container, searchTerm) {
    const items = container.querySelectorAll(".schema-tree-item");
    let visibleCount = 0;

    items.forEach((item) => {
      const nameElement = item.querySelector(".field-name");

      if (nameElement) {
        const name = nameElement.textContent.toLowerCase();
        const descriptionText = nameElement.dataset.description
          ? nameElement.dataset.description.toLowerCase()
          : "";

        const matches =
          searchTerm === "" ||
          name.includes(searchTerm) ||
          descriptionText.includes(searchTerm);
        item.style.display = matches ? "block" : "none";

        if (matches) {
          visibleCount++;
        }
      }
    });

    return visibleCount;
  }

  showSchemaLoading(show) {
    this.schemaLoading.style.display = show ? "flex" : "none";
    if (show) {
      this.hideSchemaError();
      this.hideSchemaSuccess();
    } else {
      this.updateStatusContainerVisibility();
    }
  }

  showSchemaError(message) {
    this.schemaError.style.display = "flex";
    this.hideSchemaSuccess();
    if (message) {
      const statusText = this.schemaError.querySelector(".status-text");
      if (statusText) {
        statusText.textContent = `Failed to load schema: ${message}`;
      }
    }
  }

  hideSchemaError() {
    this.schemaError.style.display = "none";
    this.updateStatusContainerVisibility();
  }

  showSchemaSuccess(message = "Schema loaded successfully!") {
    const schemaSuccess = document.getElementById("schemaSuccess");
    if (schemaSuccess) {
      schemaSuccess.style.display = "flex";
      this.hideSchemaError();
      const statusText = schemaSuccess.querySelector(".status-text");
      if (statusText) {
        statusText.textContent = message;
      }

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        this.hideSchemaSuccess();
      }, 3000);
    }
  }

  hideSchemaSuccess() {
    const schemaSuccess = document.getElementById("schemaSuccess");
    if (schemaSuccess) {
      schemaSuccess.style.display = "none";
    }
    this.updateStatusContainerVisibility();
  }

  updateStatusContainerVisibility() {
    const statusContainer = document.querySelector(".schema-status-container");
    const hasVisibleStatus =
      this.schemaLoading.style.display === "flex" ||
      this.schemaError.style.display === "flex" ||
      (document.getElementById("schemaSuccess") &&
        document.getElementById("schemaSuccess").style.display === "flex");

    if (statusContainer) {
      statusContainer.style.display = hasVisibleStatus ? "flex" : "none";
    }
  }

  calculateSchemaContentWidths() {
    console.log("🔧 [SCHEMA] Calculating dynamic content widths...");

    // Get all schema tree containers
    const containers = [
      this.schemaQueries,
      this.schemaMutations,
      this.schemaSubscriptions,
      this.schemaTypes,
    ];
    let maxRequiredWidth = 200; // Start with minimum sidebar width

    containers.forEach((container) => {
      if (!container) return;

      // Get all headers in this container
      const headers = container.querySelectorAll(".schema-tree-header");
      headers.forEach((header) => {
        const requiredWidth = this.measureHeaderContentWidth(header);
        maxRequiredWidth = Math.max(maxRequiredWidth, requiredWidth);
      });
    });

    // Add some padding for safety
    maxRequiredWidth += 20;

    // Set the minimum width for the sidebar content
    const sidebar = document.querySelector(".schema-sidebar");
    if (sidebar) {
      // Set a CSS custom property that can be used for min-width calculations
      sidebar.style.setProperty("--content-min-width", `${maxRequiredWidth}px`);

      console.log(
        `🔧 [SCHEMA] Calculated minimum content width: ${maxRequiredWidth}px`
      );

      // If current width is smaller than required, enable horizontal scrolling
      const currentWidth = sidebar.offsetWidth;
      if (currentWidth < maxRequiredWidth) {
        console.log(
          `🔧 [SCHEMA] Current width (${currentWidth}px) < required (${maxRequiredWidth}px), enabling horizontal scroll`
        );
      }
    }
  }

  measureHeaderContentWidth(header) {
    // Create a temporary clone for measurement
    const clone = header.cloneNode(true);
    clone.style.position = "absolute";
    clone.style.visibility = "hidden";
    clone.style.top = "-9999px";
    clone.style.left = "-9999px";
    clone.style.width = "auto";
    clone.style.minWidth = "0";
    clone.style.maxWidth = "none";

    // Append to body for measurement
    document.body.appendChild(clone);

    // Measure the natural width
    const naturalWidth = clone.offsetWidth;

    // Clean up
    document.body.removeChild(clone);

    return naturalWidth;
  }

  setupSidebarResizeObserver() {
    const sidebar = document.querySelector(".schema-sidebar");
    if (!sidebar || !window.ResizeObserver) return;

    // Clean up existing observer
    if (this.sidebarResizeObserver) {
      this.sidebarResizeObserver.disconnect();
    }

    this.sidebarResizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const currentWidth = entry.contentRect.width;
        const requiredWidth =
          parseInt(sidebar.style.getPropertyValue("--content-min-width")) ||
          200;

        if (currentWidth < requiredWidth) {
          console.log(
            `🔧 [SCHEMA] Sidebar resized to ${currentWidth}px, required: ${requiredWidth}px - horizontal scroll active`
          );
        } else {
          console.log(
            `🔧 [SCHEMA] Sidebar resized to ${currentWidth}px, sufficient for content`
          );
        }
      }
    });

    this.sidebarResizeObserver.observe(sidebar);
  }

  showSearchPending(fieldId, searchTerm) {
    const resultsInfo = document.querySelector(
      `.search-results-info[data-field-id="${fieldId}"]`
    );
    if (resultsInfo) {
      resultsInfo.style.display = "block";
      resultsInfo.innerHTML = `<span style="color: var(--text-secondary); font-style: italic;">Searching for "${searchTerm}"...</span>`;
    }
  }

  hideSearchPending(fieldId) {
    const resultsInfo = document.querySelector(
      `.search-results-info[data-field-id="${fieldId}"]`
    );
    if (resultsInfo) {
      resultsInfo.innerHTML = "";
    }
  }

  // Make code blocks searchable and add visual indicators
  makeCodeBlocksSearchable() {
    const codeBlocks = document.querySelectorAll(".code-block");

    codeBlocks.forEach((codeBlock) => {
      // Add searchable class
      codeBlock.classList.add("searchable");

      // Add tabindex to make it focusable
      codeBlock.setAttribute("tabindex", "0");

      // Add click handler to focus
      codeBlock.addEventListener("click", () => {
        codeBlock.focus();
      });

      // Add visual indicator for search capability
      if (!codeBlock.querySelector(".search-hint")) {
        const searchHint = document.createElement("div");
        searchHint.className = "search-hint";
        searchHint.innerHTML =
          "<small>💡 Press Ctrl/Cmd+F to search in this code block</small>";
        searchHint.style.cssText = `
          position: absolute;
          top: 8px;
          right: 8px;
          background: var(--bg-accent);
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          color: var(--text-secondary);
          opacity: 0;
          transition: opacity 0.2s;
          pointer-events: none;
          z-index: 10;
        `;

        codeBlock.style.position = "relative";
        codeBlock.appendChild(searchHint);

        // Show hint on focus/hover
        const showHint = () => (searchHint.style.opacity = "1");
        const hideHint = () => (searchHint.style.opacity = "0");

        codeBlock.addEventListener("focus", showHint);
        codeBlock.addEventListener("blur", hideHint);
        codeBlock.addEventListener("mouseenter", showHint);
        codeBlock.addEventListener("mouseleave", hideHint);
      }
    });
  }
}

// Initialize panel when shown
let panel;

function panelShown() {
  console.log("📊 [PANEL] Panel shown, initializing...");
  if (!panel) {
    // Check if we're in a proper DevTools context
    const devtools = chrome.devtools || browser.devtools;
    if (!devtools || !devtools.inspectedWindow) {
      console.error("❌ [PANEL] DevTools API not available");
      const app = document.getElementById("app");
      if (app) {
        app.innerHTML = `
          <div style="padding: 20px; text-align: center; color: #d32f2f;">
            <h2>⚠️ DevTools Context Error</h2>
            <p>This panel must be loaded within browser DevTools.</p>
            <p>Please close and reopen DevTools, then try again.</p>
          </div>
        `;
      }
      return;
    }

    panel = new GraphQLTestingPanel();
    window.panel = panel; // For data-attribute handlers
  }
}

function panelHidden() {
  console.log("Panel hidden, cleaning up...");
  if (panel) {
    // Clean up all live timers
    for (const [requestId, intervalId] of panel.liveTimers) {
      clearInterval(intervalId);
    }
    panel.liveTimers.clear();

    // Notify background that DevTools panel is closed for this tab
    panel
      .sendMessage({
        type: "DEVTOOLS_CLOSED",
        tabId: panel.tabId,
      })
      .catch((error) => {
        console.log("Failed to notify background of panel close:", error);
      });
  }
}

// Initialize panel with better error handling and multiple fallbacks
console.log("🚀 [PANEL] Starting panel initialization...");

function initializePanel() {
  console.log("🔍 [PANEL] Document ready state:", document.readyState);

  // Add a small delay to ensure DevTools context is fully ready
  setTimeout(() => {
    panelShown();
  }, 50);
}

// Try multiple initialization methods
if (document.readyState === "complete") {
  console.log("📄 [PANEL] Document already complete, initializing immediately");
  initializePanel();
} else if (document.readyState === "interactive") {
  console.log("📄 [PANEL] Document interactive, initializing");
  initializePanel();
} else {
  console.log("📄 [PANEL] Document still loading, waiting for load event");
  window.addEventListener("load", initializePanel);
  // Fallback in case load event doesn't fire
  document.addEventListener("DOMContentLoaded", initializePanel);
}

// Final fallback after a longer delay
setTimeout(() => {
  if (!panel) {
    console.log("⏰ [PANEL] Final fallback initialization...");
    panelShown();
  }
}, 500);
