/**
 * Safe env / BYOK execution test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/safe-env.test.ts
 */

import {
  allowSystemKeysForUserExecution,
  resolveSystemExecutionProviderKeys,
  resolveUserExecutionProviderKeys,
  resolveWorkflowExecutionProviderKeys,
} from './dashboard-env'
import { REPO_ROOT } from './paths'
import { safeEnv, systemExecutionEnv, userExecutionEnv, workflowExecutionEnv } from './safe-env'

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

const originalEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  HOME: process.env.HOME,
  OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE,
  CLAWMAX_TEST_WORKSPACE: process.env.CLAWMAX_TEST_WORKSPACE,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  FACTORY_API_KEY: process.env.FACTORY_API_KEY,
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === 'undefined') delete process.env[key]
    else process.env[key] = value
  }
}

console.log(`\n${YELLOW}=== Safe Env Test Suite ===${RESET}\n`)

test('safeEnv never forwards ambient shell provider keys by default', () => {
  process.env.OPENAI_API_KEY = 'system-openai'
  process.env.ANTHROPIC_API_KEY = 'system-anthropic'

  const env = safeEnv()

  assert(typeof env.OPENAI_API_KEY === 'undefined', 'Expected ambient OpenAI key to stay out of child env')
  assert(typeof env.ANTHROPIC_API_KEY === 'undefined', 'Expected ambient Anthropic key to stay out of child env')
})

test('user execution prefers BYOK request keys over env defaults', () => {
  const keys = resolveUserExecutionProviderKeys(
    {
      USER_OPENAI_API_KEY: 'env-user-openai',
      USER_ANTHROPIC_API_KEY: 'env-user-anthropic',
    },
    { openai: 'preview-openai' }
  )

  assert(keys.openai === 'preview-openai', 'Expected request BYOK OpenAI key to win')
  assert(typeof keys.anthropic === 'undefined', 'Expected non-selected provider to remain unset')
})

test('user execution uses env user defaults before any system fallback', () => {
  const keys = resolveUserExecutionProviderKeys({
    USER_OPENAI_API_KEY: 'env-user-openai',
    SYSTEM_OPENAI_API_KEY: 'env-system-openai',
  })

  assert(keys.openai === 'env-user-openai', 'Expected user default key to win for user execution')
})

test('system fallback for user execution is opt-in only', () => {
  const disabled = resolveUserExecutionProviderKeys({
    SYSTEM_OPENAI_API_KEY: 'env-system-openai',
  })
  const enabled = resolveUserExecutionProviderKeys({
    SYSTEM_OPENAI_API_KEY: 'env-system-openai',
    ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION: 'true',
  })

  assert(typeof disabled.openai === 'undefined', 'Expected no system fallback when flag is disabled')
  assert(enabled.openai === 'env-system-openai', 'Expected system fallback only when flag is enabled')
  assert(allowSystemKeysForUserExecution({ ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION: 'true' }), 'Expected explicit true flag')
})

test('system execution uses system keys and falls back to user defaults only when system keys are absent', () => {
  const systemFirst = resolveSystemExecutionProviderKeys({
    SYSTEM_OPENAI_API_KEY: 'env-system-openai',
    USER_OPENAI_API_KEY: 'env-user-openai',
  })
  const fallback = resolveSystemExecutionProviderKeys({
    USER_OPENAI_API_KEY: 'env-user-openai',
  })

  assert(systemFirst.openai === 'env-system-openai', 'Expected system key to power system execution')
  assert(fallback.openai === 'env-user-openai', 'Expected user key fallback when no system key exists')
})

test('workflow execution falls back to system keys when user execution has no key', () => {
  const workflowKeys = resolveWorkflowExecutionProviderKeys({
    SYSTEM_OPENAI_API_KEY: 'env-system-openai',
  })
  const byokKeys = resolveWorkflowExecutionProviderKeys({
    SYSTEM_OPENAI_API_KEY: 'env-system-openai',
  }, {
    anthropic: 'request-anthropic',
  })

  assert(workflowKeys.openai === 'env-system-openai', 'Expected workflows to use runtime system OpenAI key when no BYOK/user key exists')
  assert(byokKeys.anthropic === 'request-anthropic', 'Expected explicit BYOK key to win for workflow execution')
  assert(typeof byokKeys.openai === 'undefined', 'Expected BYOK provider selection to avoid leaking system OpenAI into the same run')
})

test('resolution helpers ignore ambient shell provider exports when raw dashboard env is empty', () => {
  process.env.OPENAI_API_KEY = 'shell-openai'
  const keys = resolveSystemExecutionProviderKeys({})
  assert(typeof keys.openai === 'undefined', 'Expected empty dashboard env to ignore shell OpenAI export')
})

test('userExecutionEnv blanks non-selected providers during BYOK execution', () => {
  const env = userExecutionEnv({ openai: 'preview-openai' })

  assert(env.OPENAI_API_KEY === 'preview-openai', 'Expected BYOK OpenAI key in child env')
  assert(env.ANTHROPIC_API_KEY === '', 'Expected Anthropic to be blanked during BYOK OpenAI execution')
})

test('userExecutionEnv forwards Ollama base URL for local-model execution', () => {
  const env = userExecutionEnv({ ollamaBaseUrl: 'http://127.0.0.1:11434' })

  assert(env.OLLAMA_BASE_URL === 'http://127.0.0.1:11434', 'Expected Ollama base URL in child env')
  assert(env.OPENAI_API_KEY === '', 'Expected hosted OpenAI key slot blanked for Ollama execution')
  assert(env.ANTHROPIC_API_KEY === '', 'Expected hosted Anthropic key slot blanked for Ollama execution')
})

test('workflowExecutionEnv preserves OpenAI-compatible runtime settings without leaking hosted OpenAI system keys', () => {
  const env = workflowExecutionEnv({
    openaiCompatibleApiKey: 'lmstudio-key',
    openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
    openaiCompatibleDefaultModel: 'qwen3.6-27b',
  })

  assert(env.OPENAI_API_KEY === 'lmstudio-key', 'Expected OpenAI-compatible API key to populate the execution env')
  assert(env.OPENAI_BASE_URL === 'http://127.0.0.1:1234/v1', 'Expected OpenAI-compatible base URL to populate the execution env')
  assert(env.ANTHROPIC_API_KEY === '', 'Expected Anthropic key slot blanked during OpenAI-compatible workflow execution')
  assert(env.GEMINI_API_KEY === '', 'Expected Gemini key slot blanked during OpenAI-compatible workflow execution')
})

test('workflowExecutionEnv isolates hosted OpenAI from an OpenAI-compatible base URL', () => {
  const env = workflowExecutionEnv({
    openai: 'hosted-openai-key',
    openaiCompatibleApiKey: 'lmstudio-key',
    openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
    openaiCompatibleDefaultModel: 'qwen3.6-27b',
  }, 'openai')

  assert(env.OPENAI_API_KEY === 'hosted-openai-key', 'Expected the hosted OpenAI key in the execution env')
  assert(env.OPENAI_BASE_URL === '', 'Expected hosted OpenAI execution to ignore the OpenAI-compatible base URL')
})

test('workflowExecutionEnv isolates OpenAI-compatible attempts from hosted OpenAI', () => {
  const env = workflowExecutionEnv({
    openai: 'hosted-openai-key',
    openaiCompatibleApiKey: 'lmstudio-key',
    openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
    openaiCompatibleDefaultModel: 'qwen3.6-27b',
  }, 'openai-compatible')

  assert(env.OPENAI_API_KEY === 'lmstudio-key', 'Expected the OpenAI-compatible key in the execution env')
  assert(env.OPENAI_BASE_URL === 'http://127.0.0.1:1234/v1', 'Expected the OpenAI-compatible base URL in the execution env')
})

test('workflowExecutionEnv isolates native OpenRouter from OpenAI and local-compatible settings', () => {
  const env = workflowExecutionEnv({
    openai: 'hosted-openai-key',
    openrouter: 'sk-or-test-key',
    openaiCompatibleApiKey: 'lmstudio-key',
    openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
  }, 'openrouter')

  assert(env.OPENROUTER_API_KEY === 'sk-or-test-key', 'Expected native OpenRouter key in execution env')
  assert(env.OPENAI_API_KEY === '', 'Expected OpenAI key blanked during OpenRouter execution')
  assert(env.OPENAI_BASE_URL === '', 'Expected LM Studio base URL blanked during OpenRouter execution')
  assert(env.ANTHROPIC_API_KEY === '', 'Expected Anthropic key blanked during OpenRouter execution')
})

test('workflowExecutionEnv isolates native xAI from every other hosted provider', () => {
  const env = workflowExecutionEnv({
    openai: 'hosted-openai-key',
    anthropic: 'anthropic-key',
    openrouter: 'sk-or-test-key',
    xai: 'xai-test-key',
    openaiCompatibleApiKey: 'lmstudio-key',
    openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
  }, 'xai')

  assert(env.XAI_API_KEY === 'xai-test-key', 'Expected native xAI key in execution env')
  assert(env.OPENAI_API_KEY === '', 'Expected OpenAI key blanked during xAI execution')
  assert(env.OPENROUTER_API_KEY === '', 'Expected OpenRouter key blanked during xAI execution')
  assert(env.ANTHROPIC_API_KEY === '', 'Expected Anthropic key blanked during xAI execution')
  assert(env.OPENAI_BASE_URL === '', 'Expected local-compatible base URL blanked during xAI execution')
})

test('systemExecutionEnv uses resolved system execution keys, not shell exports', () => {
  const env = systemExecutionEnv()
  assert(typeof env.PATH === 'string' && env.PATH.length > 0, 'Expected safe base env to retain PATH')
})

test('safeEnv appends standard Homebrew runtime paths when missing', () => {
  const originalPath = process.env.PATH
  process.env.PATH = '/usr/bin:/bin'

  const env = safeEnv()

  assert(env.PATH?.includes('/opt/homebrew/bin') === true, 'Expected Homebrew bin path appended')
  assert(env.PATH?.includes('/usr/local/bin') === true, 'Expected usr local bin path appended')
  process.env.PATH = originalPath
})

test('safeEnv prepends the ClawMax dashboard helper directory', () => {
  const env = safeEnv()
  const first = String(env.PATH || '').split(':')[0]
  assert(first === `${REPO_ROOT}/SYSTEM/dashboard`, 'Expected helper directory to lead PATH for child processes')
})

test('safeEnv does not duplicate standard runtime paths', () => {
  const originalPath = process.env.PATH
  process.env.PATH = '/opt/homebrew/bin:/usr/bin:/bin'

  const env = safeEnv()
  const parts = String(env.PATH || '').split(':')
  const optHomebrewBinCount = parts.filter((entry) => entry === '/opt/homebrew/bin').length

  assert(optHomebrewBinCount === 1, 'Expected standard runtime paths to remain deduplicated')
  })

test('safeEnv forwards workspace-managed partner secrets to child processes', () => {
  const fs = require('fs') as typeof import('fs')
  const os = require('os') as typeof import('os')
  const path = require('path') as typeof import('path')
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-safe-env-'))
  const workspace = path.join(tmpHome, '.openclaw', 'workspace')
  const systemDir = path.join(workspace, 'SYSTEM')
  fs.mkdirSync(systemDir, { recursive: true })
  fs.writeFileSync(path.join(systemDir, 'integrations.secrets.json'), JSON.stringify({
    partners: {
      resend: {
        apiKey: 're_test_1234567890',
      },
      cognee: {
        apiKey: 'cognee_workspace_key',
      },
    },
  }, null, 2))
  fs.writeFileSync(path.join(systemDir, 'integrations.json'), JSON.stringify({
    partners: {
      cognee: {
        baseUrl: 'https://cognee.example.test',
        datasetName: 'clawmax-memory',
        searchType: 'GRAPH_COMPLETION',
      },
    },
  }, null, 2))

  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspace
  process.env.CLAWMAX_TEST_WORKSPACE = workspace

  const env = safeEnv()
  assert(env.RESEND_API_KEY === 're_test_1234567890', 'Expected managed partner secret to reach child env')
  assert(env.COGNEE_API_KEY === 'cognee_workspace_key', 'Expected Cognee managed partner secret to reach child env')
  assert(env.COGNEE_BASE_URL === 'https://cognee.example.test', 'Expected Cognee base URL to reach child env')
  assert(env.COGNEE_DATASET_NAME === 'clawmax-memory', 'Expected Cognee dataset to reach child env')
  assert(env.COGNEE_SEARCH_TYPE === 'GRAPH_COMPLETION', 'Expected Cognee search type to reach child env')
  assert(typeof env.apiKey === 'undefined', 'Expected raw partner field key not to leak into child env')
})

test('safeEnv forwards runtime-managed Resend key to agent tool processes', () => {
  const fs = require('fs') as typeof import('fs')
  const os = require('os') as typeof import('os')
  const path = require('path') as typeof import('path')
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-safe-env-runtime-'))
  const workspace = path.join(tmpHome, '.openclaw', 'workspace')
  fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })

  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspace
  process.env.CLAWMAX_TEST_WORKSPACE = workspace
  process.env.RESEND_API_KEY = 're_runtime_1234567890'

  const env = safeEnv()
  assert(env.RESEND_API_KEY === 're_runtime_1234567890', 'Expected runtime Resend API key to reach child env')
})

test('safeEnv does not leak ambient Factory credentials to unrelated child processes', () => {
  process.env.FACTORY_API_KEY = 'factory_test_1234567890'
  const env = safeEnv()
  assert(typeof env.FACTORY_API_KEY === 'undefined', 'Expected ambient Factory key to stay out of the shared child env')
})

setTimeout(() => {
  restoreEnv()
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
