import * as React from 'react';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { SchemaField, SchemaType } from '@/stores/useSchemaStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCALAR_TYPES = new Set(['String', 'Int', 'Float', 'Boolean', 'ID']);

/** Strip list wrappers and non-null bangs to get bare type name. */
function getBaseTypeName(typeStr: string): string {
  return typeStr.replace(/[[\]!]/g, '').trim();
}

function isScalarType(typeStr: string): boolean {
  return SCALAR_TYPES.has(getBaseTypeName(typeStr));
}

function getFieldsForType(typeStr: string, allTypes: SchemaType[]): SchemaField[] {
  const baseName = getBaseTypeName(typeStr);
  return allTypes.find((t) => t.name === baseName)?.fields ?? [];
}

// ---------------------------------------------------------------------------
// Single field row (recursive)
// ---------------------------------------------------------------------------

interface FieldRowProps {
  field: SchemaField;
  path: string;
  depth: number;
  selectedFields: Set<string>;
  allTypes: SchemaType[];
  onToggle: (path: string) => void;
}

function FieldRow({ field, path, depth, selectedFields, allTypes, onToggle }: FieldRowProps) {
  const [expanded, setExpanded] = useState(false);

  const hasNested = !isScalarType(field.type) && getFieldsForType(field.type, allTypes).length > 0;
  const isChecked = selectedFields.has(path);
  const indent = depth * 12;

  const nestedFields = hasNested ? getFieldsForType(field.type, allTypes) : [];

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 hover:bg-accent/50 rounded pr-1 group"
        style={{ paddingLeft: `${indent + 4}px` }}
      >
        {/* Expand toggle */}
        {hasNested ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center justify-center w-4 h-4 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={cn('transition-transform duration-100', expanded && 'rotate-90')}
            >
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          </button>
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}

        {/* Checkbox */}
        <input
          type="checkbox"
          id={`field-${path}`}
          checked={isChecked}
          onChange={() => onToggle(path)}
          className="h-3 w-3 shrink-0 accent-primary"
        />

        {/* Label */}
        <label
          htmlFor={`field-${path}`}
          className="flex flex-1 items-baseline gap-1.5 cursor-pointer min-w-0"
          title={field.description}
        >
          <span className="font-mono text-[11px] truncate text-foreground">
            {field.name}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground shrink-0">
            {field.type}
          </span>
        </label>
      </div>

      {/* Nested fields */}
      {hasNested && expanded && (
        <div>
          {nestedFields.map((child) => (
            <FieldRow
              key={child.name}
              field={child}
              path={`${path}.${child.name}`}
              depth={depth + 1}
              selectedFields={selectedFields}
              allTypes={allTypes}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldSelector — top-level component
// ---------------------------------------------------------------------------

interface FieldSelectorProps {
  /** Fields of the root return type for the selected operation */
  fields: SchemaField[];
  /** All schema types for recursive resolution */
  allTypes: SchemaType[];
  /** Currently selected field paths */
  selectedFields: Set<string>;
  onToggle: (path: string) => void;
  /** Select all leaf scalar fields up to a configurable depth */
  onSelectAll?: () => void;
  /** Deselect all fields */
  onDeselectAll?: () => void;
}

export function FieldSelector({
  fields,
  allTypes,
  selectedFields,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: FieldSelectorProps) {
  const [search, setSearch] = useState('');

  const filteredFields = search
    ? fields.filter((f) =>
        f.name.toLowerCase().includes(search.toLowerCase())
      )
    : fields;

  const handleSelectAll = useCallback(() => onSelectAll?.(), [onSelectAll]);
  const handleDeselectAll = useCallback(() => onDeselectAll?.(), [onDeselectAll]);

  return (
    <div className="flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 pb-1.5 shrink-0">
        <input
          type="text"
          placeholder="Search fields..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
        />
        <Button
          variant="ghost"
          size="xs"
          onClick={handleSelectAll}
          title="Select all top-level scalar fields"
        >
          All
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={handleDeselectAll}
          title="Deselect all fields"
        >
          None
        </Button>
      </div>

      {/* Field list */}
      <div className="overflow-y-auto flex-1 min-h-0 rounded border border-input bg-background/50">
        {filteredFields.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground italic">
            {search ? 'No fields match your search.' : 'No fields available.'}
          </p>
        ) : (
          <div className="py-1">
            {filteredFields.map((field) => (
              <FieldRow
                key={field.name}
                field={field}
                path={field.name}
                depth={0}
                selectedFields={selectedFields}
                allTypes={allTypes}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
      </div>

      {selectedFields.size > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground shrink-0">
          {selectedFields.size} field{selectedFields.size !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}
