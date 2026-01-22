// Panel Extensions for APIlot
// Handles AI Mock Generation, Analytics Dashboard, and Time-Travel Debugging

class PanelExtensions {
  constructor(panel) {
    this.panel = panel;
    this.aiService = new AIMockService();
    this.performanceTracker = new PerformanceTracker();
    this.sessionRecorder = new SessionRecorder();
    
    this.initializeExtensions();
  }

  async initializeExtensions() {
    // Load AI settings
    await this.loadAISettings();
    
    // Initialize UI handlers
    this.setupAISettingsHandlers();
    this.setupAnalyticsHandlers();
    this.setupTimeTravelHandlers();
    this.setupRuleTypeHandlers();
    this.setupMonitorAIMockHandler();
    
    console.log('✅ [PANEL-EXT] Extensions initialized');
  }

  // ============================================
  // Monitor AI Mock Generation Handler (Revamped)
  // ============================================

  setupMonitorAIMockHandler() {
    // Store current request context for AI generation
    this.currentAIMockRequest = null;
    this.selectedAIRequests = [];
    
    // Listen for AI mock generation requests from the monitor
    document.addEventListener('generateAIMock', async (e) => {
      const { request, index } = e.detail;
      await this.showAIMockModal(request);
    });
    
    // Setup modal event handlers
    this.setupAIMockModalHandlers();
  }

  setupAIMockModalHandlers() {
    const modal = document.getElementById('aiGenerationModal');
    if (!modal) return;
    
    // Mode toggle (single vs multi) - with Firefox :has() fallback
    const modeRadios = document.querySelectorAll('input[name="aiMode"]');
    const updateModeSwitch = () => {
      modeRadios.forEach(radio => {
        const option = radio.closest('.mode-option');
        if (option) {
          option.classList.toggle('active', radio.checked);
        }
      });
    };
    
    modeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const isMulti = e.target.value === 'multi';
        document.getElementById('aiSingleRequestInfo').style.display = isMulti ? 'none' : 'block';
        document.getElementById('aiMultiRequestSelect').style.display = isMulti ? 'block' : 'none';
        
        // Update active class for Firefox compatibility
        updateModeSwitch();
        
        if (isMulti) {
          this.populateMultiRequestList();
        }
      });
    });
    
    // Initialize mode switch active state
    updateModeSwitch();
    
    // Response mode dropdown - update hint text based on selection
    const responseModeSelect = document.getElementById('aiResponseMode');
    if (responseModeSelect) {
      const updateResponseHint = () => {
        const mode = responseModeSelect.value;
        const hintContainer = document.querySelector('.ai-response-hint');
        if (hintContainer) {
          // Hide all hints
          hintContainer.querySelectorAll('span').forEach(span => span.style.display = 'none');
          // Show the relevant hint
          const activeHint = hintContainer.querySelector(`.hint-${mode}`);
          if (activeHint) activeHint.style.display = 'inline';
        }
      };
      responseModeSelect.addEventListener('change', updateResponseHint);
      // Initialize
      updateResponseHint();
    }
    
    // Select all button
    const selectAllBtn = document.getElementById('aiSelectAllBtn');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        const visibleItems = document.querySelectorAll('#aiRequestList .request-item:not([style*="display: none"])');
        const checkboxes = [...visibleItems].map(item => item.querySelector('input[type="checkbox"]'));
        const allChecked = checkboxes.every(cb => cb && cb.checked);
        checkboxes.forEach(cb => {
          if (cb) {
            cb.checked = !allChecked;
            cb.closest('.request-item')?.classList.toggle('selected', !allChecked);
          }
        });
        this.updateSelectedCount();
      });
    }
    
    // Search input for multi-select
    const searchInput = document.getElementById('aiRequestSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterRequestList(e.target.value, this.currentRequestFilter || 'all');
      });
    }
    
    // Filter chips for multi-select
    document.querySelectorAll('.multi-select-filters .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        // Update active state
        document.querySelectorAll('.multi-select-filters .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        
        const filter = chip.dataset.filter;
        this.currentRequestFilter = filter;
        const searchTerm = document.getElementById('aiRequestSearch')?.value || '';
        this.filterRequestList(searchTerm, filter);
      });
    });
    
    // Suggestion chips / Quick tags (support both old and new class names)
    document.querySelectorAll('.suggestion-chip, .quick-tag').forEach(chip => {
      chip.addEventListener('click', () => {
        const suggestion = chip.dataset.suggestion;
        const textarea = document.getElementById('aiUserInstructions');
        if (textarea) {
          textarea.value = textarea.value 
            ? textarea.value + '\n' + suggestion 
            : suggestion;
        }
      });
    });
    
    // Generate button
    const generateBtn = document.getElementById('aiGenerateBtn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.executeAIGeneration());
    }
    
    // Regenerate button
    const regenerateBtn = document.getElementById('aiRegenerateBtn');
    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => this.executeAIGeneration());
    }
    
    // Copy button
    const copyBtn = document.getElementById('aiCopyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyGeneratedMock());
    }
    
    // Retry button (in error state)
    const retryBtn = document.getElementById('aiRetryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.executeAIGeneration());
    }
    
    // Apply mock button (single)
    const applyBtn = document.getElementById('aiApplyMockBtn');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => this.applyGeneratedMock());
    }
    
    // Apply all mocks button (multi)
    const applyAllBtn = document.getElementById('aiApplyAllMocksBtn');
    if (applyAllBtn) {
      applyAllBtn.addEventListener('click', () => this.applyAllGeneratedMocks());
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('aiCancelBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeAIMockModal());
    }
    
    // Close button
    const closeBtn = modal.querySelector('.modal-close, .ai-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeAIMockModal());
    }
  }
  
  copyGeneratedMock() {
    const isMulti = document.querySelector('input[name="aiMode"]:checked')?.value === 'multi';
    let textToCopy = '';
    
    if (isMulti && this.generatedMocks?.mocks) {
      // Copy all mocks as JSON array
      textToCopy = JSON.stringify(this.generatedMocks.mocks, null, 2);
    } else {
      // Copy single mock
      const mockEditor = document.getElementById('aiGeneratedMock');
      textToCopy = mockEditor?.value || '';
    }
    
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        const copyBtn = document.getElementById('aiCopyBtn');
        if (copyBtn) {
          const originalText = copyBtn.innerHTML;
          copyBtn.innerHTML = '<span class="btn-icon">✓</span> Copied!';
          setTimeout(() => {
            copyBtn.innerHTML = originalText;
          }, 2000);
        }
      }).catch(err => {
        console.error('[PANEL-EXT] Failed to copy:', err);
      });
    }
  }

  async showAIMockModal(request, context = 'monitor') {
    this.currentAIMockRequest = request;
    this.selectedAIRequests = [request];
    this.generatedMocks = null;
    this.aiMockContext = context; // 'monitor' or 'rule-editor'
    
    const modal = document.getElementById('aiGenerationModal');
    
    // Reset modal state - New UI structure
    document.getElementById('aiSingleRequestInfo').style.display = 'block';
    document.getElementById('aiMultiRequestSelect').style.display = 'none';
    document.getElementById('aiGenerationLoading').style.display = 'none';
    document.getElementById('aiGenerationResult').style.display = 'none';
    document.getElementById('aiGenerationError').style.display = 'none';
    document.getElementById('aiEmptyState').style.display = 'flex';
    document.getElementById('aiSingleResult').style.display = 'block';
    document.getElementById('aiMultiResults').style.display = 'none';
    document.getElementById('aiResultTabs').style.display = 'none';
    
    const mockEditor = document.getElementById('aiGeneratedMock');
    if (mockEditor) mockEditor.value = '';
    
    const instructionsInput = document.getElementById('aiUserInstructions');
    if (instructionsInput) instructionsInput.value = '';
    
    // Reset buttons
    const generateBtn = document.getElementById('aiGenerateBtn');
    const regenerateBtn = document.getElementById('aiRegenerateBtn');
    const applyBtn = document.getElementById('aiApplyMockBtn');
    const applyAllBtn = document.getElementById('aiApplyAllMocksBtn');
    const copyBtn = document.getElementById('aiCopyBtn');
    
    if (generateBtn) generateBtn.disabled = false;
    if (regenerateBtn) regenerateBtn.style.display = 'none';
    if (applyBtn) applyBtn.style.display = 'none';
    if (applyAllBtn) applyAllBtn.style.display = 'none';
    if (copyBtn) copyBtn.style.display = 'none';
    
    // Reset mode to single and update active classes
    const singleRadio = document.querySelector('input[name="aiMode"][value="single"]');
    if (singleRadio) {
      singleRadio.checked = true;
      // Update active classes for Firefox compatibility
      document.querySelectorAll('.ai-mode-switch .mode-option').forEach(opt => {
        const radio = opt.querySelector('input[type="radio"]');
        opt.classList.toggle('active', radio && radio.checked);
      });
    }
    
    // Reset response mode dropdown to default (sanitized)
    const responseModeSelect = document.getElementById('aiResponseMode');
    if (responseModeSelect) {
      responseModeSelect.value = 'sanitized';
      // Update hint text
      const hintContainer = document.querySelector('.ai-response-hint');
      if (hintContainer) {
        hintContainer.querySelectorAll('span').forEach(span => span.style.display = 'none');
        const activeHint = hintContainer.querySelector('.hint-sanitized');
        if (activeHint) activeHint.style.display = 'inline';
      }
    }
    
    // Update provider info in header
    const providerInfoHeader = document.getElementById('aiProviderInfo');
    if (providerInfoHeader) {
      const provider = this.aiService.currentProvider || 'local';
      const model = this.aiService.providers[provider]?.model || '';
      providerInfoHeader.textContent = provider !== 'local' ? `Powered by ${provider} ${model}` : 'Local Generation';
    }
    
    // Update request info - New UI structure
    const typeBadge = document.getElementById('aiRequestTypeBadge');
    const methodBadge = document.getElementById('aiRequestMethodBadge');
    const requestName = document.getElementById('aiRequestName');
    const requestUrl = document.getElementById('aiRequestUrl');
    
    const isREST = request.requestType === 'rest' || !request.query;
    
    if (typeBadge) {
      typeBadge.textContent = isREST ? 'REST' : 'GraphQL';
      typeBadge.className = `request-type-badge ${isREST ? 'rest' : 'graphql'}`;
    }
    
    if (methodBadge) {
      if (isREST && request.method) {
        methodBadge.textContent = request.method;
        methodBadge.className = `request-method-badge method-${request.method.toLowerCase()}`;
        methodBadge.style.display = 'inline-block';
      } else {
        methodBadge.style.display = 'none';
      }
    }
    
    if (requestName) {
      requestName.textContent = request.operationName || request.endpoint || this.getEndpointFromUrl(request.url) || 'Request';
    }
    
    if (requestUrl) {
      requestUrl.textContent = this.truncateText(request.url || '', 80);
    }
    
    // Update apply button text based on context
    if (applyBtn) {
      const btnText = applyBtn.querySelector('.btn-text') || applyBtn;
      if (context === 'rule-editor') {
        applyBtn.innerHTML = '<span class="btn-icon">✓</span> Use Mock Data';
      } else {
        applyBtn.innerHTML = '<span class="btn-icon">✓</span> Create Rule';
      }
    }
    
    // Hide multi-mode option in rule-editor context
    const modeSwitch = document.querySelector('.ai-mode-switch');
    if (modeSwitch) {
      modeSwitch.style.display = context === 'rule-editor' ? 'none' : 'flex';
    }
    
    // Show modal
    modal.classList.add('active');
  }

  populateMultiRequestList() {
    const listContainer = document.getElementById('aiRequestList');
    if (!listContainer || !this.panel || !this.panel.requestLog) return;
    
    // Reset search and filter
    const searchInput = document.getElementById('aiRequestSearch');
    if (searchInput) searchInput.value = '';
    this.currentRequestFilter = 'all';
    document.querySelectorAll('.multi-select-filters .filter-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.filter === 'all');
    });
    
    const requests = this.panel.requestLog;
    
    listContainer.innerHTML = requests.map((req, index) => {
      const isSelected = this.selectedAIRequests.some(r => r.id === req.id);
      const name = req.operationName || req.endpoint || this.getEndpointFromUrl(req.url) || `Request ${index + 1}`;
      const requestType = req.requestType || (req.query ? 'graphql' : 'rest');
      const type = requestType.toUpperCase();
      const method = req.method || '';
      
      return `
        <div class="request-item ${isSelected ? 'selected' : ''}" data-request-index="${index}" data-request-type="${requestType}" data-request-name="${name.toLowerCase()}" data-request-url="${(req.url || '').toLowerCase()}">
          <input type="checkbox" ${isSelected ? 'checked' : ''}>
          <span class="request-type-badge ${requestType}">${type}</span>
          <div class="request-info">
            <div class="request-name">${method ? method + ' ' : ''}${name}</div>
            <div class="request-meta">${this.truncateText(req.url, 60)}</div>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers
    listContainer.querySelectorAll('.request-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
          const checkbox = item.querySelector('input[type="checkbox"]');
          checkbox.checked = !checkbox.checked;
        }
        item.classList.toggle('selected', item.querySelector('input[type="checkbox"]').checked);
        this.updateSelectedCount();
      });
    });
    
    this.updateSelectedCount();
  }

  updateSelectedCount() {
    const checkboxes = document.querySelectorAll('#aiRequestList input[type="checkbox"]:checked');
    const countEl = document.getElementById('aiSelectedCount');
    if (countEl) {
      const count = checkboxes.length;
      countEl.textContent = `${count} request${count !== 1 ? 's' : ''} selected`;
    }
    
    // Update selected requests
    this.selectedAIRequests = [];
    checkboxes.forEach(cb => {
      const item = cb.closest('.request-item');
      const index = parseInt(item.dataset.requestIndex);
      if (this.panel && this.panel.requestLog[index]) {
        this.selectedAIRequests.push(this.panel.requestLog[index]);
      }
    });
  }

  filterRequestList(searchTerm, typeFilter) {
    const items = document.querySelectorAll('#aiRequestList .request-item');
    const searchLower = searchTerm.toLowerCase().trim();
    
    items.forEach(item => {
      const name = item.dataset.requestName || '';
      const url = item.dataset.requestUrl || '';
      const type = item.dataset.requestType || '';
      
      // Check type filter
      const matchesType = typeFilter === 'all' || type === typeFilter;
      
      // Check search term
      const matchesSearch = !searchLower || 
        name.includes(searchLower) || 
        url.includes(searchLower);
      
      // Show/hide item
      item.style.display = (matchesType && matchesSearch) ? '' : 'none';
    });
    
    // Update select all button text
    const selectAllBtn = document.getElementById('aiSelectAllBtn');
    if (selectAllBtn) {
      const visibleCount = document.querySelectorAll('#aiRequestList .request-item:not([style*="display: none"])').length;
      selectAllBtn.textContent = `Select All (${visibleCount})`;
    }
  }

  async executeAIGeneration() {
    const isMulti = document.querySelector('input[name="aiMode"]:checked')?.value === 'multi';
    const userContext = document.getElementById('aiUserInstructions')?.value || '';
    const responseMode = document.getElementById('aiResponseMode')?.value || 'sanitized';
    
    // Get selected requests
    if (isMulti) {
      this.updateSelectedCount();
      if (this.selectedAIRequests.length === 0) {
        alert('Please select at least one request');
        return;
      }
    } else {
      this.selectedAIRequests = [this.currentAIMockRequest];
    }
    
    // Show loading state - New UI
    const loading = document.getElementById('aiGenerationLoading');
    const result = document.getElementById('aiGenerationResult');
    const error = document.getElementById('aiGenerationError');
    const emptyState = document.getElementById('aiEmptyState');
    const generateBtn = document.getElementById('aiGenerateBtn');
    
    if (loading) loading.style.display = 'flex';
    if (result) result.style.display = 'none';
    if (error) error.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (generateBtn) generateBtn.disabled = true;
    
    // Show provider info in loading
    const providerInfo = document.getElementById('aiGenerationProvider');
    if (providerInfo) {
      const provider = this.aiService.currentProvider || 'local';
      const model = this.aiService.providers[provider]?.model || 'local';
      providerInfo.textContent = `Using ${provider} ${model}`;
    }
    
    try {
      let response;
      const options = { userContext, responseMode };
      
      console.log('[PANEL-EXT] AI Generation options:', options);
      
      if (isMulti && this.selectedAIRequests.length > 1) {
        // Multi-request generation
        response = await this.aiService.generateMultipleMocks(this.selectedAIRequests, options);
      } else {
        // Single request generation
        response = await this.aiService.generateMock(this.selectedAIRequests[0], options);
      }
      
      if (loading) loading.style.display = 'none';
      
      if (response.success) {
        this.generatedMocks = response;
        if (result) result.style.display = 'flex';
        
        // Show action buttons
        const regenerateBtn = document.getElementById('aiRegenerateBtn');
        const copyBtn = document.getElementById('aiCopyBtn');
        const applyBtn = document.getElementById('aiApplyMockBtn');
        const applyAllBtn = document.getElementById('aiApplyAllMocksBtn');
        
        if (regenerateBtn) regenerateBtn.style.display = 'inline-flex';
        if (copyBtn) copyBtn.style.display = 'inline-flex';
        
        if (isMulti && response.mocks && response.mocks.length > 1) {
          // Show multi-results UI
          this.showMultiResults(response);
          if (applyAllBtn) applyAllBtn.style.display = 'inline-flex';
          if (applyBtn) applyBtn.style.display = 'none';
        } else {
          // Show single result
          document.getElementById('aiSingleResult').style.display = 'block';
          document.getElementById('aiMultiResults').style.display = 'none';
          document.getElementById('aiResultTabs').style.display = 'none';
          document.getElementById('aiGeneratedMock').value = JSON.stringify(response.data, null, 2);
          if (applyBtn) applyBtn.style.display = 'inline-flex';
          if (applyAllBtn) applyAllBtn.style.display = 'none';
        }
        
        // Update generation stats - New UI structure
        const timeInfo = document.getElementById('aiGenerationTime');
        const tokensInfo = document.getElementById('aiGenerationTokens');
        const modelInfo = document.getElementById('aiGenerationModel');
        
        if (timeInfo) {
          const statValue = timeInfo.querySelector('.stat-value') || timeInfo;
          statValue.textContent = `${response.generationTime}ms`;
        }
        if (tokensInfo) {
          const statValue = tokensInfo.querySelector('.stat-value') || tokensInfo;
          statValue.textContent = response.tokensUsed ? `${response.tokensUsed} tokens` : '--';
        }
        if (modelInfo) {
          const statValue = modelInfo.querySelector('.stat-value') || modelInfo;
          statValue.textContent = `${response.provider}${response.fallback ? ' (fallback)' : ''}`;
        }
        
        // Update AI stats with provider info
        await this.incrementAIStats(1, response.tokensUsed || 0, isMulti ? response.requestCount || 1 : 1, response.provider || 'unknown');
      } else {
        if (error) error.style.display = 'flex';
        document.getElementById('aiErrorMessage').textContent = response.error;
      }
    } catch (err) {
      console.error('[PANEL-EXT] AI Generation error:', err);
      if (loading) loading.style.display = 'none';
      if (error) error.style.display = 'flex';
      document.getElementById('aiErrorMessage').textContent = err.message;
    } finally {
      if (generateBtn) generateBtn.disabled = false;
    }
  }

  showMultiResults(response) {
    document.getElementById('aiSingleResult').style.display = 'none';
    document.getElementById('aiMultiResults').style.display = 'block';
    
    const tabsContainer = document.getElementById('aiResultTabs');
    const contentsContainer = document.getElementById('aiResultContents');
    
    if (!tabsContainer || !contentsContainer) return;
    
    // Show tabs
    tabsContainer.style.display = 'flex';
    
    // Build tabs and content panels
    const tabs = [];
    const panels = [];
    
    response.mocks.forEach((mock, index) => {
      const request = this.selectedAIRequests[index];
      const name = request?.operationName || request?.endpoint || this.getEndpointFromUrl(request?.url) || `Mock ${index + 1}`;
      const shortName = name.length > 18 ? name.substring(0, 18) + '...' : name;
      
      tabs.push(`<button class="tab-btn ${index === 0 ? 'active' : ''}" data-tab-index="${index}">${shortName}</button>`);
      panels.push(`
        <div class="result-panel ${index === 0 ? 'active' : ''}" data-panel-index="${index}">
          <textarea class="ai-mock-editor" data-mock-index="${index}">${JSON.stringify(mock, null, 2)}</textarea>
        </div>
      `);
    });
    
    tabsContainer.innerHTML = tabs.join('');
    contentsContainer.innerHTML = panels.join('');
    
    // Add tab click handlers
    tabsContainer.querySelectorAll('.tab-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        const index = tab.dataset.tabIndex;
        
        // Update active tab
        tabsContainer.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active panel
        contentsContainer.querySelectorAll('.result-panel').forEach(p => {
          p.classList.remove('active');
          p.style.display = 'none';
        });
        const activePanel = contentsContainer.querySelector(`[data-panel-index="${index}"]`);
        if (activePanel) {
          activePanel.classList.add('active');
          activePanel.style.display = 'block';
        }
      });
    });
    
    // Show first panel
    contentsContainer.querySelectorAll('.result-panel').forEach((p, i) => {
      p.style.display = i === 0 ? 'block' : 'none';
    });
  }

  async applyGeneratedMock() {
    const mockData = document.getElementById('aiGeneratedMock')?.value;
    if (!mockData) {
      this.closeAIMockModal();
      return;
    }
    
    // Check if we're in "rule editor" mode (adding mock to existing rule editor)
    // vs "monitor" mode (creating a new rule from scratch)
    if (this.aiMockContext === 'rule-editor') {
      // Just fill the mock response textarea in the rule editor
      const mockResponseTextarea = document.getElementById('mockResponse');
      if (mockResponseTextarea) {
        mockResponseTextarea.value = mockData;
      }
      this.closeAIMockModal();
      return;
    }
    
    // Monitor mode - create a new rule
    if (!this.currentAIMockRequest) {
      this.closeAIMockModal();
      return;
    }
    
    try {
      // Create a rule with the generated mock data
      await this.createRuleFromRequest(this.currentAIMockRequest, mockData);
      this.closeAIMockModal();
      
      // Switch to Rules tab to show the created rule
      const rulesTab = document.querySelector('[data-tab="rules"]');
      if (rulesTab) rulesTab.click();
    } catch (error) {
      console.error('[PANEL-EXT] Failed to create rule:', error);
      // Don't show alert if rule was already created (we saw it in logs)
      if (!error.message.includes('already')) {
        alert('Failed to create rule: ' + error.message);
      }
    }
  }

  async applyAllGeneratedMocks() {
    if (!this.generatedMocks || !this.generatedMocks.mocks) return;
    
    try {
      let createdCount = 0;
      
      // Create a rule for each mock
      for (let i = 0; i < this.generatedMocks.mocks.length; i++) {
        const mock = this.generatedMocks.mocks[i];
        const request = this.selectedAIRequests[i] || this.selectedAIRequests[0];
        
        if (mock && request) {
          const mockStr = typeof mock === 'string' ? mock : JSON.stringify(mock, null, 2);
          await this.createRuleFromRequest(request, mockStr);
          createdCount++;
        }
      }
      
      this.closeAIMockModal();
      
      if (createdCount > 0) {
        // Switch to Rules tab to show the created rules
        const rulesTab = document.querySelector('[data-tab="rules"]');
        if (rulesTab) rulesTab.click();
      }
    } catch (error) {
      console.error('[PANEL-EXT] Failed to create rules:', error);
      // Don't show alert if rules were already created
      if (!error.message.includes('already')) {
        alert('Failed to create rules: ' + error.message);
      }
    }
  }

  async createRuleFromRequest(request, mockData) {
    const isGraphQL = request.requestType === 'graphql' || request.query;
    
    // Parse mockData if it's a string
    let parsedMockData;
    try {
      parsedMockData = typeof mockData === 'string' ? JSON.parse(mockData) : mockData;
    } catch (e) {
      // If parsing fails, use as-is (might be invalid JSON but let the user fix it)
      parsedMockData = mockData;
    }
    
    // Build the rule object (don't set id - background will generate it)
    const rule = {
      name: this.generateRuleName(request),
      enabled: true,
      requestType: isGraphQL ? 'graphql' : 'rest',
      action: 'mock', // Use 'mock' action to replace response with mockResponse
      mockResponse: parsedMockData,
      delayMs: 0,
      createdBy: 'ai-mock'
    };
    
    // Add GraphQL-specific fields
    if (isGraphQL) {
      rule.operationName = request.operationName || '';
      rule.operationType = request.operationType || 'query';
    } else {
      // Add REST-specific fields
      rule.urlPattern = this.extractUrlPattern(request.url || request.endpoint || '');
      rule.httpMethod = request.method || 'GET';
    }
    
    console.log('[PANEL-EXT] Creating rule:', rule);
    
    // Send message to background to save the rule
    const runtime = chrome.runtime || browser.runtime;
    
    return new Promise((resolve, reject) => {
      runtime.sendMessage({ type: 'ADD_RULE', rule: rule }, (response) => {
        // Handle Firefox's different error handling
        const error = chrome.runtime?.lastError || browser?.runtime?.lastError;
        if (error) {
          console.error('[PANEL-EXT] Runtime error:', error);
          reject(new Error(error.message || 'Runtime error'));
          return;
        }
        
        console.log('[PANEL-EXT] ADD_RULE response:', response);
        
        if (response && response.success) {
          // Dispatch event to refresh the rules list
          document.dispatchEvent(new CustomEvent('rulesUpdated'));
          resolve({ ...rule, id: response.ruleId });
        } else if (response) {
          reject(new Error(response.error || 'Failed to save rule'));
        } else {
          // No response might mean the rule was added via notification
          // Check if we got a RULE_ADDED notification recently
          console.log('[PANEL-EXT] No response received, rule may have been added via notification');
          document.dispatchEvent(new CustomEvent('rulesUpdated'));
          resolve(rule);
        }
      });
    });
  }

  generateRuleName(request) {
    const isGraphQL = request.requestType === 'graphql' || request.query;
    
    if (isGraphQL) {
      return `AI Mock: ${request.operationName || 'GraphQL Query'}`;
    } else {
      const method = request.method || 'GET';
      const url = request.url || request.endpoint || '';
      const pathParts = url.split('/').filter(p => p && !p.includes('?'));
      const lastPart = pathParts[pathParts.length - 1] || 'endpoint';
      return `AI Mock: ${method} ${lastPart}`;
    }
  }

  extractUrlPattern(url) {
    if (!url) return '*';
    try {
      const urlObj = new URL(url);
      // Convert specific IDs to wildcards
      const pathPattern = urlObj.pathname
        .replace(/\/\d+/g, '/*')  // Replace numeric IDs
        .replace(/\/[a-f0-9-]{36}/gi, '/*');  // Replace UUIDs
      return `*${pathPattern}*`;
    } catch {
      // If URL parsing fails, return a simple pattern
      return `*${url.split('?')[0]}*`;
    }
  }

  closeAIMockModal() {
    const modal = document.getElementById('aiGenerationModal');
    if (modal) {
      modal.classList.remove('active');
    }
    this.currentAIMockRequest = null;
    this.selectedAIRequests = [];
    this.generatedMocks = null;
  }

  detectOperationType(query) {
    if (!query) return 'query';
    const lowerQuery = query.toLowerCase().trim();
    if (lowerQuery.startsWith('mutation')) return 'mutation';
    if (lowerQuery.startsWith('subscription')) return 'subscription';
    return 'query';
  }
  
  truncateText(text, maxLength = 50) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  // ============================================
  // AI Settings & Mock Generation
  // ============================================

  async loadAISettings() {
    try {
      const runtime = chrome.runtime || browser.runtime;
      console.log('[PANEL-EXT] Loading AI settings...');
      const response = await runtime.sendMessage({ type: 'GET_AI_SETTINGS' });
      console.log('[PANEL-EXT] AI settings response:', response);
      
      if (response && response.success && response.aiSettings) {
        await this.aiService.initialize(response.aiSettings);
        this.updateAISettingsUI(response.aiSettings);
        console.log('[PANEL-EXT] ✅ AI settings loaded successfully');
      } else {
        console.warn('[PANEL-EXT] AI settings response invalid or missing:', response);
        // Use default settings if response is invalid
        const defaultSettings = { provider: 'openai' };
        await this.aiService.initialize(defaultSettings);
        this.updateAISettingsUI(defaultSettings);
      }
    } catch (error) {
      console.error('[PANEL-EXT] Failed to load AI settings:', error);
      // Use default settings on error
      const defaultSettings = { provider: 'openai' };
      await this.aiService.initialize(defaultSettings);
      this.updateAISettingsUI(defaultSettings);
    }
  }

  updateAISettingsUI(settings) {
    // Update provider selection
    const providerRadios = document.querySelectorAll('input[name="aiProvider"]');
    providerRadios.forEach(radio => {
      radio.checked = radio.value === settings.provider;
    });

    // Update OpenAI settings
    const openaiKeyInput = document.getElementById('openaiApiKey');
    const openaiModelSelect = document.getElementById('openaiModel');
    const openaiBaseUrl = document.getElementById('openaiBaseUrl');
    const openaiTemperature = document.getElementById('openaiTemperature');
    const openaiMaxTokens = document.getElementById('openaiMaxTokens');
    const openaiReasoningEffort = document.getElementById('openaiReasoningEffort');
    if (openaiKeyInput) openaiKeyInput.value = settings.openaiApiKey || '';
    if (openaiModelSelect) openaiModelSelect.value = settings.openaiModel || 'gpt-4o';
    if (openaiBaseUrl) openaiBaseUrl.value = settings.openaiBaseUrl || '';
    if (openaiTemperature) openaiTemperature.value = settings.openaiTemperature ?? 0.7;
    if (openaiMaxTokens) openaiMaxTokens.value = settings.openaiMaxTokens ?? 4000;
    if (openaiReasoningEffort) openaiReasoningEffort.value = settings.openaiReasoningEffort || 'medium';

    // Update Azure OpenAI settings
    const azureKeyInput = document.getElementById('azureApiKey');
    const azureEndpoint = document.getElementById('azureEndpoint');
    const azureDeployment = document.getElementById('azureDeploymentName');
    const azureVersion = document.getElementById('azureApiVersion');
    const azureMaxOutputTokens = document.getElementById('azureMaxOutputTokens');
    if (azureKeyInput) azureKeyInput.value = settings.azureApiKey || '';
    if (azureEndpoint) azureEndpoint.value = settings.azureEndpoint || '';
    if (azureDeployment) azureDeployment.value = settings.azureDeploymentName || '';
    if (azureVersion) azureVersion.value = settings.azureApiVersion || '2025-04-01-preview';
    if (azureMaxOutputTokens) azureMaxOutputTokens.value = settings.azureMaxOutputTokens ?? 16384;

    // Update Anthropic settings
    const anthropicKeyInput = document.getElementById('anthropicApiKey');
    const anthropicModelSelect = document.getElementById('anthropicModel');
    const anthropicMaxTokens = document.getElementById('anthropicMaxTokens');
    const anthropicThinkingBudget = document.getElementById('anthropicThinkingBudget');
    if (anthropicKeyInput) anthropicKeyInput.value = settings.anthropicApiKey || '';
    if (anthropicModelSelect) anthropicModelSelect.value = settings.anthropicModel || 'claude-sonnet-4-5';
    if (anthropicMaxTokens) anthropicMaxTokens.value = settings.anthropicMaxTokens ?? 4000;
    if (anthropicThinkingBudget) anthropicThinkingBudget.value = settings.anthropicThinkingBudget ?? 2000;

    // Update Gemini settings
    const geminiKeyInput = document.getElementById('geminiApiKey');
    const geminiModelSelect = document.getElementById('geminiModel');
    const geminiTemperature = document.getElementById('geminiTemperature');
    const geminiMaxOutputTokens = document.getElementById('geminiMaxOutputTokens');
    const geminiThinkingBudget = document.getElementById('geminiThinkingBudget');
    if (geminiKeyInput) geminiKeyInput.value = settings.geminiApiKey || '';
    if (geminiModelSelect) geminiModelSelect.value = settings.geminiModel || 'gemini-2.5-flash';
    if (geminiTemperature) geminiTemperature.value = settings.geminiTemperature ?? 0.7;
    if (geminiMaxOutputTokens) geminiMaxOutputTokens.value = settings.geminiMaxOutputTokens ?? 4000;
    if (geminiThinkingBudget) geminiThinkingBudget.value = settings.geminiThinkingBudget ?? 2000;

    // Update OpenRouter settings
    const openrouterKeyInput = document.getElementById('openrouterApiKey');
    const openrouterModelSelect = document.getElementById('openrouterModel');
    if (openrouterKeyInput) openrouterKeyInput.value = settings.openrouterApiKey || '';
    if (openrouterModelSelect) openrouterModelSelect.value = settings.openrouterModel || 'anthropic/claude-sonnet-4-5';

    // Update usage stats
    this.updateAIUsageStats(settings);

    // Show/hide provider settings
    this.toggleProviderSettings(settings.provider);
  }

  toggleProviderSettings(provider) {
    console.log('[PANEL-EXT] 🔧 Toggling provider settings for:', provider);
    
    const allProviderSettings = [
      'openaiSettings',
      'azureOpenaiSettings',
      'anthropicSettings',
      'geminiSettings',
      'openrouterSettings'
    ];
    
    // Hide all provider settings first
    console.log('[PANEL-EXT] 🔧 Hiding all provider settings...');
    allProviderSettings.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        console.log(`[PANEL-EXT] 🔧 Hidden: ${id} (current display: ${el.style.display})`);
      } else {
        console.warn(`[PANEL-EXT] ⚠️ Element not found: ${id}`);
      }
    });
    
    // Show the selected provider's settings
    const providerSettingsMap = {
      'openai': 'openaiSettings',
      'azure-openai': 'azureOpenaiSettings',
      'anthropic': 'anthropicSettings',
      'gemini': 'geminiSettings',
      'openrouter': 'openrouterSettings',
      'local': null // No settings for local provider
    };
    
    const settingsId = providerSettingsMap[provider];
    console.log(`[PANEL-EXT] 🔧 Provider "${provider}" maps to settings ID: "${settingsId}"`);
    
    if (settingsId) {
      const el = document.getElementById(settingsId);
      if (el) {
        el.style.display = 'block';
        console.log(`[PANEL-EXT] 🔧 Showing: ${settingsId} (now display: ${el.style.display})`);
      } else {
        console.warn(`[PANEL-EXT] ⚠️ Settings element not found: ${settingsId}`);
      }
    } else {
      console.log(`[PANEL-EXT] 🔧 No settings panel for provider: ${provider}`);
    }
    
    // Debug: Log current visibility of all settings
    console.log('[PANEL-EXT] 🔧 Current visibility state:');
    allProviderSettings.forEach(id => {
      const el = document.getElementById(id);
      console.log(`  - ${id}: ${el ? el.style.display : 'NOT FOUND'}`);
    });
  }

  updateAIUsageStats(settings) {
    // Update global stats
    const callsCount = document.getElementById('aiCallsCount');
    const tokensUsed = document.getElementById('aiTokensUsed');
    const mocksGenerated = document.getElementById('aiMocksGenerated');
    
    if (callsCount) callsCount.textContent = this.formatNumber(settings.callsCount || 0);
    if (tokensUsed) tokensUsed.textContent = this.formatNumber(settings.tokensUsed || 0);
    if (mocksGenerated) mocksGenerated.textContent = this.formatNumber(settings.mocksGenerated || 0);
    
    // Update per-provider stats
    const providerStats = settings.providerStats || {};
    const providers = ['openai', 'azure-openai', 'anthropic', 'gemini', 'openrouter', 'local'];
    
    providers.forEach(provider => {
      const stats = providerStats[provider] || { calls: 0, tokens: 0 };
      const callsEl = document.getElementById(`${provider}Calls`);
      const tokensEl = document.getElementById(`${provider}Tokens`);
      
      if (callsEl) callsEl.textContent = this.formatNumber(stats.calls || 0);
      if (tokensEl) {
        if (provider === 'local') {
          tokensEl.textContent = '--';
        } else {
          tokensEl.textContent = this.formatNumber(stats.tokens || 0);
        }
      }
      
      // Highlight active providers
      const card = document.querySelector(`.provider-usage-card[data-provider="${provider}"]`);
      if (card) {
        card.classList.toggle('has-usage', (stats.calls || 0) > 0);
      }
    });
  }
  
  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  setupAISettingsHandlers() {
    console.log('[PANEL-EXT] Setting up AI Settings handlers...');
    
    // Provider selection change
    const providerRadios = document.querySelectorAll('input[name="aiProvider"]');
    console.log('[PANEL-EXT] Found provider radios:', providerRadios.length);
    
    providerRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        console.log('[PANEL-EXT] AI Provider changed to:', e.target.value);
        this.toggleProviderSettings(e.target.value);
      });
    });
    
    // Apply initial state based on currently selected provider
    const selectedProvider = document.querySelector('input[name="aiProvider"]:checked');
    if (selectedProvider) {
      console.log('[PANEL-EXT] Initial provider:', selectedProvider.value);
      this.toggleProviderSettings(selectedProvider.value);
    } else {
      console.log('[PANEL-EXT] No provider initially selected, defaulting to openai');
      this.toggleProviderSettings('openai');
    }

    // Toggle API key visibility for all providers
    const toggleButtons = [
      { btn: 'toggleOpenaiKey', input: 'openaiApiKey' },
      { btn: 'toggleAzureKey', input: 'azureApiKey' },
      { btn: 'toggleAnthropicKey', input: 'anthropicApiKey' },
      { btn: 'toggleGeminiKey', input: 'geminiApiKey' },
      { btn: 'toggleOpenrouterKey', input: 'openrouterApiKey' }
    ];
    
    toggleButtons.forEach(({ btn, input }) => {
      const toggleBtn = document.getElementById(btn);
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          const inputEl = document.getElementById(input);
          if (inputEl) {
            inputEl.type = inputEl.type === 'password' ? 'text' : 'password';
          }
        });
      }
    });

    // Custom model selection handlers
    const modelSelects = [
      { select: 'openaiModel', customGroup: 'openaiCustomModelGroup' },
      { select: 'anthropicModel', customGroup: 'anthropicCustomModelGroup' },
      { select: 'geminiModel', customGroup: 'geminiCustomModelGroup' },
      { select: 'openrouterModel', customGroup: 'openrouterCustomModelGroup' }
    ];
    
    modelSelects.forEach(({ select, customGroup }) => {
      const selectEl = document.getElementById(select);
      const customGroupEl = document.getElementById(customGroup);
      if (selectEl && customGroupEl) {
        selectEl.addEventListener('change', () => {
          customGroupEl.style.display = selectEl.value === 'custom' ? 'block' : 'none';
        });
      }
    });

    // Test connection button
    const testConnectionBtn = document.getElementById('testAiConnectionBtn');
    if (testConnectionBtn) {
      testConnectionBtn.addEventListener('click', () => this.testAIConnection());
    }

    // Save AI settings button
    const saveAiSettingsBtn = document.getElementById('saveAiSettingsBtn');
    if (saveAiSettingsBtn) {
      saveAiSettingsBtn.addEventListener('click', () => this.saveAISettings());
    }

    // Reset AI settings button
    const resetAiSettingsBtn = document.getElementById('resetAiSettingsBtn');
    if (resetAiSettingsBtn) {
      resetAiSettingsBtn.addEventListener('click', () => this.resetAISettings());
    }
    
    // Reset usage stats button
    const resetUsageStatsBtn = document.getElementById('resetUsageStatsBtn');
    if (resetUsageStatsBtn) {
      resetUsageStatsBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset all usage statistics? This cannot be undone.')) {
          await this.resetAIUsageStats();
        }
      });
    }

    // AI Generate Mock button in schema explorer
    const aiGenerateMockBtn = document.getElementById('aiGenerateMockBtn');
    if (aiGenerateMockBtn) {
      aiGenerateMockBtn.addEventListener('click', () => this.generateMockFromSchema());
    }

    // AI Generate Mock button in rule editor
    const aiGenerateRuleMockBtn = document.getElementById('aiGenerateRuleMockBtn');
    if (aiGenerateRuleMockBtn) {
      aiGenerateRuleMockBtn.addEventListener('click', () => this.generateMockForRule());
    }

    // Export AI Settings button
    const exportAiSettingsBtn = document.getElementById('exportAiSettingsBtn');
    if (exportAiSettingsBtn) {
      exportAiSettingsBtn.addEventListener('click', () => this.exportAISettings());
    }

    // Import AI Settings button
    const importAiSettingsBtn = document.getElementById('importAiSettingsBtn');
    const importAiSettingsFile = document.getElementById('importAiSettingsFile');
    if (importAiSettingsBtn && importAiSettingsFile) {
      importAiSettingsBtn.addEventListener('click', () => importAiSettingsFile.click());
      importAiSettingsFile.addEventListener('change', (e) => this.importAISettings(e));
    }

    // Export All Settings button
    const exportAllSettingsBtn = document.getElementById('exportAllSettingsBtn');
    if (exportAllSettingsBtn) {
      exportAllSettingsBtn.addEventListener('click', () => this.exportAllSettings());
    }

    // Import All Settings button
    const importAllSettingsBtn = document.getElementById('importAllSettingsBtn');
    const importAllSettingsFile = document.getElementById('importAllSettingsFile');
    if (importAllSettingsBtn && importAllSettingsFile) {
      importAllSettingsBtn.addEventListener('click', () => importAllSettingsFile.click());
      importAllSettingsFile.addEventListener('change', (e) => this.importAllSettings(e));
    }
  }

  async testAIConnection() {
    const statusEl = document.getElementById('aiConnectionStatus');
    const btn = document.getElementById('testAiConnectionBtn');
    
    if (statusEl) statusEl.textContent = 'Testing...';
    if (btn) btn.disabled = true;

    try {
      // Get current settings from form
      const provider = document.querySelector('input[name="aiProvider"]:checked')?.value || 'local';
      const settings = this.getAISettingsFromForm();
      
      await this.aiService.initialize(settings);
      const result = await this.aiService.testConnection();
      
      if (result.success) {
        if (statusEl) {
          statusEl.textContent = '✅ ' + result.message;
          statusEl.className = 'connection-status success';
        }
      } else {
        if (statusEl) {
          statusEl.textContent = '❌ ' + result.error;
          statusEl.className = 'connection-status error';
        }
      }
    } catch (error) {
      if (statusEl) {
        statusEl.textContent = '❌ ' + error.message;
        statusEl.className = 'connection-status error';
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  getAISettingsFromForm() {
    const provider = document.querySelector('input[name="aiProvider"]:checked')?.value || 'local';
    
    // Get OpenAI settings
    const openaiModel = document.getElementById('openaiModel')?.value;
    const openaiCustomModel = document.getElementById('openaiCustomModel')?.value;
    
    // Get Anthropic settings
    const anthropicModel = document.getElementById('anthropicModel')?.value;
    const anthropicCustomModel = document.getElementById('anthropicCustomModel')?.value;
    
    // Get Gemini settings
    const geminiModel = document.getElementById('geminiModel')?.value;
    const geminiCustomModel = document.getElementById('geminiCustomModel')?.value;
    
    // Get OpenRouter settings
    const openrouterModel = document.getElementById('openrouterModel')?.value;
    const openrouterCustomModel = document.getElementById('openrouterCustomModel')?.value;
    
    return {
      provider,
      // OpenAI
      openaiApiKey: document.getElementById('openaiApiKey')?.value || '',
      openaiModel: openaiModel === 'custom' ? openaiCustomModel : (openaiModel || 'gpt-4o'),
      openaiBaseUrl: document.getElementById('openaiBaseUrl')?.value || '',
      openaiTemperature: parseFloat(document.getElementById('openaiTemperature')?.value) || 0.7,
      openaiMaxTokens: parseInt(document.getElementById('openaiMaxTokens')?.value) || 4000,
      openaiReasoningEffort: document.getElementById('openaiReasoningEffort')?.value || 'medium',
      // Azure OpenAI
      azureApiKey: document.getElementById('azureApiKey')?.value || '',
      azureEndpoint: document.getElementById('azureEndpoint')?.value || '',
      azureDeploymentName: document.getElementById('azureDeploymentName')?.value || '',
      azureApiVersion: document.getElementById('azureApiVersion')?.value || '2025-04-01-preview',
      azureMaxOutputTokens: parseInt(document.getElementById('azureMaxOutputTokens')?.value) || 16384,
      // Anthropic
      anthropicApiKey: document.getElementById('anthropicApiKey')?.value || '',
      anthropicModel: anthropicModel === 'custom' ? anthropicCustomModel : (anthropicModel || 'claude-sonnet-4-5'),
      anthropicMaxTokens: parseInt(document.getElementById('anthropicMaxTokens')?.value) || 4000,
      anthropicThinkingBudget: parseInt(document.getElementById('anthropicThinkingBudget')?.value) || 2000,
      // Gemini
      geminiApiKey: document.getElementById('geminiApiKey')?.value || '',
      geminiModel: geminiModel === 'custom' ? geminiCustomModel : (geminiModel || 'gemini-2.5-flash'),
      geminiTemperature: parseFloat(document.getElementById('geminiTemperature')?.value) || 0.7,
      geminiMaxOutputTokens: parseInt(document.getElementById('geminiMaxOutputTokens')?.value) || 4000,
      geminiThinkingBudget: parseInt(document.getElementById('geminiThinkingBudget')?.value) || 2000,
      // OpenRouter
      openrouterApiKey: document.getElementById('openrouterApiKey')?.value || '',
      openrouterModel: openrouterModel === 'custom' ? openrouterCustomModel : (openrouterModel || 'anthropic/claude-sonnet-4-5')
    };
  }

  async saveAISettings() {
    const settings = this.getAISettingsFromForm();
    
    try {
      const runtime = chrome.runtime || browser.runtime;
      await runtime.sendMessage({
        type: 'UPDATE_AI_SETTINGS',
        aiSettings: settings
      });
      
      await this.aiService.initialize(settings);
      
      alert('AI settings saved successfully!');
    } catch (error) {
      alert('Failed to save AI settings: ' + error.message);
    }
  }

  async resetAISettings() {
    if (!confirm('Reset AI settings to defaults?')) return;
    
    const defaultSettings = {
      provider: 'local',
      openaiApiKey: '',
      openaiModel: 'gpt-4o',
      anthropicApiKey: '',
      anthropicModel: 'claude-sonnet-4-5'
    };
    
    this.updateAISettingsUI(defaultSettings);
    await this.saveAISettings();
  }

  // ============================================
  // Settings Import/Export
  // ============================================

  async exportAISettings() {
    try {
      const settings = this.getAISettingsFromForm();
      
      const exportData = {
        type: 'apilot-ai-settings',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        settings: settings
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apilot-ai-settings-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      console.log('[PANEL-EXT] AI settings exported successfully');
    } catch (error) {
      console.error('[PANEL-EXT] Failed to export AI settings:', error);
      alert('Failed to export AI settings: ' + error.message);
    }
  }

  async importAISettings(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Validate the file format
      if (data.type !== 'apilot-ai-settings') {
        throw new Error('Invalid file format. Please select an APIlot AI settings file.');
      }
      
      if (!data.settings) {
        throw new Error('No settings found in the file.');
      }
      
      // Update the UI with imported settings
      this.updateAISettingsUI(data.settings);
      
      // Save the settings
      await this.saveAISettings();
      
      alert(`✅ AI settings imported successfully!\n\nImported from: ${data.exportedAt || 'Unknown date'}`);
      console.log('[PANEL-EXT] AI settings imported successfully');
    } catch (error) {
      console.error('[PANEL-EXT] Failed to import AI settings:', error);
      alert('Failed to import AI settings: ' + error.message);
    }
    
    // Reset file input
    e.target.value = '';
  }

  async exportAllSettings() {
    try {
      const runtime = chrome.runtime || browser.runtime;
      
      // Get AI settings from form
      const aiSettings = this.getAISettingsFromForm();
      
      // Get rules from background
      const rulesResponse = await new Promise(resolve => {
        runtime.sendMessage({ type: 'EXPORT_RULES' }, resolve);
      });
      
      // Get general settings from background
      const settingsResponse = await new Promise(resolve => {
        runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve);
      });
      
      // Get AI settings from background (includes usage stats)
      const aiSettingsResponse = await new Promise(resolve => {
        runtime.sendMessage({ type: 'GET_AI_SETTINGS' }, resolve);
      });
      
      const exportData = {
        type: 'apilot-full-settings',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        aiSettings: {
          ...aiSettings,
          // Include usage stats from background
          callsCount: aiSettingsResponse?.aiSettings?.callsCount || 0,
          tokensUsed: aiSettingsResponse?.aiSettings?.tokensUsed || 0,
          mocksGenerated: aiSettingsResponse?.aiSettings?.mocksGenerated || 0,
          providerStats: aiSettingsResponse?.aiSettings?.providerStats || {}
        },
        rules: rulesResponse?.data?.rules || [],
        generalSettings: settingsResponse?.settings || {}
      };
      
      console.log('[PANEL-EXT] Exporting all settings:', exportData);
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apilot-full-settings-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      
      const ruleCount = exportData.rules.length;
      alert(`✅ Settings exported successfully!\n\nIncluded:\n• AI Settings\n• ${ruleCount} rule(s)\n• General Settings`);
      console.log('[PANEL-EXT] All settings exported successfully');
    } catch (error) {
      console.error('[PANEL-EXT] Failed to export all settings:', error);
      alert('Failed to export settings: ' + error.message);
    }
  }

  async importAllSettings(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Validate the file format
      if (data.type !== 'apilot-full-settings') {
        throw new Error('Invalid file format. Please select an APIlot full settings file.');
      }
      
      const runtime = chrome.runtime || browser.runtime;
      let importedItems = [];
      
      // Import AI settings if present
      if (data.aiSettings) {
        this.updateAISettingsUI(data.aiSettings);
        await this.saveAISettings();
        importedItems.push('AI Settings');
      }
      
      // Import rules if present
      if (data.rules && data.rules.length > 0) {
        await runtime.sendMessage({
          type: 'IMPORT_RULES',
          data: { rules: data.rules }
        });
        importedItems.push(`${data.rules.length} rule(s)`);
        
        // Refresh rules list
        document.dispatchEvent(new CustomEvent('rulesUpdated'));
      }
      
      // Import general settings if present
      if (data.generalSettings) {
        await runtime.sendMessage({
          type: 'UPDATE_SETTINGS',
          settings: data.generalSettings
        });
        importedItems.push('General Settings');
      }
      
      alert(`✅ Settings imported successfully!\n\nImported:\n• ${importedItems.join('\n• ')}\n\nFrom: ${data.exportedAt || 'Unknown date'}`);
      console.log('[PANEL-EXT] All settings imported successfully');
    } catch (error) {
      console.error('[PANEL-EXT] Failed to import all settings:', error);
      alert('Failed to import settings: ' + error.message);
    }
    
    // Reset file input
    e.target.value = '';
  }

  async generateMockFromSchema() {
    const queryPreview = document.getElementById('queryPreview');
    if (!queryPreview || !queryPreview.textContent) {
      alert('Please build a query first using the Visual Builder');
      return;
    }

    const query = queryPreview.textContent;
    const operationType = document.getElementById('operationType')?.value || 'query';
    const operationName = document.getElementById('operationName')?.value || 'GeneratedQuery';

    await this.showAIGenerationModal(query, operationName, operationType);
  }

  async generateMockForRule() {
    const requestType = document.getElementById('ruleRequestType')?.value || 'graphql';
    const operationName = document.getElementById('ruleOperationName')?.value || '';
    const urlPattern = document.getElementById('ruleUrlPattern')?.value || '';
    const httpMethod = document.getElementById('ruleHttpMethod')?.value || 'GET';

    if (requestType === 'graphql') {
      if (!operationName) {
        alert('Please enter an operation name first');
        return;
      }
      await this.showAIGenerationModalForRule(`query ${operationName} { ${operationName} { id } }`, operationName, 'query');
    } else {
      await this.showRESTMockGenerationModalForRule(urlPattern, httpMethod);
    }
  }

  async showAIGenerationModalForRule(schema, operationName, operationType) {
    // Use the new unified modal with 'rule-editor' context
    const request = {
      requestType: 'graphql',
      query: schema,
      operationName: operationName,
      operationType: operationType,
      url: ''
    };
    await this.showAIMockModal(request, 'rule-editor');
  }

  async showRESTMockGenerationModalForRule(endpoint, method) {
    // Use the new unified modal with 'rule-editor' context
    const request = {
      requestType: 'rest',
      url: endpoint,
      endpoint: endpoint,
      method: method
    };
    await this.showAIMockModal(request, 'rule-editor');
  }

  async incrementAIStats(calls, tokens, mocks, provider = 'unknown') {
    try {
      const runtime = chrome.runtime || browser.runtime;
      const response = await new Promise((resolve) => {
        runtime.sendMessage({
          type: 'INCREMENT_AI_STATS',
          stats: { calls, tokens, mocks, provider }
        }, resolve);
      });
      
      // Update UI with new stats
      if (response && response.aiSettings) {
        this.updateAIUsageStats(response.aiSettings);
      }
    } catch (error) {
      console.error('Failed to update AI stats:', error);
    }
  }
  
  async resetAIUsageStats() {
    try {
      const runtime = chrome.runtime || browser.runtime;
      const response = await new Promise((resolve) => {
        runtime.sendMessage({
          type: 'RESET_AI_USAGE_STATS'
        }, resolve);
      });
      
      if (response && response.aiSettings) {
        this.updateAIUsageStats(response.aiSettings);
      }
    } catch (error) {
      console.error('Failed to reset AI stats:', error);
    }
  }

  // ============================================
  // Rule Type Handlers (GraphQL/REST)
  // ============================================

  setupRuleTypeHandlers() {
    const requestTypeSelect = document.getElementById('ruleRequestType');
    if (requestTypeSelect) {
      requestTypeSelect.addEventListener('change', (e) => {
        this.toggleRuleTypeFields(e.target.value);
      });
    }
  }

  toggleRuleTypeFields(requestType) {
    const graphqlFields = document.getElementById('graphqlFields');
    const restFields = document.getElementById('restFields');
    const restMockHeaders = document.getElementById('restMockHeaders');

    if (graphqlFields) {
      graphqlFields.style.display = (requestType === 'graphql' || requestType === 'both') ? 'block' : 'none';
    }
    if (restFields) {
      restFields.style.display = (requestType === 'rest' || requestType === 'both') ? 'block' : 'none';
    }
    if (restMockHeaders) {
      restMockHeaders.style.display = requestType === 'rest' ? 'block' : 'none';
    }
  }

  // ============================================
  // Analytics Dashboard
  // ============================================

  setupAnalyticsHandlers() {
    console.log('[PANEL-EXT] Setting up Analytics handlers...');
    console.log('[PANEL-EXT] PerformanceTracker instance:', this.performanceTracker);
    
    const refreshBtn = document.getElementById('refreshAnalyticsBtn');
    const clearBtn = document.getElementById('clearAnalyticsBtn');
    const timeRangeSelect = document.getElementById('analyticsTimeRange');

    console.log('[PANEL-EXT] Analytics elements:', {
      refreshBtn: !!refreshBtn,
      clearBtn: !!clearBtn,
      timeRangeSelect: !!timeRangeSelect
    });

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        console.log('[PANEL-EXT] Refresh analytics clicked');
        this.refreshAnalytics();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAnalyticsData());
    }

    if (timeRangeSelect) {
      timeRangeSelect.addEventListener('change', () => this.refreshAnalytics());
    }

    // Add filter listeners
    const urlFilter = document.getElementById('analyticsUrlFilter');
    const typeFilter = document.getElementById('analyticsTypeFilter');
    const statusFilter = document.getElementById('analyticsStatusFilter');

    if (urlFilter) {
      urlFilter.addEventListener('change', () => this.refreshAnalytics());
    }

    if (typeFilter) {
      typeFilter.addEventListener('change', () => this.refreshAnalytics());
    }

    if (statusFilter) {
      statusFilter.addEventListener('change', () => this.refreshAnalytics());
    }
    
    // Update URL dropdown when requests are logged
    document.addEventListener('requestLogged', () => {
      this.updateEndpointDropdown();
    });

    // Auto-refresh when Analytics tab is shown
    this.setupAnalyticsTabObserver();

    // Listen for request events to track performance
    this.setupPerformanceTracking();

    // Initial load
    setTimeout(() => this.refreshAnalytics(), 500);
  }

  setupAnalyticsTabObserver() {
    // Listen for tab clicks to auto-refresh analytics
    const analyticsTabBtn = document.querySelector('[data-tab="analytics"]');
    if (analyticsTabBtn) {
      analyticsTabBtn.addEventListener('click', () => {
        console.log('[PANEL-EXT] Analytics tab opened, refreshing...');
        this.updateEndpointDropdown();
        this.refreshAnalytics();
      });
    }
  }

  updateEndpointDropdown() {
    const urlFilter = document.getElementById('analyticsUrlFilter');
    if (!urlFilter) return;
    
    // Get unique endpoints from tracked requests
    const endpoints = new Map();
    this.performanceTracker.requests.forEach(req => {
      const key = req.operationName || req.endpoint || req.path || this.getEndpointFromUrl(req.url);
      if (key && !endpoints.has(key)) {
        endpoints.set(key, {
          name: key,
          count: 1,
          type: req.requestType
        });
      } else if (key) {
        endpoints.get(key).count++;
      }
    });
    
    // Sort by count (most used first)
    const sortedEndpoints = [...endpoints.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 50); // Limit to top 50
    
    // Preserve current selection
    const currentValue = urlFilter.value;
    
    // Update dropdown
    urlFilter.innerHTML = '<option value="">All Endpoints</option>' +
      sortedEndpoints.map(([key, data]) => 
        `<option value="${this.escapeHtml(key)}">${this.escapeHtml(key)} (${data.count})</option>`
      ).join('');
    
    // Restore selection if it still exists
    if (currentValue && [...urlFilter.options].some(opt => opt.value === currentValue)) {
      urlFilter.value = currentValue;
    }
  }

  getEndpointFromUrl(url) {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return url;
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  setupPerformanceTracking() {
    console.log('[PANEL-EXT] Setting up performance tracking event listeners...');
    
    // Track requests for performance metrics
    document.addEventListener('requestLogged', (e) => {
      const request = e.detail;
      console.log('[PANEL-EXT] 📊 Request event received:', {
        id: request.id,
        operationName: request.operationName,
        url: request.url,
        requestType: request.requestType
      });
      const entry = this.performanceTracker.startRequest(request.id, request);
      console.log('[PANEL-EXT] 📊 Request tracking started:', entry);
      console.log('[PANEL-EXT] 📊 Active requests:', this.performanceTracker.activeRequests?.size);
    });

    document.addEventListener('responseLogged', (e) => {
      const { requestId, ...responseData } = e.detail;
      console.log('[PANEL-EXT] 📊 Response event received:', {
        requestId,
        status: responseData.status,
        hasResponse: !!responseData.response
      });
      const completed = this.performanceTracker.completeRequest(requestId, responseData);
      console.log('[PANEL-EXT] 📊 Request completed:', completed);
      console.log('[PANEL-EXT] 📊 Total tracked requests:', this.performanceTracker.requests?.length);
    });
    
    console.log('[PANEL-EXT] Performance tracking listeners registered');
  }

  async refreshAnalytics() {
    console.log('[PANEL-EXT] Refreshing analytics...');
    
    try {
      const timeRange = document.getElementById('analyticsTimeRange')?.value || 'all';
      const urlFilter = document.getElementById('analyticsUrlFilter')?.value || '';
      const typeFilter = document.getElementById('analyticsTypeFilter')?.value || 'all';
      const statusFilter = document.getElementById('analyticsStatusFilter')?.value || 'all';
      
      console.log('[PANEL-EXT] Filters:', { timeRange, urlFilter, typeFilter, statusFilter });
      
      // Use local performance tracker with filters applied
      let metrics = this.performanceTracker.getMetrics(timeRange);
      
      // Apply additional filters locally
      if (urlFilter || typeFilter !== 'all' || statusFilter !== 'all') {
        metrics = this.applyAnalyticsFilters(metrics, { urlFilter, typeFilter, statusFilter });
      }
      
      console.log('[PANEL-EXT] Metrics:', metrics);
      this.updateAnalyticsDashboard(metrics);
    } catch (error) {
      console.error('[PANEL-EXT] Failed to refresh analytics:', error);
    }
  }

  applyAnalyticsFilters(metrics, filters) {
    const { urlFilter, typeFilter, statusFilter } = filters;
    
    // Filter the requests array based on criteria
    let filteredRequests = [...this.performanceTracker.requests];
    
    if (urlFilter) {
      filteredRequests = filteredRequests.filter(r => {
        const endpoint = r.operationName || r.endpoint || r.path || this.getEndpointFromUrl(r.url);
        return endpoint === urlFilter;
      });
    }
    
    if (typeFilter !== 'all') {
      filteredRequests = filteredRequests.filter(r => r.requestType === typeFilter);
    }
    
    if (statusFilter !== 'all') {
      filteredRequests = filteredRequests.filter(r => r.status === statusFilter);
    }
    
    // Recalculate metrics from filtered requests
    if (filteredRequests.length === 0) {
      return {
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        totalRequests: 0,
        successRate: 100,
        errorRate: 0,
        requestsPerMinute: 0,
        slowestRequests: [],
        requestsByType: { graphql: 0, rest: 0 },
        requestsByStatus: {},
        timeSeriesData: [],
        activeRequests: metrics.activeRequests || 0
      };
    }
    
    const responseTimes = filteredRequests.map(r => r.responseTime || 0);
    const totalResponseTime = responseTimes.reduce((sum, t) => sum + t, 0);
    const successCount = filteredRequests.filter(r => r.status === 'success').length;
    
    return {
      avgResponseTime: Math.round(totalResponseTime / filteredRequests.length),
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      totalRequests: filteredRequests.length,
      successRate: Math.round((successCount / filteredRequests.length) * 100),
      errorRate: Math.round(((filteredRequests.length - successCount) / filteredRequests.length) * 100),
      requestsPerMinute: metrics.requestsPerMinute,
      slowestRequests: [...filteredRequests]
        .sort((a, b) => (b.responseTime || 0) - (a.responseTime || 0))
        .slice(0, 5),
      requestsByType: {
        graphql: filteredRequests.filter(r => r.requestType === 'graphql').length,
        rest: filteredRequests.filter(r => r.requestType === 'rest').length
      },
      requestsByStatus: {},
      timeSeriesData: filteredRequests.slice(-50).map(r => ({
        timestamp: r.timestamp,
        responseTime: r.responseTime,
        status: r.status,
        requestType: r.requestType
      })),
      activeRequests: metrics.activeRequests || 0
    };
  }

  updateAnalyticsDashboard(metrics) {
    // Update main metrics
    const avgTime = document.getElementById('avgResponseTime');
    if (avgTime) avgTime.innerHTML = `${metrics.avgResponseTime}<span class="metric-unit">ms</span>`;
    
    const totalReqs = document.getElementById('totalRequests');
    if (totalReqs) totalReqs.textContent = metrics.totalRequests;
    
    const successRate = document.getElementById('successRate');
    if (successRate) successRate.textContent = metrics.successRate + '%';
    
    const activeReqs = document.getElementById('activeRequests');
    if (activeReqs) activeReqs.textContent = metrics.activeRequests || 0;
    
    // Update new metrics
    const graphqlCount = document.getElementById('graphqlCount');
    if (graphqlCount) graphqlCount.textContent = metrics.requestsByType?.graphql || 0;
    
    const restCount = document.getElementById('restCount');
    if (restCount) restCount.textContent = metrics.requestsByType?.rest || 0;
    
    const minTime = document.getElementById('minResponseTime');
    if (minTime) minTime.textContent = (metrics.minResponseTime || 0) + 'ms';
    
    const maxTime = document.getElementById('maxResponseTime');
    if (maxTime) maxTime.textContent = (metrics.maxResponseTime || 0) + 'ms';
    
    const reqPerMin = document.getElementById('requestsPerMinute');
    if (reqPerMin) reqPerMin.innerHTML = `${metrics.requestsPerMinute || 0}<span class="metric-unit">/min</span>`;
    
    // Calculate success/error counts
    const successCount = Math.round((metrics.successRate / 100) * metrics.totalRequests);
    const errorCount = metrics.totalRequests - successCount;
    
    const successCountEl = document.getElementById('successCount');
    if (successCountEl) successCountEl.textContent = successCount;
    
    const errorCountEl = document.getElementById('errorCount');
    if (errorCountEl) errorCountEl.textContent = errorCount;

    // Update slowest requests table
    this.updateSlowestRequestsTable(metrics.slowestRequests);
    
    // Update endpoint breakdown table
    this.updateEndpointBreakdownTable();

    // Update charts if Chart.js is available
    this.updateCharts(metrics);

    // Update recommendations
    this.updateRecommendations();
  }
  
  updateEndpointBreakdownTable() {
    const tbody = document.querySelector('#endpointBreakdownTable tbody');
    if (!tbody) return;
    
    // Group requests by endpoint/operation
    const grouped = {};
    this.performanceTracker.requests.forEach(req => {
      const key = req.operationName || req.endpoint || req.path || req.url;
      if (!grouped[key]) {
        grouped[key] = { count: 0, totalTime: 0, success: 0, errors: 0 };
      }
      grouped[key].count++;
      grouped[key].totalTime += req.responseTime || 0;
      if (req.status === 'success') {
        grouped[key].success++;
      } else {
        grouped[key].errors++;
      }
    });
    
    const entries = Object.entries(grouped)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);
    
    if (entries.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No data available yet</td></tr>';
      return;
    }
    
    tbody.innerHTML = entries.map(([endpoint, data]) => `
      <tr>
        <td class="endpoint-name" title="${endpoint}">${this.truncateText(endpoint, 40)}</td>
        <td>${data.count}</td>
        <td>${Math.round(data.totalTime / data.count)}ms</td>
        <td class="success">${data.success}</td>
        <td class="error">${data.errors}</td>
      </tr>
    `).join('');
  }
  
  truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  updateSlowestRequestsTable(slowestRequests) {
    const tbody = document.querySelector('#slowestRequestsTable tbody');
    if (!tbody) return;

    if (!slowestRequests || slowestRequests.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No data available yet</td></tr>';
      return;
    }

    tbody.innerHTML = slowestRequests.map(req => `
      <tr>
        <td><span class="request-type-badge ${req.requestType}">${req.requestType.toUpperCase()}</span></td>
        <td>${req.operationName || req.endpoint || 'Unknown'}</td>
        <td class="response-time ${this.getResponseTimeClass(req.responseTime)}">${req.responseTime}ms</td>
        <td><span class="status-badge ${req.status}">${req.httpStatus || req.status}</span></td>
        <td>${new Date(req.timestamp).toLocaleTimeString()}</td>
      </tr>
    `).join('');
  }

  getResponseTimeClass(time) {
    if (time < 500) return 'fast';
    if (time < 2000) return 'medium';
    return 'slow';
  }

  updateCharts(metrics) {
    // Response time chart
    const responseTimeCtx = document.getElementById('responseTimeChart');
    if (responseTimeCtx && window.Chart) {
      if (this.responseTimeChart) {
        this.responseTimeChart.destroy();
      }

      const timeSeriesData = metrics.timeSeriesData || [];
      
      this.responseTimeChart = new Chart(responseTimeCtx, {
        type: 'line',
        data: {
          labels: timeSeriesData.map(d => new Date(d.timestamp).toLocaleTimeString()),
          datasets: [{
            label: 'Response Time (ms)',
            data: timeSeriesData.map(d => d.responseTime),
            borderColor: '#0EA5E9',
            backgroundColor: 'rgba(14, 165, 233, 0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }

    // Request type chart
    const requestTypeCtx = document.getElementById('requestTypeChart');
    if (requestTypeCtx && window.Chart) {
      if (this.requestTypeChart) {
        this.requestTypeChart.destroy();
      }

      const requestsByType = metrics.requestsByType || { graphql: 0, rest: 0 };
      
      this.requestTypeChart = new Chart(requestTypeCtx, {
        type: 'doughnut',
        data: {
          labels: ['GraphQL', 'REST'],
          datasets: [{
            data: [requestsByType.graphql, requestsByType.rest],
            backgroundColor: ['#8B5CF6', '#10B981']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });
    }
  }

  async updateRecommendations() {
    const container = document.getElementById('performanceRecommendations');
    if (!container) return;

    const recommendations = this.performanceTracker.getRecommendations();
    
    if (recommendations.length === 0) {
      container.innerHTML = '<div class="no-recommendations">Start monitoring requests to receive performance recommendations.</div>';
      return;
    }

    container.innerHTML = recommendations.map(rec => `
      <div class="recommendation ${rec.type}">
        <div class="recommendation-icon">${this.getRecommendationIcon(rec.type)}</div>
        <div class="recommendation-content">
          <div class="recommendation-title">${rec.title}</div>
          <div class="recommendation-message">${rec.message}</div>
        </div>
      </div>
    `).join('');
  }

  getRecommendationIcon(type) {
    const icons = {
      success: '✅',
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌'
    };
    return icons[type] || 'ℹ️';
  }

  async clearAnalyticsData() {
    if (!confirm('Clear all performance data?')) return;

    try {
      const runtime = chrome.runtime || browser.runtime;
      await runtime.sendMessage({ type: 'CLEAR_PERFORMANCE_DATA' });
      this.performanceTracker.clear();
      this.refreshAnalytics();
    } catch (error) {
      console.error('Failed to clear analytics data:', error);
    }
  }

  // ============================================
  // Time-Travel Debugging
  // ============================================

  setupTimeTravelHandlers() {
    console.log('[PANEL-EXT] Setting up Time-Travel handlers...');
    
    const recordBtn = document.getElementById('recordBtn');
    const pauseBtn = document.getElementById('pauseRecordBtn');
    const stopBtn = document.getElementById('stopRecordBtn');
    const stepBtn = document.getElementById('stepBtn');
    const importBtn = document.getElementById('importSessionBtn');
    const exitReplayBtn = document.getElementById('exitReplayBtn');

    console.log('[PANEL-EXT] Time-Travel elements:', {
      recordBtn: !!recordBtn,
      pauseBtn: !!pauseBtn,
      stopBtn: !!stopBtn,
      stepBtn: !!stepBtn
    });

    if (recordBtn) {
      recordBtn.addEventListener('click', () => {
        console.log('[PANEL-EXT] Record button clicked');
        this.toggleRecording();
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        console.log('[PANEL-EXT] Pause button clicked');
        this.togglePauseRecording();
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        console.log('[PANEL-EXT] Stop button clicked');
        this.stopRecording();
      });
    }

    if (stepBtn) {
      stepBtn.addEventListener('click', () => this.stepPlayback(1));
    }

    const stepBackBtn = document.getElementById('stepBackBtn');
    if (stepBackBtn) {
      stepBackBtn.addEventListener('click', () => this.stepPlayback(-1));
    }

    if (importBtn) {
      importBtn.addEventListener('click', () => {
        document.getElementById('importSessionFile').click();
      });
    }

    const importFile = document.getElementById('importSessionFile');
    if (importFile) {
      importFile.addEventListener('change', (e) => this.importSession(e));
    }
    
    // Export all sessions button
    const exportAllBtn = document.getElementById('exportAllSessionsBtn');
    if (exportAllBtn) {
      exportAllBtn.addEventListener('click', () => this.exportAllSessions());
    }

    if (exitReplayBtn) {
      exitReplayBtn.addEventListener('click', () => this.exitReplayMode());
    }

    // Setup detail tab switching
    document.querySelectorAll('.detail-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.detailTab;
        this.switchDetailTab(tab);
      });
    });

    // Load saved sessions
    this.loadSessions();
    
    // Listen for request events from panel to record them
    this.setupRecordingListener();
  }

  switchDetailTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.detail-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.detailTab === tab);
    });
    
    // Update tab contents
    document.getElementById('requestDetailContent').classList.toggle('active', tab === 'request');
    document.getElementById('responseDetailContent').classList.toggle('active', tab === 'response');
  }

  setupRecordingListener() {
    console.log('[PANEL-EXT] Setting up recording event listeners...');
    
    // Listen for custom events from the panel when requests are logged
    document.addEventListener('requestLogged', (e) => {
      const status = this.sessionRecorder.getStatus();
      console.log('[PANEL-EXT] 🎬 Request event for recording:', {
        requestId: e.detail?.id,
        isRecording: status.isRecording,
        isPaused: status.isPaused
      });
      
      if (status.isRecording && !status.isPaused) {
        const recorded = this.sessionRecorder.recordRequest(e.detail);
        console.log('[PANEL-EXT] 🎬 Request recorded:', recorded);
        this.updateRecordingStatus();
      }
    });

    document.addEventListener('responseLogged', (e) => {
      const status = this.sessionRecorder.getStatus();
      console.log('[PANEL-EXT] 🎬 Response event for recording:', {
        requestId: e.detail?.requestId,
        isRecording: status.isRecording
      });
      
      if (status.isRecording) {
        const recorded = this.sessionRecorder.recordResponse(e.detail.requestId, e.detail);
        console.log('[PANEL-EXT] 🎬 Response recorded:', recorded);
        this.updateRecordingStatus();
      }
    });
    
    console.log('[PANEL-EXT] Recording listeners registered');
  }

  async toggleRecording() {
    console.log('[PANEL-EXT] 🔴 toggleRecording called');
    const recordBtn = document.getElementById('recordBtn');
    console.log('[PANEL-EXT] 🔴 Record button element:', recordBtn);
    console.log('[PANEL-EXT] 🔴 SessionRecorder instance:', this.sessionRecorder);
    
    const status = this.sessionRecorder.getStatus();
    console.log('[PANEL-EXT] 🔴 Current recording status:', JSON.stringify(status));

    if (status.isRecording) {
      console.log('[PANEL-EXT] 🔴 Already recording, ignoring');
      return;
    }

    // Start recording
    console.log('[PANEL-EXT] 🔴 Starting recording...');
    const session = this.sessionRecorder.startRecording();
    console.log('[PANEL-EXT] 🔴 Session created:', session);
    
    if (session) {
      recordBtn.classList.add('recording');
      const recordText = recordBtn.querySelector('.record-text');
      if (recordText) recordText.textContent = 'Recording...';
      
      const pauseRecordBtn = document.getElementById('pauseRecordBtn');
      const stopRecordBtn = document.getElementById('stopRecordBtn');
      if (pauseRecordBtn) pauseRecordBtn.disabled = false;
      if (stopRecordBtn) stopRecordBtn.disabled = false;
      
      this.updateRecordingStatus();
      console.log('[PANEL-EXT] Recording started successfully');
    } else {
      console.error('[PANEL-EXT] Failed to start recording');
    }
  }

  togglePauseRecording() {
    const status = this.sessionRecorder.getStatus();
    const pauseBtn = document.getElementById('pauseRecordBtn');

    if (status.isPaused) {
      this.sessionRecorder.resumeRecording();
      pauseBtn.querySelector('.btn-icon').textContent = '⏸️';
      pauseBtn.title = 'Pause';
    } else {
      this.sessionRecorder.pauseRecording();
      pauseBtn.querySelector('.btn-icon').textContent = '▶️';
      pauseBtn.title = 'Resume';
    }

    this.updateRecordingStatus();
  }

  stopRecording() {
    const session = this.sessionRecorder.stopRecording();
    
    if (session) {
      console.log('[PANEL-EXT] Session stopped:', session);
      
      const recordBtn = document.getElementById('recordBtn');
      recordBtn.classList.remove('recording');
      recordBtn.querySelector('.record-text').textContent = 'Record';
      document.getElementById('pauseRecordBtn').disabled = true;
      document.getElementById('stopRecordBtn').disabled = true;
      
      this.updateRecordingStatus();
      
      // Render local sessions directly (don't rely on background)
      this.renderSessionsList();
      
      // Clear the timeline and chart after recording stops
      const container = document.getElementById('sessionTimeline');
      if (container) {
        container.innerHTML = '<div class="timeline-empty">Recording saved! Select a session below to replay.</div>';
      }
      
      // Clear the time series chart
      this.clearTimelineChart();
      
      // Hide playback controls
      const playbackControls = document.getElementById('playbackControls');
      if (playbackControls) {
        playbackControls.style.display = 'none';
      }
    }
  }

  updateRecordingStatus() {
    const status = this.sessionRecorder.getStatus();
    const statusEl = document.getElementById('recordingStatus');
    const counterEl = document.getElementById('recordingCounter');

    if (statusEl) {
      if (status.isRecording) {
        statusEl.textContent = status.isPaused ? 'Paused' : 'Recording...';
        statusEl.className = 'recording-status ' + (status.isPaused ? 'paused' : 'active');
      } else {
        statusEl.textContent = 'Ready to record';
        statusEl.className = 'recording-status';
      }
    }

    if (counterEl && status.currentSession) {
      counterEl.textContent = `${status.currentSession.requestCount} requests`;
    }

    // Update live timeline during recording
    if (status.isRecording && this.sessionRecorder.currentSession) {
      this.renderLiveTimeline(this.sessionRecorder.currentSession);
    }
  }

  renderLiveTimeline(session) {
    const container = document.getElementById('sessionTimeline');
    if (!container) return;

    if (!session.requests || session.requests.length === 0) {
      container.innerHTML = '<div class="timeline-empty">Start recording to capture API requests</div>';
      return;
    }

    // Render the timeline chart
    this.renderTimelineChart(session);

    container.innerHTML = `
      <div class="timeline-list">
        ${session.requests.map((req, index) => {
          const statusClass = req.response ? (req.responseStatus >= 400 ? 'error' : 'success') : 'pending';
          const statusIcon = req.response ? (req.responseStatus >= 400 ? '❌' : '✅') : '⏳';
          const reqName = req.operationName || req.endpoint || req.method + ' ' + this.getEndpointFromUrl(req.url);
          const hasMockableResponse = req.response ? true : false;
          return `
          <div class="timeline-list-item ${req.requestType} ${statusClass}" 
               data-index="${index}"
               data-request-id="${req.id}">
            <span class="timeline-list-icon">${statusIcon}</span>
            <span class="timeline-list-type ${req.requestType}">${req.requestType?.toUpperCase()}</span>
            <span class="timeline-list-name">${reqName}</span>
            <span class="timeline-list-time">${this.formatRelativeTime(req.relativeTime)}</span>
            <div class="timeline-list-actions">
              ${hasMockableResponse ? `<button class="btn-timeline-mock" data-index="${index}" title="Create mock rule">🎯</button>` : ''}
            </div>
          </div>
        `}).join('')}
      </div>
    `;

    // Add click handlers to navigate to monitor tab
    container.querySelectorAll('.timeline-list-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't trigger if clicking on mock button
        if (e.target.classList.contains('btn-timeline-mock')) return;
        
        const requestId = item.dataset.requestId;
        this.navigateToRequest(requestId);
      });
    });
    
    // Add click handlers for mock buttons during live recording
    container.querySelectorAll('.btn-timeline-mock').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        this.createMockFromTimelineRequest(session, index);
      });
    });
  }

  renderTimelineChart(session) {
    const chartContainer = document.getElementById('sessionTimelineChart');
    const canvas = document.getElementById('timelineChartCanvas');
    if (!chartContainer || !canvas) return;
    
    if (!session.requests || session.requests.length === 0) {
      chartContainer.style.display = 'none';
      return;
    }

    chartContainer.style.display = 'block';
    
    // Set dynamic height based on number of requests (min 200px, max 400px)
    const dynamicHeight = Math.min(400, Math.max(200, session.requests.length * 28 + 60));
    chartContainer.style.height = dynamicHeight + 'px';

    // Destroy existing chart if any
    if (this.timelineChart) {
      this.timelineChart.destroy();
      this.timelineChart = null;
    }

    const ctx = canvas.getContext('2d');
    
    // Calculate session start time for relative timing
    const sessionStartTime = new Date(session.startTime).getTime();
    
    // Build waterfall data - floating bars showing start and end times
    const labels = [];
    const waterfallData = []; // Each item is [startTime, endTime] in ms
    const colors = [];
    const borderColors = [];
    const requestMeta = []; // Store metadata for tooltips
    
    session.requests.forEach((req, index) => {
      const startTime = req.relativeTime || (new Date(req.timestamp).getTime() - sessionStartTime);
      const duration = req.responseTime || 100; // Default to 100ms if no response time
      const endTime = startTime + duration;
      const name = req.operationName || req.endpoint || this.getEndpointFromUrl(req.url) || `Req ${index + 1}`;
      
      labels.push(name.length > 25 ? name.substring(0, 25) + '...' : name);
      waterfallData.push([startTime, endTime]); // Floating bar from start to end
      requestMeta.push({ startTime, duration, endTime, req });
      
      // Color based on type and status
      if (req.responseStatus >= 400 || req.responseError) {
        colors.push('rgba(239, 68, 68, 0.8)');
        borderColors.push('rgba(239, 68, 68, 1)');
      } else if (req.requestType === 'graphql') {
        colors.push('rgba(139, 92, 246, 0.8)');
        borderColors.push('rgba(139, 92, 246, 1)');
      } else {
        colors.push('rgba(16, 185, 129, 0.8)');
        borderColors.push('rgba(16, 185, 129, 1)');
      }
    });

    // Find max time for scale
    const maxTime = Math.max(...waterfallData.map(d => d[1]));

    if (typeof Chart !== 'undefined') {
      this.timelineChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Request Timeline',
            data: waterfallData, // Floating bars: [[start1, end1], [start2, end2], ...]
            backgroundColor: colors,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 3,
            borderSkipped: false,
            barPercentage: 0.7,
            categoryPercentage: 0.85
          }]
        },
        options: {
          indexAxis: 'y', // Horizontal bars
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const index = context.dataIndex;
                  const meta = requestMeta[index];
                  const req = meta.req;
                  return [
                    `Started: ${(meta.startTime / 1000).toFixed(2)}s`,
                    `Ended: ${(meta.endTime / 1000).toFixed(2)}s`,
                    `Duration: ${meta.duration}ms`,
                    `Type: ${req?.requestType?.toUpperCase() || 'Unknown'}`,
                    `Status: ${req?.responseStatus || 'Pending'}`
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              max: maxTime + 100, // Add padding
              title: { display: true, text: 'Time (ms from session start)', font: { size: 11 } },
              grid: { color: 'rgba(0,0,0,0.08)' },
              ticks: {
                callback: (value) => {
                  if (value >= 1000) return (value / 1000).toFixed(1) + 's';
                  return value + 'ms';
                }
              }
            },
            y: {
              grid: { display: false },
              ticks: { font: { size: 10 } }
            }
          },
          onClick: (event, elements) => {
            if (elements.length > 0) {
              const index = elements[0].index;
              if (session.requests[index]) {
                this.selectTimelineRequest(index, session);
                // Highlight in list
                const container = document.getElementById('sessionTimeline');
                if (container) {
                  container.querySelectorAll('.timeline-list-item').forEach((el, i) => {
                    el.classList.toggle('selected', i === index);
                  });
                }
              }
            }
          }
        }
      });
    }
  }

  clearTimelineChart() {
    if (this.timelineChart) {
      this.timelineChart.destroy();
      this.timelineChart = null;
    }
    const chartContainer = document.getElementById('sessionTimelineChart');
    if (chartContainer) {
      chartContainer.style.display = 'none';
    }
  }

  navigateToRequest(requestId) {
    console.log('[PANEL-EXT] Navigating to request:', requestId);
    
    // Switch to Monitor tab
    const monitorTab = document.querySelector('[data-tab="monitor"]');
    if (monitorTab) {
      monitorTab.click();
    }
    
    // Find and highlight the request in the monitor
    setTimeout(() => {
      // First, expand all collapsed groups so we can find the request
      document.querySelectorAll('.request-group-content').forEach(content => {
        if (content.style.display === 'none') {
          const group = content.closest('.request-group');
          const header = group?.querySelector('.request-group-header');
          if (header) header.click();
        }
      });
      
      // Wait a bit for groups to expand, then search
      setTimeout(() => {
        // Look for the request by checking the actual request data
        const requestItems = document.querySelectorAll('.request-item');
        let found = false;
        
        // Get the panel's requestLog to find the index
        if (this.panel && this.panel.requestLog) {
          const requestIndex = this.panel.requestLog.findIndex(r => r.id === requestId);
          console.log('[PANEL-EXT] Request index in log:', requestIndex);
          
          if (requestIndex !== -1) {
            // Find the item by data-request-index
            const item = document.querySelector(`.request-item[data-request-index="${requestIndex}"]`);
            if (item) {
              item.scrollIntoView({ behavior: 'smooth', block: 'center' });
              item.classList.add('highlighted');
              
              // Also expand the details
              const detailsSection = item.querySelector('.request-details');
              if (detailsSection) {
                detailsSection.style.display = 'block';
              }
              
              setTimeout(() => item.classList.remove('highlighted'), 3000);
              found = true;
              console.log('[PANEL-EXT] Request found and highlighted');
            }
          }
        }
        
        if (!found) {
          // Fallback: search by partial ID match in the URL or operation name
          requestItems.forEach((item, idx) => {
            if (found) return;
            
            const url = item.querySelector('.request-url')?.textContent || '';
            const opName = item.querySelector('.operation-name')?.textContent || '';
            
            // Try to match by the unique suffix of the request ID
            const idSuffix = requestId?.split('_').pop();
            if (idSuffix && (url.includes(idSuffix) || item.outerHTML.includes(requestId))) {
              item.scrollIntoView({ behavior: 'smooth', block: 'center' });
              item.classList.add('highlighted');
              setTimeout(() => item.classList.remove('highlighted'), 3000);
              found = true;
            }
          });
        }
        
        if (!found) {
          console.log('[PANEL-EXT] Request not found in monitor log');
        }
      }, 200);
    }, 100);
  }

  formatRelativeTime(ms) {
    if (!ms && ms !== 0) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  getEndpointFromUrl(url) {
    if (!url) return 'Unknown';
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const segments = path.split('/').filter(s => s);
      if (segments.length > 0) {
        return segments[segments.length - 1].split('?')[0];
      }
      return urlObj.hostname;
    } catch (e) {
      return url.slice(0, 30);
    }
  }

  async loadSessions() {
    try {
      const runtime = chrome.runtime || browser.runtime;
      console.log('[PANEL-EXT] Loading saved sessions...');
      const response = await runtime.sendMessage({ type: 'GET_SESSIONS' });
      console.log('[PANEL-EXT] Sessions response:', response);
      
      if (response && response.success) {
        this.sessionRecorder.sessions = response.sessions || [];
        this.renderSessionsList();
        console.log('[PANEL-EXT] ✅ Sessions loaded:', this.sessionRecorder.sessions.length);
      } else {
        console.warn('[PANEL-EXT] Sessions response invalid:', response);
        this.sessionRecorder.sessions = [];
        this.renderSessionsList();
      }
    } catch (error) {
      console.error('[PANEL-EXT] Failed to load sessions:', error);
      this.sessionRecorder.sessions = [];
      this.renderSessionsList();
    }
  }

  renderSessionsList() {
    const container = document.getElementById('savedSessionsList');
    if (!container) return;

    const sessions = this.sessionRecorder.getSessions();

    if (sessions.length === 0) {
      container.innerHTML = '<div class="no-sessions">No saved sessions yet. Start recording to capture API requests.</div>';
      return;
    }

    container.innerHTML = sessions.map(session => {
      const graphqlCount = session.requests?.filter(r => r.requestType === 'graphql').length || 0;
      const restCount = session.requests?.filter(r => r.requestType === 'rest').length || 0;
      const duration = session.endTime ? Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000) : 0;
      
      return `
      <div class="session-item" data-session-id="${session.id}">
        <div class="session-info">
          <div class="session-name-row">
            <span class="session-name" title="${session.name}">${session.name}</span>
            <button class="btn-icon-tiny session-rename" title="Rename session">✏️</button>
          </div>
          <div class="session-meta">
            <span class="session-stat">${session.requestCount} requests</span>
            ${graphqlCount > 0 ? `<span class="session-badge graphql">${graphqlCount} GraphQL</span>` : ''}
            ${restCount > 0 ? `<span class="session-badge rest">${restCount} REST</span>` : ''}
            <span class="session-duration">${duration > 0 ? `${duration}s` : ''}</span>
          </div>
          <div class="session-date">${new Date(session.startTime).toLocaleString()}</div>
        </div>
        <div class="session-actions">
          <button class="btn btn-sm btn-primary session-play" title="Replay session to create mocks">▶️ Replay</button>
          <button class="btn btn-sm btn-secondary session-export" title="Export session">📤</button>
          <button class="btn btn-sm btn-danger session-delete" title="Delete session">🗑️</button>
        </div>
      </div>
    `}).join('');

    // Add event listeners
    container.querySelectorAll('.session-play').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sessionId = e.target.closest('.session-item').dataset.sessionId;
        this.startPlayback(sessionId);
      });
    });

    container.querySelectorAll('.session-rename').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sessionItem = e.target.closest('.session-item');
        if (sessionItem) {
          const sessionId = sessionItem.dataset.sessionId;
          this.renameSession(sessionId);
        }
      });
    });

    container.querySelectorAll('.session-export').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sessionId = e.target.closest('.session-item').dataset.sessionId;
        this.exportSession(sessionId);
      });
    });

    container.querySelectorAll('.session-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sessionId = e.target.closest('.session-item').dataset.sessionId;
        this.deleteSession(sessionId);
      });
    });
  }
  
  renameSession(sessionId) {
    console.log('[PANEL-EXT] Renaming session:', sessionId);
    const sessions = this.sessionRecorder.getSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      console.error('[PANEL-EXT] Session not found:', sessionId);
      return;
    }
    
    const newName = prompt('Enter new session name:', session.name);
    console.log('[PANEL-EXT] New name entered:', newName);
    
    if (newName && newName.trim() && newName.trim() !== session.name) {
      session.name = newName.trim();
      
      // Update in the recorder's sessions array
      const idx = this.sessionRecorder.sessions.findIndex(s => s.id === sessionId);
      if (idx !== -1) {
        this.sessionRecorder.sessions[idx].name = newName.trim();
      }
      
      this.renderSessionsList();
      this.saveSessionsToStorage();
      
      console.log('[PANEL-EXT] Session renamed successfully');
    }
  }
  
  async createRulesFromSession(sessionId) {
    const session = this.sessionRecorder.sessions.find(s => s.id === sessionId);
    if (!session || !session.requests || session.requests.length === 0) {
      alert('No requests found in this session');
      return;
    }
    
    // Filter requests that have responses
    const requestsWithResponses = session.requests.filter(r => r.response);
    
    if (requestsWithResponses.length === 0) {
      alert('No requests with responses found in this session');
      return;
    }
    
    // Show selection dialog
    const selectedRequests = await this.showSessionRulesDialog(session, requestsWithResponses);
    if (!selectedRequests || selectedRequests.length === 0) return;
    
    // Create rules for selected requests
    let createdCount = 0;
    const runtime = chrome.runtime || browser.runtime;
    
    for (const req of selectedRequests) {
      try {
        const rule = this.createRuleFromSessionRequest(req, session.name);
        
        await new Promise((resolve, reject) => {
          runtime.sendMessage({ type: 'ADD_RULE', rule }, (response) => {
            if (response && response.success) {
              createdCount++;
              resolve();
            } else {
              reject(new Error(response?.error || 'Failed to create rule'));
            }
          });
        });
      } catch (error) {
        console.error('[PANEL-EXT] Failed to create rule:', error);
      }
    }
    
    if (createdCount > 0) {
      alert(`Created ${createdCount} mock rule(s) from session "${session.name}"`);
      
      // Dispatch event to refresh rules list
      document.dispatchEvent(new CustomEvent('rulesUpdated'));
      
      // Switch to rules tab
      const rulesTab = document.querySelector('[data-tab="rules"]');
      if (rulesTab) rulesTab.click();
    }
  }
  
  showSessionRulesDialog(session, requests) {
    return new Promise((resolve) => {
      // Create modal
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.id = 'sessionRulesModal';
      modal.style.display = 'flex';
      
      modal.innerHTML = `
        <div class="modal-content modal-medium">
          <div class="modal-header">
            <h3>Create Mock Rules from Session</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-description">Select requests to create mock rules. Each selected request will become a rule that returns the recorded response.</p>
            <div class="session-rules-controls">
              <button class="btn btn-sm btn-secondary" id="selectAllSessionRules">Select All</button>
              <span class="selected-count">0 selected</span>
            </div>
            <div class="session-rules-list">
              ${requests.map((req, index) => {
                const name = req.operationName || req.endpoint || `${req.method} ${this.getEndpointFromUrl(req.url)}`;
                const statusClass = req.responseStatus >= 400 ? 'error' : 'success';
                return `
                <label class="session-rule-item">
                  <input type="checkbox" value="${index}" class="session-rule-checkbox">
                  <span class="rule-type-badge ${req.requestType}">${req.requestType?.toUpperCase()}</span>
                  <span class="rule-name">${name}</span>
                  <span class="rule-status ${statusClass}">${req.responseStatus || 'N/A'}</span>
                </label>
              `}).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelSessionRules">Cancel</button>
            <button class="btn btn-primary" id="createSessionRules">Create Rules</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // Update selected count
      const updateCount = () => {
        const count = modal.querySelectorAll('.session-rule-checkbox:checked').length;
        modal.querySelector('.selected-count').textContent = `${count} selected`;
      };
      
      // Event listeners
      modal.querySelectorAll('.session-rule-checkbox').forEach(cb => {
        cb.addEventListener('change', updateCount);
      });
      
      modal.querySelector('#selectAllSessionRules').addEventListener('click', () => {
        const checkboxes = modal.querySelectorAll('.session-rule-checkbox');
        const allChecked = [...checkboxes].every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
        updateCount();
      });
      
      modal.querySelector('.modal-close').addEventListener('click', () => {
        modal.remove();
        resolve(null);
      });
      
      modal.querySelector('#cancelSessionRules').addEventListener('click', () => {
        modal.remove();
        resolve(null);
      });
      
      modal.querySelector('#createSessionRules').addEventListener('click', () => {
        const selectedIndexes = [...modal.querySelectorAll('.session-rule-checkbox:checked')]
          .map(cb => parseInt(cb.value));
        const selectedReqs = selectedIndexes.map(i => requests[i]);
        modal.remove();
        resolve(selectedReqs);
      });
      
      // Close on backdrop click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
          resolve(null);
        }
      });
    });
  }
  
  createRuleFromSessionRequest(request, sessionName) {
    const isGraphQL = request.requestType === 'graphql';
    const name = request.operationName || request.endpoint || `${request.method} ${this.getEndpointFromUrl(request.url)}`;
    
    const rule = {
      name: `[${sessionName}] ${name}`,
      enabled: true,
      action: 'mock',
      requestType: request.requestType || 'graphql',
      delayMs: 0
    };
    
    if (isGraphQL) {
      rule.operationName = request.operationName || '';
      rule.operationType = request.operationType || 'query';
    } else {
      rule.method = request.method || 'GET';
      rule.urlPattern = this.extractUrlPattern(request.url);
      rule.pathPattern = this.getEndpointFromUrl(request.url);
    }
    
    // Set mock response
    rule.mockResponse = typeof request.response === 'string' 
      ? request.response 
      : JSON.stringify(request.response, null, 2);
    
    return rule;
  }
  
  getEndpointFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return url;
    }
  }
  
  extractUrlPattern(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  startPlayback(sessionId) {
    try {
      const playbackState = this.sessionRecorder.startPlayback(sessionId);
      
      // Store session for navigation
      this._currentReplaySession = playbackState.session;
      this._currentReplayIndex = 0;
      
      // Show replay mode banner
      document.getElementById('replayModeBanner').style.display = 'flex';
      document.getElementById('playbackControls').style.display = 'flex';
      
      // Render timeline list and chart
      this.renderTimeline(playbackState.session);
      this.updatePlaybackPosition();
      
      // Auto-select first request
      if (playbackState.session.requests.length > 0) {
        this.selectTimelineRequest(0, playbackState.session);
      }
    } catch (error) {
      alert('Failed to start playback: ' + error.message);
    }
  }

  togglePlayback() {
    const position = this.sessionRecorder.getPlaybackPosition();
    if (!position) return;

    if (position.status === 'playing') {
      this.sessionRecorder.pausePlayback();
    } else {
      this.sessionRecorder.resumePlayback();
    }

    this.updatePlaybackPosition();
  }

  stepPlayback(direction = 1) {
    if (!this._currentReplaySession) return;
    
    const session = this._currentReplaySession;
    const currentPos = this._currentReplayIndex || 0;
    let newPos = currentPos + direction;
    
    // Clamp to valid range
    newPos = Math.max(0, Math.min(newPos, session.requests.length - 1));
    this._currentReplayIndex = newPos;
    
    // Select and show the request
    this.selectTimelineRequest(newPos, session);
    
    // Highlight in timeline list
    const container = document.getElementById('sessionTimeline');
    if (container) {
      container.querySelectorAll('.timeline-list-item').forEach((el, i) => {
        el.classList.toggle('selected', i === newPos);
      });
    }
    
    // Update position display
    document.getElementById('playbackPosition').textContent = `${newPos + 1} / ${session.requests.length}`;
  }

  updatePlaybackPosition() {
    const position = this.sessionRecorder.getPlaybackPosition();
    if (!position) return;

    const positionEl = document.getElementById('playbackPosition');

    if (positionEl) {
      positionEl.textContent = `${position.currentIndex + 1} / ${position.totalRequests}`;
    }

    // Highlight current request in timeline
    this.highlightTimelineRequest(position.currentIndex);

    // Show request details
    if (position.currentRequest) {
      this.showTimelineRequestDetail(position.currentRequest);
    }
  }

  renderTimeline(session) {
    const container = document.getElementById('sessionTimeline');
    if (!container) return;

    if (!session.requests || session.requests.length === 0) {
      container.innerHTML = '<div class="timeline-empty">No requests in this session</div>';
      return;
    }

    // Render the timeline chart
    this.renderTimelineChart(session);

    container.innerHTML = `
      <div class="timeline-list">
        ${session.requests.map((req, index) => {
          const statusClass = req.response ? (req.responseStatus >= 400 ? 'error' : 'success') : 'pending';
          const statusIcon = req.response ? (req.responseStatus >= 400 ? '❌' : '✅') : '⏳';
          const reqName = req.operationName || req.endpoint || (req.method || 'GET') + ' ' + this.getEndpointFromUrl(req.url);
          const hasMockableResponse = req.response ? true : false;
          return `
          <div class="timeline-list-item ${req.requestType} ${statusClass}" 
               data-index="${index}">
            <span class="timeline-list-icon">${statusIcon}</span>
            <span class="timeline-list-type ${req.requestType}">${req.requestType?.toUpperCase()}</span>
            <span class="timeline-list-name">${reqName}</span>
            <span class="timeline-list-time">${req.responseTime ? req.responseTime + 'ms' : '-'}</span>
            <div class="timeline-list-actions">
              ${hasMockableResponse ? `<button class="btn-timeline-mock" data-index="${index}" title="Create mock rule from this request">🎯</button>` : ''}
            </div>
          </div>
        `}).join('')}
      </div>
    `;

    // Add click handlers to show request details
    container.querySelectorAll('.timeline-list-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't trigger if clicking on mock button
        if (e.target.classList.contains('btn-timeline-mock')) return;
        
        const index = parseInt(e.currentTarget.dataset.index);
        this.selectTimelineRequest(index, session);
        // Highlight selected
        container.querySelectorAll('.timeline-list-item').forEach((el, i) => {
          el.classList.toggle('selected', i === index);
        });
      });
    });
    
    // Add click handlers for mock buttons
    container.querySelectorAll('.btn-timeline-mock').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        this.createMockFromTimelineRequest(session, index);
      });
    });
    
    // Show playback controls
    document.getElementById('playbackControls').style.display = 'flex';
    document.getElementById('playbackPosition').textContent = `1 / ${session.requests.length}`;
    
    // Store session reference for navigation
    this._currentReplaySession = session;
  }
  
  async createMockFromTimelineRequest(session, index) {
    const request = session.requests[index];
    if (!request || !request.response) {
      alert('This request has no response to mock');
      return;
    }
    
    const rule = this.createRuleFromSessionRequest(request, session.name);
    
    try {
      const runtime = chrome.runtime || browser.runtime;
      await new Promise((resolve, reject) => {
        runtime.sendMessage({ type: 'ADD_RULE', rule }, (response) => {
          if (response && response.success) {
            resolve();
          } else {
            reject(new Error(response?.error || 'Failed to create rule'));
          }
        });
      });
      
      const name = request.operationName || request.endpoint || `${request.method} ${this.getEndpointFromUrl(request.url)}`;
      alert(`Mock rule created for "${name}"`);
      
      // Dispatch event to refresh rules list
      document.dispatchEvent(new CustomEvent('rulesUpdated'));
    } catch (error) {
      console.error('[PANEL-EXT] Failed to create mock rule:', error);
      alert('Failed to create mock rule: ' + error.message);
    }
  }

  selectTimelineRequest(index, session) {
    const request = session.requests[index];
    if (!request) return;
    
    // Highlight selected item
    document.querySelectorAll('.timeline-item').forEach((item, i) => {
      item.classList.toggle('active', i === index);
    });
    
    // Update position display
    document.getElementById('playbackPosition').textContent = `${index + 1} / ${session.requests.length}`;
    
    // Show request details
    this.showTimelineRequestDetail(request);
  }

  showTimelineRequestDetail(request) {
    const container = document.getElementById('timelineRequestDetail');
    if (!container) return;

    container.style.display = 'block';

    // Populate request data
    document.getElementById('timelineRequestData').textContent = 
      JSON.stringify({
        type: request.requestType,
        url: request.url,
        method: request.method,
        operationName: request.operationName,
        variables: request.variables,
        body: request.body,
        headers: request.requestHeaders
      }, null, 2);

    // Populate response data
    document.getElementById('timelineResponseData').textContent = 
      request.response 
        ? JSON.stringify(request.response, null, 2)
        : 'No response captured';
    
    // Switch to request tab by default
    this.switchDetailTab('request');
  }

  highlightTimelineRequest(index) {
    const items = document.querySelectorAll('.timeline-item');
    items.forEach((item, i) => {
      item.classList.toggle('active', i === index);
    });
  }

  showTimelineRequestDetail(request) {
    const container = document.getElementById('timelineRequestDetail');
    if (!container) return;

    container.style.display = 'block';

    document.getElementById('timelineRequestData').textContent = 
      JSON.stringify({
        type: request.requestType,
        url: request.url,
        method: request.method,
        operationName: request.operationName,
        variables: request.variables,
        body: request.body
      }, null, 2);

    document.getElementById('timelineResponseData').textContent = 
      JSON.stringify(request.response, null, 2);
  }

  exitReplayMode() {
    this.sessionRecorder.stopPlayback();
    document.getElementById('replayModeBanner').style.display = 'none';
    document.getElementById('playbackControls').style.display = 'none';
    document.getElementById('timelineRequestDetail').style.display = 'none';
    document.getElementById('sessionTimeline').innerHTML = '<div class="timeline-empty">Start recording to capture API requests</div>';
    
    // Clear the waterfall chart
    this.clearTimelineChart();
    
    // Clear session reference
    this._currentReplaySession = null;
    this._currentReplayIndex = 0;
  }

  async exportSession(sessionId) {
    const data = this.sessionRecorder.exportSession(sessionId);
    if (!data) {
      alert('Session not found');
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.session.name.replace(/[^a-z0-9]/gi, '_')}.apilot.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async importSession(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const session = this.sessionRecorder.importSession(data);
      this.renderSessionsList();
      this.saveSessionsToStorage();
      
      alert(`Session "${session.name}" imported successfully!`);
    } catch (error) {
      alert('Failed to import session: ' + error.message);
    }

    event.target.value = '';
  }

  async deleteSession(sessionId) {
    if (!confirm('Delete this session?')) return;

    this.sessionRecorder.deleteSession(sessionId);
    this.renderSessionsList();
    this.saveSessionsToStorage();
  }

  async saveSessionsToStorage() {
    try {
      const runtime = chrome.runtime || browser.runtime;
      runtime.sendMessage({ 
        type: 'SAVE_SESSIONS', 
        sessions: this.sessionRecorder.sessions 
      });
    } catch (error) {
      console.error('Failed to save sessions:', error);
    }
  }
  
  exportAllSessions() {
    const sessions = this.sessionRecorder.getSessions();
    
    if (sessions.length === 0) {
      alert('No sessions to export');
      return;
    }
    
    const exportData = {
      type: 'apilot-sessions-export',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      sessionCount: sessions.length,
      sessions: sessions
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apilot-all-sessions-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================
  // Integration with main panel
  // ============================================

  // Called when a request is logged
  onRequestLogged(requestData) {
    // Track performance
    this.performanceTracker.startRequest(requestData.id, requestData);

    // Record if session is active
    if (this.sessionRecorder.getStatus().isRecording) {
      this.sessionRecorder.recordRequest(requestData);
      this.updateRecordingStatus();
    }
  }

  // Called when a response is logged
  onResponseLogged(requestId, responseData) {
    // Complete performance tracking
    this.performanceTracker.completeRequest(requestId, responseData);

    // Record response if session is active
    if (this.sessionRecorder.getStatus().isRecording) {
      this.sessionRecorder.recordResponse(requestId, responseData);
    }

    // Refresh analytics if on that tab
    const analyticsTab = document.getElementById('analytics-tab');
    if (analyticsTab && analyticsTab.classList.contains('active')) {
      this.refreshAnalytics();
    }
  }
}

// Export for use
if (typeof window !== 'undefined') {
  window.PanelExtensions = PanelExtensions;
}

