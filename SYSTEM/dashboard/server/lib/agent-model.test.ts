/**
 * Agent model update test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/agent-model.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { normalizeAgentModelInput, resetAgentSessionsForModelChange, updateAgentModelInConfigFile, upsertAgentModelInConfigFile, upsertAgentModelInIdentityContent } from './agent-model'
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
  assert(typeof updated.meta?.lastTouchedAt === 'string', 'Expected metadata stamp to be written')
})

test('normalizeAgentModelInput qualifies common OpenAI aliases', () => {
  assert(normalizeAgentModelInput('gpt-4o-mini') === 'openai/gpt-4o-mini', 'Expected bare gpt-4o-mini to become openai-qualified')
  assert(normalizeAgentModelInput('gpt4o-mini') === 'openai/gpt-4o-mini', 'Expected compact gpt4o-mini to normalize')
  assert(normalizeAgentModelInput('gpt40-mini') === 'openai/gpt-4o-mini', 'Expected common zero/o typo to normalize')
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

test('upsertAgentModelInIdentityContent normalizes OpenAI aliases', () => {
  const updated = upsertAgentModelInIdentityContent(`# Identity

- **Name:** Simple Agent
- **Model:** ollama/qwen2.5:latest
`, 'gpt40-mini')

  const parsed = parseIdentity(updated)
  assert(parsed.model === 'openai/gpt-4o-mini', 'Expected identity model alias to normalize')
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
