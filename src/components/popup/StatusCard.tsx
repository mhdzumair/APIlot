import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';

export interface TabStatus {
  url: string;
  requestCount: number;
  activeRules: number;
  isMonitoring: boolean;
  enabled: boolean;
  devToolsOpen: boolean;
}

interface StatusCardProps {
  status: TabStatus | null;
  loading: boolean;
  onToggleEnabled: (enabled: boolean) => void;
}

function getStatusBadge(status: TabStatus | null): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } {
  if (!status) return { label: 'Checking…', variant: 'secondary' };
  if (status.isMonitoring) return { label: 'Monitoring active', variant: 'default' };
  if (status.enabled && !status.devToolsOpen) return { label: 'Enabled — Open DevTools', variant: 'outline' };
  const url = status.url;
  if (!status.enabled && (url.startsWith('http://') || url.startsWith('https://'))) {
    return { label: 'Ready to monitor', variant: 'secondary' };
  }
  return { label: 'Not monitoring', variant: 'secondary' };
}

function truncateUrl(url: string, maxLength = 40): string {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength) + '…';
}

export function StatusCard({ status, loading, onToggleEnabled }: StatusCardProps) {
  const badge = getStatusBadge(status);

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-3">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Current Tab</span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <Separator />

      {/* Tab URL */}
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">URL</span>
        <p
          className="text-sm font-mono truncate"
          title={status?.url ?? ''}
        >
          {loading ? 'Loading…' : status ? truncateUrl(status.url) : '—'}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <span className="text-xs text-muted-foreground">API Requests</span>
          <p className="text-lg font-semibold tabular-nums">
            {loading ? '—' : (status?.requestCount ?? 0)}
          </p>
        </div>
        <div className="space-y-0.5">
          <span className="text-xs text-muted-foreground">Active Rules</span>
          <p className="text-lg font-semibold tabular-nums">
            {loading ? '—' : (status?.activeRules ?? 0)}
          </p>
        </div>
      </div>

      <Separator />

      {/* Monitoring toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5 flex-1">
          <Label htmlFor="monitoring-toggle" className="text-sm font-medium cursor-pointer">
            API Monitoring
          </Label>
          <p className="text-xs text-muted-foreground">
            {status?.enabled
              ? status.devToolsOpen
                ? 'Monitoring active — DevTools is open'
                : 'Enabled — Open DevTools to start'
              : 'Enable to start monitoring API requests'}
          </p>
        </div>
        <Switch
          id="monitoring-toggle"
          checked={status?.enabled ?? false}
          disabled={loading}
          onCheckedChange={onToggleEnabled}
        />
      </div>

      {/* DevTools hint */}
      {status?.enabled && !status.devToolsOpen && (
        <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="mt-0.5 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <span>
            Open DevTools (F12) and navigate to the &ldquo;APIlot&rdquo; tab to start monitoring.
          </span>
        </div>
      )}
    </div>
  );
}
