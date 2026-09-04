/**
 * Chat route edge-case helper test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/chat-edges.test.ts
 */

import {
  buildManagedResendDispatch,
  buildManagedSecretStatelessChatMessage,
  deriveChatError,
  resolveByokChatFallbackModel,
  retryAssistantTextLookup,
  shouldUseLocalChatExecution,
} from './chat'
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
  assert(resolveByokChatFallbackModel(undefined) === undefined, 'Expected undefined BYOK payload to return undefined')
  assert(resolveByokChatFallbackModel({ openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1' }) === undefined, 'Expected missing openai-compatible default model to return undefined')
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
