import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMonitorStore } from '@/stores/useMonitorStore';
import type { LogEntry } from '@/types/requests';

interface EndpointSelectorProps {
  value: string;
  onChange: (url: string) => void;
  /** Called when a detected endpoint is selected — includes the originating request so auth can be extracted */
  onRequestSelected?: (entry: LogEntry) => void;
}

export function EndpointSelector({ value, onChange, onRequestSelected }: EndpointSelectorProps) {
  const requestLog = useMonitorStore((s) => s.requestLog);

  // Collect unique GraphQL endpoints, keeping the best entry per URL for auth extraction.
  // "Best" = has auth headers. If no entry has auth headers, fall back to most recent.
  const { detectedEndpoints, latestByUrl } = React.useMemo(() => {
    const seen = new Set<string>();
    const endpoints: string[] = [];
    const latestByUrl = new Map<string, LogEntry>(); // most recent entry per URL
    const bestByUrl = new Map<string, LogEntry>();   // entry with auth headers per URL

    const hasAuthHeaders = (entry: LogEntry) => {
      const headers = entry.requestHeaders ?? {};
      return Object.keys(headers).some((k) =>
        /^(authorization|x-api-key|api-key|apikey|x-auth-token)$/i.test(k)
      );
    };

    // Iterate newest-first
    for (let i = requestLog.length - 1; i >= 0; i--) {
      const entry = requestLog[i];
      if (entry.requestType === 'graphql' && entry.url) {
        if (!latestByUrl.has(entry.url)) latestByUrl.set(entry.url, entry);
        if (!bestByUrl.has(entry.url) && hasAuthHeaders(entry)) bestByUrl.set(entry.url, entry);
        if (!seen.has(entry.url)) {
          seen.add(entry.url);
          endpoints.unshift(entry.url);
        }
      }
    }

    // Merge: prefer the entry with auth headers; fall back to most recent
    const merged = new Map<string, LogEntry>();
    for (const url of seen) {
      merged.set(url, bestByUrl.get(url) ?? latestByUrl.get(url)!);
    }

    return { detectedEndpoints: endpoints, latestByUrl: merged };
  }, [requestLog]);

  const isManual = !detectedEndpoints.includes(value) || detectedEndpoints.length === 0;

  const handleSelectChange = (selected: string) => {
    if (selected === '__manual__') {
      onChange('');
    } else {
      onChange(selected);
      const entry = latestByUrl.get(selected);
      if (entry && onRequestSelected) onRequestSelected(entry);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {detectedEndpoints.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Detected endpoints</Label>
          <Select
            value={detectedEndpoints.includes(value) ? value : '__manual__'}
            onValueChange={handleSelectChange}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select a detected endpoint…" />
            </SelectTrigger>
            <SelectContent>
              {detectedEndpoints.map((ep) => (
                <SelectItem key={ep} value={ep} className="text-xs font-mono">
                  {ep}
                </SelectItem>
              ))}
              <SelectItem value="__manual__" className="text-xs text-muted-foreground">
                — Enter manually —
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {(isManual || detectedEndpoints.length === 0) && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">
            {detectedEndpoints.length > 0 ? 'Or enter manually' : 'GraphQL endpoint URL'}
          </Label>
          <Input
            className="h-8 text-xs font-mono"
            placeholder="https://example.com/graphql"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
