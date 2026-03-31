// Session Recording and Playback Service for APIlot
// Enables time-travel debugging by recording and replaying API request sequences

class SessionRecorder {
  constructor() {
    this.currentSession = null;
    this.sessions = [];
    this.isRecording = false;
    this.isPaused = false;
    this.playbackState = null;
  }

  // Start a new recording session
  startRecording(name = null) {
    if (this.isRecording) {
      console.warn('[RECORDER] Already recording. Stop current session first.');
      return null;
    }

    this.currentSession = {
      id: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: name || `Session ${new Date().toLocaleString()}`,
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'recording',
      requests: [],
      metadata: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        url: typeof window !== 'undefined' ? window.location.href : 'unknown'
      }
    };

    this.isRecording = true;
    this.isPaused = false;

    console.log('[RECORDER] Started recording session:', this.currentSession.id);
    return this.currentSession;
  }

  // Pause recording
  pauseRecording() {
    if (!this.isRecording) {
      console.warn('[RECORDER] No active recording to pause.');
      return false;
    }

    this.isPaused = true;
    console.log('[RECORDER] Recording paused');
    return true;
  }

  // Resume recording
  resumeRecording() {
    if (!this.isRecording) {
      console.warn('[RECORDER] No active recording to resume.');
      return false;
    }

    this.isPaused = false;
    console.log('[RECORDER] Recording resumed');
    return true;
  }

  // Stop recording and save session
  stopRecording() {
    if (!this.isRecording || !this.currentSession) {
      console.warn('[RECORDER] No active recording to stop.');
      return null;
    }

    this.currentSession.endTime = new Date().toISOString();
    this.currentSession.status = 'completed';
    this.currentSession.duration = new Date(this.currentSession.endTime) - new Date(this.currentSession.startTime);

    // Add to sessions list
    this.sessions.push(this.currentSession);

    const completedSession = this.currentSession;
    this.currentSession = null;
    this.isRecording = false;
    this.isPaused = false;

    console.log('[RECORDER] Stopped recording session:', completedSession.id, 'Total requests:', completedSession.requests.length);
    return completedSession;
  }

  // Record a request
  recordRequest(requestData) {
    if (!this.isRecording || this.isPaused || !this.currentSession) {
      return false;
    }

    const entry = {
      id: requestData.requestId || requestData.id || 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      sequenceNumber: this.currentSession.requests.length + 1,
      timestamp: new Date().toISOString(),
      relativeTime: Date.now() - new Date(this.currentSession.startTime).getTime(),
      requestType: requestData.requestType || 'graphql',
      url: requestData.url,
      method: requestData.method || 'POST',
      // GraphQL specific
      operationName: requestData.operationName,
      query: requestData.query,
      variables: requestData.variables,
      // REST specific
      endpoint: requestData.endpoint,
      path: requestData.path,
      queryParams: requestData.queryParams,
      body: requestData.body,
      // Common
      requestHeaders: requestData.requestHeaders,
      response: null,
      responseStatus: null,
      responseHeaders: null,
      responseTime: null,
      modified: false
    };

    this.currentSession.requests.push(entry);
    console.log('[RECORDER] Recorded request:', entry.id, entry.operationName || entry.endpoint);
    return entry;
  }

  // Record a response for a request
  recordResponse(requestId, responseData) {
    if (!this.isRecording || !this.currentSession) {
      return false;
    }

    const entry = this.currentSession.requests.find(r => r.id === requestId);
    if (!entry) {
      console.warn('[RECORDER] No matching request found for response:', requestId);
      return false;
    }

    entry.response = responseData.response;
    entry.responseStatus = responseData.status;
    entry.responseStatusText = responseData.statusText;
    entry.responseHeaders = responseData.headers;
    entry.responseTime = Date.now() - new Date(entry.timestamp).getTime();
    entry.error = responseData.error;

    console.log('[RECORDER] Recorded response for:', requestId, 'Status:', responseData.status);
    return entry;
  }

  // Get recording status
  getStatus() {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      currentSession: this.currentSession ? {
        id: this.currentSession.id,
        name: this.currentSession.name,
        requestCount: this.currentSession.requests.length,
        startTime: this.currentSession.startTime,
        duration: Date.now() - new Date(this.currentSession.startTime).getTime()
      } : null,
      totalSessions: this.sessions.length
    };
  }

  // Get all saved sessions
  getSessions() {
    return this.sessions.map(s => ({
      id: s.id,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      duration: s.duration,
      requestCount: s.requests.length,
      status: s.status
    }));
  }

  // Get a specific session with full details
  getSession(sessionId) {
    return this.sessions.find(s => s.id === sessionId) || null;
  }

  // Delete a session
  deleteSession(sessionId) {
    const index = this.sessions.findIndex(s => s.id === sessionId);
    if (index !== -1) {
      this.sessions.splice(index, 1);
      console.log('[RECORDER] Deleted session:', sessionId);
      return true;
    }
    return false;
  }

  // Rename a session
  renameSession(sessionId, newName) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      session.name = newName;
      return true;
    }
    return false;
  }

  // Export a session to JSON
  exportSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      version: '1.0.0',
      application: 'APIlot',
      exportedAt: new Date().toISOString(),
      session: session
    };
  }

  // Import a session from JSON
  importSession(data) {
    if (!data.session) {
      throw new Error('Invalid session data: missing session object');
    }

    const session = {
      ...data.session,
      id: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9), // Generate new ID
      importedAt: new Date().toISOString(),
      importedFrom: data.exportedAt
    };

    this.sessions.push(session);
    console.log('[RECORDER] Imported session:', session.id, 'Original:', data.session.id);
    return session;
  }

  // Start playback of a session
  startPlayback(sessionId, options = {}) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found: ' + sessionId);
    }

    if (session.requests.length === 0) {
      throw new Error('Session has no requests to replay');
    }

    this.playbackState = {
      sessionId: sessionId,
      session: session,
      currentIndex: 0,
      status: 'playing',
      speed: options.speed || 1,
      startTime: Date.now(),
      modifications: new Map(), // requestId -> modified response
      history: [] // Track playback history
    };

    console.log('[RECORDER] Started playback of session:', sessionId);
    return this.playbackState;
  }

  // Get current playback position
  getPlaybackPosition() {
    if (!this.playbackState) {
      return null;
    }

    return {
      sessionId: this.playbackState.sessionId,
      currentIndex: this.playbackState.currentIndex,
      totalRequests: this.playbackState.session.requests.length,
      status: this.playbackState.status,
      speed: this.playbackState.speed,
      currentRequest: this.playbackState.session.requests[this.playbackState.currentIndex] || null
    };
  }

  // Pause playback
  pausePlayback() {
    if (!this.playbackState) {
      return false;
    }

    this.playbackState.status = 'paused';
    console.log('[RECORDER] Playback paused at index:', this.playbackState.currentIndex);
    return true;
  }

  // Resume playback
  resumePlayback() {
    if (!this.playbackState) {
      return false;
    }

    this.playbackState.status = 'playing';
    console.log('[RECORDER] Playback resumed from index:', this.playbackState.currentIndex);
    return true;
  }

  // Step forward one request
  stepForward() {
    if (!this.playbackState) {
      return null;
    }

    if (this.playbackState.currentIndex < this.playbackState.session.requests.length - 1) {
      this.playbackState.currentIndex++;
      this.playbackState.history.push({
        action: 'step',
        index: this.playbackState.currentIndex,
        timestamp: Date.now()
      });
    }

    return this.getPlaybackPosition();
  }

  // Step backward one request
  stepBackward() {
    if (!this.playbackState) {
      return null;
    }

    if (this.playbackState.currentIndex > 0) {
      this.playbackState.currentIndex--;
      this.playbackState.history.push({
        action: 'stepBack',
        index: this.playbackState.currentIndex,
        timestamp: Date.now()
      });
    }

    return this.getPlaybackPosition();
  }

  // Seek to specific request
  seekTo(index) {
    if (!this.playbackState) {
      return null;
    }

    if (index >= 0 && index < this.playbackState.session.requests.length) {
      this.playbackState.currentIndex = index;
      this.playbackState.history.push({
        action: 'seek',
        index: index,
        timestamp: Date.now()
      });
    }

    return this.getPlaybackPosition();
  }

  // Set playback speed
  setPlaybackSpeed(speed) {
    if (!this.playbackState) {
      return false;
    }

    this.playbackState.speed = speed;
    return true;
  }

  // Modify a response during playback
  modifyResponse(requestId, newResponse) {
    if (!this.playbackState) {
      return false;
    }

    this.playbackState.modifications.set(requestId, newResponse);
    
    // Also mark the original request as modified
    const request = this.playbackState.session.requests.find(r => r.id === requestId);
    if (request) {
      request.modified = true;
      request.modifiedResponse = newResponse;
    }

    console.log('[RECORDER] Modified response for request:', requestId);
    return true;
  }

  // Get response for a request during playback (with modifications applied)
  getPlaybackResponse(requestId) {
    if (!this.playbackState) {
      return null;
    }

    // Check for modifications first
    if (this.playbackState.modifications.has(requestId)) {
      return {
        response: this.playbackState.modifications.get(requestId),
        modified: true
      };
    }

    // Return original response
    const request = this.playbackState.session.requests.find(r => r.id === requestId);
    if (request) {
      return {
        response: request.response,
        status: request.responseStatus,
        headers: request.responseHeaders,
        modified: false
      };
    }

    return null;
  }

  // Stop playback
  stopPlayback() {
    if (!this.playbackState) {
      return false;
    }

    console.log('[RECORDER] Stopped playback of session:', this.playbackState.sessionId);
    this.playbackState = null;
    return true;
  }

  // Check if in playback mode
  isInPlaybackMode() {
    return this.playbackState !== null;
  }

  // Get matching recorded response for an incoming request
  findMatchingRecordedResponse(requestData) {
    if (!this.playbackState) {
      return null;
    }

    const session = this.playbackState.session;
    
    // Find matching request by operation name (GraphQL) or endpoint (REST)
    const matchingRequest = session.requests.find(r => {
      if (requestData.requestType === 'graphql' && r.requestType === 'graphql') {
        return r.operationName === requestData.operationName && r.url === requestData.url;
      } else if (requestData.requestType === 'rest' && r.requestType === 'rest') {
        return r.method === requestData.method && r.path === requestData.path;
      }
      return false;
    });

    if (matchingRequest) {
      // Check for modifications
      if (this.playbackState.modifications.has(matchingRequest.id)) {
        return {
          response: this.playbackState.modifications.get(matchingRequest.id),
          status: matchingRequest.responseStatus,
          modified: true
        };
      }

      return {
        response: matchingRequest.response,
        status: matchingRequest.responseStatus,
        headers: matchingRequest.responseHeaders,
        modified: false
      };
    }

    return null;
  }

  // Export all data for persistence
  exportAll() {
    return {
      sessions: this.sessions,
      currentSession: this.currentSession,
      isRecording: this.isRecording,
      isPaused: this.isPaused
    };
  }

  // Import data from persistence
  importAll(data) {
    if (data.sessions) {
      this.sessions = data.sessions;
    }
    if (data.currentSession && data.isRecording) {
      this.currentSession = data.currentSession;
      this.isRecording = data.isRecording;
      this.isPaused = data.isPaused || false;
    }
  }

  // Clear all sessions
  clearAll() {
    this.sessions = [];
    this.currentSession = null;
    this.isRecording = false;
    this.isPaused = false;
    this.playbackState = null;
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.SessionRecorder = SessionRecorder;
}

