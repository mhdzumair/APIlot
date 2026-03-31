// Performance Tracking Service for APIlot
// Tracks and analyzes API request performance metrics

class PerformanceTracker {
  constructor() {
    this.requests = [];
    this.maxEntries = 1000;
    this.aggregates = {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      graphqlCount: 0,
      restCount: 0
    };
    this.activeRequests = new Map();
  }

  // Start tracking a request
  startRequest(requestId, requestData) {
    const entry = {
      id: requestId,
      startTime: Date.now(),
      timestamp: new Date().toISOString(),
      requestType: requestData.requestType || 'graphql',
      url: requestData.url,
      operationName: requestData.operationName,
      method: requestData.method || 'POST',
      endpoint: requestData.endpoint,
      path: requestData.path,
      status: 'pending'
    };

    this.activeRequests.set(requestId, entry);
    return entry;
  }

  // Complete a request with response data
  completeRequest(requestId, responseData) {
    const activeEntry = this.activeRequests.get(requestId);
    
    if (!activeEntry) {
      console.warn(`[PERF] No active request found for ${requestId}`);
      return null;
    }

    const endTime = Date.now();
    const responseTime = endTime - activeEntry.startTime;
    
    // Get HTTP status from various possible field names
    const httpStatus = responseData.status || responseData.responseStatus || responseData.httpStatus;
    // Determine success: 2xx/3xx status codes, or if no error present
    const success = httpStatus ? (httpStatus >= 200 && httpStatus < 400) : !responseData.error && !responseData.responseError;

    const completedEntry = {
      ...activeEntry,
      endTime,
      responseTime,
      status: success ? 'success' : 'error',
      httpStatus: httpStatus,
      httpStatusText: responseData.statusText || responseData.responseStatusText,
      responseSize: responseData.response ? JSON.stringify(responseData.response).length : 0,
      error: responseData.error || responseData.responseError
    };

    // Remove from active and add to completed
    this.activeRequests.delete(requestId);
    this.addEntry(completedEntry);

    return completedEntry;
  }

  // Add a completed entry to the tracker
  addEntry(entry) {
    // Enforce max entries limit
    if (this.requests.length >= this.maxEntries) {
      const removed = this.requests.shift();
      // Adjust aggregates for removed entry
      this.aggregates.totalRequests--;
      if (removed.status === 'success') {
        this.aggregates.successCount--;
      } else {
        this.aggregates.errorCount--;
      }
      this.aggregates.totalResponseTime -= removed.responseTime || 0;
      if (removed.requestType === 'graphql') {
        this.aggregates.graphqlCount--;
      } else {
        this.aggregates.restCount--;
      }
    }

    this.requests.push(entry);

    // Update aggregates
    this.aggregates.totalRequests++;
    if (entry.status === 'success') {
      this.aggregates.successCount++;
    } else {
      this.aggregates.errorCount++;
    }
    this.aggregates.totalResponseTime += entry.responseTime || 0;
    if (entry.requestType === 'graphql') {
      this.aggregates.graphqlCount++;
    } else {
      this.aggregates.restCount++;
    }
  }

  // Get metrics for a specific time range
  getMetrics(timeRange = 'all') {
    let filteredRequests = this.requests;
    
    // Filter by time range
    if (timeRange !== 'all') {
      const now = Date.now();
      let cutoff;
      
      switch (timeRange) {
        case 'hour':
          cutoff = now - 3600000; // 1 hour
          break;
        case 'day':
          cutoff = now - 86400000; // 24 hours
          break;
        case 'week':
          cutoff = now - 604800000; // 7 days
          break;
        default:
          cutoff = 0;
      }
      
      filteredRequests = this.requests.filter(r => r.startTime > cutoff);
    }

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
        activeRequests: this.activeRequests.size
      };
    }

    // Calculate metrics
    const responseTimes = filteredRequests.map(r => r.responseTime || 0);
    const totalResponseTime = responseTimes.reduce((sum, t) => sum + t, 0);
    const successCount = filteredRequests.filter(r => r.status === 'success').length;
    
    // Get slowest requests
    const slowestRequests = [...filteredRequests]
      .sort((a, b) => (b.responseTime || 0) - (a.responseTime || 0))
      .slice(0, 5)
      .map(r => ({
        id: r.id,
        requestType: r.requestType,
        operationName: r.operationName || r.endpoint,
        url: r.url,
        responseTime: r.responseTime,
        status: r.status,
        httpStatus: r.httpStatus,
        timestamp: r.timestamp
      }));

    // Count by type
    const requestsByType = {
      graphql: filteredRequests.filter(r => r.requestType === 'graphql').length,
      rest: filteredRequests.filter(r => r.requestType === 'rest').length
    };

    // Count by HTTP status
    const requestsByStatus = {};
    filteredRequests.forEach(r => {
      const status = r.httpStatus || 'unknown';
      requestsByStatus[status] = (requestsByStatus[status] || 0) + 1;
    });

    // Generate time series data for charts (last 50 points)
    const timeSeriesData = filteredRequests
      .slice(-50)
      .map(r => ({
        timestamp: r.timestamp,
        responseTime: r.responseTime,
        status: r.status,
        requestType: r.requestType
      }));

    // Calculate requests per minute
    const timeSpan = filteredRequests.length > 1 
      ? (filteredRequests[filteredRequests.length - 1].startTime - filteredRequests[0].startTime) / 60000
      : 1;
    const requestsPerMinute = timeSpan > 0 ? Math.round(filteredRequests.length / timeSpan * 10) / 10 : 0;

    return {
      avgResponseTime: Math.round(totalResponseTime / filteredRequests.length),
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      totalRequests: filteredRequests.length,
      successRate: Math.round((successCount / filteredRequests.length) * 100),
      errorRate: Math.round(((filteredRequests.length - successCount) / filteredRequests.length) * 100),
      requestsPerMinute,
      slowestRequests,
      requestsByType,
      requestsByStatus,
      timeSeriesData,
      activeRequests: this.activeRequests.size
    };
  }

  // Get performance recommendations based on collected data
  getRecommendations() {
    const recommendations = [];
    const metrics = this.getMetrics('day');

    if (metrics.totalRequests === 0) {
      return [{
        type: 'info',
        title: 'No Data Yet',
        message: 'Start monitoring API requests to receive performance recommendations.'
      }];
    }

    // Check for slow average response time
    if (metrics.avgResponseTime > 2000) {
      recommendations.push({
        type: 'warning',
        title: 'Slow Average Response Time',
        message: `Average response time is ${metrics.avgResponseTime}ms. Consider optimizing slow endpoints or implementing caching.`
      });
    } else if (metrics.avgResponseTime > 1000) {
      recommendations.push({
        type: 'info',
        title: 'Moderate Response Time',
        message: `Average response time is ${metrics.avgResponseTime}ms. There may be room for optimization.`
      });
    }

    // Check for high error rate
    if (metrics.errorRate > 10) {
      recommendations.push({
        type: 'error',
        title: 'High Error Rate',
        message: `${metrics.errorRate}% of requests are failing. Investigate error patterns and fix underlying issues.`
      });
    } else if (metrics.errorRate > 5) {
      recommendations.push({
        type: 'warning',
        title: 'Elevated Error Rate',
        message: `${metrics.errorRate}% error rate detected. Monitor for patterns.`
      });
    }

    // Check for consistently slow endpoints
    if (metrics.slowestRequests.length > 0) {
      const slowEndpoints = metrics.slowestRequests.filter(r => r.responseTime > 3000);
      if (slowEndpoints.length > 0) {
        const endpointNames = [...new Set(slowEndpoints.map(r => r.operationName || r.url))].slice(0, 3);
        recommendations.push({
          type: 'warning',
          title: 'Slow Endpoints Detected',
          message: `These endpoints consistently take >3s: ${endpointNames.join(', ')}. Consider optimization.`
        });
      }
    }

    // Check for N+1 patterns (many similar requests in short time)
    const recentRequests = this.requests.slice(-100);
    const operationCounts = {};
    recentRequests.forEach(r => {
      const key = r.operationName || r.endpoint || r.url;
      operationCounts[key] = (operationCounts[key] || 0) + 1;
    });
    
    const frequentOps = Object.entries(operationCounts)
      .filter(([_, count]) => count > 10)
      .map(([name]) => name);
    
    if (frequentOps.length > 0) {
      recommendations.push({
        type: 'info',
        title: 'Potential N+1 Pattern',
        message: `High frequency of similar requests detected for: ${frequentOps.slice(0, 2).join(', ')}. Consider batching.`
      });
    }

    // Check for large payloads
    const largeResponses = this.requests.filter(r => r.responseSize > 100000);
    if (largeResponses.length > 5) {
      recommendations.push({
        type: 'info',
        title: 'Large Response Payloads',
        message: 'Some responses exceed 100KB. Consider pagination or field selection to reduce payload size.'
      });
    }

    // Success message if everything looks good
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        title: 'Performance Looking Good',
        message: 'No significant performance issues detected. Keep monitoring for changes.'
      });
    }

    return recommendations;
  }

  // Clear all data
  clear() {
    this.requests = [];
    this.activeRequests.clear();
    this.aggregates = {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      graphqlCount: 0,
      restCount: 0
    };
  }

  // Export data for persistence
  export() {
    return {
      requests: this.requests,
      aggregates: this.aggregates
    };
  }

  // Import data from persistence
  import(data) {
    if (data.requests) {
      this.requests = data.requests;
    }
    if (data.aggregates) {
      this.aggregates = data.aggregates;
    }
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.PerformanceTracker = PerformanceTracker;
}

