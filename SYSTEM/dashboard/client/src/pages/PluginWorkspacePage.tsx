import React, { useEffect, useMemo, useState } from 'react'
import { ProductIconCell } from '../lib/productIcons'
import {
  headerPrimaryButtonClass,
  headerSecondaryButtonActiveClass,
  headerSecondaryButtonClass,
  headerSecondaryButtonIdleClass,
} from '../lib/headerControls'
import type { PluginManifest, PluginRecord, PluginRecordTemplate, PluginWorkspaceContext } from '../lib/plugins'
import { collectPluginTags, matchesPluginSearch } from '../lib/plugins'

type Props = {
  plugin: PluginManifest
  isActive?: boolean
  onNavigateToDoc?: (path: string) => void
}

function PluginIcon({ plugin }: { plugin: PluginManifest }) {
  if (plugin.objectKind === 'guardrail') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 5 6v6c0 4.5 2.9 7.9 7 9 4.1-1.1 7-4.5 7-9V6Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v7.3L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9.3V2" />
      <path d="M8 2h8" />
      <path d="M9 13h6" />
      <path d="M8 17h8" />
    </svg>
  )
}

function EmptyState({ plugin, onCreate }: { plugin: PluginManifest; onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-900/40">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
        <PluginIcon plugin={plugin} />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">No {plugin.labels?.plural || plugin.name} yet</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
        {plugin.objectKind === 'guardrail'
          ? 'Create workspace-scoped guardrails that describe which agents or workflows are constrained and what they are allowed to do.'
          : 'Create workspace-scoped eval experiments with inputs, expected outputs, judge mode, and repeatable score history.'}
      </p>
      <button
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700"
      >
        <ProductIconCell iconName="create" label="Create" size="sm" className="border-white/20 bg-white/10 text-white" />
        Create {plugin.labels?.singular || plugin.name}
      </button>
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
  const allowedSkills = form.kind === 'guardrail'
    ? (form.controls?.allowedSkills || []).join(', ')
    : ''
  const targetIds = form.kind === 'eval' ? (form.target?.ids || []).join(', ') : ''

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

          {plugin.objectKind === 'guardrail' ? (
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
          ) : (
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
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300">Cancel</button>
          <button onClick={() => onSave(form)} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">Save</button>
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
}: {
  plugin: PluginManifest
  item: PluginRecord
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onGenerateDoc: () => void
  onNotify: () => void
  onRun: (() => void) | null
  onOpenDoc: (() => void) | null
}) {
  const commonSummary = item.kind === 'guardrail'
    ? `${item.appliesTo.agents.length} agents · ${item.appliesTo.workflows.length} workflows`
    : `${item.target.type} · ${item.target.ids.length} targets`

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
              {item.enabled ? 'Enabled' : 'Disabled'}
            </div>
            <div className="text-xs text-gray-400">{commonSummary}</div>
          </div>
          <h3 className="mt-2 truncate text-base font-semibold text-gray-900 dark:text-gray-100">{item.name}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{item.description || 'No description yet.'}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={onEdit} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300">Edit</button>
          <button onClick={onToggle} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300">{item.enabled ? 'Disable' : 'Enable'}</button>
          {onRun && (
            <button onClick={onRun} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700">Run</button>
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
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <button onClick={onGenerateDoc} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300">Generate Doc</button>
        <button onClick={onNotify} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300">Notify</button>
        <button onClick={onDelete} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 dark:border-red-900/40 dark:text-red-300">Delete</button>
        <button
          onClick={onOpenDoc || undefined}
          disabled={!onOpenDoc}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${onOpenDoc ? 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300' : 'cursor-not-allowed border border-gray-200 text-gray-400 dark:border-gray-800 dark:text-gray-600'}`}
        >
          Open Doc
        </button>
      </div>
      {item.kind === 'eval' && item.lastRun && (
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

function TemplateCard({
  plugin,
  template,
  onApply,
}: {
  plugin: PluginManifest
  template: PluginRecordTemplate
  onApply: () => void
}) {
  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
              Recommended
            </span>
            <span className="text-xs text-sky-700/80 dark:text-sky-300/80">{plugin.labels?.singular || plugin.name} template</span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">{template.name}</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{template.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {template.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <button onClick={onApply} className={headerPrimaryButtonClass}>Use Template</button>
      </div>
    </div>
  )
}

export default function PluginWorkspacePage({ plugin, isActive = false, onNavigateToDoc }: Props) {
  const [context, setContext] = useState<PluginWorkspaceContext>({ agents: [], workflows: [], groups: [], communities: [] })
  const [items, setItems] = useState<PluginRecord[]>([])
  const [templates, setTemplates] = useState<PluginRecordTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PluginRecord | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      const [contextRes, itemsRes] = await Promise.all([
        fetch(`/api/plugins/${encodeURIComponent(plugin.slug)}/context`),
        fetch(`/api/plugins/${encodeURIComponent(plugin.slug)}/items`),
      ])
      const templatesRes = await fetch(`/api/plugins/${encodeURIComponent(plugin.slug)}/templates`)
      if (!contextRes.ok || !itemsRes.ok || !templatesRes.ok) throw new Error('Failed to load plugin data')
      const contextJson = await contextRes.json()
      const itemsJson = await itemsRes.json()
      const templatesJson = await templatesRes.json()
      setContext(contextJson.context || { agents: [], workflows: [], groups: [], communities: [] })
      setItems(Array.isArray(itemsJson.items) ? itemsJson.items : [])
      setTemplates(Array.isArray(templatesJson.templates) ? templatesJson.templates : [])
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load plugin data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isActive) return
    void load()
  }, [plugin.slug, isActive])

  const tags = useMemo(() => collectPluginTags(items), [items])
  const filtered = useMemo(
    () => items.filter((item) => {
      if (selectedTag !== 'all' && !item.tags.includes(selectedTag)) return false
      if (statusFilter === 'enabled' && !item.enabled) return false
      if (statusFilter === 'disabled' && item.enabled) return false
      return matchesPluginSearch(item, search)
    }),
    [items, search, selectedTag, statusFilter]
  )
  const recommendedTemplates = useMemo(() => templates.filter((entry) => entry.recommended !== false), [templates])

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

  const callItemAction = async (itemId: string, action: 'delete' | 'document' | 'notify' | 'run' | 'toggle') => {
    if (action === 'toggle') {
      const record = items.find((entry) => entry.id === itemId)
      if (!record) return
      await saveItem({ ...record, enabled: !record.enabled } as Partial<PluginRecord>)
      return
    }

    const route = action === 'delete'
      ? `/api/plugins/${encodeURIComponent(plugin.slug)}/items/${encodeURIComponent(itemId)}`
      : `/api/plugins/${encodeURIComponent(plugin.slug)}/items/${encodeURIComponent(itemId)}/${action === 'document' ? 'document' : action}`
    const res = await fetch(route, { method: action === 'delete' ? 'DELETE' : 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Plugin action failed')
    }
    await load()
  }

  const createDraft: Partial<PluginRecord> = plugin.objectKind === 'guardrail'
    ? { kind: 'guardrail', enabled: true, tags: [], appliesTo: { agents: [], workflows: [], groups: [], communities: [] }, controls: { blockEmail: false, blockWeb: false, blockExternalDocs: false, allowedSkills: [] } }
    : { kind: 'eval', enabled: true, tags: [], target: { type: 'agent', ids: [] }, experiment: { input: '', candidateOutput: '', expectedOutput: '', judge: 'fixed' }, runs: [] }

  const applyTemplate = async (templateId: string) => {
    const res = await fetch(`/api/plugins/${encodeURIComponent(plugin.slug)}/templates/${encodeURIComponent(templateId)}/apply`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to apply template')
    }
    await load()
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-300">
                <PluginIcon plugin={plugin} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{plugin.name}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">{plugin.description}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-800">v{plugin.version}</span>
              <span className="rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-800">workspace-scoped</span>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[360px]">
            <button
              onClick={() => { setEditing(null); setShowModal(true) }}
              className={headerPrimaryButtonClass}
            >
              <ProductIconCell iconName="create" label="Create" size="sm" className="border-white/20 bg-white/10 text-white" />
              Create {plugin.labels?.singular || plugin.name}
            </button>
            <button
              onClick={() => void load()}
              className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}
            >
              <ProductIconCell iconName="refresh" label="Refresh" size="sm" className="border-transparent bg-transparent text-current" />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${plugin.labels?.plural || plugin.name.toLowerCase()} by name, description, tags, or targets`}
            className="w-full rounded-xl border border-sky-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none ring-0 focus:border-sky-500 dark:border-sky-800 dark:bg-gray-950 dark:text-gray-100"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`${headerSecondaryButtonClass} ${statusFilter === 'all' ? headerSecondaryButtonActiveClass : headerSecondaryButtonIdleClass}`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('enabled')}
              className={`${headerSecondaryButtonClass} ${statusFilter === 'enabled' ? headerSecondaryButtonActiveClass : headerSecondaryButtonIdleClass}`}
            >
              Enabled
            </button>
            <button
              onClick={() => setStatusFilter('disabled')}
              className={`${headerSecondaryButtonClass} ${statusFilter === 'disabled' ? headerSecondaryButtonActiveClass : headerSecondaryButtonIdleClass}`}
            >
              Disabled
            </button>
            <button
              onClick={() => setSelectedTag('all')}
              className={`${headerSecondaryButtonClass} ${selectedTag === 'all' ? headerSecondaryButtonActiveClass : headerSecondaryButtonIdleClass}`}
            >
              All tags
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`${headerSecondaryButtonClass} ${selectedTag === tag ? headerSecondaryButtonActiveClass : headerSecondaryButtonIdleClass}`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="text-xs uppercase tracking-wide text-gray-400">Objects</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">{items.length}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="text-xs uppercase tracking-wide text-gray-400">Enabled</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">{items.filter((item) => item.enabled).length}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="text-xs uppercase tracking-wide text-gray-400">Templates</div>
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {recommendedTemplates.length} recommended · {context.agents.length} agents · {context.workflows.length} workflows
          </div>
        </div>
      </div>

      {!loading && !error && recommendedTemplates.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recommended</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Starter templates to help users and plugin authors validate the plugin flow quickly.</p>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {recommendedTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                plugin={plugin}
                template={template}
                onApply={() => void applyTemplate(template.id)}
              />
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">Loading plugin workspace...</div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState plugin={plugin} onCreate={() => { setEditing(null); setShowModal(true) }} />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {filtered.map((item) => (
            <ItemCard
              key={item.id}
              plugin={plugin}
              item={item}
              onEdit={() => { setEditing(item); setShowModal(true) }}
              onDelete={() => void callItemAction(item.id, 'delete')}
              onToggle={() => void callItemAction(item.id, 'toggle')}
              onGenerateDoc={() => void callItemAction(item.id, 'document')}
              onNotify={() => void callItemAction(item.id, 'notify')}
              onRun={item.kind === 'eval' ? (() => void callItemAction(item.id, 'run')) : null}
              onOpenDoc={item.document?.path && onNavigateToDoc ? (() => onNavigateToDoc(item.document!.path)) : null}
            />
          ))}
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
    </div>
  )
}
