import * as React from 'react';
import { useRef, useEffect, useCallback } from 'react';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Register only the languages we need
hljs.registerLanguage('json', json);

// Lazy-load graphql language to avoid bundling it when not needed
let graphqlRegistered = false;
async function ensureGraphQL() {
  if (graphqlRegistered) return;
  const { default: graphqlLang } = await import('highlight.js/lib/languages/graphql');
  hljs.registerLanguage('graphql', graphqlLang);
  graphqlRegistered = true;
}

interface CodeBlockProps {
  content: string;
  language?: 'json' | 'graphql';
  className?: string;
}

export function CodeBlock({ content, language = 'json', className }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    let cancelled = false;
    async function highlight() {
      if (language === 'graphql') await ensureGraphQL();
      if (cancelled || !codeRef.current) return;
      codeRef.current.removeAttribute('data-highlighted');
      codeRef.current.textContent = content;
      hljs.highlightElement(codeRef.current);
    }
    highlight();
    return () => { cancelled = true; };
  }, [content, language]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [content]);

  return (
    <div className={cn('relative group rounded border bg-muted/40', className)}>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-1 right-1 h-6 px-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={handleCopy}
      >
        {copied ? 'Copied!' : 'Copy'}
      </Button>
      <pre className="overflow-auto text-xs p-3 pr-14 max-h-64 m-0">
        <code ref={codeRef} className={`language-${language} hljs`}>
          {content}
        </code>
      </pre>
    </div>
  );
}
