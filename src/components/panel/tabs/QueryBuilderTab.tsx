import * as React from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from '@/components/panel/monitor/CodeBlock';
import { OperationCard } from '@/components/panel/builder/OperationCard';
import { FieldSelector } from '@/components/panel/builder/FieldSelector';
import { useBuilderStore } from '@/stores/useBuilderStore';
import { useSchemaStore } from '@/stores/useSchemaStore';
import { buildQuery } from '@/lib/queryBuilder';
import type { SchemaField, SchemaType } from '@/stores/useSchemaStore';

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
  const variables = useBuilderStore((s) => s.variables);
  const generatedQuery = useBuilderStore((s) => s.generatedQuery);
  const response = useBuilderStore((s) => s.response);
  const loading = useBuilderStore((s) => s.loading);
  const responseTime = useBuilderStore((s) => s.responseTime);

  const setOperationType = useBuilderStore((s) => s.setOperationType);
  const setSelectedOperation = useBuilderStore((s) => s.setSelectedOperation);
  const toggleField = useBuilderStore((s) => s.toggleField);
  const toggleArgument = useBuilderStore((s) => s.toggleArgument);
  const setArgumentValue = useBuilderStore((s) => s.setArgumentValue);
  const setVariables = useBuilderStore((s) => s.setVariables);
  const setGeneratedQuery = useBuilderStore((s) => s.setGeneratedQuery);
  const setResponse = useBuilderStore((s) => s.setResponse);
  const setLoading = useBuilderStore((s) => s.setLoading);

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
  // Regenerate query whenever state changes
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!selectedOperation) {
      setGeneratedQuery('# Select an operation from the list to get started.');
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

      const res = await fetch(selectedEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: generatedQuery,
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
  // Operation selection
  // ------------------------------------------------------------------

  const handleSelectOp = useCallback(
    (op: SchemaField) => {
      if (selectedOperation?.name === op.name) {
        setSelectedOperation(null);
      } else {
        setSelectedOperation({
          id: `${operationType}-${op.name}`,
          name: op.name,
          operationType,
          selectedArguments: [],
          argumentValues: {},
          selectedSubFields: [],
        });
      }
    },
    [selectedOperation, operationType, setSelectedOperation]
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const currentOp = selectedOperation
    ? operations.find((o) => o.name === selectedOperation.name)
    : null;

  const hasEndpoint = Boolean(selectedEndpoint);

  return (
    <div className="flex h-full min-h-0 gap-0">
      {/* ================================================================
          LEFT PANEL — operation list
         ================================================================ */}
      <div className="w-64 shrink-0 border-r flex flex-col min-h-0">
        {/* Operation type selector */}
        <div className="px-3 pt-3 pb-2 border-b shrink-0">
          <Tabs
            value={operationType}
            onValueChange={(v) => setOperationType(v as typeof operationType)}
          >
            <TabsList className="w-full">
              <TabsTrigger value="query" className="flex-1 text-xs">
                Query
              </TabsTrigger>
              <TabsTrigger value="mutation" className="flex-1 text-xs">
                Mutation
              </TabsTrigger>
              <TabsTrigger value="subscription" className="flex-1 text-xs">
                Sub
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Operations list */}
        <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1">
          {!schema ? (
            <p className="p-2 text-xs text-muted-foreground italic">
              No schema loaded. Go to Schema Explorer and fetch a schema first.
            </p>
          ) : operations.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground italic">
              No {operationType}s in schema.
            </p>
          ) : (
            operations.map((op) => (
              <OperationCard
                key={op.name}
                operation={op}
                operationType={operationType}
                isSelected={selectedOperation?.name === op.name}
                onClick={() => handleSelectOp(op)}
              />
            ))
          )}
        </div>
      </div>

      {/* ================================================================
          MIDDLE PANEL — field selector + arguments
         ================================================================ */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 border-r">
        {!selectedOperation ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 select-none">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            <p className="text-xs">Select an operation from the left panel</p>
          </div>
        ) : (
          <div className="flex flex-col h-full min-h-0">
            {/* Operation heading */}
            <div className="px-3 py-2 border-b shrink-0">
              <h3 className="text-xs font-semibold font-mono truncate">{selectedOperation.name}</h3>
              {currentOp?.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                  {currentOp.description}
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-4">
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
                            <input
                              type="text"
                              value={selectedOperation.argumentValues[arg.name] ?? ''}
                              onChange={(e) =>
                                setArgumentValue(arg.name, e.target.value)
                              }
                              placeholder={`Enter ${arg.name}...`}
                              className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ---- Response Fields ---- */}
              <div className="flex flex-col min-h-0 flex-1">
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
          </div>
        )}
      </div>

      {/* ================================================================
          RIGHT PANEL — query preview + execute
         ================================================================ */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 p-3 gap-3">
        {/* Generated query */}
        <div className="flex flex-col min-h-0 flex-1">
          <div className="flex items-center justify-between mb-1.5 shrink-0">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Generated Query
            </h4>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden rounded border">
            <CodeBlock
              content={generatedQuery || '# Select an operation to get started.'}
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
            disabled={loading || !selectedOperation || !hasEndpoint}
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
  );
}
