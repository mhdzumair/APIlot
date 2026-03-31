import * as React from 'react';
import { useRef, useEffect, useCallback } from 'react';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

hljs.registerLanguage('json', json);

let graphqlRegistered = false;
async function ensureGraphQL() {
  if (graphqlRegistered) return;
  const { default: graphqlLang } = await import('highlight.js/lib/languages/graphql');
  hljs.registerLanguage('graphql', graphqlLang);
  graphqlRegistered = true;
}

/**
 * Walk all text nodes under `root` and wrap matches for `term` in <mark> elements.
 * Uses TreeWalker so it's safe — only touches text nodes, never HTML structure.
 */
function applyHighlights(root: HTMLElement, term: string) {
  // Remove any previous marks first
  root.querySelectorAll('mark.apilot-match').forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(m.textContent ?? ''), m);
    parent.normalize();
  });

  if (!term.trim()) return;

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? '';
    if (!regex.test(text)) continue;
    regex.lastIndex = 0;

    const parent = textNode.parentNode;
    if (!parent) continue;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const mark = document.createElement('mark');
      mark.className = 'apilot-match';
      mark.textContent = match[0];
      fragment.appendChild(mark);
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    parent.replaceChild(fragment, textNode);
  }
}

interface CodeBlockProps {
  content: string;
  language?: 'json' | 'graphql';
  className?: string;
  searchTerm?: string;
}

export function CodeBlock({ content, language = 'json', className, searchTerm = '' }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = React.useState(false);

  // Syntax highlight
  useEffect(() => {
    let cancelled = false;
    async function highlight() {
      if (language === 'graphql') await ensureGraphQL();
      if (cancelled || !codeRef.current) return;
      codeRef.current.removeAttribute('data-highlighted');
      codeRef.current.textContent = content;
      hljs.highlightElement(codeRef.current);
      // Apply search highlights after syntax highlighting
      if (searchTerm.trim()) {
        applyHighlights(codeRef.current, searchTerm);
      }
    }
    highlight();
    return () => { cancelled = true; };
  }, [content, language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply search highlights when searchTerm changes (syntax already applied)
  useEffect(() => {
    if (!codeRef.current) return;
    applyHighlights(codeRef.current, searchTerm);
  }, [searchTerm]);

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
        className="absolute top-1 right-1 h-5 px-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity z-10 font-mono"
        onClick={handleCopy}
      >
        {copied ? '✓ copied' : 'copy'}
      </Button>
      <pre className="overflow-auto text-xs p-3 pr-14 max-h-64 m-0">
        <code ref={codeRef} className={`language-${language} hljs`}>
          {content}
        </code>
      </pre>
    </div>
  );
}
