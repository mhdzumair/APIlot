import type { LogEntry } from '@/types/requests';

// HAR 1.2 types (minimal surface needed for our use case)
interface HARNameValue { name: string; value: string }
interface HARPostData { mimeType: string; text: string }
interface HARContent { size: number; mimeType: string; text?: string }
interface HARRequest {
  method: string;
  url: string;
  httpVersion: string;
  headers: HARNameValue[];
  queryString: HARNameValue[];
  postData?: HARPostData;
  headersSize: number;
  bodySize: number;
}
interface HARResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: HARNameValue[];
  content: HARContent;
  redirectURL: string;
  headersSize: number;
  bodySize: number;
}
interface HARTimings { send: number; wait: number; receive: number }
interface HAREntry {
  startedDateTime: string;
  time: number;
  request: HARRequest;
  response: HARResponse;
  timings: HARTimings;
  cache: Record<string, never>;
}
interface HARLog {
  version: string;
  creator: { name: string; version: string };
  entries: HAREntry[];
}
export interface HARRoot { log: HARLog }

function toNameValue(obj?: Record<string, string>): HARNameValue[] {
  if (!obj) return [];
  return Object.entries(obj).map(([name, value]) => ({ name, value }));
}

function bodyText(body: unknown): string {
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  try { return JSON.stringify(body); } catch { return String(body); }
}

function mimeFromHeaders(headers?: Record<string, string>): string {
  if (!headers) return 'application/json';
  return (
    headers['content-type'] ??
    headers['Content-Type'] ??
    'application/json'
  ).split(';')[0].trim();
}

export function harExport(entries: LogEntry[]): HARRoot {
  const harEntries: HAREntry[] = entries.map((e) => {
    const startedDateTime = e.timestamp
      ? new Date(e.timestamp).toISOString()
      : new Date(e.startTime).toISOString();

    const method = (e.method ?? (e.requestType === 'graphql' ? 'POST' : 'GET')).toUpperCase();

    // Build URL with query params if available
    let url = e.url ?? '';
    if (e.queryParams && Object.keys(e.queryParams).length > 0) {
      try {
        const u = new URL(url);
        Object.entries(e.queryParams).forEach(([k, v]) => u.searchParams.set(k, v));
        url = u.toString();
      } catch { /* keep original url */ }
    }

    // Query string from URL
    let queryString: HARNameValue[] = [];
    try {
      queryString = Array.from(new URL(url).searchParams.entries()).map(([name, value]) => ({
        name,
        value,
      }));
    } catch { /* ignore */ }

    // Request body
    let postData: HARPostData | undefined;
    const reqBody = e.requestType === 'graphql'
      ? JSON.stringify({ operationName: e.operationName, query: e.query, variables: e.variables })
      : bodyText(e.body);
    if (reqBody && method !== 'GET') {
      postData = {
        mimeType: mimeFromHeaders(e.requestHeaders),
        text: reqBody,
      };
    }

    // Response body
    const respText = bodyText(e.response);
    const respSize = e.transferSize ?? (respText ? new TextEncoder().encode(respText).length : -1);

    const totalTime = e.responseTime ?? 0;

    return {
      startedDateTime,
      time: totalTime,
      cache: {},
      request: {
        method,
        url,
        httpVersion: 'HTTP/1.1',
        headers: toNameValue(e.requestHeaders),
        queryString,
        postData,
        headersSize: -1,
        bodySize: postData ? new TextEncoder().encode(postData.text).length : 0,
      },
      response: {
        status: e.responseStatus ?? 0,
        statusText: e.responseStatusText ?? '',
        httpVersion: 'HTTP/1.1',
        headers: toNameValue(e.responseHeaders),
        content: {
          size: respSize,
          mimeType: mimeFromHeaders(e.responseHeaders),
          text: respText || undefined,
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: respSize,
      },
      timings: {
        send: 0,
        wait: totalTime,
        receive: 0,
      },
    };
  });

  return {
    log: {
      version: '1.2',
      creator: { name: 'APIlot', version: '1.0.0' },
      entries: harEntries,
    },
  };
}

export function downloadHAR(entries: LogEntry[], filename?: string): void {
  const har = harExport(entries);
  const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `apilot-capture-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.har`;
  a.click();
  URL.revokeObjectURL(url);
}
