import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { SchemaSearch } from './SchemaSearch';
import type { SchemaData, SchemaField, SchemaType } from '@/stores/useSchemaStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCALAR_TYPES = new Set(['String', 'Int', 'Float', 'Boolean', 'ID']);

function getBaseTypeName(typeStr: string): string {
  return typeStr.replace(/[[\]!]/g, '').trim();
}

// ---------------------------------------------------------------------------
// TypeFieldTree — recursive inline type explorer
// ---------------------------------------------------------------------------

interface TypeFieldTreeProps {
  fields: SchemaField[];
  allTypes: SchemaType[];
  depth?: number;
  maxDepth?: number;
  visited?: ReadonlySet<string>;
}

function TypeFieldTree({
  fields,
  allTypes,
  depth = 0,
  maxDepth = 6,
  visited = new Set(),
}: TypeFieldTreeProps) {
  return (
    <div className={depth > 0 ? 'pl-3 border-l border-border/25' : ''}>
      {fields.map((field) => (
        <TypeFieldNode
          key={field.name}
          field={field}
          allTypes={allTypes}
          depth={depth}
          maxDepth={maxDepth}
          visited={visited}
        />
      ))}
    </div>
  );
}

interface TypeFieldNodeProps {
  field: SchemaField;
  allTypes: SchemaType[];
  depth: number;
  maxDepth: number;
  visited: ReadonlySet<string>;
}

function TypeFieldNode({ field, allTypes, depth, maxDepth, visited }: TypeFieldNodeProps) {
  const [expanded, setExpanded] = React.useState(false);

  const base = getBaseTypeName(field.type);
  const isBuiltinScalar = SCALAR_TYPES.has(base);
  const typeObj = isBuiltinScalar ? null : allTypes.find((t) => t.name === base);
  const childFields: SchemaField[] =
    typeObj?.fields ?? (typeObj?.inputFields as SchemaField[] | undefined) ?? [];
  const isCircular = !isBuiltinScalar && typeObj != null && visited.has(base);
  const isExpandable =
    childFields.length > 0 && !isCircular && depth < maxDepth;
  const nextVisited: ReadonlySet<string> = isExpandable
    ? new Set([...visited, base])
    : visited;

  return (
    <div>
      <div
        className={`flex items-center gap-0.5 px-1 py-px rounded-sm text-[11px] group ${
          isExpandable ? 'cursor-pointer hover:bg-muted/40' : ''
        }`}
        {...(isExpandable ? {
          onClick: () => setExpanded((v) => !v),
          onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && setExpanded((v) => !v),
          role: 'button' as const,
          tabIndex: 0,
          'aria-expanded': expanded,
        } : {})}
      >
        <span className="text-[10px] text-muted-foreground w-3 shrink-0 select-none">
          {isExpandable ? (expanded ? '▼' : '▶') : isCircular ? '↺' : '·'}
        </span>
        <span className="font-mono text-foreground">{field.name}</span>
        <span className="text-[10px] text-blue-500 dark:text-blue-400 ml-1 shrink-0">
          {field.type}
        </span>
        {isCircular && (
          <span className="text-[9px] text-muted-foreground italic ml-1">(circular)</span>
        )}
        {!isBuiltinScalar && !isCircular && !typeObj && (
          <span className="text-[9px] text-muted-foreground italic ml-1">(scalar)</span>
        )}
        {!isBuiltinScalar && !isCircular && typeObj && !isExpandable && depth >= maxDepth && (
          <span className="text-[9px] text-muted-foreground italic ml-1">(max depth)</span>
        )}
        {field.description && (
          <span className="text-[10px] text-muted-foreground truncate ml-2 hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity">
            {field.description}
          </span>
        )}
      </div>
      {expanded && isExpandable && (
        <TypeFieldTree
          fields={childFields}
          allTypes={allTypes}
          depth={depth + 1}
          maxDepth={maxDepth}
          visited={nextVisited}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SchemaViewer
// ---------------------------------------------------------------------------

interface SchemaViewerProps {
  schema: SchemaData;
  onBuildOperation?: (op: SchemaField, opType: 'query' | 'mutation' | 'subscription') => void;
}

export function SchemaViewer({ schema, onBuildOperation }: SchemaViewerProps) {
  const [search, setSearch] = React.useState('');

  const q = search.trim().toLowerCase();

  const filteredQueries = q
    ? schema.queries.filter((f) => f.name.toLowerCase().includes(q))
    : schema.queries;

  const filteredMutations = q
    ? schema.mutations.filter((f) => f.name.toLowerCase().includes(q))
    : schema.mutations;

  const filteredSubscriptions = q
    ? schema.subscriptions.filter((f) => f.name.toLowerCase().includes(q))
    : schema.subscriptions;

  const filteredTypes = q
    ? schema.types.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.fields?.some((f) => f.name.toLowerCase().includes(q)),
      )
    : schema.types;

  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      <SchemaSearch
        value={search}
        onChange={setSearch}
        placeholder="Search operations and types…"
      />

      <Tabs defaultValue="queries" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="shrink-0 h-8 text-xs">
          <TabsTrigger value="queries" className="text-xs">
            Queries
            {schema.queries.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                {schema.queries.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="mutations" className="text-xs">
            Mutations
            {schema.mutations.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                {schema.mutations.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="text-xs">
            Subscriptions
            {schema.subscriptions.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                {schema.subscriptions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="types" className="text-xs">
            Types
            {schema.types.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                {schema.types.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queries" className="flex-1 overflow-y-auto mt-1">
          <OperationList
            items={filteredQueries}
            emptyLabel="No queries"
            operationType="query"
            schema={schema}
            onBuildOperation={onBuildOperation}
          />
        </TabsContent>

        <TabsContent value="mutations" className="flex-1 overflow-y-auto mt-1">
          <OperationList
            items={filteredMutations}
            emptyLabel="No mutations"
            operationType="mutation"
            schema={schema}
            onBuildOperation={onBuildOperation}
          />
        </TabsContent>

        <TabsContent value="subscriptions" className="flex-1 overflow-y-auto mt-1">
          <OperationList
            items={filteredSubscriptions}
            emptyLabel="No subscriptions"
            operationType="subscription"
            schema={schema}
            onBuildOperation={onBuildOperation}
          />
        </TabsContent>

        <TabsContent value="types" className="flex-1 overflow-y-auto mt-1">
          <TypeList types={filteredTypes} allTypes={schema.types} emptyLabel="No custom types" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operation list (queries / mutations / subscriptions)
// ---------------------------------------------------------------------------

interface OperationListProps {
  items: SchemaField[];
  emptyLabel: string;
  operationType: 'query' | 'mutation' | 'subscription';
  schema: SchemaData;
  onBuildOperation?: (op: SchemaField, opType: 'query' | 'mutation' | 'subscription') => void;
}

function OperationList({
  items,
  emptyLabel,
  operationType,
  schema,
  onBuildOperation,
}: OperationListProps) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground px-2 py-3">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <OperationItem
          key={item.name}
          item={item}
          operationType={operationType}
          schema={schema}
          onBuildOperation={onBuildOperation}
        />
      ))}
    </div>
  );
}

interface OperationItemProps {
  item: SchemaField;
  operationType: 'query' | 'mutation' | 'subscription';
  schema: SchemaData;
  onBuildOperation?: (op: SchemaField, opType: 'query' | 'mutation' | 'subscription') => void;
}

function OperationItem({ item, operationType, schema, onBuildOperation }: OperationItemProps) {
  const hasArgs = item.args && item.args.length > 0;
  const baseReturnType = getBaseTypeName(item.type);
  const returnTypeObj = schema.types.find((t) => t.name === baseReturnType);
  const hasContent = hasArgs || returnTypeObj != null;

  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="group rounded-sm border border-transparent hover:border-border/50 transition-colors">
      <div
        className={`flex items-center gap-1 px-2 py-1 ${hasContent ? 'cursor-pointer' : ''}`}
        {...(hasContent ? {
          onClick: () => setExpanded((v) => !v),
          onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && setExpanded((v) => !v),
          role: 'button' as const,
          tabIndex: 0,
          'aria-expanded': expanded,
        } : {})}
        title={item.description}
      >
        <span className="text-[10px] text-muted-foreground w-3 shrink-0">
          {hasContent ? (expanded ? '▼' : '▶') : ''}
        </span>
        <span className="text-xs font-mono font-medium text-foreground">{item.name}</span>
        <span className="text-xs text-blue-500 dark:text-blue-400 ml-1">{item.type}</span>
        {item.description && (
          <span className="text-[10px] text-muted-foreground truncate ml-2 hidden sm:block">
            {item.description}
          </span>
        )}
        <div className="ml-auto flex items-center shrink-0">
          {onBuildOperation && (
            <button
              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20 whitespace-nowrap opacity-0 group-hover:opacity-100 focus:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onBuildOperation(item, operationType);
              }}
              title="Add to Query Builder"
            >
              → Build
            </button>
          )}
        </div>
      </div>

      {expanded && hasContent && (
        <div className="pl-5 pb-2">
          {/* Arguments */}
          {hasArgs && (
            <div className="mb-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Arguments
              </p>
              {(item.args ?? []).map((arg) => (
                <div key={arg.name} className="flex items-center gap-1 px-1 py-px">
                  <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                    {arg.name}
                  </span>
                  <span className="text-[10px] text-blue-500 dark:text-blue-400">{arg.type}</span>
                  {arg.description && (
                    <span className="text-[10px] text-muted-foreground truncate ml-1">
                      — {arg.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Return Type — with recursive explorer */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Return Type
              </p>
              <span className="text-[10px] font-mono px-1.5 py-px rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium">
                {baseReturnType}
              </span>
            </div>
            {returnTypeObj ? (
              <TypeFieldTree
                fields={
                  (returnTypeObj.fields ?? returnTypeObj.inputFields ?? []) as SchemaField[]
                }
                allTypes={schema.types}
                depth={0}
                maxDepth={6}
                visited={new Set([baseReturnType])}
              />
            ) : (
              <p className="text-[10px] text-muted-foreground px-1 italic">
                Scalar or built-in type — no fields to expand.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types list
// ---------------------------------------------------------------------------

interface TypeListProps {
  types: SchemaType[];
  allTypes: SchemaType[];
  emptyLabel: string;
}

function TypeList({ types, allTypes, emptyLabel }: TypeListProps) {
  if (types.length === 0) {
    return <p className="text-xs text-muted-foreground px-2 py-3">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {types.map((type) => (
        <TypeItem key={type.name} type={type} allTypes={allTypes} />
      ))}
    </div>
  );
}

interface TypeItemProps {
  type: SchemaType;
  allTypes: SchemaType[];
}

const KIND_COLORS: Record<string, string> = {
  OBJECT: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  INPUT_OBJECT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  ENUM: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  INTERFACE: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  UNION: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  SCALAR: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function TypeItem({ type, allTypes }: TypeItemProps) {
  const fields = (type.fields ?? type.inputFields ?? []) as SchemaField[];
  const enumValues = type.enumValues ?? [];
  const hasContent = fields.length > 0 || enumValues.length > 0;
  const [expanded, setExpanded] = React.useState(false);
  const kindClass = KIND_COLORS[type.kind] ?? 'bg-gray-100 text-gray-700';

  return (
    <div className="rounded-sm border border-transparent hover:border-border/50 transition-colors">
      <div
        className={`flex items-center gap-1.5 px-2 py-1 ${hasContent ? 'cursor-pointer' : ''}`}
        {...(hasContent ? {
          onClick: () => setExpanded((v) => !v),
          onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && setExpanded((v) => !v),
          role: 'button' as const,
          tabIndex: 0,
          'aria-expanded': expanded,
        } : {})}
        title={type.description}
      >
        <span className="text-[10px] text-muted-foreground w-3 shrink-0">
          {hasContent ? (expanded ? '▼' : '▶') : ''}
        </span>
        <span className="text-xs font-mono font-medium text-foreground">{type.name}</span>
        <span className={`text-[10px] px-1 py-0 rounded font-medium leading-4 ${kindClass}`}>
          {type.kind}
        </span>
        {type.description && (
          <span className="text-[10px] text-muted-foreground truncate hidden sm:block">
            {type.description}
          </span>
        )}
      </div>

      {expanded && hasContent && (
        <div className="pl-5 pb-2">
          {fields.length > 0 && (
            <TypeFieldTree
              fields={fields}
              allTypes={allTypes}
              depth={0}
              maxDepth={5}
              visited={new Set([type.name])}
            />
          )}

          {enumValues.length > 0 && (
            <div>
              {enumValues.map((ev) => (
                <div key={ev.name} className="flex items-center gap-1 px-1 py-px">
                  <span className="text-[10px] font-mono text-green-600 dark:text-green-400">
                    ✦ {ev.name}
                  </span>
                  {ev.description && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      — {ev.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
