import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolveDefaultAgentModel } from './agent-default-model'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

async function main() {
  console.log(`\n${YELLOW}=== Agent Default Model Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-default-model-'))
  const originalHome = process.env.HOME
  const originalWorkspace = process.env.OPENCLAW_WORKSPACE
  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = path.join(tmpHome, '.openclaw', 'workspace')

  try {
    await test('workspace preferred model wins when available', () => {
      const systemDir = path.join(tmpHome, '.openclaw', 'workspace', 'SYSTEM')
      fs.mkdirSync(systemDir, { recursive: true })
      fs.writeFileSync(path.join(systemDir, 'integrations.json'), JSON.stringify({ preferredModel: 'openai/gpt-4.1' }, null, 2))
      const resolved = resolveDefaultAgentModel({
        availableModels: ['openai/gpt-4.1', 'openai/gpt-5'],
        rawEnv: { SYSTEM_OPENAI_API_KEY: 'key' },
      })
      assert.equal(resolved, 'openai/gpt-4.1')
    })

    await test('on-prem ollama default resolves when enabled', () => {
      const systemDir = path.join(tmpHome, '.openclaw', 'workspace', 'SYSTEM')
      fs.mkdirSync(systemDir, { recursive: true })
      fs.writeFileSync(path.join(systemDir, 'integrations.json'), JSON.stringify({
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaDefaultModel: 'qwen2.5:latest',
      }, null, 2))
      const resolved = resolveDefaultAgentModel({
        availableModels: ['ollama/qwen2.5:latest'],
        rawEnv: { DASHBOARD_PORT: '3001' },
      })
      assert.equal(resolved, 'ollama/qwen2.5:latest')
    })

    await test('workspace openai-compatible default resolves even without cached hosted models', () => {
      const systemDir = path.join(tmpHome, '.openclaw', 'workspace', 'SYSTEM')
      fs.mkdirSync(systemDir, { recursive: true })
      fs.writeFileSync(path.join(systemDir, 'integrations.json'), JSON.stringify({
        openaiCompatibleBaseUrl: 'http://host.containers.internal:1234/v1',
        openaiCompatibleDefaultModel: 'lmstudio-community',
      }, null, 2))
      const resolved = resolveDefaultAgentModel({
        rawEnv: { DASHBOARD_PORT: '3001' },
      })
      assert.equal(resolved, 'openai-compatible/lmstudio-community')
    })

    await test('workspace ollama default resolves even without cached hosted models', () => {
      const systemDir = path.join(tmpHome, '.openclaw', 'workspace', 'SYSTEM')
      fs.mkdirSync(systemDir, { recursive: true })
      fs.writeFileSync(path.join(systemDir, 'integrations.json'), JSON.stringify({
        ollamaBaseUrl: 'http://host.containers.internal:11434',
        ollamaDefaultModel: 'llama3.2:latest',
      }, null, 2))
      const resolved = resolveDefaultAgentModel({
        rawEnv: { DASHBOARD_PORT: '3001' },
      })
      assert.equal(resolved, 'ollama/llama3.2:latest')
    })

    await test('returns undefined when no execution path exists', () => {
      const systemDir = path.join(tmpHome, '.openclaw', 'workspace', 'SYSTEM')
      fs.mkdirSync(systemDir, { recursive: true })
      fs.writeFileSync(path.join(systemDir, 'integrations.json'), JSON.stringify({}, null, 2))
      const resolved = resolveDefaultAgentModel({
        availableModels: [],
        rawEnv: {},
      })
      assert.equal(resolved, undefined)
    })

    await test('stale unsupported workspace preferred model falls back to supported recommended model', () => {
      const systemDir = path.join(tmpHome, '.openclaw', 'workspace', 'SYSTEM')
      fs.mkdirSync(systemDir, { recursive: true })
      fs.writeFileSync(path.join(systemDir, 'integrations.json'), JSON.stringify({ preferredModel: 'openai/gpt-5.5' }, null, 2))
      const resolved = resolveDefaultAgentModel({
        availableModels: ['openai/gpt-5', 'openai/gpt-4.1'],
        rawEnv: { SYSTEM_OPENAI_API_KEY: 'key' },
      })
      assert.equal(resolved, 'openai/gpt-5')
    })
  } finally {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    if (originalWorkspace === undefined) delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  }

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) process.exit(1)
}

main().catch((err: any) => {
  console.log(`${RED}Test suite crashed${RESET}`)
  console.log(`  Error: ${err?.message || String(err)}`)
  process.exit(1)
})
