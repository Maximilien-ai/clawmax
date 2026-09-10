import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolveDefaultAgentModel, warmDefaultAgentModelEndpoint } from './agent-default-model'
import { clearModelCache } from './model-discovery'

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

    await test('workspace system preferred model wins for built-in agents when available', () => {
      const systemDir = path.join(tmpHome, '.openclaw', 'workspace', 'SYSTEM')
      fs.mkdirSync(systemDir, { recursive: true })
      fs.writeFileSync(path.join(systemDir, 'integrations.json'), JSON.stringify({
        preferredModel: 'openai/gpt-4.1',
        systemPreferredModel: 'anthropic/claude-sonnet-4-20250514',
      }, null, 2))
      const resolved = resolveDefaultAgentModel({
        builtIn: true,
        availableModels: ['openai/gpt-4.1', 'anthropic/claude-sonnet-4-20250514', 'openai/gpt-5'],
        rawEnv: { SYSTEM_OPENAI_API_KEY: 'key', SYSTEM_ANTHROPIC_API_KEY: 'key' },
      })
      assert.equal(resolved, 'anthropic/claude-sonnet-4-20250514')
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

    await test('workspace endpoint with its credential in protected configuration falls back to the model it advertises', async () => {
      const systemDir = path.join(tmpHome, '.openclaw', 'workspace', 'SYSTEM')
      fs.mkdirSync(systemDir, { recursive: true })
      fs.writeFileSync(path.join(systemDir, 'integrations.json'), JSON.stringify({
        openaiCompatibleBaseUrl: 'http://172.16.1.70:8000/v1',
      }, null, 2))
      const originalFetch = global.fetch
      clearModelCache()
      try {
        global.fetch = (async (_url: string, init?: any) => {
          if (init?.headers?.Authorization !== 'Bearer system-secret') return { ok: false, status: 401, json: async () => ({}) } as any
          return { ok: true, status: 200, json: async () => ({ data: [{ id: 'authenticated-model' }] }) } as any
        }) as any
        const protectedEnv = {
          SYSTEM_OPENAI_COMPATIBLE_BASE_URL: 'http://172.16.1.70:8000/v1/',
          SYSTEM_OPENAI_COMPATIBLE_API_KEY: 'system-secret',
        }
        const cold = resolveDefaultAgentModel({ rawEnv: protectedEnv })
        assert.notEqual(cold, 'openai-compatible/authenticated-model', 'a cold cache cannot know the endpoint model yet')
        // What the provision route does at its request boundary before resolving.
        await warmDefaultAgentModelEndpoint(protectedEnv)
        const resolved = resolveDefaultAgentModel({ rawEnv: protectedEnv })
        assert.equal(resolved, 'openai-compatible/authenticated-model')
        const withoutCredential = resolveDefaultAgentModel({ rawEnv: { DASHBOARD_PORT: '3001' } })
        assert.notEqual(withoutCredential, 'openai-compatible/authenticated-model', 'a credential-less read must not see the credentialed catalog')
      } finally {
        global.fetch = originalFetch
        clearModelCache()
      }
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
