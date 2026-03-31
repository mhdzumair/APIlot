import * as React from 'react';
import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useMonitorStore } from '@/stores/useMonitorStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useRulesStore } from '@/stores/useRulesStore';
import { browser } from '@/lib/browser';
import type { LogEntry } from '@/types/requests';

type AIMode = 'single' | 'multi';
type ResponseMode = 'sanitized' | 'realistic' | 'error' | 'empty';

interface GenerateResult {
  success: boolean;
  data?: unknown;
  mocks?: unknown[];
  error?: string;
  provider?: string;
  model?: string;
  generationTime?: number;
  tokensUsed?: number;
}

function getRequestDisplayName(request: LogEntry): string {
  return (
    request.operationName ??
    request.endpoint ??
    (request.url ? request.url.split('/').pop() ?? request.url : 'Request')
  );
}

function buildMockRequest(request: LogEntry, responseMode: ResponseMode) {
  const isRest = request.requestType === 'rest' || !request.query;
  return {
    requestType: isRest ? 'rest' : 'graphql',
    url: request.url,
    method: request.method ?? 'GET',
    operationName: request.operationName,
    query: request.query,
    variables: request.variables,
    endpoint: request.endpoint,
    response: request.response,
    responseMode,
  };
}

export function AIMockDialog() {
  const { aiMockRequest, requestLog, setAiMockRequest } = useMonitorStore();
  const { aiSettings } = useSettingsStore();
  const { addRule } = useRulesStore();

  const [mode, setMode] = useState<AIMode>('single');
  const [responseMode, setResponseMode] = useState<ResponseMode>('sanitized');
  const [userInstructions, setUserInstructions] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [copied, setCopied] = useState(false);

  const open = aiMockRequest !== null;

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setAiMockRequest(null);
        setResult(null);
        setUserInstructions('');
        setMode('single');
        setSelectedIds(new Set());
        setIsGenerating(false);
        setCopied(false);
      }
    },
    [setAiMockRequest]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!aiMockRequest) return;

    const requestsToMock =
      mode === 'multi' && selectedIds.size > 0
        ? requestLog.filter((r) => selectedIds.has(r.id))
        : [aiMockRequest];

    setIsGenerating(true);
    setResult(null);

    try {
      // Build payload for background messaging
      const mockRequests = requestsToMock.map((r) => buildMockRequest(r, responseMode));
      const options = { userContext: userInstructions, responseMode };

      let response: GenerateResult;
      if (mockRequests.length > 1) {
        // Use browser.runtime.sendMessage directly for multi-mock
        response = await (browser.runtime.sendMessage({
          type: 'GENERATE_AI_MOCK',
          requests: mockRequests,
          options,
          multi: true,
        }) as Promise<GenerateResult>);
      } else {
        response = await (browser.runtime.sendMessage({
          type: 'GENERATE_AI_MOCK',
          request: mockRequests[0],
          options,
          multi: false,
        }) as Promise<GenerateResult>);
      }

      setResult(response ?? { success: false, error: 'No response from background' });
    } catch (err) {
      setResult({ success: false, error: (err as Error).message });
    } finally {
      setIsGenerating(false);
    }
  }, [aiMockRequest, mode, selectedIds, requestLog, responseMode, userInstructions]);

  const handleCopy = useCallback(() => {
    if (!result?.success) return;
    const text =
      result.mocks != null
        ? JSON.stringify(result.mocks, null, 2)
        : JSON.stringify(result.data, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  const handleApplyAsRule = useCallback(() => {
    if (!aiMockRequest || !result?.success) return;
    const mockData = result.data;
    const isRest = aiMockRequest.requestType === 'rest' || !aiMockRequest.query;
    const ruleId = `rule_${Date.now()}`;

    addRule(ruleId, {
      id: ruleId,
      name: `AI Mock: ${getRequestDisplayName(aiMockRequest)}`,
      enabled: true,
      requestType: isRest ? 'rest' : 'graphql',
      urlPattern: aiMockRequest.url ?? '',
      operationName: aiMockRequest.operationName,
      action: 'mock',
      mockResponse: JSON.stringify(mockData, null, 2),
      statusCode: 200,
    });

    handleOpenChange(false);
  }, [aiMockRequest, result, addRule, handleOpenChange]);

  if (!aiMockRequest) return null;

  const isRest = aiMockRequest.requestType === 'rest' || !aiMockRequest.query;
  const providerLabel =
    aiSettings.provider !== 'local'
      ? `${aiSettings.provider} / ${isRest ? aiSettings.openaiModel : aiSettings.anthropicModel}`
      : 'Local Generation';

  const resultText = result?.success
    ? result.mocks != null
      ? JSON.stringify(result.mocks, null, 2)
      : JSON.stringify(result.data, null, 2)
    : '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            AI Mock Generation
            <Badge variant="outline" className="text-[10px] font-normal">
              {providerLabel}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Request info */}
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                isRest
                  ? 'border-blue-500/40 text-blue-600 dark:text-blue-400 text-[9px] px-1'
                  : 'border-pink-500/40 text-pink-600 dark:text-pink-400 text-[9px] px-1'
              }
            >
              {isRest ? 'REST' : 'GraphQL'}
            </Badge>
            {isRest && aiMockRequest.method && (
              <span className="font-mono font-bold">{aiMockRequest.method}</span>
            )}
            <span className="font-medium">{getRequestDisplayName(aiMockRequest)}</span>
          </div>
          <div className="text-muted-foreground truncate" title={aiMockRequest.url}>
            {aiMockRequest.url}
          </div>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2">
          {(['single', 'multi'] as AIMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground hover:bg-muted'
              }`}
            >
              {m === 'single' ? 'Single Request' : 'Multiple Requests'}
            </button>
          ))}
        </div>

        {/* Multi-select list */}
        {mode === 'multi' && (
          <div className="rounded-md border overflow-hidden">
            <div className="px-3 py-1.5 bg-muted/50 border-b flex justify-between text-xs text-muted-foreground">
              <span>Select requests to mock</span>
              <button
                className="text-primary hover:underline"
                onClick={() => {
                  if (selectedIds.size === requestLog.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(requestLog.map((r) => r.id)));
                  }
                }}
              >
                {selectedIds.size === requestLog.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y">
              {requestLog.map((req) => (
                <label
                  key={req.id}
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted/40 text-xs"
                >
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={selectedIds.has(req.id)}
                    onChange={() => toggleSelect(req.id)}
                  />
                  <Badge
                    variant="outline"
                    className={
                      req.requestType === 'graphql'
                        ? 'border-pink-500/40 text-pink-600 text-[9px] px-1'
                        : 'border-blue-500/40 text-blue-600 text-[9px] px-1'
                    }
                  >
                    {req.requestType.toUpperCase()}
                  </Badge>
                  <span className="truncate">{getRequestDisplayName(req)}</span>
                </label>
              ))}
              {requestLog.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No requests in log
                </div>
              )}
            </div>
            {selectedIds.size > 0 && (
              <div className="px-3 py-1.5 bg-muted/30 border-t text-xs text-muted-foreground">
                {selectedIds.size} request{selectedIds.size !== 1 ? 's' : ''} selected
              </div>
            )}
          </div>
        )}

        {/* Response mode */}
        <div className="space-y-1.5">
          <Label className="text-xs">Response Mode</Label>
          <Select value={responseMode} onValueChange={(v) => setResponseMode(v as ResponseMode)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sanitized" className="text-xs">Sanitized — realistic but anonymized</SelectItem>
              <SelectItem value="realistic" className="text-xs">Realistic — with plausible values</SelectItem>
              <SelectItem value="error" className="text-xs">Error — simulates an error response</SelectItem>
              <SelectItem value="empty" className="text-xs">Empty — minimal/null structure</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Instructions */}
        <div className="space-y-1.5">
          <Label className="text-xs">Additional Instructions (optional)</Label>
          <Textarea
            value={userInstructions}
            onChange={(e) => setUserInstructions(e.target.value)}
            placeholder="e.g. Include pagination, use realistic names, return 5 items..."
            className="text-xs min-h-[64px] resize-none"
          />
          <div className="flex flex-wrap gap-1">
            {['Add pagination', 'Use realistic data', 'Include errors', 'Return 5 items'].map(
              (suggestion) => (
                <button
                  key={suggestion}
                  onClick={() =>
                    setUserInstructions((prev) =>
                      prev ? `${prev}\n${suggestion}` : suggestion
                    )
                  }
                  className="rounded border px-2 py-0.5 text-[10px] hover:bg-muted transition-colors"
                >
                  {suggestion}
                </button>
              )
            )}
          </div>
        </div>

        {/* Loading state */}
        {isGenerating && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <svg
              className="animate-spin h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>Generating mock with {aiSettings.provider}...</span>
          </div>
        )}

        {/* Error state */}
        {!isGenerating && result && !result.success && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            <div className="font-medium mb-0.5">Generation failed</div>
            <div>{result.error}</div>
          </div>
        )}

        {/* Result */}
        {!isGenerating && result?.success && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Generated Mock</Label>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {result.provider && <span>{result.provider}</span>}
                {result.generationTime && <span>{result.generationTime}ms</span>}
                {result.tokensUsed != null && result.tokensUsed > 0 && (
                  <span>{result.tokensUsed} tokens</span>
                )}
              </div>
            </div>
            <div className="relative rounded-md border bg-muted/20">
              <pre className="p-3 text-[10px] font-mono overflow-auto max-h-64 whitespace-pre-wrap break-all">
                {resultText}
              </pre>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap sm:flex-nowrap">
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>

          {result?.success && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={copied}
              >
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyAsRule}
              >
                Apply as Rule
              </Button>
            </>
          )}

          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating || (mode === 'multi' && selectedIds.size === 0)}
          >
            {isGenerating ? 'Generating...' : result?.success ? 'Regenerate' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
