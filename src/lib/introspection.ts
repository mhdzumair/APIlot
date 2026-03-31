import type { SchemaData, SchemaField, SchemaType } from '@/stores/useSchemaStore';

const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      ...FullType
    }
  }
}
fragment FullType on __Type {
  kind name description
  fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } }
  inputFields { ...InputValue }
  enumValues(includeDeprecated: true) { name description }
}
fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue }
fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
`.trim();

/** Recursively converts a GraphQL TypeRef object into a human-readable string, e.g. `[String!]!` */
function typeRefToString(typeRef: IntrospectionTypeRef | null | undefined): string {
  if (!typeRef) return 'Unknown';
  if (typeRef.kind === 'NON_NULL') {
    return `${typeRefToString(typeRef.ofType)}!`;
  }
  if (typeRef.kind === 'LIST') {
    return `[${typeRefToString(typeRef.ofType)}]`;
  }
  return typeRef.name ?? 'Unknown';
}

interface IntrospectionTypeRef {
  kind: string;
  name?: string | null;
  ofType?: IntrospectionTypeRef | null;
}

interface IntrospectionInputValue {
  name: string;
  description?: string | null;
  type: IntrospectionTypeRef;
  defaultValue?: string | null;
}

interface IntrospectionField {
  name: string;
  description?: string | null;
  args: IntrospectionInputValue[];
  type: IntrospectionTypeRef;
  isDeprecated?: boolean;
  deprecationReason?: string | null;
}

interface IntrospectionEnumValue {
  name: string;
  description?: string | null;
  isDeprecated?: boolean;
}

interface IntrospectionType {
  kind: string;
  name: string;
  description?: string | null;
  fields?: IntrospectionField[] | null;
  inputFields?: IntrospectionInputValue[] | null;
  enumValues?: IntrospectionEnumValue[] | null;
}

interface IntrospectionSchema {
  queryType?: { name: string } | null;
  mutationType?: { name: string } | null;
  subscriptionType?: { name: string } | null;
  types: IntrospectionType[];
}

interface IntrospectionResult {
  data?: {
    __schema: IntrospectionSchema;
  };
  errors?: { message: string }[];
}

function mapInputValues(args: IntrospectionInputValue[]): SchemaField[] {
  return args.map((arg) => ({
    name: arg.name,
    type: typeRefToString(arg.type),
    description: arg.description ?? undefined,
  }));
}

function mapFields(fields: IntrospectionField[]): SchemaField[] {
  return fields.map((field) => ({
    name: field.name,
    type: typeRefToString(field.type),
    description: field.description ?? undefined,
    args: field.args && field.args.length > 0 ? mapInputValues(field.args) : undefined,
  }));
}

const SCALAR_NAMES = new Set(['String', 'Int', 'Float', 'Boolean', 'ID']);
const BUILT_IN_PREFIX = '__';

function parseIntrospectionSchema(raw: IntrospectionSchema): SchemaData {
  const queryTypeName = raw.queryType?.name;
  const mutationTypeName = raw.mutationType?.name;
  const subscriptionTypeName = raw.subscriptionType?.name;

  const rootTypeNames = new Set([queryTypeName, mutationTypeName, subscriptionTypeName].filter(Boolean));

  let queries: SchemaField[] = [];
  let mutations: SchemaField[] = [];
  let subscriptions: SchemaField[] = [];
  const types: SchemaType[] = [];

  for (const t of raw.types) {
    if (t.name.startsWith(BUILT_IN_PREFIX) || SCALAR_NAMES.has(t.name)) {
      continue;
    }

    if (t.name === queryTypeName && t.fields) {
      queries = mapFields(t.fields).sort((a, b) => a.name.localeCompare(b.name));
      continue;
    }

    if (t.name === mutationTypeName && t.fields) {
      mutations = mapFields(t.fields).sort((a, b) => a.name.localeCompare(b.name));
      continue;
    }

    if (t.name === subscriptionTypeName && t.fields) {
      subscriptions = mapFields(t.fields).sort((a, b) => a.name.localeCompare(b.name));
      continue;
    }

    if (!rootTypeNames.has(t.name)) {
      const schemaType: SchemaType = {
        name: t.name,
        kind: t.kind,
        description: t.description ?? undefined,
        fields: t.fields ? mapFields(t.fields) : undefined,
        inputFields: t.inputFields ? mapInputValues(t.inputFields) : undefined,
        enumValues: t.enumValues
          ? t.enumValues.map((ev) => ({
              name: ev.name,
              description: ev.description ?? undefined,
            }))
          : undefined,
      };
      types.push(schemaType);
    }
  }

  types.sort((a, b) => a.name.localeCompare(b.name));

  return { queries, mutations, subscriptions, types };
}

export interface IntrospectionOptions {
  endpoint: string;
  authType?: 'none' | 'bearer' | 'apikey' | 'custom';
  authValue?: string;
  authHeader?: string;
}

export interface IntrospectionSuccess {
  ok: true;
  schema: SchemaData;
  raw: IntrospectionSchema;
}

export interface IntrospectionFailure {
  ok: false;
  error: string;
}

export type IntrospectionResponse = IntrospectionSuccess | IntrospectionFailure;

export async function fetchIntrospection(
  options: IntrospectionOptions,
): Promise<IntrospectionResponse> {
  const { endpoint, authType = 'none', authValue = '', authHeader = 'Authorization' } = options;

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

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: INTROSPECTION_QUERY }),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  let result: IntrospectionResult;
  try {
    result = (await response.json()) as IntrospectionResult;
  } catch {
    return { ok: false, error: 'Failed to parse JSON response' };
  }

  if (result.errors && result.errors.length > 0) {
    return {
      ok: false,
      error: result.errors.map((e) => e.message).join(', '),
    };
  }

  if (!result.data?.__schema) {
    return { ok: false, error: 'No schema data in response' };
  }

  const raw = result.data.__schema;
  const schema = parseIntrospectionSchema(raw);

  return { ok: true, schema, raw };
}
