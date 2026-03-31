import { create } from 'zustand';

export interface SchemaField {
  name: string;
  type: string;
  description?: string;
  args?: SchemaField[];
  fields?: SchemaField[];
  isNonNull?: boolean;
  isList?: boolean;
}

export interface SchemaType {
  name: string;
  kind: string;
  description?: string;
  fields?: SchemaField[];
  inputFields?: SchemaField[];
  enumValues?: { name: string; description?: string }[];
}

export interface SchemaData {
  queries: SchemaField[];
  mutations: SchemaField[];
  subscriptions: SchemaField[];
  types: SchemaType[];
}

interface SchemaState {
  selectedEndpoint: string | null;
  detectedEndpoints: string[];
  schema: SchemaData | null;
  schemaRaw: unknown;
  loading: boolean;
  error: string | null;
  authType: 'none' | 'bearer' | 'apikey' | 'custom';
  authValue: string;
  authHeader: string;

  setSelectedEndpoint: (endpoint: string | null) => void;
  setDetectedEndpoints: (endpoints: string[]) => void;
  setSchema: (schema: SchemaData | null, raw?: unknown) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setAuth: (type: SchemaState['authType'], value: string, header?: string) => void;
}

export const useSchemaStore = create<SchemaState>((set) => ({
  selectedEndpoint: null,
  detectedEndpoints: [],
  schema: null,
  schemaRaw: null,
  loading: false,
  error: null,
  authType: 'none',
  authValue: '',
  authHeader: 'Authorization',

  setSelectedEndpoint: (endpoint) => set({ selectedEndpoint: endpoint }),

  setDetectedEndpoints: (endpoints) => set({ detectedEndpoints: endpoints }),

  setSchema: (schema, raw) =>
    set({ schema, schemaRaw: raw ?? null, error: null }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  setAuth: (type, value, header) =>
    set((state) => ({
      authType: type,
      authValue: value,
      authHeader: header ?? state.authHeader,
    })),
}));
