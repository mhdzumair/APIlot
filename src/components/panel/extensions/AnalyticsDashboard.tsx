import * as React from 'react';
import { useRef, useCallback, useMemo, useState } from 'react';
import Chart from 'chart.js/auto';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMonitorStore } from '@/stores/useMonitorStore';
import type { LogEntry } from '@/types/requests';
import type {
  EndpointStat,
  PerformanceMetrics,
  PerformanceRecommendation,
  SlowRequest,
  TimeSeriesPoint,
} from '@/services/PerformanceTracker';
import { buildEndpointStats } from '@/shared/endpointStats';

function recommendationBadgeClass(type: PerformanceRecommendation['type']): string {
  switch (type) {
    case 'error':
      return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30';
    case 'warning':
      return 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
    case 'success':
      return 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30';
    default:
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30';
  }
}

interface SummaryCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'default' | 'success' | 'error' | 'warning';
}

function SummaryCard({ label, value, sub, accent = 'default' }: SummaryCardProps) {
  const accentClass = {
    default: 'text-foreground',
    success: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
  }[accent];

  return (
    <div className="rounded-md border bg-card px-4 py-3 space-y-0.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${accentClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ResponseTimeChart({ metrics }: { metrics: PerformanceMetrics }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  React.useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const labels = metrics.timeSeriesData.map((p) =>
      new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    const data = metrics.timeSeriesData.map((p) => p.responseTime);
    const colors = metrics.timeSeriesData.map((p) =>
      p.status === 'error' ? 'rgba(239,68,68,0.8)' : 'rgba(59,130,246,0.8)'
    );

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Response Time (ms)',
            data,
            backgroundColor: colors,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `${item.formattedValue} ms`,
            },
          },
        },
        scales: {
          x: {
            display: false,
          },
          y: {
            ticks: {
              font: { size: 10 },
              callback: (v) => `${v}ms`,
            },
            grid: { color: 'rgba(128,128,128,0.1)' },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [metrics.timeSeriesData]);

  if (metrics.timeSeriesData.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-muted-foreground border rounded-md">
        No time series data yet
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3">
      <div className="text-xs font-medium mb-2">Response Time History</div>
      <div style={{ height: '120px' }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

const ENDPOINT_SORT_KEYS = [
  'displayName',
  'requestType',
  'count',
  'avgMs',
  'minMs',
  'maxMs',
  'p50Ms',
  'p95Ms',
  'sumMs',
  'percentOfTotalTime',
] as const;

type EndpointSortKey = (typeof ENDPOINT_SORT_KEYS)[number];

function sortEndpointStats(
  stats: EndpointStat[],
  key: EndpointSortKey,
  dir: 'asc' | 'desc',
): EndpointStat[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...stats].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (typeof va === 'string' && typeof vb === 'string') {
      return m * va.localeCompare(vb);
    }
    return m * ((Number(va) || 0) - (Number(vb) || 0));
  });
}

function EndpointBreakdownTable({ stats }: { stats: EndpointStat[] }) {
  const [sortKey, setSortKey] = useState<EndpointSortKey>('sumMs');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(
    () => sortEndpointStats(stats, sortKey, sortDir),
    [stats, sortKey, sortDir],
  );

  const onHeaderClick = (k: EndpointSortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir(k === 'displayName' ? 'asc' : 'desc');
    }
  };

  const headerLabel = (k: EndpointSortKey) => {
    const labels: Record<EndpointSortKey, string> = {
      displayName: 'Name',
      requestType: 'Type',
      count: 'Count',
      avgMs: 'Avg',
      minMs: 'Min',
      maxMs: 'Max',
      p50Ms: 'P50',
      p95Ms: 'P95',
      sumMs: 'Total',
      percentOfTotalTime: '% time',
    };
    return labels[k];
  };

  const sortIndicator = (k: EndpointSortKey) =>
    sortKey === k ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : '';

  if (stats.length === 0) {
    return (
      <div className="rounded-md border flex items-center justify-center min-h-[72px] px-3 text-xs text-muted-foreground">
        No completed requests with timing yet — trigger API calls while monitoring is on.
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-[10px] text-left border-collapse">
        <thead>
          <tr className="border-b bg-muted/30">
            {ENDPOINT_SORT_KEYS.map((k) => (
              <th key={k} className="px-2 py-1.5 font-medium whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onHeaderClick(k)}
                  className="inline-flex items-center gap-0.5 hover:text-foreground text-muted-foreground"
                >
                  {headerLabel(k)}
                  <span className="text-[9px] opacity-70 tabular-nums">{sortIndicator(k)}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((row) => (
            <tr key={row.groupKey} className="hover:bg-muted/20">
              <td className="px-2 py-1.5 max-w-[140px] truncate" title={row.displayName}>
                {row.displayName}
              </td>
              <td className="px-2 py-1.5">
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 py-0 shrink-0 ${
                    row.requestType === 'graphql'
                      ? 'border-pink-500/40 text-pink-600'
                      : 'border-blue-500/40 text-blue-600'
                  }`}
                >
                  {row.requestType.toUpperCase()}
                </Badge>
              </td>
              <td className="px-2 py-1.5 tabular-nums">{row.count}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.avgMs}ms</td>
              <td className="px-2 py-1.5 tabular-nums">{row.minMs}ms</td>
              <td className="px-2 py-1.5 tabular-nums">{row.maxMs}ms</td>
              <td className="px-2 py-1.5 tabular-nums">{row.p50Ms}ms</td>
              <td className="px-2 py-1.5 tabular-nums">{row.p95Ms}ms</td>
              <td className="px-2 py-1.5 tabular-nums">{row.sumMs}ms</td>
              <td className="px-2 py-1.5 tabular-nums">{row.percentOfTotalTime}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Derive PerformanceMetrics from the live monitor request log
function computeMetrics(requestLog: LogEntry[]): PerformanceMetrics | null {
  if (requestLog.length === 0) return null;

  const completed = requestLog.filter(
    (e) => e.responseTime !== undefined || e.responseError !== undefined
  );

  const responseTimes = completed
    .map((e) => e.responseTime)
    .filter((t): t is number => t !== undefined);

  const isError = (e: LogEntry) =>
    !!e.responseError || (e.responseStatus !== undefined && e.responseStatus >= 400);

  const successCount = completed.filter((e) => !isError(e)).length;
  const errorCount = completed.length - successCount;

  const totalResponseTime = responseTimes.reduce((a, b) => a + b, 0);
  const avgResponseTime =
    responseTimes.length > 0 ? Math.round(totalResponseTime / responseTimes.length) : 0;

  const slowestRequests: SlowRequest[] = [...completed]
    .filter((e) => e.responseTime !== undefined)
    .sort((a, b) => (b.responseTime ?? 0) - (a.responseTime ?? 0))
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      requestType: e.requestType,
      operationName: e.operationName ?? e.endpoint,
      url: e.url,
      responseTime: e.responseTime!,
      status: isError(e) ? 'error' : 'success',
      httpStatus: e.responseStatus,
      timestamp: e.timestamp,
    }));

  const timeSeriesData: TimeSeriesPoint[] = completed
    .filter((e) => e.responseTime !== undefined)
    .slice(-50)
    .map((e) => ({
      timestamp: new Date(e.endTime ?? e.startTime).toISOString(),
      responseTime: e.responseTime!,
      status: isError(e) ? 'error' : 'success',
      requestType: e.requestType,
    }));

  const requestsByStatus: Record<string | number, number> = {};
  for (const e of completed) {
    const key = e.responseStatus ?? 'unknown';
    requestsByStatus[key] = (requestsByStatus[key] ?? 0) + 1;
  }

  const timeSpan =
    requestLog.length > 1
      ? (requestLog[requestLog.length - 1].startTime - requestLog[0].startTime) / 60_000
      : 1;
  const requestsPerMinute =
    timeSpan > 0 ? Math.round((requestLog.length / timeSpan) * 10) / 10 : 0;

  const activeRequests = requestLog.filter(
    (e) => e.responseTime === undefined && !e.responseError
  ).length;

  const endpointStats = buildEndpointStats(requestLog);

  return {
    avgResponseTime,
    minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
    maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
    totalRequests: requestLog.length,
    successRate:
      completed.length > 0 ? Math.round((successCount / completed.length) * 100) : 100,
    errorRate:
      completed.length > 0 ? Math.round((errorCount / completed.length) * 100) : 0,
    requestsPerMinute,
    slowestRequests,
    endpointStats,
    requestsByType: {
      graphql: requestLog.filter((e) => e.requestType === 'graphql').length,
      rest: requestLog.filter((e) => e.requestType === 'rest').length,
    },
    requestsByStatus,
    timeSeriesData,
    activeRequests,
  };
}

export function AnalyticsDashboard() {
  const requestLog = useMonitorStore((s) => s.requestLog);
  const clearLog = useMonitorStore((s) => s.clearLog);

  const metrics = React.useMemo(() => computeMetrics(requestLog), [requestLog]);

  const handleClearData = useCallback(() => {
    clearLog();
  }, [clearLog]);

  const handleExport = useCallback(() => {
    if (!metrics) return;
    const blob = new Blob([JSON.stringify(metrics, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apilot-analytics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [metrics]);

  // Build recommendations from metrics
  const recommendations: PerformanceRecommendation[] = React.useMemo(() => {
    if (!metrics || metrics.totalRequests === 0) {
      return [{ type: 'info', title: 'No Data Yet', message: 'Start monitoring API requests to see analytics.' }];
    }
    const recs: PerformanceRecommendation[] = [];
    if (metrics.avgResponseTime > 2000) {
      recs.push({ type: 'warning', title: 'Slow Average Response Time', message: `Avg ${metrics.avgResponseTime}ms — consider caching or optimization.` });
    }
    if (metrics.errorRate > 10) {
      recs.push({ type: 'error', title: 'High Error Rate', message: `${metrics.errorRate}% of requests are failing.` });
    }
    if (recs.length === 0) {
      recs.push({ type: 'success', title: 'Performance Looking Good', message: 'No significant issues detected.' });
    }
    return recs;
  }, [metrics]);

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-semibold">Analytics</h2>
          <p className="text-xs text-muted-foreground">
            Metrics reflect the current capture in this tab (since last Clear or reload). Use Clear to
            start a fresh profiling run.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!metrics} className="h-7 text-xs">
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearData} className="h-7 text-xs text-red-600 dark:text-red-400">
            Clear
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 shrink-0">
        <SummaryCard
          label="Total Requests"
          value={metrics?.totalRequests ?? 0}
        />
        <SummaryCard
          label="Success Rate"
          value={`${metrics?.successRate ?? 100}%`}
          accent={
            (metrics?.successRate ?? 100) >= 95
              ? 'success'
              : (metrics?.successRate ?? 100) >= 80
              ? 'warning'
              : 'error'
          }
        />
        <SummaryCard
          label="Avg Response"
          value={metrics ? `${metrics.avgResponseTime}ms` : '—'}
          accent={
            !metrics
              ? 'default'
              : metrics.avgResponseTime > 2000
              ? 'error'
              : metrics.avgResponseTime > 1000
              ? 'warning'
              : 'success'
          }
        />
        <SummaryCard
          label="Errors"
          value={metrics ? Math.round((metrics.errorRate / 100) * metrics.totalRequests) : 0}
          accent={metrics && metrics.errorRate > 5 ? 'error' : 'default'}
        />
      </div>

      {/* Endpoint breakdown (aggregated across repeated calls) */}
      {metrics && (
        <div className="rounded-md border shrink-0">
          <div className="px-3 py-2 border-b bg-muted/30">
            <div className="text-xs font-medium">Endpoint breakdown</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Rolled up by operation or REST route; totals sum response time across calls.
            </div>
          </div>
          <div className="p-2">
            <EndpointBreakdownTable stats={metrics.endpointStats} />
          </div>
        </div>
      )}

      {/* Chart */}
      {metrics && <ResponseTimeChart metrics={metrics} />}

      {/* Slowest single requests */}
      {metrics && metrics.slowestRequests.length > 0 && (
        <div className="rounded-md border shrink-0">
          <div className="px-3 py-2 border-b bg-muted/30">
            <div className="text-xs font-medium">Slowest single requests</div>
          </div>
          <div className="divide-y">
            {metrics.slowestRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1 py-0 shrink-0 ${
                      req.requestType === 'graphql'
                        ? 'border-pink-500/40 text-pink-600'
                        : 'border-blue-500/40 text-blue-600'
                    }`}
                  >
                    {req.requestType.toUpperCase()}
                  </Badge>
                  <span className="truncate text-muted-foreground">
                    {req.operationName ?? req.url ?? 'Unknown'}
                  </span>
                </div>
                <span
                  className={`tabular-nums shrink-0 font-medium ${
                    req.responseTime > 3000
                      ? 'text-red-600 dark:text-red-400'
                      : req.responseTime > 1000
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-foreground'
                  }`}
                >
                  {req.responseTime}ms
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="rounded-md border shrink-0">
        <div className="px-3 py-2 border-b bg-muted/30">
          <div className="text-xs font-medium">Recommendations</div>
        </div>
        <div className="divide-y">
          {recommendations.map((rec, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2">
              <span
                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-medium shrink-0 mt-0.5 ${recommendationBadgeClass(rec.type)}`}
              >
                {rec.type}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium">{rec.title}</div>
                <div className="text-[10px] text-muted-foreground">{rec.message}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
