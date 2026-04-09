import * as React from 'react';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { sendMsg } from '@/lib/messaging';
import { useRulesStore } from '@/stores/useRulesStore';
import type { ApiRule, RequestType, RuleAction } from '@/types/rules';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RuleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided the dialog is in edit mode */
  editingRuleId?: string | null;
  editingRule?: ApiRule | null;
}

// ---------------------------------------------------------------------------
// Default form state
// ---------------------------------------------------------------------------

interface FormState {
  name: string;
  enabled: boolean;
  requestType: RequestType;
  urlPattern: string;
  action: RuleAction;
  // GraphQL-specific
  operationName: string;
  operationType: string;
  graphqlEndpoint: string;
  // REST-specific
  httpMethod: string;
  restPath: string;
  restEndpoint: string;
  queryFilter: string;
  bodyPattern: string;
  // Mock action
  mockResponse: string;
  statusCode: string;
  // Delay action
  delayMs: string;
  // Redirect action
  redirectUrl: string;
  redirectPreservePath: boolean;
  redirectFilenameOnly: boolean;
}

function requestTypeShortLabel(rt: RequestType): string {
  switch (rt) {
    case 'graphql':
      return 'GraphQL';
    case 'rest':
      return 'REST';
    case 'both':
      return 'GQL + REST';
    case 'static':
      return 'Static';
  }
}

function actionNamePrefix(action: RuleAction, delayMsField: string): string {
  if (action === 'delay') {
    const ms = parseInt(delayMsField, 10);
    return `Delay ${Number.isNaN(ms) ? delayMsField || '0' : ms}ms`;
  }
  switch (action) {
    case 'mock':
      return 'Mock';
    case 'block':
      return 'Block';
    case 'modify':
      return 'Modify';
    case 'redirect':
      return 'Redirect';
    case 'passthrough':
      return 'Passthrough';
    default:
      return action;
  }
}

/** Suggested name for new rules; updates with type/action until the user edits the name field. */
function buildAutoRuleName(form: FormState): string {
  const kind = requestTypeShortLabel(form.requestType);
  const head = actionNamePrefix(form.action, form.delayMs);
  let detail = '';

  if (form.requestType === 'graphql' || form.requestType === 'both') {
    detail = form.operationName.trim();
  }
  if (!detail && (form.requestType === 'rest' || form.requestType === 'both')) {
    detail =
      form.restEndpoint.trim() ||
      form.restPath.trim() ||
      (form.httpMethod && form.httpMethod !== 'ALL' ? form.httpMethod : '');
  }
  if (!detail && form.requestType === 'static') {
    detail =
      form.restEndpoint.trim() || form.restPath.trim() || form.urlPattern.trim();
  }
  if (!detail && (form.requestType === 'graphql' || form.requestType === 'both')) {
    detail = form.graphqlEndpoint.trim() || form.urlPattern.trim();
  }
  if (!detail) {
    detail = form.urlPattern.trim() || 'Request';
  }
  const short = detail.length > 40 ? `${detail.slice(0, 37)}…` : detail;
  return `${head} · ${kind} · ${short}`;
}

const DEFAULT_FORM: FormState = {
  name: '',
  enabled: true,
  requestType: 'graphql',
  urlPattern: '',
  action: 'mock',
  operationName: '',
  operationType: '',
  graphqlEndpoint: '',
  httpMethod: 'ALL',
  restPath: '',
  restEndpoint: '',
  queryFilter: '',
  bodyPattern: '',
  mockResponse: '{\n  "data": {}\n}',
  statusCode: '200',
  delayMs: '1000',
  redirectUrl: '',
  redirectPreservePath: false,
  redirectFilenameOnly: false,
};

// ---------------------------------------------------------------------------
// RuleEditorDialog
// ---------------------------------------------------------------------------

export function RuleEditorDialog({
  open,
  onOpenChange,
  editingRuleId,
  editingRule,
}: RuleEditorDialogProps) {
  const { addRule, updateRule } = useRulesStore();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  /** When false on create flows, rule name tracks type/action/target fields automatically. */
  const nameUserEditedRef = useRef(false);

  const isEditing = !!editingRuleId && !!editingRule;

  // Populate form when editing OR pre-filling from a captured request (layout: before sync effect).
  useLayoutEffect(() => {
    if (open) {
      nameUserEditedRef.current = isEditing;
    }
    if (open && editingRule) {
      const next: FormState = {
        name: editingRule.name ?? '',
        enabled: editingRule.enabled ?? true,
        requestType: editingRule.requestType ?? 'graphql',
        urlPattern: editingRule.urlPattern ?? '',
        action: editingRule.action ?? 'mock',
        operationName: editingRule.operationName ?? '',
        operationType: editingRule.operationType ?? '',
        graphqlEndpoint: editingRule.graphqlEndpoint ?? '',
        httpMethod: editingRule.httpMethod ?? 'ALL',
        restPath: editingRule.restPath ?? '',
        restEndpoint: editingRule.restEndpoint ?? '',
        queryFilter: editingRule.queryFilter
          ? JSON.stringify(editingRule.queryFilter, null, 2)
          : '',
        bodyPattern: editingRule.bodyPattern ?? '',
        mockResponse:
          editingRule.mockResponse != null
            ? typeof editingRule.mockResponse === 'string'
              ? editingRule.mockResponse
              : JSON.stringify(editingRule.mockResponse, null, 2)
            : '{\n  "data": {}\n}',
        statusCode: editingRule.statusCode != null ? String(editingRule.statusCode) : '200',
        delayMs: editingRule.delay != null ? String(editingRule.delay) : '1000',
        redirectUrl: editingRule.redirectUrl ?? '',
        redirectPreservePath: editingRule.redirectPreservePath ?? false,
        redirectFilenameOnly: editingRule.redirectFilenameOnly ?? false,
      };
      if (!isEditing) {
        next.name = next.name.trim() ? next.name.trim() : buildAutoRuleName(next);
      }
      setForm(next);
    } else if (open && !editingRule) {
      const next = { ...DEFAULT_FORM };
      next.name = buildAutoRuleName(next);
      setForm(next);
    }
  }, [open, editingRule, isEditing]);

  // Keep suggested title in sync when user changes type/action/match fields (create only).
  useEffect(() => {
    if (!open || isEditing || nameUserEditedRef.current) return;
    setForm((prev) => {
      const next = buildAutoRuleName(prev);
      return next === prev.name ? prev : { ...prev, name: next };
    });
  }, [
    open,
    isEditing,
    form.requestType,
    form.action,
    form.delayMs,
    form.operationName,
    form.restPath,
    form.restEndpoint,
    form.graphqlEndpoint,
    form.urlPattern,
    form.httpMethod,
  ]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error('Rule name is required.');
      return;
    }

    // Build the rule object (without id — background assigns it)
    const ruleData: Omit<ApiRule, 'id'> = {
      name: form.name.trim(),
      enabled: form.enabled,
      requestType: form.requestType,
      action: form.action,
    };

    if (form.urlPattern.trim()) {
      ruleData.urlPattern = form.urlPattern.trim();
    }

    // GraphQL-specific
    if (form.requestType === 'graphql' || form.requestType === 'both') {
      if (form.operationName.trim()) ruleData.operationName = form.operationName.trim();
      if (form.operationType) ruleData.operationType = form.operationType as ApiRule['operationType'];
      if (form.graphqlEndpoint.trim()) ruleData.graphqlEndpoint = form.graphqlEndpoint.trim();
    }

    // REST-specific
    if (form.requestType === 'rest' || form.requestType === 'both') {
      ruleData.httpMethod = form.httpMethod || 'ALL';
      if (form.restPath.trim()) ruleData.restPath = form.restPath.trim();
      if (form.restEndpoint.trim()) ruleData.restEndpoint = form.restEndpoint.trim();
      if (form.bodyPattern.trim()) ruleData.bodyPattern = form.bodyPattern.trim();
      if (form.queryFilter.trim()) {
        try {
          ruleData.queryFilter = JSON.parse(form.queryFilter.trim());
        } catch {
          toast.error('Invalid JSON in Query Parameter Filter.');
          return;
        }
      }
    }

    // Static-specific: path/endpoint used for DNR regexFilter construction
    if (form.requestType === 'static') {
      if (form.restPath.trim()) ruleData.restPath = form.restPath.trim();
      if (form.restEndpoint.trim()) ruleData.restEndpoint = form.restEndpoint.trim();
    }

    // Action-specific
    if (form.action === 'mock') {
      try {
        ruleData.mockResponse = form.mockResponse.trim()
          ? JSON.parse(form.mockResponse.trim())
          : undefined;
      } catch {
        toast.error('Invalid JSON in mock response body.');
        return;
      }
      const sc = parseInt(form.statusCode, 10);
      if (!Number.isNaN(sc)) ruleData.statusCode = sc;
    } else if (form.action === 'delay') {
      const ms = parseInt(form.delayMs, 10);
      ruleData.delay = Number.isNaN(ms) ? 1000 : ms;
    } else if (form.action === 'redirect') {
      if (!form.redirectUrl.trim()) {
        toast.error('Redirect URL is required.');
        return;
      }
      ruleData.redirectUrl = form.redirectUrl.trim();
      ruleData.redirectFilenameOnly = form.redirectFilenameOnly;
      // redirectPreservePath and redirectFilenameOnly are mutually exclusive
      ruleData.redirectPreservePath = form.redirectFilenameOnly ? false : form.redirectPreservePath;
    }

    setSaving(true);
    try {
      if (isEditing && editingRuleId) {
        const resp = await sendMsg({ type: 'UPDATE_RULE', ruleId: editingRuleId, rule: ruleData });
        if (resp?.success) {
          updateRule(editingRuleId, { ...ruleData, id: editingRuleId });
          toast.success('Rule updated.');
          onOpenChange(false);
        } else {
          toast.error('Failed to update rule.');
        }
      } else {
        const resp = await sendMsg({ type: 'ADD_RULE', rule: ruleData });
        if (resp?.success) {
          const newId = resp.ruleId;
          addRule(newId, { ...ruleData, id: newId });
          toast.success('Rule created.');
          onOpenChange(false);
        } else {
          toast.error('Failed to create rule.');
        }
      }
    } catch (err) {
      console.error('[RuleEditorDialog] save error:', err);
      toast.error('An error occurred while saving the rule.');
    } finally {
      setSaving(false);
    }
  }

  const showGraphQLFields = form.requestType === 'graphql' || form.requestType === 'both';
  const showRESTFields = form.requestType === 'rest' || form.requestType === 'both';
  const isStaticType = form.requestType === 'static';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Rule' : editingRule ? 'Create Rule from Request' : 'Add New Rule'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Rule Name</Label>
            <Input
              id="rule-name"
              placeholder="e.g. Block getUserProfile"
              value={form.name}
              onChange={(e) => {
                nameUserEditedRef.current = true;
                set('name', e.target.value);
              }}
              required
            />
          </div>

          {/* Enabled */}
          <div className="flex items-center gap-3">
            <Switch
              id="rule-enabled"
              checked={form.enabled}
              onCheckedChange={(v) => set('enabled', v)}
            />
            <Label htmlFor="rule-enabled">Enabled</Label>
          </div>

          {/* Request type */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-request-type">Rule Type</Label>
            <Select value={form.requestType} onValueChange={(v) => set('requestType', v as RequestType)}>
              <SelectTrigger id="rule-request-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="graphql">GraphQL</SelectItem>
                <SelectItem value="rest">REST / API</SelectItem>
                <SelectItem value="both">Both (GraphQL + REST)</SelectItem>
                <SelectItem value="static">Static Asset (JS / CSS / images)</SelectItem>
              </SelectContent>
            </Select>
            {isStaticType && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Static rules are applied via network-level interception (declarativeNetRequest on Chrome, webRequest on Firefox). They work for{' '}
                <span className="font-mono">{'<script>'}</span>,{' '}
                <span className="font-mono">{'<link>'}</span>, and direct asset fetches.
                Only <strong>Redirect</strong> and <strong>Block</strong> actions are supported.
              </p>
            )}
          </div>

          {/* URL pattern (common) */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-url-pattern">
              {isStaticType ? 'Host / Domain Pattern' : 'URL / Host Pattern'}
            </Label>
            <Input
              id="rule-url-pattern"
              placeholder={
                isStaticType
                  ? 'e.g. cdn.example.com or *.example.com'
                  : 'e.g. api.example.com or /regex/'
              }
              value={form.urlPattern}
              onChange={(e) => set('urlPattern', e.target.value)}
            />
          </div>

          {/* Static-specific: path / endpoint for targeting specific files */}
          {isStaticType && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="rule-static-path">Path Pattern</Label>
                <Input
                  id="rule-static-path"
                  placeholder="e.g. /static/js/* or /assets/vendor/*"
                  value={form.restPath}
                  onChange={(e) => set('restPath', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-static-endpoint">
                  Filename Pattern{' '}
                  <span className="text-xs text-muted-foreground">(last path segment)</span>
                </Label>
                <Input
                  id="rule-static-endpoint"
                  placeholder="e.g. app.bundle.js or *.js"
                  value={form.restEndpoint}
                  onChange={(e) => set('restEndpoint', e.target.value)}
                />
              </div>
            </>
          )}

          {/* GraphQL-specific fields */}
          {showGraphQLFields && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="rule-graphql-endpoint">GraphQL Endpoint Path</Label>
                <Input
                  id="rule-graphql-endpoint"
                  placeholder="e.g. /graphql"
                  value={form.graphqlEndpoint}
                  onChange={(e) => set('graphqlEndpoint', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-operation-name">Operation Name</Label>
                <Input
                  id="rule-operation-name"
                  placeholder="e.g. GetUser (leave blank to match all)"
                  value={form.operationName}
                  onChange={(e) => set('operationName', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-operation-type">Operation Type</Label>
                <Select
                  value={form.operationType || '__all__'}
                  onValueChange={(v) => set('operationType', v === '__all__' ? '' : v)}
                >
                  <SelectTrigger id="rule-operation-type">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any</SelectItem>
                    <SelectItem value="query">Query</SelectItem>
                    <SelectItem value="mutation">Mutation</SelectItem>
                    <SelectItem value="subscription">Subscription</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* REST-specific fields */}
          {showRESTFields && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="rule-http-method">HTTP Method</Label>
                <Select value={form.httpMethod} onValueChange={(v) => set('httpMethod', v)}>
                  <SelectTrigger id="rule-http-method">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">ALL</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                    <SelectItem value="HEAD">HEAD</SelectItem>
                    <SelectItem value="OPTIONS">OPTIONS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-rest-path">REST Path Pattern</Label>
                <Input
                  id="rule-rest-path"
                  placeholder="e.g. /api/users/:id or /api/*"
                  value={form.restPath}
                  onChange={(e) => set('restPath', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-rest-endpoint">Endpoint Name</Label>
                <Input
                  id="rule-rest-endpoint"
                  placeholder="e.g. users"
                  value={form.restEndpoint}
                  onChange={(e) => set('restEndpoint', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-query-filter">
                  Query Parameter Filter{' '}
                  <span className="text-xs text-muted-foreground">(JSON)</span>
                </Label>
                <Textarea
                  id="rule-query-filter"
                  placeholder={'{\n  "page": "1"\n}'}
                  rows={3}
                  value={form.queryFilter}
                  onChange={(e) => set('queryFilter', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-body-pattern">
                  Body Pattern{' '}
                  <span className="text-xs text-muted-foreground">(regex)</span>
                </Label>
                <Input
                  id="rule-body-pattern"
                  placeholder='e.g. "type":"premium"'
                  value={form.bodyPattern}
                  onChange={(e) => set('bodyPattern', e.target.value)}
                />
              </div>
            </>
          )}

          {/* Action */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-action">Action</Label>
            <Select
              value={form.action}
              onValueChange={(v) => {
                set('action', v as RuleAction);
                // Reset to redirect when switching to static if action is incompatible
                if (isStaticType && v !== 'redirect' && v !== 'block') {
                  set('action', 'redirect');
                }
              }}
            >
              <SelectTrigger id="rule-action">
                <SelectValue placeholder="Select action" />
              </SelectTrigger>
              <SelectContent>
                {!isStaticType && <SelectItem value="mock">Mock Response</SelectItem>}
                <SelectItem value="block">Block</SelectItem>
                {!isStaticType && <SelectItem value="delay">Delay</SelectItem>}
                {!isStaticType && <SelectItem value="modify">Modify</SelectItem>}
                <SelectItem value="redirect">Redirect</SelectItem>
                {!isStaticType && <SelectItem value="passthrough">Passthrough</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* Mock action fields */}
          {form.action === 'mock' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="rule-mock-status">Status Code</Label>
                <Input
                  id="rule-mock-status"
                  type="number"
                  min={100}
                  max={599}
                  placeholder="200"
                  value={form.statusCode}
                  onChange={(e) => set('statusCode', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-mock-response">
                  Response Body{' '}
                  <span className="text-xs text-muted-foreground">(JSON)</span>
                </Label>
                <Textarea
                  id="rule-mock-response"
                  placeholder={'{\n  "data": {}\n}'}
                  rows={6}
                  value={form.mockResponse}
                  onChange={(e) => set('mockResponse', e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </>
          )}

          {/* Delay action fields */}
          {form.action === 'delay' && (
            <div className="space-y-1.5">
              <Label htmlFor="rule-delay-ms">Delay (ms)</Label>
              <Input
                id="rule-delay-ms"
                type="number"
                min={0}
                placeholder="1000"
                value={form.delayMs}
                onChange={(e) => set('delayMs', e.target.value)}
              />
            </div>
          )}

          {/* Redirect action fields */}
          {form.action === 'redirect' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="rule-redirect-url">Redirect Target URL</Label>
                <Input
                  id="rule-redirect-url"
                  placeholder={
                    isStaticType
                      ? 'https://localhost:3000 (origin only for filename-only mode)'
                      : 'https://mock.example.com/api'
                  }
                  value={form.redirectUrl}
                  onChange={(e) => set('redirectUrl', e.target.value)}
                />
              </div>

              {/* Filename-only redirect */}
              <div className="flex items-start gap-3">
                <Switch
                  id="rule-redirect-filename-only"
                  checked={form.redirectFilenameOnly}
                  onCheckedChange={(v) => {
                    set('redirectFilenameOnly', v);
                    if (v) set('redirectPreservePath', false);
                  }}
                />
                <div>
                  <Label htmlFor="rule-redirect-filename-only">Filename-only redirect</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Keep only the filename from the source URL and append it to the target origin.{' '}
                    <span className="font-mono">cdn.com/v2/app.bundle.js</span> →{' '}
                    <span className="font-mono">localhost:3000/app.bundle.js</span>
                  </p>
                </div>
              </div>

              {/* Preserve path — hidden when filename-only is on */}
              {!form.redirectFilenameOnly && (
                <div className="flex items-center gap-3">
                  <Switch
                    id="rule-redirect-preserve"
                    checked={form.redirectPreservePath}
                    onCheckedChange={(v) => set('redirectPreservePath', v)}
                  />
                  <Label htmlFor="rule-redirect-preserve">Preserve source path</Label>
                </div>
              )}
            </>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEditing ? 'Update Rule' : 'Add Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
