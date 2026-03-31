import * as React from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CodeBlock } from '@/components/panel/monitor/CodeBlock';
import { FieldSelector } from '@/components/panel/builder/FieldSelector';
import { useBuilderStore } from '@/stores/useBuilderStore';
import { useSchemaStore } from '@/stores/useSchemaStore';
import { useMonitorStore } from '@/stores/useMonitorStore';
import { buildQuery } from '@/lib/queryBuilder';
import type { SchemaField, SchemaType } from '@/stores/useSchemaStore';
import type { SelectedOperation } from '@/stores/useBuilderStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCALAR_TYPES = new Set(['String', 'Int', 'Float', 'Boolean', 'ID']);

function getBaseTypeName(typeStr: string): string {
  return typeStr.replace(/[\[\]!]/g, '').trim();
}

function isScalarType(typeStr: string): boolean {
  return SCALAR_TYPES.has(getBaseTypeName(typeStr));
}

/** Collect all leaf (scalar) field paths up to maxDepth for "Select All". */
function collectScalarPaths(
  fields: SchemaField[],
  allTypes: SchemaType[],
  parentPath = '',
  visited = new Set<string>(),
  depth = 0,
  maxDepth = 3
): string[] {
  if (depth >= maxDepth) return [];
  const paths: string[] = [];
  for (const field of fields) {
    const path = parentPath ? `${parentPath}.${field.name}` : field.name;
    if (visited.has(path)) continue;
    visited.add(path);

    if (isScalarType(field.type)) {
      paths.push(path);
    } else {
      const baseName = getBaseTypeName(field.type);
      const nested = allTypes.find((t) => t.name === baseName)?.fields ?? [];
      if (nested.length > 0) {
        paths.push(
          ...collectScalarPaths(nested, allTypes, path, visited, depth + 1, maxDepth)
        );
      }
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// QueryBuilderTab
// ---------------------------------------------------------------------------

export function QueryBuilderTab() {
  const schema = useSchemaStore((s) => s.schema);
  const selectedEndpoint = useSchemaStore((s) => s.selectedEndpoint);
  const authType = useSchemaStore((s) => s.authType);
  const authValue = useSchemaStore((s) => s.authValue);
  const authHeader = useSchemaStore((s) => s.authHeader);

  const operationType = useBuilderStore((s) => s.operationType);
  const selectedOperation = useBuilderStore((s) => s.selectedOperation);
  const selectedFields = useBuilderStore((s) => s.selectedFields);
  const generatedQuery = useBuilderStore((s) => s.generatedQuery);
  const response = useBuilderStore((s) => s.response);
  const loading = useBuilderStore((s) => s.loading);
  const responseTime = useBuilderStore((s) => s.responseTime);
  const customQueryMode = useBuilderStore((s) => s.customQueryMode);
  const customQuery = useBuilderStore((s) => s.customQuery);

  const toggleField = useBuilderStore((s) => s.toggleField);
  const toggleArgument = useBuilderStore((s) => s.toggleArgument);
  const setArgumentValue = useBuilderStore((s) => s.setArgumentValue);
  const setVariables = useBuilderStore((s) => s.setVariables);
  const setGeneratedQuery = useBuilderStore((s) => s.setGeneratedQuery);
  const setResponse = useBuilderStore((s) => s.setResponse);
  const setLoading = useBuilderStore((s) => s.setLoading);
  const setCustomQueryMode = useBuilderStore((s) => s.setCustomQueryMode);
  const setCustomQuery = useBuilderStore((s) => s.setCustomQuery);
  const operationTabs = useBuilderStore((s) => s.operationTabs);
  const activeTabId = useBuilderStore((s) => s.activeTabId);
  const removeOperationTab = useBuilderStore((s) => s.removeOperationTab);
  const setActiveTabId = useBuilderStore((s) => s.setActiveTabId);

  const requestLog = useMonitorStore((s) => s.requestLog);

  // ------------------------------------------------------------------
  // Derive operations list from schema
  // ------------------------------------------------------------------

  const operations = useMemo<SchemaField[]>(() => {
    if (!schema) return [];
    switch (operationType) {
      case 'query': return schema.queries;
      case 'mutation': return schema.mutations;
      case 'subscription': return schema.subscriptions;
    }
  }, [schema, operationType]);

  // Return type fields for the selected operation
  const returnFields = useMemo<SchemaField[]>(() => {
    if (!selectedOperation || !schema) return [];
    const op = operations.find((o) => o.name === selectedOperation.name);
    if (!op) return [];
    const baseName = getBaseTypeName(op.type);
    return schema.types.find((t) => t.name === baseName)?.fields ?? [];
  }, [selectedOperation, schema, operations]);

  // Argument type map for variable declarations
  const argumentTypes = useMemo<Record<string, string>>(() => {
    if (!selectedOperation) return {};
    const op = operations.find((o) => o.name === selectedOperation.name);
    const result: Record<string, string> = {};
    for (const arg of op?.args ?? []) {
      result[arg.name] = arg.type;
    }
    return result;
  }, [selectedOperation, operations]);

  // ------------------------------------------------------------------
  // Captured value hints from request log
  // ------------------------------------------------------------------

  const capturedValues = useMemo(() => {
    if (!selectedOperation) return {};
    const hints: Record<string, string[]> = {};
    for (const entry of requestLog) {
      if (entry.operationName === selectedOperation.name && entry.variables) {
        for (const [key, val] of Object.entries(entry.variables as Record<string, unknown>)) {
          if (!hints[key]) hints[key] = [];
          const str = typeof val === 'string' ? val : JSON.stringify(val);
          if (!hints[key].includes(str) && hints[key].length < 5) hints[key].push(str);
        }
      }
    }
    return hints;
  }, [selectedOperation?.name, requestLog]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Regenerate query whenever state changes
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!selectedOperation) {
      setGeneratedQuery('# Select an operation from Schema Explorer to get started.');
      return;
    }

    const op = operations.find((o) => o.name === selectedOperation.name);
    if (!op) return;

    const query = buildQuery({
      operationType,
      operationName: selectedOperation.name,
      selectedFields,
      selectedArguments: selectedOperation.selectedArguments,
      argumentTypes,
      schemaFields: returnFields,
    });
    setGeneratedQuery(query);
  }, [
    operationType,
    selectedOperation,
    selectedFields,
    argumentTypes,
    returnFields,
    operations,
    setGeneratedQuery,
  ]);

  // ------------------------------------------------------------------
  // Variables textarea
  // ------------------------------------------------------------------

  const [variablesText, setVariablesText] = React.useState('{}');
  const [variablesError, setVariablesError] = React.useState<string | null>(null);

  const handleVariablesChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      setVariablesText(text);
      try {
        const parsed = JSON.parse(text || '{}');
        setVariables(parsed);
        setVariablesError(null);
      } catch {
        setVariablesError('Invalid JSON');
      }
    },
    [setVariables]
  );

  // When operation changes, auto-fill variables from builder state
  useEffect(() => {
    if (!selectedOperation) {
      setVariablesText('{}');
      return;
    }
    const vars: Record<string, unknown> = {};
    for (const argName of selectedOperation.selectedArguments) {
      const val = selectedOperation.argumentValues[argName];
      if (val !== undefined && val !== '') {
        try {
          vars[argName] =
            val.startsWith('{') || val.startsWith('[') || val === 'true' || val === 'false' || !isNaN(Number(val))
              ? JSON.parse(val)
              : val;
        } catch {
          vars[argName] = val;
        }
      }
    }
    setVariablesText(JSON.stringify(vars, null, 2));
    setVariables(vars);
  }, [selectedOperation?.selectedArguments, selectedOperation?.argumentValues]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Execution
  // ------------------------------------------------------------------

  const handleExecute = useCallback(async () => {
    if (!selectedEndpoint) return;

    setLoading(true);
    setResponse(null);
    const startTime = performance.now();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authType === 'bearer' && authValue) {
        headers['Authorization'] = `Bearer ${authValue}`;
      } else if (authType === 'apikey' && authValue) {
        headers[authHeader || 'Authorization'] = authValue;
      } else if (authType === 'custom' && authValue) {
        headers[authHeader || 'Authorization'] = authValue;
      }

      let parsedVars: Record<string, unknown> = {};
      try {
        parsedVars = JSON.parse(variablesText || '{}');
      } catch {
        parsedVars = {};
      }

      // Use customQuery when in custom mode, otherwise use generated query
      const queryToExecute = customQueryMode ? customQuery : generatedQuery;

      const res = await fetch(selectedEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: queryToExecute,
          variables: parsedVars,
        }),
      });

      const data: unknown = await res.json();
      const elapsed = Math.round(performance.now() - startTime);
      setResponse(JSON.stringify(data, null, 2), elapsed);
    } catch (err) {
      const elapsed = Math.round(performance.now() - startTime);
      setResponse(
        JSON.stringify({ error: (err as Error).message ?? 'Request failed' }, null, 2),
        elapsed
      );
    } finally {
      setLoading(false);
    }
  }, [
    selectedEndpoint,
    generatedQuery,
    customQuery,
    customQueryMode,
    variablesText,
    authType,
    authValue,
    authHeader,
    setLoading,
    setResponse,
  ]);

  // ------------------------------------------------------------------
  // Select / Deselect all fields
  // ------------------------------------------------------------------

  const handleSelectAll = useCallback(() => {
    const paths = collectScalarPaths(returnFields, schema?.types ?? []);
    for (const p of paths) {
      if (!selectedFields.has(p)) toggleField(p);
    }
  }, [returnFields, schema, selectedFields, toggleField]);

  const handleDeselectAll = useCallback(() => {
    const copy = new Set(selectedFields);
    for (const p of copy) toggleField(p);
  }, [selectedFields, toggleField]);

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------

  const currentOp = selectedOperation
    ? operations.find((o) => o.name === selectedOperation.name)
    : null;

  const hasEndpoint = Boolean(selectedEndpoint);

  const canExecute = customQueryMode
    ? Boolean(customQuery.trim()) && hasEndpoint && !loading
    : Boolean(selectedOperation) && hasEndpoint && !loading;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ================================================================
          OPERATION TABS BAR (shown when any tabs are open)
         ================================================================ */}
      {operationTabs.length > 0 && (
        <div className="flex items-center gap-0 border-b bg-muted/30 overflow-x-auto shrink-0">
          {operationTabs.map((tab) => (
            <OperationTab
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onSelect={() => setActiveTabId(tab.id)}
              onClose={() => removeOperationTab(tab.id)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-1 min-h-0 gap-0">
      {/* ================================================================
          LEFT PANEL — configuration
         ================================================================ */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 border-r">
        {/* Mode toggle header */}
        <div className="px-3 pt-2.5 pb-2 border-b shrink-0 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {customQueryMode ? 'Custom Query' : selectedOperation ? selectedOperation.name : 'Configuration'}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              className={`text-[10px] font-medium px-2 py-0.5 rounded border transition-colors ${
                customQueryMode
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/50'
              }`}
              onClick={() => setCustomQueryMode(!customQueryMode)}
              title={customQueryMode ? 'Switch to visual mode' : 'Switch to custom query mode'}
            >
              {customQueryMode ? 'Visual Mode' : 'Custom Query'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-3">
          {customQueryMode ? (
            /* ---- Custom query textarea ---- */
            <div className="flex flex-col gap-2 h-full">
              <p className="text-[10px] text-muted-foreground">
                Write a raw GraphQL query to execute against the endpoint.
              </p>
              <Textarea
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                className="font-mono text-xs flex-1 resize-none min-h-[200px]"
                placeholder={'query {\n  yourOperation {\n    field\n  }\n}'}
                spellCheck={false}
              />
            </div>
          ) : !selectedOperation ? (
            /* ---- Empty state ---- */
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 select-none py-8">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground/70">No operation selected</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[220px] leading-relaxed">
                  Go to <strong>Schema Explorer</strong> → find an operation → click{' '}
                  <span className="font-mono bg-primary/10 text-primary px-1 rounded">→ Build</span>
                </p>
              </div>
            </div>
          ) : (
            /* ---- Visual mode with operation selected ---- */
            <div className="space-y-4">
              {/* Operation type badge */}
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${
                  operationType === 'query'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : operationType === 'mutation'
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                    : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                }`}>
                  {operationType}
                </span>
                {currentOp?.description && (
                  <p className="text-[10px] text-muted-foreground line-clamp-1">
                    {currentOp.description}
                  </p>
                )}
              </div>

              {/* ---- Arguments ---- */}
              {(currentOp?.args?.length ?? 0) > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Arguments
                  </h4>
                  <div className="space-y-2">
                    {(currentOp?.args ?? []).map((arg) => {
                      const isRequired = arg.type.includes('!') && !arg.type.startsWith('[');
                      const isSelected = selectedOperation.selectedArguments.includes(arg.name);
                      return (
                        <div key={arg.name} className="space-y-1">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleArgument(arg.name)}
                              className="h-3 w-3 accent-primary"
                            />
                            <span className="text-[11px] font-mono text-foreground">
                              {arg.name}
                              {isRequired && (
                                <span className="text-destructive ml-0.5">*</span>
                              )}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                              {arg.type}
                            </span>
                          </label>

                          {isSelected && (
                            <>
                              <input
                                type="text"
                                value={selectedOperation.argumentValues[arg.name] ?? ''}
                                onChange={(e) =>
                                  setArgumentValue(arg.name, e.target.value)
                                }
                                placeholder={`Enter ${arg.name}...`}
                                className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                              />
                              {capturedValues[arg.name]?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  <span className="text-[9px] text-muted-foreground">Captured:</span>
                                  {capturedValues[arg.name].map((v) => (
                                    <button
                                      key={v}
                                      className="text-[9px] font-mono bg-primary/10 text-primary px-1.5 py-px rounded hover:bg-primary/20 transition-colors border border-primary/20 max-w-[120px] truncate"
                                      onClick={() => setArgumentValue(arg.name, v)}
                                      title={v}
                                    >
                                      {v}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ---- Response Fields ---- */}
              <div className="flex flex-col min-h-0">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 shrink-0">
                  Response Fields
                </h4>
                {returnFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No fields available for this return type.
                  </p>
                ) : (
                  <FieldSelector
                    fields={returnFields}
                    allTypes={schema?.types ?? []}
                    selectedFields={selectedFields}
                    onToggle={toggleField}
                    onSelectAll={handleSelectAll}
                    onDeselectAll={handleDeselectAll}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================
          RIGHT PANEL — query preview + execute + response
         ================================================================ */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 p-3 gap-3">
        {/* Generated query */}
        <div className="flex flex-col min-h-0 flex-1">
          <div className="flex items-center justify-between mb-1.5 shrink-0">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {customQueryMode ? 'Query Preview' : 'Generated Query'}
            </h4>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden rounded border">
            <CodeBlock
              content={
                customQueryMode
                  ? (customQuery || '# Write your query in the left panel.')
                  : (generatedQuery || '# Select an operation to get started.')
              }
              language="graphql"
              className="h-full max-h-none rounded-none border-0"
            />
          </div>
        </div>

        {/* Variables */}
        <div className="shrink-0">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Variables
            {variablesError && (
              <span className="ml-2 text-destructive text-[10px] normal-case font-normal">
                {variablesError}
              </span>
            )}
          </h4>
          <Textarea
            value={variablesText}
            onChange={handleVariablesChange}
            className="font-mono text-xs min-h-[64px] resize-none"
            placeholder="{}"
            spellCheck={false}
          />
        </div>

        {/* Execute button */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={handleExecute}
            disabled={!canExecute}
            className="flex-1"
            size="sm"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-1 h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Executing...
              </>
            ) : (
              'Execute'
            )}
          </Button>
          {!hasEndpoint && (
            <p className="text-[10px] text-muted-foreground">
              Set an endpoint in Schema Explorer first.
            </p>
          )}
        </div>

        {/* Response */}
        {response !== null && (
          <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
            <div className="flex items-center justify-between mb-1.5 shrink-0">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Response
              </h4>
              {responseTime !== null && (
                <span className="text-[10px] text-muted-foreground">
                  {responseTime}ms
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-hidden rounded border">
              <CodeBlock
                content={response}
                language="json"
                className="h-full max-h-none rounded-none border-0"
              />
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OperationTab chip
// ---------------------------------------------------------------------------

interface OperationTabProps {
  tab: SelectedOperation;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

const OP_TYPE_COLORS: Record<string, string> = {
  query: 'text-blue-500 dark:text-blue-400',
  mutation: 'text-orange-500 dark:text-orange-400',
  subscription: 'text-purple-500 dark:text-purple-400',
};

function OperationTab({ tab, isActive, onSelect, onClose }: OperationTabProps) {
  return (
    <div
      className={`flex items-center gap-1 px-3 py-1.5 cursor-pointer border-r border-border/50 shrink-0 transition-colors ${
        isActive
          ? 'bg-background border-t-2 border-t-primary text-foreground'
          : 'hover:bg-muted/60 text-muted-foreground border-t-2 border-t-transparent'
      }`}
      onClick={onSelect}
      title={`${tab.operationType} ${tab.name}`}
    >
      <span className={`text-[9px] font-semibold uppercase ${OP_TYPE_COLORS[tab.operationType]}`}>
        {tab.operationType[0]}
      </span>
      <span className="text-xs font-mono max-w-[100px] truncate">{tab.name}</span>
      <button
        className="ml-1 text-muted-foreground hover:text-foreground transition-colors text-[10px] leading-none"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close tab"
      >
        ✕
      </button>
    </div>
  );
}
