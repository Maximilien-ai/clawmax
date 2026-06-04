/**
 * Chat route helper test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/chat.test.ts
 */

import { buildManagedSecretStatelessChatMessage, deriveChatError, hasByokExecutionPathForProvider, shouldUseLocalChatExecution } from './chat'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildResendChatEmailRequest, hasResendEmailCapability, renderClawmaxAgentEmailHtml, resolveWorkspaceEmailAttachments } from '../lib/resend-partner'

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

console.log(`\n${YELLOW}=== Chat Route Test Suite ===${RESET}\n`)

test('hasByokExecutionPathForProvider detects matching hosted provider keys', () => {
  assert(hasByokExecutionPathForProvider('openai', { openai: 'sk-test' }), 'Expected OpenAI BYOK key to match OpenAI provider')
  assert(hasByokExecutionPathForProvider('anthropic', { anthropic: 'sk-ant-test' }), 'Expected Anthropic BYOK key to match Anthropic provider')
  assert(hasByokExecutionPathForProvider('gemini', { gemini: 'AIza-test' }), 'Expected Gemini BYOK key to match Gemini provider')
  assert(!hasByokExecutionPathForProvider('openai', { anthropic: 'sk-ant-test' }), 'Expected Anthropic key not to satisfy OpenAI provider')
})

test('shouldUseLocalChatExecution prefers gateway for hosted BYOK models when gateway is running', () => {
  assert(!shouldUseLocalChatExecution({
    provider: 'openai',
    byok: { openai: 'sk-test' },
    gatewayRunning: true,
  }), 'Expected BYOK OpenAI chat to use gateway when available')
})

test('shouldUseLocalChatExecution still falls back to direct mode for hosted BYOK when gateway is down', () => {
  assert(shouldUseLocalChatExecution({
    provider: 'openai',
    byok: { openai: 'sk-test' },
    gatewayRunning: false,
  }), 'Expected BYOK OpenAI chat to use local execution when gateway is unavailable')
})

test('shouldUseLocalChatExecution uses gateway for hosted env-key execution when gateway is running', () => {
  assert(!shouldUseLocalChatExecution({
    provider: 'openai',
    byok: {},
    gatewayRunning: true,
  }), 'Expected server-key hosted chat to use gateway when available')
})

test('shouldUseLocalChatExecution forces local mode when workspace-managed partner secrets are present', () => {
  assert(shouldUseLocalChatExecution({
    provider: 'openai',
    byok: {},
    gatewayRunning: true,
    hasWorkspaceManagedSecrets: true,
  }), 'Expected hosted chat to use local execution when workspace-managed partner secrets must be available to tools')
})

test('shouldUseLocalChatExecution always uses direct mode for local providers', () => {
  assert(shouldUseLocalChatExecution({
    provider: 'ollama',
    gatewayRunning: true,
  }), 'Expected Ollama chat to use local execution')
  assert(shouldUseLocalChatExecution({
    provider: 'openai-compatible',
    gatewayRunning: true,
  }), 'Expected OpenAI-compatible chat to use local execution')
})

test('deriveChatError returns an LM Studio-specific context hint for openai-compatible models', () => {
  const message = deriveChatError(
    'The number of tokens to keep from the initial prompt is greater than the context length (n_keep: 17493>= n_ctx: 4096).',
    'openai-compatible'
  )
  assert(/LM Studio rejected this prompt/i.test(message), 'Expected LM Studio-specific remediation message')
  assert(/32768/i.test(message), 'Expected larger context guidance in LM Studio remediation message')
})

test('deriveChatError returns a generic local-runtime context hint for other local providers', () => {
  const message = deriveChatError(
    'The number of tokens to keep from the initial prompt is greater than the context length (n_keep: 17493>= n_ctx: 4096).',
    'ollama'
  )
  assert(/local model runtime rejected this prompt/i.test(message), 'Expected generic local-runtime remediation message')
})

test('deriveChatError hides embedded session takeover internals', () => {
  const message = deriveChatError(
    'EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released: /Users/maximilien/.openclaw/agents/resend-agent/sessions/agent-resend-agent-dashboard-chat.jsonl',
    'openai'
  )
  assert(/embedded session conflict/i.test(message), 'Expected friendly embedded-session conflict summary')
  assert(!message.includes('/Users/maximilien'), 'Expected local session path to be hidden')
})

test('buildManagedSecretStatelessChatMessage preserves recent chat context in a single-turn prompt', () => {
  const prompt = buildManagedSecretStatelessChatMessage('Send that status in an email to mmaximilien@gmail.com', [
    { role: 'user', content: 'who are you? give me a status' },
    { role: 'assistant', content: "I'm the resend-agent. Status: model openai/gpt-4o-mini." },
  ])
  assert(prompt.includes('Conversation context for this single-turn execution:'), 'Expected stateless prompt header')
  assert(prompt.includes('User: who are you? give me a status'), 'Expected prior user turn in context')
  assert(prompt.includes("Assistant: I'm the resend-agent. Status: model openai/gpt-4o-mini."), 'Expected prior assistant turn in context')
  assert(prompt.includes('Latest user request: Send that status in an email to mmaximilien@gmail.com'), 'Expected latest request appended after context')
})

test('buildResendChatEmailRequest uses prior assistant status for send-that-status requests', () => {
  const request = buildResendChatEmailRequest('Send that status in an email to mmaximilien@gmail.com', [
    { role: 'user', content: 'who are you? give me a status' },
    { role: 'assistant', content: 'Here is my status: Gateway 6s, System 35d.' },
  ], 'resend-agent')

  assert(request?.to === 'mmaximilien@gmail.com', 'Expected recipient email to be extracted')
  assert(request?.subject === 'resend-agent status', 'Expected status subject')
  assert(request?.mode === 'direct', 'Expected previous-assistant send to use direct mode')
  assert(request?.text?.includes('Gateway 6s') === true, 'Expected latest assistant status as email body')
})

test('buildResendChatEmailRequest uses post-chat mode for combined status-and-email requests without prior assistant context', () => {
  const request = buildResendChatEmailRequest(
    'who are you? give me a status, then send that status in an email to mmaximilien@gmail.com',
    [],
    'fake-agent'
  )

  assert(request?.to === 'mmaximilien@gmail.com', 'Expected recipient email to be extracted for combined prompt')
  assert(request?.mode === 'post-chat', 'Expected combined status/email request to defer sending until after agent reply')
  assert(request?.subject === 'fake-agent status', 'Expected deferred email subject to reflect status request')
  assert(request?.agentPrompt === 'who are you? give me a status', 'Expected email-delivery clause to be removed from agent prompt')
})

test('buildResendChatEmailRequest ignores non-email chat requests', () => {
  const request = buildResendChatEmailRequest('What is your status?', [
    { role: 'assistant', content: 'Status body' },
  ], 'resend-agent')
  assert(request === null, 'Expected non-email request not to be intercepted')
})

test('buildResendChatEmailRequest uses post-chat mode for generic do-work-then-email prompts', () => {
  const request = buildResendChatEmailRequest(
    'draft a launch update and email it to team@example.com',
    [],
    'release-agent'
  )

  assert(request?.to === 'team@example.com', 'Expected recipient email for generic deferred prompt')
  assert(request?.mode === 'post-chat', 'Expected generic deferred prompt to use post-chat mode')
  assert(request?.agentPrompt === 'draft a launch update', 'Expected generic deferred prompt to remove email-delivery clause')
})

test('buildResendChatEmailRequest captures explicit attachment paths', () => {
  const request = buildResendChatEmailRequest(
    'draft a launch update and email it to team@example.com and attach WORKFLOWS/outputs/release-note.md',
    [],
    'release-agent'
  )

  assert(request?.attachmentPaths?.[0] === 'WORKFLOWS/outputs/release-note.md', 'Expected explicit workspace attachment path')
})

test('hasResendEmailCapability only enables direct send for Resend-related skills', () => {
  assert(hasResendEmailCapability(['clawmax-resend']), 'Expected clawmax-resend skill to enable direct Resend email')
  assert(hasResendEmailCapability(['github', 'resend-cli']), 'Expected resend-cli skill to enable direct Resend email')
  assert(!hasResendEmailCapability(['github', 'slack']), 'Expected unrelated skills not to enable direct Resend email')
})

test('renderClawmaxAgentEmailHtml produces branded HTML wrapper output', () => {
  const html = renderClawmaxAgentEmailHtml({
    subject: 'resend-agent status',
    text: 'Gateway 6s\n\nSystem 35d.',
    agentId: 'resend-agent',
    workspaceLabel: 'test-1.7.x',
  })

  assert(html.includes('ClawMax Agent Email'), 'Expected ClawMax email header')
  assert(html.includes('resend-agent status'), 'Expected escaped subject in HTML wrapper')
  assert(html.includes('resend-agent'), 'Expected agent label in HTML wrapper')
  assert(html.includes('test-1.7.x'), 'Expected workspace label in HTML wrapper')
  assert(html.includes('<p'), 'Expected paragraph rendering in HTML wrapper')
})

test('resolveWorkspaceEmailAttachments loads workspace files as base64 attachments', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-resend-attachment-'))
  const relativePath = path.join('WORKFLOWS', 'outputs', 'brief.txt')
  const fullPath = path.join(workspaceRoot, relativePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, 'hello attachment', 'utf-8')

  const attachments = resolveWorkspaceEmailAttachments(workspaceRoot, [relativePath])
  assert(attachments.length === 1, 'Expected one attachment')
  assert(attachments[0].filename === 'brief.txt', 'Expected attachment filename')
  assert(Buffer.from(attachments[0].content, 'base64').toString('utf-8') === 'hello attachment', 'Expected attachment content to round-trip')
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
