/**
 * Chat route helper test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/chat.test.ts
 */

import { buildManagedSecretStatelessChatMessage, deriveChatError, hasByokExecutionPathForProvider, resolveByokChatFallbackModel, shouldUseLocalChatExecution } from './chat'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  renderClawmaxAgentEmailHtml,
  resetResendSendGuardrailsForTests,
  sendResendTestEmail,
} from '../lib/resend-partner'

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

test('resolveByokChatFallbackModel supplies a hosted default for browser BYOK when an agent record has no model', () => {
  assert(resolveByokChatFallbackModel({ openai: 'sk-test' }) === 'openai/gpt-5', 'Expected OpenAI BYOK fallback model')
  assert(resolveByokChatFallbackModel({ anthropic: 'sk-ant-test' }) === 'anthropic/claude-sonnet-4-20250514', 'Expected Anthropic BYOK fallback model')
  assert(resolveByokChatFallbackModel({ gemini: 'AIza-test' }) === 'google/gemini-2.5-flash', 'Expected Gemini BYOK fallback model')
  assert(resolveByokChatFallbackModel({ openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1', openaiCompatibleDefaultModel: 'qwen3.6-27b' }) === 'openai-compatible/qwen3.6-27b', 'Expected OpenAI-compatible BYOK fallback model')
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

test('buildManagedSecretStatelessChatMessage surfaces assigned skill paths for generic tool selection', () => {
  const prompt = buildManagedSecretStatelessChatMessage(
    'send both responses to mmaximilien@gmail.com',
    [
      { role: 'assistant', content: "I'm the resend-agent." },
      { role: 'assistant', content: 'Status: model openai/gpt-4o-mini.' },
    ],
    [
      { id: 'clawmax-resend', filePath: '/tmp/SKILLS/custom/clawmax-resend/SKILL.md' },
    ],
  )

  assert(prompt.includes('Assigned skills for this turn:'), 'Expected assigned skill block in stateless prompt')
  assert(prompt.includes('clawmax-resend (/tmp/SKILLS/custom/clawmax-resend/SKILL.md)'), 'Expected assigned skill path surfaced to the model')
  assert(prompt.includes('These are local skills/capabilities for this agent, not agents, channels, or session targets.'), 'Expected explicit note that assigned skills are not session targets')
  assert(prompt.includes('Do not use sessions_send, sessions_spawn, or agent-to-agent messaging with a skill name.'), 'Expected explicit anti-session guidance for skills')
  assert(prompt.includes('Assigned skill usage notes:'), 'Expected assigned skill usage notes header')
  assert(prompt.includes('`clawmax-resend`: to send email, use the `clawmax-resend-send` command.'), 'Expected explicit resend command note in stateless prompt')
  assert(prompt.includes('Do not create local files or tell the user to email something manually when `clawmax-resend` is assigned unless the user explicitly asked for that fallback.'), 'Expected explicit no-manual-fallback note for clawmax-resend')
  assert(prompt.includes('For summaries, status updates, or other generated writeups, send the content inline in the email body by default. Do not create `summary.md` or attach a generated file unless the user explicitly asked for a file or attachment.'), 'Expected explicit inline-summary guidance for clawmax-resend')
  assert(prompt.includes('For file requests like "send your identity.md", use `clawmax-resend-send --attach <path>` and attach the file instead of pasting its contents into a generic message tool.'), 'Expected explicit attachment guidance for clawmax-resend')
  assert(prompt.includes('Do not edit, patch, or rewrite the file when the user asked to send it; attach the existing file as-is.'), 'Expected explicit no-edit guidance for attachment requests')
  assert(prompt.includes('Do not create copied workspace files such as `identity_identity.md` or `soul_copy.md` while preparing an attachment; attach the original file directly.'), 'Expected explicit no-copy guidance for attachments')
  assert(prompt.includes('Do not delegate email sending to subagents. Run `clawmax-resend-send` in the current agent session.'), 'Expected explicit no-subagent guidance for clawmax-resend')
  assert(prompt.includes('If the user says "same email", reuse the most recent recipient email from the current conversation.'), 'Expected explicit same-email reuse guidance')
  assert(prompt.includes('read that SKILL.md first and follow it before using generic tools like message or exec'), 'Expected generic tool-selection guidance')
  assert(prompt.includes('Latest user request: send both responses to mmaximilien@gmail.com'), 'Expected latest request to remain present')
})

test('renderClawmaxAgentEmailHtml renders markdown headings and bullets into HTML structure', () => {
  const html = renderClawmaxAgentEmailHtml({
    subject: 'Status update',
    text: [
      'Here is the update.',
      '',
      '### Status',
      '- **Model:** openai/gpt-4o-mini',
      '- **Uptime:** Gateway 8s | System 38d',
    ].join('\n'),
    agentId: 'resend-agent',
    workspaceLabel: 'test-1.7.x',
  })

  assert(html.includes('<h3'), 'Expected markdown heading to render as HTML heading')
  assert(html.includes('<ul'), 'Expected markdown bullets to render as HTML list')
  assert(html.includes('<strong>Model:</strong>'), 'Expected markdown bold text to render as HTML strong tags')
})

test('sendResendTestEmail rate-limits repeated agent sends to the same recipient', async () => {
  resetResendSendGuardrailsForTests()
  let calls = 0
  const fakeFetch: any = async () => {
    calls += 1
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: `email_${calls}` }),
    }
  }

  await sendResendTestEmail({
    apiKey: 're_test_123',
    agentId: 'fake-agent',
    workspaceLabel: 'test-1.7.x',
    to: 'mmaximilien@gmail.com',
    subject: 'hello',
    text: 'one',
  }, fakeFetch)

  let threw = false
  try {
    await sendResendTestEmail({
      apiKey: 're_test_123',
      agentId: 'fake-agent',
      workspaceLabel: 'test-1.7.x',
      to: 'mmaximilien@gmail.com',
      subject: 'hello again',
      text: 'two',
    }, fakeFetch)
  } catch (err: any) {
    threw = /Email rate limit/i.test(err?.message || '')
  }

  assert(threw, 'Expected repeated agent send to be rate-limited')
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
