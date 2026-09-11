/**
 * Chat route edge-case helper test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/chat-edges.test.ts
 */

import {
  buildManagedResendDispatch,
  buildManagedSecretStatelessChatMessage,
  deriveChatError,
  evaluateChatExecutionReadiness,
  resolveByokChatFallbackModel,
  toChatReadinessResponse,
  resolveChatOpenAiCompatibleEndpoint,
  retryAssistantTextLookup,
  shouldUseLocalChatExecution,
} from './chat'
import { clearModelCache, resolveOpenAiCompatibleDefaultModel } from '../lib/model-discovery'
import { resetWorkspaceManagerForTests } from '../lib/workspace-manager'
import fs from 'fs'
import os from 'os'
import path from 'path'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0
let testChain: Promise<void> = Promise.resolve()

function test(name: string, fn: () => void | Promise<void>) {
  testChain = testChain.then(async () => {
    try {
      await fn()
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    } catch (err: any) {
      console.log(`${RED}✗${RESET} ${name}`)
      console.error(`  Error: ${err.message}`)
      testsFailed++
    }
  })
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Chat Route Edge Test Suite ===${RESET}\n`)

test('resolveByokChatFallbackModel returns undefined when no usable BYOK path exists', () => {
  clearModelCache()
  assert(resolveByokChatFallbackModel(undefined) === undefined, 'Expected undefined BYOK payload to return undefined')
  assert(resolveByokChatFallbackModel({ openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1' }) === undefined, 'Expected an unreachable endpoint with no default model to return undefined')
})

test('resolveByokChatFallbackModel uses the endpoint model once discovery has run', async () => {
  clearModelCache()
  const originalFetch = global.fetch
  try {
    global.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'text-embedding-small' }, { id: 'endpoint-chat-model' }] }),
    }) as any) as any
    // What the chat route now does before readiness is evaluated.
    await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://127.0.0.1:1234/v1' })
    const model = resolveByokChatFallbackModel({ openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1' })
    assert(model === 'openai-compatible/endpoint-chat-model', `Expected the endpoint's chat model, got ${model}`)
  } finally {
    global.fetch = originalFetch
    clearModelCache()
  }
})

test('an unreachable endpoint still yields no fallback model', async () => {
  clearModelCache()
  const originalFetch = global.fetch
  try {
    global.fetch = (async () => { throw new Error('ECONNREFUSED') }) as any
    await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://offline-endpoint:9999/v1' })
    const model = resolveByokChatFallbackModel({ openaiCompatibleBaseUrl: 'http://offline-endpoint:9999/v1' })
    assert(model === undefined, `Expected no fallback from an unreachable endpoint, got ${model}`)
  } finally {
    global.fetch = originalFetch
    clearModelCache()
  }
})

test('one endpoint seen through two credentials does not share a model catalog', async () => {
  clearModelCache()
  const originalFetch = global.fetch
  try {
    global.fetch = (async (_url: string, init?: any) => {
      const auth = init?.headers?.Authorization || ''
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: auth === 'Bearer key-a' ? 'tenant-a-model' : 'tenant-b-model' }] }),
      } as any
    }) as any
    await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://shared-gateway:8000/v1', apiKey: 'key-a' })
    const asB = resolveByokChatFallbackModel({ openaiCompatibleBaseUrl: 'http://shared-gateway:8000/v1', openaiCompatibleApiKey: 'key-b' })
    assert(asB === undefined, `Expected the second credential to see no cached catalog, got ${asB}`)
    const asA = resolveByokChatFallbackModel({ openaiCompatibleBaseUrl: 'http://shared-gateway:8000/v1', openaiCompatibleApiKey: 'key-a' })
    assert(asA === 'openai-compatible/tenant-a-model', `Expected the first credential's own model, got ${asA}`)
  } finally {
    global.fetch = originalFetch
    clearModelCache()
  }
})

/**
 * Runs fn against a throwaway workspace whose URL-only integrations point at the vLLM endpoint.
 * HOME moves to a temp dir too: the workspace manager persists the active workspace under
 * $HOME/.openclaw, and this test must never rewrite the real registry.
 */
async function withKeylessWorkspaceEndpoint(fn: () => void | Promise<void>) {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-chat-edge-home-'))
  const workspaceRoot = path.join(tmpHome, 'workspace')
  fs.mkdirSync(path.join(workspaceRoot, 'SYSTEM'), { recursive: true })
  fs.writeFileSync(path.join(workspaceRoot, 'SYSTEM', 'integrations.json'), JSON.stringify({ openaiCompatibleBaseUrl: 'http://172.16.1.70:8000/v1' }))
  const originalHome = process.env.HOME
  const originalWorkspace = process.env.OPENCLAW_WORKSPACE
  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspaceRoot
  resetWorkspaceManagerForTests()
  try {
    await fn()
  } finally {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    if (originalWorkspace === undefined) delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = originalWorkspace
    resetWorkspaceManagerForTests()
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
}

test('a workspace endpoint is paired only with the protected credential the user-execution policy allows', async () => {
  await withKeylessWorkspaceEndpoint(() => {
    const userKey = resolveChatOpenAiCompatibleEndpoint({}, {
      USER_OPENAI_COMPATIBLE_BASE_URL: 'http://172.16.1.70:8000/v1/',
      USER_OPENAI_COMPATIBLE_API_KEY: 'user-secret',
    })
    assert(userKey.baseUrl === 'http://172.16.1.70:8000/v1' && userKey.apiKey === 'user-secret', `Expected the workspace URL paired with the user's protected key, got ${JSON.stringify(userKey)}`)
    const systemKeyDenied = resolveChatOpenAiCompatibleEndpoint({}, {
      SYSTEM_OPENAI_COMPATIBLE_BASE_URL: 'http://172.16.1.70:8000/v1',
      SYSTEM_OPENAI_COMPATIBLE_API_KEY: 'system-secret',
      ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION: 'false',
    })
    assert(systemKeyDenied.baseUrl === 'http://172.16.1.70:8000/v1' && systemKeyDenied.apiKey === undefined, `Expected no system key while user execution may not use system keys, got ${JSON.stringify(systemKeyDenied)}`)
    const systemKeyAllowed = resolveChatOpenAiCompatibleEndpoint({}, {
      SYSTEM_OPENAI_COMPATIBLE_BASE_URL: 'http://172.16.1.70:8000/v1',
      SYSTEM_OPENAI_COMPATIBLE_API_KEY: 'system-secret',
      ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION: 'true',
    })
    assert(systemKeyAllowed.apiKey === 'system-secret', `Expected the system key once policy allows it, got ${JSON.stringify(systemKeyAllowed)}`)
    const browserOwn = resolveChatOpenAiCompatibleEndpoint({ openaiCompatibleBaseUrl: 'http://172.16.1.70:8000/v1', openaiCompatibleApiKey: 'browser-secret' }, {
      USER_OPENAI_COMPATIBLE_BASE_URL: 'http://172.16.1.70:8000/v1',
      USER_OPENAI_COMPATIBLE_API_KEY: 'user-secret',
    })
    assert(browserOwn.apiKey === 'browser-secret', `Expected browser BYOK to keep its own credential, got ${JSON.stringify(browserOwn)}`)
    // The browser stores and sends back the workspace URL it verified; a bare URL is not a
    // credential and must not suppress the protected key for that same server.
    const browserUrlOnly = resolveChatOpenAiCompatibleEndpoint({ openaiCompatibleBaseUrl: 'http://172.16.1.70:8000/v1/' }, {
      USER_OPENAI_COMPATIBLE_BASE_URL: 'http://172.16.1.70:8000/v1',
      USER_OPENAI_COMPATIBLE_API_KEY: 'user-secret',
    })
    assert(browserUrlOnly.apiKey === 'user-secret', `Expected a URL-only browser payload to still pair with the protected key, got ${JSON.stringify(browserUrlOnly)}`)
    const browserOtherKey = resolveChatOpenAiCompatibleEndpoint({ openaiCompatibleBaseUrl: 'http://172.16.1.70:8000/v1', openai: 'sk-browser-openai' }, {
      USER_OPENAI_COMPATIBLE_BASE_URL: 'http://172.16.1.70:8000/v1',
      USER_OPENAI_COMPATIBLE_API_KEY: 'user-secret',
    })
    assert(browserOtherKey.apiKey === undefined, `Expected a browser that brought its own keys to get no protected credential, got ${JSON.stringify(browserOtherKey)}`)
  })
})

test('chat readiness finds the endpoint model through the paired protected credential', async () => {
  clearModelCache()
  const originalFetch = global.fetch
  try {
    await withKeylessWorkspaceEndpoint(async () => {
    global.fetch = (async (_url: string, init?: any) => {
      if (init?.headers?.Authorization !== 'Bearer user-secret') return { ok: false, status: 401, json: async () => ({}) } as any
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'authenticated-chat-model' }] }) } as any
    }) as any
    const endpoint = resolveChatOpenAiCompatibleEndpoint({}, {
      USER_OPENAI_COMPATIBLE_BASE_URL: 'http://172.16.1.70:8000/v1',
      USER_OPENAI_COMPATIBLE_API_KEY: 'user-secret',
    })
    // What the chat route does before readiness: warm through the paired credential.
    await resolveOpenAiCompatibleDefaultModel({ baseUrl: endpoint.baseUrl, apiKey: endpoint.apiKey })
    const paired = resolveByokChatFallbackModel({ openaiCompatibleBaseUrl: endpoint.baseUrl, openaiCompatibleApiKey: endpoint.apiKey })
    assert(paired === 'openai-compatible/authenticated-chat-model', `Expected the model discovered through the protected key, got ${paired}`)
    const unpaired = resolveByokChatFallbackModel({ openaiCompatibleBaseUrl: endpoint.baseUrl })
    assert(unpaired === undefined, `Expected a credential-less read to miss the credentialed catalog, got ${unpaired}`)
    })
  } finally {
    global.fetch = originalFetch
    clearModelCache()
  }
})

test('chat readiness for a model-less agent resolves and authenticates through the paired protected credential', async () => {
  clearModelCache()
  const originalFetch = global.fetch
  try {
    await withKeylessWorkspaceEndpoint(async () => {
      const workspaceRoot = process.env.OPENCLAW_WORKSPACE as string
      fs.mkdirSync(path.join(workspaceRoot, 'AGENTS', 'harness'), { recursive: true })
      fs.writeFileSync(path.join(workspaceRoot, 'AGENTS', 'harness', 'IDENTITY.md'), '# IDENTITY.md - Who Am I?\n\n- **Name:** harness\n- **Creature:** test agent\n')
      const protectedEnv = {
        USER_OPENAI_COMPATIBLE_BASE_URL: 'http://172.16.1.70:8000/v1',
        USER_OPENAI_COMPATIBLE_API_KEY: 'user-secret',
      }
      global.fetch = (async (_url: string, init?: any) => {
        if (init?.headers?.Authorization !== 'Bearer user-secret') return { ok: false, status: 401, json: async () => ({}) } as any
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'authenticated-chat-model' }] }) } as any
      }) as any
      // What the route does before readiness: warm through the paired endpoint.
      const endpoint = resolveChatOpenAiCompatibleEndpoint({}, protectedEnv)
      await resolveOpenAiCompatibleDefaultModel({ baseUrl: endpoint.baseUrl, apiKey: endpoint.apiKey })
      const readiness = evaluateChatExecutionReadiness('harness', {}, protectedEnv) as any
      assert(readiness.available === true, `Expected readiness, got ${JSON.stringify({ available: readiness.available, error: readiness.error })}`)
      assert(readiness.resolvedAgent.model === 'openai-compatible/authenticated-chat-model', `Expected the endpoint's model, got ${readiness.resolvedAgent.model}`)
      assert(readiness.executionEnv.OPENAI_API_KEY === 'user-secret', `Expected the protected credential in the execution environment, got ${readiness.executionEnv.OPENAI_API_KEY}`)
      assert(String(readiness.executionEnv.OPENAI_BASE_URL).includes('172.16.1.70:8000/v1'), `Expected the workspace endpoint in the execution environment, got ${readiness.executionEnv.OPENAI_BASE_URL}`)
      const wire = JSON.stringify(toChatReadinessResponse(readiness))
      assert(!wire.includes('user-secret') && !wire.includes('executionEnv'), `Expected the readiness response sent to the browser to carry no execution environment or credential, got ${wire.slice(0, 200)}`)
      assert(JSON.parse(wire).available === true && JSON.parse(wire).resolvedAgent.model === 'openai-compatible/authenticated-chat-model', 'Expected the public readiness fields to survive')
      const denied = evaluateChatExecutionReadiness('harness', {}, {
        SYSTEM_OPENAI_COMPATIBLE_BASE_URL: 'http://172.16.1.70:8000/v1',
        SYSTEM_OPENAI_COMPATIBLE_API_KEY: 'system-secret',
        ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION: 'false',
      }) as any
      assert(denied.executionEnv?.OPENAI_API_KEY !== 'system-secret' && denied.resolvedAgent?.model !== 'openai-compatible/authenticated-chat-model', `Expected a denied system key to reach neither execution nor the credentialed catalog, got ${JSON.stringify({ key: denied.executionEnv?.OPENAI_API_KEY, model: denied.resolvedAgent?.model })}`)
    })
  } finally {
    global.fetch = originalFetch
    clearModelCache()
  }
})

test('shouldUseLocalChatExecution prefers direct mode only when hosted gateway execution is unavailable', () => {
  assert(shouldUseLocalChatExecution({
    provider: 'anthropic',
    byok: { anthropic: 'sk-ant-test' },
    gatewayRunning: false,
  }), 'Expected hosted BYOK chat to use local mode when gateway is down')

  assert(!shouldUseLocalChatExecution({
    provider: 'gemini',
    byok: {},
    gatewayRunning: true,
    hasWorkspaceManagedSecrets: true,
  }), 'Expected the active OpenClaw 2 gateway to retain state ownership')
})

test('retryAssistantTextLookup returns on the first successful retry instead of exhausting attempts', async () => {
  let calls = 0
  const result = await retryAssistantTextLookup(() => {
    calls += 1
    return calls === 3 ? { sessionId: 'abc', content: 'hello' } : null
  }, 4, 1)

  assert(calls === 3, `Expected 3 lookup attempts, got ${calls}`)
  assert(result?.content === 'hello', `Expected assistant text on retry, got ${result?.content}`)
})

test('buildManagedSecretStatelessChatMessage returns the raw message when no context or skills are present', () => {
  const prompt = buildManagedSecretStatelessChatMessage('just answer directly')
  assert(prompt === 'just answer directly', `Expected raw message passthrough, got: ${prompt}`)
})

test('buildManagedResendDispatch returns null when there is no explicit recipient or send intent', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-chat-edge-'))
  const agentRoot = path.join(workspaceRoot, 'AGENTS', 'jarvis')
  fs.mkdirSync(agentRoot, { recursive: true })

  const noRecipient = buildManagedResendDispatch({
    message: 'Give me a status update.',
    agentId: 'jarvis',
    agentWorkspaceDir: agentRoot,
    model: 'openai/gpt-4o-mini',
    provider: 'openai',
    assignedSkillIds: ['clawmax-resend'],
  })
  assert(noRecipient === null, 'Expected no managed dispatch when no email recipient is present')

  const noIntent = buildManagedResendDispatch({
    message: 'mmaximilien@gmail.com is my address.',
    agentId: 'jarvis',
    agentWorkspaceDir: agentRoot,
    model: 'openai/gpt-4o-mini',
    provider: 'openai',
    assignedSkillIds: ['clawmax-resend'],
  })
  assert(noIntent === null, 'Expected no managed dispatch when no email/send intent is present')
})

test('deriveChatError surfaces unsupported models clearly', () => {
  const message = deriveChatError('Unknown model: openai/gpt-super-pro', 'openai', { agentId: 'agent0', model: 'openai/gpt-super-pro' })
  assert(/configured with a model that the current runtime does not support/i.test(message), `Unexpected unsupported-model message: ${message}`)
  assert(message.includes('`openai/gpt-super-pro`'), `Expected unsupported model identifier: ${message}`)
  assert(message.includes('/agents?agent=agent0&action=edit'), `Expected agent edit link: ${message}`)
  assert(/removed or renamed/i.test(message), `Expected explanatory remediation: ${message}`)
})

testChain.then(() => {
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
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
