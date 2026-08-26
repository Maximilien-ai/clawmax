/**
 * Plugin system contract test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/plugin-system.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'
import { createWorkflow } from './workflows'
import { getActiveNotifications } from './notifications'
import {
  applyPluginTemplate,
  clearPluginTemplateCache,
  deletePluginRecord,
  emitPluginRecordNotification,
  enforcePluginGuardrails,
  evaluatePluginGuardrails,
  generatePluginRecordDocument,
  getPluginBySlug,
  getPluginDiagnosticsReport,
  getPluginSettingsInventory,
  getAgentLifecycleEvidence,
  getWorkflowLifecycleEvidence,
  getCommunicationLifecycleEvidence,
  getPluginWorkspaceContext,
  listConfiguredPlugins,
  listPluginRelationships,
  listPluginRecords,
  listPluginTemplates,
  PluginContractError,
  runPluginEval,
  upsertPluginRecord,
  updatePluginSettings,
} from './plugin-system'
import { resetWorkspaceManagerForTests } from './workspace-manager'
import { recordAgentLifecycleAuditEvent } from './agent-lifecycle-audit'
import { addMessage } from './messages'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalWorkspace = process.env.OPENCLAW_WORKSPACE
const originalHome = process.env.HOME
const originalTestWorkspace = process.env.CLAWMAX_TEST_WORKSPACE
const originalEnabledPlugins = process.env.CLAWMAX_ENABLED_PLUGINS
const originalDisableDefaultPlugins = process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
const originalPluginPaths = process.env.CLAWMAX_PLUGIN_PATHS
const originalPluginSettingsPath = process.env.CLAWMAX_PLUGIN_SETTINGS_PATH
const originalEnableTestPlugins = process.env.CLAWMAX_ENABLE_TEST_PLUGINS

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    })
    .catch((err: any) => {
      console.log(`${RED}✗${RESET} ${name}`)
      console.error(`  Error: ${err.message}`)
      testsFailed++
    })
}

function seedWorkspaceFiles(workspaceRoot: string, homeRoot: string) {
  fs.mkdirSync(path.join(workspaceRoot, 'AGENTS', 'analyst'), { recursive: true })
  fs.mkdirSync(path.join(workspaceRoot, 'WORKFLOWS'), { recursive: true })
  fs.mkdirSync(path.join(workspaceRoot, 'ORG'), { recursive: true })
  fs.mkdirSync(path.join(homeRoot, '.openclaw', 'agents', 'analyst', 'agent'), { recursive: true })
  fs.mkdirSync(path.join(homeRoot, '.openclaw', 'agents', 'analyst', 'sessions'), { recursive: true })
  fs.mkdirSync(path.join(homeRoot, '.openclaw'), { recursive: true })

  fs.writeFileSync(path.join(workspaceRoot, 'AGENTS', 'analyst', 'IDENTITY.md'), [
    '# IDENTITY.md - Who Am I?',
    '- **Name:** Analyst',
    '- **Creature:** assistant',
    '- **Vibe:** focused',
  ].join('\n'), 'utf-8')

  fs.writeFileSync(path.join(workspaceRoot, 'ORG', 'GROUPS.md'), [
    '# Groups',
    '',
    '## Research Ops',
    '',
    '- Members: analyst',
  ].join('\n'), 'utf-8')

  fs.writeFileSync(path.join(workspaceRoot, 'ORG', 'COMMUNITIES.md'), [
    '# Communities',
    '',
    '## Research',
    '',
    '- Groups: Research Ops',
  ].join('\n'), 'utf-8')

  fs.writeFileSync(path.join(homeRoot, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        {
          id: 'analyst',
          workspace: path.join(workspaceRoot, 'AGENTS', 'analyst'),
          model: 'openai/gpt-5.4-mini',
        },
      ],
    },
  }, null, 2), 'utf-8')

  fs.writeFileSync(path.join(workspaceRoot, 'AGENTS', 'analyst', 'NOTES.md'), '# Notes\nLifecycle evidence.\n', 'utf-8')
  fs.writeFileSync(path.join(homeRoot, '.openclaw', 'agents', 'analyst', 'sessions', 'dashboard-chat.jsonl'), [
    JSON.stringify({ type: 'message', message: { role: 'user', content: 'Hello' } }),
    JSON.stringify({ type: 'message', message: { role: 'assistant', content: 'Hi' } }),
  ].join('\n'), 'utf-8')
  fs.writeFileSync(path.join(homeRoot, '.openclaw', 'agents', 'analyst', 'sessions', 'sessions.json'), JSON.stringify({
    'agent:analyst:dashboard-chat': { sessionId: 'dashboard-chat', model: 'openai/gpt-4o-mini', updatedAt: Date.now() },
  }, null, 2), 'utf-8')

  const createdWorkflow = createWorkflow({
    name: 'Research Sweep',
    description: 'Collect and summarize workspace findings',
    schedule: 'manual',
    content: '# Research\nSummarize findings.',
    executionMode: 'automated',
    targeting: { agents: ['analyst'], groups: ['Research Ops'], tags: [], communities: ['Research'] },
  })
  if (createdWorkflow.id) {
    const executionDir = path.join(workspaceRoot, 'WORKFLOWS', 'executions', createdWorkflow.id)
    fs.mkdirSync(executionDir, { recursive: true })
    fs.writeFileSync(path.join(executionDir, 'run-1.json'), JSON.stringify({
      id: 'run-1',
      workflowId: createdWorkflow.id,
      startedAt: '2026-08-01T10:00:00.000Z',
      completedAt: '2026-08-01T10:05:00.000Z',
      status: 'completed',
      triggerType: 'manual',
      participants: [{ agentId: 'analyst', agentName: 'Analyst', status: 'completed' }],
      logs: [],
    }, null, 2), 'utf-8')
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Plugin System Contract Suite ===${RESET}\n`)

  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-plugin-system-workspace-'))
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-plugin-system-home-'))

  process.env.OPENCLAW_WORKSPACE = tempWorkspace
  process.env.CLAWMAX_TEST_WORKSPACE = tempWorkspace
  process.env.HOME = tempHome
  process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-evals,plugin-guardrails,plugin-resource-plans,clawmax-lifecycle,plugin-review-notes'
  process.env.CLAWMAX_PLUGIN_PATHS = ''
  process.env.CLAWMAX_PLUGIN_SETTINGS_PATH = path.join(tempHome, 'plugin-settings.json')
  process.env.CLAWMAX_ENABLE_TEST_PLUGINS = 'true'
  delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
  resetWorkspaceManagerForTests()
  seedWorkspaceFiles(tempWorkspace, tempHome)

  await test('plugin settings inventory lists manageable plugins but excludes test fixtures', () => {
    const inventory = getPluginSettingsInventory()
    assert(inventory.some((plugin) => plugin.slug === 'clawmax-lifecycle'), 'Expected Lifecycle in settings inventory')
    assert(inventory.some((plugin) => plugin.slug === 'plugin-review-notes'), 'Expected Review in settings inventory')
    assert(!inventory.some((plugin) => plugin.slug === 'plugin-evals'), 'Expected synthetic fixtures to be excluded')
  })

  await test('normal development discovery excludes synthetic plugins even when stale settings request them', () => {
    process.env.CLAWMAX_ENABLE_TEST_PLUGINS = 'false'
    process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-evals,plugin-guardrails,clawmax-lifecycle,plugin-review-notes'
    const slugs = listConfiguredPlugins().map((plugin) => plugin.slug)
    assert(!slugs.includes('plugin-evals') && !slugs.includes('plugin-guardrails'), 'Expected synthetic Evals and Guardrails to stay hidden')
    assert(slugs.includes('clawmax-lifecycle'), 'Expected public Lifecycle to remain available')
    process.env.CLAWMAX_ENABLE_TEST_PLUGINS = 'true'
    process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-evals,plugin-guardrails,plugin-resource-plans,clawmax-lifecycle,plugin-review-notes'
  })

  await test('plugin settings persist an explicit selection including no enabled plugins', () => {
    process.env.CLAWMAX_ENABLED_PLUGINS = 'clawmax-lifecycle,plugin-review-notes'
    let inventory = updatePluginSettings(['clawmax-lifecycle'])
    assert.strictEqual(inventory.find((plugin) => plugin.slug === 'clawmax-lifecycle')?.enabled, true)
    assert.deepStrictEqual(listConfiguredPlugins().map((plugin) => plugin.slug), ['clawmax-lifecycle'])
    const saved = JSON.parse(fs.readFileSync(process.env.CLAWMAX_PLUGIN_SETTINGS_PATH!, 'utf-8'))
    assert.deepStrictEqual(saved.enabledPluginIds, ['clawmax-lifecycle'])

    inventory = updatePluginSettings([])
    assert(inventory.every((plugin) => !plugin.enabled), 'Expected empty explicit selection to disable every plugin')
    assert.deepStrictEqual(listConfiguredPlugins(), [])
    fs.unlinkSync(process.env.CLAWMAX_PLUGIN_SETTINGS_PATH!)
    process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-evals,plugin-guardrails,plugin-resource-plans,clawmax-lifecycle,plugin-review-notes'
  })

  await test('plugin settings preserve configured plugins that are temporarily unavailable', () => {
    process.env.CLAWMAX_ENABLED_PLUGINS = 'clawmax-lifecycle,clawmax-optimize'
    const inventory = updatePluginSettings(['clawmax-lifecycle'])
    assert.strictEqual(inventory.find((plugin) => plugin.slug === 'clawmax-lifecycle')?.enabled, true)
    const saved = JSON.parse(fs.readFileSync(process.env.CLAWMAX_PLUGIN_SETTINGS_PATH!, 'utf-8'))
    assert.deepStrictEqual(saved.enabledPluginIds, ['clawmax-lifecycle', 'clawmax-optimize'])
    fs.unlinkSync(process.env.CLAWMAX_PLUGIN_SETTINGS_PATH!)
    process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-evals,plugin-guardrails,plugin-resource-plans,clawmax-lifecycle,plugin-review-notes'
  })

  await test('plugin settings reject unknown plugin identifiers', () => {
    assert.throws(
      () => updatePluginSettings(['not-installed']),
      (error: any) => error instanceof PluginContractError && error.statusCode === 400 && error.message.includes('not-installed'),
    )
  })

  await test('Lifecycle exposes agent files, conversations, models, and chronological evidence', () => {
    const plugin = getPluginBySlug('clawmax-lifecycle')
    assert(plugin, 'Expected public Lifecycle plugin')
    recordAgentLifecycleAuditEvent('analyst', {
      type: 'modified',
      title: 'Agent configuration changed',
      detail: 'SOUL.md',
    })
    const evidence = getAgentLifecycleEvidence(plugin!, 'analyst')
    assert.strictEqual(evidence.subject.currentModel, 'openai/gpt-5.4-mini')
    assert(evidence.files.some((entry) => entry.path === 'AGENTS/analyst/NOTES.md'), 'Expected associated file metadata')
    assert.strictEqual(evidence.summary.conversationCount, 1)
    assert.strictEqual(evidence.summary.messageCount, 2)
    assert(evidence.modelHistory.some((entry) => entry.model === 'openai/gpt-4o-mini'), 'Expected model observed in session metadata')
    assert(evidence.events.some((entry) => entry.type === 'modified' && entry.detail === 'SOUL.md'), 'Expected explicit dashboard audit history')
    assert(evidence.events.every((entry, index, events) => index === 0 || events[index - 1].at <= entry.at), 'Expected chronological lifecycle events')
  })

  await test('Lifecycle exposes workflow definition, execution, participant, and chronological evidence', () => {
    const plugin = getPluginBySlug('clawmax-lifecycle')
    const workflowId = getPluginWorkspaceContext(plugin!).workflows[0]?.id
    assert(workflowId, 'Expected a seeded workflow')
    const evidence = getWorkflowLifecycleEvidence(plugin!, workflowId)
    assert.strictEqual(evidence.subject.kind, 'workflow')
    assert.strictEqual(evidence.summary.executionCount, 1)
    assert.strictEqual(evidence.summary.participantCount, 1)
    assert(evidence.files.some((entry) => entry.path.endsWith(`${workflowId}.md`)), 'Expected workflow definition metadata')
    assert(evidence.events.some((entry) => entry.type === 'execution'), 'Expected workflow execution events')
    assert(evidence.events.every((entry, index, events) => index === 0 || events[index - 1].at <= entry.at), 'Expected chronological workflow events')
  })

  await test('Lifecycle exposes group and community communication evidence', async () => {
    const plugin = getPluginBySlug('clawmax-lifecycle')
    addMessage('group', 'Research Ops', { from: 'analyst', content: 'Research update', mentions: [] })
    addMessage('community', 'Research', { from: 'User', content: 'Community update', mentions: [] })
    const groupEvidence = await getCommunicationLifecycleEvidence(plugin!, 'group', 'Research Ops')
    const communityEvidence = await getCommunicationLifecycleEvidence(plugin!, 'community', 'Research')
    assert.strictEqual(groupEvidence.subject.kind, 'group')
    assert.strictEqual(groupEvidence.summary.messageCount, 1)
    assert.strictEqual(communityEvidence.subject.kind, 'community')
    assert.strictEqual(communityEvidence.summary.messageCount, 1)
    assert(groupEvidence.events.some((entry) => entry.type === 'conversation'), 'Expected group message timeline event')
    assert(communityEvidence.events.some((entry) => entry.type === 'conversation'), 'Expected community message timeline event')
  })

  await test('host supports zero-plugin mode when default plugins are disabled', () => {
    const previousEnabled = process.env.CLAWMAX_ENABLED_PLUGINS
    const previousDisableDefaults = process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
    delete process.env.CLAWMAX_ENABLED_PLUGINS
    process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS = 'true'
    const plugins = listConfiguredPlugins()
    assert.strictEqual(plugins.length, 0, 'Expected no plugins to load by default')
    const report = getPluginDiagnosticsReport()
    assert.strictEqual(report.healthy, true, 'Expected disabled plugins to preserve a healthy zero-plugin host')
    assert.strictEqual(report.summary.loaded, 0, 'Expected zero loaded plugins')
    if (typeof previousEnabled === 'undefined') delete process.env.CLAWMAX_ENABLED_PLUGINS
    else process.env.CLAWMAX_ENABLED_PLUGINS = previousEnabled
    if (typeof previousDisableDefaults === 'undefined') delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
    else process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS = previousDisableDefaults
  })

  await test('configured plugins expose manifests in sidebar order', () => {
    const plugins = listConfiguredPlugins()
    assert(plugins.length >= 5, 'Expected synthetic host fixtures plus public Lifecycle and Review plugins')
    assert.strictEqual(plugins[0]?.slug, 'plugin-evals', 'Expected Evals to be the first default plugin')
    assert.strictEqual(plugins[1]?.slug, 'plugin-guardrails', 'Expected Guardrails to appear second')
    assert.strictEqual(plugins[2]?.slug, 'plugin-resource-plans', 'Expected the synthetic resource-plan adapter fixture')
    assert.strictEqual(plugins[3]?.slug, 'clawmax-lifecycle', 'Expected public Lifecycle before Review')
    assert.strictEqual(plugins[4]?.slug, 'plugin-review-notes', 'Expected Review to be the final default plugin')
    assert.strictEqual(plugins[4]?.apiVersion, 'clawmax.ai/v2', 'Expected generic plugin to declare the v2 host API')
    assert.strictEqual(plugins[4]?.objectKind, 'review-note', 'Expected a non-core object kind to load')
    assert.deepStrictEqual(plugins.map((plugin) => plugin.nav?.label), ['Evals', 'Guardrails', 'Resources', 'Lifecycle', 'Review'], 'Expected compact plugin navigation labels')
    assert.strictEqual(plugins[4]?.ui?.list?.groupBy, 'release', 'Expected release checklist grouping metadata')
    assert.strictEqual(plugins[4]?.ui?.list?.checkField, 'completed', 'Expected release checklist completion metadata')
    assert([plugins[0], plugins[1], plugins[2]].every((plugin) => plugin.visibility === 'private'), 'Expected synthetic fixtures to remain private')
    assert([plugins[3], plugins[4]].every((plugin) => plugin.visibility === 'public'), 'Expected Lifecycle and Review to remain public')
    assert(plugins.every((plugin) => plugin.nav?.section === 'plugins'), 'Expected plugins to target the plugin nav section')
    assert(plugins.every((plugin) => plugin.capabilities?.docs), 'Expected every configured plugin to declare document access')
    assert.strictEqual(plugins[3]?.capabilities?.notifications, undefined, 'Expected Lifecycle to remain read-only and notification-free')
  })

  await test('plugin suggestions are cached until an explicit refresh', () => {
    const plugin = getPluginBySlug('plugin-guardrails')
    assert(plugin, 'Expected guardrails test plugin manifest to load')
    clearPluginTemplateCache(plugin!)

    const originalReadFileSync = fs.readFileSync
    let templateReads = 0
    ;(fs as any).readFileSync = (...args: any[]) => {
      const filePath = String(args[0] || '')
      if (filePath.includes(`${path.sep}templates${path.sep}`) && filePath.endsWith('.json')) {
        templateReads++
      }
      return (originalReadFileSync as any).apply(fs, args)
    }

    try {
      assert(listPluginTemplates(plugin!).length > 0, 'Expected suggestions on the first read')
      const readsAfterFirstLoad = templateReads
      assert(readsAfterFirstLoad > 0, 'Expected the first load to read suggestion files')
      assert(listPluginTemplates(plugin!).length > 0, 'Expected cached suggestions on the second read')
      assert.strictEqual(templateReads, readsAfterFirstLoad, 'Expected cached suggestions to avoid repeated file reads')
      assert(listPluginTemplates(plugin!, { forceRefresh: true }).length > 0, 'Expected forced suggestion refresh')
      assert(templateReads > readsAfterFirstLoad, 'Expected forced refresh to reread suggestion files')
    } finally {
      ;(fs as any).readFileSync = originalReadFileSync
      clearPluginTemplateCache(plugin!)
    }
  })

  await test('plugin paths can point directly at a standalone plugin repo root', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-direct-plugin-root-'))
    const previousEnabled = process.env.CLAWMAX_ENABLED_PLUGINS
    const previousPluginPaths = process.env.CLAWMAX_PLUGIN_PATHS
    const previousDisableDefaults = process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS

    fs.writeFileSync(path.join(repoRoot, 'clawmax-plugin.json'), JSON.stringify({
      id: 'standalone-memory-plugin',
      slug: 'standalone-memory-plugin',
      name: 'Standalone Memory Plugin',
      description: 'Loads from a direct repo root path.',
      version: '0.1.0-mvp0',
      icon: 'database',
      objectKind: 'guardrail',
      visibility: 'private',
      enabledByDefault: false,
      source: {
        type: 'github',
        owner: 'example',
        repo: 'standalone-memory-plugin',
        url: 'https://example.invalid/standalone-memory-plugin',
        branch: 'main',
      },
      nav: {
        section: 'plugins',
        order: 30,
      },
      capabilities: {
        notifications: true,
        docs: true,
        agents: true,
        workflows: true,
        communications: true,
      },
      labels: {
        singular: 'Memory Rule',
        plural: 'Memory Rules',
      },
    }, null, 2), 'utf-8')

    process.env.CLAWMAX_PLUGIN_PATHS = repoRoot
    process.env.CLAWMAX_ENABLED_PLUGINS = 'standalone-memory-plugin'
    delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS

    const plugins = listConfiguredPlugins()
    assert(plugins.some((plugin) => plugin.slug === 'standalone-memory-plugin'), 'Expected standalone repo root plugin to load')

    fs.rmSync(repoRoot, { recursive: true, force: true })
    if (typeof previousEnabled === 'undefined') delete process.env.CLAWMAX_ENABLED_PLUGINS
    else process.env.CLAWMAX_ENABLED_PLUGINS = previousEnabled
    if (typeof previousPluginPaths === 'undefined') delete process.env.CLAWMAX_PLUGIN_PATHS
    else process.env.CLAWMAX_PLUGIN_PATHS = previousPluginPaths
    if (typeof previousDisableDefaults === 'undefined') delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
    else process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS = previousDisableDefaults
  })

  await test('host rejects unsupported API versions and incomplete v2 manifests', () => {
    const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-invalid-plugin-root-'))
    const previousEnabled = process.env.CLAWMAX_ENABLED_PLUGINS
    const previousPluginPaths = process.env.CLAWMAX_PLUGIN_PATHS
    const baseManifest = {
      name: 'Invalid plugin',
      description: 'Must not load.',
      version: '0.2.0',
      icon: 'docs',
      objectKind: 'review-note',
      visibility: 'private',
      source: { type: 'github', owner: 'example', repo: 'invalid', url: 'https://example.invalid/invalid' },
    }
    for (const [slug, extra] of [
      ['future-version-plugin', { apiVersion: 'clawmax.ai/v99', recordSchema: { type: 'object', properties: {} } }],
      ['missing-schema-plugin', { apiVersion: 'clawmax.ai/v2' }],
      ['invalid-capability-plugin', { apiVersion: 'clawmax.ai/v2', capabilities: { shell: true }, recordSchema: { type: 'object', properties: {} } }],
      ['invalid-slider-plugin', { apiVersion: 'clawmax.ai/v2', recordSchema: { type: 'object', properties: { budget: { type: 'number', title: 'Budget', control: 'slider' } } } }],
      ['ungranted-monitor-plugin', {
        apiVersion: 'clawmax.ai/v2',
        recordSchema: { type: 'object', properties: {
          scope: { type: 'string', title: 'Scope' }, targets: { type: 'array', title: 'Targets', items: { type: 'string' } },
          tokenBudget: { type: 'integer', title: 'Token budget' }, costBudget: { type: 'number', title: 'Cost budget' },
          tokens: { type: 'integer', title: 'Tokens' }, cost: { type: 'number', title: 'Cost' },
          state: { type: 'string', title: 'State' }, summary: { type: 'string', title: 'Summary' },
          last: { type: 'string', title: 'Last' }, next: { type: 'string', title: 'Next' },
        } },
        usageMonitoring: { kind: 'metering-budget', intervalMinutes: 15, fields: {
          scope: 'scope', targetIds: 'targets', tokenBudget: 'tokenBudget', costBudget: 'costBudget',
          currentTokens: 'tokens', currentCost: 'cost', state: 'state', summary: 'summary',
          lastAssessedAt: 'last', nextAssessmentAt: 'next',
        } },
      }],
    ] as const) {
      const directory = path.join(pluginRoot, slug)
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(path.join(directory, 'clawmax-plugin.json'), JSON.stringify({ ...baseManifest, ...extra, id: slug, slug }, null, 2), 'utf-8')
    }
    process.env.CLAWMAX_PLUGIN_PATHS = pluginRoot
    process.env.CLAWMAX_ENABLED_PLUGINS = 'future-version-plugin,missing-schema-plugin,invalid-slider-plugin,ungranted-monitor-plugin'
    assert.deepStrictEqual(listConfiguredPlugins(), [], 'Expected incompatible manifests to be excluded')

    fs.rmSync(pluginRoot, { recursive: true, force: true })
    if (typeof previousEnabled === 'undefined') delete process.env.CLAWMAX_ENABLED_PLUGINS
    else process.env.CLAWMAX_ENABLED_PLUGINS = previousEnabled
    if (typeof previousPluginPaths === 'undefined') delete process.env.CLAWMAX_PLUGIN_PATHS
    else process.env.CLAWMAX_PLUGIN_PATHS = previousPluginPaths
  })

  await test('plugin diagnostics retain invalid, incompatible, duplicate, disabled, and missing outcomes', () => {
    const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-plugin-diagnostics-root-'))
    const missingRoot = path.join(pluginRoot, 'missing-mount')
    const previousEnabled = process.env.CLAWMAX_ENABLED_PLUGINS
    const previousPluginPaths = process.env.CLAWMAX_PLUGIN_PATHS
    const previousDisableDefaults = process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
    const baseManifest = {
      apiVersion: 'clawmax.ai/v2',
      name: 'Diagnostics plugin',
      description: 'Exercises host diagnostics.',
      version: '2.0.0',
      icon: 'plugin',
      objectKind: 'diagnostic-note',
      visibility: 'public',
      source: { type: 'github', owner: 'example', repo: 'diagnostics', url: 'https://example.invalid/diagnostics' },
      recordSchema: { type: 'object', properties: { note: { type: 'string', title: 'Note' } } },
    }
    const writeManifest = (directoryName: string, manifest: Record<string, any> | string) => {
      const directory = path.join(pluginRoot, directoryName)
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(
        path.join(directory, 'clawmax-plugin.json'),
        typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2),
        'utf-8'
      )
    }

    try {
      writeManifest('alpha', { ...baseManifest, id: 'alpha', slug: 'alpha', name: 'Alpha' })
      writeManifest('alpha-copy', { ...baseManifest, id: 'alpha', slug: 'alpha', name: 'Alpha duplicate' })
      writeManifest('beta', { ...baseManifest, id: 'beta', slug: 'beta', name: 'Beta' })
      writeManifest('broken-json', '{not json')
      writeManifest('future', { ...baseManifest, id: 'future', slug: 'future', apiVersion: 'clawmax.ai/v99' })
      writeManifest('invalid-v2', { ...baseManifest, id: 'invalid-v2', slug: 'invalid-v2', recordSchema: undefined })

      process.env.CLAWMAX_PLUGIN_PATHS = `${pluginRoot}${path.delimiter}${missingRoot}`
      process.env.CLAWMAX_ENABLED_PLUGINS = 'alpha,not-mounted'
      delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS

      const report = getPluginDiagnosticsReport()
      assert.strictEqual(report.healthy, false, 'Expected actionable plugin failures to make diagnostics unhealthy')
      assert(report.diagnostics.some((entry) => entry.pluginId === 'alpha' && entry.status === 'loaded'), 'Expected one duplicate identity to load')
      assert(report.diagnostics.some((entry) => entry.pluginId === 'alpha' && entry.status === 'duplicate'), 'Expected duplicate identity diagnostic')
      assert(report.diagnostics.some((entry) => entry.pluginId === 'beta' && entry.status === 'disabled'), 'Expected disabled plugin diagnostic')
      assert(report.diagnostics.some((entry) => entry.pluginId === 'broken-json' && entry.status === 'invalid'), 'Expected invalid JSON diagnostic')
      assert(report.diagnostics.some((entry) => entry.pluginId === 'future' && entry.status === 'incompatible'), 'Expected unsupported API diagnostic')
      assert(report.diagnostics.some((entry) => entry.pluginId === 'invalid-v2' && entry.status === 'invalid'), 'Expected incomplete v2 diagnostic')
      assert(report.diagnostics.some((entry) => entry.pluginId === 'not-mounted' && entry.status === 'missing'), 'Expected explicitly enabled missing plugin diagnostic')
      assert(report.diagnostics.some((entry) => entry.path === missingRoot && entry.status === 'missing'), 'Expected missing configured path diagnostic')
      assert.strictEqual(listConfiguredPlugins().filter((plugin) => plugin.slug === 'alpha').length, 1, 'Expected duplicate plugins to load only once')
    } finally {
      fs.rmSync(pluginRoot, { recursive: true, force: true })
      if (typeof previousEnabled === 'undefined') delete process.env.CLAWMAX_ENABLED_PLUGINS
      else process.env.CLAWMAX_ENABLED_PLUGINS = previousEnabled
      if (typeof previousPluginPaths === 'undefined') delete process.env.CLAWMAX_PLUGIN_PATHS
      else process.env.CLAWMAX_PLUGIN_PATHS = previousPluginPaths
      if (typeof previousDisableDefaults === 'undefined') delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
      else process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS = previousDisableDefaults
    }
  })

  await test('guardrail plugin records persist, enforce outbound email, generate docs, and emit notifications', () => {
    const plugin = getPluginBySlug('plugin-guardrails')
    assert(plugin, 'Expected guardrails test plugin manifest to load')

    const created = upsertPluginRecord(plugin!, {
      name: 'No outbound send',
      description: 'Prevent outbound email and external document sharing',
      tags: ['security', 'email'],
      enabled: true,
      appliesTo: {
        agents: ['analyst'],
        workflows: ['research-sweep'],
        groups: ['Research Ops'],
        communities: ['Research'],
      },
      controls: {
        blockEmail: true,
        blockWeb: false,
        blockExternalDocs: true,
        allowedSkills: ['workspace-ls'],
      },
    } as any)

    assert.strictEqual(created.kind, 'guardrail', 'Expected guardrail record kind')
    assert('history' in created && created.history[0]?.action === 'activated', 'Expected initial activation in guardrail history')
    assert(getActiveNotifications().some((notification) => notification.entityId === created.id && notification.title.includes('activated')), 'Expected guardrail activation notification')
    assert.strictEqual(listPluginRecords(plugin!).length, 1, 'Expected created guardrail to persist')
    const guardrailItemFiles = fs.readdirSync(path.join(tempWorkspace, `SYSTEM/plugins/${plugin!.slug}/items`))
    assert(guardrailItemFiles.some((file) => /^no-outbound-send-[a-z0-9]{8}\.md$/.test(file)), 'Expected readable unique guardrail item file on disk')

    const decision = evaluatePluginGuardrails({ operation: 'outbound-email', agentId: 'analyst' })
    assert.strictEqual(decision.allowed, false, 'Expected outbound email to be denied for the targeted agent')
    assert(decision.guardrails.some((entry) => entry.itemId === created.id), 'Expected denial to identify the enforcing guardrail')
    assert.throws(
      () => enforcePluginGuardrails({ operation: 'outbound-email', agentId: 'analyst' }),
      /Outbound email blocked for agent analyst/,
      'Expected active no-email guardrail to fail closed',
    )
    const enforced = listPluginRecords(plugin!).find((record) => record.id === created.id)
    assert(enforced && 'history' in enforced && enforced.history[0]?.action === 'blocked', 'Expected blocked attempt evidence in guardrail history')
    assert(getActiveNotifications().some((notification) => notification.entityId === created.id && notification.title.includes('outbound email blocked')), 'Expected blocked attempt notification')
    assert.strictEqual(evaluatePluginGuardrails({ operation: 'outbound-email', agentId: 'other-agent' }).allowed, true, 'Expected unrelated agents to remain allowed')

    const archived = upsertPluginRecord(plugin!, { ...created, archived: true } as any)
    assert.strictEqual(archived.archived, true, 'Expected archive flag to persist on plugin records')
    const deactivated = upsertPluginRecord(plugin!, { ...archived, enabled: false } as any)
    assert('history' in deactivated && deactivated.history[0]?.action === 'deactivated', 'Expected deactivation in guardrail history')
    assert(getActiveNotifications().some((notification) => notification.entityId === created.id && notification.title.includes('deactivated')), 'Expected guardrail deactivation notification')

    const withDoc = generatePluginRecordDocument(plugin!, created.id)
    assert(withDoc?.document?.path?.match(new RegExp(`SYSTEM/plugins/${plugin!.slug}/docs/no-outbound-send-[a-z0-9]{8}\\.md$`)), 'Expected readable unique guardrail doc path')
    assert(fs.existsSync(path.join(tempWorkspace, withDoc!.document!.path)), 'Expected generated guardrail doc on disk')
    const generatedDocNotifications = getActiveNotifications().filter((notification) =>
      notification.type === 'artifact-update'
      && notification.entityId === created.id
      && notification.artifactPath === withDoc!.document!.path
    )
    assert.strictEqual(generatedDocNotifications.length, 1, 'Expected generated guardrail doc notification to be recorded once')

    const beforeNotifications = getActiveNotifications().length
    const notified = emitPluginRecordNotification(plugin!, created.id)
    assert.strictEqual(notified?.id, created.id, 'Expected plugin notification to target the guardrail record')
    const matchingNotifications = getActiveNotifications().filter((notification) =>
      notification.type === 'artifact-update'
      && notification.entityId === created.id
      && notification.artifactPath === withDoc!.document!.path
    )
    assert.strictEqual(getActiveNotifications().length, beforeNotifications, 'Expected plugin notifications for the same artifact path to dedupe')
    assert.strictEqual(matchingNotifications.length, 1, 'Expected plugin notification to remain deduped to a single active artifact notification')

    assert(deletePluginRecord(plugin!, created.id), 'Expected delete to remove guardrail record')
    assert.strictEqual(listPluginRecords(plugin!).length, 0, 'Expected no guardrail records after delete')
  })

  await test('renamed plugin storage migrates without losing Review records', () => {
    const plugin = getPluginBySlug('plugin-review-notes')
    assert(plugin, 'Expected public Review plugin manifest to load')
    const pluginsRoot = path.join(tempWorkspace, 'SYSTEM', 'plugins')
    const legacyDir = path.join(pluginsRoot, 'plugin-lab-review-notes')
    const currentDir = path.join(pluginsRoot, 'plugin-review-notes')
    fs.rmSync(currentDir, { recursive: true, force: true })
    fs.mkdirSync(legacyDir, { recursive: true })
    fs.writeFileSync(path.join(legacyDir, 'items.json'), JSON.stringify([{
      id: 'legacy-review',
      kind: 'review-note',
      name: 'Legacy review',
      description: 'Preserve reviewer state',
      tags: ['release'],
      enabled: true,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      fields: { release: '2.0.0-test', area: 'regression', completed: true, outcome: 'passed', notes: '', owner: '', evidence: [], verifiedBy: [] },
    }], null, 2), 'utf-8')

    const records = listPluginRecords(plugin!)
    assert(records.some((record) => record.id === 'legacy-review'), 'Expected legacy Review data to remain readable')
    assert(fs.existsSync(currentDir), 'Expected legacy Review storage to move to the canonical slug')
    assert(!fs.existsSync(legacyDir), 'Expected the legacy storage directory to be retired')
    fs.rmSync(currentDir, { recursive: true, force: true })
  })

  await test('generic v2 plugin validates schema, persists fields, and applies templates', () => {
    const plugin = getPluginBySlug('plugin-review-notes')
    assert(plugin, 'Expected generic review-note plugin manifest to load')

    assert.throws(
      () => upsertPluginRecord(plugin!, { name: 'Invalid review', fields: { release: '', area: 'regression', outcome: 'pending' } } as any),
      (error: unknown) => error instanceof PluginContractError && /Release is required/.test(error.message),
      'Expected required declarative fields to be enforced'
    )

    const created = upsertPluginRecord(plugin!, {
      name: 'Release review',
      description: 'Review release readiness',
      tags: ['release'],
      fields: {
        release: '2.0.0-test-rc4',
        area: 'regression',
        completed: false,
        outcome: 'pending',
        notes: 'Check acceptance evidence',
        owner: 'release-manager',
        evidence: ['CHANGELOG.md'],
        ignoredUnknownField: 'must not persist',
      },
    } as any)
    assert.strictEqual(created.kind, 'review-note', 'Expected arbitrary plugin object kind to persist')
    assert('fields' in created, 'Expected generic record fields')
    assert.strictEqual(created.fields.release, '2.0.0-test-rc4', 'Expected release boundary to persist')
    assert(!('ignoredUnknownField' in created.fields), 'Expected undeclared fields to be discarded')

    const updated = upsertPluginRecord(plugin!, { id: created.id, fields: { completed: true, outcome: 'passed' } } as any)
    assert('fields' in updated, 'Expected generic update result')
    assert.strictEqual(updated.fields.completed, true, 'Expected partial checklist update')
    assert.strictEqual(updated.fields.outcome, 'passed', 'Expected outcome update')
    assert.strictEqual(updated.fields.notes, 'Check acceptance evidence', 'Expected partial update to retain required fields')

    const withDoc = generatePluginRecordDocument(plugin!, created.id)
    assert(withDoc?.document?.path, 'Expected generic document path')
    const documentContent = fs.readFileSync(path.join(tempWorkspace, withDoc!.document!.path), 'utf-8')
    assert(documentContent.includes('**Release:** 2.0.0-test-rc4'), 'Expected release boundary in generated document')
    assert(documentContent.includes('**Completed:** yes'), 'Expected generic checkbox formatting in generated document')

    const releaseTemplates = listPluginTemplates(plugin!).filter((template) => (
      'fields' in template.payload && template.payload.fields?.release === '2.0.0-test-rc45'
    ))
    assert.strictEqual(releaseTemplates.length, 6, 'Expected the current RC45 file to expand into six independently reviewable journeys')
    assert(releaseTemplates.every((template) => 'fields' in template.payload && ['human-judgment', 'external-environment'].includes(String(template.payload.fields?.reviewReason))), 'Expected every current check to justify independent review')
    assert(releaseTemplates.some((template) => template.id === '2.0.0-test-rc45:rc45-builder-create-and-chat'), 'Expected release-qualified Builder checklist discovery')
    const applied = applyPluginTemplate(plugin!, '2.0.0-test-rc45:rc45-builder-create-and-chat')
    assert(applied && 'fields' in applied && applied.fields.owner === 'release-tester', 'Expected generic template application')
  })

  await test('generic numeric fields clamp persisted values to manifest bounds', () => {
    const plugin = getPluginBySlug('plugin-resource-plans')
    assert(plugin, 'Expected resource-plan fixture manifest to load')
    const suggestions = listPluginTemplates(plugin!)
    assert.strictEqual(suggestions.length, 1, 'Expected one bounded synthetic resource-plan suggestion')
    const appliedSuggestions = suggestions.map((template) => applyPluginTemplate(plugin!, template.id))
    assert(appliedSuggestions.every(Boolean), 'Expected every target-free Optimize suggestion to create a customizable plan')
    assert(appliedSuggestions.every((record) => record && 'fields' in record && Array.isArray(record.fields.targetIds) && record.fields.targetIds.length === 0), 'Expected target selection to remain available in the opened plan editor')
    const created = upsertPluginRecord(plugin!, {
      name: 'Bounded plan',
      fields: {
        scope: 'agent',
        targetIds: ['analyst'],
        optimizationGoal: 'cost',
        monthlyTokenBudget: 99999999,
        monthlyCostBudget: -25,
        maximumRunDurationSeconds: 0,
        minimumQualityScore: 120,
        status: 'draft',
      },
    } as any)
    assert('fields' in created, 'Expected a generic resource-plan record')
    assert.strictEqual(created.fields.monthlyTokenBudget, 10000000, 'Expected token budgets to clamp to the maximum')
    assert.strictEqual(created.fields.monthlyCostBudget, 0, 'Expected cost budgets to clamp to the minimum')
    assert.strictEqual(created.fields.maximumRunDurationSeconds, 1, 'Expected duration to clamp to a positive minimum')
    assert.strictEqual(created.fields.minimumQualityScore, 100, 'Expected quality targets to clamp to 100')
  })

  await test('plugin smoke matrix creates and applies targeted records across agents and workflows', () => {
    const guardrails = getPluginBySlug('plugin-guardrails')
    const evals = getPluginBySlug('plugin-evals')
    const optimize = getPluginBySlug('plugin-resource-plans')
    const lifecycle = getPluginBySlug('clawmax-lifecycle')
    assert(guardrails && evals && optimize && lifecycle, 'Expected all plugin smoke fixtures to be available')

    const suggestions = [
      [guardrails, 'no-outbound-email'],
      [evals, 'single-agent-quality'],
      [optimize, 'workflow-budget'],
      [lifecycle, listPluginTemplates(lifecycle!).find((template) => (template.payload as any).fields?.subjectType === 'agent')?.id],
    ] as const
    for (const [plugin, templateId] of suggestions) {
      assert(templateId, `Expected a suggested template for ${plugin!.slug}`)
      const applied = applyPluginTemplate(plugin!, templateId!)
      assert(applied, `Expected suggested ${plugin!.slug} item to apply`)
    }

    const guardrail = upsertPluginRecord(guardrails!, {
      name: 'Smoke guardrail', description: 'Block outbound email during smoke tests', enabled: true,
      appliesTo: { agents: ['analyst'], workflows: ['research-sweep'], groups: [], communities: [] },
      controls: { blockEmail: true, blockWeb: false, blockExternalDocs: false, allowedSkills: [] }, tags: ['smoke'],
    } as any)
    const guardrailRelationships = listPluginRelationships()
    const agentGuardrail = guardrailRelationships.agents.analyst?.find((entry) => entry.itemId === guardrail.id)
    assert(agentGuardrail, 'Expected guardrail relationship on agent')
    assert.strictEqual(agentGuardrail.pluginName, 'Guardrails', 'Expected relationship display metadata from the manifest')
    assert.strictEqual(agentGuardrail.objectKind, 'guardrail', 'Expected relationship object kind from the manifest')
    assert(guardrailRelationships.workflows['research-sweep']?.some((entry) => entry.itemId === guardrail.id), 'Expected guardrail relationship on workflow')

    const evalRecord = upsertPluginRecord(evals!, {
      name: 'Smoke eval', description: 'Check a fixed workflow result', enabled: true, tags: ['smoke'],
      target: { type: 'workflow', ids: ['research-sweep'] },
      experiment: { input: 'Summarize the research', candidateOutput: 'research summary', expectedOutput: 'research summary', judge: 'fixed', fixedMatch: 'exact', iterations: 1 },
    } as any)
    assert(runPluginEval(evals!, evalRecord.id)?.lastRun?.score === 100, 'Expected targeted Eval smoke run to pass')
    const evalRelationship = listPluginRelationships().workflows['research-sweep']?.find((entry) => entry.itemId === evalRecord.id)
    assert(evalRelationship, 'Expected enabled Eval relationship on workflow')
    assert.strictEqual(evalRelationship.status, '1 run', 'Expected Eval relationship to summarize persisted runs')

    const plan = upsertPluginRecord(optimize!, {
      name: 'Smoke workflow plan', description: 'Optimize workflow cost', enabled: true, tags: ['smoke'],
      fields: { scope: 'workflow', targetIds: ['research-sweep'], optimizationGoal: 'cost', monthlyTokenBudget: 100000, monthlyCostBudget: 10, maximumRunDurationSeconds: 300, minimumQualityScore: 80, status: 'applied' },
    } as any)
    const planFields = 'fields' in plan ? (plan.fields as Record<string, any>) : null
    assert(Array.isArray(planFields?.targetIds) && planFields.targetIds.includes('research-sweep'), 'Expected Optimize target to persist on workflow')
    const planRelationship = listPluginRelationships().workflows['research-sweep']?.find((entry) => entry.itemId === plan.id)
    assert(planRelationship, 'Expected applied generic plan relationship on workflow')
    assert.strictEqual(planRelationship.status, 'applied', 'Expected a non-monitoring plan to disclose its applied state')

    const draftPlan = upsertPluginRecord(optimize!, {
      name: 'Draft agent plan', description: 'Not active yet', enabled: true, tags: ['smoke'],
      fields: { scope: 'agent', targetIds: ['analyst'], optimizationGoal: 'cost', monthlyTokenBudget: 100000, monthlyCostBudget: 10, maximumRunDurationSeconds: 300, minimumQualityScore: 80, status: 'draft' },
    } as any)
    assert(!listPluginRelationships().agents.analyst?.some((entry) => entry.itemId === draftPlan.id), 'Expected draft generic plans to stay out of active relationships')

    const inspection = upsertPluginRecord(lifecycle!, {
      name: 'Smoke agent lifecycle', description: 'Inspect agent history', enabled: true, tags: ['smoke'],
      fields: { subjectType: 'agent', targetIds: ['analyst'], focus: 'activity', timeWindow: '7-days', includeArchived: false, notes: 'Smoke test' },
    } as any)
    const inspectionFields = 'fields' in inspection ? (inspection.fields as Record<string, any>) : null
    assert(Array.isArray(inspectionFields?.targetIds) && inspectionFields.targetIds.includes('analyst'), 'Expected Lifecycle target to persist on agent')
    assert(getAgentLifecycleEvidence(lifecycle!, 'analyst').subject.id === 'analyst', 'Expected Lifecycle evidence to resolve the selected agent')
  })

  await test('eval plugin runs score experiments and surfaces workspace context', () => {
    const plugin = getPluginBySlug('plugin-evals')
    assert(plugin, 'Expected evals test plugin manifest to load')

    const created = upsertPluginRecord(plugin!, {
      name: 'Analyst summary accuracy',
      description: 'Check whether candidate output mentions the expected summary keywords',
      tags: ['quality'],
      enabled: true,
      target: {
        type: 'agent',
        ids: ['analyst'],
      },
      experiment: {
        input: 'Summarize the workspace state.',
        candidateOutput: 'research summary agent notes',
        expectedOutput: 'research summary agent notes',
        judge: 'fixed',
        fixedMatch: 'exact',
      },
    } as any)

    const evaluated = runPluginEval(plugin!, created.id)
    assert(evaluated?.lastRun, 'Expected eval run to create a lastRun record')
    assert.strictEqual(evaluated?.lastRun?.score, 100, 'Expected exact fixed comparison to pass')
    assert(evaluated?.lastRun?.summary.includes('Fixed exact comparison passed'), 'Expected fixed comparison evidence')
    assert.strictEqual(evaluated?.lastRun?.casesCompleted, 1, 'Expected the run to report completed case progress')
    assert.strictEqual(evaluated?.lastRun?.totalCases, 1, 'Expected the run to report its total case count')
    assert.strictEqual(evaluated?.lastRun?.tokensIn, 0, 'Fixed comparisons must not fabricate input tokens')
    assert.strictEqual(evaluated?.lastRun?.tokensOut, 0, 'Fixed comparisons must not fabricate output tokens')
    assert.strictEqual(evaluated?.lastRun?.costUsd, 0, 'Fixed comparisons must not fabricate model spend')
    assert(getActiveNotifications().some((notification) => notification.entityId === created.id && notification.title.includes('Eval completed')), 'Expected eval completion notification')
    assert(evaluated?.document?.path?.match(new RegExp(`SYSTEM/plugins/${plugin!.slug}/docs/analyst-summary-accuracy-[a-z0-9]{8}\\.md$`)), 'Expected a readable unique eval document filename')
    assert(fs.existsSync(path.join(tempWorkspace, evaluated!.document!.path)), 'Expected readable eval document on disk')
    const itemFiles = fs.readdirSync(path.join(tempWorkspace, `SYSTEM/plugins/${plugin!.slug}/items`))
    assert(itemFiles.some((file) => /^analyst-summary-accuracy-[a-z0-9]{8}\.md$/.test(file)), 'Expected a readable unique eval item filename')
    assert(!itemFiles.includes(`${created.id}.md`), 'Expected no UUID-only legacy eval item filename')

    const renamed = upsertPluginRecord(plugin!, { id: created.id, name: 'Renamed accuracy check' } as any)
    const renamedItemFiles = fs.readdirSync(path.join(tempWorkspace, `SYSTEM/plugins/${plugin!.slug}/items`))
    assert(renamedItemFiles.some((file) => /^renamed-accuracy-check-[a-z0-9]{8}\.md$/.test(file)), 'Expected item filename to follow the updated Eval name')
    assert(!renamedItemFiles.some((file) => /^analyst-summary-accuracy-[a-z0-9]{8}\.md$/.test(file)), 'Expected renamed item to remove its superseded filename')
    assert.strictEqual(renamed.id, created.id, 'Expected rename to preserve Eval identity')

    if (renamed.kind !== 'eval' || !('experiment' in renamed)) {
      throw new Error('Expected renamed record to remain an Eval')
    }
    const regexRecord = upsertPluginRecord(plugin!, {
      id: created.id,
      experiment: {
        ...renamed.experiment,
        candidateOutput: 'Approved: release candidate 21',
        expectedOutput: '^Approved:\\s+release candidate \\d+$',
        fixedMatch: 'regex',
        fixedCaseSensitive: true,
      },
    } as any)
    const regexRun = runPluginEval(plugin!, regexRecord.id)
    assert.strictEqual(regexRun?.lastRun?.score, 100, 'Expected regular-expression fixed comparison to pass')
    assert(regexRun?.lastRun?.summary.includes('Fixed regex comparison passed with case sensitivity'), 'Expected regular-expression evidence')
    const currentReadableItem = fs.readdirSync(path.join(tempWorkspace, `SYSTEM/plugins/${plugin!.slug}/items`))
      .find((file) => /^renamed-accuracy-check-[a-z0-9]{8}\.md$/.test(file))
    assert(currentReadableItem, 'Expected a readable item before testing legacy migration')
    fs.renameSync(
      path.join(tempWorkspace, `SYSTEM/plugins/${plugin!.slug}/items`, currentReadableItem!),
      path.join(tempWorkspace, `SYSTEM/plugins/${plugin!.slug}/items/${created.id}.md`),
    )
    listPluginRecords(plugin!)
    const migratedItemFiles = fs.readdirSync(path.join(tempWorkspace, `SYSTEM/plugins/${plugin!.slug}/items`))
    assert(migratedItemFiles.some((file) => /^renamed-accuracy-check-[a-z0-9]{8}\.md$/.test(file)), 'Expected record loading to migrate a legacy UUID-only item filename')
    assert(!migratedItemFiles.includes(`${created.id}.md`), 'Expected legacy UUID-only item file removal after migration')

    const context = getPluginWorkspaceContext(plugin!)
    assert(context.agents.some((agent) => agent.id === 'analyst'), 'Expected plugin context to expose workspace agents')
    assert(context.workflows.some((workflow) => workflow.name === 'Research Sweep'), 'Expected plugin context to expose workflows')
    assert(context.groups.includes('Research Ops'), 'Expected plugin context to expose groups')
    assert(context.communities.includes('Research'), 'Expected plugin context to expose communities')
  })

  await test('eval runs reject incomplete or disabled configurations', async () => {
    const plugin = getPluginBySlug('plugin-evals')
    assert(plugin, 'Expected evals test plugin manifest to load')
    const incomplete = upsertPluginRecord(plugin!, {
      name: 'Incomplete Eval',
      enabled: true,
      target: { type: 'agent', ids: [] },
      experiment: {
        input: '',
        candidateOutput: '',
        expectedOutput: '',
        judge: 'ai',
        judgeGuidance: '',
        iterations: 0,
        cases: [],
      },
    } as any)
    assert.throws(
      () => runPluginEval(plugin!, incomplete.id),
      (error: any) => error instanceof PluginContractError
        && error.statusCode === 400
        && error.message.includes('select at least one agent target')
        && error.message.includes('trial case')
        && error.message.includes('AI evaluator'),
      'Expected an actionable readiness error for incomplete Evals',
    )
    const disabled = upsertPluginRecord(plugin!, {
      id: incomplete.id,
      enabled: false,
      target: { type: 'agent', ids: ['analyst'] },
      experiment: {
        input: 'Summarize findings',
        candidateOutput: 'Summary',
        expectedOutput: 'Summary',
        judge: 'fixed',
        iterations: 1,
      },
    } as any)
    assert.throws(
      () => runPluginEval(plugin!, disabled.id),
      (error: any) => error instanceof PluginContractError && error.message.includes('enable this Eval'),
      'Expected disabled Evals to remain non-runnable',
    )
    const aiRecord = upsertPluginRecord(plugin!, {
      id: incomplete.id,
      enabled: true,
      target: { type: 'agent', ids: ['analyst'] },
      experiment: {
        input: 'Summarize findings',
        candidateOutput: 'Summary',
        expectedOutput: 'A concise summary',
        judge: 'ai',
        judgeGuidance: 'Score concision and accuracy.',
        iterations: 1,
      },
    } as any)
    assert.throws(
      () => runPluginEval(plugin!, aiRecord.id),
      (error: any) => error instanceof PluginContractError
        && error.message.includes('model-backed target execution')
        && error.message.includes('measured usage'),
      'Expected configured AI Evals to fail loudly instead of returning placeholder scores',
    )
  })

  await test('eval evaluator and trial configuration persists without faking human runs', () => {
    const plugin = getPluginBySlug('plugin-evals')
    assert(plugin, 'Expected evals test plugin manifest to load')
    const suggestions = listPluginTemplates(plugin!)
    assert(suggestions.some((template) => (template.payload as any).experiment?.judge === 'ai'), 'Expected an AI-evaluated suggestion')
    assert(suggestions.some((template) => (template.payload as any).experiment?.judge === 'fixed'), 'Expected a Fixed-evaluated suggestion')

    const created = upsertPluginRecord(plugin!, {
      name: 'Human model fit review',
      target: { type: 'agent', ids: ['analyst'] },
      experiment: {
        input: 'Compare the candidate model response.',
        candidateOutput: '',
        expectedOutput: 'A reviewer-approved response.',
        judge: 'human',
        iterations: 5,
        judgeGuidance: 'Review clarity, usefulness, and model fit before approval.',
        humanReviewerName: 'Mike Reviewer',
        humanReviewerEmail: 'mike@example.com',
        humanReviewPath: 'SYSTEM/evals/reviews/model-fit-review.md',
        cases: [
          {
            id: 'case-text',
            name: 'Representative prompt',
            input: { type: 'text', value: 'Explain the release decision.' },
            expected: { type: 'text', value: 'A supported decision with next steps.' },
          },
          {
            id: 'case-file',
            name: 'Workspace fixture',
            input: { type: 'file', value: 'SYSTEM/evals/model-fit-input.md' },
            expected: { type: 'file', value: 'SYSTEM/evals/model-fit-expected.md' },
          },
        ],
      },
    } as any)
    assert(created.kind === 'eval' && 'experiment' in created, 'Expected an Eval record')
    assert('experiment' in created && created.experiment.judge === 'human', 'Expected Human evaluator mode to persist')
    assert('experiment' in created && created.experiment.iterations === 5, 'Expected planned trial count to persist')
    assert('experiment' in created && created.experiment.judgeGuidance?.includes('clarity'), 'Expected evaluator guidance to persist')
    assert('experiment' in created && created.experiment.cases?.length === 2, 'Expected multiple trial cases to persist')
    assert('experiment' in created && created.experiment.cases?.[1]?.input.type === 'file', 'Expected workspace file references to persist')
    const requested = runPluginEval(plugin!, created.id)
    assert.strictEqual(requested?.lastRun, null, 'Expected Human evaluation not to create a fake automated score')
    assert.strictEqual(requested?.humanReview?.status, 'pending', 'Expected a pending Human review request')
    assert.strictEqual(requested?.humanReview?.reviewerEmail, 'mike@example.com', 'Expected reviewer assignment metadata')
    assert.strictEqual(requested?.humanReview?.path, 'SYSTEM/evals/reviews/model-fit-review.md', 'Expected configured review path')
    const reviewPath = path.join(tempWorkspace, requested!.humanReview!.path)
    assert(fs.existsSync(reviewPath), 'Expected Human review Markdown file')
    const reviewMarkdown = fs.readFileSync(reviewPath, 'utf-8')
    assert(reviewMarkdown.includes('status: pending'), 'Expected pending review frontmatter')
    assert(reviewMarkdown.includes('Reviewer result'), 'Expected reviewer result fields')
    assert(reviewMarkdown.includes('Representative prompt'), 'Expected trial cases in review request')
    assert(getActiveNotifications().some((notification) => notification.entityId === created.id && notification.title.includes('Human review requested')), 'Expected Human review notification')

    assert.throws(
      () => upsertPluginRecord(plugin!, {
        name: 'Invalid reviewer',
        experiment: { judge: 'human', humanReviewerEmail: 'not-an-email' },
      } as any),
      (error: any) => error instanceof PluginContractError && error.statusCode === 400 && error.message.includes('email'),
      'Expected invalid reviewer email to be rejected',
    )
    assert.throws(
      () => upsertPluginRecord(plugin!, {
        name: 'Unsafe review path',
        experiment: { judge: 'human', humanReviewPath: '../../outside.md' },
      } as any),
      (error: any) => error instanceof PluginContractError && error.statusCode === 400 && error.message.includes('workspace'),
      'Expected Human review paths outside the workspace to be rejected',
    )
  })

  await test('host capabilities deny undeclared actions and filter workspace context', () => {
    const source = getPluginBySlug('plugin-review-notes')
    assert(source, 'Expected generic test plugin manifest to load')
    const plugin = { ...source!, id: 'no-grants', slug: 'no-grants', capabilities: {} }
    const created = upsertPluginRecord(plugin, {
      name: 'Private note',
      description: 'Must remain isolated',
      fields: { release: '2.0.0-test-rc4', area: 'regression', completed: false, outcome: 'pending', notes: 'isolated' },
    } as any)

    const context = getPluginWorkspaceContext(plugin)
    assert.deepStrictEqual(context, { agents: [], workflows: [], groups: [], communities: [] }, 'Expected undeclared context reads to be empty')
    assert.throws(
      () => generatePluginRecordDocument(plugin, created.id),
      (error: any) => error instanceof PluginContractError && error.statusCode === 403 && error.message.includes('capabilities.docs=true'),
      'Expected document generation to require the docs grant',
    )
    assert.throws(
      () => emitPluginRecordNotification(plugin, created.id),
      (error: any) => error instanceof PluginContractError && error.statusCode === 403 && error.message.includes('capabilities.notifications=true'),
      'Expected notifications to require the notifications grant',
    )

    const docsOnlyPlugin = { ...plugin, id: 'docs-only', slug: 'docs-only', capabilities: { docs: true } }
    const docsOnlyRecord = upsertPluginRecord(docsOnlyPlugin, {
      name: 'Documented note',
      fields: { release: '2.0.0-test-rc4', area: 'regression', completed: false, outcome: 'pending', notes: 'document only' },
    } as any)
    const notificationCount = getActiveNotifications().length
    assert(generatePluginRecordDocument(docsOnlyPlugin, docsOnlyRecord.id)?.document?.path, 'Expected docs-only grant to generate a document')
    assert.strictEqual(getActiveNotifications().length, notificationCount, 'Expected docs-only action not to emit a notification')
  })

  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalTestWorkspace === 'undefined') delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = originalTestWorkspace
  if (typeof originalEnabledPlugins === 'undefined') delete process.env.CLAWMAX_ENABLED_PLUGINS
  else process.env.CLAWMAX_ENABLED_PLUGINS = originalEnabledPlugins
  if (typeof originalDisableDefaultPlugins === 'undefined') delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
  else process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS = originalDisableDefaultPlugins
  if (typeof originalPluginPaths === 'undefined') delete process.env.CLAWMAX_PLUGIN_PATHS
  else process.env.CLAWMAX_PLUGIN_PATHS = originalPluginPaths
  if (typeof originalPluginSettingsPath === 'undefined') delete process.env.CLAWMAX_PLUGIN_SETTINGS_PATH
  else process.env.CLAWMAX_PLUGIN_SETTINGS_PATH = originalPluginSettingsPath
  if (typeof originalEnableTestPlugins === 'undefined') delete process.env.CLAWMAX_ENABLE_TEST_PLUGINS
  else process.env.CLAWMAX_ENABLE_TEST_PLUGINS = originalEnableTestPlugins
  resetWorkspaceManagerForTests()
  fs.rmSync(tempWorkspace, { recursive: true, force: true })
  fs.rmSync(tempHome, { recursive: true, force: true })

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) {
    console.log(`${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`${GREEN}All tests passed${RESET}`)
  }
}

run().catch((err) => {
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalTestWorkspace === 'undefined') delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = originalTestWorkspace
  if (typeof originalEnabledPlugins === 'undefined') delete process.env.CLAWMAX_ENABLED_PLUGINS
  else process.env.CLAWMAX_ENABLED_PLUGINS = originalEnabledPlugins
  if (typeof originalDisableDefaultPlugins === 'undefined') delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
  else process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS = originalDisableDefaultPlugins
  if (typeof originalPluginPaths === 'undefined') delete process.env.CLAWMAX_PLUGIN_PATHS
  else process.env.CLAWMAX_PLUGIN_PATHS = originalPluginPaths
  if (typeof originalPluginSettingsPath === 'undefined') delete process.env.CLAWMAX_PLUGIN_SETTINGS_PATH
  else process.env.CLAWMAX_PLUGIN_SETTINGS_PATH = originalPluginSettingsPath
  if (typeof originalEnableTestPlugins === 'undefined') delete process.env.CLAWMAX_ENABLE_TEST_PLUGINS
  else process.env.CLAWMAX_ENABLE_TEST_PLUGINS = originalEnableTestPlugins
  resetWorkspaceManagerForTests()
  console.error(err)
  process.exit(1)
})
