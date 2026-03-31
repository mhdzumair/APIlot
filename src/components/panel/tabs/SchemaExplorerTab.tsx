import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSchemaStore } from '@/stores/useSchemaStore';
import { useBuilderStore } from '@/stores/useBuilderStore';
import { EndpointSelector } from '../schema/EndpointSelector';
import { SchemaViewer } from '../schema/SchemaViewer';
import { fetchIntrospection } from '@/lib/introspection';
import type { LogEntry } from '@/types/requests';
import type { SchemaField } from '@/stores/useSchemaStore';

export function SchemaExplorerTab() {
  const addOperationTab = useBuilderStore((s) => s.addOperationTab);
  const setPendingNavigateToBuilder = useBuilderStore((s) => s.setPendingNavigateToBuilder);

  const handleBuildOperation = (op: SchemaField, opType: 'query' | 'mutation' | 'subscription') => {
    addOperationTab({
      id: `${opType}-${op.name}`,
      name: op.name,
      operationType: opType,
      selectedArguments: [],
      argumentValues: {},
      selectedSubFields: [],
    });
    setPendingNavigateToBuilder(true);
  };

  const selectedEndpoint = useSchemaStore((s) => s.selectedEndpoint);
  const schema = useSchemaStore((s) => s.schema);
  const loading = useSchemaStore((s) => s.loading);
  const error = useSchemaStore((s) => s.error);
  const authType = useSchemaStore((s) => s.authType);
  const authValue = useSchemaStore((s) => s.authValue);
  const authHeader = useSchemaStore((s) => s.authHeader);

  const setSelectedEndpoint = useSchemaStore((s) => s.setSelectedEndpoint);
  const setSchema = useSchemaStore((s) => s.setSchema);
  const setLoading = useSchemaStore((s) => s.setLoading);
  const setError = useSchemaStore((s) => s.setError);
  const setAuth = useSchemaStore((s) => s.setAuth);
  // Local state for the endpoint text input (may differ from committed selectedEndpoint)
  const [endpointInput, setEndpointInput] = React.useState(selectedEndpoint ?? '');

  // Keep local input in sync if external change (e.g. detected endpoint selected)
  React.useEffect(() => {
    if (selectedEndpoint !== null && selectedEndpoint !== endpointInput) {
      setEndpointInput(selectedEndpoint);
    }
    // Only sync when selectedEndpoint changes externally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEndpoint]);

  const handleEndpointChange = (url: string) => {
    setEndpointInput(url);
    setSelectedEndpoint(url || null);
  };

  /**
   * When a detected endpoint is selected, sniff the auth headers from the
   * most recent captured request for that URL and pre-populate the auth fields.
   */
  const handleRequestSelected = (entry: LogEntry) => {
    const headers = entry.requestHeaders ?? {};
    // Case-insensitive header lookup helper
    const findHeader = (name: string) =>
      Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];

    const authorization = findHeader('Authorization');
    if (authorization) {
      if (authorization.startsWith('Bearer ') || authorization.startsWith('bearer ')) {
        setAuth('bearer', authorization.replace(/^bearer /i, '').trim(), 'Authorization');
        return;
      }
      setAuth('custom', authorization, 'Authorization');
      return;
    }

    // Look for common API-key style headers
    const apiKeyEntry = Object.entries(headers).find(([k]) =>
      /^(x-api-key|api-key|apikey|x-auth-token)$/i.test(k)
    );
    if (apiKeyEntry) {
      setAuth('apikey', apiKeyEntry[1], apiKeyEntry[0]);
      return;
    }

    // No recognisable auth found in captured headers — leave existing auth unchanged
    // so manually entered tokens are not destroyed.
  };

  const handleLoadSchema = async () => {
    const endpoint = endpointInput.trim();
    if (!endpoint) {
      setError('Please enter a GraphQL endpoint URL.');
      return;
    }

    setLoading(true);
    setError(null);
    setSchema(null);
    setSelectedEndpoint(endpoint);

    const result = await fetchIntrospection({
      endpoint,
      authType,
      authValue,
      authHeader,
    });

    setLoading(false);

    if (result.ok) {
      setSchema(result.schema, result.raw);
    } else {
      setError(result.error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      void handleLoadSchema();
    }
  };

  const authTypeLabel: Record<typeof authType, string> = {
    none: 'None',
    bearer: 'Bearer Token',
    apikey: 'API Key',
    custom: 'Custom Header',
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Configuration panel */}
      <div className="flex flex-col gap-3 px-3 py-2.5 border-b shrink-0">
        {/* Endpoint selector */}
        <EndpointSelector
          value={endpointInput}
          onChange={handleEndpointChange}
          onRequestSelected={handleRequestSelected}
        />

        {/* Auth settings */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Authentication</Label>
            {authType !== 'none' && authValue && (
              <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium">
                ✓ token set
              </span>
            )}
          </div>
          <div className="flex gap-2 items-start">
            <Select
              value={authType}
              onValueChange={(v) =>
                setAuth(v as typeof authType, authValue, authHeader)
              }
            >
              <SelectTrigger className="h-8 text-xs w-36 shrink-0">
                <SelectValue>{authTypeLabel[authType]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">None</SelectItem>
                <SelectItem value="bearer" className="text-xs">Bearer Token</SelectItem>
                <SelectItem value="apikey" className="text-xs">API Key</SelectItem>
                <SelectItem value="custom" className="text-xs">Custom Header</SelectItem>
              </SelectContent>
            </Select>

            {authType !== 'none' && (
              <div className="flex flex-col gap-1.5 flex-1">
                {(authType === 'apikey' || authType === 'custom') && (
                  <Input
                    className="h-8 text-xs"
                    placeholder="Header name (e.g. X-Api-Key)"
                    value={authHeader}
                    onChange={(e) => setAuth(authType, authValue, e.target.value)}
                  />
                )}
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder={authType === 'bearer' ? 'Token value' : 'Header value'}
                  value={authValue}
                  type="password"
                  onChange={(e) => setAuth(authType, e.target.value, authHeader)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            )}
          </div>
        </div>

        {/* Load button */}
        <Button
          size="sm"
          className="h-8 text-xs self-start"
          onClick={() => void handleLoadSchema()}
          disabled={loading || !endpointInput.trim()}
        >
          {loading ? 'Loading…' : 'Load Schema'}
        </Button>

        {/* Error */}
        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5">
            {error}
          </p>
        )}
      </div>

      {/* Schema viewer */}
      <div className="flex-1 overflow-hidden px-3 py-2">
        {schema ? (
          <SchemaViewer schema={schema} onBuildOperation={handleBuildOperation} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            {loading ? (
              <p className="text-sm">Fetching schema…</p>
            ) : (
              <>
                <p className="text-sm">No schema loaded</p>
                <p className="text-xs">
                  Enter a GraphQL endpoint URL above and click "Load Schema".
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
