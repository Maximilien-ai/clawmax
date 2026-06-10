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
  deletePluginRecord,
  emitPluginRecordNotification,
  generatePluginRecordDocument,
  getPluginBySlug,
  getPluginWorkspaceContext,
  listConfiguredPlugins,
  listPluginRecords,
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
  process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-lab-guardrails,plugin-lab-evals'
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
    if (typeof previousEnabled === 'undefined') delete process.env.CLAWMAX_ENABLED_PLUGINS
    else process.env.CLAWMAX_ENABLED_PLUGINS = previousEnabled
    if (typeof previousDisableDefaults === 'undefined') delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
    else process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS = previousDisableDefaults
  })

  await test('configured plugins expose manifests in sidebar order', () => {
    const plugins = listConfiguredPlugins()
    assert(plugins.length >= 2, 'Expected at least the test guardrails and evals plugins to be configured')
    assert.strictEqual(plugins[0]?.slug, 'plugin-lab-guardrails', 'Expected guardrails test plugin to sort before evals')
    assert.strictEqual(plugins[1]?.slug, 'plugin-lab-evals', 'Expected evals test plugin to appear second')
    assert(plugins.every((plugin) => plugin.visibility === 'private'), 'Expected MVP0 plugins to be private')
    assert(plugins.every((plugin) => plugin.nav?.section === 'plugins'), 'Expected plugins to target the plugin nav section')
    assert(plugins.every((plugin) => plugin.capabilities?.notifications && plugin.capabilities?.docs), 'Expected plugins to declare core host capabilities')
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
    assert.strictEqual(listPluginRecords(plugin!).length, 1, 'Expected created guardrail to persist')

    const withDoc = generatePluginRecordDocument(plugin!, created.id)
    assert(withDoc?.document?.path === `SYSTEM/plugins/${plugin!.slug}/docs/${created.id}.md`, 'Expected generated guardrail doc path')
    assert(fs.existsSync(path.join(tempWorkspace, withDoc!.document!.path)), 'Expected generated guardrail doc on disk')

    const beforeNotifications = getActiveNotifications().length
    const notified = emitPluginRecordNotification(plugin!, created.id)
    assert.strictEqual(notified?.id, created.id, 'Expected plugin notification to target the guardrail record')
    assert.strictEqual(getActiveNotifications().length, beforeNotifications + 1, 'Expected plugin notification to be recorded')

    assert(deletePluginRecord(plugin!, created.id), 'Expected delete to remove guardrail record')
    assert.strictEqual(listPluginRecords(plugin!).length, 0, 'Expected no guardrail records after delete')
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
    assert(evaluated?.document?.path?.includes(`SYSTEM/plugins/${plugin!.slug}/docs/${created.id}.md`), 'Expected eval run to generate a plugin doc')

    const context = getPluginWorkspaceContext()
    assert(context.agents.some((agent) => agent.id === 'analyst'), 'Expected plugin context to expose workspace agents')
    assert(context.workflows.some((workflow) => workflow.name === 'Research Sweep'), 'Expected plugin context to expose workflows')
    assert(context.groups.includes('Research Ops'), 'Expected plugin context to expose groups')
    assert(context.communities.includes('Research'), 'Expected plugin context to expose communities')
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
  resetWorkspaceManagerForTests()
  console.error(err)
  process.exit(1)
})
