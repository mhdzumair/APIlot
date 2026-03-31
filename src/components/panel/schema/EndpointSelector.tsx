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

interface EndpointSelectorProps {
  value: string;
  onChange: (url: string) => void;
}

export function EndpointSelector({ value, onChange }: EndpointSelectorProps) {
  const requestLog = useMonitorStore((s) => s.requestLog);

  const detectedEndpoints = React.useMemo(() => {
    const seen = new Set<string>();
    const endpoints: string[] = [];
    for (const entry of requestLog) {
      if (entry.requestType === 'graphql' && entry.url && !seen.has(entry.url)) {
        seen.add(entry.url);
        endpoints.push(entry.url);
      }
    }
    return endpoints;
  }, [requestLog]);

  const isManual = !detectedEndpoints.includes(value) || detectedEndpoints.length === 0;

  const handleSelectChange = (selected: string) => {
    if (selected === '__manual__') {
      onChange('');
    } else {
      onChange(selected);
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
