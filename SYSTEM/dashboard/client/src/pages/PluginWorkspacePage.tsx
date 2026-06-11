import React, { useEffect, useMemo, useState } from 'react'
import { ProductIconCell } from '../lib/productIcons'
import {
  headerPrimaryButtonClass,
  headerSecondaryButtonActiveClass,
  headerSecondaryButtonClass,
  headerSecondaryButtonIdleClass,
} from '../lib/headerControls'
import type { PluginManifest, PluginRecord, PluginRecordTemplate, PluginWorkspaceContext } from '../lib/plugins'
import { collectPluginTags, formatPluginScopeSummary, formatPluginUpdatedAt, matchesPluginSearch } from '../lib/plugins'

type Props = {
  plugin: PluginManifest
  isActive?: boolean
  onNavigateToDoc?: (path: string) => void
}

type ArchiveTab = 'active' | 'archived'
type PluginViewMode = 'grid' | 'detail' | 'table'

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

function PluginActionGlyph({ plugin }: { plugin: PluginManifest }) {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-transparent bg-transparent text-current">
      <PluginIcon plugin={plugin} />
    </span>
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
        Create
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
  onArchiveToggle,
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
  onArchiveToggle: () => void
}) {
  const commonSummary = formatPluginScopeSummary(item)
  const archived = item.archived === true
  const [showActions, setShowActions] = useState(false)
  const detailLines = item.kind === 'guardrail'
    ? [
        item.appliesTo.agents.length > 0 ? `Agents: ${item.appliesTo.agents.join(', ')}` : '',
        item.appliesTo.workflows.length > 0 ? `Workflows: ${item.appliesTo.workflows.join(', ')}` : '',
        item.appliesTo.groups.length > 0 ? `Groups: ${item.appliesTo.groups.join(', ')}` : '',
        item.appliesTo.communities.length > 0 ? `Communities: ${item.appliesTo.communities.join(', ')}` : '',
        item.controls.allowedSkills.length > 0 ? `Allowed skills: ${item.controls.allowedSkills.join(', ')}` : '',
      ].filter(Boolean)
    : [
        `Target type: ${item.target.type}`,
        item.target.ids.length > 0 ? `Targets: ${item.target.ids.join(', ')}` : '',
        `Judge: ${item.experiment.judge === 'ai' ? 'AI placeholder' : 'Fixed heuristic'}`,
        item.experiment.input ? `Input: ${item.experiment.input}` : '',
        item.experiment.expectedOutput ? `Expected: ${item.experiment.expectedOutput}` : '',
      ].filter(Boolean)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              {item.kind === 'guardrail' ? 'Guardrail' : 'Eval'}
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
            className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass} h-9 px-2.5`}
            aria-label="Open plugin item actions"
          >
            <PluginActionGlyph plugin={plugin} />
            Actions
            <span className="text-xs">▾</span>
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
                  <ProductIconCell iconName="status" label="Toggle" size="sm" className="border-transparent bg-transparent text-current" />
                  {item.enabled ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => { setShowActions(false); onArchiveToggle() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <ProductIconCell iconName={archived ? 'restore' : 'archive'} label={archived ? 'Restore' : 'Archive'} size="sm" className="border-transparent bg-transparent text-current" />
                  {archived ? 'Restore' : 'Archive'}
                </button>
                <button onClick={() => { setShowActions(false); onGenerateDoc() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <ProductIconCell iconName="docs" label="Generate Doc" size="sm" className="border-transparent bg-transparent text-current" />
                  Generate Doc
                </button>
                <button onClick={() => { setShowActions(false); onNotify() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                  <ProductIconCell iconName="communication" label="Notify" size="sm" className="border-transparent bg-transparent text-current" />
                  Notify
                </button>
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
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onOpenDoc || undefined}
          disabled={!onOpenDoc}
          className={`${headerSecondaryButtonClass} h-10 ${onOpenDoc ? headerSecondaryButtonIdleClass : 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-600'}`}
        >
          <ProductIconCell iconName="docs" label="Open Doc" size="sm" className="border-transparent bg-transparent text-current" />
          Open Doc
        </button>
        <button
          onClick={onGenerateDoc}
          className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass} h-10`}
        >
          <ProductIconCell iconName="docs" label="Generate Doc" size="sm" className="border-transparent bg-transparent text-current" />
          Generate Doc
        </button>
        {onRun && (
          <button onClick={onRun} className={`${headerPrimaryButtonClass} h-10`}>
            <ProductIconCell iconName="play" label="Run Eval" size="sm" className="border-white/20 bg-white/10 text-white" />
            Run Eval
          </button>
        )}
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

function CompactItemCard({
  item,
  selected,
  onOpen,
  onToggleActions,
}: {
  item: PluginRecord
  selected: boolean
  onOpen: () => void
  onToggleActions: () => void
}) {
  const archived = item.archived === true
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
      <div className="mt-3 flex items-center gap-4 text-gray-300 dark:text-gray-500">
        <ProductIconCell iconName={item.kind === 'eval' ? 'play' : 'status'} label="Type" size="sm" className="border-transparent bg-transparent text-current" />
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
}: {
  plugin: PluginManifest
  item: PluginRecord
  onClose: () => void
  onEdit: () => void
  onGenerateDoc: () => void
  onOpenDoc: (() => void) | null
  onNotify: () => void
  onToggle: () => void
  onArchiveToggle: () => void
  onDelete: () => void
  onRun: (() => void) | null
}) {
  const archived = item.archived === true
  const files = item.document?.path ? [item.document.path] : []
  const detailLines = item.kind === 'guardrail'
    ? [
        `Agents: ${item.appliesTo.agents.length > 0 ? item.appliesTo.agents.join(', ') : 'none'}`,
        `Workflows: ${item.appliesTo.workflows.length > 0 ? item.appliesTo.workflows.join(', ') : 'none'}`,
        `Groups: ${item.appliesTo.groups.length > 0 ? item.appliesTo.groups.join(', ') : 'none'}`,
        `Communities: ${item.appliesTo.communities.length > 0 ? item.appliesTo.communities.join(', ') : 'none'}`,
        `Allowed skills: ${item.controls.allowedSkills.length > 0 ? item.controls.allowedSkills.join(', ') : 'none'}`,
        `Block email: ${item.controls.blockEmail ? 'yes' : 'no'}`,
        `Block web: ${item.controls.blockWeb ? 'yes' : 'no'}`,
        `Block external docs: ${item.controls.blockExternalDocs ? 'yes' : 'no'}`,
      ]
    : [
        `Target type: ${item.target.type}`,
        `Targets: ${item.target.ids.length > 0 ? item.target.ids.join(', ') : 'none'}`,
        `Judge: ${item.experiment.judge === 'ai' ? 'AI placeholder' : 'Fixed heuristic'}`,
        `Input: ${item.experiment.input || 'none'}`,
        `Candidate output: ${item.experiment.candidateOutput || 'none'}`,
        `Expected output: ${item.experiment.expectedOutput || 'none'}`,
        `Runs: ${item.runs.length}`,
      ]

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
              {item.kind === 'guardrail' ? 'Guardrail' : 'Eval'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${archived ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : item.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
              {archived ? 'Archived' : item.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="h-9 w-9 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-lg leading-none"
          title="Close details"
        >
          <ProductIconCell iconName="close" label="Close" size="sm" className="border-transparent bg-transparent text-current" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 sm:px-5">
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
                onClick={() => onOpenDoc?.()}
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

        {item.kind === 'eval' && item.lastRun && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 dark:border-violet-900/40 dark:bg-violet-900/10">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-violet-800 dark:text-violet-300">Latest score</div>
              <div className="text-lg font-semibold text-violet-700 dark:text-violet-200">{item.lastRun.score}/100</div>
            </div>
            <p className="mt-1 text-sm text-violet-700/80 dark:text-violet-300/80">{item.lastRun.summary}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button onClick={onEdit} className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}>
            <ProductIconCell iconName="edit" label="Edit" size="sm" className="border-transparent bg-transparent text-current" />
            Edit
          </button>
          <button onClick={onToggle} className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}>
            <ProductIconCell iconName="status" label="Toggle" size="sm" className="border-transparent bg-transparent text-current" />
            {item.enabled ? 'Disable' : 'Enable'}
          </button>
          <button onClick={onArchiveToggle} className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}>
            <ProductIconCell iconName={archived ? 'restore' : 'archive'} label={archived ? 'Restore' : 'Archive'} size="sm" className="border-transparent bg-transparent text-current" />
            {archived ? 'Restore' : 'Archive'}
          </button>
          <button onClick={onGenerateDoc} className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}>
            <ProductIconCell iconName="docs" label="Generate Doc" size="sm" className="border-transparent bg-transparent text-current" />
            Generate Doc
          </button>
          <button onClick={onNotify} className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}>
            <ProductIconCell iconName="communication" label="Notify" size="sm" className="border-transparent bg-transparent text-current" />
            Notify
          </button>
          {onRun && (
            <button onClick={onRun} className={headerPrimaryButtonClass}>
              <ProductIconCell iconName="play" label="Run Eval" size="sm" className="border-white/20 bg-white/10 text-white" />
              Run Eval
            </button>
          )}
          <button onClick={onDelete} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300 dark:hover:bg-red-900/20">
            <ProductIconCell iconName="delete" label="Delete" size="sm" className="border-transparent bg-transparent text-current" />
            Delete
          </button>
        </div>
      </div>
      </aside>
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
  const [archiveTab, setArchiveTab] = useState<ArchiveTab>('active')
  const [viewMode, setViewMode] = useState<PluginViewMode>('grid')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PluginRecord | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [showPageActions, setShowPageActions] = useState(false)
  const [activeCompactActions, setActiveCompactActions] = useState<string | null>(null)

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
      const archived = item.archived === true
      if (archiveTab === 'active' && archived) return false
      if (archiveTab === 'archived' && !archived) return false
      if (selectedTag !== 'all' && !item.tags.includes(selectedTag)) return false
      if (statusFilter === 'enabled' && !item.enabled) return false
      if (statusFilter === 'disabled' && item.enabled) return false
      return matchesPluginSearch(item, search)
    }),
    [items, search, selectedTag, statusFilter, archiveTab]
  )
  const recommendedTemplates = useMemo(() => templates.filter((entry) => entry.recommended !== false), [templates])
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

  useEffect(() => {
    if (selectedItemId && !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null)
    }
  }, [items, selectedItemId])

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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{plugin.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
            {filtered.length} shown
            <span className="text-gray-300">·</span>
            <span>workspace-scoped</span>
            <span className="text-gray-300">·</span>
            <span>v{plugin.version}</span>
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{plugin.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
            <button
              onClick={() => setViewMode('grid')}
              title="Grid view (compact)"
              className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'grid' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <ProductIconCell iconName="grid" label="Grid view" size="sm" className="border-transparent bg-transparent text-current" />
            </button>
            <button
              onClick={() => setViewMode('detail')}
              title="Detail view"
              className={`px-2.5 py-1.5 text-xs transition-colors border-l border-gray-200 dark:border-gray-700 ${viewMode === 'detail' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <ProductIconCell iconName="docs" label="Detail view" size="sm" className="border-transparent bg-transparent text-current" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="List view"
              className={`px-2.5 py-1.5 text-xs transition-colors border-l border-gray-200 dark:border-gray-700 ${viewMode === 'table' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <ProductIconCell iconName="list" label="List view" size="sm" className="border-transparent bg-transparent text-current" />
            </button>
          </div>
          <button
            onClick={() => { setEditing(null); setShowModal(true) }}
            className={headerPrimaryButtonClass}
          >
            <ProductIconCell iconName="create" label="Create" size="sm" className="border-white/20 bg-white/10 text-white" />
            Create
          </button>
          <div className="relative">
            <button
              onClick={() => setShowPageActions((current) => !current)}
              className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}
            >
              <PluginActionGlyph plugin={plugin} />
              Actions <span className="text-xs">▾</span>
            </button>
            {showPageActions && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowPageActions(false)} />
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  <button
                    onClick={() => { setShowPageActions(false); void load() }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
                  >
                    <ProductIconCell iconName="refresh" label="Refresh" size="sm" className="border-transparent bg-transparent text-current" />
                    Refresh
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="inline-flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setArchiveTab('active')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              archiveTab === 'active'
                ? 'bg-sky-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setArchiveTab('archived')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              archiveTab === 'archived'
                ? 'bg-sky-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Archived ({archivedCount})
          </button>
        </div>
      </div>

      <div className="mb-4">
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
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">Filter by tags:</span>
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
        <div className={`mt-6 ${selectedItem ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6' : ''}`}>
          <div>
            {viewMode === 'grid' ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {filtered.map((item) => (
                  <div key={item.id} className="relative">
                    <CompactItemCard
                      item={item}
                      selected={selectedItemId === item.id}
                      onOpen={() => setSelectedItemId(item.id)}
                      onToggleActions={() => setActiveCompactActions((current) => current === item.id ? null : item.id)}
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
                            <ProductIconCell iconName="status" label="Toggle" size="sm" className="border-transparent bg-transparent text-current" />
                            {item.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => { setActiveCompactActions(null); void saveItem({ ...item, archived: item.archived !== true } as Partial<PluginRecord>) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                            <ProductIconCell iconName={item.archived ? 'restore' : 'archive'} label={item.archived ? 'Restore' : 'Archive'} size="sm" className="border-transparent bg-transparent text-current" />
                            {item.archived ? 'Restore' : 'Archive'}
                          </button>
                          <button onClick={() => { setActiveCompactActions(null); void callItemAction(item.id, 'document') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                            <ProductIconCell iconName="docs" label="Generate Doc" size="sm" className="border-transparent bg-transparent text-current" />
                            Generate Doc
                          </button>
                          <button onClick={() => { setActiveCompactActions(null); void callItemAction(item.id, 'notify') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                            <ProductIconCell iconName="communication" label="Notify" size="sm" className="border-transparent bg-transparent text-current" />
                            Notify
                          </button>
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
                      onRun={item.kind === 'eval' ? (() => void callItemAction(item.id, 'run')) : null}
                      onOpenDoc={item.document?.path && onNavigateToDoc ? (() => onNavigateToDoc(item.document!.path)) : null}
                      onArchiveToggle={() => void saveItem({ ...item, archived: item.archived !== true } as Partial<PluginRecord>)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="grid grid-cols-[minmax(0,2fr)_120px_minmax(0,2fr)_140px_120px] gap-3 border-b border-gray-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <div>Name</div>
                  <div>Status</div>
                  <div>Scope</div>
                  <div>Updated</div>
                  <div>Actions</div>
                </div>
                {filtered.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`grid cursor-pointer grid-cols-[minmax(0,2fr)_120px_minmax(0,2fr)_140px_120px] gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0 dark:border-gray-700/60 ${
                      selectedItemId === item.id ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900 dark:text-gray-100">{item.name}</div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">{item.description || item.id}</div>
                    </div>
                    <div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${item.archived ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : item.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                        {item.archived ? 'Archived' : item.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="truncate text-gray-600 dark:text-gray-300">{formatPluginScopeSummary(item)}</div>
                    <div className="text-gray-500 dark:text-gray-400">{formatPluginUpdatedAt(item)}</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(event) => { event.stopPropagation(); setSelectedItemId(item.id) }}
                        className="text-gray-300 hover:text-sky-500 transition-colors text-xs p-1 rounded hover:bg-sky-50 dark:hover:bg-sky-900/30"
                        title="Open details"
                      >
                        <ProductIconCell iconName="details" label="Open details" size="sm" className="border-transparent bg-transparent text-current" />
                      </button>
                      <button
                        onClick={(event) => { event.stopPropagation(); void callItemAction(item.id, 'document') }}
                        className="text-gray-300 hover:text-purple-500 transition-colors text-xs p-1 rounded hover:bg-purple-50 dark:hover:bg-purple-900/30"
                        title="Generate document"
                      >
                        <ProductIconCell iconName="docs" label="Generate document" size="sm" className="border-transparent bg-transparent text-current" />
                      </button>
                      <button
                        onClick={(event) => { event.stopPropagation(); void callItemAction(item.id, 'notify') }}
                        className="text-gray-300 hover:text-emerald-500 transition-colors text-xs p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                        title="Notify"
                      >
                        <ProductIconCell iconName="communication" label="Notify" size="sm" className="border-transparent bg-transparent text-current" />
                      </button>
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
                onOpenDoc={selectedItem.document?.path && onNavigateToDoc ? (() => onNavigateToDoc(selectedItem.document!.path)) : null}
                onNotify={() => void callItemAction(selectedItem.id, 'notify')}
                onToggle={() => void callItemAction(selectedItem.id, 'toggle')}
                onArchiveToggle={() => void saveItem({ ...selectedItem, archived: selectedItem.archived !== true } as Partial<PluginRecord>)}
                onDelete={() => void callItemAction(selectedItem.id, 'delete')}
                onRun={selectedItem.kind === 'eval' ? (() => void callItemAction(selectedItem.id, 'run')) : null}
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
    </div>
  )
}
