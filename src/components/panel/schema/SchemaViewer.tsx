import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { SchemaSearch } from './SchemaSearch';
import type { SchemaData, SchemaField, SchemaType } from '@/stores/useSchemaStore';

interface SchemaViewerProps {
  schema: SchemaData;
}

export function SchemaViewer({ schema }: SchemaViewerProps) {
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
          <OperationList items={filteredQueries} emptyLabel="No queries" />
        </TabsContent>

        <TabsContent value="mutations" className="flex-1 overflow-y-auto mt-1">
          <OperationList items={filteredMutations} emptyLabel="No mutations" />
        </TabsContent>

        <TabsContent value="subscriptions" className="flex-1 overflow-y-auto mt-1">
          <OperationList items={filteredSubscriptions} emptyLabel="No subscriptions" />
        </TabsContent>

        <TabsContent value="types" className="flex-1 overflow-y-auto mt-1">
          <TypeList types={filteredTypes} emptyLabel="No custom types" />
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
}

function OperationList({ items, emptyLabel }: OperationListProps) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-2 py-3">{emptyLabel}</p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <OperationItem key={item.name} item={item} />
      ))}
    </div>
  );
}

interface OperationItemProps {
  item: SchemaField;
}

function OperationItem({ item }: OperationItemProps) {
  const hasContent =
    (item.args && item.args.length > 0) || (item.fields && item.fields.length > 0);
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-sm border border-transparent hover:border-border/50 transition-colors">
      <div
        className={`flex items-center gap-1 px-2 py-1 ${hasContent ? 'cursor-pointer' : ''}`}
        onClick={() => hasContent && setExpanded((v) => !v)}
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
      </div>

      {expanded && hasContent && (
        <div className="pl-5 pb-1.5">
          {item.args && item.args.length > 0 && (
            <div className="mb-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                Arguments
              </p>
              {item.args.map((arg) => (
                <div key={arg.name} className="flex items-center gap-1 px-1">
                  <span className="text-xs font-mono text-amber-600 dark:text-amber-400">
                    {arg.name}
                  </span>
                  <span className="text-xs text-blue-500 dark:text-blue-400">{arg.type}</span>
                  {arg.description && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      — {arg.description}
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

// ---------------------------------------------------------------------------
// Types list
// ---------------------------------------------------------------------------

interface TypeListProps {
  types: SchemaType[];
  emptyLabel: string;
}

function TypeList({ types, emptyLabel }: TypeListProps) {
  if (types.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-2 py-3">{emptyLabel}</p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {types.map((type) => (
        <TypeItem key={type.name} type={type} />
      ))}
    </div>
  );
}

interface TypeItemProps {
  type: SchemaType;
}

const KIND_COLORS: Record<string, string> = {
  OBJECT: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  INPUT_OBJECT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  ENUM: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  INTERFACE: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  UNION: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  SCALAR: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function TypeItem({ type }: TypeItemProps) {
  const fields = type.fields ?? type.inputFields ?? [];
  const enumValues = type.enumValues ?? [];
  const hasContent = fields.length > 0 || enumValues.length > 0;
  const [expanded, setExpanded] = React.useState(false);
  const kindClass = KIND_COLORS[type.kind] ?? 'bg-gray-100 text-gray-700';

  return (
    <div className="rounded-sm border border-transparent hover:border-border/50 transition-colors">
      <div
        className={`flex items-center gap-1.5 px-2 py-1 ${hasContent ? 'cursor-pointer' : ''}`}
        onClick={() => hasContent && setExpanded((v) => !v)}
        title={type.description}
      >
        <span className="text-[10px] text-muted-foreground w-3 shrink-0">
          {hasContent ? (expanded ? '▼' : '▶') : ''}
        </span>
        <span className="text-xs font-mono font-medium text-foreground">{type.name}</span>
        <span
          className={`text-[10px] px-1 py-0 rounded font-medium leading-4 ${kindClass}`}
        >
          {type.kind}
        </span>
        {type.description && (
          <span className="text-[10px] text-muted-foreground truncate hidden sm:block">
            {type.description}
          </span>
        )}
      </div>

      {expanded && hasContent && (
        <div className="pl-5 pb-1.5">
          {fields.length > 0 && (
            <>
              {fields.map((field) => (
                <div key={field.name} className="flex items-center gap-1 px-1">
                  <span className="text-xs font-mono text-foreground">{field.name}</span>
                  <span className="text-xs text-blue-500 dark:text-blue-400">{field.type}</span>
                  {field.description && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      — {field.description}
                    </span>
                  )}
                </div>
              ))}
            </>
          )}

          {enumValues.length > 0 && (
            <>
              {enumValues.map((ev) => (
                <div key={ev.name} className="flex items-center gap-1 px-1">
                  <span className="text-xs font-mono text-green-600 dark:text-green-400">
                    {ev.name}
                  </span>
                  {ev.description && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      — {ev.description}
                    </span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
