import React, { useEffect, useMemo, useRef, useState } from 'react'
import AIPromptEditorModal from '../components/AIPromptEditorModal'
import AgentLifecycleEvidence, { type AgentLifecycleEvidenceData } from '../components/AgentLifecycleEvidence'
import PromptQualityPanel from '../components/PromptQualityPanel'
import { MobileSafeDialog } from '../components/MobileSafeDialog'
import { useAuth } from '../contexts/AuthContext'
import { ProductIconCell } from '../lib/productIcons'
import { headerPrimaryButtonClass, headerSecondaryButtonClass, headerSecondaryButtonIdleClass } from '../lib/headerControls'
import { expandPromptWithAI } from '../lib/aiPrompt'
import { getAiGenerationReadiness, hasAiGenerationAccess } from '../lib/byok'
import { getViewportSafeDropdownStyle } from '../lib/dropdownPosition'
import { getEvalAttributes, getEvalJudge, getEvalTrialCount } from '../lib/evalGraph'
import { buildCompressedTimelineLayout } from '../lib/lifecycleGraph'
import type { EvalCase, GenericPluginRecord, PluginFieldValue, PluginManifest, PluginRecord, PluginRecordTemplate, PluginWorkspaceContext } from '../lib/plugins'
import {
  buildGenericPluginFields,
  buildPluginDraftFromPrompt,
  parseGuardrailAssistantConfig,
  collectPluginTemplateTags,
  collectPluginTags,
  extractSuggestedEvalRegex,
  formatPluginScopeSummary,
  formatPluginTargetNames,
  formatPluginUpdatedAt,
  formatPluginUsageSummary,
  getOrderedPluginFields,
  getEvalReadiness,
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
  validateEvalRegex,
} from '../lib/plugins'
import { applyOptimizeAssistantText } from '../lib/optimizeAssistant'
import { getPluginAiCreateCopy } from '../lib/pluginAiCreateCopy'
import { getOptimizationDimensions } from '../lib/optimizeGraph'
import {
  buildReleaseReviewFilename,
  buildReleaseReviewMarkdown,
  isReviewErrorLine,
  sanitizeReviewLogLine,
  type ReviewExportInstance,
} from '../lib/reviewExport'
import { readStoredReviewIdentity, resolveReviewIdentity, storeReviewIdentity } from '../lib/reviewIdentity'
import {
  getSupersededReviewReleaseIdsToArchive,
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
const OPTIMIZE_AI_TUNING_EXPANDED_STORAGE_KEY = 'clawmax-optimize-ai-tuning-expanded'
const GUARDRAIL_AI_CONFIG_EXPANDED_STORAGE_KEY = 'clawmax-guardrail-ai-config-expanded'
const EVAL_AI_CONFIG_EXPANDED_STORAGE_KEY = 'clawmax-eval-ai-config-expanded'

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
          ? 'Create workspace-scoped advisory policies for agents and workflows. These records do not intercept runtime tools or network access.'
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

function LifecycleTargetPicker({
  options,
  selected,
  subjectLabel,
  onChange,
}: {
  options: Array<{ id: string; name: string }>
  selected: string[]
  subjectLabel: string
  onChange: (ids: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const normalizedSearch = search.trim().toLowerCase()
  const visible = options.filter((option) => !normalizedSearch || `${option.name} ${option.id}`.toLowerCase().includes(normalizedSearch))
  const selectedSet = new Set(selected)
  const toggle = (id: string) => onChange(selectedSet.has(id) ? selected.filter((entry) => entry !== id) : [...selected, id])

  return (
    <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-2 dark:border-gray-700">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${subjectLabel}s`}
          aria-label={`Search lifecycle ${subjectLabel}s`}
          className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{selected.length} selected</span>
      </div>
      <div className="max-h-56 overflow-y-auto p-2" aria-label={`Lifecycle ${subjectLabel} selection`}>
        {visible.map((option) => (
          <label key={option.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/60">
            <input type="checkbox" checked={selectedSet.has(option.id)} onChange={() => toggle(option.id)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
            <span className="min-w-0"><span className="block font-medium text-gray-800 dark:text-gray-200">{option.name}</span><span className="block truncate text-xs text-gray-500">{option.id}</span></span>
          </label>
        ))}
        {visible.length === 0 && <div className="px-2 py-5 text-center text-sm text-gray-500">No matching agents.</div>}
      </div>
    </div>
  )
}

function GenericPluginFields({
  plugin,
  fields,
  context,
  onChange,
}: {
  plugin: PluginManifest
  fields: Record<string, PluginFieldValue>
  context: PluginWorkspaceContext
  onChange: (fields: Record<string, PluginFieldValue>) => void
}) {
  const required = new Set(plugin.recordSchema?.required || [])
  const update = (key: string, value: PluginFieldValue) => onChange({ ...fields, [key]: value })
  const orderedFields = getOrderedPluginFields(plugin)
  const isOptimize = plugin.objectKind === 'optimization-plan'
  const isLifecycle = plugin.objectKind === 'lifecycle-view'
  const fieldGroups = isOptimize
    ? [
        { title: 'Target and priority', keys: ['scope', 'targetIds', 'optimizationGoal', 'status'] },
        { title: 'Budgets', keys: ['monthlyTokenBudget', 'monthlyCostBudget', 'perRunTokenBudget', 'perRunCostBudget'] },
        { title: 'Quality and speed', keys: ['maximumRunDurationSeconds', 'minimumQualityScore'] },
        { title: 'Current usage', keys: ['currentTokens', 'currentCost'] },
        { title: 'Model and schedule', keys: ['automaticModelSelection', 'modelPriority', 'recommendedModel', 'recommendedSchedule'] },
        { title: 'Recommendation', keys: ['rationale'] },
      ]
    : [{ title: '', keys: orderedFields.map(([key]) => key) }]

  const renderField = ([key, schema]: [string, ReturnType<typeof getOrderedPluginFields>[number][1]]) => {
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
      if ((isOptimize || isLifecycle) && key === 'targetIds') {
        const scopeValue = isLifecycle ? fields.subjectType : fields.scope
        const scope = scopeValue === 'agent' ? 'agent'
          : scopeValue === 'workflow' ? 'workflow'
            : scopeValue === 'group' ? 'group'
              : scopeValue === 'community' ? 'community'
                : 'workspace'
              const options = scope === 'agent' ? context.agents
                : scope === 'workflow' ? context.workflows
                  : scope === 'group' ? context.groups.map((name) => ({ id: name, name }))
                    : scope === 'community' ? context.communities.map((name) => ({ id: name, name }))
                      : []
        const selected = Array.isArray(value) ? value.map(String) : []
        return (
          <label key={key} className="block">
            {label}
            {scope === 'workspace' ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">Current workspace</div>
            ) : isLifecycle && (scope === 'agent' || scope === 'workflow' || scope === 'group' || scope === 'community') ? (
              <LifecycleTargetPicker options={options} selected={selected} subjectLabel={scope} onChange={(ids) => update(key, ids)} />
            ) : (
              <select
                multiple
                value={selected}
                size={Math.min(6, Math.max(3, options.length))}
                onChange={(event) => update(key, Array.from(event.target.selectedOptions).map((option) => option.value))}
                className={className}
              >
                {options.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.id})</option>)}
              </select>
            )}
            <span className="mt-1 block text-xs text-gray-500">
              {scope === 'workspace'
                ? 'This plan applies to the complete workspace.'
                : isLifecycle
                  ? `Select one or more ${scope}s to compare their histories in separate timeline lanes.`
                  : `Select one or more ${scope}s. Use Cmd/Ctrl to select multiple.`}
            </span>
          </label>
        )
      }
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
      const gauge = key === 'minimumQualityScore' ? 'quality' : key === 'maximumRunDurationSeconds' ? 'duration' : null
      return (
        <div key={key} className="block">
          {label}
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <div className="min-w-0">
              <input
                type="range"
                aria-label={`${schema.title} slider`}
                min={schema.minimum}
                max={schema.maximum}
                step={step}
                value={numericValue}
                onChange={(event) => update(key, normalizePluginNumericValue(schema, event.target.value))}
                className={`h-2 w-full min-w-0 cursor-pointer rounded-full accent-sky-600 ${
                  gauge === 'quality'
                    ? 'appearance-none bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-400 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-sky-600 [&::-webkit-slider-thumb]:shadow'
                    : gauge === 'duration'
                      ? 'appearance-none bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-400 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-sky-600 [&::-webkit-slider-thumb]:shadow'
                      : ''
                }`}
              />
              {gauge && (
                <div className="mt-1 flex justify-between text-[10px] font-medium text-gray-400 dark:text-gray-500">
                  <span>{gauge === 'quality' ? 'Lower confidence' : 'Faster'}</span>
                  <span>{gauge === 'quality' ? 'Higher confidence' : 'Slower'}</span>
                </div>
              )}
            </div>
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
  }

  return (
    <div className={isOptimize ? 'grid gap-4 xl:grid-cols-2' : 'space-y-4'}>
      {fieldGroups.map((group) => {
        const groupFields = orderedFields.filter(([key]) => group.keys.includes(key))
        if (groupFields.length === 0) return null
        return (
          <section
            key={group.title || 'fields'}
            className={isOptimize
              ? `rounded-lg border border-gray-200 p-4 dark:border-gray-700 ${group.title === 'Recommendation' ? 'xl:col-span-2' : ''}`
              : ''}
          >
            {group.title && <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{group.title}</h3>}
            <div className="space-y-4">
              {groupFields.map(renderField)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function createEvalCase(index: number): EvalCase {
  return {
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `case-${Date.now()}-${index}`,
    name: `Trial case ${index}`,
    input: { type: 'text', value: '' },
    expected: { type: 'text', value: '' },
  }
}

function getEvalCasesFromDraft(draft: Partial<PluginRecord>): EvalCase[] {
  if (!isEvalRecord(draft)) return [createEvalCase(1)]
  if (draft.experiment.cases?.length) return draft.experiment.cases.map((entry) => ({
    ...entry,
    input: { ...entry.input },
    expected: { ...entry.expected },
  }))
  return [{
    id: 'case-1',
    name: 'Trial case 1',
    input: { type: 'text', value: draft.experiment.input || '' },
    expected: { type: 'text', value: draft.experiment.expectedOutput || '' },
  }]
}

function EvalCasesDialog({
  initialCases,
  evaluator,
  fixedMatch,
  onClose,
  onSave,
}: {
  initialCases: EvalCase[]
  evaluator: 'ai' | 'human' | 'fixed'
  fixedMatch: 'exact' | 'contains' | 'regex'
  onClose: () => void
  onSave: (cases: EvalCase[]) => void
}) {
  const [cases, setCases] = useState<EvalCase[]>(initialCases)
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([])

  useEffect(() => {
    let active = true
    void fetch('/api/docs')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Could not load workspace files.')))
      .then((payload) => {
        if (!active) return
        setWorkspaceFiles(Array.from(new Set(
          (Array.isArray(payload?.entries) ? payload.entries : [])
            .map((entry: any) => String(entry?.path || '').trim())
            .filter(Boolean),
        )).sort())
      })
      .catch(() => {
        if (active) setWorkspaceFiles([])
      })
    return () => {
      active = false
    }
  }, [])

  const updateCase = (id: string, update: (entry: EvalCase) => EvalCase) => {
    setCases((current) => current.map((entry) => entry.id === id ? update(entry) : entry))
  }

  return (
    <MobileSafeDialog
      ariaLabelledBy="eval-cases-title"
      onClose={onClose}
      panelClassName="max-w-4xl"
      zIndexClassName="z-[130]"
      header={(
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="eval-cases-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">Trial cases</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Each case can use text or a workspace file for its input and {evaluator === 'fixed' && fixedMatch === 'regex' ? 'expected regular expression' : 'expected outcome'}.
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 text-xl text-gray-500 dark:border-gray-700" aria-label="Close trial cases">×</button>
        </div>
      )}
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-gray-500">{cases.length} case{cases.length === 1 ? '' : 's'}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300">Cancel</button>
            <button type="button" onClick={() => onSave(cases)} disabled={cases.length === 0} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">Save cases</button>
          </div>
        </div>
      )}
    >
      <datalist id="eval-workspace-files">
        {workspaceFiles.map((file) => <option key={file} value={file} />)}
      </datalist>
      <div className="space-y-4">
        {cases.map((entry, index) => (
          <section key={entry.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="flex items-start justify-between gap-3">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">Case {index + 1}</span>
                <input
                  value={entry.name}
                  onChange={(event) => updateCase(entry.id, (current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder={`Trial case ${index + 1}`}
                />
              </label>
              <button type="button" onClick={() => setCases((current) => current.filter((item) => item.id !== entry.id))} className="mt-5 inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-300" aria-label={`Delete ${entry.name || `case ${index + 1}`}`}>×</button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {(['input', 'expected'] as const).map((field) => {
                const value = entry[field]
                const label = field === 'input'
                  ? 'Input'
                  : evaluator === 'fixed' && fixedMatch === 'regex'
                    ? 'Expected regular expression'
                    : evaluator === 'fixed' && fixedMatch === 'exact'
                      ? 'Expected exact output'
                      : evaluator === 'fixed'
                        ? 'Expected value'
                        : 'Expected outcome'
                return (
                  <div key={field} className="min-w-0">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
                      <div className="grid grid-cols-2 overflow-hidden rounded-md border border-gray-300 text-xs dark:border-gray-600">
                        {(['text', 'file'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => updateCase(entry.id, (current) => ({ ...current, [field]: { type, value: '' } }))}
                            className={`px-2 py-1 ${value.type === type ? 'bg-sky-600 text-white' : 'bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
                            aria-pressed={value.type === type}
                          >
                            {type === 'text' ? 'Text' : 'File'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {value.type === 'text' ? (
                      <textarea
                        value={value.value}
                        onChange={(event) => updateCase(entry.id, (current) => ({ ...current, [field]: { ...current[field], value: event.target.value } }))}
                        rows={5}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        placeholder={field === 'input'
                          ? 'Prompt or representative input'
                          : evaluator === 'fixed' && fixedMatch === 'regex'
                            ? 'Regular expression, for example: ^Approved:\\s+.+$'
                            : evaluator === 'fixed'
                              ? 'Value to compare with the candidate output'
                              : 'Expected answer, rubric outcome, or acceptance criteria'}
                      />
                    ) : (
                      <div>
                        <input
                          list="eval-workspace-files"
                          value={value.value}
                          onChange={(event) => updateCase(entry.id, (current) => ({ ...current, [field]: { ...current[field], value: event.target.value } }))}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          placeholder="Search or enter a workspace file path"
                        />
                        <span className="mt-1 block text-xs text-gray-500">References an existing workspace file; its contents are not copied into this Eval.</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
        <button
          type="button"
          onClick={() => setCases((current) => [...current, createEvalCase(current.length + 1)])}
          className="w-full rounded-lg border border-dashed border-sky-300 px-4 py-3 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/30"
        >
          + Add trial case
        </button>
      </div>
    </MobileSafeDialog>
  )
}

function PluginFormModal({
  plugin,
  context,
  draft,
  focusEvalTargets = false,
  onClose,
  onSave,
}: {
  plugin: PluginManifest
  context: PluginWorkspaceContext
  draft: Partial<PluginRecord>
  focusEvalTargets?: boolean
  onClose: () => void
  onSave: (draft: Partial<PluginRecord>) => void
}) {
  const [form, setForm] = useState<Partial<PluginRecord>>(draft)
  const [assistantPrompt, setAssistantPrompt] = useState('')
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [assistantError, setAssistantError] = useState('')
  const [assistantChanges, setAssistantChanges] = useState<string[]>([])
  const [assistantUndo, setAssistantUndo] = useState<Partial<PluginRecord> | null>(null)
  const [targetSearch, setTargetSearch] = useState('')
  const [showEvalCases, setShowEvalCases] = useState(false)
  const [evalCaseDrafts, setEvalCaseDrafts] = useState<EvalCase[]>([])
  const [regexIntent, setRegexIntent] = useState('')
  const [regexBusy, setRegexBusy] = useState(false)
  const [regexError, setRegexError] = useState('')
  const evalTargetsRef = useRef<HTMLElement | null>(null)
  const [showOptimizeAssistant, setShowOptimizeAssistant] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(OPTIMIZE_AI_TUNING_EXPANDED_STORAGE_KEY) !== 'false'
  })
  const isOptimize = plugin.objectKind === 'optimization-plan'
  const isGuardrail = usesLegacyPluginAdapter(plugin, 'guardrail')
  const isEval = usesLegacyPluginAdapter(plugin, 'eval')
  const [showGuardrailAssistant, setShowGuardrailAssistant] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(GUARDRAIL_AI_CONFIG_EXPANDED_STORAGE_KEY) !== 'false'
  })
  const [showEvalAssistant, setShowEvalAssistant] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(EVAL_AI_CONFIG_EXPANDED_STORAGE_KEY) !== 'false'
  })

  useEffect(() => {
    setForm(draft)
    setAssistantPrompt('')
    setAssistantError('')
    setAssistantChanges([])
    setAssistantUndo(null)
    setTargetSearch('')
    setShowEvalCases(false)
    setEvalCaseDrafts([])
    setRegexIntent('')
    setRegexError('')
  }, [draft])

  useEffect(() => {
    if (!focusEvalTargets || !isEval) return
    window.requestAnimationFrame(() => evalTargetsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }, [focusEvalTargets, isEval, draft])

  useEffect(() => {
    if (!isOptimize || typeof window === 'undefined') return
    window.localStorage.setItem(OPTIMIZE_AI_TUNING_EXPANDED_STORAGE_KEY, String(showOptimizeAssistant))
  }, [isOptimize, showOptimizeAssistant])

  useEffect(() => {
    if (!isGuardrail || typeof window === 'undefined') return
    window.localStorage.setItem(GUARDRAIL_AI_CONFIG_EXPANDED_STORAGE_KEY, String(showGuardrailAssistant))
  }, [isGuardrail, showGuardrailAssistant])

  useEffect(() => {
    if (!isEval || typeof window === 'undefined') return
    window.localStorage.setItem(EVAL_AI_CONFIG_EXPANDED_STORAGE_KEY, String(showEvalAssistant))
  }, [isEval, showEvalAssistant])

  const tags = typeof form.tags?.join === 'function' ? form.tags.join(', ') : ''
  const allowedSkills = isGuardrailRecord(form)
    ? (form.controls?.allowedSkills || []).join(', ')
    : ''
  const evalTargetType = isEvalRecord(form) ? form.target.type : 'agent'
  const evalTargetOptions = evalTargetType === 'workflow'
    ? context.workflows
    : evalTargetType === 'group'
      ? context.groups.map((group) => ({ id: group, name: group }))
      : context.agents
  const visibleEvalTargetOptions = evalTargetOptions.filter((entry) => (
    !targetSearch.trim()
    || entry.id.toLowerCase().includes(targetSearch.trim().toLowerCase())
    || entry.name.toLowerCase().includes(targetSearch.trim().toLowerCase())
  ))
  const genericFields = isGenericPluginRecord(form) ? form.fields : buildGenericPluginFields(plugin)
  const draftQuality = useMemo(() => scorePluginDraft(plugin, form), [plugin, form])

  const parseCommaList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean)
  const applyAiOptimizeChanges = async () => {
    const prompt = assistantPrompt.trim()
    if (!prompt || !isOptimize) return
    setAssistantBusy(true)
    setAssistantError('')
    try {
      const expanded = await expandPromptWithAI(
        prompt,
        'workflow',
        'text',
        `Turn the request into concise Optimize plan directives. Use only relevant lines from:
Scope: agent, workflow, or workspace
Target: name from the request
Priority: quality, balanced, speed, tokens, or cost
Monthly token budget:
Monthly cost budget:
Per-run token budget:
Per-run cost budget:
Maximum run duration:
Minimum quality score:
Automatic model selection:
Model priority: quality, balanced, or cost
Recommended model:
Recommended schedule:
Rationale:
Preserve existing values when the request does not ask to change them.`,
      )
      const result = applyOptimizeAssistantText(form, `${prompt}\n${expanded}`, context)
      if (result.changes.length === 0) {
        throw new Error('The assistant did not find a concrete plan change. Include a target, budget, quality floor, duration, model priority, or schedule.')
      }
      setAssistantUndo(form)
      setForm(result.draft)
      setAssistantChanges(result.changes)
    } catch (error: any) {
      setAssistantError(error?.message || 'Could not tune this plan with AI.')
    } finally {
      setAssistantBusy(false)
    }
  }
  const applyAiGuardrailChanges = async () => {
    const prompt = assistantPrompt.trim()
    if (!prompt || !isGuardrail) return
    setAssistantBusy(true)
    setAssistantError('')
    try {
      const expanded = await expandPromptWithAI(
        prompt,
        'agent',
        'text',
        `Return only one JSON object with this exact shape:
{"representable":true,"reason":"","blockEmail":true|false|null,"blockWeb":true|false|null,"blockExternalDocs":true|false|null,"allowedSkills":[]}
Use true only when the user asks to block that action, false only when the user asks to allow it, and null when it is not mentioned.
Set representable to false and explain why when the request cannot be expressed using outbound email, public web access, external document sharing, or approved skill IDs.
Do not include prose or Markdown.`,
      )
      const generated = parseGuardrailAssistantConfig(expanded)
      const targetText = prompt.toLowerCase()
      const matchedAgents = context.agents.filter((agent) => (
        targetText.includes(agent.id.toLowerCase()) || targetText.includes(agent.name.toLowerCase())
      )).map((agent) => agent.id)
      const matchedWorkflows = context.workflows.filter((workflow) => (
        targetText.includes(workflow.id.toLowerCase()) || targetText.includes(workflow.name.toLowerCase())
      )).map((workflow) => workflow.id)
      const matchedSkills = generated.allowedSkills
      const current = isGuardrailRecord(form) ? form : null
      const nextControls = {
        blockEmail: generated.blockEmail ?? current?.controls.blockEmail ?? false,
        blockWeb: generated.blockWeb ?? current?.controls.blockWeb ?? false,
        blockExternalDocs: generated.blockExternalDocs ?? current?.controls.blockExternalDocs ?? false,
      }
      const next: Partial<PluginRecord> = {
        ...form,
        kind: 'guardrail',
        description: prompt,
        enabled: true,
        tags: current?.tags || ['safety'],
        controls: {
          ...nextControls,
          allowedSkills: matchedSkills.length > 0 ? matchedSkills : current?.controls.allowedSkills || [],
        },
        appliesTo: {
          agents: matchedAgents.length > 0 ? matchedAgents : current?.appliesTo.agents || [],
          workflows: matchedWorkflows.length > 0 ? matchedWorkflows : current?.appliesTo.workflows || [],
          groups: current?.appliesTo.groups || [],
          communities: current?.appliesTo.communities || [],
        },
      }
      const changes = [
        ...(generated.blockEmail === null ? [] : [nextControls.blockEmail ? 'Block outbound email' : 'Allow outbound email']),
        ...(generated.blockWeb === null ? [] : [nextControls.blockWeb ? 'Block public web access' : 'Allow public web access']),
        ...(generated.blockExternalDocs === null ? [] : [nextControls.blockExternalDocs ? 'Block external document sharing' : 'Allow external document sharing']),
        ...(matchedAgents.length > 0 ? [`Assign ${matchedAgents.length} agent${matchedAgents.length === 1 ? '' : 's'}`] : []),
        ...(matchedWorkflows.length > 0 ? [`Assign ${matchedWorkflows.length} workflow${matchedWorkflows.length === 1 ? '' : 's'}`] : []),
        ...(matchedSkills.length > 0 ? [`Allow ${matchedSkills.length} approved skill${matchedSkills.length === 1 ? '' : 's'}`] : []),
      ]
      setAssistantUndo(form)
      setForm(next)
      setAssistantChanges(changes)
    } catch (error: any) {
      setAssistantError(error?.message || 'Could not configure this Guardrail with AI.')
    } finally {
      setAssistantBusy(false)
    }
  }
  const applyAiEvalChanges = async () => {
    const prompt = assistantPrompt.trim()
    if (!prompt || !isEval) return
    setAssistantBusy(true)
    setAssistantError('')
    try {
      const expanded = await expandPromptWithAI(
        prompt,
        'workflow',
        'text',
        `Turn the request into a concise Eval configuration using these exact labels when relevant:
Name:
Description:
Evaluator: AI, Human, or Fixed
Evaluator guidance: AI judge prompt or Human reviewer instructions
Fixed comparison: Exact, Contains, or Regular expression
Case sensitive: Yes or No
Trials: integer from 1 to 100
Target type: agent or workflow
Target: exact agent or workflow name from the request
Input:
Expected outcome:
Attributes: comma-separated correctness, quality, speed, cost, safety, privacy, grounding, tone, handoff, or instruction fit
Prefer AI for semantic evaluation, Fixed for exact measurable checks, and Human for subjective review or approval.
Preserve existing values when the request does not ask to change them.`,
      )
      const combined = `${prompt}\n${expanded}`
      const lower = combined.toLowerCase()
      const current = isEvalRecord(form) ? form : null
      const readLine = (label: string) => {
        const match = expanded.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'))
        return match?.[1]?.trim() || ''
      }
      const matchedAgents = context.agents.filter((agent) => (
        lower.includes(agent.id.toLowerCase()) || lower.includes(agent.name.toLowerCase())
      )).map((agent) => agent.id)
      const matchedWorkflows = context.workflows.filter((workflow) => (
        lower.includes(workflow.id.toLowerCase()) || lower.includes(workflow.name.toLowerCase())
      )).map((workflow) => workflow.id)
      const evaluatorText = readLine('Evaluator').toLowerCase()
      const judge = /human|reviewer|manual/.test(evaluatorText || lower)
        ? 'human'
        : /\bai\b|model|semantic/.test(evaluatorText || lower)
          ? 'ai'
          : /fixed|exact|deterministic|heuristic/.test(evaluatorText || lower)
            ? 'fixed'
            : current?.experiment.judge || 'ai'
      const trialsText = readLine('Trials')
      const trialsMatch = trialsText.match(/\d+/)
        || combined.match(/(?:trials?|iterations?|prompts?|runs?|samples?)\D{0,12}(\d{1,3})/i)
      const iterations = Math.max(1, Math.min(100, Number(trialsMatch?.[1] || trialsMatch?.[0]) || current?.experiment.iterations || 1))
      const targetType = matchedWorkflows.length > 0
        ? 'workflow'
        : matchedAgents.length > 0
          ? 'agent'
          : /target type:\s*workflow|\bworkflow\b/i.test(expanded)
            ? 'workflow'
            : current?.target.type || 'agent'
      const targetIds = targetType === 'workflow'
        ? (matchedWorkflows.length > 0 ? matchedWorkflows : current?.target.type === 'workflow' ? current.target.ids : [])
        : (matchedAgents.length > 0 ? matchedAgents : current?.target.type === 'agent' ? current.target.ids : [])
      const attributes = parseCommaList(readLine('Attributes').toLowerCase())
      const input = readLine('Input') || current?.experiment.input || prompt
      const expectedOutput = readLine('Expected outcome') || current?.experiment.expectedOutput || ''
      const judgeGuidance = readLine('Evaluator guidance') || current?.experiment.judgeGuidance || ''
      const fixedComparison = readLine('Fixed comparison').toLowerCase()
      const fixedMatch = /regular|regex/.test(fixedComparison)
        ? 'regex'
        : /contains|include/.test(fixedComparison)
          ? 'contains'
          : fixedComparison
            ? 'exact'
            : current?.experiment.fixedMatch || 'exact'
      const caseSensitive = readLine('Case sensitive').toLowerCase()
      const fixedCaseSensitive = caseSensitive
        ? /yes|true|sensitive/.test(caseSensitive) && !/no|false|insensitive/.test(caseSensitive)
        : current?.experiment.fixedCaseSensitive || false
      const currentCases = getEvalCasesFromDraft(form)
      const cases = readLine('Input') || readLine('Expected outcome')
        ? [{
            id: currentCases[0]?.id || 'case-1',
            name: currentCases[0]?.name || 'Trial case 1',
            input: { type: 'text' as const, value: input },
            expected: { type: 'text' as const, value: expectedOutput },
          }, ...currentCases.slice(1)]
        : currentCases
      const next: Partial<PluginRecord> = {
        ...form,
        kind: 'eval',
        name: readLine('Name') || form.name,
        description: readLine('Description') || prompt,
        enabled: true,
        tags: Array.from(new Set([...(current?.tags || []), targetType, ...attributes])),
        target: { type: targetType, ids: targetIds },
        experiment: {
          input,
          candidateOutput: current?.experiment.candidateOutput || '',
          expectedOutput,
          judge,
          iterations,
          judgeGuidance,
          fixedMatch,
          fixedCaseSensitive,
          humanReviewerName: current?.experiment.humanReviewerName || '',
          humanReviewerEmail: current?.experiment.humanReviewerEmail || '',
          humanReviewPath: current?.experiment.humanReviewPath || '',
          cases,
        },
        runs: current?.runs || [],
      }
      const changes = [
        `Use ${judge === 'ai' ? 'AI' : judge === 'human' ? 'Human' : 'Fixed'} evaluation`,
        `Plan ${iterations} trial${iterations === 1 ? '' : 's'}`,
        `Target ${targetType}${targetIds.length > 0 ? ` (${targetIds.length} selected)` : ''}`,
        ...(readLine('Input') ? ['Update experiment input'] : []),
        ...(readLine('Expected outcome') ? ['Update expected outcome'] : []),
        ...(readLine('Evaluator guidance') ? ['Update evaluator guidance'] : []),
        ...(judge === 'fixed' && readLine('Fixed comparison') ? [`Use ${fixedMatch} comparison`] : []),
        ...(attributes.length > 0 ? [`Evaluate ${attributes.join(', ')}`] : []),
      ]
      setAssistantUndo(form)
      setForm(next)
      setAssistantChanges(changes)
    } catch (error: any) {
      setAssistantError(error?.message || 'Could not configure this Eval with AI.')
    } finally {
      setAssistantBusy(false)
    }
  }
  const suggestEvalRegex = async () => {
    const intent = regexIntent.trim()
    if (!intent || !isEval) return
    setRegexBusy(true)
    setRegexError('')
    try {
      const expanded = await expandPromptWithAI(
        intent,
        'workflow',
        'text',
        'Return exactly one JavaScript-compatible regular expression pattern. Do not include slash delimiters, flags, prose, or Markdown fences.',
      )
      const pattern = extractSuggestedEvalRegex(expanded)
      const validationError = validateEvalRegex(pattern)
      if (validationError) throw new Error(validationError)
      setForm((current) => {
        if (current.kind !== 'eval') return current
        const cases = getEvalCasesFromDraft(current)
        return {
          ...current,
          experiment: {
            ...current.experiment,
            expectedOutput: pattern,
            fixedMatch: 'regex',
            cases: cases.map((entry, index) => index === 0
              ? { ...entry, expected: { type: 'text', value: pattern } }
              : entry),
          },
        }
      })
    } catch (error: any) {
      setRegexError(error?.message || 'Could not suggest a valid regular expression.')
    } finally {
      setRegexBusy(false)
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:px-5 sm:py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {form.id ? `Edit ${plugin.labels?.singular || plugin.name}` : `Create ${plugin.labels?.singular || plugin.name}`}
            </h2>
            <p className="mt-1 max-w-3xl break-words text-sm text-gray-500 dark:text-gray-400">{plugin.description}</p>
          </div>
          <button onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 text-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300" aria-label="Close editor">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-w-0 gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.4fr)]">
          {isOptimize && (
            <section className="rounded-lg border border-sky-200 bg-sky-50/60 dark:border-sky-900/50 dark:bg-sky-950/20 lg:col-span-2">
              <button
                type="button"
                onClick={() => setShowOptimizeAssistant((current) => !current)}
                className="flex w-full min-w-0 items-center justify-between gap-3 p-4 text-left"
                aria-expanded={showOptimizeAssistant}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ProductIconCell iconName="ai" label="AI tune" size="sm" className="shrink-0 border-sky-200 bg-white text-sky-600 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-sky-950 dark:text-sky-100">Tune with AI</span>
                    <span className="block text-xs text-sky-800/80 dark:text-sky-200/80">Describe the outcome. The assistant updates this draft; you review and save it.</span>
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-sky-700 dark:text-sky-300">{showOptimizeAssistant ? '▾' : '▸'}</span>
              </button>
              {showOptimizeAssistant && (
                <div className="border-t border-sky-200 px-4 pb-4 pt-3 dark:border-sky-900">
                  <textarea
                    value={assistantPrompt}
                    onChange={(event) => setAssistantPrompt(event.target.value)}
                    rows={4}
                    placeholder="Keep the Daily Report workflow under $20/month and 10k tokens per run, finish within 2 minutes, preserve quality above 88, and use automatic cost-priority model selection."
                    className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 dark:border-sky-800 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void applyAiOptimizeChanges()}
                      disabled={!assistantPrompt.trim() || assistantBusy}
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {assistantBusy ? 'Tuning...' : 'Tune plan'}
                    </button>
                    {assistantUndo && (
                      <button
                        type="button"
                        onClick={() => {
                          setForm(assistantUndo)
                          setAssistantUndo(null)
                          setAssistantChanges([])
                        }}
                        className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                  {assistantError && <p className="mt-3 text-xs text-red-700 dark:text-red-300">{assistantError}</p>}
                  {assistantChanges.length > 0 && (
                    <div className="mt-3 border-t border-sky-200 pt-3 dark:border-sky-900">
                      <div className="text-xs font-semibold text-sky-900 dark:text-sky-200">Draft updated</div>
                      <ul className="mt-1 space-y-1 text-xs text-sky-800 dark:text-sky-200">
                        {assistantChanges.map((change) => <li key={change}>• {change}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
          {isGuardrail && (
            <section className="rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20 lg:col-span-2">
              <button
                type="button"
                onClick={() => setShowGuardrailAssistant((current) => !current)}
                className="flex w-full min-w-0 items-center justify-between gap-3 p-4 text-left"
                aria-expanded={showGuardrailAssistant}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ProductIconCell iconName="ai" label="AI configure" size="sm" className="shrink-0 border-amber-200 bg-white text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-amber-950 dark:text-amber-100">Configure with AI</span>
                    <span className="block text-xs text-amber-800/80 dark:text-amber-200/80">Describe the advisory policy intent and which agents or workflows it references. Review every change before saving.</span>
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-amber-700 dark:text-amber-300">{showGuardrailAssistant ? '▾' : '▸'}</span>
              </button>
              {showGuardrailAssistant && (
                <div className="border-t border-amber-200 px-4 pb-4 pt-3 dark:border-amber-900">
                  <textarea
                    value={assistantPrompt}
                    onChange={(event) => setAssistantPrompt(event.target.value)}
                    rows={4}
                    placeholder="Keep the Research workflow from sending email or sharing documents externally. Allow public web research and apply it to the Research workflow."
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 dark:border-amber-800 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void applyAiGuardrailChanges()}
                      disabled={!assistantPrompt.trim() || assistantBusy}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {assistantBusy ? 'Configuring...' : 'Configure Guardrail'}
                    </button>
                    {assistantUndo && (
                      <button
                        type="button"
                        onClick={() => {
                          setForm(assistantUndo)
                          setAssistantUndo(null)
                          setAssistantChanges([])
                        }}
                        className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:bg-gray-900 dark:text-amber-300"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                  {assistantError && <p className="mt-3 text-xs text-red-700 dark:text-red-300">{assistantError}</p>}
                  {assistantChanges.length > 0 && (
                    <div className="mt-3 border-t border-amber-200 pt-3 dark:border-amber-900">
                      <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">Draft updated</div>
                      <ul className="mt-1 grid gap-1 text-xs text-amber-800 dark:text-amber-200 sm:grid-cols-2">
                        {assistantChanges.map((change) => <li key={change}>• {change}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
          {isEval && (
            <section className="rounded-lg border border-violet-200 bg-violet-50/60 dark:border-violet-900/50 dark:bg-violet-950/20 lg:col-span-2">
              <button
                type="button"
                onClick={() => setShowEvalAssistant((current) => !current)}
                className="flex w-full min-w-0 items-center justify-between gap-3 p-4 text-left"
                aria-expanded={showEvalAssistant}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ProductIconCell iconName="ai" label="AI configure" size="sm" className="shrink-0 border-violet-200 bg-white text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-violet-950 dark:text-violet-100">Configure with AI</span>
                    <span className="block text-xs text-violet-800/80 dark:text-violet-200/80">Describe what to evaluate, how many trials to run, who evaluates it, and the expected outcome. Review every change before saving.</span>
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-violet-700 dark:text-violet-300">{showEvalAssistant ? '▾' : '▸'}</span>
              </button>
              {showEvalAssistant && (
                <div className="border-t border-violet-200 px-4 pb-4 pt-3 dark:border-violet-900">
                  <textarea
                    value={assistantPrompt}
                    onChange={(event) => setAssistantPrompt(event.target.value)}
                    rows={4}
                    placeholder="Evaluate the Research workflow 15 times for correctness, grounding, and safety. Use an AI evaluator and require evidence-backed answers with no exposed secrets."
                    className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 dark:border-violet-800 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void applyAiEvalChanges()}
                      disabled={!assistantPrompt.trim() || assistantBusy}
                      className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {assistantBusy ? 'Configuring...' : 'Configure Eval'}
                    </button>
                    {assistantUndo && (
                      <button
                        type="button"
                        onClick={() => {
                          setForm(assistantUndo)
                          setAssistantUndo(null)
                          setAssistantChanges([])
                        }}
                        className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-50 dark:border-violet-800 dark:bg-gray-900 dark:text-violet-300"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                  {assistantError && <p className="mt-3 text-xs text-red-700 dark:text-red-300">{assistantError}</p>}
                  {assistantChanges.length > 0 && (
                    <div className="mt-3 border-t border-violet-200 pt-3 dark:border-violet-900">
                      <div className="text-xs font-semibold text-violet-900 dark:text-violet-200">Draft updated</div>
                      <ul className="mt-1 grid gap-1 text-xs text-violet-800 dark:text-violet-200 sm:grid-cols-2">
                        {assistantChanges.map((change) => <li key={change}>• {change}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
          <div className="min-w-0 space-y-4 lg:sticky lg:top-5 lg:self-start">
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
              <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">External action guidance</h3>
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">Advisory only: checked actions are recorded as policy intent, but the dashboard does not intercept runtime tools, direct network access, or side effects.</p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                <label className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors ${
                  form.kind === 'guardrail' && form.controls?.blockEmail
                    ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100'
                    : 'border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300'
                }`}>
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
                    className="mt-0.5"
                  />
                  <span><span className="block font-medium">Flag outbound email as disallowed</span><span className="mt-0.5 block text-xs opacity-70">Records advisory intent; it does not stop a mail tool or direct SMTP/API access.</span></span>
                </label>
                <label className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors ${
                  form.kind === 'guardrail' && form.controls?.blockWeb
                    ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100'
                    : 'border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300'
                }`}>
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
                    className="mt-0.5"
                  />
                  <span><span className="block font-medium">Flag public web access as disallowed</span><span className="mt-0.5 block text-xs opacity-70">Records advisory intent; it does not stop browser, shell, or direct network access.</span></span>
                </label>
                <label className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors ${
                  form.kind === 'guardrail' && form.controls?.blockExternalDocs
                    ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100'
                    : 'border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300'
                }`}>
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
                    className="mt-0.5"
                  />
                  <span><span className="block font-medium">Flag external document sharing as disallowed</span><span className="mt-0.5 block text-xs opacity-70">Records advisory intent; it does not intercept document or sharing tools.</span></span>
                </label>
                </div>
              </section>
              <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Approved skills</h3>
                <label className="block">
                <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Only list skills that this Guardrail explicitly permits.</span>
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
                  placeholder="workspace-ls, web-search"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                </label>
              </section>
              <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Assignments</h3>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Select the agents and workflows this advisory policy references. Assignment does not enforce the policy at runtime.</p>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
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
                <span className="mt-1 block text-xs text-gray-500">{form.kind === 'guardrail' ? form.appliesTo?.agents.length || 0 : 0} selected</span>
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
                <span className="mt-1 block text-xs text-gray-500">{form.kind === 'guardrail' ? form.appliesTo?.workflows.length || 0 : 0} selected</span>
              </label>
                </div>
              </section>
            </div>
          ) : usesLegacyPluginAdapter(plugin, 'eval') ? (
            <div className="space-y-4">
              <section ref={evalTargetsRef} className={`scroll-mt-4 rounded-lg border p-4 ${focusEvalTargets ? 'border-sky-400 ring-2 ring-sky-100 dark:border-sky-600 dark:ring-sky-900/30' : 'border-gray-200 dark:border-gray-700'}`}>
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Assign targets</h3>
                <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Target type</span>
                    <select
                      value={evalTargetType}
                      onChange={(e) => {
                        setTargetSearch('')
                        setForm((current) => ({
                          ...current,
                          kind: 'eval',
                          target: {
                            type: e.target.value as 'agent' | 'workflow' | 'group',
                            ids: [],
                          },
                        }))
                      }}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="agent">Agents</option>
                      <option value="workflow">Workflows</option>
                      <option value="group">Groups</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Search {evalTargetType}s</span>
                    <input
                      value={targetSearch}
                      onChange={(event) => setTargetSearch(event.target.value)}
                      placeholder={`Find a ${evalTargetType} by name or ID`}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </label>
                </div>
                <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  {visibleEvalTargetOptions.length > 0 ? visibleEvalTargetOptions.map((entry) => {
                    const selected = isEvalRecord(form) && form.target.ids.includes(entry.id)
                    return (
                      <label key={entry.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-sm last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/70">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => setForm((current) => {
                            const currentIds = current.kind === 'eval' ? current.target.ids : []
                            return {
                              ...current,
                              kind: 'eval',
                              target: {
                                type: evalTargetType,
                                ids: event.target.checked
                                  ? Array.from(new Set([...currentIds, entry.id]))
                                  : currentIds.filter((id) => id !== entry.id),
                              },
                            }
                          })}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-gray-800 dark:text-gray-200">{entry.name}</span>
                          {entry.id !== entry.name && <span className="block truncate text-xs text-gray-500">{entry.id}</span>}
                        </span>
                      </label>
                    )
                  }) : (
                    <div className="px-3 py-6 text-center text-sm text-gray-500">No matching {evalTargetType}s.</div>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500">{isEvalRecord(form) ? form.target.ids.length : 0} selected</p>
              </section>
              <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Evaluator</span>
                <select
                  value={form.kind === 'eval' ? form.experiment?.judge || 'fixed' : 'fixed'}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    kind: 'eval',
                    experiment: {
                      input: current.kind === 'eval' ? current.experiment?.input || '' : '',
                      candidateOutput: current.kind === 'eval' ? current.experiment?.candidateOutput || '' : '',
                      expectedOutput: current.kind === 'eval' ? current.experiment?.expectedOutput || '' : '',
                      judge: e.target.value === 'ai' || e.target.value === 'human' ? e.target.value : 'fixed',
                      iterations: current.kind === 'eval' ? current.experiment?.iterations || 1 : 1,
                      judgeGuidance: current.kind === 'eval' ? current.experiment?.judgeGuidance || '' : '',
                      fixedMatch: current.kind === 'eval' ? current.experiment?.fixedMatch || 'exact' : 'exact',
                      fixedCaseSensitive: current.kind === 'eval' ? current.experiment?.fixedCaseSensitive || false : false,
                      humanReviewerName: current.kind === 'eval' ? current.experiment?.humanReviewerName || '' : '',
                      humanReviewerEmail: current.kind === 'eval' ? current.experiment?.humanReviewerEmail || '' : '',
                      humanReviewPath: current.kind === 'eval' ? current.experiment?.humanReviewPath || '' : '',
                      cases: current.kind === 'eval' ? current.experiment?.cases || [] : [],
                    },
                  }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="ai">AI evaluator (not yet runnable)</option>
                  <option value="fixed">Fixed evaluator</option>
                  <option value="human">Human evaluator</option>
                </select>
              </label>
                {form.kind === 'eval' && form.experiment?.judge === 'fixed' ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Comparison rule</span>
                      <select
                        value={form.experiment.fixedMatch || 'exact'}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          kind: 'eval',
                          experiment: {
                            ...(current.kind === 'eval' ? current.experiment : {
                              input: '',
                              candidateOutput: '',
                              expectedOutput: '',
                              judge: 'fixed' as const,
                            }),
                            fixedMatch: event.target.value === 'contains' || event.target.value === 'regex' ? event.target.value : 'exact',
                          },
                        }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="exact">Exact output</option>
                        <option value="contains">Contains expected value</option>
                        <option value="regex">Regular expression</option>
                      </select>
                    </label>
                    <label className="flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={form.experiment.fixedCaseSensitive === true}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          kind: 'eval',
                          experiment: {
                            ...(current.kind === 'eval' ? current.experiment : {
                              input: '',
                              candidateOutput: '',
                              expectedOutput: '',
                              judge: 'fixed' as const,
                            }),
                            fixedCaseSensitive: event.target.checked,
                          },
                        }))}
                      />
                      Case sensitive
                    </label>
                    {form.experiment.fixedMatch === 'regex' && (
                      <div className="space-y-3 sm:col-span-2">
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Default regular expression</span>
                          <input
                            value={form.experiment.expectedOutput || ''}
                            onChange={(event) => {
                              const pattern = event.target.value
                              setRegexError('')
                              setForm((current) => {
                                if (current.kind !== 'eval') return current
                                const cases = getEvalCasesFromDraft(current)
                                return {
                                  ...current,
                                  experiment: {
                                    ...current.experiment,
                                    expectedOutput: pattern,
                                    cases: cases.map((entry, index) => index === 0
                                      ? { ...entry, expected: { type: 'text', value: pattern } }
                                      : entry),
                                  },
                                }
                              })
                            }}
                            placeholder="^Approved:\\s+release candidate \\d+$"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          />
                          <span className={`mt-1 block text-xs ${validateEvalRegex(form.experiment.expectedOutput || '') ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                            {validateEvalRegex(form.experiment.expectedOutput || '') || 'Valid regular expression'}
                          </span>
                        </label>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <input
                            value={regexIntent}
                            onChange={(event) => {
                              setRegexIntent(event.target.value)
                              setRegexError('')
                            }}
                            placeholder="Describe what the output should match"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          />
                          <button
                            type="button"
                            onClick={suggestEvalRegex}
                            disabled={!regexIntent.trim() || regexBusy}
                            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {regexBusy ? 'Suggesting…' : 'Suggest regex'}
                          </button>
                        </div>
                        {regexError && <p className="text-xs text-rose-600 dark:text-rose-300">{regexError}</p>}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 sm:col-span-2 dark:text-gray-400">Set the expected value or regular expression independently for each trial case.</p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {form.kind === 'eval' && form.experiment?.judge === 'human' ? 'Human reviewer instructions' : 'AI evaluator prompt'}
                    </span>
                    <textarea
                      value={form.kind === 'eval' ? form.experiment?.judgeGuidance || '' : ''}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        kind: 'eval',
                        experiment: {
                          input: current.kind === 'eval' ? current.experiment.input : '',
                          candidateOutput: current.kind === 'eval' ? current.experiment.candidateOutput : '',
                          expectedOutput: current.kind === 'eval' ? current.experiment.expectedOutput : '',
                          judge: current.kind === 'eval' ? current.experiment.judge : 'ai',
                          iterations: current.kind === 'eval' ? current.experiment.iterations || 1 : 1,
                          judgeGuidance: event.target.value,
                          fixedMatch: current.kind === 'eval' ? current.experiment.fixedMatch || 'exact' : 'exact',
                      fixedCaseSensitive: current.kind === 'eval' ? current.experiment.fixedCaseSensitive || false : false,
                      humanReviewerName: current.kind === 'eval' ? current.experiment.humanReviewerName || '' : '',
                      humanReviewerEmail: current.kind === 'eval' ? current.experiment.humanReviewerEmail || '' : '',
                      humanReviewPath: current.kind === 'eval' ? current.experiment.humanReviewPath || '' : '',
                      cases: current.kind === 'eval' ? current.experiment.cases || [] : [],
                        },
                      }))}
                      rows={5}
                      placeholder={form.kind === 'eval' && form.experiment?.judge === 'human'
                        ? 'Tell the reviewer what to inspect, what evidence to record, and how to decide pass or fail.'
                        : 'Write the judge prompt: define the rubric, priorities, evidence requirements, scoring scale, and failure conditions.'}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      {form.kind === 'eval' && form.experiment?.judge === 'human'
                        ? 'These instructions are shown to the assigned reviewer.'
                        : 'This prompt guides the model that judges each candidate output against its trial case.'}
                    </span>
                  </label>
                  {form.kind === 'eval' && form.experiment?.judge === 'human' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Reviewer name</span>
                        <input
                          value={form.experiment.humanReviewerName || ''}
                          onChange={(event) => setForm((current) => current.kind === 'eval' ? ({
                            ...current,
                            experiment: { ...current.experiment, humanReviewerName: event.target.value },
                          }) : current)}
                          placeholder="Reviewer name"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Reviewer email</span>
                        <input
                          type="email"
                          value={form.experiment.humanReviewerEmail || ''}
                          onChange={(event) => setForm((current) => current.kind === 'eval' ? ({
                            ...current,
                            experiment: { ...current.experiment, humanReviewerEmail: event.target.value },
                          }) : current)}
                          placeholder="reviewer@example.com"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Review Markdown path</span>
                        <input
                          value={form.experiment.humanReviewPath || ''}
                          onChange={(event) => setForm((current) => current.kind === 'eval' ? ({
                            ...current,
                            experiment: { ...current.experiment, humanReviewPath: event.target.value },
                          }) : current)}
                          placeholder="SYSTEM/evals/reviews/release-quality-review.md"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                          Running this Eval creates a pending workspace review file. Email is assignment metadata only; delivery requires an explicitly configured mail workflow.
                        </span>
                      </label>
                    </div>
                  )}
                  </div>
                )}
              </section>
              <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Planned trials</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.kind === 'eval' ? form.experiment?.iterations || 1 : 1}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    kind: 'eval',
                    experiment: {
                      input: current.kind === 'eval' ? current.experiment?.input || '' : '',
                      candidateOutput: current.kind === 'eval' ? current.experiment?.candidateOutput || '' : '',
                      expectedOutput: current.kind === 'eval' ? current.experiment?.expectedOutput || '' : '',
                      judge: current.kind === 'eval' ? current.experiment?.judge || 'ai' : 'ai',
                      iterations: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))),
                      judgeGuidance: current.kind === 'eval' ? current.experiment?.judgeGuidance || '' : '',
                      fixedMatch: current.kind === 'eval' ? current.experiment?.fixedMatch || 'exact' : 'exact',
                      fixedCaseSensitive: current.kind === 'eval' ? current.experiment?.fixedCaseSensitive || false : false,
                      humanReviewerName: current.kind === 'eval' ? current.experiment?.humanReviewerName || '' : '',
                      humanReviewerEmail: current.kind === 'eval' ? current.experiment?.humanReviewerEmail || '' : '',
                      humanReviewPath: current.kind === 'eval' ? current.experiment?.humanReviewPath || '' : '',
                      cases: current.kind === 'eval' ? current.experiment?.cases || [] : [],
                    },
                  }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Total executions across the configured case set. Cases can be repeated when this is greater than the number of cases.</span>
              </label>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900/50 dark:bg-violet-950/20">
                  <div>
                    <div className="text-sm font-semibold text-violet-950 dark:text-violet-100">Trial cases</div>
                    <p className="mt-0.5 text-xs text-violet-800/80 dark:text-violet-200/80">
                      {getEvalCasesFromDraft(form).length} configured · each case has its own text or workspace-file input and expected outcome
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEvalCaseDrafts(getEvalCasesFromDraft(form))
                      setShowEvalCases(true)
                    }}
                    className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700"
                  >
                    Manage cases
                  </button>
                </div>
              </section>
            </div>
          ) : (
            <GenericPluginFields
              plugin={plugin}
              fields={genericFields}
              context={context}
              onChange={(fields) => setForm((current) => ({ ...current, kind: plugin.objectKind, fields } as Partial<GenericPluginRecord>))}
            />
          )}
          </div>
        </div>
        <div className="shrink-0 border-t border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-5 sm:py-4">
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
    {showEvalCases && (
      <EvalCasesDialog
        initialCases={evalCaseDrafts}
        evaluator={form.kind === 'eval' ? form.experiment.judge : 'ai'}
        fixedMatch={form.kind === 'eval' ? form.experiment.fixedMatch || 'exact' : 'exact'}
        onClose={() => setShowEvalCases(false)}
        onSave={(cases) => {
          const firstCase = cases[0]
          setForm((current) => ({
            ...current,
            kind: 'eval',
            experiment: {
              input: firstCase?.input.type === 'text' ? firstCase.input.value : current.kind === 'eval' ? current.experiment.input : '',
              candidateOutput: current.kind === 'eval' ? current.experiment.candidateOutput : '',
              expectedOutput: firstCase?.expected.type === 'text' ? firstCase.expected.value : current.kind === 'eval' ? current.experiment.expectedOutput : '',
              judge: current.kind === 'eval' ? current.experiment.judge : 'ai',
              iterations: current.kind === 'eval' ? current.experiment.iterations || Math.max(1, cases.length) : Math.max(1, cases.length),
              judgeGuidance: current.kind === 'eval' ? current.experiment.judgeGuidance || '' : '',
              fixedMatch: current.kind === 'eval' ? current.experiment.fixedMatch || 'exact' : 'exact',
              fixedCaseSensitive: current.kind === 'eval' ? current.experiment.fixedCaseSensitive || false : false,
              humanReviewerName: current.kind === 'eval' ? current.experiment.humanReviewerName || '' : '',
              humanReviewerEmail: current.kind === 'eval' ? current.experiment.humanReviewerEmail || '' : '',
              humanReviewPath: current.kind === 'eval' ? current.experiment.humanReviewPath || '' : '',
              cases,
            },
            runs: current.kind === 'eval' ? current.runs : [],
          }))
          setShowEvalCases(false)
        }}
      />
    )}
    </>
  )
}

function ItemCard({
  plugin,
  item,
  context,
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
  onOpenScore,
  running = false,
}: {
  plugin: PluginManifest
  item: PluginRecord
  context: PluginWorkspaceContext
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
  onOpenScore: (() => void) | null
  running?: boolean
}) {
  const commonSummary = formatPluginScopeSummary(item)
  const targetNames = formatPluginTargetNames(item, context)
  const archived = item.archived === true
  const usageSummary = formatPluginUsageSummary(item)
  const [showActions, setShowActions] = useState(false)
  const detailLines = getPluginDetailLines(plugin, item)
  const evalReadiness = isEvalRecord(item) ? getEvalReadiness(item) : null
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
                  <ProductIconCell iconName="docs" label={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'} size="sm" className="border-transparent bg-transparent text-current" />
                  {isEvalRecord(item) ? 'Create or refresh report' : 'Generate document'}
                </button>}
                {canNotify && <button onClick={() => { setShowActions(false); onNotify() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <ProductIconCell iconName="notification" label="Send status notification" size="sm" className="border-transparent bg-transparent text-current" />
                  Send status notification
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
      {targetNames.length > 0 && (
        <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 dark:border-sky-900/40 dark:bg-sky-950/20">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Acts on</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {targetNames.map((target) => <span key={target} className="rounded-md border border-sky-200 bg-white px-2 py-0.5 text-xs text-sky-700 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300">{target}</span>)}
          </div>
        </div>
      )}
      {plugin.objectKind === 'lifecycle-view' && targetNames.length > 0 && <div className="mt-2 text-xs font-medium text-sky-700 dark:text-sky-300">Select this card to open the target X-ray below.</div>}
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
      {evalReadiness && !evalReadiness.ready && (
        <button type="button" onClick={onEdit} className="mt-3 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          Needs setup: {evalReadiness.issues.join('; ')}. Open to configure.
        </button>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={onOpenDoc && item.document?.path ? (() => onOpenDoc(item.document!.path)) : undefined}
          disabled={!onOpenDoc || !item.document?.path}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
            onOpenDoc && item.document?.path
              ? 'text-sky-500 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-900/30'
              : 'cursor-not-allowed text-gray-300 dark:text-gray-600'
          }`}
          title={item.document?.path ? 'Open generated report' : 'Create a report first'}
          aria-label={item.document?.path ? 'Open generated report' : 'No generated report'}
        >
          <ProductIconCell iconName="docs" label={item.document?.path ? 'Open generated report' : 'No generated report'} size="sm" className="border-transparent bg-transparent text-current" />
        </button>
        {canGenerateDocs && <button
          onClick={onGenerateDoc}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-purple-500 transition-colors hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-900/30"
          title={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'}
          aria-label={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'}
        >
          <ProductIconCell iconName="docs" label={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'} size="sm" className="border-transparent bg-transparent text-current" />
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
        {isEvalRecord(item) && !onRun && (
          <button
            type="button"
            disabled
            className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full text-gray-300 dark:text-gray-600"
            title={evalReadiness?.issues.join('; ')}
            aria-label={`Eval is not ready: ${evalReadiness?.issues.join('; ')}`}
          >
            <ProductIconCell iconName="play" label="Eval is not ready" size="sm" className="border-transparent bg-transparent text-current" />
          </button>
        )}
        <button
          onClick={onToggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          title={item.enabled ? 'Disable' : 'Enable'}
          aria-label={item.enabled ? 'Disable' : 'Enable'}
        >
          <ProductIconCell iconName={item.enabled ? 'pause' : 'restart'} label={item.enabled ? 'Disable' : 'Enable'} size="sm" className="border-transparent bg-transparent text-current" />
        </button>
      </div>
      {isEvalRecord(item) && item.lastRun && (
        <button
          type="button"
          onClick={onOpenScore || undefined}
          disabled={!onOpenScore}
          className="mt-4 w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 text-left transition-colors hover:border-violet-300 hover:bg-violet-100 disabled:cursor-default disabled:hover:border-violet-200 disabled:hover:bg-violet-50 dark:border-violet-900/40 dark:bg-violet-900/10 dark:hover:border-violet-700 dark:hover:bg-violet-900/20"
          aria-label={`Open score review for ${item.name}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-violet-800 dark:text-violet-300">Latest score</div>
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold text-violet-700 dark:text-violet-200">{item.lastRun.score}/100</div>
              <span className="text-xs font-medium text-violet-700 dark:text-violet-300">Review</span>
            </div>
          </div>
          <p className="mt-1 text-sm text-violet-700/80 dark:text-violet-300/80">{item.lastRun.summary}</p>
        </button>
      )}
    </div>
  )
}

function CompactItemCard({
  plugin,
  item,
  context,
  selected,
  onOpen,
  onToggleActions,
  onCheckToggle,
  onOpenScore,
  onRun,
  onReport,
  onNotify,
  onToggle,
  canGenerateDocs,
  canNotify,
  running = false,
}: {
  plugin: PluginManifest
  item: PluginRecord
  context: PluginWorkspaceContext
  selected: boolean
  onOpen: () => void
  onToggleActions: () => void
  onCheckToggle: (() => void) | null
  onOpenScore: (() => void) | null
  onRun: (() => void) | null
  onReport: (() => void) | null
  onNotify: (() => void) | null
  onToggle: () => void
  canGenerateDocs: boolean
  canNotify: boolean
  running?: boolean
}) {
  const archived = item.archived === true
  const targetNames = formatPluginTargetNames(item, context)
  const usageSummary = formatPluginUsageSummary(item)
  const checkField = getPluginCheckField(plugin)
  const checked = checkField && isGenericPluginRecord(item) ? item.fields[checkField] === true : false
  const evalReadiness = isEvalRecord(item) ? getEvalReadiness(item) : null
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
      {targetNames.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Plugin targets">{targetNames.map((target) => <span key={target} className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">{target}</span>)}</div>}
      {plugin.objectKind === 'lifecycle-view' && targetNames.length > 0 && <div className="mt-2 text-xs font-medium text-sky-700 dark:text-sky-300">Select this card to open the target X-ray below.</div>}
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
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onOpenScore?.() }}
          disabled={running || !item.lastRun || !onOpenScore}
          className={`mt-3 w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${running
          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300'
          : 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:cursor-default disabled:hover:bg-violet-50 dark:border-violet-900/40 dark:bg-violet-950/20 dark:text-violet-300 dark:hover:bg-violet-950/35'
        }`}
          aria-label={item.lastRun ? `Open score review for ${item.name}` : undefined}
        >
          {running
            ? 'Running eval…'
            : item.lastRun
              ? `Score ${item.lastRun.score}/100 · Review results`
              : `Not run · ${usageSummary}`}
        </button>
      )}
      {isEvalRecord(item) && evalReadiness && !evalReadiness.ready && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onOpen() }}
          className="mt-3 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200"
        >
          Needs setup: {evalReadiness.issues[0]}{evalReadiness.issues.length > 1 ? ` +${evalReadiness.issues.length - 1} more` : ''}
        </button>
      )}
      <div className="mt-3 flex items-center gap-2">
        {isEvalRecord(item) && (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onRun?.() }}
            disabled={!onRun || running}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-gray-300 dark:hover:bg-emerald-950/30 dark:disabled:text-gray-600"
            title={evalReadiness?.ready ? 'Run Eval' : evalReadiness?.issues.join('; ')}
            aria-label={evalReadiness?.ready ? 'Run Eval' : `Eval is not ready: ${evalReadiness?.issues.join('; ')}`}
          >
            <ProductIconCell iconName={running ? 'refresh' : 'play'} label={running ? 'Running Eval' : 'Run Eval'} size="sm" className="border-transparent bg-transparent text-current" />
          </button>
        )}
        {canGenerateDocs && onReport && (
          <button type="button" onClick={(event) => { event.stopPropagation(); onReport() }} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30" title={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'} aria-label={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'}>
            <ProductIconCell iconName="docs" label={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'} size="sm" className="border-transparent bg-transparent text-current" />
          </button>
        )}
        {canNotify && onNotify && (
          <button type="button" onClick={(event) => { event.stopPropagation(); onNotify() }} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30" title="Send status notification" aria-label="Send status notification">
            <ProductIconCell iconName="notification" label="Send status notification" size="sm" className="border-transparent bg-transparent text-current" />
          </button>
        )}
        <button type="button" onClick={(event) => { event.stopPropagation(); onToggle() }} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" title={item.enabled ? 'Disable' : 'Enable'} aria-label={item.enabled ? 'Disable' : 'Enable'}>
          <ProductIconCell iconName={item.enabled ? 'pause' : 'restart'} label={item.enabled ? 'Disable' : 'Enable'} size="sm" className="border-transparent bg-transparent text-current" />
        </button>
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
  onOpenScore,
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
  onOpenScore: (() => void) | null
  canGenerateDocs: boolean
  canNotify: boolean
}) {
  const archived = item.archived === true
  const files = item.document?.path ? [item.document.path] : []
  const usageTotals = getPluginUsageTotals(item)
  const detailLines = getPluginDetailLines(plugin, item)
  const evalReadiness = isEvalRecord(item) ? getEvalReadiness(item) : null

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
            aria-label="Send status notification"
            title="Send status notification"
          >
            <ProductIconCell iconName="notification" label="Send status notification" size="sm" className="border-transparent bg-transparent text-current" />
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
            aria-label={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'}
            title={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'}
          >
            <ProductIconCell iconName="docs" label={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'} size="sm" className="border-transparent bg-transparent text-current" />
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
          {isEvalRecord(item) && !onRun && (
            <button
              type="button"
              disabled
              className="h-9 w-9 inline-flex cursor-not-allowed items-center justify-center rounded-full text-gray-300 dark:text-gray-600"
              aria-label={`Eval is not ready: ${evalReadiness?.issues.join('; ')}`}
              title={evalReadiness?.issues.join('; ')}
            >
              <ProductIconCell iconName="play" label="Eval is not ready" size="sm" className="border-transparent bg-transparent text-current" />
            </button>
          )}
          <button
            onClick={onToggle}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={item.enabled ? 'Disable' : 'Enable'}
            title={item.enabled ? 'Disable' : 'Enable'}
          >
            <ProductIconCell iconName={item.enabled ? 'pause' : 'restart'} label={item.enabled ? 'Disable' : 'Enable'} size="sm" className="border-transparent bg-transparent text-current" />
          </button>
          {isEvalRecord(item) && item.lastRun && onOpenScore && (
            <button
              onClick={onOpenScore}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full text-violet-500 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
              aria-label="Open score review"
              title="Open score review"
            >
              <ProductIconCell iconName="details" label="Open score review" size="sm" className="border-transparent bg-transparent text-current" />
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
        {evalReadiness && !evalReadiness.ready && (
          <button type="button" onClick={onEdit} className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            <span className="font-medium">Needs setup before it can run.</span>
            <span className="mt-1 block text-xs">{evalReadiness.issues.join('; ')}. Open Edit to complete the configuration.</span>
          </button>
        )}
        {isEvalRecord(item) && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Recorded model usage
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Measured spend: ${usageTotals.costUsd.toFixed(4)}
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
          <button
            type="button"
            onClick={onOpenScore || undefined}
            disabled={!onOpenScore}
            className="w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 text-left transition-colors hover:border-violet-300 hover:bg-violet-100 disabled:cursor-default disabled:hover:border-violet-200 disabled:hover:bg-violet-50 dark:border-violet-900/40 dark:bg-violet-900/10 dark:hover:border-violet-700 dark:hover:bg-violet-900/20"
            aria-label={`Open score review for ${item.name}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-violet-800 dark:text-violet-300">Latest score</div>
              <div className="flex items-center gap-2">
                <div className="text-lg font-semibold text-violet-700 dark:text-violet-200">{item.lastRun.score}/100</div>
                <span className="text-xs font-medium text-violet-700 dark:text-violet-300">Review</span>
              </div>
            </div>
            <p className="mt-1 text-sm text-violet-700/80 dark:text-violet-300/80">{item.lastRun.summary}</p>
          </button>
        )}
      </div>
      </aside>
    </div>
  )
}

function EvalScoreReviewDialog({
  item,
  onClose,
  onEdit,
  onRun,
}: {
  item: Extract<PluginRecord, { kind: 'eval' }>
  onClose: () => void
  onEdit: () => void
  onRun: (() => void) | null
}) {
  const run = item.lastRun
  if (!run) return null
  const cases = item.experiment.cases || []
  const completed = run.casesCompleted ?? Math.min(cases.length || 1, run.totalCases || cases.length || 1)
  const total = run.totalCases ?? cases.length
  const recommendations = run.score < 80
    ? [
        item.experiment.judge === 'ai'
          ? 'Strengthen the AI judge guidance with a concrete rubric, required evidence, and examples of acceptable output.'
          : item.experiment.judge === 'fixed'
            ? 'Review the comparison rule and expected outputs to ensure the Eval measures the intended acceptance criteria.'
            : 'Give the reviewer a concise rubric and evidence requirements before collecting the next review.',
        'Add representative cases that cover a clear success path, an edge case, and a known failure mode before relying on this score.',
        'Review the target agent or workflow instruction when failures are consistent across cases; improve its task boundaries before changing models.',
      ]
    : [
        'Run this Eval against a broader mix of representative cases before relying on the score for a production change.',
        'Keep the current judge guidance and add an edge case whenever the target agent or workflow changes materially.',
      ]

  return (
    <MobileSafeDialog
      ariaLabelledBy="eval-score-review-title"
      onClose={onClose}
      panelClassName="max-w-2xl"
      header={(
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="eval-score-review-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">Eval score review</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{item.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Close score review">✕</button>
        </div>
      )}
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}>Close</button>
          <button type="button" onClick={onEdit} className={headerSecondaryButtonClass}>Edit Eval</button>
          {onRun && <button type="button" onClick={onRun} className={headerPrimaryButtonClass}>Run again</button>}
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-4 dark:border-violet-900/40 dark:bg-violet-950/20">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Latest aggregate score</div>
              <div className="mt-1 text-4xl font-semibold tabular-nums text-violet-800 dark:text-violet-100">{run.score}<span className="text-lg font-medium">/100</span></div>
            </div>
            <div className="text-sm text-violet-800 dark:text-violet-200">{completed}/{total || Math.max(cases.length, 1)} cases completed</div>
          </div>
          <p className="mt-3 text-sm text-violet-800/85 dark:text-violet-200/85">{run.summary}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-700"><div className="text-xs uppercase tracking-wide text-gray-400">Evaluator</div><div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{getEvalJudge(item).label}</div></div>
          <div className="rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-700"><div className="text-xs uppercase tracking-wide text-gray-400">Tokens</div><div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{((run.tokensIn || 0) + (run.tokensOut || 0)).toLocaleString()}</div></div>
          <div className="rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-700"><div className="text-xs uppercase tracking-wide text-gray-400">Run cost</div><div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">${(run.costUsd || 0).toFixed(4)}</div></div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Experiment cases</h3>
          {cases.length > 0 ? <div className="mt-2 space-y-2">
            {cases.map((entry, index) => <div key={entry.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"><span className="font-medium text-gray-900 dark:text-gray-100">{entry.name || `Case ${index + 1}`}</span><span className="ml-2 text-xs text-gray-500 dark:text-gray-400">Input and expected output configured</span></div>)}
          </div> : <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">This Eval has no saved individual cases yet.</p>}
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">This runtime stores the aggregate score and completion count. Per-case scores will appear here when the evaluator runtime records them.</p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Improve the next run</h3>
          <ul className="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            {recommendations.map((recommendation) => <li key={recommendation} className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 dark:border-sky-900/40 dark:bg-sky-950/20">{recommendation}</li>)}
          </ul>
        </div>
      </div>
    </MobileSafeDialog>
  )
}

function TemplateCard({
  plugin,
  template,
  onApply,
  applying = false,
  inUse = false,
  detailed = false,
  compact = false,
}: {
  plugin: PluginManifest
  template: PluginRecordTemplate
  onApply: () => void
  applying?: boolean
  inUse?: boolean
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
          <button
            onClick={onApply}
            disabled={applying || inUse}
            className={`${headerPrimaryButtonClass} flex-1 justify-center disabled:cursor-default disabled:opacity-60 sm:flex-none`}
          >
            {applying ? 'Adding...' : inUse ? 'In use' : 'Use'}
          </button>
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
      experiment: base.experiment || {
        input: '',
        candidateOutput: '',
        expectedOutput: '',
        judge: 'fixed',
        iterations: 1,
        judgeGuidance: '',
        fixedMatch: 'exact',
        fixedCaseSensitive: false,
        cases: [],
      },
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

function truncateGraphLabel(value: string, maximum = 28): string {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value
}

function formatLifecycleGap(milliseconds: number): string {
  const days = Math.max(1, Math.round(milliseconds / (24 * 60 * 60 * 1000)))
  if (days >= 365) return `${Math.round(days / 365)}y gap`
  if (days >= 60) return `${Math.round(days / 30)}mo gap`
  return `${days}d gap`
}

function RelationshipZoomControls({
  zoom,
  onChange,
}: {
  zoom: number
  onChange: (zoom: number) => void
}) {
  const update = (next: number) => onChange(Math.max(0.5, Math.min(2, next)))
  return (
    <div className="flex shrink-0 items-center gap-1" aria-label="Relationship graph zoom controls">
      <button
        type="button"
        onClick={() => update(zoom - 0.25)}
        disabled={zoom <= 0.5}
        title="Zoom out"
        aria-label="Zoom out"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-lg text-gray-600 hover:border-sky-300 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
      >
        −
      </button>
      <span className="w-12 text-center text-xs tabular-nums text-gray-500 dark:text-gray-400">{Math.round(zoom * 100)}%</span>
      <button
        type="button"
        onClick={() => update(zoom + 0.25)}
        disabled={zoom >= 2}
        title="Zoom in"
        aria-label="Zoom in"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-lg text-gray-600 hover:border-sky-300 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
      >
        +
      </button>
      {zoom !== 1 && (
        <button type="button" onClick={() => onChange(1)} className="px-1 text-xs font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400">
          Reset
        </button>
      )}
    </div>
  )
}

function getGuardrailProtections(item: PluginRecord): string[] {
  if (!isGuardrailRecord(item)) return []
  const protections: string[] = []
  if (item.controls.blockEmail) protections.push('Outbound email')
  if (item.controls.blockWeb) protections.push('Public web')
  if (item.controls.blockExternalDocs) protections.push('External documents')
  if (item.controls.allowedSkills.length > 0) protections.push('Approved skills')
  return protections.length > 0 ? protections : ['Review required']
}

function GuardrailRelationshipGraph({
  items,
  suggestionTemplates,
  context,
  onOpen,
  selectedId,
}: {
  items: PluginRecord[]
  suggestionTemplates?: PluginRecordTemplate[]
  context: PluginWorkspaceContext
  onOpen: (id: string) => void
  selectedId?: string | null
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const guardrails = suggestionTemplates
    ? suggestionTemplates.map(templateToPreviewRecord).filter(isGuardrailRecord)
    : items.filter(isGuardrailRecord)
  const showingSuggestions = suggestionTemplates !== undefined
  const emphasizedId = hoveredId || selectedId
  const emphasizedGuardrail = emphasizedId ? guardrails.find((item) => item.id === emphasizedId) || null : null
  const emphasizedProtections = new Set(emphasizedGuardrail ? getGuardrailProtections(emphasizedGuardrail) : [])
  const resolveTarget = (kind: string, id: string) => {
    if (kind === 'agent') return context.agents.find((entry) => entry.id === id)?.name || id
    if (kind === 'workflow') return context.workflows.find((entry) => entry.id === id)?.name || id
    return id
  }
  const targetsFor = (item: typeof guardrails[number]) => {
    const assigned = [
      ...item.appliesTo.agents.map((id) => ({ kind: 'agent', id, pending: false })),
      ...item.appliesTo.workflows.map((id) => ({ kind: 'workflow', id, pending: false })),
      ...item.appliesTo.groups.map((id) => ({ kind: 'group', id, pending: false })),
      ...item.appliesTo.communities.map((id) => ({ kind: 'community', id, pending: false })),
    ]
    if (assigned.length > 0) return assigned
    const supportsAgents = item.tags.includes('agent')
    const supportsWorkflows = item.tags.includes('workflow')
    if (supportsAgents && !supportsWorkflows) return [{ kind: 'agent', id: 'Select agent', pending: true }]
    if (supportsWorkflows && !supportsAgents) return [{ kind: 'workflow', id: 'Select workflow', pending: true }]
    return [
      { kind: 'agent', id: 'Select agent', pending: true },
      { kind: 'workflow', id: 'Select workflow', pending: true },
    ]
  }
  const protectionLabels = Array.from(new Set(guardrails.flatMap(getGuardrailProtections))).sort()
  const targetEntries = Array.from(new Map(guardrails.flatMap((item) => (
    targetsFor(item).map((target) => [`${target.kind}:${target.id}`, target] as const)
  ))).values())
  const emphasizedTargetKeys = new Set(emphasizedGuardrail
    ? targetsFor(emphasizedGuardrail).map((target) => `${target.kind}:${target.id}`)
    : [])
  const canvasHeight = Math.max(420, guardrails.length * 72 + 80, protectionLabels.length * 62 + 80, targetEntries.length * 62 + 80)
  const distribute = (count: number) => count <= 1
    ? [canvasHeight / 2]
    : Array.from({ length: count }, (_, index) => 54 + (index * (canvasHeight - 108)) / (count - 1))
  const protectionY = new Map(protectionLabels.map((label, index) => [label, distribute(protectionLabels.length)[index]]))
  const guardrailY = new Map(guardrails.map((item, index) => [item.id, distribute(guardrails.length)[index]]))
  const targetY = new Map(targetEntries.map((target, index) => [`${target.kind}:${target.id}`, distribute(targetEntries.length)[index]]))
  const centerWidth = 250
  const sideWidth = 190

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Guardrail relationships</h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {showingSuggestions
              ? `${guardrails.length} suggested Guardrails preview advisory policy intent. Hover to inspect one before assigning agents or workflows.`
              : 'Advisory policy intent connects to Guardrails and their referenced agents or workflows. Hover to preview; click for full details.'}
          </p>
          </div>
          <RelationshipZoomControls zoom={zoom} onChange={setZoom} />
        </div>
        <div className="mt-2 flex min-h-5 flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />Protects</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />Guardrail</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Applies to</span>
        </div>
      </div>
      <div className="max-w-full overflow-x-auto">
        {guardrails.length === 0 ? (
          <div className="flex min-h-52 items-center justify-center px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No Guardrails match the current search and filters.
          </div>
        ) : (
          <svg
            role="img"
            aria-label="Guardrail relationship graph"
            width={`${zoom * 100}%`}
            height={canvasHeight * zoom}
            viewBox={`0 0 1000 ${canvasHeight}`}
            preserveAspectRatio="xMidYMid meet"
            className="block"
            style={{ minWidth: `${Math.round(760 * zoom)}px` }}
          >
            <title>Advisory Guardrail policy intent connected to referenced agents and workflows</title>
            {guardrails.flatMap((item) => {
              const y = guardrailY.get(item.id) || canvasHeight / 2
              const isEmphasized = emphasizedGuardrail?.id === item.id
              const isMuted = Boolean(emphasizedGuardrail) && !isEmphasized
              return [
                ...getGuardrailProtections(item).map((label) => (
                  <path
                    key={`${item.id}:protection:${label}`}
                    d={`M ${40 + sideWidth} ${protectionY.get(label) || y} C 300 ${protectionY.get(label) || y}, 300 ${y}, 375 ${y}`}
                    fill="none"
                    className={`${isMuted ? 'opacity-10' : ''} stroke-amber-300 transition-opacity dark:stroke-amber-700`}
                    strokeWidth={isEmphasized ? 4 : 2}
                  />
                )),
                ...targetsFor(item).map((target) => {
                  const key = `${target.kind}:${target.id}`
                  return (
                    <path
                      key={`${item.id}:target:${key}`}
                      d={`M ${375 + centerWidth} ${y} C 700 ${y}, 700 ${targetY.get(key) || y}, 770 ${targetY.get(key) || y}`}
                      fill="none"
                      className={`${isMuted ? 'opacity-10' : ''} stroke-emerald-300 transition-opacity dark:stroke-emerald-800`}
                      strokeWidth={isEmphasized ? 4 : 2}
                    />
                  )
                }),
              ]
            })}
            {protectionLabels.map((label) => {
              const isEmphasized = emphasizedProtections.has(label)
              return (
                <g
                  key={label}
                  transform={`translate(40 ${Number(protectionY.get(label)) - 21})`}
                  className={`${emphasizedGuardrail && !isEmphasized ? 'opacity-20' : ''} transition-opacity`}
                >
                  <rect
                    width={sideWidth}
                    height="42"
                    rx="6"
                    className={isEmphasized
                      ? 'fill-amber-100 stroke-amber-500 dark:fill-amber-900/80 dark:stroke-amber-400'
                      : 'fill-amber-50 stroke-amber-300 dark:fill-amber-950/60 dark:stroke-amber-700'}
                    strokeWidth={isEmphasized ? 3 : 1}
                  />
                  <text x={sideWidth / 2} y="26" textAnchor="middle" className="fill-amber-800 text-[13px] font-semibold dark:fill-amber-200">{truncateGraphLabel(label)}</text>
                </g>
              )
            })}
            {guardrails.map((item) => {
              const y = Number(guardrailY.get(item.id)) - 25
              const isEmphasized = emphasizedGuardrail?.id === item.id
              return (
                <g
                  key={item.id}
                  transform={`translate(375 ${y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${item.name}`}
                  aria-pressed={selectedId === item.id}
                  className={`${emphasizedGuardrail && !isEmphasized ? 'opacity-25' : ''} cursor-pointer outline-none transition-opacity`}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(item.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={() => onOpen(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onOpen(item.id)
                  }}
                >
                  <rect
                    width={centerWidth}
                    height="50"
                    rx="6"
                    className={!item.enabled && !item.id.startsWith('suggested:')
                      ? 'fill-gray-100 stroke-gray-400 dark:fill-gray-800 dark:stroke-gray-600'
                      : isEmphasized
                        ? 'fill-sky-100 stroke-sky-600 dark:fill-sky-900 dark:stroke-sky-300'
                        : 'fill-sky-50 stroke-sky-400 hover:fill-sky-100 dark:fill-sky-950/70 dark:stroke-sky-700 dark:hover:fill-sky-900'}
                    strokeWidth={isEmphasized ? 4 : 2}
                  />
                  <text x={centerWidth / 2} y="22" textAnchor="middle" className="fill-sky-900 text-[13px] font-semibold dark:fill-sky-100">{truncateGraphLabel(item.name)}</text>
                  <text x={centerWidth / 2} y="38" textAnchor="middle" className="fill-sky-600 text-[11px] dark:fill-sky-300">
                    {item.id.startsWith('suggested:') ? 'Suggested Guardrail' : item.enabled ? 'Enabled Guardrail' : 'Disabled Guardrail'}
                  </text>
                </g>
              )
            })}
            {targetEntries.map((target) => {
              const key = `${target.kind}:${target.id}`
              const isEmphasized = emphasizedTargetKeys.has(key)
              const label = target.pending ? target.id : resolveTarget(target.kind, target.id)
              return (
                <g
                  key={key}
                  transform={`translate(770 ${Number(targetY.get(key)) - 21})`}
                  className={`${emphasizedGuardrail && !isEmphasized ? 'opacity-20' : ''} transition-opacity`}
                >
                  <rect
                    width={sideWidth}
                    height="42"
                    rx="6"
                    className={isEmphasized
                      ? target.pending
                        ? 'fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950/70 dark:stroke-emerald-400'
                        : 'fill-emerald-100 stroke-emerald-500 dark:fill-emerald-900/80 dark:stroke-emerald-400'
                      : target.pending
                        ? 'fill-gray-50 stroke-gray-300 dark:fill-gray-800 dark:stroke-gray-600'
                        : 'fill-emerald-50 stroke-emerald-300 dark:fill-emerald-950/60 dark:stroke-emerald-700'}
                    strokeWidth={isEmphasized ? 3 : 1}
                    strokeDasharray={target.pending ? '5 4' : undefined}
                  />
                  <text x={sideWidth / 2} y="18" textAnchor="middle" className="fill-gray-500 text-[10px] font-semibold uppercase dark:fill-gray-400">{target.kind}</text>
                  <text x={sideWidth / 2} y="32" textAnchor="middle" className="fill-emerald-800 text-[12px] font-medium dark:fill-emerald-200">{truncateGraphLabel(label, 25)}</text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}

function EvalRelationshipGraph({
  items,
  suggestionTemplates,
  context,
  onOpen,
  onRun,
  onOpenScore,
  onAssignTarget,
  onToggle,
  runningItemIds,
  runningCaseProgress,
  selectedId,
}: {
  items: PluginRecord[]
  suggestionTemplates?: PluginRecordTemplate[]
  context: PluginWorkspaceContext
  onOpen: (id: string) => void
  onRun?: (id: string) => void
  onOpenScore?: (id: string) => void
  onAssignTarget?: (id: string) => void
  onToggle?: (id: string) => void
  runningItemIds?: Set<string>
  runningCaseProgress?: Map<string, { completed: number; total: number }>
  selectedId?: string | null
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const evals = suggestionTemplates
    ? suggestionTemplates.map(templateToPreviewRecord).filter(isEvalRecord)
    : items.filter(isEvalRecord)
  const showingSuggestions = suggestionTemplates !== undefined
  const emphasizedId = hoveredId || selectedId
  const emphasizedEval = emphasizedId ? evals.find((item) => item.id === emphasizedId) || null : null
  const emphasizedAttributes = new Set(emphasizedEval ? getEvalAttributes(emphasizedEval) : [])
  const emphasizedJudgeId = emphasizedEval ? getEvalJudge(emphasizedEval).id : null
  const resolveTarget = (kind: string, id: string) => {
    if (kind === 'agent') return context.agents.find((entry) => entry.id === id)?.name || id
    if (kind === 'workflow') return context.workflows.find((entry) => entry.id === id)?.name || id
    return id
  }
  const targetsFor = (item: typeof evals[number]) => item.target.ids.length > 0
    ? item.target.ids.map((id) => ({ kind: item.target.type, id, label: id, pending: false }))
    : [{ kind: item.target.type, id: item.id, label: `Select ${item.target.type}`, pending: true }]
  const attributeLabels = Array.from(new Set(evals.flatMap(getEvalAttributes))).sort()
  const judgeEntries = Array.from(new Map(evals.map((item) => {
    const judge = getEvalJudge(item)
    return [judge.id, judge] as const
  })).values())
  const targetEntries = Array.from(new Map(evals.flatMap((item) => (
    targetsFor(item).map((target) => [`${target.kind}:${target.id}`, target] as const)
  ))).values())
  const emphasizedTargetKeys = new Set(emphasizedEval
    ? targetsFor(emphasizedEval).map((target) => `${target.kind}:${target.id}`)
    : [])
  const canvasHeight = Math.max(
    440,
    evals.length * 76 + 80,
    attributeLabels.length * 62 + 80,
    judgeEntries.length * 62 + 80,
    targetEntries.length * 62 + 80,
  )
  const distribute = (count: number) => count <= 1
    ? [canvasHeight / 2]
    : Array.from({ length: count }, (_, index) => 54 + (index * (canvasHeight - 108)) / (count - 1))
  const attributeY = new Map(attributeLabels.map((label, index) => [label, distribute(attributeLabels.length)[index]]))
  const evalY = new Map(evals.map((item, index) => [item.id, distribute(evals.length)[index]]))
  const judgeY = new Map(judgeEntries.map((judge, index) => [judge.id, distribute(judgeEntries.length)[index]]))
  const targetY = new Map(targetEntries.map((target, index) => [`${target.kind}:${target.id}`, distribute(targetEntries.length)[index]]))

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-start justify-between gap-3">
          <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Eval relationships</h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {showingSuggestions
              ? `${evals.length} suggested Evals preview their attributes, trial set, evaluator, and unassigned target. Hover to inspect one.`
              : 'Attributes connect through each repeatable Eval to its evaluator and assigned agent or workflow. Hover to preview; click for full details.'}
          </p>
          </div>
          <RelationshipZoomControls zoom={zoom} onChange={setZoom} />
        </div>
        <div className="mt-2 flex min-h-5 flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500" />Measures</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />Experiment</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />Evaluated by</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Applies to</span>
        </div>
      </div>
      <div className="max-w-full overflow-x-auto">
        {evals.length === 0 ? (
          <div className="flex min-h-52 items-center justify-center px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No Evals match the current search and filters.
          </div>
        ) : (
          <svg
            role="img"
            aria-label="Eval relationship graph"
            width={`${zoom * 100}%`}
            height={canvasHeight * zoom}
            viewBox={`0 0 1120 ${canvasHeight}`}
            preserveAspectRatio="xMidYMid meet"
            className="block"
            style={{ minWidth: `${Math.round(900 * zoom)}px` }}
          >
            <title>Evaluation attributes connected to experiments, evaluators, and assigned targets</title>
            {evals.flatMap((item) => {
              const y = evalY.get(item.id) || canvasHeight / 2
              const judge = getEvalJudge(item)
              const isEmphasized = emphasizedEval?.id === item.id
              const isMuted = Boolean(emphasizedEval) && !isEmphasized
              return [
                ...getEvalAttributes(item).map((label) => (
                  <path
                    key={`${item.id}:attribute:${label}`}
                    d={`M 190 ${attributeY.get(label) || y} C 245 ${attributeY.get(label) || y}, 245 ${y}, 300 ${y}`}
                    fill="none"
                    className={`${isMuted ? 'opacity-10' : ''} stroke-violet-300 transition-opacity dark:stroke-violet-700`}
                    strokeWidth={isEmphasized ? 4 : 2}
                  />
                )),
                <path
                  key={`${item.id}:judge:${judge.id}`}
                  d={`M 540 ${y} C 585 ${y}, 585 ${judgeY.get(judge.id) || y}, 625 ${judgeY.get(judge.id) || y}`}
                  fill="none"
                  className={`${isMuted ? 'opacity-10' : ''} stroke-amber-300 transition-opacity dark:stroke-amber-700`}
                  strokeWidth={isEmphasized ? 4 : 2}
                />,
                ...targetsFor(item).map((target) => {
                  const key = `${target.kind}:${target.id}`
                  return (
                    <path
                      key={`${item.id}:target:${key}`}
                      d={`M 805 ${judgeY.get(judge.id) || y} C 850 ${judgeY.get(judge.id) || y}, 850 ${targetY.get(key) || y}, 900 ${targetY.get(key) || y}`}
                      fill="none"
                      className={`${isMuted ? 'opacity-10' : ''} stroke-emerald-300 transition-opacity dark:stroke-emerald-800`}
                      strokeWidth={isEmphasized ? 4 : 2}
                    />
                  )
                }),
              ]
            })}
            {attributeLabels.map((label) => {
              const isEmphasized = emphasizedAttributes.has(label)
              return (
                <g
                  key={label}
                  transform={`translate(25 ${Number(attributeY.get(label)) - 21})`}
                  className={`${emphasizedEval && !isEmphasized ? 'opacity-20' : ''} transition-opacity`}
                >
                  <rect
                    width="165"
                    height="42"
                    rx="6"
                    className={isEmphasized
                      ? 'fill-violet-100 stroke-violet-500 dark:fill-violet-900/80 dark:stroke-violet-400'
                      : 'fill-violet-50 stroke-violet-300 dark:fill-violet-950/60 dark:stroke-violet-700'}
                    strokeWidth={isEmphasized ? 3 : 1}
                  />
                  <text x="82.5" y="26" textAnchor="middle" className="fill-violet-800 text-[13px] font-semibold dark:fill-violet-200">{truncateGraphLabel(label, 22)}</text>
                </g>
              )
            })}
            {evals.map((item) => {
              const y = Number(evalY.get(item.id)) - 34
              const isEmphasized = emphasizedEval?.id === item.id
              const trials = getEvalTrialCount(item)
              const running = runningItemIds?.has(item.id) === true
              const readiness = getEvalReadiness(item)
              const progress = runningCaseProgress?.get(item.id)
              const progressTotal = progress?.total || Math.max(1, item.experiment.cases?.length || trials)
              const progressCompleted = Math.min(progressTotal, progress?.completed || 0)
              const progressWidth = running ? Math.max(6, (progressCompleted / progressTotal) * 202) : 0
              return (
                <g
                  key={item.id}
                  transform={`translate(300 ${y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${item.name}`}
                  aria-pressed={selectedId === item.id}
                  className={`${emphasizedEval && !isEmphasized ? 'opacity-25' : ''} cursor-pointer outline-none transition-opacity`}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(item.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={() => onOpen(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onOpen(item.id)
                  }}
                >
                  <rect
                    width="240"
                    height="68"
                    rx="6"
                    className={!item.enabled && !item.id.startsWith('suggested:')
                      ? 'fill-gray-100 stroke-gray-400 dark:fill-gray-800 dark:stroke-gray-600'
                      : isEmphasized
                        ? 'fill-sky-100 stroke-sky-600 dark:fill-sky-900 dark:stroke-sky-300'
                        : 'fill-sky-50 stroke-sky-400 hover:fill-sky-100 dark:fill-sky-950/70 dark:stroke-sky-700 dark:hover:fill-sky-900'}
                    strokeWidth={isEmphasized ? 4 : 2}
                  />
                  <text x="120" y="20" textAnchor="middle" className="fill-sky-900 text-[13px] font-semibold dark:fill-sky-100">{truncateGraphLabel(item.name, 24)}</text>
                  <text x="120" y="37" textAnchor="middle" className="fill-sky-600 text-[11px] dark:fill-sky-300">
                    {item.id.startsWith('suggested:')
                      ? `${trials} planned trial${trials === 1 ? '' : 's'}`
                      : running
                        ? `Running ${progressCompleted}/${progressTotal} cases`
                        : !readiness.ready
                          ? `Needs setup · ${readiness.issues.length} item${readiness.issues.length === 1 ? '' : 's'}`
                        : item.lastRun?.totalCases
                          ? `${item.enabled ? 'Enabled' : 'Disabled'} · ${item.lastRun.casesCompleted || 0}/${item.lastRun.totalCases} cases`
                          : `${item.enabled ? 'Enabled' : 'Disabled'} · not run`}
                  </text>
                  {running ? (
                    <>
                      <rect x="19" y="49" width="202" height="7" rx="3.5" className="fill-sky-200 dark:fill-sky-950" />
                      <rect x="19" y="49" width={progressWidth} height="7" rx="3.5" className="fill-emerald-500" />
                    </>
                  ) : !showingSuggestions && readiness.ready && onRun ? (
                    <g
                      role="button"
                      aria-label={`Run ${item.name}`}
                      className="cursor-pointer"
                      onClick={(event) => {
                        event.stopPropagation()
                        onRun(item.id)
                      }}
                    >
                      <circle cx="120" cy="54" r="10" className="fill-emerald-500 hover:fill-emerald-600" />
                      <path d="M 117 49 L 117 59 L 124 54 Z" className="fill-white" />
                    </g>
                  ) : !showingSuggestions ? (
                    <g aria-label={`Eval is not ready: ${readiness.issues.join('; ')}`}>
                      <circle cx="120" cy="54" r="10" className="fill-gray-200 dark:fill-gray-700" />
                      <path d="M 117 49 L 117 59 L 124 54 Z" className="fill-gray-400 dark:fill-gray-500" />
                    </g>
                  ) : null}
                  {!showingSuggestions && !running && item.lastRun && onOpenScore && (
                    <g
                      role="button"
                      aria-label={`Open ${item.name} score review`}
                      className="cursor-pointer"
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpenScore(item.id)
                      }}
                    >
                      <rect x="150" y="46" width="74" height="18" rx="5" className="fill-violet-100 stroke-violet-400 hover:fill-violet-200 dark:fill-violet-900/70 dark:stroke-violet-500" />
                      <text x="187" y="59" textAnchor="middle" className="fill-violet-800 text-[10px] font-semibold dark:fill-violet-100">Score {item.lastRun.score}</text>
                    </g>
                  )}
                  {!showingSuggestions && onToggle && (
                    <g
                      role="button"
                      aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`}
                      className="cursor-pointer"
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggle(item.id)
                      }}
                    >
                      <circle cx="18" cy="54" r="10" className="fill-gray-200 hover:fill-gray-300 dark:fill-gray-700 dark:hover:fill-gray-600" />
                      {item.enabled
                        ? <><path d="M 15 50 V 58" className="stroke-gray-700 dark:stroke-gray-100" strokeWidth="2" /><path d="M 21 50 V 58" className="stroke-gray-700 dark:stroke-gray-100" strokeWidth="2" /></>
                        : <path d="M 15 49 L 15 59 L 22 54 Z" className="fill-gray-700 dark:fill-gray-100" />}
                    </g>
                  )}
                </g>
              )
            })}
            {judgeEntries.map((judge) => {
              const isEmphasized = emphasizedJudgeId === judge.id
              return (
                <g
                  key={judge.id}
                  transform={`translate(625 ${Number(judgeY.get(judge.id)) - 21})`}
                  className={`${emphasizedEval && !isEmphasized ? 'opacity-20' : ''} transition-opacity`}
                >
                  <rect
                    width="180"
                    height="42"
                    rx="6"
                    className={isEmphasized
                      ? 'fill-amber-100 stroke-amber-500 dark:fill-amber-900/80 dark:stroke-amber-400'
                      : 'fill-amber-50 stroke-amber-300 dark:fill-amber-950/60 dark:stroke-amber-700'}
                    strokeWidth={isEmphasized ? 3 : 1}
                  />
                  <text x="90" y="17" textAnchor="middle" className="fill-gray-500 text-[10px] font-semibold uppercase dark:fill-gray-400">evaluated by</text>
                  <text x="90" y="32" textAnchor="middle" className="fill-amber-800 text-[12px] font-medium dark:fill-amber-200">{judge.label}</text>
                </g>
              )
            })}
            {targetEntries.map((target) => {
              const key = `${target.kind}:${target.id}`
              const isEmphasized = emphasizedTargetKeys.has(key)
              const label = target.pending ? target.label : resolveTarget(target.kind, target.id)
              return (
                <g
                  key={key}
                  transform={`translate(900 ${Number(targetY.get(key)) - 21})`}
                  role={target.pending && !showingSuggestions && onAssignTarget ? 'button' : undefined}
                  tabIndex={target.pending && !showingSuggestions && onAssignTarget ? 0 : undefined}
                  aria-label={target.pending ? `${target.label} for this Eval` : undefined}
                  className={`${emphasizedEval && !isEmphasized ? 'opacity-20' : ''} ${target.pending && !showingSuggestions && onAssignTarget ? 'cursor-pointer' : ''} transition-opacity`}
                  onClick={target.pending && !showingSuggestions && onAssignTarget ? (() => onAssignTarget(target.id)) : undefined}
                  onKeyDown={target.pending && !showingSuggestions && onAssignTarget ? ((event) => {
                    if (event.key === 'Enter' || event.key === ' ') onAssignTarget(target.id)
                  }) : undefined}
                >
                  <rect
                    width="190"
                    height="42"
                    rx="6"
                    className={isEmphasized
                      ? target.pending
                        ? 'fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950/70 dark:stroke-emerald-400'
                        : 'fill-emerald-100 stroke-emerald-500 dark:fill-emerald-900/80 dark:stroke-emerald-400'
                      : target.pending
                        ? 'fill-gray-50 stroke-gray-300 dark:fill-gray-800 dark:stroke-gray-600'
                        : 'fill-emerald-50 stroke-emerald-300 dark:fill-emerald-950/60 dark:stroke-emerald-700'}
                    strokeWidth={isEmphasized ? 3 : 1}
                    strokeDasharray={target.pending ? '5 4' : undefined}
                  />
                  <text x="95" y="18" textAnchor="middle" className="fill-gray-500 text-[10px] font-semibold uppercase dark:fill-gray-400">{target.kind}</text>
                  <text x="95" y="32" textAnchor="middle" className="fill-emerald-800 text-[12px] font-medium dark:fill-emerald-200">{truncateGraphLabel(label, 25)}</text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}

function OptimizeRelationshipGraph({
  items,
  suggestionTemplates,
  context,
  onOpen,
  selectedId,
}: {
  items: PluginRecord[]
  suggestionTemplates?: PluginRecordTemplate[]
  context: PluginWorkspaceContext
  onOpen: (id: string) => void
  selectedId?: string | null
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const resolveTarget = (kind: string, id: string) => {
    if (kind === 'agent') return context.agents.find((entry) => entry.id === id)?.name || id
    if (kind === 'workflow') return context.workflows.find((entry) => entry.id === id)?.name || id
    return id === 'workspace' ? 'Current workspace' : id
  }
  const plans: GenericPluginRecord[] = suggestionTemplates
    ? suggestionTemplates.map((template) => ({
        id: `suggested:${template.id}`,
        kind: 'optimization-plan',
        name: template.payload.name || template.name,
        description: template.payload.description || template.description,
        tags: template.payload.tags || template.tags,
        enabled: template.payload.enabled !== false,
        createdAt: '',
        updatedAt: '',
        fields: 'fields' in template.payload ? template.payload.fields || {} : {},
      }))
    : items.filter(isGenericPluginRecord)
  const showingSuggestions = suggestionTemplates !== undefined
  const emphasizedId = hoveredId || selectedId
  const selectedPlan = emphasizedId ? plans.find((item) => item.id === emphasizedId) || null : null
  const selectedDimensions = new Set(selectedPlan ? getOptimizationDimensions(selectedPlan) : [])
  const selectedScope = selectedPlan?.fields.scope === 'agent'
    ? 'agent'
    : selectedPlan?.fields.scope === 'workspace'
      ? 'workspace'
      : 'workflow'
  const selectedIds = selectedPlan && Array.isArray(selectedPlan.fields.targetIds)
    ? selectedPlan.fields.targetIds.map(String).filter(Boolean)
    : []
  const selectedTargetKeys = new Set(selectedPlan
    ? selectedScope === 'workspace'
      ? ['workspace:workspace']
      : selectedIds.length > 0
        ? selectedIds.map((id) => `${selectedScope}:${id}`)
        : [`${selectedScope}:Select ${selectedScope}`]
    : [])
  const dimensionLabels = Array.from(new Set(plans.flatMap(getOptimizationDimensions))).sort()
  const targetEntries = Array.from(new Map(plans.flatMap((item) => {
    const scope = item.fields.scope === 'agent' ? 'agent' : item.fields.scope === 'workspace' ? 'workspace' : 'workflow'
    const ids = Array.isArray(item.fields.targetIds) ? item.fields.targetIds.map(String).filter(Boolean) : []
    const targets = scope === 'workspace'
      ? [{ kind: 'workspace', id: 'workspace', pending: false }]
      : ids.length > 0
        ? ids.map((id) => ({ kind: scope, id, pending: false }))
        : [{ kind: scope, id: `Select ${scope}`, pending: true }]
    return targets.map((target) => [`${target.kind}:${target.id}`, target] as const)
  })).values())
  const canvasHeight = Math.max(420, plans.length * 72 + 80, dimensionLabels.length * 62 + 80, targetEntries.length * 62 + 80)
  const distribute = (count: number) => count <= 1
    ? [canvasHeight / 2]
    : Array.from({ length: count }, (_, index) => 54 + (index * (canvasHeight - 108)) / (count - 1))
  const dimensionY = new Map(dimensionLabels.map((label, index) => [label, distribute(dimensionLabels.length)[index]]))
  const planY = new Map(plans.map((item, index) => [item.id, distribute(plans.length)[index]]))
  const targetY = new Map(targetEntries.map((target, index) => [`${target.kind}:${target.id}`, distribute(targetEntries.length)[index]]))
  const planWidth = 250
  const sideWidth = 190

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-start justify-between gap-3">
          <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Optimization relationships</h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {selectedPlan
              ? `${selectedPlan.name} is highlighted with the attributes and destination it affects.`
              : showingSuggestions
                ? `${plans.length} suggested plans preview their optimization dimensions. Select a plan to isolate its attributes and destination.`
                : 'Dimensions connect to saved plans and their destinations. Select a plan to isolate its relationships.'}
          </p>
          </div>
          <RelationshipZoomControls zoom={zoom} onChange={setZoom} />
        </div>
        <div className="mt-2 flex min-h-5 flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />Optimizes</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />Plan</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Target</span>
        </div>
      </div>
      <div className="max-w-full overflow-x-auto">
        {plans.length === 0 ? (
          <div className="flex min-h-52 items-center justify-center px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {showingSuggestions
              ? 'No suggested plans match the current search and filters.'
              : 'No active plans are available for this relationship graph.'}
          </div>
        ) : (
          <svg
            role="img"
            aria-label="Optimize relationship graph"
            width={`${zoom * 100}%`}
            height={canvasHeight * zoom}
            viewBox={`0 0 1000 ${canvasHeight}`}
            preserveAspectRatio="xMidYMid meet"
            className="block"
            style={{ minWidth: `${Math.round(760 * zoom)}px` }}
          >
          <title>Optimization dimensions connected to plans and their targets</title>
          {plans.flatMap((item) => {
            const y = planY.get(item.id) || canvasHeight / 2
            const isSelected = selectedPlan?.id === item.id
            const isMuted = Boolean(selectedPlan) && !isSelected
            const scope = item.fields.scope === 'agent' ? 'agent' : item.fields.scope === 'workspace' ? 'workspace' : 'workflow'
            const ids = Array.isArray(item.fields.targetIds) ? item.fields.targetIds.map(String).filter(Boolean) : []
            const targetKeys = scope === 'workspace'
              ? ['workspace:workspace']
              : ids.length > 0
                ? ids.map((id) => `${scope}:${id}`)
                : [`${scope}:Select ${scope}`]
            return [
              ...getOptimizationDimensions(item).map((label) => (
                <path
                  key={`${item.id}:dimension:${label}`}
                  d={`M ${40 + sideWidth} ${dimensionY.get(label) || y} C 300 ${dimensionY.get(label) || y}, 300 ${y}, 375 ${y}`}
                  fill="none"
                  className={`${isMuted ? 'opacity-10' : ''} stroke-amber-300 transition-opacity dark:stroke-amber-700`}
                  strokeWidth={isSelected ? 4 : 2}
                />
              )),
              ...targetKeys.map((key) => (
                <path
                  key={`${item.id}:target:${key}`}
                  d={`M ${375 + planWidth} ${y} C 700 ${y}, 700 ${targetY.get(key) || y}, 770 ${targetY.get(key) || y}`}
                  fill="none"
                  className={`${isMuted ? 'opacity-10' : ''} stroke-emerald-300 transition-opacity dark:stroke-emerald-800`}
                  strokeWidth={isSelected ? 4 : 2}
                />
              )),
            ]
          })}
          {dimensionLabels.map((label) => (
            <g
              key={label}
              transform={`translate(40 ${Number(dimensionY.get(label)) - 21})`}
              className={`${selectedPlan && !selectedDimensions.has(label) ? 'opacity-20' : ''} transition-opacity`}
            >
              <rect
                width={sideWidth}
                height="42"
                rx="6"
                className={selectedPlan && selectedDimensions.has(label)
                  ? 'fill-amber-100 stroke-amber-500 dark:fill-amber-900/80 dark:stroke-amber-400'
                  : 'fill-amber-50 stroke-amber-300 dark:fill-amber-950/60 dark:stroke-amber-700'}
                strokeWidth={selectedPlan && selectedDimensions.has(label) ? 3 : 1}
              />
              <text x={sideWidth / 2} y="26" textAnchor="middle" className="fill-amber-800 text-[13px] font-semibold dark:fill-amber-200">{truncateGraphLabel(label)}</text>
            </g>
          ))}
          {plans.map((item) => {
            const y = Number(planY.get(item.id)) - 25
            const isSelected = selectedPlan?.id === item.id
            return (
              <g
                key={item.id}
                transform={`translate(375 ${y})`}
                role="button"
                tabIndex={0}
                aria-label={`Open ${item.name}`}
                aria-pressed={selectedId === item.id}
                className={`${selectedPlan && !isSelected ? 'opacity-25' : ''} cursor-pointer outline-none transition-opacity`}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(item.id)}
                onBlur={() => setHoveredId(null)}
                onClick={() => onOpen(item.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onOpen(item.id)
                }}
              >
                <rect
                  width={planWidth}
                  height="50"
                  rx="6"
                  className={!item.enabled && !item.id.startsWith('suggested:')
                    ? 'fill-gray-100 stroke-gray-400 dark:fill-gray-800 dark:stroke-gray-600'
                    : isSelected
                      ? 'fill-sky-100 stroke-sky-600 dark:fill-sky-900 dark:stroke-sky-300'
                      : 'fill-sky-50 stroke-sky-400 hover:fill-sky-100 dark:fill-sky-950/70 dark:stroke-sky-700 dark:hover:fill-sky-900'}
                  strokeWidth={isSelected ? 4 : 2}
                />
                <text x={planWidth / 2} y="22" textAnchor="middle" className="fill-sky-900 text-[13px] font-semibold dark:fill-sky-100">{truncateGraphLabel(item.name)}</text>
                <text x={planWidth / 2} y="38" textAnchor="middle" className="fill-sky-600 text-[11px] dark:fill-sky-300">
                  {item.id.startsWith('suggested:') ? 'Suggested plan' : item.enabled ? 'Enabled plan' : 'Disabled plan'}
                </text>
              </g>
            )
          })}
          {targetEntries.map((target) => {
            const key = `${target.kind}:${target.id}`
            const label = target.pending ? target.id : resolveTarget(target.kind, target.id)
            const isSelected = selectedTargetKeys.has(key)
            return (
              <g
                key={key}
                transform={`translate(770 ${Number(targetY.get(key)) - 21})`}
                className={`${selectedPlan && !isSelected ? 'opacity-20' : ''} transition-opacity`}
              >
                <rect
                  width={sideWidth}
                  height="42"
                  rx="6"
                  className={isSelected
                    ? target.pending
                      ? 'fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950/70 dark:stroke-emerald-400'
                      : 'fill-emerald-100 stroke-emerald-500 dark:fill-emerald-900/80 dark:stroke-emerald-400'
                    : target.pending
                      ? 'fill-gray-50 stroke-gray-300 dark:fill-gray-800 dark:stroke-gray-600'
                      : 'fill-emerald-50 stroke-emerald-300 dark:fill-emerald-950/60 dark:stroke-emerald-700'}
                  strokeWidth={isSelected ? 3 : 1}
                  strokeDasharray={target.pending ? '5 4' : undefined}
                />
                <text x={sideWidth / 2} y="18" textAnchor="middle" className="fill-gray-500 text-[10px] font-semibold uppercase dark:fill-gray-400">{target.kind}</text>
                <text x={sideWidth / 2} y="32" textAnchor="middle" className="fill-emerald-800 text-[12px] font-medium dark:fill-emerald-200">{truncateGraphLabel(label, 25)}</text>
              </g>
            )
          })}
          </svg>
        )}
      </div>
    </div>
  )
}

type SelectedLifecycleEvent = {
  targetKey: string
  targetName: string
  event: AgentLifecycleEvidenceData['events'][number]
}

function LifecycleRelationshipGraph({
  plugin,
  items,
  suggestionTemplates,
  context,
  onOpen,
  onApplySuggestion,
  selectedId,
}: {
  plugin: PluginManifest
  items: PluginRecord[]
  suggestionTemplates?: PluginRecordTemplate[]
  context: PluginWorkspaceContext
  onOpen: (id: string) => void
  onApplySuggestion?: (templateId: string) => void
  selectedId?: string | null
}) {
  const [zoom, setZoom] = useState(1)
  const [evidenceByTarget, setEvidenceByTarget] = useState<Record<string, AgentLifecycleEvidenceData>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<SelectedLifecycleEvent | null>(null)
  const lifecycleItems = items.filter(isGenericPluginRecord).filter((item) => ['agent', 'workflow', 'group', 'community'].includes(String(item.fields.subjectType)))
  const targetSettings = new Map<string, { id: string; subjectType: 'agent' | 'workflow' | 'group' | 'community'; focus: string; timeWindow: string }>()
  lifecycleItems.forEach((item) => {
    const subjectType = ['agent', 'workflow', 'group', 'community'].includes(String(item.fields.subjectType)) ? item.fields.subjectType as 'agent' | 'workflow' | 'group' | 'community' : 'agent'
    const targetIds = Array.isArray(item.fields.targetIds) ? item.fields.targetIds.map(String) : []
    targetIds.forEach((targetId) => {
      const key = `${subjectType}:${targetId}`
      if (!targetSettings.has(key)) {
        targetSettings.set(key, {
          id: targetId,
          subjectType,
          focus: String(item.fields.focus || 'overview'),
          timeWindow: String(item.fields.timeWindow || 'all'),
        })
      }
    })
  })
  const targetKeys = Array.from(targetSettings.keys())

  useEffect(() => {
    if (targetKeys.length === 0) {
      setEvidenceByTarget({})
      setError(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    Promise.all(targetKeys.map(async (targetKey) => {
      const target = targetSettings.get(targetKey)!
      const resource = target.subjectType === 'workflow' ? `workflows/${encodeURIComponent(target.id)}`
        : target.subjectType === 'agent' ? `agents/${encodeURIComponent(target.id)}`
          : `communications/${target.subjectType}/${encodeURIComponent(target.id)}`
      const response = await fetch(`/api/plugins/${encodeURIComponent(plugin.slug)}/lifecycle/${resource}`, { signal: controller.signal })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || `Failed to load ${target.id}`)
      return [targetKey, payload.evidence as AgentLifecycleEvidenceData] as const
    }))
      .then((entries) => setEvidenceByTarget(Object.fromEntries(entries)))
      .catch((reason) => {
        if (reason?.name !== 'AbortError') setError(reason?.message || 'Failed to load lifecycle histories')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [plugin.slug, targetKeys.join('|')])

  const filterEvents = (targetKey: string, evidence: AgentLifecycleEvidenceData) => {
    const settings = targetSettings.get(targetKey) || { id: '', subjectType: 'agent' as const, focus: 'overview', timeWindow: 'all' }
    const windowDays = settings.timeWindow === '24-hours' ? 1 : settings.timeWindow === '7-days' ? 7 : settings.timeWindow === '30-days' ? 30 : null
    const cutoff = windowDays ? Date.now() - windowDays * 24 * 60 * 60 * 1000 : null
    const focusTypes = settings.focus === 'activity'
      ? new Set(['conversation', 'execution'])
      : settings.focus === 'artifacts'
        ? new Set(['file'])
        : settings.focus === 'configuration'
          ? new Set(['created', 'modified', 'model'])
          : null
    const filtered = evidence.events
      .filter((event) => cutoff === null || new Date(event.at).getTime() >= cutoff || event.type === 'created')
      .filter((event) => focusTypes === null || focusTypes.has(event.type) || event.type === 'created')
    if (filtered.length <= 16) return filtered
    const created = filtered.find((event) => event.type === 'created')
    return created ? [created, ...filtered.filter((event) => event.id !== created.id).slice(-15)] : filtered.slice(-16)
  }
  const laneHeight = 150
  const canvasWidth = 1040
  const lineStart = 180
  const lineEnd = 990
  const canvasHeight = Math.max(230, 70 + targetKeys.length * laneHeight)
  const eventColor = (type: AgentLifecycleEvidenceData['events'][number]['type']) => {
    if (type === 'created') return '#10b981'
    if (type === 'model') return '#8b5cf6'
    if (type === 'conversation') return '#0ea5e9'
    if (type === 'execution') return '#ec4899'
    if (type === 'modified') return '#f59e0b'
    return '#64748b'
  }

  if (suggestionTemplates !== undefined) {
    // Generic v2 templates do not have the legacy `kind` discriminator, so
    // keep them based on their declared fields rather than the core record guard.
    const suggestions = suggestionTemplates
      .map(templateToPreviewRecord)
      .filter((item): item is GenericPluginRecord => 'fields' in item && !!item.fields && typeof item.fields === 'object')
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40">
        <div className="border-b border-gray-200 p-4 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Suggested lifecycle relationships</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Each suggestion connects an object type to an inspection focus and time window. Select one to review and choose workspace targets.</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Object type</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />Inspection</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />Focus</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-gray-500" />Targets required</span>
          </div>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2" aria-label="Suggested lifecycle relationship graph">
          {suggestions.map((suggestion) => {
            const subjectType = String(suggestion.fields.subjectType || 'agent')
            const focus = String(suggestion.fields.focus || 'overview')
            const timeWindow = String(suggestion.fields.timeWindow || '7-days')
            const selected = selectedId === suggestion.id
            return (
              <div
                key={suggestion.id}
                onClick={() => onOpen(suggestion.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onOpen(suggestion.id)
                }}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                className={`rounded-lg border p-4 text-left transition-colors ${selected ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100 dark:bg-sky-950/30 dark:ring-sky-900/40' : 'border-gray-200 hover:border-sky-300 dark:border-gray-700 dark:hover:border-sky-700'}`}
              >
                <div className="mb-4 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{suggestion.name}</div>
                <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
                  <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium capitalize text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{subjectType}</span>
                  <span className="h-px min-w-5 flex-1 bg-gray-300 dark:bg-gray-700" />
                  <span className="max-w-40 shrink-0 truncate rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">{suggestion.name}</span>
                  <span className="h-px min-w-5 flex-1 bg-gray-300 dark:bg-gray-700" />
                  <span className="shrink-0 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium capitalize text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300">{focus}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>{timeWindow.replaceAll('-', ' ')}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (onApplySuggestion) onApplySuggestion(suggestion.id.replace(/^suggested:/, ''))
                      else onOpen(suggestion.id)
                    }}
                    className={`${headerPrimaryButtonClass} px-2.5 py-1 text-xs`}
                  >
                    Select {subjectType}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (targetKeys.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900/40">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Lifecycle timelines</h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Edit a Lifecycle inspection and select one or more agents or workflows. Each object will appear in its own comparable timeline lane.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40">
      <div className="border-b border-gray-200 p-4 dark:border-gray-700">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Lifecycle timelines</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Compare {targetKeys.length} selected object{targetKeys.length === 1 ? '' : 's'} from creation to now. Relative time is preserved while long gaps are compressed.</p>
          </div>
          <RelationshipZoomControls zoom={zoom} onChange={setZoom} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400" aria-label="Lifecycle timeline legend">
          {[['Created', '#10b981'], ['Configuration', '#f59e0b'], ['Model', '#8b5cf6'], ['Conversation', '#0ea5e9'], ['Run', '#ec4899'], ['File', '#64748b']].map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm text-gray-500">Loading lifecycle histories...</div>
      ) : error ? (
        <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">{error}</div>
      ) : (
        <div className="overflow-auto" aria-label="Lifecycle relationship timeline">
          <svg viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} style={{ width: `${canvasWidth * zoom}px`, minWidth: `${canvasWidth * zoom}px`, height: `${canvasHeight * zoom}px` }} role="img">
            {targetKeys.map((targetKey, laneIndex) => {
              const evidence = evidenceByTarget[targetKey]
              if (!evidence) return null
              const events = filterEvents(targetKey, evidence)
              const eventTimes = events.map((event) => new Date(event.at).getTime())
              const timeline = buildCompressedTimelineLayout(eventTimes, lineStart, lineEnd)
              const y = 75 + laneIndex * laneHeight
              return (
                <g key={targetKey}>
                  <text x="22" y={y - 9} className="fill-gray-900 text-[14px] font-semibold dark:fill-gray-100">{truncateGraphLabel(evidence.subject.name, 20)}</text>
                  <text x="22" y={y + 12} className="fill-gray-500 text-[11px] dark:fill-gray-400">{truncateGraphLabel(evidence.subject.kind === 'workflow' ? `Workflow · ${evidence.subject.currentStatus || 'unknown'}` : evidence.subject.kind === 'group' || evidence.subject.kind === 'community' ? `${evidence.subject.kind} · ${evidence.summary.messageCount} messages` : evidence.subject.currentModel || 'No model', 22)}</text>
                  <line x1={lineStart} y1={y} x2={lineEnd} y2={y} className="stroke-sky-300 dark:stroke-sky-700" strokeWidth="3" />
                  <text x={lineStart} y={y + 52} textAnchor="start" className="fill-gray-400 text-[10px]">Created</text>
                  <text x={lineEnd} y={y + 52} textAnchor="end" className="fill-gray-400 text-[10px]">Now</text>
                  {timeline.breaks.map((gap) => (
                    <g key={`gap:${gap.afterIndex}`} aria-label={formatLifecycleGap(gap.gapMs)}>
                      <rect x={gap.x - 34} y={y - 13} width="68" height="26" rx="5" className="fill-white dark:fill-gray-900" />
                      <text x={gap.x} y={y - 1} textAnchor="middle" className="fill-gray-500 text-[14px] font-bold dark:fill-gray-400">···</text>
                      <text x={gap.x} y={y + 11} textAnchor="middle" className="fill-gray-400 text-[8px] dark:fill-gray-500">{formatLifecycleGap(gap.gapMs)}</text>
                    </g>
                  ))}
                  {events.map((event, eventIndex) => {
                    const x = timeline.positions[eventIndex] ?? lineStart
                    const direction = eventIndex % 2 === 0 ? -1 : 1
                    const branchEnd = y + direction * 30
                    const eventKey = `${targetKey}:${event.id}`
                    const active = selectedEvent ? `${selectedEvent.targetKey}:${selectedEvent.event.id}` === eventKey : false
                    return (
                      <g
                        key={eventKey}
                        role="button"
                        tabIndex={0}
                        aria-label={`${evidence.subject.name}: ${event.title}`}
                        className="cursor-pointer outline-none"
                        onClick={() => setSelectedEvent({ targetKey, targetName: evidence.subject.name, event })}
                        onKeyDown={(keyboardEvent) => {
                          if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') setSelectedEvent({ targetKey, targetName: evidence.subject.name, event })
                        }}
                      >
                        <title>{event.title}: {event.detail}</title>
                        <line x1={x} y1={y} x2={x} y2={branchEnd} stroke={eventColor(event.type)} strokeWidth={active ? 3 : 2} />
                        <circle cx={x} cy={y} r={active ? 7 : 5} fill={eventColor(event.type)} className="stroke-white dark:stroke-gray-900" strokeWidth="2" />
                        <text x={x} y={branchEnd + (direction < 0 ? -5 : 13)} textAnchor="middle" className="fill-gray-600 text-[9px] font-medium dark:fill-gray-300">{truncateGraphLabel(event.title, 18)}</text>
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </svg>
        </div>
      )}
      {selectedEvent && (
        <div className="border-t border-gray-200 bg-sky-50/60 p-4 dark:border-gray-700 dark:bg-sky-950/20" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase text-sky-700 dark:text-sky-300">{selectedEvent.targetName} · {selectedEvent.event.type}</div>
              <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedEvent.event.title}</div>
              <div className="mt-1 break-words text-sm text-gray-600 dark:text-gray-300">{selectedEvent.event.detail}</div>
              <time className="mt-2 block text-xs text-gray-500">{new Date(selectedEvent.event.at).toLocaleString()}</time>
            </div>
            <button type="button" onClick={() => setSelectedEvent(null)} className="text-xs font-medium text-sky-700 hover:text-sky-800 dark:text-sky-300">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

function PluginRelationshipView({
  plugin,
  items,
  suggestionTemplates,
  context,
  onOpen,
  onApplySuggestion,
  onRun,
  onOpenScore,
  onAssignTarget,
  onToggle,
  runningItemIds,
  runningCaseProgress,
  selectedId,
  heading = 'Selected item',
}: {
  plugin: PluginManifest
  items: PluginRecord[]
  suggestionTemplates?: PluginRecordTemplate[]
  context: PluginWorkspaceContext
  onOpen: (id: string) => void
  onApplySuggestion?: (templateId: string) => void
  onRun?: (id: string) => void
  onOpenScore?: (id: string) => void
  onAssignTarget?: (id: string) => void
  onToggle?: (id: string) => void
  runningItemIds?: Set<string>
  runningCaseProgress?: Map<string, { completed: number; total: number }>
  selectedId?: string | null
  heading?: string
}) {
  if (plugin.objectKind === 'lifecycle-view') {
    return <LifecycleRelationshipGraph plugin={plugin} items={items} suggestionTemplates={suggestionTemplates} context={context} onOpen={onOpen} onApplySuggestion={onApplySuggestion} selectedId={selectedId} />
  }
  if (plugin.objectKind === 'optimization-plan') {
    return <OptimizeRelationshipGraph items={items} suggestionTemplates={suggestionTemplates} context={context} onOpen={onOpen} selectedId={selectedId} />
  }
  if (usesLegacyPluginAdapter(plugin, 'guardrail')) {
    return (
      <GuardrailRelationshipGraph
        items={items}
        suggestionTemplates={suggestionTemplates}
        context={context}
        onOpen={onOpen}
        selectedId={selectedId}
      />
    )
  }
  if (usesLegacyPluginAdapter(plugin, 'eval')) {
    return (
      <EvalRelationshipGraph
        items={items}
        suggestionTemplates={suggestionTemplates}
        context={context}
        onOpen={onOpen}
        onRun={onRun}
        onOpenScore={onOpenScore}
        onAssignTarget={onAssignTarget}
        onToggle={onToggle}
        runningItemIds={runningItemIds}
        runningCaseProgress={runningCaseProgress}
        selectedId={selectedId}
      />
    )
  }

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
    const scope = item.fields.subjectType === 'agent' || item.fields.scope === 'agent' ? 'agent' : 'workflow'
    return ids.map((id) => ({ kind: scope, id }))
  }
  const relationshipLabel = plugin.objectKind === 'lifecycle-view' ? 'Inspects' : 'Applies to'

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40">
      <div className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1.2fr)] border-b border-gray-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
        <div>{heading}</div>
        <div />
        <div>{relationshipLabel}</div>
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
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [suggestionSearch, setSuggestionSearch] = useState('')
  const [suggestionTags, setSuggestionTags] = useState<string[]>([])
  const [collectionTab, setCollectionTab] = useState<PluginCollectionTab>('active')
  const [suggestionSort, setSuggestionSort] = useState<PluginTemplateSort>('recommended')
  const [viewMode, setViewMode] = useState<PluginViewMode>(() => {
    const saved = localStorage.getItem(`clawmax-plugin-view-mode:${plugin.slug}`)
    return saved === 'detail' || saved === 'table' || saved === 'graph' ? saved : 'grid'
  })
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PluginRecord | null>(null)
  const [focusEvalTargets, setFocusEvalTargets] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [scoreReviewItemId, setScoreReviewItemId] = useState<string | null>(null)
  const [selectedSuggestedTemplateId, setSelectedSuggestedTemplateId] = useState<string | null>(null)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const [showAiPromptEditor, setShowAiPromptEditor] = useState(false)
  const [aiPromptText, setAiPromptText] = useState('')
  const [aiCreateStage, setAiCreateStage] = useState<'prompt' | 'review'>('prompt')
  const [aiDraftPreview, setAiDraftPreview] = useState<Partial<PluginRecord> | null>(null)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [activeCompactActions, setActiveCompactActions] = useState<string | null>(null)
  const [runningItemIds, setRunningItemIds] = useState<Set<string>>(new Set())
  const [runningCaseProgress, setRunningCaseProgress] = useState<Map<string, { completed: number; total: number }>>(new Map())
  const [applyingTemplateIds, setApplyingTemplateIds] = useState<Set<string>>(new Set())
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
  const aiCreateCopy = getPluginAiCreateCopy({
    objectKind: plugin.objectKind,
    name: plugin.name,
    singular: plugin.labels?.singular,
  })
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
      if (selectedTags.some((tag) => !item.tags.includes(tag))) return false
      if (statusFilter === 'enabled' && !item.enabled) return false
      if (statusFilter === 'disabled' && item.enabled) return false
      if (groupField && activeGroup) {
        if (!isGenericPluginRecord(item) || item.fields[groupField] !== activeGroup) return false
      }
      return matchesPluginSearch(item, search)
    }),
    [items, search, selectedTags, statusFilter, collectionTab, groupField, activeGroup]
  )
  const scoreReviewItem = useMemo(() => {
    const candidate = items.find((item) => item.id === scoreReviewItemId)
    return candidate && isEvalRecord(candidate) && candidate.lastRun ? candidate : null
  }, [items, scoreReviewItemId])
  const recommendedTemplates = useMemo(() => templates.filter((entry) => {
    if (entry.recommended === false) return false
    if (!isChecklist) return true
    const templateFields = 'fields' in entry.payload ? entry.payload.fields : undefined
    const templateGroup = groupField && templateFields ? templateFields[groupField] : null
    return !items.some((item) => {
      if (item.name !== entry.payload.name) return false
      if (!groupField || typeof templateGroup !== 'string') return true
      return isGenericPluginRecord(item) && item.fields[groupField] === templateGroup
    })
  }), [templates, items, groupField, isChecklist])
  const usedTemplateIds = useMemo(() => new Set(templates.filter((template) => {
    const templateName = String(template.payload.name || template.name).trim()
    return items.some((item) => item.archived !== true && item.name === templateName)
  }).map((template) => template.id)), [templates, items])
  const availableSuggestionTags = useMemo(() => {
    const allTags = collectPluginTemplateTags(recommendedTemplates)
    if (!isChecklist) return allTags
    return ['1.9.9', '2.0.0', '2.0.0-test-rc45'].filter((tag) => allTags.includes(tag))
  }, [recommendedTemplates, isChecklist])
  const filteredSuggestions = useMemo(() => sortPluginTemplates(
    recommendedTemplates.filter((template) => (
      (suggestionTags.length === 0 || suggestionTags.every((tag) => template.tags.includes(tag)))
      && matchesPluginTemplateSearch(template, suggestionSearch)
    )),
    suggestionSort,
  ), [recommendedTemplates, suggestionTags, suggestionSearch, suggestionSort])
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

  const buildAiPreview = (promptText: string): Partial<PluginRecord> => {
    const draft = buildPluginDraftFromPrompt(plugin, promptText)
    setAiDraftPreview(draft as Partial<PluginRecord>)
    setAiCreateStage('review')
    return draft as Partial<PluginRecord>
  }

  const handleAiNext = () => {
    const promptText = aiPromptText.trim()
    if (!promptText) return
    try {
      buildAiPreview(promptText)
    } catch (error: any) {
      setError(error?.message || 'Could not prepare the AI draft.')
    }
  }

  const handleAiGenerate = async (promptOverride?: string) => {
    const promptText = typeof promptOverride === 'string' ? promptOverride.trim() : aiPromptText.trim()
    if (!promptText) return
    setAiGenerating(true)
    try {
      const draft = aiDraftPreview || buildPluginDraftFromPrompt(plugin, promptText)
      // Keep the build state visible long enough for the user to understand that
      // the prompt is being turned into an editable plugin draft.
      await new Promise((resolve) => window.setTimeout(resolve, 250))
      setEditing(draft as PluginRecord)
      setShowAiPrompt(false)
      setAiCreateStage('prompt')
      setAiDraftPreview(null)
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

    let progressTimer: number | null = null
    if (action === 'run') {
      const record = items.find((entry) => entry.id === itemId)
      if (!record || !isEvalRecord(record)) return
      const readiness = getEvalReadiness(record)
      if (!readiness.ready) {
        setError(`Eval is not ready to run: ${readiness.issues.join('; ')}.`)
        return
      }
      const total = Math.max(1, record.experiment.cases?.length || getEvalTrialCount(record))
      setRunningItemIds((current) => new Set(current).add(itemId))
      setRunningCaseProgress((current) => new Map(current).set(itemId, { completed: 0, total }))
      progressTimer = window.setInterval(() => {
        setRunningCaseProgress((current) => {
          const progress = current.get(itemId)
          if (!progress || progress.completed >= progress.total - 1) return current
          return new Map(current).set(itemId, { ...progress, completed: progress.completed + 1 })
        })
      }, 600)
    }
    const route = action === 'delete'
      ? `/api/plugins/${encodeURIComponent(plugin.slug)}/items/${encodeURIComponent(itemId)}`
      : `/api/plugins/${encodeURIComponent(plugin.slug)}/items/${encodeURIComponent(itemId)}/${action === 'document' ? 'document' : action}`
    try {
      const res = await fetch(route, { method: action === 'delete' ? 'DELETE' : 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Plugin action failed')
      }
      await load()
      if (action === 'document' && data.item?.document?.path && onNavigateToDoc) {
        onNavigateToDoc(data.item.document.path)
      }
      setError(null)
    } catch (actionError: any) {
      setError(actionError?.message || 'Plugin action failed')
    } finally {
      if (action === 'run') {
        if (progressTimer !== null) window.clearInterval(progressTimer)
        setRunningItemIds((current) => {
          const next = new Set(current)
          next.delete(itemId)
          return next
        })
        setRunningCaseProgress((current) => {
          const next = new Map(current)
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
      ? {
          kind: 'eval',
          enabled: true,
          tags: [],
          target: { type: 'agent', ids: [] },
          experiment: {
            input: '',
            candidateOutput: '',
            expectedOutput: '',
            judge: 'ai',
            iterations: 1,
            judgeGuidance: '',
            fixedMatch: 'exact',
            fixedCaseSensitive: false,
            cases: [createEvalCase(1)],
          },
          runs: [],
        }
      : { kind: plugin.objectKind, enabled: true, tags: [], fields: buildGenericPluginFields(plugin) }

  const applyTemplate = async (templateId: string) => {
    setApplyingTemplateIds((current) => new Set(current).add(templateId))
    setError(null)
    try {
      const res = await fetch(`/api/plugins/${encodeURIComponent(plugin.slug)}/templates/${encodeURIComponent(templateId)}/apply`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to use suggested item')
      }
      const data = await res.json()
      await load()
      setCollectionTab('active')
      if (data.item) {
        setSelectedItemId(data.item.id)
        setEditing(data.item)
        setShowModal(true)
      }
    } catch (err: any) {
      setError(`Could not use this suggestion: ${err.message || 'Unknown error'}`)
    } finally {
      setApplyingTemplateIds((current) => {
        const next = new Set(current)
        next.delete(templateId)
        return next
      })
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
      const archiveIds = new Set(getSupersededReviewReleaseIdsToArchive(
        items,
        groupField,
        incomingRelease,
      ))
      const supersededRecords = items.filter((item) => archiveIds.has(item.id))
      if (supersededRecords.length > 0) await updateItems(supersededRecords, true)
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
  const isSyntheticProductFixture = plugin.slug === 'plugin-evals' || plugin.slug === 'plugin-guardrails'

  return (
    <div className="mx-auto box-border w-full min-w-0 max-w-7xl overflow-x-hidden px-3 py-5 sm:px-6 sm:py-6">
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
                      setAiCreateStage('prompt')
                      setAiDraftPreview(null)
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
      {isSyntheticProductFixture && (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="font-semibold">Test fixture catalog</div>
          <p className="mt-0.5">
            This instance loaded the public two-item contract fixture. Deploy the configured product plugin bundle to test its complete catalog.
          </p>
        </div>
      )}

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
        <div className="grid w-full min-w-0 max-w-full grid-cols-3 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 sm:inline-flex sm:w-auto">
          <button
            onClick={() => setCollectionTab('active')}
            aria-pressed={collectionTab === 'active'}
            className={`min-w-0 whitespace-nowrap px-1.5 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
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
            className={`min-w-0 whitespace-nowrap px-1.5 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
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
            className={`min-w-0 whitespace-nowrap border-l border-gray-200 px-1.5 py-2 text-xs font-medium transition-colors dark:border-gray-700 sm:px-4 sm:text-sm ${
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
            onClick={() => setSelectedTags([])}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
              selectedTags.length === 0
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
              onClick={() => setSelectedTags((current) => (
                current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]
              ))}
              aria-pressed={selectedTags.includes(tag)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedTags.includes(tag)
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
                placeholder={`Search suggested ${plugin.labels?.plural?.toLowerCase() || 'items'} using one or more terms`}
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
            {['all', ...availableSuggestionTags].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  if (tag === 'all') setSuggestionTags([])
                  else setSuggestionTags((current) => (
                    current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]
                  ))
                }}
                aria-pressed={tag === 'all' ? suggestionTags.length === 0 : suggestionTags.includes(tag)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  (tag === 'all' ? suggestionTags.length === 0 : suggestionTags.includes(tag))
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
                      inUse={usedTemplateIds.has(template.id)}
                      applying={applyingTemplateIds.has(template.id)}
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
                      inUse={usedTemplateIds.has(template.id)}
                      applying={applyingTemplateIds.has(template.id)}
                      onApply={() => void applyTemplate(template.id)}
                    />
                  ))}
                </div>
              ) : viewMode === 'graph' ? (
                <div className="space-y-4">
                  <PluginRelationshipView
                    plugin={plugin}
                    items={[]}
                    suggestionTemplates={filteredSuggestions}
                    context={context}
                    onOpen={(id) => setSelectedSuggestedTemplateId(id.replace(/^suggested:/, ''))}
                    onApplySuggestion={(templateId) => void applyTemplate(templateId)}
                    selectedId={selectedSuggestedTemplateId ? `suggested:${selectedSuggestedTemplateId}` : null}
                    heading="Suggested item"
                  />
                  {selectedSuggestedTemplate && (
                    <TemplateCard
                      plugin={plugin}
                      template={selectedSuggestedTemplate}
                      detailed
                      inUse={usedTemplateIds.has(selectedSuggestedTemplate.id)}
                      applying={applyingTemplateIds.has(selectedSuggestedTemplate.id)}
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
                        <button
                          type="button"
                          onClick={() => void applyTemplate(template.id)}
                          disabled={applyingTemplateIds.has(template.id) || usedTemplateIds.has(template.id)}
                          className={`${headerPrimaryButtonClass} disabled:cursor-default disabled:opacity-60`}
                        >
                          {applyingTemplateIds.has(template.id) ? 'Adding...' : usedTemplateIds.has(template.id) ? 'In use' : 'Use'}
                        </button>
                      </div>
                      {selectedSuggestedTemplateId === template.id && (
                        <div className="sm:col-span-3">
                          <TemplateCard
                            plugin={plugin}
                            template={template}
                            detailed
                            inUse={usedTemplateIds.has(template.id)}
                            applying={applyingTemplateIds.has(template.id)}
                            onApply={() => void applyTemplate(template.id)}
                          />
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
        <div className={`mt-6 ${selectedItem && plugin.objectKind !== 'lifecycle-view' ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6' : ''}`}>
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
                      context={context}
                      selected={selectedItemId === item.id}
                      onOpen={() => setSelectedItemId(item.id)}
                      onToggleActions={() => setActiveCompactActions((current) => current === item.id ? null : item.id)}
                      onCheckToggle={checkField ? (() => void toggleCheck(item)) : null}
                      onOpenScore={isEvalRecord(item) && item.lastRun ? (() => setScoreReviewItemId(item.id)) : null}
                      onRun={isEvalRecord(item) && getEvalReadiness(item).ready ? (() => void callItemAction(item.id, 'run')) : null}
                      onReport={canGenerateDocs ? (() => void callItemAction(item.id, 'document')) : null}
                      onNotify={canNotify ? (() => void callItemAction(item.id, 'notify')) : null}
                      onToggle={() => void callItemAction(item.id, 'toggle')}
                      canGenerateDocs={canGenerateDocs}
                      canNotify={canNotify}
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
                            <ProductIconCell iconName="docs" label={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'} size="sm" className="border-transparent bg-transparent text-current" />
                            {isEvalRecord(item) ? 'Create or refresh report' : 'Generate document'}
                          </button>}
                          {canNotify && <button onClick={() => { setActiveCompactActions(null); void callItemAction(item.id, 'notify') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                            <ProductIconCell iconName="notification" label="Send status notification" size="sm" className="border-transparent bg-transparent text-current" />
                            Send status notification
                          </button>}
                          {isEvalRecord(item) && getEvalReadiness(item).ready && (
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
                      context={context}
                      onEdit={() => { setEditing(item); setShowModal(true) }}
                      onDelete={() => void callItemAction(item.id, 'delete')}
                      onToggle={() => void callItemAction(item.id, 'toggle')}
                      onGenerateDoc={() => void callItemAction(item.id, 'document')}
                      onNotify={() => void callItemAction(item.id, 'notify')}
                      onRun={isEvalRecord(item) && getEvalReadiness(item).ready ? (() => void callItemAction(item.id, 'run')) : null}
                      onOpenDoc={onNavigateToDoc || null}
                      onArchiveToggle={() => void saveItem({ ...item, archived: item.archived !== true } as Partial<PluginRecord>)}
                      canGenerateDocs={canGenerateDocs}
                      canNotify={canNotify}
                      onCheckToggle={checkField ? (() => void toggleCheck(item)) : null}
                      onOpenScore={isEvalRecord(item) && item.lastRun ? (() => setScoreReviewItemId(item.id)) : null}
                      running={runningItemIds.has(item.id)}
                    />
                  </div>
                ))}
              </div>
            ) : viewMode === 'graph' ? (
              <PluginRelationshipView
                plugin={plugin}
                items={filtered}
                context={context}
                onOpen={setSelectedItemId}
                onApplySuggestion={(templateId) => void applyTemplate(templateId)}
                onRun={(itemId) => void callItemAction(itemId, 'run')}
                onOpenScore={setScoreReviewItemId}
                onAssignTarget={(itemId) => {
                  const item = items.find((entry) => entry.id === itemId)
                  if (!item) return
                  setSelectedItemId(itemId)
                  setEditing(item)
                  setFocusEvalTargets(true)
                  setShowModal(true)
                }}
                onToggle={(itemId) => void callItemAction(itemId, 'toggle')}
                runningItemIds={runningItemIds}
                runningCaseProgress={runningCaseProgress}
                selectedId={selectedItemId}
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
                        title={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'}
                      >
                        <ProductIconCell iconName="docs" label={isEvalRecord(item) ? 'Create or refresh Eval report' : 'Generate document'} size="sm" className="border-transparent bg-transparent text-current" />
                      </button>}
                      {canNotify && <button
                        onClick={(event) => { event.stopPropagation(); void callItemAction(item.id, 'notify') }}
                        className="text-gray-300 hover:text-emerald-500 transition-colors text-xs p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                        title="Send status notification"
                      >
                        <ProductIconCell iconName="notification" label="Send status notification" size="sm" className="border-transparent bg-transparent text-current" />
                      </button>}
                      <button
                        onClick={(event) => { event.stopPropagation(); void callItemAction(item.id, 'toggle') }}
                        className="text-gray-300 hover:text-gray-600 transition-colors text-xs p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        title={item.enabled ? 'Disable' : 'Enable'}
                      >
                        <ProductIconCell iconName={item.enabled ? 'pause' : 'restart'} label={item.enabled ? 'Disable' : 'Enable'} size="sm" className="border-transparent bg-transparent text-current" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedItem && plugin.objectKind !== 'lifecycle-view' && (
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
                onRun={isEvalRecord(selectedItem) && getEvalReadiness(selectedItem).ready ? (() => void callItemAction(selectedItem.id, 'run')) : null}
                onOpenScore={isEvalRecord(selectedItem) && selectedItem.lastRun ? (() => setScoreReviewItemId(selectedItem.id)) : null}
                canGenerateDocs={canGenerateDocs}
                canNotify={canNotify}
              />
            </div>
          )}
        </div>
      )}

      {!loading && !error && (collectionTab === 'active' || collectionTab === 'archived') && viewMode !== 'graph' && plugin.objectKind === 'lifecycle-view' && selectedItem && isGenericPluginRecord(selectedItem) && ['agent', 'workflow', 'group', 'community'].includes(String(selectedItem.fields.subjectType)) && Array.isArray(selectedItem.fields.targetIds) && selectedItem.fields.targetIds.length > 0 && (
        <div className="mt-6 space-y-8">
          {selectedItem.fields.targetIds.map((agentId) => (
            <AgentLifecycleEvidence
              key={String(agentId)}
              pluginSlug={plugin.slug}
              agentId={String(agentId)}
              subjectType={selectedItem.fields.subjectType === 'workflow' ? 'workflow' : selectedItem.fields.subjectType === 'group' ? 'group' : selectedItem.fields.subjectType === 'community' ? 'community' : 'agent'}
              focus={String(selectedItem.fields.focus || 'overview')}
              timeWindow={String(selectedItem.fields.timeWindow || '7-days')}
            />
          ))}
        </div>
      )}

      {showModal && (
        <PluginFormModal
          plugin={plugin}
          context={context}
          draft={editing || createDraft}
          focusEvalTargets={focusEvalTargets}
          onClose={() => { setShowModal(false); setEditing(null); setFocusEvalTargets(false) }}
          onSave={(draft) => { setFocusEvalTargets(false); void saveItem(draft) }}
        />
      )}

      {scoreReviewItem && (
        <EvalScoreReviewDialog
          item={scoreReviewItem}
          onClose={() => setScoreReviewItemId(null)}
          onEdit={() => {
            setScoreReviewItemId(null)
            setEditing(scoreReviewItem)
            setShowModal(true)
          }}
          onRun={scoreReviewItem.enabled ? (() => {
            setScoreReviewItemId(null)
            void callItemAction(scoreReviewItem.id, 'run')
          }) : null}
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
              <h2 id="plugin-ai-create-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">{aiCreateCopy.title}</h2>
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
                onClick={() => aiCreateStage === 'prompt' ? handleAiNext() : void handleAiGenerate()}
                disabled={aiGenerating || !aiPromptText.trim()}
                className="w-full rounded-md bg-purple-600 px-4 py-2 text-sm text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {aiGenerating ? 'Building with AI…' : aiCreateStage === 'prompt' ? 'Next' : `Build ${plugin.labels?.singular || plugin.name} with AI`}
              </button>
            </div>
          )}
        >
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            {aiCreateStage === 'prompt'
              ? aiCreateCopy.intro
              : 'Review the generated specification below. Go back to refine the prompt, or build the editable draft with AI.'}
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
                : aiCreateCopy.placeholder}
            className="min-h-[100px] w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) aiCreateStage === 'prompt' ? handleAiNext() : void handleAiGenerate() }}
          />
          <div className="mt-2">
            <PromptQualityPanel prompt={aiPromptText} domain="plugin" compact />
          </div>
          {aiCreateStage === 'review' && aiDraftPreview && (
            <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-3 dark:border-sky-800 dark:bg-sky-950/30">
              <div className="text-sm font-semibold text-sky-900 dark:text-sky-100">Prompt details</div>
              <div className="mt-2 space-y-1 text-xs text-sky-900/80 dark:text-sky-100/80">
                {(() => {
                  try {
                    return getPluginDetailLines(plugin, aiDraftPreview as PluginRecord).map((line) => <div key={line}>{line}</div>)
                  } catch {
                    return <div>Draft details are ready to review in the next editor.</div>
                  }
                })()}
              </div>
              <button type="button" onClick={() => setAiCreateStage('prompt')} className="mt-3 text-xs font-medium text-sky-700 underline underline-offset-2 dark:text-sky-300">Edit prompt</button>
            </div>
          )}
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
        placeholder={aiCreateCopy.editorPlaceholder}
        savingAndGenerating={aiGenerating}
        generateDisabled={!aiPromptText.trim()}
        qualityDomain="plugin"
      />
    </div>
  )
}
