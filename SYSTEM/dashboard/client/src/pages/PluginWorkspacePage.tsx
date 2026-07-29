import React, { useEffect, useMemo, useRef, useState } from 'react'
import AIPromptEditorModal from '../components/AIPromptEditorModal'
import PromptQualityPanel from '../components/PromptQualityPanel'
import { MobileSafeDialog } from '../components/MobileSafeDialog'
import { useAuth } from '../contexts/AuthContext'
import { ProductIconCell } from '../lib/productIcons'
import { headerPrimaryButtonClass, headerSecondaryButtonClass, headerSecondaryButtonIdleClass } from '../lib/headerControls'
import { expandPromptWithAI } from '../lib/aiPrompt'
import { getAiGenerationReadiness, hasAiGenerationAccess } from '../lib/byok'
import { getViewportSafeDropdownStyle } from '../lib/dropdownPosition'
import type { GenericPluginRecord, PluginFieldValue, PluginManifest, PluginRecord, PluginRecordTemplate, PluginWorkspaceContext } from '../lib/plugins'
import {
  buildGenericPluginFields,
  buildPluginDraftFromPrompt,
  collectPluginTemplateTags,
  collectPluginTags,
  formatPluginScopeSummary,
  formatPluginUpdatedAt,
  formatPluginUsageSummary,
  getOrderedPluginFields,
  getPluginCheckField,
  getPluginGrantedCapabilities,
  getPluginGroupField,
  getPluginDetailLines,
  getPluginUsageTotals,
  isEvalRecord,
  isGenericPluginRecord,
  isGuardrailRecord,
  matchesPluginTemplateSearch,
  matchesPluginSearch,
  normalizePluginNumericValue,
  scorePluginDraft,
  splitPluginDetailLine,
  sortPluginTemplates,
  type PluginTemplateSort,
  usesLegacyPluginAdapter,
} from '../lib/plugins'
import {
  buildReleaseReviewFilename,
  buildReleaseReviewMarkdown,
  isReviewErrorLine,
  sanitizeReviewLogLine,
  type ReviewExportInstance,
} from '../lib/reviewExport'
import { readStoredReviewIdentity, resolveReviewIdentity, storeReviewIdentity } from '../lib/reviewIdentity'
import {
  getCompletedReviewReleaseIdsToArchive,
  getReviewReleaseGroups,
  planReviewReleaseConsolidation,
} from '../lib/reviewLifecycle'

type Props = {
  plugin: PluginManifest
  isActive?: boolean
  onNavigateToDoc?: (path: string) => void
}

type PluginCollectionTab = 'active' | 'archived' | 'suggested'
type PluginViewMode = 'grid' | 'detail' | 'table' | 'graph'

function collectRecentRuntimeErrors(timeoutMs = 2500): Promise<string[]> {
  return new Promise((resolve) => {
    const errors: string[] = []
    const source = new EventSource('/api/system/logs')
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      source.close()
      resolve(Array.from(new Set(errors)).slice(-20))
    }
    const timer = window.setTimeout(finish, timeoutMs)

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        const line = typeof payload?.line === 'string' ? payload.line : ''
        if (line && isReviewErrorLine(line)) errors.push(sanitizeReviewLogLine(line))
        if (errors.length >= 20) finish()
      } catch {
        // Ignore malformed stream entries and preserve the rest of the export.
      }
    }
    source.onerror = finish
  })
}

function PluginIcon({ plugin }: { plugin: PluginManifest }) {
  if (usesLegacyPluginAdapter(plugin, 'guardrail')) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 5 6v6c0 4.5 2.9 7.9 7 9 4.1-1.1 7-4.5 7-9V6Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
  }
  if (usesLegacyPluginAdapter(plugin, 'eval')) return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v7.3L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9.3V2" />
      <path d="M8 2h8" />
      <path d="M9 13h6" />
      <path d="M8 17h8" />
    </svg>
  )
  return <ProductIconCell iconName={plugin.icon || 'plugin'} label={plugin.name} size="sm" className="border-transparent bg-transparent text-current" />
}

function EmptyState({ plugin, onCreate }: { plugin: PluginManifest; onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-900/40">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
        <PluginIcon plugin={plugin} />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">No {plugin.labels?.plural || plugin.name} yet</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
        {usesLegacyPluginAdapter(plugin, 'guardrail')
          ? 'Create workspace-scoped guardrails that describe which agents or workflows are constrained and what they are allowed to do.'
          : usesLegacyPluginAdapter(plugin, 'eval')
            ? 'Create workspace-scoped eval experiments with inputs, expected outputs, judge mode, and repeatable score history.'
            : `Create workspace-scoped ${plugin.labels?.plural?.toLowerCase() || plugin.name.toLowerCase()} using this plugin's declared fields.`}
      </p>
      <button
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700"
      >
        <ProductIconCell iconName="create" label="Create" size="sm" className="border-white/20 bg-white/10 text-white" />
        Create
      </button>
    </div>
  )
}

function GenericPluginFields({
  plugin,
  fields,
  onChange,
}: {
  plugin: PluginManifest
  fields: Record<string, PluginFieldValue>
  onChange: (fields: Record<string, PluginFieldValue>) => void
}) {
  const required = new Set(plugin.recordSchema?.required || [])
  const update = (key: string, value: PluginFieldValue) => onChange({ ...fields, [key]: value })

  return (
    <div className="space-y-4">
      {getOrderedPluginFields(plugin).map(([key, schema]) => {
        const value = fields[key]
        const label = <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{schema.title}{required.has(key) ? ' *' : ''}</span>
        const className = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
        if (schema.type === 'boolean') {
          return (
            <label key={key} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={value === true} onChange={(event) => update(key, event.target.checked)} className="mt-0.5" />
              <span><span className="font-medium">{schema.title}</span>{schema.description ? <span className="mt-0.5 block text-xs text-gray-500">{schema.description}</span> : null}</span>
            </label>
          )
        }
        if (schema.enum?.length) {
          return (
            <label key={key} className="block">
              {label}
              <select value={typeof value === 'string' ? value : ''} onChange={(event) => update(key, event.target.value)} className={className}>
                {schema.enum.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              {schema.description ? <span className="mt-1 block text-xs text-gray-500">{schema.description}</span> : null}
            </label>
          )
        }
        if (schema.type === 'array') {
          return (
            <label key={key} className="block">
              {label}
              <input value={Array.isArray(value) ? value.join(', ') : ''} onChange={(event) => update(key, event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))} className={className} placeholder="Comma-separated values" />
              {schema.description ? <span className="mt-1 block text-xs text-gray-500">{schema.description}</span> : null}
            </label>
          )
        }
        if (schema.format === 'textarea') {
          return (
            <label key={key} className="block">
              {label}
              <textarea value={typeof value === 'string' ? value : ''} onChange={(event) => update(key, event.target.value)} rows={5} className={className} />
              {schema.description ? <span className="mt-1 block text-xs text-gray-500">{schema.description}</span> : null}
            </label>
          )
        }
        if ((schema.type === 'number' || schema.type === 'integer') && schema.control === 'slider') {
          const numericValue = normalizePluginNumericValue(schema, value)
          const step = schema.step ?? (schema.type === 'integer' ? 1 : 'any')
          return (
            <div key={key} className="block">
              {label}
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <input
                  type="range"
                  aria-label={`${schema.title} slider`}
                  min={schema.minimum}
                  max={schema.maximum}
                  step={step}
                  value={numericValue}
                  onChange={(event) => update(key, normalizePluginNumericValue(schema, event.target.value))}
                  className="h-2 w-full min-w-0 cursor-pointer accent-sky-600"
                />
                <input
                  type="number"
                  aria-label={`${schema.title} value`}
                  min={schema.minimum}
                  max={schema.maximum}
                  step={step}
                  value={numericValue}
                  onChange={(event) => update(key, normalizePluginNumericValue(schema, event.target.value))}
                  className={className}
                />
              </div>
              {schema.description ? <span className="mt-1 block text-xs text-gray-500">{schema.description}</span> : null}
            </div>
          )
        }
        const inputType = schema.type === 'number' || schema.type === 'integer' ? 'number' : schema.format === 'date' ? 'date' : schema.format === 'uri' ? 'url' : 'text'
        return (
          <label key={key} className="block">
            {label}
            <input
              type={inputType}
              min={schema.minimum}
              max={schema.maximum}
              step={schema.step ?? (schema.type === 'integer' ? 1 : schema.type === 'number' ? 'any' : undefined)}
              value={typeof value === 'number' || typeof value === 'string' ? value : ''}
              onChange={(event) => update(
                key,
                schema.type === 'number' || schema.type === 'integer'
                  ? normalizePluginNumericValue(schema, event.target.value)
                  : event.target.value,
              )}
              className={className}
            />
            {schema.description ? <span className="mt-1 block text-xs text-gray-500">{schema.description}</span> : null}
          </label>
        )
      })}
    </div>
  )
}

function PluginFormModal({
  plugin,
  context,
  draft,
  onClose,
  onSave,
}: {
  plugin: PluginManifest
  context: PluginWorkspaceContext
  draft: Partial<PluginRecord>
  onClose: () => void
  onSave: (draft: Partial<PluginRecord>) => void
}) {
  const [form, setForm] = useState<Partial<PluginRecord>>(draft)

  useEffect(() => {
    setForm(draft)
  }, [draft])

  const tags = typeof form.tags?.join === 'function' ? form.tags.join(', ') : ''
  const allowedSkills = isGuardrailRecord(form)
    ? (form.controls?.allowedSkills || []).join(', ')
    : ''
  const targetIds = isEvalRecord(form) ? (form.target?.ids || []).join(', ') : ''
  const genericFields = isGenericPluginRecord(form) ? form.fields : buildGenericPluginFields(plugin)
  const draftQuality = useMemo(() => scorePluginDraft(plugin, form), [plugin, form])

  const parseCommaList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-900">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {form.id ? `Edit ${plugin.labels?.singular || plugin.name}` : `Create ${plugin.labels?.singular || plugin.name}`}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{plugin.description}</p>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300">×</button>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</span>
              <input
                value={form.name || ''}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</span>
              <textarea
                value={form.description || ''}
                onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                rows={4}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tags</span>
              <input
                value={tags}
                onChange={(e) => setForm((current) => ({ ...current, tags: parseCommaList(e.target.value) as any }))}
                placeholder="safety, external, email"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.enabled !== false}
                onChange={(e) => setForm((current) => ({ ...current, enabled: e.target.checked }))}
              />
              Enabled
            </label>
          </div>

          {usesLegacyPluginAdapter(plugin, 'guardrail') ? (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Allowed skills</span>
                <input
                  value={allowedSkills}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    kind: 'guardrail',
                    controls: {
                      blockEmail: current.kind === 'guardrail' ? current.controls?.blockEmail || false : false,
                      blockWeb: current.kind === 'guardrail' ? current.controls?.blockWeb || false : false,
                      blockExternalDocs: current.kind === 'guardrail' ? current.controls?.blockExternalDocs || false : false,
                      allowedSkills: parseCommaList(e.target.value),
                    },
                  }))}
                  placeholder="github, workspace-ls"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                  <input
                    type="checkbox"
                    checked={form.kind === 'guardrail' ? !!form.controls?.blockEmail : false}
                    onChange={(e) => setForm((current) => ({
                      ...current,
                      kind: 'guardrail',
                      controls: {
                        blockEmail: e.target.checked,
                        blockWeb: current.kind === 'guardrail' ? current.controls?.blockWeb || false : false,
                        blockExternalDocs: current.kind === 'guardrail' ? current.controls?.blockExternalDocs || false : false,
                        allowedSkills: current.kind === 'guardrail' ? current.controls?.allowedSkills || [] : [],
                      },
                    }))}
                  />{' '}Block email
                </label>
                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                  <input
                    type="checkbox"
                    checked={form.kind === 'guardrail' ? !!form.controls?.blockWeb : false}
                    onChange={(e) => setForm((current) => ({
                      ...current,
                      kind: 'guardrail',
                      controls: {
                        blockEmail: current.kind === 'guardrail' ? current.controls?.blockEmail || false : false,
                        blockWeb: e.target.checked,
                        blockExternalDocs: current.kind === 'guardrail' ? current.controls?.blockExternalDocs || false : false,
                        allowedSkills: current.kind === 'guardrail' ? current.controls?.allowedSkills || [] : [],
                      },
                    }))}
                  />{' '}Block web
                </label>
                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                  <input
                    type="checkbox"
                    checked={form.kind === 'guardrail' ? !!form.controls?.blockExternalDocs : false}
                    onChange={(e) => setForm((current) => ({
                      ...current,
                      kind: 'guardrail',
                      controls: {
                        blockEmail: current.kind === 'guardrail' ? current.controls?.blockEmail || false : false,
                        blockWeb: current.kind === 'guardrail' ? current.controls?.blockWeb || false : false,
                        blockExternalDocs: e.target.checked,
                        allowedSkills: current.kind === 'guardrail' ? current.controls?.allowedSkills || [] : [],
                      },
                    }))}
                  />{' '}Block external docs
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Agents</span>
                <select
                  multiple
                  value={form.kind === 'guardrail' ? form.appliesTo?.agents || [] : []}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    kind: 'guardrail',
                    appliesTo: {
                      agents: Array.from(e.target.selectedOptions).map((option) => option.value),
                      workflows: current.kind === 'guardrail' ? current.appliesTo?.workflows || [] : [],
                      groups: current.kind === 'guardrail' ? current.appliesTo?.groups || [] : [],
                      communities: current.kind === 'guardrail' ? current.appliesTo?.communities || [] : [],
                    },
                  }))}
                  className="min-h-28 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  {context.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Workflows</span>
                <select
                  multiple
                  value={form.kind === 'guardrail' ? form.appliesTo?.workflows || [] : []}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    kind: 'guardrail',
                    appliesTo: {
                      agents: current.kind === 'guardrail' ? current.appliesTo?.agents || [] : [],
                      workflows: Array.from(e.target.selectedOptions).map((option) => option.value),
                      groups: current.kind === 'guardrail' ? current.appliesTo?.groups || [] : [],
                      communities: current.kind === 'guardrail' ? current.appliesTo?.communities || [] : [],
                    },
                  }))}
                  className="min-h-28 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  {context.workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                </select>
              </label>
            </div>
          ) : usesLegacyPluginAdapter(plugin, 'eval') ? (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Target type</span>
                <select
                  value={form.kind === 'eval' ? form.target?.type || 'agent' : 'agent'}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    kind: 'eval',
                    target: {
                      type: e.target.value as 'agent' | 'workflow' | 'group',
                      ids: [],
                    },
                  }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="agent">Agent</option>
                  <option value="workflow">Workflow</option>
                  <option value="group">Group</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Target IDs</span>
                <input
                  value={targetIds}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    kind: 'eval',
                    target: {
                      type: current.kind === 'eval' ? current.target?.type || 'agent' : 'agent',
                      ids: parseCommaList(e.target.value),
                    },
                  }))}
                  placeholder="agent-a, agent-b"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Judge</span>
                <select
                  value={form.kind === 'eval' ? form.experiment?.judge || 'fixed' : 'fixed'}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    kind: 'eval',
                    experiment: {
                      input: current.kind === 'eval' ? current.experiment?.input || '' : '',
                      candidateOutput: current.kind === 'eval' ? current.experiment?.candidateOutput || '' : '',
                      expectedOutput: current.kind === 'eval' ? current.experiment?.expectedOutput || '' : '',
                      judge: e.target.value === 'ai' ? 'ai' : 'fixed',
                    },
                  }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="fixed">Fixed heuristic</option>
                  <option value="ai">AI placeholder judge</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Input</span>
                <textarea
                  value={form.kind === 'eval' ? form.experiment?.input || '' : ''}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    kind: 'eval',
                    experiment: {
                      input: e.target.value,
                      candidateOutput: current.kind === 'eval' ? current.experiment?.candidateOutput || '' : '',
                      expectedOutput: current.kind === 'eval' ? current.experiment?.expectedOutput || '' : '',
                      judge: current.kind === 'eval' ? current.experiment?.judge || 'fixed' : 'fixed',
                    },
                  }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Candidate output</span>
                <textarea
                  value={form.kind === 'eval' ? form.experiment?.candidateOutput || '' : ''}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    kind: 'eval',
                    experiment: {
                      input: current.kind === 'eval' ? current.experiment?.input || '' : '',
                      candidateOutput: e.target.value,
                      expectedOutput: current.kind === 'eval' ? current.experiment?.expectedOutput || '' : '',
                      judge: current.kind === 'eval' ? current.experiment?.judge || 'fixed' : 'fixed',
                    },
                  }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Expected output</span>
                <textarea
                  value={form.kind === 'eval' ? form.experiment?.expectedOutput || '' : ''}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    kind: 'eval',
                    experiment: {
                      input: current.kind === 'eval' ? current.experiment?.input || '' : '',
                      candidateOutput: current.kind === 'eval' ? current.experiment?.candidateOutput || '' : '',
                      expectedOutput: e.target.value,
                      judge: current.kind === 'eval' ? current.experiment?.judge || 'fixed' : 'fixed',
                    },
                  }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
            </div>
          ) : (
            <GenericPluginFields
              plugin={plugin}
              fields={genericFields}
              onChange={(fields) => setForm((current) => ({ ...current, kind: plugin.objectKind, fields } as Partial<GenericPluginRecord>))}
            />
          )}
        </div>
        <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-700">
          <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900/50 dark:bg-sky-950/20">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-sky-900 dark:text-sky-200">Draft quality</div>
              <div className="text-lg font-semibold text-sky-700 dark:text-sky-300">{draftQuality.score}/100</div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100 dark:bg-sky-950">
              <div className="h-full rounded-full bg-sky-600 transition-[width]" style={{ width: `${draftQuality.score}%` }} />
            </div>
            {draftQuality.suggestions.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-sky-800 dark:text-sky-200">
                {draftQuality.suggestions.map((suggestion) => <li key={suggestion}>• {suggestion}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">Configuration is ready to save.</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300">Cancel</button>
          <button onClick={() => onSave(form)} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ItemCard({
  plugin,
  item,
  onEdit,
  onDelete,
  onToggle,
  onGenerateDoc,
  onNotify,
  onRun,
  onOpenDoc,
  onArchiveToggle,
  canGenerateDocs,
  canNotify,
  onCheckToggle,
  running = false,
}: {
  plugin: PluginManifest
  item: PluginRecord
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onGenerateDoc: () => void
  onNotify: () => void
  onRun: (() => void) | null
  onOpenDoc: ((path: string) => void) | null
  onArchiveToggle: () => void
  canGenerateDocs: boolean
  canNotify: boolean
  onCheckToggle: (() => void) | null
  running?: boolean
}) {
  const commonSummary = formatPluginScopeSummary(item)
  const archived = item.archived === true
  const usageSummary = formatPluginUsageSummary(item)
  const [showActions, setShowActions] = useState(false)
  const detailLines = getPluginDetailLines(plugin, item)
  const checkField = getPluginCheckField(plugin)
  const checked = checkField && isGenericPluginRecord(item) ? item.fields[checkField] === true : false

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              {plugin.labels?.singular || plugin.objectKind}
            </div>
            <div className={`rounded-full px-2 py-0.5 text-xs font-medium ${archived ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : item.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
              {archived ? 'Archived' : item.enabled ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-400">{commonSummary}</div>
          <h3 className="mt-2 truncate text-base font-semibold text-gray-900 dark:text-gray-100">{item.name}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{item.description || 'No description yet.'}</p>
          <div className="mt-2 text-xs text-gray-400">
            Updated {formatPluginUpdatedAt(item)}
            {item.document?.path ? ' · doc ready' : ''}
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowActions((current) => !current)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:hover:text-white"
            aria-label="Open plugin item actions"
            title="More actions"
          >
            <ProductIconCell iconName="more" label="More actions" size="sm" className="border-transparent bg-transparent text-current" />
          </button>
          {showActions && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
              <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                <button onClick={() => { setShowActions(false); onEdit() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <ProductIconCell iconName="edit" label="Edit" size="sm" className="border-transparent bg-transparent text-current" />
                  Edit
                </button>
                <button onClick={() => { setShowActions(false); onToggle() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <ProductIconCell iconName="pause" label={item.enabled ? 'Disable' : 'Enable'} size="sm" className="border-transparent bg-transparent text-current" />
                  {item.enabled ? 'Disable' : 'Enable'}
                </button>
                <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                <button onClick={() => { setShowActions(false); onArchiveToggle() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <ProductIconCell iconName={archived ? 'restore' : 'archive'} label={archived ? 'Restore' : 'Archive'} size="sm" className="border-transparent bg-transparent text-current" />
                  {archived ? 'Restore' : 'Archive'}
                </button>
                <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                {canGenerateDocs && <button onClick={() => { setShowActions(false); onGenerateDoc() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <ProductIconCell iconName="docs" label="Generate Doc" size="sm" className="border-transparent bg-transparent text-current" />
                  Generate Doc
                </button>}
                {canNotify && <button onClick={() => { setShowActions(false); onNotify() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <ProductIconCell iconName="communication" label="Notify" size="sm" className="border-transparent bg-transparent text-current" />
                  Notify
                </button>}
                {onRun && (
                  <button onClick={() => { setShowActions(false); onRun() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                    <ProductIconCell iconName="play" label="Run Eval" size="sm" className="border-transparent bg-transparent text-current" />
                    Run Eval
                  </button>
                )}
                <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                <button onClick={() => { setShowActions(false); onDelete() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/20">
                  <ProductIconCell iconName="delete" label="Delete" size="sm" className="border-transparent bg-transparent text-current" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.tags.length > 0 ? item.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">{tag}</span>
        )) : (
          <span className="text-xs text-gray-400">No tags</span>
        )}
      </div>
      {checkField && onCheckToggle && (
        <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          <input
            type="checkbox"
            checked={checked}
            onChange={onCheckToggle}
            className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
          />
          Completed
        </label>
      )}
      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-800 dark:bg-gray-950/40">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">More</div>
        <div className="mt-2 space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          {detailLines.length > 0 ? detailLines.map((line) => (
            <p key={line} className="break-words">{line}</p>
          )) : (
            <p className="text-gray-400 dark:text-gray-500">No additional details yet.</p>
          )}
        </div>
      </div>
      {isEvalRecord(item) && (
        <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${running
          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300'
          : 'border-emerald-100 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300'
        }`}>
          {running ? 'Running eval…' : usageSummary}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={onOpenDoc ? (() => onOpenDoc(`SYSTEM/plugins/${plugin.slug}/items/${item.id}.md`)) : undefined}
          disabled={!onOpenDoc}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
            onOpenDoc
              ? 'text-sky-500 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-900/30'
              : 'cursor-not-allowed text-gray-300 dark:text-gray-600'
          }`}
          title="Open doc"
          aria-label="Open doc"
        >
          <ProductIconCell iconName="docs" label="Open Doc" size="sm" className="border-transparent bg-transparent text-current" />
        </button>
        {canGenerateDocs && <button
          onClick={onGenerateDoc}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-purple-500 transition-colors hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-900/30"
          title="Generate doc"
          aria-label="Generate doc"
        >
          <ProductIconCell iconName="docs" label="Generate Doc" size="sm" className="border-transparent bg-transparent text-current" />
        </button>}
        {onRun && (
          <button
            onClick={onRun}
            disabled={running}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-emerald-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/30"
            title="Run eval"
            aria-label="Run eval"
          >
            <ProductIconCell iconName={running ? 'refresh' : 'play'} label={running ? 'Running eval' : 'Run Eval'} size="sm" className="border-transparent bg-transparent text-current" />
          </button>
        )}
      </div>
      {isEvalRecord(item) && item.lastRun && (
        <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 dark:border-violet-900/40 dark:bg-violet-900/10">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-violet-800 dark:text-violet-300">Latest score</div>
            <div className="text-lg font-semibold text-violet-700 dark:text-violet-200">{item.lastRun.score}/100</div>
          </div>
          <p className="mt-1 text-sm text-violet-700/80 dark:text-violet-300/80">{item.lastRun.summary}</p>
        </div>
      )}
    </div>
  )
}

function CompactItemCard({
  plugin,
  item,
  selected,
  onOpen,
  onToggleActions,
  onCheckToggle,
  running = false,
}: {
  plugin: PluginManifest
  item: PluginRecord
  selected: boolean
  onOpen: () => void
  onToggleActions: () => void
  onCheckToggle: (() => void) | null
  running?: boolean
}) {
  const archived = item.archived === true
  const usageSummary = formatPluginUsageSummary(item)
  const checkField = getPluginCheckField(plugin)
  const checked = checkField && isGenericPluginRecord(item) ? item.fields[checkField] === true : false
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-gray-800 ${
        selected ? 'border-sky-400 ring-2 ring-sky-100 dark:border-sky-500 dark:ring-sky-900/30' : 'border-gray-200 dark:border-gray-700'
      }`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${archived ? 'bg-amber-500' : item.enabled ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            <span className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">{item.name}</span>
          </div>
          <div className="mt-1 truncate font-mono text-sm text-gray-400 dark:text-gray-500">{item.id}</div>
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation()
            onToggleActions()
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-[18px] font-black leading-none text-gray-500 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-gray-600 dark:bg-gray-700/80 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-600 dark:hover:text-white dark:focus:ring-sky-800"
          aria-label="More plugin item actions"
        >
          ⋮
        </button>
      </div>
      <div className="mt-3 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        <span>{formatPluginScopeSummary(item)}</span>
      </div>
      {checkField && onCheckToggle && (
        <label
          className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => {
              event.stopPropagation()
              onCheckToggle()
            }}
            className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
          />
          Completed
        </label>
      )}
      {isEvalRecord(item) && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${running
          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300'
          : 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/40 dark:bg-violet-950/20 dark:text-violet-300'
        }`}>
          {running
            ? 'Running eval…'
            : item.lastRun
              ? `Score ${item.lastRun.score}/100 · ${usageSummary}`
              : `Not run · ${usageSummary}`}
        </div>
      )}
      <div className="mt-3 flex items-center gap-4 text-gray-300 dark:text-gray-500">
        <ProductIconCell iconName={isEvalRecord(item) ? 'play' : 'status'} label="Type" size="sm" className="border-transparent bg-transparent text-current" />
        <ProductIconCell iconName="docs" label="Docs" size="sm" className="border-transparent bg-transparent text-current" />
        <ProductIconCell iconName="communication" label="Notifications" size="sm" className="border-transparent bg-transparent text-current" />
      </div>
      <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">{formatPluginUpdatedAt(item)}</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.tags.length > 0 ? item.tags.map((tag) => (
          <span key={tag} className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
            {tag}
          </span>
        )) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">No tags</span>
        )}
      </div>
    </div>
  )
}

function PluginDetailsPanel({
  plugin,
  item,
  onClose,
  onEdit,
  onGenerateDoc,
  onOpenDoc,
  onNotify,
  onToggle,
  onArchiveToggle,
  onDelete,
  onRun,
  canGenerateDocs,
  canNotify,
}: {
  plugin: PluginManifest
  item: PluginRecord
  onClose: () => void
  onEdit: () => void
  onGenerateDoc: () => void
  onOpenDoc: ((path: string) => void) | null
  onNotify: () => void
  onToggle: () => void
  onArchiveToggle: () => void
  onDelete: () => void
  onRun: (() => void) | null
  canGenerateDocs: boolean
  canNotify: boolean
}) {
  const archived = item.archived === true
  const files = Array.from(new Set([
    `SYSTEM/plugins/${plugin.slug}/items/${item.id}.md`,
    ...(item.document?.path ? [item.document.path] : []),
  ]))
  const usageTotals = getPluginUsageTotals(item)
  const detailLines = getPluginDetailLines(plugin, item)

  return (
    <div className="fixed inset-0 bg-black/30 z-40 md:bg-black/20" onClick={onClose}>
      <aside className="fixed top-0 right-0 h-[100dvh] max-h-[100dvh] w-full max-w-full bg-white shadow-2xl dark:bg-gray-800 sm:w-[30rem] lg:w-[36rem] z-50 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-4 py-4 shrink-0 dark:border-gray-700 dark:bg-gray-800 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-300">
              <PluginIcon plugin={plugin} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{item.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{item.id}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              {plugin.labels?.singular || plugin.objectKind}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${archived ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : item.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
              {archived ? 'Archived' : item.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 shrink-0">
          {canNotify && <button
            onClick={onNotify}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-sky-500 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors"
            aria-label="Notify"
            title="Notify"
          >
            <ProductIconCell iconName="communication" label="Notify" size="sm" className="border-transparent bg-transparent text-current" />
          </button>}
          <button
            onClick={onEdit}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
            aria-label="Edit"
            title="Edit"
          >
            <ProductIconCell iconName="edit" label="Edit" size="sm" className="border-transparent bg-transparent text-current" />
          </button>
          {canGenerateDocs && <button
            onClick={onGenerateDoc}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-purple-500 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
            aria-label="Generate document"
            title="Generate document"
          >
            <ProductIconCell iconName="docs" label="Generate document" size="sm" className="border-transparent bg-transparent text-current" />
          </button>}
          {onRun && (
            <button
              onClick={onRun}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full text-sky-500 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors"
              aria-label="Run eval"
              title="Run eval"
            >
              <ProductIconCell iconName="play" label="Run eval" size="sm" className="border-transparent bg-transparent text-current" />
            </button>
          )}
          <button
            onClick={onArchiveToggle}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-amber-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
            aria-label={archived ? 'Restore' : 'Archive'}
            title={archived ? 'Restore' : 'Archive'}
          >
            <ProductIconCell iconName={archived ? 'restore' : 'archive'} label={archived ? 'Restore' : 'Archive'} size="sm" className="border-transparent bg-transparent text-current" />
          </button>
          <button
            onClick={onDelete}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            aria-label="Delete"
            title="Delete"
          >
            <ProductIconCell iconName="delete" label="Delete" size="sm" className="border-transparent bg-transparent text-current" />
          </button>
          <button
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-lg leading-none"
            aria-label="Close"
            title="Close details"
          >
            <ProductIconCell iconName="close" label="Close" size="sm" className="border-transparent bg-transparent text-current" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 sm:px-5">
        {isEvalRecord(item) && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Eval cost
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Total spend: ${usageTotals.costUsd.toFixed(4)}
                </div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-white/70 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-gray-900/40 dark:text-emerald-300">
                <div>{usageTotals.tokens.toLocaleString()} tokens across {usageTotals.runs} run{usageTotals.runs !== 1 ? 's' : ''}</div>
                {item.lastRun && (
                  <div className="mt-1">
                    Last run: ${(item.lastRun.costUsd || 0).toFixed(4)} · {(item.lastRun.tokensIn || 0) + (item.lastRun.tokensOut || 0)} tokens
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">Description</div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{item.description || 'No description yet.'}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-700">
            <div className="text-xs uppercase tracking-wide text-gray-400">Updated</div>
            <div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{formatPluginUpdatedAt(item)}</div>
          </div>
          <div className="rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-700">
            <div className="text-xs uppercase tracking-wide text-gray-400">Scope</div>
            <div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{formatPluginScopeSummary(item)}</div>
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">Tags</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.tags.length > 0 ? item.tags.map((tag) => (
              <span key={tag} className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                {tag}
              </span>
            )) : (
              <span className="text-sm text-gray-400 dark:text-gray-500">No tags</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">More</div>
          <div className="mt-2 space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
            {detailLines.map((line) => (
              <p key={line} className="break-words">{line}</p>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">Files</div>
          <div className="mt-2 space-y-2">
            {files.length > 0 ? files.map((file) => (
              <button
                key={file}
                onClick={() => onOpenDoc?.(file)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/60"
              >
                <span className="truncate text-sm text-gray-700 dark:text-gray-300">{file}</span>
                <ProductIconCell iconName="docs" label="Open doc" size="sm" className="border-transparent bg-transparent text-current" />
              </button>
            )) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">No generated files yet.</p>
            )}
          </div>
        </div>

        {isEvalRecord(item) && item.lastRun && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 dark:border-violet-900/40 dark:bg-violet-900/10">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-violet-800 dark:text-violet-300">Latest score</div>
              <div className="text-lg font-semibold text-violet-700 dark:text-violet-200">{item.lastRun.score}/100</div>
            </div>
            <p className="mt-1 text-sm text-violet-700/80 dark:text-violet-300/80">{item.lastRun.summary}</p>
          </div>
        )}
      </div>
      </aside>
    </div>
  )
}

function TemplateCard({
  plugin,
  template,
  onApply,
  detailed = false,
  compact = false,
}: {
  plugin: PluginManifest
  template: PluginRecordTemplate
  onApply: () => void
  detailed?: boolean
  compact?: boolean
}) {
  const [showDetails, setShowDetails] = useState(detailed)
  const preview = templateToPreviewRecord(template)
  const detailLines = getPluginDetailLines(plugin, preview)

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900/40 dark:bg-sky-950/20 sm:p-4">
      <div className={`flex flex-col items-stretch gap-3 ${compact ? '' : 'sm:flex-row sm:items-start sm:justify-between'}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
              Suggested
            </span>
            <span className="text-xs text-sky-700/80 dark:text-sky-300/80">{plugin.labels?.singular || plugin.name}</span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">{template.name}</h3>
          <p className="mt-1 break-words text-sm text-gray-600 dark:text-gray-300">{template.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {template.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className={`grid w-full min-w-0 grid-cols-2 gap-2 ${compact ? '' : 'sm:flex sm:w-auto'}`}>
          {detailLines.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDetails((current) => !current)}
              className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass} flex-1 justify-center sm:flex-none`}
            >
              {showDetails ? 'Hide details' : 'Details'}
            </button>
          )}
          <button onClick={onApply} className={`${headerPrimaryButtonClass} flex-1 justify-center sm:flex-none`}>Use</button>
        </div>
      </div>
      {showDetails && (
        <dl className="mt-4 grid w-full min-w-0 gap-3 overflow-hidden border-t border-sky-200/80 pt-4 text-sm dark:border-sky-900/50 sm:grid-cols-2">
          {detailLines.map((line) => {
            const detail = splitPluginDetailLine(line)
            return (
              <div key={line} className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{detail.label}</dt>
                <dd className="mt-0.5 min-w-0 break-words text-gray-700 [overflow-wrap:anywhere] dark:text-gray-200">{detail.value}</dd>
              </div>
            )
          })}
        </dl>
      )}
    </div>
  )
}

function templateToPreviewRecord(template: PluginRecordTemplate): PluginRecord {
  const base = {
    ...template.payload,
    id: `suggested:${template.id}`,
    name: template.payload.name || template.name,
    description: template.payload.description || template.description,
    tags: template.payload.tags || template.tags,
    enabled: template.payload.enabled !== false,
    createdAt: '',
    updatedAt: '',
  }
  if (base.kind === 'guardrail') {
    return {
      ...base,
      appliesTo: base.appliesTo || { agents: [], workflows: [], groups: [], communities: [] },
      controls: base.controls || { blockEmail: false, blockWeb: false, blockExternalDocs: false, allowedSkills: [] },
      history: [],
    } as PluginRecord
  }
  if (base.kind === 'eval') {
    return {
      ...base,
      target: base.target || { type: 'agent', ids: [] },
      experiment: base.experiment || { input: '', candidateOutput: '', expectedOutput: '', judge: 'fixed' },
      runs: [],
    } as PluginRecord
  }
  return {
    ...base,
    fields: base.fields || {},
  } as PluginRecord
}

function ChecklistItemRow({
  item,
  checkField,
  onToggle,
  onFail,
  onEdit,
}: {
  item: GenericPluginRecord
  checkField: string
  onToggle: () => void
  onFail: () => void
  onEdit: () => void
}) {
  const completed = item.fields[checkField] === true
  const area = String(item.fields.area || 'review')
  const outcome = String(item.fields.outcome || 'pending')
  const notes = String(item.fields.notes || '').trim()
  const evidence = Array.isArray(item.fields.evidence) ? item.fields.evidence : []
  const verifiedBy = Array.isArray(item.fields.verifiedBy) ? item.fields.verifiedBy.map(String).filter(Boolean) : []
  const instructionMatch = item.description.match(/^Test:\s*(.+?)\s+Pass:\s*(.+)$/i)
  const rowClass = outcome === 'failed'
    ? 'bg-red-50/80 dark:bg-red-950/20'
    : outcome === 'blocked'
      ? 'bg-amber-50/80 dark:bg-amber-950/20'
      : completed
        ? 'bg-emerald-50/50 dark:bg-emerald-950/15'
        : notes
          ? 'bg-yellow-50/70 dark:bg-yellow-950/15'
          : ''
  const outcomeClass = outcome === 'passed'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
    : outcome === 'failed'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
      : outcome === 'blocked'
        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
        : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'

  return (
    <div className={`w-full min-w-0 max-w-full overflow-hidden border-b border-gray-100 p-4 last:border-b-0 dark:border-gray-700/70 ${rowClass}`}>
      <div className="flex min-w-0 items-start gap-3">
        <input
          type="checkbox"
          checked={completed}
          onChange={onToggle}
          aria-label={`Mark ${item.name} complete`}
          className="mt-1 h-5 w-5 shrink-0 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className={`break-words text-sm font-semibold text-gray-900 dark:text-gray-100 ${completed ? 'line-through decoration-gray-400' : ''}`}>{item.name}</h3>
              {instructionMatch ? (
                <div className="mt-1 min-w-0 max-w-full space-y-1 break-words text-sm text-gray-600 [overflow-wrap:anywhere] dark:text-gray-300">
                  <p><span className="font-semibold text-gray-700 dark:text-gray-200">Test:</span> {instructionMatch[1]}</p>
                  <p><span className="font-semibold text-gray-700 dark:text-gray-200">Pass:</span> {instructionMatch[2]}</p>
                </div>
              ) : (
                <p className="mt-1 break-words text-sm text-gray-600 dark:text-gray-300">{item.description}</p>
              )}
              {verifiedBy.length > 0 && (
                <p className="mt-2 break-words text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Previously verified by {verifiedBy.join(', ')}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium capitalize text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">{area}</span>
              <span className={`rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${outcomeClass}`}>{outcome}</span>
              <button
                type="button"
                onClick={onFail}
                aria-label={`Mark ${item.name} failed`}
                title="Mark failed"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                ×
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 dark:border-gray-700/70 sm:flex-row sm:items-start sm:justify-between">
            <p className={`min-w-0 max-w-full break-words text-sm [overflow-wrap:anywhere] ${notes ? 'text-gray-500 dark:text-gray-400' : 'italic text-gray-400 dark:text-gray-500'}`}>
              {notes || 'No notes yet.'}
            </p>
            <button type="button" onClick={onEdit} className="shrink-0 self-start text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300">
              {notes ? 'Edit notes' : 'Add notes'}{evidence.length > 0 ? ` · ${evidence.length} evidence` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PluginRelationshipView({
  items,
  context,
  onOpen,
  heading = 'Selected item',
}: {
  items: PluginRecord[]
  context: PluginWorkspaceContext
  onOpen: (id: string) => void
  heading?: string
}) {
  const resolveTarget = (kind: 'agent' | 'workflow' | 'group' | 'community', id: string) => {
    if (kind === 'agent') return context.agents.find((entry) => entry.id === id)?.name || id
    if (kind === 'workflow') return context.workflows.find((entry) => entry.id === id)?.name || id
    return id
  }

  const relationships = (item: PluginRecord) => {
    if (isGuardrailRecord(item)) {
      return [
        ...item.appliesTo.agents.map((id) => ({ kind: 'agent' as const, id })),
        ...item.appliesTo.workflows.map((id) => ({ kind: 'workflow' as const, id })),
        ...item.appliesTo.groups.map((id) => ({ kind: 'group' as const, id })),
        ...item.appliesTo.communities.map((id) => ({ kind: 'community' as const, id })),
      ]
    }
    if (isEvalRecord(item)) return item.target.ids.map((id) => ({ kind: item.target.type, id }))
    const ids = Array.isArray(item.fields.targetIds) ? item.fields.targetIds.map(String) : []
    const scope = item.fields.scope === 'agent' ? 'agent' : 'workflow'
    return ids.map((id) => ({ kind: scope, id }))
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40">
      <div className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1.2fr)] border-b border-gray-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
        <div>{heading}</div>
        <div />
        <div>Applies to</div>
      </div>
      {items.map((item) => {
        const targets = relationships(item)
        return (
          <button
            type="button"
            key={item.id}
            onClick={() => onOpen(item.id)}
            className="grid w-full grid-cols-[minmax(0,1fr)_28px_minmax(0,1.2fr)] items-center border-b border-gray-100 px-4 py-4 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{item.name}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.enabled ? 'Active' : 'Inactive'}</div>
            </div>
            <div className="h-px bg-sky-300 dark:bg-sky-700" />
            <div className="flex min-w-0 flex-wrap gap-2 pl-3">
              {targets.length > 0 ? targets.map((target) => (
                <span key={`${target.kind}:${target.id}`} className="max-w-full truncate rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                  <span className="font-medium capitalize">{target.kind}</span>: {resolveTarget(target.kind, target.id)}
                </span>
              )) : (
                <span className="text-xs italic text-gray-400">No targets selected</span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function PluginWorkspacePage({ plugin, isActive = false, onNavigateToDoc }: Props) {
  const { user, config: authConfig } = useAuth()
  const workflowCreateMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const actionsMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const hasLoadedRef = useRef(false)
  const reviewConsolidationRef = useRef('')
  const [context, setContext] = useState<PluginWorkspaceContext>({ agents: [], workflows: [], groups: [], communities: [] })
  const [items, setItems] = useState<PluginRecord[]>([])
  const [templates, setTemplates] = useState<PluginRecordTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [suggestionSearch, setSuggestionSearch] = useState('')
  const [suggestionTag, setSuggestionTag] = useState<string>('all')
  const [collectionTab, setCollectionTab] = useState<PluginCollectionTab>('active')
  const [suggestionSort, setSuggestionSort] = useState<PluginTemplateSort>('recommended')
  const [viewMode, setViewMode] = useState<PluginViewMode>(() => {
    const saved = localStorage.getItem(`clawmax-plugin-view-mode:${plugin.slug}`)
    return saved === 'detail' || saved === 'table' || saved === 'graph' ? saved : 'grid'
  })
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PluginRecord | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedSuggestedTemplateId, setSelectedSuggestedTemplateId] = useState<string | null>(null)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const [showAiPromptEditor, setShowAiPromptEditor] = useState(false)
  const [aiPromptText, setAiPromptText] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [activeCompactActions, setActiveCompactActions] = useState<string | null>(null)
  const [runningItemIds, setRunningItemIds] = useState<Set<string>>(new Set())
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [showReviewExport, setShowReviewExport] = useState(false)
  const [reviewerName, setReviewerName] = useState('')
  const [reviewerEmail, setReviewerEmail] = useState('')
  const [reviewEnvironment, setReviewEnvironment] = useState<'local' | 'cloud' | 'onprem'>('local')
  const [reviewInstance, setReviewInstance] = useState<ReviewExportInstance>({})
  const [reviewExporting, setReviewExporting] = useState(false)
  const [reviewExportError, setReviewExportError] = useState<string | null>(null)
  const [reviewLifecycleBusy, setReviewLifecycleBusy] = useState(false)
  const aiReadiness = getAiGenerationReadiness()
  const aiEnabled = hasAiGenerationAccess()
  const grantedCapabilities = getPluginGrantedCapabilities(plugin)
  const canGenerateDocs = grantedCapabilities.includes('docs')
  const canNotify = grantedCapabilities.includes('notifications')
  const groupField = getPluginGroupField(plugin)
  const checkField = getPluginCheckField(plugin)
  const isChecklist = Boolean(groupField && checkField)

  const load = async ({ forceTemplateRefresh = false }: { forceTemplateRefresh?: boolean } = {}) => {
    try {
      if (!hasLoadedRef.current) setLoading(true)
      const templateQuery = forceTemplateRefresh ? '?refresh=1' : ''
      const [contextRes, itemsRes, templatesRes] = await Promise.all([
        fetch(`/api/plugins/${encodeURIComponent(plugin.slug)}/context`),
        fetch(`/api/plugins/${encodeURIComponent(plugin.slug)}/items`),
        fetch(`/api/plugins/${encodeURIComponent(plugin.slug)}/templates${templateQuery}`),
      ])
      if (!contextRes.ok || !itemsRes.ok || !templatesRes.ok) throw new Error('Failed to load plugin data')
      const [contextJson, itemsJson, templatesJson] = await Promise.all([
        contextRes.json(),
        itemsRes.json(),
        templatesRes.json(),
      ])
      setContext(contextJson.context || { agents: [], workflows: [], groups: [], communities: [] })
      setItems(Array.isArray(itemsJson.items) ? itemsJson.items : [])
      setTemplates(Array.isArray(templatesJson.templates) ? templatesJson.templates : [])
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load plugin data')
    } finally {
      hasLoadedRef.current = true
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isActive) return
    void load()
  }, [plugin.slug, isActive])

  useEffect(() => {
    localStorage.setItem(`clawmax-plugin-view-mode:${plugin.slug}`, viewMode)
  }, [plugin.slug, viewMode])

  const tags = useMemo(() => collectPluginTags(items), [items])
  const groups = useMemo(() => {
    if (!groupField) return []
    return getReviewReleaseGroups(items, groupField, collectionTab === 'archived')
  }, [items, groupField, collectionTab])
  const activeGroup = selectedGroup && groups.includes(selectedGroup) ? selectedGroup : groups[0] || null
  const groupProgress = useMemo(() => Object.fromEntries(groups.map((group) => {
    const records = items.filter((item) => isGenericPluginRecord(item) && item.fields[groupField!] === group)
    const completed = checkField ? records.filter((item) => isGenericPluginRecord(item) && item.fields[checkField] === true).length : 0
    return [group, { completed, total: records.length }]
  })), [groups, items, groupField, checkField])
  const filtered = useMemo(
    () => items.filter((item) => {
      const archived = item.archived === true
      if (collectionTab === 'active' && archived) return false
      if (collectionTab === 'archived' && !archived) return false
      if (collectionTab === 'suggested') return false
      if (selectedTag !== 'all' && !item.tags.includes(selectedTag)) return false
      if (statusFilter === 'enabled' && !item.enabled) return false
      if (statusFilter === 'disabled' && item.enabled) return false
      if (groupField && activeGroup) {
        if (!isGenericPluginRecord(item) || item.fields[groupField] !== activeGroup) return false
      }
      return matchesPluginSearch(item, search)
    }),
    [items, search, selectedTag, statusFilter, collectionTab, groupField, activeGroup]
  )
  const recommendedTemplates = useMemo(() => templates.filter((entry) => {
    if (entry.recommended === false) return false
    const templateFields = 'fields' in entry.payload ? entry.payload.fields : undefined
    const templateGroup = groupField && templateFields ? templateFields[groupField] : null
    return !items.some((item) => {
      if (item.name !== entry.payload.name) return false
      if (!groupField || typeof templateGroup !== 'string') return true
      return isGenericPluginRecord(item) && item.fields[groupField] === templateGroup
    })
  }), [templates, items, groupField])
  const suggestionTags = useMemo(() => {
    const allTags = collectPluginTemplateTags(recommendedTemplates)
    if (!isChecklist) return allTags
    return ['1.9.9', '2.0.0', '2.0.0-test-rc19'].filter((tag) => allTags.includes(tag))
  }, [recommendedTemplates, isChecklist])
  const filteredSuggestions = useMemo(() => sortPluginTemplates(
    recommendedTemplates.filter((template) => (
      (suggestionTag === 'all' || template.tags.includes(suggestionTag))
      && matchesPluginTemplateSearch(template, suggestionSearch)
    )),
    suggestionSort,
  ), [recommendedTemplates, suggestionTag, suggestionSearch, suggestionSort])
  const suggestedPreviewRecords = useMemo(
    () => filteredSuggestions.map(templateToPreviewRecord),
    [filteredSuggestions],
  )
  const selectedSuggestedTemplate = useMemo(
    () => filteredSuggestions.find((template) => template.id === selectedSuggestedTemplateId) || null,
    [filteredSuggestions, selectedSuggestedTemplateId],
  )
  const checklistTemplatesByRelease = useMemo(() => {
    if (!isChecklist || !groupField) return []
    const byRelease = new Map<string, PluginRecordTemplate[]>()
    filteredSuggestions.forEach((template) => {
      const fields = 'fields' in template.payload ? template.payload.fields : undefined
      const release = fields && typeof fields[groupField] === 'string' ? String(fields[groupField]) : 'Unversioned'
      byRelease.set(release, [...(byRelease.get(release) || []), template])
    })
    return Array.from(byRelease.entries()).sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
  }, [filteredSuggestions, isChecklist, groupField])
  const currentChecklistRelease = useMemo(() => {
    if (!isChecklist || !groupField) return null
    const currentTemplate = templates.find((template) => template.tags.includes('current'))
    const fields = currentTemplate && 'fields' in currentTemplate.payload ? currentTemplate.payload.fields : undefined
    const release = fields?.[groupField]
    return typeof release === 'string' && release.trim() ? release.trim() : null
  }, [templates, isChecklist, groupField])
  const activeCount = useMemo(() => items.filter((item) => item.archived !== true).length, [items])
  const archivedCount = useMemo(() => items.filter((item) => item.archived === true).length, [items])
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || null,
    [items, selectedItemId]
  )

  const saveItem = async (draft: Partial<PluginRecord>) => {
    const isEdit = Boolean(draft.id)
    const url = isEdit
      ? `/api/plugins/${encodeURIComponent(plugin.slug)}/items/${encodeURIComponent(String(draft.id))}`
      : `/api/plugins/${encodeURIComponent(plugin.slug)}/items`
    const method = isEdit ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to save item')
    }
    setShowModal(false)
    setEditing(null)
    await load()
  }

  const updateItems = async (records: PluginRecord[], archived: boolean) => {
    const responses = await Promise.all(records.map((record) => fetch(
      `/api/plugins/${encodeURIComponent(plugin.slug)}/items/${encodeURIComponent(record.id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...record, archived }),
      },
    )))
    const failed = responses.find((response) => !response.ok)
    if (failed) {
      const data = await failed.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to update release checklist')
    }
  }

  useEffect(() => {
    if (!isChecklist || !groupField || !checkField || !currentChecklistRelease || loading || reviewLifecycleBusy) return
    const plan = planReviewReleaseConsolidation(items, groupField, checkField, currentChecklistRelease)
    if (plan.updates.length === 0 && plan.deleteIds.length === 0) return
    const signature = JSON.stringify({
      updates: plan.updates.map((record) => [record.id, record.updatedAt, record.fields]),
      deleteIds: plan.deleteIds,
    })
    if (reviewConsolidationRef.current === signature) return
    reviewConsolidationRef.current = signature

    const consolidate = async () => {
      setReviewLifecycleBusy(true)
      setError(null)
      try {
        const updateResponses = await Promise.all(plan.updates.map((record) => fetch(
          `/api/plugins/${encodeURIComponent(plugin.slug)}/items/${encodeURIComponent(record.id)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record),
          },
        )))
        const failedUpdate = updateResponses.find((response) => !response.ok)
        if (failedUpdate) {
          const data = await failedUpdate.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to consolidate earlier release checks')
        }
        const deleteResponses = await Promise.all(plan.deleteIds.map((id) => fetch(
          `/api/plugins/${encodeURIComponent(plugin.slug)}/items/${encodeURIComponent(id)}`,
          { method: 'DELETE' },
        )))
        const failedDelete = deleteResponses.find((response) => !response.ok)
        if (failedDelete) {
          const data = await failedDelete.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to remove duplicate release checks')
        }
        setSelectedGroup(null)
        await load()
      } catch (err: any) {
        reviewConsolidationRef.current = ''
        setError(err.message || 'Failed to consolidate earlier release checks')
      } finally {
        setReviewLifecycleBusy(false)
      }
    }
    void consolidate()
  }, [
    items,
    isChecklist,
    groupField,
    checkField,
    currentChecklistRelease,
    loading,
    reviewLifecycleBusy,
    plugin.slug,
  ])

  const setReleaseArchived = async (release: string, archived: boolean) => {
    if (!groupField || reviewLifecycleBusy) return
    const releaseRecords = items.filter((item) => (
      isGenericPluginRecord(item) && item.fields[groupField] === release
    ))
    if (releaseRecords.length === 0) return
    if (archived && checkField && releaseRecords.some((item) => (
      isGenericPluginRecord(item) && item.fields[checkField] !== true
    ))) {
      const confirmed = window.confirm(`Archive ${release} with unfinished checks? You can restore it from Archived.`)
      if (!confirmed) return
    }
    setReviewLifecycleBusy(true)
    setError(null)
    try {
      await updateItems(releaseRecords, archived)
      setSelectedGroup(null)
      setCollectionTab(archived ? 'archived' : 'active')
      await load()
    } catch (err: any) {
      setError(err.message || 'Failed to update release checklist')
    } finally {
      setReviewLifecycleBusy(false)
      setShowActionsMenu(false)
    }
  }

  const toggleCheck = async (item: PluginRecord) => {
    if (!checkField || !isGenericPluginRecord(item)) return
    await saveItem({
      ...item,
      fields: { ...item.fields, [checkField]: item.fields[checkField] !== true },
    } as Partial<PluginRecord>)
  }

  const setChecklistOutcome = async (item: PluginRecord, outcome: 'pending' | 'passed' | 'failed') => {
    if (!checkField || !isGenericPluginRecord(item)) return
    await saveItem({
      ...item,
      fields: {
        ...item.fields,
        [checkField]: outcome !== 'pending',
        outcome,
      },
    } as Partial<PluginRecord>)
  }

  const handleAiGenerate = async (promptOverride?: string) => {
    const promptText = typeof promptOverride === 'string' ? promptOverride.trim() : aiPromptText.trim()
    if (!promptText) return
    setAiGenerating(true)
    try {
      const draft = buildPluginDraftFromPrompt(plugin, promptText)
      setEditing(draft as PluginRecord)
      setShowAiPrompt(false)
      setShowModal(true)
      setAiPromptText('')
    } finally {
      setAiGenerating(false)
    }
  }

  const callItemAction = async (itemId: string, action: 'delete' | 'document' | 'notify' | 'run' | 'toggle') => {
    if (action === 'toggle') {
      const record = items.find((entry) => entry.id === itemId)
      if (!record) return
      await saveItem({ ...record, enabled: !record.enabled } as Partial<PluginRecord>)
      return
    }

    if (action === 'run') {
      setRunningItemIds((current) => new Set(current).add(itemId))
    }
    const route = action === 'delete'
      ? `/api/plugins/${encodeURIComponent(plugin.slug)}/items/${encodeURIComponent(itemId)}`
      : `/api/plugins/${encodeURIComponent(plugin.slug)}/items/${encodeURIComponent(itemId)}/${action === 'document' ? 'document' : action}`
    try {
      const res = await fetch(route, { method: action === 'delete' ? 'DELETE' : 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Plugin action failed')
      }
      await load()
    } finally {
      if (action === 'run') {
        setRunningItemIds((current) => {
          const next = new Set(current)
          next.delete(itemId)
          return next
        })
      }
    }
  }

  useEffect(() => {
    if (selectedItemId && !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null)
    }
  }, [items, selectedItemId])

  const createDraft: Partial<PluginRecord> = usesLegacyPluginAdapter(plugin, 'guardrail')
    ? { kind: 'guardrail', enabled: true, tags: [], appliesTo: { agents: [], workflows: [], groups: [], communities: [] }, controls: { blockEmail: false, blockWeb: false, blockExternalDocs: false, allowedSkills: [] } }
    : usesLegacyPluginAdapter(plugin, 'eval')
      ? { kind: 'eval', enabled: true, tags: [], target: { type: 'agent', ids: [] }, experiment: { input: '', candidateOutput: '', expectedOutput: '', judge: 'fixed' }, runs: [] }
      : { kind: plugin.objectKind, enabled: true, tags: [], fields: buildGenericPluginFields(plugin) }

  const applyTemplate = async (templateId: string) => {
    const res = await fetch(`/api/plugins/${encodeURIComponent(plugin.slug)}/templates/${encodeURIComponent(templateId)}/apply`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to apply template')
    }
    const data = await res.json()
    await load()
    setCollectionTab('active')
    if (data.item) {
      setEditing(data.item)
      setShowModal(true)
    }
  }

  const applyRecommendedTemplates = async (templatesToApply = recommendedTemplates) => {
    const responses = await Promise.all(templatesToApply.map((template) => fetch(
      `/api/plugins/${encodeURIComponent(plugin.slug)}/templates/${encodeURIComponent(template.id)}/apply`,
      { method: 'POST' },
    )))
    const failed = responses.find((response) => !response.ok)
    if (failed) {
      const data = await failed.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to add release checklist')
    }
    if (isChecklist && groupField && checkField) {
      const templateFields = templatesToApply[0] && 'fields' in templatesToApply[0].payload
        ? templatesToApply[0].payload.fields
        : undefined
      const incomingRelease = templateFields && typeof templateFields[groupField] === 'string'
        ? String(templateFields[groupField])
        : null
      const archiveIds = new Set(getCompletedReviewReleaseIdsToArchive(
        items,
        groupField,
        checkField,
        incomingRelease,
      ))
      const completedOlderRecords = items.filter((item) => archiveIds.has(item.id))
      if (completedOlderRecords.length > 0) await updateItems(completedOlderRecords, true)
      setSelectedGroup(incomingRelease)
    }
    await load()
    setCollectionTab('active')
  }

  const openReviewExport = async () => {
    setShowActionsMenu(false)
    setReviewExportError(null)
    const identity = resolveReviewIdentity(user, readStoredReviewIdentity(window.localStorage))
    setReviewerName(identity.name)
    setReviewerEmail(identity.email)
    setReviewEnvironment(authConfig?.deploymentKind || 'local')
    setShowReviewExport(true)
    try {
      const response = await fetch('/api/system')
      const data = response.ok ? await response.json() : {}
      const deploymentKind = data.deploymentKind === 'cloud' || data.deploymentKind === 'onprem'
        ? data.deploymentKind
        : 'local'
      setReviewEnvironment(deploymentKind)
      setReviewInstance(data)
    } catch {
      setReviewInstance({})
    }
  }

  const exportReview = async () => {
    if (!activeGroup || !reviewerName.trim()) return
    setReviewExporting(true)
    setReviewExportError(null)
    try {
      const exportedAt = new Date().toISOString()
      const recentErrors = await collectRecentRuntimeErrors()
      const markdown = buildReleaseReviewMarkdown({
        release: activeGroup,
        reviewer: { name: reviewerName.trim(), email: reviewerEmail.trim() },
        instance: { ...reviewInstance, deploymentKind: reviewEnvironment },
        exportedAt,
        records: items.filter(isGenericPluginRecord),
        recentErrors,
      })
      storeReviewIdentity(window.localStorage, {
        name: reviewerName,
        email: reviewerEmail,
      })
      const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = buildReleaseReviewFilename(activeGroup, exportedAt)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setShowReviewExport(false)
    } catch (err: any) {
      setReviewExportError(err?.message || 'Failed to export this release review.')
    } finally {
      setReviewExporting(false)
    }
  }

  const shownCount = collectionTab === 'suggested' ? filteredSuggestions.length : filtered.length

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-3 py-5 sm:px-6 sm:py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{plugin.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-gray-500">
            {shownCount} shown
            <span className="text-gray-300">·</span>
            <span>workspace-scoped</span>
            <span className="text-gray-300">·</span>
            <span>v{plugin.version}</span>
          </p>
          <p className="mt-1 max-w-2xl break-words text-sm leading-5 text-gray-500 dark:text-gray-400">{plugin.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">Host grants:</span>
            {grantedCapabilities.length > 0 ? grantedCapabilities.map((capability) => (
              <span key={capability} className="rounded-full border border-gray-200 bg-white px-2 py-0.5 dark:border-gray-700 dark:bg-gray-800">
                {capability}
              </span>
            )) : <span>none</span>}
          </div>
        </div>
        <div className="flex w-full max-w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
          {!isChecklist && <>
          <div className="grid w-full min-w-0 grid-cols-4 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 sm:flex sm:w-auto">
            <button
              onClick={() => setViewMode('grid')}
              title="Grid view (compact)"
              className={`min-w-0 px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'grid' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <ProductIconCell iconName="grid" label="Grid view" size="sm" className="border-transparent bg-transparent text-current" />
            </button>
            <button
              onClick={() => setViewMode('detail')}
              title="Detail view"
              className={`min-w-0 border-l border-gray-200 px-2.5 py-1.5 text-xs transition-colors dark:border-gray-700 ${viewMode === 'detail' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <ProductIconCell iconName="docs" label="Detail view" size="sm" className="border-transparent bg-transparent text-current" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="List view"
              className={`min-w-0 border-l border-gray-200 px-2.5 py-1.5 text-xs transition-colors dark:border-gray-700 ${viewMode === 'table' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <ProductIconCell iconName="list" label="List view" size="sm" className="border-transparent bg-transparent text-current" />
            </button>
            <button
              onClick={() => setViewMode('graph')}
              title="Relationship view"
              className={`min-w-0 border-l border-gray-200 px-2.5 py-1.5 text-xs transition-colors dark:border-gray-700 ${viewMode === 'graph' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <ProductIconCell iconName="workflow" label="Relationship view" size="sm" className="border-transparent bg-transparent text-current" />
            </button>
          </div>
          <div className="relative">
            <button
              ref={workflowCreateMenuButtonRef}
              onClick={() => setShowCreateMenu(!showCreateMenu)}
              className={headerPrimaryButtonClass}
              title={`Create ${plugin.labels?.singular || plugin.name.toLowerCase()}`}
            >
              <span>Create</span> <span className="text-xs leading-none">▾</span>
            </button>
            {showCreateMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowCreateMenu(false)} />
                <div
                  className="z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1"
                  style={workflowCreateMenuButtonRef.current ? getViewportSafeDropdownStyle(workflowCreateMenuButtonRef.current.getBoundingClientRect(), 288) : undefined}
                >
                  <button
                    onClick={() => {
                      setShowCreateMenu(false)
                      setShowAiPrompt(true)
                    }}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                      aiEnabled
                        ? 'text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/30'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/30'
                    }`}
                    title={aiEnabled ? 'Generate plugin draft with AI' : 'Open AI-assisted draft flow'}
                  >
                    <ProductIconCell iconName="ai" label="Create with AI" size="sm" className="border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300" /> Create with AI
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateMenu(false)
                      setEditing(null)
                      setShowModal(true)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors flex items-center gap-2"
                  >
                    <ProductIconCell iconName="create" label="Create" size="sm" className="border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300" /> Create
                  </button>
                </div>
              </>
            )}
          </div>
          </>}
          {isChecklist && (
            <button
              type="button"
              onClick={() => { setEditing(null); setShowModal(true) }}
              className={headerPrimaryButtonClass}
            >
              Add check
            </button>
          )}
          <div className="relative">
            <button
              ref={actionsMenuButtonRef}
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}
              title="Actions"
            >
              Actions <span className="text-xs">▾</span>
            </button>
            {showActionsMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
                <div
                  className="z-20 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                  style={actionsMenuButtonRef.current ? getViewportSafeDropdownStyle(actionsMenuButtonRef.current.getBoundingClientRect(), 220) : undefined}
                >
                  <button
                    onClick={() => {
                      setShowActionsMenu(false)
                      void load({ forceTemplateRefresh: true })
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <ProductIconCell iconName="refresh" label="Refresh" size="sm" className="border-transparent bg-transparent text-current" />
                    Refresh
                  </button>
                  {isChecklist && (
                    <>
                      <button
                        onClick={() => void openReviewExport()}
                        disabled={!activeGroup || items.length === 0}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <ProductIconCell iconName="export" label="Export review" size="sm" className="border-transparent bg-transparent text-current" />
                        Export release review
                      </button>
                      <button
                        onClick={() => activeGroup && void setReleaseArchived(activeGroup, collectionTab !== 'archived')}
                        disabled={!activeGroup || reviewLifecycleBusy}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <ProductIconCell iconName={collectionTab === 'archived' ? 'restore' : 'archive'} label={collectionTab === 'archived' ? 'Restore' : 'Archive'} size="sm" className="border-transparent bg-transparent text-current" />
                        {collectionTab === 'archived' ? 'Restore release checklist' : 'Archive release checklist'}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {(groups.length > 0 || !isChecklist || items.length > 0 || recommendedTemplates.length > 0) && <div className="mb-4">
        {collectionTab !== 'suggested' && groupField && groups.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Release</div>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Release checklists">
              {groups.map((group) => (
                <button
                  key={group}
                  type="button"
                  role="tab"
                  aria-selected={activeGroup === group}
                  onClick={() => setSelectedGroup(group)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${activeGroup === group
                    ? 'border-sky-600 bg-sky-600 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-sky-300 hover:text-sky-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {group}
                  {checkField && groupProgress[group] ? ` · ${groupProgress[group].completed}/${groupProgress[group].total}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid w-full min-w-0 grid-cols-3 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 sm:inline-flex sm:w-auto">
          <button
            onClick={() => setCollectionTab('active')}
            aria-pressed={collectionTab === 'active'}
            className={`min-w-0 px-2 py-2 text-sm font-medium transition-colors sm:px-4 ${
              collectionTab === 'active'
                ? 'bg-sky-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setCollectionTab('archived')}
            aria-pressed={collectionTab === 'archived'}
            className={`min-w-0 px-2 py-2 text-sm font-medium transition-colors sm:px-4 ${
              collectionTab === 'archived'
                ? 'bg-sky-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Archived ({archivedCount})
          </button>
          <button
            onClick={() => setCollectionTab('suggested')}
            aria-pressed={collectionTab === 'suggested'}
            className={`min-w-0 border-l border-gray-200 px-2 py-2 text-sm font-medium transition-colors dark:border-gray-700 sm:px-4 ${
              collectionTab === 'suggested'
                ? 'bg-sky-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Suggested ({recommendedTemplates.length})
          </button>
        </div>
      </div>}

      {collectionTab !== 'suggested' && (!isChecklist || items.length > 0) && <div className="mb-4">
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${plugin.labels?.plural || plugin.name.toLowerCase()} by name, description, tags, or targets`}
            className="w-full px-4 py-2 pr-10 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-colors"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        {search && (
          <div className="mt-2 text-xs text-gray-500">
            Found {filtered.length} {plugin.labels?.plural?.toLowerCase() || 'items'}
          </div>
        )}
      </div>}

      {!isChecklist && collectionTab !== 'suggested' && <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">Filter:</span>
          <button
            onClick={() => setSelectedTag('all')}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
              selectedTag === 'all'
                ? 'bg-sky-600 text-white border border-sky-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-sky-300 hover:text-sky-600'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-sky-600 text-white border border-sky-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-sky-300 hover:text-sky-600'
            }`}
          >
            All states
          </button>
          <button
            onClick={() => setStatusFilter('enabled')}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'enabled'
                ? 'bg-sky-600 text-white border border-sky-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-sky-300 hover:text-sky-600'
            }`}
          >
            Enabled
          </button>
          <button
            onClick={() => setStatusFilter('disabled')}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'disabled'
                ? 'bg-sky-600 text-white border border-sky-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-sky-300 hover:text-sky-600'
            }`}
          >
            Disabled
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedTag === tag
                  ? 'bg-sky-600 text-white border border-sky-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-sky-300 hover:text-sky-600'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>}

      {collectionTab === 'suggested' && (
        <div className="mb-6 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <input
                value={suggestionSearch}
                onChange={(event) => setSuggestionSearch(event.target.value)}
                placeholder={`Search suggested ${plugin.labels?.plural?.toLowerCase() || 'items'} by name, description, tags, or configuration`}
                className="w-full rounded-md border border-gray-200 bg-white px-4 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
              {suggestionSearch && (
                <button
                  type="button"
                  onClick={() => setSuggestionSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                  title="Clear suggested search"
                  aria-label="Clear suggested search"
                >
                  ✕
                </button>
              )}
            </div>
            <label className="flex shrink-0 items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>Sort</span>
              <select
                value={suggestionSort}
                onChange={(event) => setSuggestionSort(event.target.value as PluginTemplateSort)}
                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="recommended">Recommended</option>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-400">Filter:</span>
            {['all', ...suggestionTags].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSuggestionTag(tag)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  suggestionTag === tag
                    ? 'border-sky-600 bg-sky-600 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-sky-300 hover:text-sky-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {tag === 'all' ? 'All' : tag}
              </button>
            ))}
            <span className="w-full text-xs text-gray-500 dark:text-gray-400 sm:ml-auto sm:w-auto">{filteredSuggestions.length} shown</span>
          </div>
        </div>
      )}

      {!loading && !error && collectionTab === 'suggested' && filteredSuggestions.length > 0 && (
        <div className="mt-6">
          {isChecklist ? (
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900/40">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Start a release checklist</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Checklist items are loaded from the plugin's versioned release file. Results and notes remain separated by release.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {checklistTemplatesByRelease.map(([release, releaseTemplates]) => (
                  <button
                    key={release}
                    type="button"
                    onClick={() => void applyRecommendedTemplates(releaseTemplates)}
                    className={headerPrimaryButtonClass}
                  >
                    Start {release} checklist
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Suggested</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Proposed {plugin.labels?.plural?.toLowerCase() || 'items'} you can use and customize for this workspace.</p>
                </div>
              </div>
              {viewMode === 'grid' ? (
                <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {filteredSuggestions.map((template) => (
                    <TemplateCard
                      key={template.id}
                      plugin={plugin}
                      template={template}
                      compact
                      onApply={() => void applyTemplate(template.id)}
                    />
                  ))}
                </div>
              ) : viewMode === 'detail' ? (
                <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                  {filteredSuggestions.map((template) => (
                    <TemplateCard
                      key={template.id}
                      plugin={plugin}
                      template={template}
                      detailed
                      onApply={() => void applyTemplate(template.id)}
                    />
                  ))}
                </div>
              ) : viewMode === 'graph' ? (
                <div className="space-y-4">
                  <PluginRelationshipView
                    items={suggestedPreviewRecords}
                    context={context}
                    onOpen={(id) => setSelectedSuggestedTemplateId(id.replace(/^suggested:/, ''))}
                    heading="Suggested item"
                  />
                  {selectedSuggestedTemplate && (
                    <TemplateCard
                      plugin={plugin}
                      template={selectedSuggestedTemplate}
                      detailed
                      onApply={() => void applyTemplate(selectedSuggestedTemplate.id)}
                    />
                  )}
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40">
                  <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_170px] gap-3 border-b border-gray-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400 sm:grid">
                    <div>Name</div>
                    <div>Tags</div>
                    <div>Actions</div>
                  </div>
                  {filteredSuggestions.map((template) => (
                    <div key={template.id} className="grid gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-gray-800 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_170px] sm:items-center">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{template.name}</div>
                        <div className="mt-0.5 break-words text-sm text-gray-500 dark:text-gray-400">{template.description}</div>
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {template.tags.map((tag) => <span key={tag} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{tag}</span>)}
                      </div>
                      <div className="flex gap-2 sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setSelectedSuggestedTemplateId((current) => current === template.id ? null : template.id)}
                          className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}
                        >
                          Details
                        </button>
                        <button type="button" onClick={() => void applyTemplate(template.id)} className={headerPrimaryButtonClass}>Use</button>
                      </div>
                      {selectedSuggestedTemplateId === template.id && (
                        <div className="sm:col-span-3">
                          <TemplateCard plugin={plugin} template={template} detailed onApply={() => void applyTemplate(template.id)} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">Loading plugin workspace...</div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">{error}</div>
      ) : collectionTab === 'suggested' ? (
        filteredSuggestions.length === 0 ? (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
            {recommendedTemplates.length === 0
              ? `No suggested ${plugin.labels?.plural?.toLowerCase() || 'items'} are available.`
              : 'No suggestions match the current search and filters.'}
          </div>
        ) : null
      ) : filtered.length === 0 && isChecklist ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
          {collectionTab === 'archived' ? 'No archived checks match the current release or search.' : 'No checks match the current release or search. Open Suggested to start a release checklist.'}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState plugin={plugin} onCreate={() => { setEditing(null); setShowModal(true) }} />
        </div>
      ) : (
        <div className={`mt-6 ${selectedItem ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6' : ''}`}>
          <div>
            {!isChecklist && (
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Selected</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} configured for this workspace. Open any item to customize it.</p>
                </div>
              </div>
            )}
            {isChecklist && checkField ? (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900/40">
                {filtered.filter(isGenericPluginRecord).map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    checkField={checkField}
                    onToggle={() => void setChecklistOutcome(item, item.fields[checkField] === true ? 'pending' : 'passed')}
                    onFail={() => void setChecklistOutcome(item, 'failed')}
                    onEdit={() => { setEditing(item); setShowModal(true) }}
                  />
                ))}
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {filtered.map((item) => (
                  <div key={item.id} className="relative">
                    <CompactItemCard
                      plugin={plugin}
                      item={item}
                      selected={selectedItemId === item.id}
                      onOpen={() => setSelectedItemId(item.id)}
                      onToggleActions={() => setActiveCompactActions((current) => current === item.id ? null : item.id)}
                      onCheckToggle={checkField ? (() => void toggleCheck(item)) : null}
                      running={runningItemIds.has(item.id)}
                    />
                    {activeCompactActions === item.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setActiveCompactActions(null)} />
                        <div className="absolute right-3 top-14 z-20 w-48 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                          <button onClick={() => { setActiveCompactActions(null); setEditing(item); setShowModal(true) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                            <ProductIconCell iconName="edit" label="Edit" size="sm" className="border-transparent bg-transparent text-current" />
                            Edit
                          </button>
                          <button onClick={() => { setActiveCompactActions(null); void callItemAction(item.id, 'toggle') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                            <ProductIconCell iconName="pause" label={item.enabled ? 'Disable' : 'Enable'} size="sm" className="border-transparent bg-transparent text-current" />
                            {item.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                          <button onClick={() => { setActiveCompactActions(null); void saveItem({ ...item, archived: item.archived !== true } as Partial<PluginRecord>) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                            <ProductIconCell iconName={item.archived ? 'restore' : 'archive'} label={item.archived ? 'Restore' : 'Archive'} size="sm" className="border-transparent bg-transparent text-current" />
                            {item.archived ? 'Restore' : 'Archive'}
                          </button>
                          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                          {canGenerateDocs && <button onClick={() => { setActiveCompactActions(null); void callItemAction(item.id, 'document') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                            <ProductIconCell iconName="docs" label="Generate Doc" size="sm" className="border-transparent bg-transparent text-current" />
                            Generate Doc
                          </button>}
                          {canNotify && <button onClick={() => { setActiveCompactActions(null); void callItemAction(item.id, 'notify') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                            <ProductIconCell iconName="communication" label="Notify" size="sm" className="border-transparent bg-transparent text-current" />
                            Notify
                          </button>}
                          {isEvalRecord(item) && (
                            <button onClick={() => { setActiveCompactActions(null); void callItemAction(item.id, 'run') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                              <ProductIconCell iconName="play" label="Run Eval" size="sm" className="border-transparent bg-transparent text-current" />
                              Run Eval
                            </button>
                          )}
                          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                          <button onClick={() => { setActiveCompactActions(null); void callItemAction(item.id, 'delete') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/20">
                            <ProductIconCell iconName="delete" label="Delete" size="sm" className="border-transparent bg-transparent text-current" />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : viewMode === 'detail' ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {filtered.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl ${selectedItemId === item.id ? 'ring-2 ring-sky-100 dark:ring-sky-900/30' : ''}`}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <ItemCard
                      plugin={plugin}
                      item={item}
                      onEdit={() => { setEditing(item); setShowModal(true) }}
                      onDelete={() => void callItemAction(item.id, 'delete')}
                      onToggle={() => void callItemAction(item.id, 'toggle')}
                      onGenerateDoc={() => void callItemAction(item.id, 'document')}
                      onNotify={() => void callItemAction(item.id, 'notify')}
                      onRun={isEvalRecord(item) ? (() => void callItemAction(item.id, 'run')) : null}
                      onOpenDoc={onNavigateToDoc || null}
                      onArchiveToggle={() => void saveItem({ ...item, archived: item.archived !== true } as Partial<PluginRecord>)}
                      canGenerateDocs={canGenerateDocs}
                      canNotify={canNotify}
                      onCheckToggle={checkField ? (() => void toggleCheck(item)) : null}
                      running={runningItemIds.has(item.id)}
                    />
                  </div>
                ))}
              </div>
            ) : viewMode === 'graph' ? (
              <PluginRelationshipView
                items={filtered}
                context={context}
                onOpen={setSelectedItemId}
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="grid grid-cols-[minmax(0,2fr)_120px_minmax(0,2fr)_minmax(0,1.5fr)_140px_120px] gap-3 border-b border-gray-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <div>Name</div>
                  <div>Status</div>
                  <div>Scope</div>
                  <div>Usage</div>
                  <div>Updated</div>
                  <div>Actions</div>
                </div>
                {filtered.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`grid cursor-pointer grid-cols-[minmax(0,2fr)_120px_minmax(0,2fr)_minmax(0,1.5fr)_140px_120px] gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0 dark:border-gray-700/60 ${
                      selectedItemId === item.id ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900 dark:text-gray-100">{item.name}</div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">{item.description || item.id}</div>
                    </div>
                    <div>
                      {checkField && isGenericPluginRecord(item) && (
                        <label className="mb-1.5 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={item.fields[checkField] === true}
                            onChange={() => void toggleCheck(item)}
                            className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                          />
                          Done
                        </label>
                      )}
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${item.archived ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : item.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                        {item.archived ? 'Archived' : item.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="truncate text-gray-600 dark:text-gray-300">{formatPluginScopeSummary(item)}</div>
                    <div className="truncate text-gray-500 dark:text-gray-400">{formatPluginUsageSummary(item)}</div>
                    <div className="text-gray-500 dark:text-gray-400">{formatPluginUpdatedAt(item)}</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(event) => { event.stopPropagation(); setSelectedItemId(item.id) }}
                        className="text-gray-300 hover:text-sky-500 transition-colors text-xs p-1 rounded hover:bg-sky-50 dark:hover:bg-sky-900/30"
                        title="Open details"
                      >
                        <ProductIconCell iconName="details" label="Open details" size="sm" className="border-transparent bg-transparent text-current" />
                      </button>
                      {canGenerateDocs && <button
                        onClick={(event) => { event.stopPropagation(); void callItemAction(item.id, 'document') }}
                        className="text-gray-300 hover:text-purple-500 transition-colors text-xs p-1 rounded hover:bg-purple-50 dark:hover:bg-purple-900/30"
                        title="Generate document"
                      >
                        <ProductIconCell iconName="docs" label="Generate document" size="sm" className="border-transparent bg-transparent text-current" />
                      </button>}
                      {canNotify && <button
                        onClick={(event) => { event.stopPropagation(); void callItemAction(item.id, 'notify') }}
                        className="text-gray-300 hover:text-emerald-500 transition-colors text-xs p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                        title="Notify"
                      >
                        <ProductIconCell iconName="communication" label="Notify" size="sm" className="border-transparent bg-transparent text-current" />
                      </button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedItem && (
            <div className="mt-6 xl:mt-0">
              <PluginDetailsPanel
                plugin={plugin}
                item={selectedItem}
                onClose={() => setSelectedItemId(null)}
                onEdit={() => { setEditing(selectedItem); setShowModal(true) }}
                onGenerateDoc={() => void callItemAction(selectedItem.id, 'document')}
                onOpenDoc={onNavigateToDoc || null}
                onNotify={() => void callItemAction(selectedItem.id, 'notify')}
                onToggle={() => void callItemAction(selectedItem.id, 'toggle')}
                onArchiveToggle={() => void saveItem({ ...selectedItem, archived: selectedItem.archived !== true } as Partial<PluginRecord>)}
                onDelete={() => void callItemAction(selectedItem.id, 'delete')}
                onRun={isEvalRecord(selectedItem) ? (() => void callItemAction(selectedItem.id, 'run')) : null}
                canGenerateDocs={canGenerateDocs}
                canNotify={canNotify}
              />
            </div>
          )}
        </div>
      )}

      {showModal && (
        <PluginFormModal
          plugin={plugin}
          context={context}
          draft={editing || createDraft}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSave={(draft) => { void saveItem(draft) }}
        />
      )}

      {showReviewExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4">
          <div className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-5 sm:py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Export {activeGroup} review</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Creates a shareable Markdown report with checklist results, notes, instance details, and sanitized recent runtime errors.
                </p>
              </div>
              <button type="button" onClick={() => setShowReviewExport(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close review export">✕</button>
            </div>
            <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Reviewer name</span>
                <input
                  value={reviewerName}
                  onChange={(event) => setReviewerName(event.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Reviewer email</span>
                <input
                  type="email"
                  value={reviewerEmail}
                  onChange={(event) => setReviewerEmail(event.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Environment</legend>
                <div className="inline-flex max-w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                  {(['local', 'cloud', 'onprem'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setReviewEnvironment(kind)}
                      className={`border-r border-gray-200 px-3 py-2 text-sm font-medium capitalize last:border-r-0 dark:border-gray-700 ${reviewEnvironment === kind
                        ? 'bg-sky-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                    >
                      {kind === 'onprem' ? 'On-prem' : kind}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
                <div>{reviewInstance.instanceLabel || reviewInstance.machineName || reviewInstance.hostname || 'Current instance'}</div>
                <div className="mt-1 text-gray-500">Dashboard {reviewInstance.version || 'unknown'} · {reviewInstance.platform || 'unknown platform'}</div>
              </div>
              {reviewExportError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{reviewExportError}</div>}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-4 py-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] dark:border-gray-700 sm:px-5 sm:py-4">
              <button type="button" onClick={() => setShowReviewExport(false)} className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}>Cancel</button>
              <button type="button" onClick={() => void exportReview()} disabled={!reviewerName.trim() || reviewExporting} className={`${headerPrimaryButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}>
                {reviewExporting ? 'Collecting errors…' : 'Export review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAiPrompt && (
        <MobileSafeDialog
          ariaLabelledBy="plugin-ai-create-title"
          onClose={() => setShowAiPrompt(false)}
          panelClassName="max-w-lg"
          header={(
            <div className="flex items-center justify-between gap-4">
              <h2 id="plugin-ai-create-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI Create {plugin.labels?.singular || plugin.name}</h2>
              <button type="button" onClick={() => setShowAiPrompt(false)} className="text-xl text-gray-400 hover:text-gray-600 dark:text-gray-400" aria-label="Close plugin AI Create">✕</button>
            </div>
          )}
          footer={(
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowAiPrompt(false)}
                className="w-full rounded-md px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700 sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAiGenerate()}
                disabled={aiGenerating || !aiPromptText.trim()}
                className="w-full rounded-md bg-purple-600 px-4 py-2 text-sm text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {aiGenerating ? 'Generating...' : `Generate ${plugin.labels?.singular || plugin.name}`}
              </button>
            </div>
          )}
        >
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Describe what you want this {plugin.labels?.singular?.toLowerCase() || plugin.name.toLowerCase()} to do in natural language. ClawMax will draft a starter you can review and edit before saving.
          </p>
          {!aiEnabled && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
              <div className="font-medium">AI expansion is disabled because no AI execution path is configured</div>
              <div className="mt-1 text-xs opacity-90">
                You can still create a local draft from this prompt, or configure BYOK to use the AI Editor expansion flow.
              </div>
            </div>
          )}
          {aiReadiness.warning && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
              <div className="font-medium">AI-assisted create may be limited</div>
              <div className="mt-1 text-xs opacity-90">{aiReadiness.warning}</div>
            </div>
          )}
          <textarea
            value={aiPromptText}
            onChange={(e) => setAiPromptText(e.target.value)}
            placeholder={usesLegacyPluginAdapter(plugin, 'guardrail')
              ? 'e.g., Create a guardrail for research agents that blocks outbound email and external document sharing'
              : usesLegacyPluginAdapter(plugin, 'eval')
                ? 'e.g., Create an eval for a research workflow that judges output quality and compares summaries against expected findings'
                : `Describe the ${plugin.labels?.singular?.toLowerCase() || plugin.objectKind} to create`}
            className="min-h-[100px] w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) void handleAiGenerate() }}
          />
          <div className="mt-2">
            <PromptQualityPanel prompt={aiPromptText} domain="plugin" compact />
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setShowAiPromptEditor(true)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Open AI Editor
            </button>
          </div>
        </MobileSafeDialog>
      )}

      <AIPromptEditorModal
        isOpen={showAiPromptEditor}
        title={`AI Editor · ${plugin.labels?.singular || plugin.name}`}
        initialValue={aiPromptText}
        onClose={() => setShowAiPromptEditor(false)}
        onSave={(value) => setAiPromptText(value)}
        onSaveAndGenerate={(value) => {
          setAiPromptText(value)
          setShowAiPromptEditor(false)
          void handleAiGenerate(value)
        }}
        onExpandWithAi={(value, format, guidance) => expandPromptWithAI(value, 'workflow', format, guidance)}
        saveLabel="Save Prompt"
        saveAndGenerateLabel={`Save & Generate ${plugin.labels?.singular || plugin.name}`}
        placeholder={`Describe the ${plugin.labels?.singular?.toLowerCase() || plugin.name.toLowerCase()} you want to create...`}
        savingAndGenerating={aiGenerating}
        generateDisabled={!aiPromptText.trim()}
        qualityDomain="plugin"
      />
    </div>
  )
}
