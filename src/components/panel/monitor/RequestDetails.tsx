import * as React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import type { LogEntry } from '@/types/requests';
import { CodeBlock } from './CodeBlock';
import { cn } from '@/lib/utils';

interface RequestDetailsProps {
  request: LogEntry;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

interface Section {
  title: string;
  content: string;
  language: 'json' | 'graphql';
}

function CollapsibleSection({
  title,
  content,
  language = 'json',
  forceOpen = false,
  searchTerm = '',
  onHover,
}: Section & { forceOpen?: boolean; searchTerm?: string; onHover?: (title: string | null) => void }) {
  const [open, setOpen] = useState(false);

  // Force open when a search term matches this section
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const matchCount = useMemo(() => {
    if (!searchTerm.trim()) return 0;
    const term = searchTerm.toLowerCase();
    let count = 0;
    let idx = content.toLowerCase().indexOf(term);
    while (idx !== -1) {
      count++;
      idx = content.toLowerCase().indexOf(term, idx + 1);
    }
    return count;
  }, [content, searchTerm]);

  const hasMatch = matchCount > 0;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={cn('border rounded mb-2', hasMatch && searchTerm && 'border-primary/40')}
      onMouseEnter={() => onHover?.(title)}
      onMouseLeave={() => onHover?.(null)}
      role="region"
      aria-label={title}
    >
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">
          {title}
          {hasMatch && searchTerm && (
            <span className="text-[9px] font-medium bg-primary/20 text-primary px-1.5 py-0.5 rounded">
              {matchCount} match{matchCount !== 1 ? 'es' : ''}
            </span>
          )}
        </span>
        <span className={cn('text-muted-foreground transition-transform text-[10px]', open && 'rotate-90')}>
          ▶
        </span>
      </button>
      {open && (
        <div className="p-2 pt-0">
          <CodeBlock content={content} language={language} searchTerm={searchTerm} />
        </div>
      )}
    </div>
  );
}

export function RequestDetails({ request }: RequestDetailsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchScope, setSearchScope] = useState<string | null>(null);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const hasHeaders = !!(request.requestHeaders || request.responseHeaders);

  const headersContent = safeStringify({
    ...(request.requestHeaders ? { request: request.requestHeaders } : {}),
    ...(request.responseHeaders ? { response: request.responseHeaders } : {}),
  });

  const statusColor =
    !request.responseStatus
      ? 'text-muted-foreground'
      : request.responseStatus < 300
      ? 'text-green-500'
      : request.responseStatus < 400
      ? 'text-yellow-500'
      : 'text-red-500';

  // Ctrl+F — scope to hovered section if inside one, otherwise all
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setSearchScope(hoveredSection); // null = all sections
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchTerm('');
        setSearchScope(null);
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [showSearch, hoveredSection]);

  const queryContent = request.query ?? '';
  const variablesContent = request.variables ? safeStringify(request.variables) : '';
  const bodyContent =
    request.body !== undefined
      ? typeof request.body === 'string'
        ? request.body
        : safeStringify(request.body)
      : '';
  const responseContent =
    request.response !== undefined
      ? typeof request.response === 'string'
        ? request.response
        : safeStringify(request.response)
      : '';
  const errorContent = request.responseError ?? '';

  const term = searchTerm.toLowerCase().trim();

  function matches(content: string) {
    return term !== '' && content.toLowerCase().includes(term);
  }

  // Determine search term for each section based on scope
  function sectionTerm(sectionTitle: string): string {
    if (!showSearch || !searchTerm.trim()) return '';
    if (searchScope === null || searchScope === sectionTitle) return searchTerm;
    return '';
  }

  return (
    <div className="p-3 border-t bg-card/30 space-y-2">
      {/* URL + status bar */}
      <div className="flex items-start gap-2 text-xs">
        <span className={`font-semibold tabular-nums shrink-0 ${statusColor}`}>
          {request.responseStatus ?? '—'}
        </span>
        <span className="text-muted-foreground break-all leading-relaxed flex-1">{request.url}</span>
        <button
          className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border hover:border-border border-transparent transition-colors"
          title="Search in details (Ctrl+F) — hover a section first to scope the search"
          onClick={() => {
            setSearchScope(hoveredSection);
            setShowSearch((v) => !v);
            if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 0);
          }}
        >
          ⌕ Find
        </button>
      </div>

      {/* In-details search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground shrink-0">
            {searchScope ? `in ${searchScope}:` : 'all:'}
          </span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={searchScope ? `Search in ${searchScope}…` : 'Search all sections…'}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60 min-w-0"
          />
          {searchTerm && searchScope === null && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {[queryContent, variablesContent, bodyContent, responseContent, errorContent, headersContent]
                .join('\n')
                .toLowerCase()
                .split(term)
                .length - 1} found
            </span>
          )}
          <button
            onClick={() => { setShowSearch(false); setSearchTerm(''); setSearchScope(null); }}
            className="text-[10px] text-muted-foreground hover:text-foreground shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* GraphQL sections */}
      {request.requestType === 'graphql' && request.query && (
        <CollapsibleSection
          title="Query"
          content={queryContent}
          language="graphql"
          forceOpen={matches(sectionTerm('Query')) && sectionTerm('Query') !== ''}
          searchTerm={sectionTerm('Query')}
          onHover={setHoveredSection}
        />
      )}
      {request.requestType === 'graphql' && request.variables && (
        <CollapsibleSection
          title="Variables"
          content={variablesContent}
          language="json"
          forceOpen={matches(sectionTerm('Variables')) && sectionTerm('Variables') !== ''}
          searchTerm={sectionTerm('Variables')}
          onHover={setHoveredSection}
        />
      )}

      {/* REST body */}
      {request.requestType === 'rest' && request.body !== undefined && (
        <CollapsibleSection
          title="Request Body"
          content={bodyContent}
          language="json"
          forceOpen={matches(sectionTerm('Request Body')) && sectionTerm('Request Body') !== ''}
          searchTerm={sectionTerm('Request Body')}
          onHover={setHoveredSection}
        />
      )}

      {/* Response */}
      {request.response !== undefined ? (
        <CollapsibleSection
          title="Response"
          content={responseContent}
          language="json"
          forceOpen={matches(sectionTerm('Response')) && sectionTerm('Response') !== ''}
          searchTerm={sectionTerm('Response')}
          onHover={setHoveredSection}
        />
      ) : request.responseError ? (
        <CollapsibleSection
          title="Error"
          content={errorContent}
          language="json"
          forceOpen={matches(sectionTerm('Error')) && sectionTerm('Error') !== ''}
          searchTerm={sectionTerm('Error')}
          onHover={setHoveredSection}
        />
      ) : (
        <div className="text-xs text-muted-foreground py-1">Response pending…</div>
      )}

      {/* Headers */}
      {hasHeaders && (
        <CollapsibleSection
          title="Headers"
          content={headersContent}
          language="json"
          forceOpen={matches(sectionTerm('Headers')) && sectionTerm('Headers') !== ''}
          searchTerm={sectionTerm('Headers')}
          onHover={setHoveredSection}
        />
      )}
    </div>
  );
}
