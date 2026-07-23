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
  deletePluginRecord,
  emitPluginRecordNotification,
  generatePluginRecordDocument,
  getPluginBySlug,
  getPluginDiagnosticsReport,
  getPluginWorkspaceContext,
  listConfiguredPlugins,
  listPluginRecords,
  listPluginTemplates,
  PluginContractError,
  runPluginEval,
  upsertPluginRecord,
} from './plugin-system'
import { resetWorkspaceManagerForTests } from './workspace-manager'

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
        },
      ],
    },
  }, null, 2), 'utf-8')

  createWorkflow({
    name: 'Research Sweep',
    description: 'Collect and summarize workspace findings',
    schedule: 'manual',
    content: '# Research\nSummarize findings.',
    executionMode: 'automated',
    targeting: { agents: ['analyst'], groups: ['Research Ops'], tags: [], communities: ['Research'] },
  })
}

async function run() {
  console.log(`\n${YELLOW}=== Plugin System Contract Suite ===${RESET}\n`)

  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-plugin-system-workspace-'))
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-plugin-system-home-'))

  process.env.OPENCLAW_WORKSPACE = tempWorkspace
  process.env.CLAWMAX_TEST_WORKSPACE = tempWorkspace
  process.env.HOME = tempHome
  process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-lab-guardrails,plugin-lab-evals,plugin-lab-review-notes,clawmax-optimize'
  process.env.CLAWMAX_PLUGIN_PATHS = ''
  delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
  resetWorkspaceManagerForTests()
  seedWorkspaceFiles(tempWorkspace, tempHome)

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
    assert(plugins.length >= 4, 'Expected the three synthetic plugins and public Optimize plugin to be configured')
    assert.strictEqual(plugins[0]?.slug, 'plugin-lab-guardrails', 'Expected guardrails test plugin to sort before evals')
    assert.strictEqual(plugins[1]?.slug, 'plugin-lab-evals', 'Expected evals test plugin to appear second')
    assert.strictEqual(plugins[2]?.slug, 'plugin-lab-review-notes', 'Expected generic v2 plugin to appear third')
    assert.strictEqual(plugins[2]?.apiVersion, 'clawmax.ai/v2', 'Expected generic plugin to declare the v2 host API')
    assert.strictEqual(plugins[2]?.objectKind, 'review-note', 'Expected a non-core object kind to load')
    assert.strictEqual(plugins[3]?.slug, 'clawmax-optimize', 'Expected public Optimize plugin to appear fourth')
    assert.deepStrictEqual(plugins.map((plugin) => plugin.nav?.label), ['Guardrails', 'Evals', 'Review', 'Optimize'], 'Expected compact one-word plugin navigation labels')
    assert.strictEqual(plugins[2]?.ui?.list?.groupBy, 'release', 'Expected release checklist grouping metadata')
    assert.strictEqual(plugins[2]?.ui?.list?.checkField, 'completed', 'Expected release checklist completion metadata')
    assert(plugins.slice(0, 3).every((plugin) => plugin.visibility === 'private'), 'Expected synthetic MVP0 plugins to be private')
    assert.strictEqual(plugins[3]?.visibility, 'public', 'Expected Optimize to remain public')
    assert(plugins.every((plugin) => plugin.nav?.section === 'plugins'), 'Expected plugins to target the plugin nav section')
    assert(plugins.every((plugin) => plugin.capabilities?.notifications && plugin.capabilities?.docs), 'Expected plugins to declare core host capabilities')
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
    ] as const) {
      const directory = path.join(pluginRoot, slug)
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(path.join(directory, 'clawmax-plugin.json'), JSON.stringify({ ...baseManifest, ...extra, id: slug, slug }, null, 2), 'utf-8')
    }
    process.env.CLAWMAX_PLUGIN_PATHS = pluginRoot
    process.env.CLAWMAX_ENABLED_PLUGINS = 'future-version-plugin,missing-schema-plugin'
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

  await test('guardrail plugin records persist, generate docs, and emit notifications', () => {
    const plugin = getPluginBySlug('plugin-lab-guardrails')
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
    assert(fs.existsSync(path.join(tempWorkspace, `SYSTEM/plugins/${plugin!.slug}/items/${created.id}.md`)), 'Expected canonical guardrail item file on disk')

    const archived = upsertPluginRecord(plugin!, { ...created, archived: true } as any)
    assert.strictEqual(archived.archived, true, 'Expected archive flag to persist on plugin records')
    const deactivated = upsertPluginRecord(plugin!, { ...archived, enabled: false } as any)
    assert('history' in deactivated && deactivated.history[0]?.action === 'deactivated', 'Expected deactivation in guardrail history')
    assert(getActiveNotifications().some((notification) => notification.entityId === created.id && notification.title.includes('deactivated')), 'Expected guardrail deactivation notification')

    const withDoc = generatePluginRecordDocument(plugin!, created.id)
    assert(withDoc?.document?.path === `SYSTEM/plugins/${plugin!.slug}/docs/${created.id}.md`, 'Expected generated guardrail doc path')
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

  await test('generic v2 plugin validates schema, persists fields, and applies templates', () => {
    const plugin = getPluginBySlug('plugin-lab-review-notes')
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
      'fields' in template.payload && template.payload.fields?.release === '2.0.0-test-rc6'
    ))
    assert.strictEqual(releaseTemplates.length, 14, 'Expected one release file to expand into fourteen checklist items')
    assert(releaseTemplates.some((template) => template.id === '2.0.0-test-rc6:release-readiness'), 'Expected release-qualified checklist item discovery')
    const applied = applyPluginTemplate(plugin!, '2.0.0-test-rc6:release-readiness')
    assert(applied && 'fields' in applied && applied.fields.owner === 'release-manager', 'Expected generic template application')
  })

  await test('eval plugin runs score experiments and surfaces workspace context', () => {
    const plugin = getPluginBySlug('plugin-lab-evals')
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
        candidateOutput: 'Workspace findings include research summary and agent notes.',
        expectedOutput: 'research summary agent notes',
        judge: 'fixed',
      },
    } as any)

    const evaluated = runPluginEval(plugin!, created.id)
    assert(evaluated?.lastRun, 'Expected eval run to create a lastRun record')
    assert((evaluated?.lastRun?.score || 0) > 0, 'Expected heuristic score to be non-zero for overlapping tokens')
    assert((evaluated?.lastRun?.tokensIn || 0) > 0, 'Expected eval run tokensIn to be populated')
    assert((evaluated?.lastRun?.tokensOut || 0) > 0, 'Expected eval run tokensOut to be populated')
    assert((evaluated?.lastRun?.costUsd || 0) > 0, 'Expected eval run costUsd to be populated')
    assert(getActiveNotifications().some((notification) => notification.entityId === created.id && notification.title.includes('Eval completed')), 'Expected eval completion notification')
    assert(evaluated?.document?.path?.includes(`SYSTEM/plugins/${plugin!.slug}/docs/${created.id}.md`), 'Expected eval run to generate a plugin doc')
    assert(fs.existsSync(path.join(tempWorkspace, `SYSTEM/plugins/${plugin!.slug}/items/${created.id}.md`)), 'Expected canonical eval item file on disk')

    const context = getPluginWorkspaceContext(plugin!)
    assert(context.agents.some((agent) => agent.id === 'analyst'), 'Expected plugin context to expose workspace agents')
    assert(context.workflows.some((workflow) => workflow.name === 'Research Sweep'), 'Expected plugin context to expose workflows')
    assert(context.groups.includes('Research Ops'), 'Expected plugin context to expose groups')
    assert(context.communities.includes('Research'), 'Expected plugin context to expose communities')
  })

  await test('host capabilities deny undeclared actions and filter workspace context', () => {
    const source = getPluginBySlug('plugin-lab-review-notes')
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
  resetWorkspaceManagerForTests()
  console.error(err)
  process.exit(1)
})
