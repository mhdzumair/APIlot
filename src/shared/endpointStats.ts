import type { LogEntry } from '@/types/requests';
import type { EndpointStat, RequestType } from '@/services/PerformanceTracker';

function stripQuery(url: string): string {
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  const end = q >= 0 && h >= 0 ? Math.min(q, h) : q >= 0 ? q : h >= 0 ? h : -1;
  return end >= 0 ? url.slice(0, end) : url;
}

function pathFromUrl(url: string): string {
  try {
    return new URL(url, 'https://apilot.local').pathname || '/';
  } catch {
    const s = stripQuery(url);
    if (s.startsWith('/')) return s;
    return s ? `/${s}` : '/';
  }
}

/** Same success/error semantics as AnalyticsDashboard computeMetrics. */
export function isLogEntryError(e: LogEntry): boolean {
  return (
    !!e.responseError ||
    (e.responseStatus !== undefined && e.responseStatus >= 400)
  );
}

export interface GroupMeta {
  groupKey: string;
  displayName: string;
  requestType: RequestType;
}

export function getEndpointGroupMeta(e: LogEntry): GroupMeta {
  if (e.requestType === 'graphql') {
    const op = e.operationName?.trim();
    if (op) {
      return {
        groupKey: `graphql:${op}`,
        displayName: op,
        requestType: 'graphql',
      };
    }
    const path = pathFromUrl(e.url || '');
    return {
      groupKey: `graphql:${path}`,
      displayName: path || e.url || 'Unknown',
      requestType: 'graphql',
    };
  }

  if (e.requestType === 'rest') {
    const method = (e.method || 'GET').toUpperCase();
    const path =
      (e.path && e.path.trim()) ||
      pathFromUrl(e.url || '') ||
      stripQuery(e.url || '') ||
      '/';
    return {
      groupKey: `rest:${method}:${path}`,
      displayName: `${method} ${path}`,
      requestType: 'rest',
    };
  }

  // static / other: group by URL path only
  const path = pathFromUrl(e.url || '') || e.url || 'unknown';
  return {
    groupKey: `static:${path}`,
    displayName: path,
    requestType: 'rest',
  };
}

function percentileNearestRank(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const k = Math.ceil((p / 100) * n) - 1;
  return sortedAsc[Math.max(0, Math.min(n - 1, k))];
}

type MutableGroup = {
  meta: GroupMeta;
  times: number[];
  successCount: number;
  errorCount: number;
};

/**
 * Build per-endpoint aggregates from completed log entries (with responseTime).
 */
export function buildEndpointStats(requestLog: LogEntry[]): EndpointStat[] {
  const completed = requestLog.filter(
    (e) => e.responseTime !== undefined && e.responseTime >= 0,
  );

  const totalSumAll = completed.reduce((s, e) => s + (e.responseTime ?? 0), 0);

  const map = new Map<string, MutableGroup>();

  for (const e of completed) {
    const meta = getEndpointGroupMeta(e);

    let g = map.get(meta.groupKey);
    if (!g) {
      g = { meta, times: [], successCount: 0, errorCount: 0 };
      map.set(meta.groupKey, g);
    }
    g.times.push(e.responseTime!);
    if (isLogEntryError(e)) {
      g.errorCount++;
    } else {
      g.successCount++;
    }
  }

  const stats: EndpointStat[] = [];

  for (const g of map.values()) {
    const times = [...g.times].sort((a, b) => a - b);
    const count = times.length;
    const sumMs = times.reduce((a, b) => a + b, 0);
    const avgMs = count > 0 ? Math.round(sumMs / count) : 0;
    const minMs = count > 0 ? times[0] : 0;
    const maxMs = count > 0 ? times[times.length - 1] : 0;
    const p50Ms = percentileNearestRank(times, 50);
    const p95Ms = percentileNearestRank(times, 95);

    stats.push({
      groupKey: g.meta.groupKey,
      displayName: g.meta.displayName,
      requestType: g.meta.requestType,
      count,
      successCount: g.successCount,
      errorCount: g.errorCount,
      avgMs,
      minMs,
      maxMs,
      p50Ms,
      p95Ms,
      sumMs,
      percentOfTotalTime:
        totalSumAll > 0 ? Math.round((sumMs / totalSumAll) * 1000) / 10 : 0,
    });
  }

  return stats.sort((a, b) => b.sumMs - a.sumMs);
}
