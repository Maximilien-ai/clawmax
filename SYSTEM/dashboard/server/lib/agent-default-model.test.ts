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
    await test('new and built-in agents replace retired explicit or preferred models', () => {
      for (const builtIn of [false, true]) {
        assert.equal(resolveDefaultAgentModel({ explicitModel: 'openai/gpt-4', builtIn }), 'openai/gpt-5.5')
        assert.equal(resolveDefaultAgentModel({ preferredModel: 'openai/gpt-4', builtIn,
          systemPreferredModel: builtIn ? 'openai/gpt-4' : undefined,
          availableModels: ['openai/gpt-4', 'openai/gpt-5.5'], rawEnv: { SYSTEM_OPENAI_API_KEY: 'fixture' },
        }), 'openai/gpt-5.5')
      }
      assert.equal(resolveDefaultAgentModel({ explicitModel: 'openai/gpt-4.1' }), 'openai/gpt-4.1')
      assert.equal(resolveDefaultAgentModel({ explicitModel: 'openai-compatible/gpt-4' }), 'openai-compatible/gpt-4')
    })
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

    // Discovery lists OpenAI models sorted by id, so deprecated gpt-4.1 comes first.
    const openAiSorted = ['openai/gpt-4.1', 'openai/gpt-4.1-mini', 'openai/gpt-4o', 'openai/gpt-5', 'openai/gpt-5.4-mini', 'openai/gpt-5.5']
    const withoutMini = openAiSorted.filter(model => model !== 'openai/gpt-5.4-mini')
    const useIntegrations = (config: Record<string, string>) => {
      const systemDir = path.join(tmpHome, '.openclaw', 'workspace', 'SYSTEM')
      fs.mkdirSync(systemDir, { recursive: true })
      fs.writeFileSync(path.join(systemDir, 'integrations.json'), JSON.stringify(config, null, 2))
    }

    await test('Auto never falls back to a deprecated model when the recommended one is not listed', () => {
      useIntegrations({})
      const rawEnv = { SYSTEM_OPENAI_API_KEY: 'key' }
      assert.equal(resolveDefaultAgentModel({ availableModels: openAiSorted, rawEnv }), 'openai/gpt-5.4-mini')
      assert.equal(resolveDefaultAgentModel({ availableModels: withoutMini, rawEnv }), 'openai/gpt-5')
      assert.equal(resolveDefaultAgentModel({ availableModels: ['openai/gpt-4.1', 'openai/gpt-4o'], rawEnv }), undefined)
    })

    await test('Auto across providers skips deprecated models from every provider', () => {
      useIntegrations({})
      const rawEnv = { SYSTEM_ANTHROPIC_API_KEY: 'key', SYSTEM_GEMINI_API_KEY: 'key' }
      // Neither provider's recommended model is listed, so the first current model is used.
      assert.equal(resolveDefaultAgentModel({ availableModels: ['anthropic/claude-sonnet-4-20250514', 'google/gemini-2.5-pro', 'anthropic/claude-sonnet-4-6'], rawEnv }), 'anthropic/claude-sonnet-4-6')
    })

    await test('saved deprecated defaults stay explicit, and new-agent and system defaults stay separate', () => {
      useIntegrations({ preferredModel: 'openai/gpt-4.1', systemPreferredModel: 'openai/gpt-4.1-mini' })
      const rawEnv = { SYSTEM_OPENAI_API_KEY: 'key' }
      assert.equal(resolveDefaultAgentModel({ availableModels: openAiSorted, rawEnv }), 'openai/gpt-4.1')
      assert.equal(resolveDefaultAgentModel({ builtIn: true, availableModels: openAiSorted, rawEnv }), 'openai/gpt-4.1-mini')
      useIntegrations({ systemPreferredModel: 'openai/gpt-4.1-mini' })
      assert.equal(resolveDefaultAgentModel({ availableModels: openAiSorted, rawEnv }), 'openai/gpt-5.4-mini', 'A system default must not become the new-agent default')
      assert.equal(resolveDefaultAgentModel({ explicitModel: 'openai/gpt-4.1', availableModels: openAiSorted, rawEnv }), 'openai/gpt-4.1')
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
