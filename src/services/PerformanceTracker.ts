// Performance Tracking Service for APIlot
// Tracks and analyzes API request performance metrics

export type RequestType = 'graphql' | 'rest';
export type RequestStatus = 'pending' | 'success' | 'error';

export interface RequestData {
  requestType?: RequestType;
  url?: string;
  operationName?: string;
  method?: string;
  endpoint?: string;
  path?: string;
}

export interface ResponseData {
  status?: number;
  responseStatus?: number;
  httpStatus?: number;
  statusText?: string;
  responseStatusText?: string;
  response?: unknown;
  error?: string;
  responseError?: string;
}

export interface ActiveEntry {
  id: string;
  startTime: number;
  timestamp: string;
  requestType: RequestType;
  url?: string;
  operationName?: string;
  method: string;
  endpoint?: string;
  path?: string;
  status: 'pending';
}

export interface CompletedEntry extends Omit<ActiveEntry, 'status'> {
  endTime: number;
  responseTime: number;
  status: 'success' | 'error';
  httpStatus?: number;
  httpStatusText?: string;
  responseSize: number;
  error?: string;
}

export interface SlowRequest {
  id: string;
  requestType: RequestType;
  operationName?: string;
  url?: string;
  responseTime: number;
  status: 'success' | 'error';
  httpStatus?: number;
  timestamp: string;
}

/** Rolled-up stats for one logical endpoint / operation across multiple captured requests. */
export interface EndpointStat {
  /** Stable grouping key (not for display). */
  groupKey: string;
  /** Human-readable label (operation name or METHOD path). */
  displayName: string;
  requestType: RequestType;
  count: number;
  successCount: number;
  errorCount: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  /** Sum of response times in this group (ms). */
  sumMs: number;
  /** Share of total response time across all completed requests (0–100). */
  percentOfTotalTime: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  responseTime: number;
  status: 'success' | 'error';
  requestType: RequestType;
}

export interface PerformanceMetrics {
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  totalRequests: number;
  successRate: number;
  errorRate: number;
  requestsPerMinute: number;
  slowestRequests: SlowRequest[];
  /** Per-endpoint / per-operation aggregates for page profiling. */
  endpointStats: EndpointStat[];
  requestsByType: { graphql: number; rest: number };
  requestsByStatus: Record<string | number, number>;
  timeSeriesData: TimeSeriesPoint[];
  activeRequests: number;
}

export interface PerformanceAggregates {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  totalResponseTime: number;
  graphqlCount: number;
  restCount: number;
}

export interface PerformanceRecommendation {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
}

export interface PerformanceExport {
  requests: CompletedEntry[];
  aggregates: PerformanceAggregates;
}

type TimeRange = 'all' | 'hour' | 'day' | 'week';

export class PerformanceTracker {
  private requests: CompletedEntry[] = [];
  private readonly maxEntries: number = 1000;
  private aggregates: PerformanceAggregates = {
    totalRequests: 0,
    successCount: 0,
    errorCount: 0,
    totalResponseTime: 0,
    graphqlCount: 0,
    restCount: 0,
  };
  private readonly activeRequests: Map<string, ActiveEntry> = new Map();

  // Start tracking a request
  startRequest(requestId: string, requestData: RequestData): ActiveEntry {
    const entry: ActiveEntry = {
      id: requestId,
      startTime: Date.now(),
      timestamp: new Date().toISOString(),
      requestType: requestData.requestType ?? 'graphql',
      url: requestData.url,
      operationName: requestData.operationName,
      method: requestData.method ?? 'POST',
      endpoint: requestData.endpoint,
      path: requestData.path,
      status: 'pending',
    };

    this.activeRequests.set(requestId, entry);
    return entry;
  }

  // Complete a request with response data
  completeRequest(requestId: string, responseData: ResponseData): CompletedEntry | null {
    const activeEntry = this.activeRequests.get(requestId);

    if (!activeEntry) {
      console.warn(`[PERF] No active request found for ${requestId}`);
      return null;
    }

    const endTime = Date.now();
    const responseTime = endTime - activeEntry.startTime;

    const httpStatus =
      responseData.status ?? responseData.responseStatus ?? responseData.httpStatus;
    const success = httpStatus
      ? httpStatus >= 200 && httpStatus < 400
      : !responseData.error && !responseData.responseError;

    const completedEntry: CompletedEntry = {
      ...activeEntry,
      endTime,
      responseTime,
      status: success ? 'success' : 'error',
      httpStatus,
      httpStatusText: responseData.statusText ?? responseData.responseStatusText,
      responseSize: responseData.response
        ? JSON.stringify(responseData.response).length
        : 0,
      error: responseData.error ?? responseData.responseError,
    };

    this.activeRequests.delete(requestId);
    this.addEntry(completedEntry);

    return completedEntry;
  }

  // Add a completed entry to the tracker
  addEntry(entry: CompletedEntry): void {
    if (this.requests.length >= this.maxEntries) {
      const removed = this.requests.shift();
      if (removed) {
        this.aggregates.totalRequests--;
        if (removed.status === 'success') {
          this.aggregates.successCount--;
        } else {
          this.aggregates.errorCount--;
        }
        this.aggregates.totalResponseTime -= removed.responseTime ?? 0;
        if (removed.requestType === 'graphql') {
          this.aggregates.graphqlCount--;
        } else {
          this.aggregates.restCount--;
        }
      }
    }

    this.requests.push(entry);

    this.aggregates.totalRequests++;
    if (entry.status === 'success') {
      this.aggregates.successCount++;
    } else {
      this.aggregates.errorCount++;
    }
    this.aggregates.totalResponseTime += entry.responseTime ?? 0;
    if (entry.requestType === 'graphql') {
      this.aggregates.graphqlCount++;
    } else {
      this.aggregates.restCount++;
    }
  }

  // Get metrics for a specific time range
  getMetrics(timeRange: TimeRange = 'all'): PerformanceMetrics {
    let filteredRequests = this.requests;

    if (timeRange !== 'all') {
      const now = Date.now();
      let cutoff: number;

      switch (timeRange) {
        case 'hour':
          cutoff = now - 3_600_000;
          break;
        case 'day':
          cutoff = now - 86_400_000;
          break;
        case 'week':
          cutoff = now - 604_800_000;
          break;
        default:
          cutoff = 0;
      }

      filteredRequests = this.requests.filter((r) => r.startTime > cutoff);
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
        endpointStats: [],
        requestsByType: { graphql: 0, rest: 0 },
        requestsByStatus: {},
        timeSeriesData: [],
        activeRequests: this.activeRequests.size,
      };
    }

    const responseTimes = filteredRequests.map((r) => r.responseTime ?? 0);
    const totalResponseTime = responseTimes.reduce((sum, t) => sum + t, 0);
    const successCount = filteredRequests.filter((r) => r.status === 'success').length;

    const slowestRequests: SlowRequest[] = [...filteredRequests]
      .sort((a, b) => (b.responseTime ?? 0) - (a.responseTime ?? 0))
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        requestType: r.requestType,
        operationName: r.operationName ?? r.endpoint,
        url: r.url,
        responseTime: r.responseTime,
        status: r.status,
        httpStatus: r.httpStatus,
        timestamp: r.timestamp,
      }));

    const requestsByType = {
      graphql: filteredRequests.filter((r) => r.requestType === 'graphql').length,
      rest: filteredRequests.filter((r) => r.requestType === 'rest').length,
    };

    const requestsByStatus: Record<string | number, number> = {};
    filteredRequests.forEach((r) => {
      const status = r.httpStatus ?? 'unknown';
      requestsByStatus[status] = (requestsByStatus[status] ?? 0) + 1;
    });

    const timeSeriesData: TimeSeriesPoint[] = filteredRequests.slice(-50).map((r) => ({
      timestamp: r.timestamp,
      responseTime: r.responseTime,
      status: r.status,
      requestType: r.requestType,
    }));

    const timeSpan =
      filteredRequests.length > 1
        ? (filteredRequests[filteredRequests.length - 1].startTime -
            filteredRequests[0].startTime) /
          60000
        : 1;
    const requestsPerMinute =
      timeSpan > 0 ? Math.round((filteredRequests.length / timeSpan) * 10) / 10 : 0;

    return {
      avgResponseTime: Math.round(totalResponseTime / filteredRequests.length),
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      totalRequests: filteredRequests.length,
      successRate: Math.round((successCount / filteredRequests.length) * 100),
      errorRate: Math.round(
        ((filteredRequests.length - successCount) / filteredRequests.length) * 100
      ),
      requestsPerMinute,
      slowestRequests,
      endpointStats: [],
      requestsByType,
      requestsByStatus,
      timeSeriesData,
      activeRequests: this.activeRequests.size,
    };
  }

  // Get performance recommendations based on collected data
  getRecommendations(): PerformanceRecommendation[] {
    const recommendations: PerformanceRecommendation[] = [];
    const metrics = this.getMetrics('day');

    if (metrics.totalRequests === 0) {
      return [
        {
          type: 'info',
          title: 'No Data Yet',
          message:
            'Start monitoring API requests to receive performance recommendations.',
        },
      ];
    }

    if (metrics.avgResponseTime > 2000) {
      recommendations.push({
        type: 'warning',
        title: 'Slow Average Response Time',
        message: `Average response time is ${metrics.avgResponseTime}ms. Consider optimizing slow endpoints or implementing caching.`,
      });
    } else if (metrics.avgResponseTime > 1000) {
      recommendations.push({
        type: 'info',
        title: 'Moderate Response Time',
        message: `Average response time is ${metrics.avgResponseTime}ms. There may be room for optimization.`,
      });
    }

    if (metrics.errorRate > 10) {
      recommendations.push({
        type: 'error',
        title: 'High Error Rate',
        message: `${metrics.errorRate}% of requests are failing. Investigate error patterns and fix underlying issues.`,
      });
    } else if (metrics.errorRate > 5) {
      recommendations.push({
        type: 'warning',
        title: 'Elevated Error Rate',
        message: `${metrics.errorRate}% error rate detected. Monitor for patterns.`,
      });
    }

    if (metrics.slowestRequests.length > 0) {
      const slowEndpoints = metrics.slowestRequests.filter(
        (r) => r.responseTime > 3000
      );
      if (slowEndpoints.length > 0) {
        const endpointNames = [
          ...new Set(slowEndpoints.map((r) => r.operationName ?? r.url ?? 'unknown')),
        ].slice(0, 3);
        recommendations.push({
          type: 'warning',
          title: 'Slow Endpoints Detected',
          message: `These endpoints consistently take >3s: ${endpointNames.join(', ')}. Consider optimization.`,
        });
      }
    }

    // Check for N+1 patterns (many similar requests in short time)
    const recentRequests = this.requests.slice(-100);
    const operationCounts: Record<string, number> = {};
    recentRequests.forEach((r) => {
      const key = r.operationName ?? r.endpoint ?? r.url ?? 'unknown';
      operationCounts[key] = (operationCounts[key] ?? 0) + 1;
    });

    const frequentOps = Object.entries(operationCounts)
      .filter(([, count]) => count > 10)
      .map(([name]) => name);

    if (frequentOps.length > 0) {
      recommendations.push({
        type: 'info',
        title: 'Potential N+1 Pattern',
        message: `High frequency of similar requests detected for: ${frequentOps.slice(0, 2).join(', ')}. Consider batching.`,
      });
    }

    const largeResponses = this.requests.filter((r) => r.responseSize > 100000);
    if (largeResponses.length > 5) {
      recommendations.push({
        type: 'info',
        title: 'Large Response Payloads',
        message:
          'Some responses exceed 100KB. Consider pagination or field selection to reduce payload size.',
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        title: 'Performance Looking Good',
        message:
          'No significant performance issues detected. Keep monitoring for changes.',
      });
    }

    return recommendations;
  }

  // Clear all data
  clear(): void {
    this.requests = [];
    this.activeRequests.clear();
    this.aggregates = {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      graphqlCount: 0,
      restCount: 0,
    };
  }

  // Export data for persistence
  export(): PerformanceExport {
    return {
      requests: this.requests,
      aggregates: this.aggregates,
    };
  }

  // Import data from persistence
  import(data: Partial<PerformanceExport>): void {
    if (data.requests) {
      this.requests = data.requests;
    }
    if (data.aggregates) {
      this.aggregates = data.aggregates;
    }
  }
}
