/**
 * Utility functions for displaying request information.
 * Ported from getOperationDisplayName() in src-legacy/devtools/panel.js.
 */

import type { LogEntry } from '@/types/requests';

/**
 * Returns a human-readable display name for a request.
 * For GraphQL: uses operationName or parses from query string.
 * For REST: returns "METHOD /path".
 */
export function getOperationDisplayName(request: LogEntry): string {
  if (request.requestType === 'graphql') {
    if (request.operationName) {
      return request.operationName;
    }
    // Try to parse operation name from the query string
    if (request.query) {
      const match = request.query.match(
        /(?:query|mutation|subscription)\s+(\w+)/i
      );
      if (match) {
        return match[1];
      }
      // Return first meaningful word of query
      const firstLine = request.query.trim().split('\n')[0].trim();
      if (firstLine.length > 0 && firstLine.length <= 60) {
        return firstLine;
      }
    }
    return 'Anonymous Operation';
  }

  // Static asset — show filename
  if (request.requestType === 'static') {
    if (request.operationName) return request.operationName;
    try {
      const pathname = new URL(request.url).pathname;
      const segments = pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] || pathname;
    } catch {
      return request.url;
    }
  }

  // REST request
  const method = request.method ?? 'GET';
  const path = request.path ?? request.endpoint ?? new URL(request.url).pathname;
  return `${method} ${path}`;
}

/**
 * Returns the HTTP method to display for a request.
 */
export function getRequestMethod(request: LogEntry): string {
  if (request.requestType === 'graphql') {
    return 'POST';
  }
  return request.method ?? 'GET';
}

/**
 * Returns true if the entry is a static asset (JS, CSS, HTML, etc.)
 */
export function isStaticEntry(request: LogEntry): boolean {
  return request.requestType === 'static';
}

/**
 * Returns the CSS color variant for a status code.
 */
export function getStatusVariant(
  status: number | undefined
): 'success' | 'warning' | 'error' | 'pending' {
  if (status === undefined) return 'pending';
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'warning';
  return 'error';
}

/**
 * Returns a display string for request timing.
 */
export function getTimingDisplay(request: LogEntry): string {
  if (request.responseTime !== undefined) {
    return `${request.responseTime}ms`;
  }
  return '...';
}
