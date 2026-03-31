/**
 * API rule types for APIlot.
 * Derived from src-legacy/background/core.js rule structure and
 * src-legacy/shared/apilot-rule-match.js matching logic.
 */

export type RequestType = 'graphql' | 'rest' | 'both';
export type RuleAction = 'mock' | 'delay' | 'block' | 'modify' | 'passthrough' | 'redirect';

export interface ApiRule {
  id: string;
  name: string;
  enabled: boolean;
  requestType: RequestType;
  createdAt?: string;

  // GraphQL-specific fields
  operationName?: string;
  operationType?: 'query' | 'mutation' | 'subscription';
  /** GraphQL endpoint path pattern (e.g. /graphql) */
  graphqlEndpoint?: string;
  query?: string;
  variables?: Record<string, unknown>;

  // REST-specific fields
  /** HTTP method (GET, POST, etc.) or 'ALL' */
  httpMethod?: string;
  /** Full path pattern with :param and * support */
  restPath?: string;
  /** Last path segment pattern */
  restEndpoint?: string;
  /** Query parameter filter map */
  queryFilter?: Record<string, string>;
  /** Regex pattern matched against request body string */
  bodyPattern?: string;

  // Common matching fields
  /** URL/host pattern (supports wildcards and /regex/) */
  urlPattern?: string;

  // Action configuration
  action: RuleAction;
  mockResponse?: string;
  delay?: number;
  statusCode?: number;
  headers?: Record<string, string>;
  priority?: number;

  // Redirect action fields
  redirectUrl?: string;
  /** Preserve the source URL path when redirecting */
  redirectPreservePath?: boolean;
  /** Only redirect the filename portion of the path */
  redirectFilenameOnly?: boolean;
}
