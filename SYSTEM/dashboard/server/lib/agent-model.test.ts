/**
 * Agent model update test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/agent-model.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  normalizeAgentModelInput,
  resetAgentSessionsForModelChange,
  updateAgentBackupModelInConfigFile,
  updateAgentModelInConfigFile,
  upsertAgentBackupModelInIdentityContent,
  upsertAgentModelFitInIdentityContent,
  upsertAgentModelInConfigFile,
  upsertAgentModelInIdentityContent,
  upsertAgentRuntimeInIdentityContent,
} from './agent-model'
import { parseIdentity } from './workspace'

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

console.log(`\n${YELLOW}=== Agent Model Test Suite ===${RESET}\n`)

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

  const updated = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(updated.agents.list[0].model === 'openai/gpt-4.1', 'Expected model to be updated')
  assert(updated.agents.defaults.models['openai/gpt-4.1'] !== undefined, 'Expected selected model to be added to the OpenClaw override allowlist')
  assert(typeof updated.meta?.lastTouchedAt === 'string', 'Expected metadata stamp to be written')
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

  const updated = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(updated.agents.list[0].model === 'anthropic/claude-opus-4-6', 'Expected stale duplicate record to remain unchanged')
  assert(updated.agents.list[1].model === 'ollama/qwen2.5:latest', 'Expected active workspace record to be updated')
})

test('upsertAgentModelInConfigFile creates an active workspace record without touching same-id stale records', () => {
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

  const updated = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(updated.agents.list.length === 2, 'Expected active workspace record to be appended')
  assert(updated.agents.list[0].model === 'ollama/qwen2.5:latest', 'Expected stale record to remain unchanged')
  assert(updated.agents.list[1].workspace === activeWorkspace, 'Expected active workspace path on appended record')
  assert(updated.agents.list[1].agentDir === activeAgentDir, 'Expected runtime agent dir on appended record')
  assert(updated.agents.list[1].model === 'openai/gpt-4o-mini', 'Expected appended record to use normalized model')
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

  const updated = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
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

  const updated = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
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

  const updated = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
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

  const updated = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
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
