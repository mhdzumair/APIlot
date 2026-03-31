import * as React from 'react';
import { useEffect, useRef, useCallback } from 'react';
import Chart from 'chart.js/auto';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { sendMsg } from '@/lib/messaging';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import type { PerformanceMetrics, PerformanceRecommendation } from '@/services/PerformanceTracker';

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

  useEffect(() => {
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

export function AnalyticsDashboard() {
  const { metrics, setMetrics } = useAnalyticsStore();

  const loadMetrics = useCallback(async () => {
    try {
      const response = await sendMsg({ type: 'GET_PERFORMANCE_METRICS' });
      if (response?.success) {
        // The background returns PerformanceData; we map it to PerformanceMetrics shape
        // by treating the aggregates fields as metrics summary
        const data = response.metrics;
        const aggr = data.aggregates;
        const total = aggr.totalRequests;
        const successRate = total > 0 ? Math.round((aggr.successCount / total) * 100) : 100;
        const errorRate = total > 0 ? Math.round((aggr.errorCount / total) * 100) : 0;
        const avgResponseTime =
          total > 0 ? Math.round(aggr.totalResponseTime / total) : 0;

        // Build a PerformanceMetrics-compatible object from PerformanceData
        const mapped: PerformanceMetrics = {
          avgResponseTime,
          minResponseTime: 0,
          maxResponseTime: 0,
          totalRequests: total,
          successRate,
          errorRate,
          requestsPerMinute: 0,
          slowestRequests: [],
          requestsByType: { graphql: 0, rest: 0 },
          requestsByStatus: {},
          timeSeriesData: [],
          activeRequests: 0,
        };
        setMetrics(mapped);
      }
    } catch (err) {
      console.error('[AnalyticsDashboard] Failed to load metrics:', err);
    }
  }, [setMetrics]);

  useEffect(() => {
    loadMetrics();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearData = useCallback(async () => {
    try {
      await sendMsg({ type: 'CLEAR_PERFORMANCE_DATA' });
      setMetrics(null);
    } catch (err) {
      console.error('[AnalyticsDashboard] Failed to clear data:', err);
    }
  }, [setMetrics]);

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
          <p className="text-xs text-muted-foreground">API performance metrics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadMetrics} className="h-7 text-xs">
            Refresh
          </Button>
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

      {/* Chart */}
      {metrics && <ResponseTimeChart metrics={metrics} />}

      {/* Slowest endpoints */}
      {metrics && metrics.slowestRequests.length > 0 && (
        <div className="rounded-md border shrink-0">
          <div className="px-3 py-2 border-b bg-muted/30">
            <div className="text-xs font-medium">Slowest Endpoints</div>
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
