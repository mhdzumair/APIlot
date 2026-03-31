import type { SchemaField } from '@/stores/useSchemaStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseTypeName(field: SchemaField): string {
  // SchemaField.type is already a string like "String", "User", "[User!]!", etc.
  // Strip list wrappers and non-null bangs to get the bare type name.
  return field.type.replace(/[\[\]!]/g, '').trim();
}

function getTypeString(field: SchemaField): string {
  return field.type;
}

// ---------------------------------------------------------------------------
// Tree building from dot-separated paths
// ---------------------------------------------------------------------------

type FieldTree = { [key: string]: FieldTree | null };

function buildFieldTree(paths: string[]): FieldTree {
  const tree: FieldTree = {};

  for (const path of paths) {
    const parts = path.split('.');
    let current = tree;

    parts.forEach((part, index) => {
      if (!(part in current)) {
        current[part] = index === parts.length - 1 ? null : {};
      } else if (index < parts.length - 1 && current[part] === null) {
        // Promote leaf to branch when a deeper path is encountered
        current[part] = {};
      }
      if (index < parts.length - 1) {
        current = current[part] as FieldTree;
      }
    });
  }

  return tree;
}

function treeToGraphQL(tree: FieldTree, indentLevel: number): string {
  const indent = '  '.repeat(indentLevel);
  const lines: string[] = [];

  for (const key of Object.keys(tree)) {
    if (tree[key] === null) {
      lines.push(`${indent}${key}`);
    } else {
      lines.push(`${indent}${key} {`);
      lines.push(treeToGraphQL(tree[key] as FieldTree, indentLevel + 1));
      lines.push(`${indent}}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildQueryOptions {
  /** Operation type: query | mutation | subscription */
  operationType: 'query' | 'mutation' | 'subscription';
  /** The root operation field name (e.g. "getUser") */
  operationName: string;
  /** Optional name for the GraphQL operation document */
  operationDocName?: string;
  /** Dot-separated field paths that the user has selected */
  selectedFields: Set<string>;
  /** Arguments selected by the user */
  selectedArguments: string[];
  /** Argument type strings for variable declarations, keyed by arg name */
  argumentTypes: Record<string, string>;
  /** All schema fields for the operation (used to derive type info) */
  schemaFields: SchemaField[];
}

/**
 * Pure function that generates a GraphQL query string from builder state.
 * Ported from `generateBuilderQuery` / `buildNestedFieldsString` in panel.js.
 */
export function buildQuery({
  operationType,
  operationName,
  operationDocName,
  selectedFields,
  selectedArguments,
  argumentTypes,
}: BuildQueryOptions): string {
  if (!operationName) {
    return `# Select an operation to generate a query`;
  }

  // Build variable declarations
  const variableDecls = selectedArguments
    .filter((argName) => argumentTypes[argName])
    .map((argName) => `$${argName}: ${argumentTypes[argName]}`);

  const variableString =
    variableDecls.length > 0 ? `(${variableDecls.join(', ')})` : '';

  // Build argument usage inline
  const argUsage =
    selectedArguments.length > 0
      ? `(${selectedArguments.map((a) => `${a}: $${a}`).join(', ')})`
      : '';

  // Build nested fields string
  const fieldPaths = Array.from(selectedFields);

  let fieldsBlock: string;
  if (fieldPaths.length === 0) {
    fieldsBlock = `    # Select response fields above`;
  } else {
    const tree = buildFieldTree(fieldPaths);
    fieldsBlock = treeToGraphQL(tree, 2);
  }

  // Operation document header
  const docName = operationDocName ? ` ${operationDocName}` : '';
  const header = `${operationType}${docName}${variableString}`;

  return `${header} {\n  ${operationName}${argUsage} {\n${fieldsBlock}\n  }\n}`;
}
