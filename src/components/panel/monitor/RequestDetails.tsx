import * as React from 'react';
import { useState } from 'react';
import type { LogEntry } from '@/types/requests';
import { CodeBlock } from './CodeBlock';
import { cn } from '@/lib/utils';

interface RequestDetailsProps {
  request: LogEntry;
}

interface SectionProps {
  title: string;
  content: string;
  language?: 'json' | 'graphql';
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, content, language = 'json', defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border rounded mb-2">
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <span className={cn('text-muted-foreground transition-transform text-[10px]', open && 'rotate-90')}>
          ▶
        </span>
      </button>
      {open && (
        <div className="p-2 pt-0">
          <CodeBlock content={content} language={language} />
        </div>
      )}
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function RequestDetails({ request }: RequestDetailsProps) {
  const hasHeaders = !!(request.requestHeaders || request.responseHeaders);

  const headersContent = safeStringify({
    ...(request.requestHeaders ? { request: request.requestHeaders } : {}),
    ...(request.responseHeaders ? { response: request.responseHeaders } : {}),
  });

  return (
    <div className="p-2 border-t bg-background/50">
      {/* GraphQL sections */}
      {request.requestType === 'graphql' && request.query && (
        <CollapsibleSection
          title="Query"
          content={request.query}
          language="graphql"
          defaultOpen
        />
      )}
      {request.requestType === 'graphql' && request.variables && (
        <CollapsibleSection
          title="Variables"
          content={safeStringify(request.variables)}
          language="json"
        />
      )}

      {/* REST body */}
      {request.requestType === 'rest' && request.body !== undefined && (
        <CollapsibleSection
          title="Request Body"
          content={typeof request.body === 'string' ? request.body : safeStringify(request.body)}
          language="json"
          defaultOpen
        />
      )}

      {/* Response */}
      {request.response !== undefined ? (
        <CollapsibleSection
          title="Response"
          content={typeof request.response === 'string' ? request.response : safeStringify(request.response)}
          language="json"
          defaultOpen
        />
      ) : request.responseError ? (
        <CollapsibleSection
          title="Error"
          content={request.responseError}
          language="json"
        />
      ) : (
        <div className="text-xs text-muted-foreground px-1 py-2">Response pending...</div>
      )}

      {/* Headers */}
      {hasHeaders && (
        <CollapsibleSection
          title="Headers"
          content={headersContent}
          language="json"
        />
      )}

      {/* URL (always shown) */}
      <div className="text-[10px] text-muted-foreground px-1 pt-1 break-all">
        {request.url}
      </div>
    </div>
  );
}
