/**
 * Agent model update test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/agent-model.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import nodeAssert from 'assert'
import { assertAgentModelPolicy } from './agent-model-policy'
import {
  normalizeAgentModelInput,
  readAgentBackupModelFromConfigFile,
  readAgentModelFromConfigFile,
  restoreAgentModelInConfigFile,
  restoreAgentBackupModelInConfigFile,
  validateAgentModelPolicyInConfigFile,
  resetAgentSessionsForModelChange,
  updateAgentBackupModelInConfigFile,
  updateAgentModelInConfigFile,
  upsertAgentBackupModelInIdentityContent,
  upsertAgentModelFitInIdentityContent,
  upsertAgentModelInConfigFile,
  upsertAgentModelInIdentityContent,
  upsertAgentTagsInIdentityContent,
  upsertAgentRuntimeInIdentityContent,
} from './agent-model'
import { parseIdentity } from './workspace'
import { materializeDashboardAgentList } from './openclaw-config'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function readMaterializedConfig(configPath: string): any {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  materializeDashboardAgentList(config)
  return config
}

console.log(`\n${YELLOW}=== Agent Model Test Suite ===${RESET}\n`)

test('explicit model policies preserve instance and per-agent restrictions', () => {
  const config = { agents: { defaults: { modelPolicy: { allow: ['openai/gpt-5.4'] }, models: {} } } }
  assertAgentModelPolicy(config, {}, ['openai/gpt-5.4'])
  nodeAssert.throws(() => assertAgentModelPolicy(config, {}, ['openai/gpt-5.4-mini']), /blocked.*defaults.modelPolicy.allow/)
  assertAgentModelPolicy(config, { modelPolicy: { allow: ['anthropic/*'] } }, ['anthropic/claude-test'])
  nodeAssert.throws(() => assertAgentModelPolicy(config, { modelPolicy: { allow: ['anthropic/*'] } }, ['openai/gpt-5.4']), /blocked.*agent.modelPolicy.allow/)
  assertAgentModelPolicy(config, { modelPolicy: { allow: [] } }, ['other/model'])
  assertAgentModelPolicy({}, {}, ['other/model'])
  assertAgentModelPolicy(config, { modelPolicy: { allow: ['lmstudio/google/*'] } }, ['openai-compatible/google/gemma-test'])
  nodeAssert.throws(() => assertAgentModelPolicy(config, { modelPolicy: { allow: ['openai/gpt*'] } }, ['openai/gpt-5.4']), /blocked/)
  nodeAssert.throws(() => assertAgentModelPolicy(config, { modelPolicy: { allow: 'openai/*' } }, ['openai/gpt-5.4']), /blocked/)
  assertAgentModelPolicy({ agents: { defaults: { models: { 'openai/gpt-5.4': { alias: 'primary' } }, modelPolicy: { allow: ['primary'] } } } }, {}, ['openai/gpt-5.4'])
})

test('rejected primary, backup and provisioned models leave config unchanged', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-policy-'))
  try {
    const configPath = path.join(tmpDir, 'openclaw.json')
    const original = JSON.stringify({ agents: { defaults: { modelPolicy: { allow: ['openai/gpt-5.4'] } }, entries: { ceo: { model: 'openai/gpt-5.4' } } } })
    fs.writeFileSync(configPath, original)
    for (const result of [updateAgentModelInConfigFile(configPath, 'ceo', 'anthropic/blocked'), updateAgentBackupModelInConfigFile(configPath, 'ceo', 'anthropic/blocked'), upsertAgentModelInConfigFile(configPath, 'new-agent', 'anthropic/blocked')]) {
      assert(!result.ok && !!result.error?.includes('blocked'), 'Policy must reject the selection')
      assert(fs.readFileSync(configPath, 'utf-8') === original, 'Rejection must not mutate the config')
    }
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }) }
})

test('model inspection and policy checks remain workspace-scoped on malformed or missing configs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-read-'))
  try {
    const configPath = path.join(tmpDir, 'openclaw.json')
    const missing = readAgentModelFromConfigFile(configPath, 'shared')
    assert(!missing.ok && /Config not found/.test(missing.error || ''), 'Missing config must fail closed')
    assert(!readAgentBackupModelFromConfigFile(configPath, 'shared').ok, 'Missing backup config must fail closed')
    assert(validateAgentModelPolicyInConfigFile(configPath, 'shared', ['openai/gpt-5.4'], '/workspace/a').ok, 'Missing policy config permits a new agent')

    fs.writeFileSync(configPath, '{bad json')
    for (const result of [
      readAgentModelFromConfigFile(configPath, 'shared'),
      readAgentBackupModelFromConfigFile(configPath, 'shared'),
      validateAgentModelPolicyInConfigFile(configPath, 'shared', ['openai/gpt-5.4'], '/workspace/a'),
    ]) assert(!result.ok, 'Malformed config must not be accepted')

    fs.writeFileSync(configPath, JSON.stringify({ agents: { list: [
      { id: 'shared', workspace: '/workspace/a', model: 'openai/gpt-5.4', backupModel: 'openai/gpt-5.4-mini' },
      { id: 'shared', workspace: '/workspace/b', model: 'anthropic/claude-test' },
    ] } }))
    assert(readAgentModelFromConfigFile(configPath, 'shared', { workspacePath: '/workspace/a' }).model === 'openai/gpt-5.4', 'Read must use the selected workspace')
    const backup = readAgentBackupModelFromConfigFile(configPath, 'shared', { workspacePath: '/workspace/a' })
    assert(backup.ok && backup.backupModel === undefined, 'Unsupported legacy backup config must not become an active fallback')
    assert(!readAgentModelFromConfigFile(configPath, 'shared', { workspacePath: '/workspace/c' }).ok, 'Unknown workspace must not fall through to another agent')
    assert(!readAgentBackupModelFromConfigFile(configPath, 'shared', { workspacePath: '/workspace/c' }).ok, 'Unknown backup workspace must not fall through')
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }) }
})

test('model restoration changes only the selected workspace agent and reports no-ops', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-restore-'))
  try {
    const configPath = path.join(tmpDir, 'openclaw.json')
    assert(!restoreAgentModelInConfigFile(configPath, 'shared', undefined).ok, 'Missing config must fail')
    fs.writeFileSync(configPath, JSON.stringify({ agents: { list: [
      { id: 'shared', workspace: '/workspace/a', model: 'openai/gpt-5.4' },
      { id: 'peer', workspace: '/workspace/b', model: 'anthropic/claude-test' },
    ] } }))
    assert(!restoreAgentModelInConfigFile(configPath, 'shared', undefined, { workspacePath: '/workspace/c' }).ok, 'Unknown workspace must not mutate another agent')
    const noChange = restoreAgentModelInConfigFile(configPath, 'shared', 'openai/gpt-5.4', { workspacePath: '/workspace/a' })
    assert(noChange.ok && noChange.changed === false, 'Restoring same model is a no-op')
    const cleared = restoreAgentModelInConfigFile(configPath, 'shared', undefined, { workspacePath: '/workspace/a' })
    assert(cleared.ok && cleared.changed === true, 'Selected model should clear')
    assert(readAgentModelFromConfigFile(configPath, 'shared', { workspacePath: '/workspace/a' }).model === undefined, 'Selected model must be cleared')
    assert(readAgentModelFromConfigFile(configPath, 'peer', { workspacePath: '/workspace/b' }).model === 'anthropic/claude-test', 'Other workspace model must remain')
    const restored = restoreAgentModelInConfigFile(configPath, 'shared', 'openai/gpt-5.4', { workspacePath: '/workspace/a' })
    assert(restored.ok && restored.changed === true, 'Selected model should restore')
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }) }
})

test('backup restoration strips unsupported legacy config without touching peer agents', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-backup-restore-'))
  try {
    const configPath = path.join(tmpDir, 'openclaw.json')
    assert(!restoreAgentBackupModelInConfigFile(configPath, 'selected', undefined).ok, 'Missing config must fail')
    fs.writeFileSync(configPath, JSON.stringify({ agents: { list: [
      { id: 'selected', workspace: '/workspace/a', model: 'openai/gpt-5.4', backupModel: 'openai/gpt-5.4-mini' },
      { id: 'peer', workspace: '/workspace/b', model: 'anthropic/claude-test' },
    ] } }))
    assert(!restoreAgentBackupModelInConfigFile(configPath, 'selected', undefined, { workspacePath: '/workspace/c' }).ok, 'Unknown workspace must fail')
    const restored = restoreAgentBackupModelInConfigFile(configPath, 'selected', 'openai/gpt-5.4-mini', { workspacePath: '/workspace/a' })
    assert(restored.ok && restored.changed === true, 'Legacy backup key should be removed')
    const durable = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agents = materializeDashboardAgentList(durable)
    assert(!('backupModel' in agents.find((agent: any) => agent.id === 'selected')), 'Unsupported backup key must not persist')
    assert(agents.some((agent: any) => agent.id === 'peer' && agent.model === 'anthropic/claude-test'), 'Peer agent must remain')
    const noChange = restoreAgentBackupModelInConfigFile(configPath, 'selected', undefined, { workspacePath: '/workspace/a' })
    assert(noChange.ok && noChange.changed === false, 'Repeated restore should be a no-op')
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }) }
})

test('identity model and runtime edits preserve metadata and choose stable insertion points', () => {
  const suffix = '\n## Creation Metadata\n- **Model:** original/model\n'
  for (const [line, expected] of [
    ['- **Avatar:**\n  avatar.png', '- **Avatar:**\n  avatar.png\n- **Model:** openai/gpt-5.4'],
    ['- **Tags:** assistant', '- **Model:** openai/gpt-5.4\n- **Tags:** assistant'],
    ['- **Role:** helper', '- **Role:** helper\n- **Model:** openai/gpt-5.4'],
    ['- **Name:** Helper', '- **Name:** Helper\n\n- **Model:** openai/gpt-5.4'],
  ]) {
    const updated = upsertAgentModelInIdentityContent(`# Identity\n${line}${suffix}`, 'openai/gpt-5.4')
    assert(updated.includes(expected), `Model insertion should follow runtime field: ${line}`)
    assert(updated.includes('- **Model:** original/model'), 'Creation metadata must remain untouched')
  }
  for (const line of ['- **Model:** openai/gpt-5.4', '- **Avatar:**\n  avatar.png', '- **Tags:** assistant', '- **Role:** helper', '- **Name:** Helper']) {
    const updated = upsertAgentRuntimeInIdentityContent(`# Identity\n${line}${suffix}`, 'droid')
    assert(updated.includes('- **Runtime:** droid'), `Runtime should be inserted near ${line}`)
    assert(updated.includes('- **Model:** original/model'), 'Creation metadata must remain untouched')
    const cleared = upsertAgentRuntimeInIdentityContent(updated, 'default')
    assert(!cleared.includes('- **Runtime:** droid'), 'Reset should clear only active runtime')
  }
  const noOp = '# Identity\n- **Name:** Helper\n'
  nodeAssert.strictEqual(upsertAgentRuntimeInIdentityContent(noOp, 'default'), noOp)
})

test('identity tag and backup edits stay in the runtime section', () => {
  const suffix = '\n## Creation Metadata\n- **Tags:** original\n- **Backup Model:** original/model\n'
  for (const line of ['- **Role:** helper', '- **Name:** Helper', '- **Model:** openai/gpt-5.4']) {
    const tagged = upsertAgentTagsInIdentityContent(`# Identity\n${line}${suffix}`, ['assistant', 'assistant', 'finance'])
    assert(tagged.includes('- **Tags:** assistant, finance'), `Tags should be inserted for ${line}`)
    assert(tagged.includes('- **Tags:** original'), 'Creation metadata tag must remain')
    const cleared = upsertAgentTagsInIdentityContent(tagged, [])
    assert(!cleared.includes('- **Tags:** assistant, finance'), 'Runtime tags should clear')
    assert(cleared.includes('- **Tags:** original'), 'Creation metadata should survive clearing')
  }
  const existing = upsertAgentTagsInIdentityContent('# Identity\n- **Tags:** old\n', ['new'])
  assert(existing.includes('- **Tags:** new') && !existing.includes('- **Tags:** old'), 'Existing tags should replace')
  for (const line of ['- **Model:** openai/gpt-5.4', '- **Name:** Helper']) {
    const backed = upsertAgentBackupModelInIdentityContent(`# Identity\n${line}${suffix}`, 'openai/gpt-5.4-mini')
    assert(backed.includes('- **Backup Model:** openai/gpt-5.4-mini'), 'Backup should be inserted')
    assert(backed.includes('- **Backup Model:** original/model'), 'Metadata backup must remain')
    const cleared = upsertAgentBackupModelInIdentityContent(backed, undefined)
    assert(!cleared.includes('- **Backup Model:** openai/gpt-5.4-mini'), 'Runtime backup should clear')
    assert(cleared.includes('- **Backup Model:** original/model'), 'Metadata backup should survive')
  }
})

test('automatic model-fit fields remain next to the active model or backup', () => {
  for (const line of ['- **Backup Model:** openai/gpt-5.4-mini', '- **Model:** openai/gpt-5.4', '- **Name:** Helper']) {
    const updated = upsertAgentModelFitInIdentityContent(`# Identity\n${line}\n\n## Creation Metadata\n- **Model Selection:** archived\n`, 'auto', 'balanced')
    assert(updated.includes('- **Model Selection:** auto'), 'Selection mode should be written to active identity')
    assert(updated.includes('- **Model Priority:** balanced'), 'Priority should be written to active identity')
    assert(updated.includes('- **Model Selection:** archived'), 'Creation metadata should remain unchanged')
    const repeated = upsertAgentModelFitInIdentityContent(updated, 'manual', 'cost')
    assert((repeated.match(/- \*\*Model Selection:\*\* manual/g) || []).length === 1, 'Selection mode should update in place')
    assert((repeated.match(/- \*\*Model Priority:\*\* cost/g) || []).length === 1, 'Priority should update in place')
  }
})

test('model normalization distinguishes OpenAI families from arbitrary provider IDs', () => {
  nodeAssert.strictEqual(normalizeAgentModelInput('   '), '')
  nodeAssert.strictEqual(normalizeAgentModelInput(' o1-preview '), 'openai/o1-preview')
  nodeAssert.strictEqual(normalizeAgentModelInput(' o3-mini '), 'openai/o3-mini')
  nodeAssert.strictEqual(normalizeAgentModelInput(' chatgpt-4o-latest '), 'openai/chatgpt-4o-latest')
  nodeAssert.strictEqual(normalizeAgentModelInput(' text-embedding-3-small '), 'openai/text-embedding-3-small')
  nodeAssert.strictEqual(normalizeAgentModelInput(' gemma-local '), 'gemma-local')
  nodeAssert.strictEqual(normalizeAgentModelInput('custom/gpt-4o'), 'custom/gpt-4o')
})

test('model update errors never create a missing or invalid OpenClaw config', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-errors-'))
  try {
    const configPath = path.join(tmpDir, 'openclaw.json')
    for (const result of [
      updateAgentModelInConfigFile(configPath, 'missing', 'openai/gpt-5.4'),
      updateAgentBackupModelInConfigFile(configPath, 'missing', 'openai/gpt-5.4-mini'),
    ]) assert(!result.ok, 'Missing config must reject model changes')
    assert(!fs.existsSync(configPath), 'Rejected update must not create a config')
    fs.writeFileSync(configPath, '{invalid')
    assert(!updateAgentModelInConfigFile(configPath, 'missing', 'openai/gpt-5.4').ok, 'Invalid config must fail primary update')
    assert(!updateAgentBackupModelInConfigFile(configPath, 'missing', undefined).ok, 'Invalid config must fail backup update')
    fs.writeFileSync(configPath, JSON.stringify({ agents: { list: [{ id: 'present', workspace: '/workspace/a', model: 'openai/gpt-5.4' }] } }))
    assert(!updateAgentModelInConfigFile(configPath, 'present', '  ').ok, 'Empty model must fail')
    assert(!updateAgentModelInConfigFile(configPath, 'present', 'openai/gpt-5.4-mini', { workspacePath: '/workspace/b' }).ok, 'Other workspace must fail')
    assert(!updateAgentBackupModelInConfigFile(configPath, 'present', 'openai/gpt-5.4-mini', { workspacePath: '/workspace/b' }).ok, 'Other workspace backup must fail')
    assert(!updateAgentBackupModelInConfigFile(configPath, 'missing', 'openai/gpt-5.4-mini').ok, 'Unknown agent backup must fail')
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }) }
})

test('updateAgentModelInConfigFile updates model in openclaw.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'ceo', name: 'CEO', model: 'anthropic/claude-3-haiku-20240307' }
      ]
    }
  }, null, 2))

  const result = updateAgentModelInConfigFile(configPath, 'ceo', 'openai/gpt-4.1')
  assert(result.ok, result.error || 'Expected update to succeed')

  const durable = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(durable.agents.entries?.ceo, 'Expected canonical keyed agent entry to be persisted')
  assert(!('list' in durable.agents), 'Expected legacy agent list to be removed')
  const updated = readMaterializedConfig(configPath)
  assert(updated.agents.list[0].model === 'openai/gpt-4.1', 'Expected model to be updated')
  assert(updated.agents.defaults.models['openai/gpt-4.1'] !== undefined, 'Expected selected model to be added to the OpenClaw override allowlist')
  assert(!('lastTouchedAt' in (updated.meta || {})), 'Expected unsupported timestamp metadata to be omitted')
})

test('updateAgentModelInConfigFile is a no-op when the normalized model is unchanged', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')
  const original = {
    gateway: {
      auth: { token: 'stable-token' },
    },
    agents: {
      defaults: { models: { 'openai/gpt-4o-mini': {} } },
      list: [
        { id: 'ceo', name: 'CEO', model: 'openai/gpt-4o-mini' }
      ]
    },
    meta: {
      lastTouchedAt: '2026-07-05T12:00:00.000Z'
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(original, null, 2))
  const before = fs.readFileSync(configPath, 'utf-8')

  const result = updateAgentModelInConfigFile(configPath, 'ceo', 'gpt4o-mini')
  assert(result.ok, result.error || 'Expected update to succeed')
  assert(result.changed === false, 'Expected unchanged model to report no change')

  const after = fs.readFileSync(configPath, 'utf-8')
  assert(after === before, 'Expected config file to remain unchanged for a no-op model update')
})

test('normalizeAgentModelInput qualifies common OpenAI aliases', () => {
  assert(normalizeAgentModelInput('gpt-4o-mini') === 'openai/gpt-4o-mini', 'Expected bare gpt-4o-mini to become openai-qualified')
  assert(normalizeAgentModelInput('gpt4o-mini') === 'openai/gpt-4o-mini', 'Expected compact gpt4o-mini to normalize')
  assert(normalizeAgentModelInput('gpt40-mini') === 'openai/gpt-4o-mini', 'Expected common zero/o typo to normalize')
  assert(normalizeAgentModelInput('gpt-4o') === 'openai/gpt-4.1', 'Expected retired gpt-4o alias to normalize to gpt-4.1')
  assert(normalizeAgentModelInput('openai/gpt-4o') === 'openai/gpt-4.1', 'Expected retired qualified gpt-4o to normalize to gpt-4.1')
  assert(normalizeAgentModelInput('ollama/qwen2.5:latest') === 'ollama/qwen2.5:latest', 'Expected qualified Ollama model to stay unchanged')
})

test('updateAgentModelInConfigFile updates the matching workspace record when ids collide', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')
  const staleWorkspace = path.join(tmpDir, 'workspace-a', 'AGENTS', 'ceo')
  const activeWorkspace = path.join(tmpDir, 'workspace-b', 'AGENTS', 'ceo')

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'ceo', workspace: staleWorkspace, model: 'anthropic/claude-opus-4-6' },
        { id: 'ceo', workspace: activeWorkspace, model: 'anthropic/claude-opus-4-6' }
      ]
    }
  }, null, 2))

  const result = updateAgentModelInConfigFile(configPath, 'ceo', 'ollama/qwen2.5:latest', { workspacePath: activeWorkspace })
  assert(result.ok, result.error || 'Expected workspace-targeted update to succeed')

  const updated = readMaterializedConfig(configPath)
  assert(updated.agents.list.length === 1, 'Expected duplicate legacy records to converge to one canonical entry')
  assert(updated.agents.list[0].workspace === activeWorkspace, 'Expected the active workspace record to be retained')
  assert(updated.agents.list[0].model === 'ollama/qwen2.5:latest', 'Expected active workspace record to be updated')
})

test('upsertAgentModelInConfigFile moves a stale same-id record to the active workspace', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')
  const staleWorkspace = path.join(tmpDir, 'workspace-a', 'AGENTS', 'ceo')
  const activeWorkspace = path.join(tmpDir, 'workspace-b', 'AGENTS', 'ceo')
  const activeAgentDir = path.join(tmpDir, 'runtime', 'agents', 'ceo', 'agent')

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'ceo', workspace: staleWorkspace, model: 'ollama/qwen2.5:latest' }
      ]
    }
  }, null, 2))

  const result = upsertAgentModelInConfigFile(configPath, 'ceo', 'gpt4o-mini', {
    workspacePath: activeWorkspace,
    agentDir: activeAgentDir,
    name: 'CEO',
  })
  assert(result.ok, result.error || 'Expected upsert to succeed')
  assert(result.changed === true, 'Expected upsert to report a changed config')
  assert(result.model === 'openai/gpt-4o-mini', 'Expected upsert to report normalized model')

  const updated = readMaterializedConfig(configPath)
  assert(updated.agents.list.length === 1, 'Expected one canonical record for the agent id')
  assert(updated.agents.list[0].workspace === activeWorkspace, 'Expected active workspace path on canonical record')
  assert(updated.agents.list[0].agentDir === activeAgentDir, 'Expected runtime agent dir on canonical record')
  assert(updated.agents.list[0].model === 'openai/gpt-4o-mini', 'Expected canonical record to use normalized model')
  assert(updated.agents.defaults.models['openai/gpt-4o-mini'] !== undefined, 'Expected upserted model to be allowed for runtime overrides')
})

test('upsertAgentModelInConfigFile updates the exact active workspace record', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')
  const activeWorkspace = path.join(tmpDir, 'workspace', 'AGENTS', 'simple-agent')

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'simple-agent', workspace: activeWorkspace, model: 'ollama/qwen2.5:latest' }
      ]
    }
  }, null, 2))

  const result = upsertAgentModelInConfigFile(configPath, 'simple-agent', 'openai/gpt-4o-mini', { workspacePath: activeWorkspace })
  assert(result.ok, result.error || 'Expected upsert update to succeed')
  assert(result.changed === true, 'Expected exact workspace update to report changed')

  const updated = readMaterializedConfig(configPath)
  assert(updated.agents.list.length === 1, 'Expected exact workspace update not to append a duplicate')
  assert(updated.agents.list[0].model === 'openai/gpt-4o-mini', 'Expected active workspace model to be updated')
})

test('upsertAgentModelInConfigFile is a no-op when the exact workspace record already matches', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')
  const activeWorkspace = path.join(tmpDir, 'workspace', 'AGENTS', 'simple-agent')
  const original = {
    agents: {
      defaults: { models: { 'openai/gpt-4o-mini': {} } },
      list: [
        { id: 'simple-agent', workspace: activeWorkspace, model: 'openai/gpt-4o-mini' }
      ]
    },
    meta: {
      lastTouchedAt: '2026-07-05T12:00:00.000Z'
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(original, null, 2))
  const before = fs.readFileSync(configPath, 'utf-8')

  const result = upsertAgentModelInConfigFile(configPath, 'simple-agent', 'gpt4o-mini', { workspacePath: activeWorkspace })
  assert(result.ok, result.error || 'Expected upsert to succeed')
  assert(result.changed === false, 'Expected matching workspace model to report no change')

  const after = fs.readFileSync(configPath, 'utf-8')
  assert(after === before, 'Expected config file to remain unchanged for a no-op upsert')
})

test('upsertAgentModelInConfigFile writes a new agent when its model is already allowed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')
  const workspacePath = path.join(tmpDir, 'workspace', 'AGENTS', 'new-agent')

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      defaults: {
        models: {
          'openai/gpt-4o-mini': {},
        },
      },
      list: [],
    },
  }, null, 2))

  const result = upsertAgentModelInConfigFile(configPath, 'new-agent', 'openai/gpt-4o-mini', {
    workspacePath,
  })
  assert(result.ok, result.error || 'Expected upsert to succeed')
  assert(result.changed === true, 'Expected a newly inserted agent to report a change')

  const updated = readMaterializedConfig(configPath)
  assert(updated.agents.list.length === 1, 'Expected the new agent record to be persisted')
  assert(updated.agents.list[0].id === 'new-agent', 'Expected the persisted agent id')
  assert(updated.agents.list[0].model === 'openai/gpt-4o-mini', 'Expected the persisted agent model')
})

test('updateAgentModelInConfigFile rejects missing agent', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')

  fs.writeFileSync(configPath, JSON.stringify({
    agents: { list: [] }
  }, null, 2))

  const result = updateAgentModelInConfigFile(configPath, 'missing', 'openai/gpt-4.1')
  assert(!result.ok, 'Expected update to fail')
  assert((result.error || '').includes('not found'), 'Expected missing agent error')
})

test('parseIdentity extracts model from markdown', () => {
  const identity = parseIdentity(`# Identity

**Agent ID:** ceo
**Name:** CEO
**Model:** openai/gpt-4.1
`)

  assert(identity.model === 'openai/gpt-4.1', 'Expected parseIdentity to extract model')
})

test('parseIdentity extracts backup model from markdown', () => {
  const identity = parseIdentity(`# Identity

**Agent ID:** ceo
**Name:** CEO
**Model:** openai/gpt-4.1
**Backup Model:** anthropic/claude-sonnet-4-20250514
`)

  assert(identity.backupModel === 'anthropic/claude-sonnet-4-20250514', 'Expected parseIdentity to extract backup model')
})

test('upsertAgentModelFitInIdentityContent persists and parses automatic model settings', () => {
  const updated = upsertAgentModelFitInIdentityContent(`# Identity

- **Name:** Double Agent
- **Model:** openai/gpt-5.5

## Creation Metadata

- **Model:** original/model
`, 'auto', 'cost')

  const parsed = parseIdentity(updated)
  assert(parsed.modelSelection === 'auto', 'Expected automatic selection mode to parse')
  assert(parsed.modelPreference === 'cost', 'Expected cost priority to parse')
  assert(updated.indexOf('**Model Selection:**') < updated.indexOf('## Creation Metadata'), 'Expected runtime settings before creation metadata')
})

test('upsertAgentModelFitInIdentityContent replaces model settings without duplicating fields', () => {
  const updated = upsertAgentModelFitInIdentityContent(`# Identity

- **Model:** openai/gpt-5.5
- **Model Selection:** auto
- **Model Priority:** cost
`, 'manual', 'quality')

  assert((updated.match(/\*\*Model Selection:\*\*/g) || []).length === 1, 'Expected one selection field')
  assert((updated.match(/\*\*Model Priority:\*\*/g) || []).length === 1, 'Expected one priority field')
  const parsed = parseIdentity(updated)
  assert(parsed.modelSelection === 'manual', 'Expected manual selection mode')
  assert(parsed.modelPreference === 'quality', 'Expected quality priority')
})

test('parseIdentity extracts model from legacy bullet format and keeps empty WhatsApp null', () => {
  const identity = parseIdentity(`# Identity: CEO

- **Agent ID:** ceo
- **Name:** CEO
- **WhatsApp:**
- **Model:** openai/gpt-4.1
- **Tags:** leadership, executive
`)

  assert(identity.model === 'openai/gpt-4.1', 'Expected parseIdentity to extract bullet-list model')
  assert(identity.whatsapp === null, 'Expected empty WhatsApp to normalize to null')
  assert(Array.isArray(identity.tags) && identity.tags.includes('leadership'), 'Expected tags to still parse after empty WhatsApp')
})

test('parseIdentity ignores creation metadata model when no runtime model exists', () => {
  const identity = parseIdentity(`# IDENTITY.md - Who Am I?

- **Name:** simple-agent
- **Creature:** Basic Assistant
- **Vibe:** Casual
- **Emoji:** 📝
- **WhatsApp:**
- **Tags:** basic, assistant, general

## Creation Metadata

- **Created:** 2026-05-21T20:35:20.838Z
- **Model:** openai/gpt-4o-mini
- **Tags:** basic, assistant, general
`)

  assert(identity.model === undefined, 'Expected metadata model not to be treated as runtime model')
})

test('upsertAgentModelInIdentityContent inserts model into bootstrap identity template', () => {
  const content = `# IDENTITY.md - Who Am I?

_Fill this in during your first conversation. Make it yours._

- **Name:**
  _(pick something you like)_
- **Creature:**
  _(AI? robot? familiar? ghost in the machine? something weirder?)_
- **Vibe:**
  _(how do you come across? sharp? warm? chaotic? calm?)_
- **Emoji:**
  _(your signature — pick one that feels right)_
- **Avatar:**
  _(workspace-relative path, http(s) URL, or data URI)_`

  const updated = upsertAgentModelInIdentityContent(content, 'ollama/qwen2.5:latest')
  assert(updated.includes('- **Model:** ollama/qwen2.5:latest'), 'Expected model line inserted')
  const parsed = parseIdentity(updated)
  assert(parsed.model === 'ollama/qwen2.5:latest', 'Expected inserted model to parse correctly')
})

test('upsertAgentModelInIdentityContent inserts runtime model before creation metadata', () => {
  const updated = upsertAgentModelInIdentityContent(`# IDENTITY.md - Who Am I?

- **Name:** simple-agent
- **Creature:** Basic Assistant
- **Vibe:** Casual
- **Emoji:** 📝
- **WhatsApp:**
- **Tags:** basic, assistant, general

## Creation Metadata

- **Created:** 2026-05-21T20:35:20.838Z
- **Model:** ollama/qwen2.5:latest
`, 'gpt4o-mini')

  const runtimeModelIndex = updated.indexOf('- **Model:** openai/gpt-4o-mini')
  const metadataIndex = updated.indexOf('## Creation Metadata')
  const metadataModelIndex = updated.indexOf('- **Model:** ollama/qwen2.5:latest')
  assert(runtimeModelIndex !== -1, 'Expected runtime model line to be inserted')
  assert(runtimeModelIndex < metadataIndex, 'Expected runtime model to appear before creation metadata')
  assert(metadataModelIndex > metadataIndex, 'Expected creation metadata model to remain metadata')
  const parsed = parseIdentity(updated)
  assert(parsed.model === 'openai/gpt-4o-mini', 'Expected inserted runtime model to parse correctly')
})

test('upsertAgentModelInIdentityContent normalizes OpenAI aliases', () => {
  const updated = upsertAgentModelInIdentityContent(`# Identity

- **Name:** Simple Agent
- **Model:** ollama/qwen2.5:latest
`, 'gpt40-mini')

  const parsed = parseIdentity(updated)
  assert(parsed.model === 'openai/gpt-4o-mini', 'Expected identity model alias to normalize')
})

test('upsertAgentTagsInIdentityContent preserves caller order before creation metadata', () => {
  const content = `# Identity

- **Name:** Probe
- **Role:** Collector
- **Tags:** old, values

## Creation Metadata

- **Tags:** historical
`
  const updated = upsertAgentTagsInIdentityContent(content, ['acceptance-probe', 'read-only', 'acceptance-probe'])
  assert(updated.includes('- **Tags:** acceptance-probe, read-only'), 'Expected ordered unique tags')
  assert(updated.indexOf('acceptance-probe') < updated.indexOf('## Creation Metadata'), 'Expected runtime tags before metadata')
  assert(updated.includes('- **Tags:** historical'), 'Expected creation metadata to remain unchanged')
})

test('upsertAgentTagsInIdentityContent inserts missing tags and removes an empty selection', () => {
  const inserted = upsertAgentTagsInIdentityContent('# Identity\n\n- **Name:** Probe\n', ['first', 'second'])
  assert(inserted.includes('- **Tags:** first, second'), 'Expected missing tags line to be inserted')
  const removed = upsertAgentTagsInIdentityContent(inserted, [])
  assert(!removed.includes('**Tags:**'), 'Expected empty tag selection to remove the runtime tags line')
})

test('parseIdentity extracts runtime pin from markdown', () => {
  const identity = parseIdentity(`# Identity

**Agent ID:** ceo
**Name:** CEO
**Model:** anthropic/claude-sonnet-4-20250514
**Runtime:** claude
`)

  assert(identity.runtime === 'claude', 'Expected parseIdentity to extract runtime')
})

test('parseIdentity leaves runtime undefined when no Runtime field is present', () => {
  const identity = parseIdentity(`# Identity

**Agent ID:** ceo
**Name:** CEO
**Model:** openai/gpt-4.1
`)

  assert(identity.runtime === undefined, 'Expected no runtime field to parse as undefined')
})

test('parseIdentity ignores creation metadata runtime when no runtime-section runtime exists', () => {
  const identity = parseIdentity(`# IDENTITY.md - Who Am I?

- **Name:** simple-agent
- **Model:** openai/gpt-4o-mini

## Creation Metadata

- **Created:** 2026-05-21T20:35:20.838Z
- **Runtime:** droid
`)

  assert(identity.runtime === undefined, 'Expected metadata runtime not to be treated as the pinned runtime')
})

test('upsertAgentRuntimeInIdentityContent inserts runtime line after the Model line', () => {
  const updated = upsertAgentRuntimeInIdentityContent(`# Identity

- **Name:** Simple Agent
- **Model:** anthropic/claude-sonnet-4-20250514
- **Tags:** basic
`, 'claude')

  assert(updated.includes('- **Runtime:** claude'), 'Expected runtime line to be inserted')
  const modelIndex = updated.indexOf('- **Model:**')
  const runtimeIndex = updated.indexOf('- **Runtime:** claude')
  assert(runtimeIndex > modelIndex, 'Expected runtime line to be inserted after the model line')
  const parsed = parseIdentity(updated)
  assert(parsed.runtime === 'claude', 'Expected inserted runtime to parse correctly')
  assert(parsed.model === 'anthropic/claude-sonnet-4-20250514', 'Expected model to remain unchanged')
})

test('upsertAgentRuntimeInIdentityContent inserts runtime before creation metadata', () => {
  const updated = upsertAgentRuntimeInIdentityContent(`# IDENTITY.md - Who Am I?

- **Name:** simple-agent
- **Model:** openai/gpt-4o-mini

## Creation Metadata

- **Created:** 2026-05-21T20:35:20.838Z
- **Model:** openai/gpt-4o-mini
`, 'droid')

  const runtimeIndex = updated.indexOf('- **Runtime:** droid')
  const metadataIndex = updated.indexOf('## Creation Metadata')
  assert(runtimeIndex !== -1, 'Expected runtime line to be inserted')
  assert(runtimeIndex < metadataIndex, 'Expected runtime line to appear before creation metadata')
  const parsed = parseIdentity(updated)
  assert(parsed.runtime === 'droid', 'Expected inserted runtime to parse correctly')
})

test('upsertAgentRuntimeInIdentityContent replaces an existing runtime line in place', () => {
  const content = `# Identity

- **Name:** Simple Agent
- **Model:** anthropic/claude-sonnet-4-20250514
- **Runtime:** claude
`
  const updated = upsertAgentRuntimeInIdentityContent(content, 'openclaw')
  assert(!updated.includes('- **Runtime:** claude'), 'Expected old runtime value to be replaced')
  assert(updated.includes('- **Runtime:** openclaw'), 'Expected new runtime value to be present')
  assert((updated.match(/\*\*Runtime:\*\*/g) || []).length === 1, 'Expected exactly one runtime line')
})

test('upsertAgentRuntimeInIdentityContent removes the runtime line when set to default', () => {
  const content = `# Identity

- **Name:** Simple Agent
- **Model:** anthropic/claude-sonnet-4-20250514
- **Runtime:** claude
- **Tags:** basic
`
  const updated = upsertAgentRuntimeInIdentityContent(content, 'default')
  assert(!/\*\*Runtime:\*\*/.test(updated), 'Expected runtime line to be removed')
  const parsed = parseIdentity(updated)
  assert(parsed.runtime === undefined, 'Expected runtime to no longer parse after removal')
  assert(parsed.model === 'anthropic/claude-sonnet-4-20250514', 'Expected model line to survive removal untouched')
  assert(Array.isArray(parsed.tags) && parsed.tags.includes('basic'), 'Expected tags line to survive removal untouched')
})

test('upsertAgentRuntimeInIdentityContent is a no-op for default when no runtime line exists', () => {
  const content = `# Identity

- **Name:** Simple Agent
- **Model:** anthropic/claude-sonnet-4-20250514
`
  const updated = upsertAgentRuntimeInIdentityContent(content, 'default')
  assert(updated === content, 'Expected content to be unchanged when clearing a runtime that was never set')
})

test('upsertAgentBackupModelInIdentityContent inserts backup model after the primary model', () => {
  const updated = upsertAgentBackupModelInIdentityContent(`# Identity

- **Name:** Simple Agent
- **Model:** openai/gpt-4o-mini
`, 'anthropic/claude-sonnet-4-20250514')

  assert(updated.includes('- **Backup Model:** anthropic/claude-sonnet-4-6'), 'Expected backup model line inserted')
  const parsed = parseIdentity(updated)
  assert(parsed.backupModel === 'anthropic/claude-sonnet-4-6', 'Expected inserted backup model to parse correctly')
})

test('updateAgentBackupModelInConfigFile strips unsupported backup model from openclaw.json while preserving returned value', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'ceo', name: 'CEO', model: 'openai/gpt-4.1', backupModel: 'anthropic/claude-3-haiku-20240307' }
      ]
    }
  }, null, 2))

  const result = updateAgentBackupModelInConfigFile(configPath, 'ceo', 'anthropic/claude-sonnet-4-20250514')
  assert(result.ok, result.error || 'Expected backup model update to succeed')
  assert(result.backupModel === 'anthropic/claude-sonnet-4-6', 'Expected normalized backup model result')

  const updated = readMaterializedConfig(configPath)
  assert(!('backupModel' in updated.agents.list[0]), 'Expected unsupported backupModel key to be removed from openclaw.json')
})

test('updateAgentModelInConfigFile strips stale unsupported backup model keys while updating primary model', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'ceo', name: 'CEO', model: 'openai/gpt-4o-mini', backupModel: 'anthropic/claude-sonnet-4-6' }
      ]
    }
  }, null, 2))

  const result = updateAgentModelInConfigFile(configPath, 'ceo', 'openai/gpt-4.1')
  assert(result.ok, result.error || 'Expected model update to succeed')

  const updated = readMaterializedConfig(configPath)
  assert(updated.agents.list[0].model === 'openai/gpt-4.1', 'Expected primary model update to persist')
  assert(!('backupModel' in updated.agents.list[0]), 'Expected stale unsupported backupModel key to be scrubbed')
})

test('resetAgentSessionsForModelChange archives runtime session state', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'ceo', 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), '{"agent:ceo:main":{"model":"claude-opus-4-6"}}', 'utf-8')
  fs.writeFileSync(path.join(sessionsDir, 'session-a.jsonl'), '{"type":"message"}\n', 'utf-8')

  const result = resetAgentSessionsForModelChange(home, 'ceo')
  assert(result.ok, result.error || 'Expected session reset to succeed')
  assert(!fs.existsSync(path.join(sessionsDir, 'sessions.json')), 'Expected sessions.json moved out of live sessions dir')
  assert(!fs.existsSync(path.join(sessionsDir, 'session-a.jsonl')), 'Expected session jsonl moved out of live sessions dir')
  const archiveDir = path.join(sessionsDir, 'archive')
  const archived = fs.readdirSync(archiveDir)
  assert(archived.some(name => name.endsWith('sessions.json')), 'Expected archived sessions index')
  assert(archived.some(name => name.endsWith('session-a.jsonl')), 'Expected archived session transcript')
})

setTimeout(() => {
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
}, 0)
