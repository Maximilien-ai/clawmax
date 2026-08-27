/**
 * Chat route helper test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/chat.test.ts
 */

import {
  buildManagedResendDispatch,
  buildDashboardChatRetrySeed,
  buildManagedSecretStatelessChatMessage,
  deriveChatError,
  hasByokExecutionPathForProvider,
  retryAssistantTextLookup,
  resolveByokChatFallbackModel,
  shouldUseManagedSecretStatelessChatSession,
  shouldRecoverPersistedAssistant,
  shouldAttemptManagedResendDispatch,
  shouldUseLocalChatExecution,
  throwIfChatAttemptNeedsSessionRetry,
} from './chat'
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

console.log(`\n${YELLOW}=== Chat Route Test Suite ===${RESET}\n`)

test('hasByokExecutionPathForProvider detects matching hosted provider keys', () => {
  assert(hasByokExecutionPathForProvider('openai', { openai: 'sk-test' }), 'Expected OpenAI BYOK key to match OpenAI provider')
  assert(hasByokExecutionPathForProvider('anthropic', { anthropic: 'sk-ant-test' }), 'Expected Anthropic BYOK key to match Anthropic provider')
  assert(hasByokExecutionPathForProvider('gemini', { gemini: 'AIza-test' }), 'Expected Gemini BYOK key to match Gemini provider')
  assert(hasByokExecutionPathForProvider('openrouter', { openrouter: 'sk-or-test' }), 'Expected OpenRouter BYOK key to match OpenRouter provider')
  assert(hasByokExecutionPathForProvider('xai', { xai: 'xai-test' }), 'Expected xAI BYOK key to match xAI provider')
  assert(!hasByokExecutionPathForProvider('openai', { anthropic: 'sk-ant-test' }), 'Expected Anthropic key not to satisfy OpenAI provider')
})

test('resolveByokChatFallbackModel supplies a hosted default for browser BYOK when an agent record has no model', () => {
  assert(resolveByokChatFallbackModel({ openai: 'sk-test' }) === 'openai/gpt-5.4-mini', 'Expected OpenAI BYOK fallback model supported by pinned OpenClaw')
  assert(resolveByokChatFallbackModel({ anthropic: 'sk-ant-test' }) === 'anthropic/claude-sonnet-4-20250514', 'Expected Anthropic BYOK fallback model')
  assert(resolveByokChatFallbackModel({ gemini: 'AIza-test' }) === 'google/gemini-2.5-flash', 'Expected Gemini BYOK fallback model')
  assert(resolveByokChatFallbackModel({ openrouter: 'sk-or-test' }) === 'openrouter/auto', 'Expected OpenRouter BYOK fallback model')
  assert(resolveByokChatFallbackModel({ xai: 'xai-test' }) === 'xai/grok-3', 'Expected xAI BYOK fallback model')
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

test('shouldUseManagedSecretStatelessChatSession stays disabled for normal dashboard chat', () => {
  assert(!shouldUseManagedSecretStatelessChatSession({
    useLocal: true,
    hasWorkspaceManagedSecrets: true,
  }), 'Expected stable local dashboard chat sessions even when workspace-managed secrets exist')
  assert(!shouldUseManagedSecretStatelessChatSession({
    useLocal: false,
    hasWorkspaceManagedSecrets: false,
  }), 'Expected hosted dashboard chat not to switch to stateless prompt mode')
})

test('shouldRecoverPersistedAssistant enables recovery when stdout normalized to runtime noise only', () => {
  assert(shouldRecoverPersistedAssistant(''), 'Expected empty normalized stdout to recover persisted assistant text')
  assert(shouldRecoverPersistedAssistant('   '), 'Expected whitespace-only normalized stdout to recover persisted assistant text')
  assert(!shouldRecoverPersistedAssistant('Hello from the agent.'), 'Expected real assistant text to skip persisted fallback')
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
  assert(/already retried once with a fresh chat session/i.test(message), 'Expected automatic recovery guidance')
  assert(!message.includes('/Users/maximilien'), 'Expected local session path to be hidden')
})

test('chat session conflicts retry with a fresh session only before visible output', () => {
  const sessionSeed = 'agent:ceo:dashboard-chat'
  assert(buildDashboardChatRetrySeed(sessionSeed, 0) === sessionSeed, 'Expected initial chat session to remain stable')
  assert(
    buildDashboardChatRetrySeed(sessionSeed, 1) === 'agent-ceo-dashboard-chat-recovery-1',
    'Expected recovery attempt to use a fresh chat session',
  )
  assert(
    buildDashboardChatRetrySeed(`${sessionSeed}-recovery-1`, 1).length <= 48,
    'Expected repeated recovery seeds to stay within OpenClaw session key limits',
  )

  let retryRequested = false
  try {
    throwIfChatAttemptNeedsSessionRetry({
      completionText: '',
      hadVisibleOutput: false,
      rawError: 'EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released',
    })
  } catch {
    retryRequested = true
  }
  assert(retryRequested, 'Expected an empty session-conflict attempt to request automatic recovery')

  throwIfChatAttemptNeedsSessionRetry({
    completionText: 'Partial answer already shown',
    hadVisibleOutput: true,
    rawError: 'EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released',
  })

  let stalePersistedReplyRetried = false
  try {
    throwIfChatAttemptNeedsSessionRetry({
      completionText: 'Reply recovered from an earlier persisted turn',
      hadVisibleOutput: false,
      rawError: 'EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released',
    })
  } catch {
    stalePersistedReplyRetried = true
  }
  assert(stalePersistedReplyRetried, 'Expected persisted text not to mask a current session conflict')
})

test('deriveChatError explains incomplete tool turns without implying no work occurred', () => {
  const message = deriveChatError("Agent couldn't generate a response. Note: some tool actions may have already been executed.", 'openai')
  assert(/used tools but did not produce a final reply/i.test(message), `Unexpected message: ${message}`)
  assert(/verify the requested results/i.test(message), `Expected verification guidance: ${message}`)
})

test('deriveChatError surfaces provider cooldowns as transient retryable failures', () => {
  const message = deriveChatError(
    'FallbackSummaryError: All models failed (1): openai/gpt-5: Provider openai is in cooldown (suspending lanes) (timeout)',
    'openai'
  )
  assert(/temporarily cooling down/i.test(message), 'Expected cooldown explanation')
  assert(/retry|faster fallback model/i.test(message), 'Expected retry guidance')
})

test('deriveChatError surfaces invalid credentials as configuration failures', () => {
  const message = deriveChatError(
    'FailoverError: 401 Incorrect API key provided: openai-cible. You can find your API key at https://platform.openai.com/account/api-keys.',
    'openai'
  )
  assert(/api key was rejected/i.test(message), 'Expected invalid-credential explanation')
  assert(/api key|auth profile/i.test(message), 'Expected config remediation guidance')
})

test('deriveChatError hides raw missing-provider credential strings', () => {
  const message = deriveChatError(
    'No API key found for provider "openai"',
    'openai'
  )
  assert(/No model provider credentials are configured for this chat/i.test(message), `Unexpected message: ${message}`)
  assert(!/provider "openai"/i.test(message), 'Expected raw provider string to be hidden')
})

test('deriveChatError surfaces provider quota and rate limits clearly', () => {
  const message = deriveChatError(
    'Error: 429 insufficient_quota: You exceeded your current quota. Too many requests.',
    'openai'
  )
  assert(/quota or rate limit/i.test(message), 'Expected quota explanation')
  assert(/billing\/usage limits|retry/i.test(message), 'Expected remediation guidance')
})

test('deriveChatError surfaces claude/droid CLI auth failures with a runtime-specific remediation message', () => {
  const claudeMessage = deriveChatError('Please run /login to authenticate.', 'anthropic', { runtimeLabel: 'Claude Code' })
  assert(/Claude Code CLI is not authenticated/i.test(claudeMessage), `Unexpected claude auth message: ${claudeMessage}`)
  assert(/ANTHROPIC_API_KEY/i.test(claudeMessage), `Expected ANTHROPIC_API_KEY remediation hint: ${claudeMessage}`)

  const droidMessage = deriveChatError('Error: not logged in to Factory.', 'openai', { runtimeLabel: 'Factory Droid' })
  assert(/Factory Droid CLI is not authenticated/i.test(droidMessage), `Unexpected droid auth message: ${droidMessage}`)
  assert(/FACTORY_API_KEY/i.test(droidMessage), `Expected FACTORY_API_KEY remediation hint: ${droidMessage}`)

  const noLabelMessage = deriveChatError('Please run /login to authenticate.', 'anthropic')
  assert(/agent runtime CLI is not authenticated/i.test(noLabelMessage), `Expected generic fallback without a runtime label: ${noLabelMessage}`)
})

test('deriveChatError surfaces claude/droid session-state mismatches as a retry hint', () => {
  const alreadyInUse = deriveChatError('Error: Session ID 8db2cbb6-235b-4bdf-89e5-80c37cc0181a is already in use.', 'anthropic', { runtimeLabel: 'Claude Code' })
  assert(/out of sync/i.test(alreadyInUse), `Unexpected already-in-use message: ${alreadyInUse}`)

  const notFound = deriveChatError('No conversation found with session ID: 8db2cbb6-235b-4bdf-89e5-80c37cc0181a', 'anthropic', { runtimeLabel: 'Claude Code' })
  assert(/out of sync/i.test(notFound), `Unexpected not-found message: ${notFound}`)
})

test('deriveChatError surfaces claude/droid model rejections with runtime-aware guidance', () => {
  const claudeBadModel = deriveChatError(
    "There's an issue with the selected model (not-a-real-model). It may not exist or you may not have access to it. Run --model to pick a different model.",
    'anthropic',
    { runtimeLabel: 'Claude Code' }
  )
  assert(/Claude Code CLI cannot use/i.test(claudeBadModel), `Unexpected claude bad-model message: ${claudeBadModel}`)

  const droidBadModel = deriveChatError('Invalid model: not-a-real-model', 'openai', { runtimeLabel: 'Factory Droid' })
  assert(/Factory Droid CLI cannot use/i.test(droidBadModel), `Unexpected droid bad-model message: ${droidBadModel}`)
})

test('deriveChatError normalizes missing execution path guidance', () => {
  const message = deriveChatError(
    'No execution path configured. Add hosted provider keys, configure Ollama, or add an OpenAI-compatible endpoint in BYOK / workspace integrations.',
    'openai'
  )
  assert(/No model execution path is configured for this chat/i.test(message), `Unexpected message: ${message}`)
  assert(/BYOK \/ workspace integrations/i.test(message), `Unexpected remediation guidance: ${message}`)
})

test('deriveChatError surfaces FsSafeError as a runtime state failure', () => {
  const message = deriveChatError(
    'FsSafeError: directory changed during operation',
    'openai'
  )
  assert(/runtime changed files while this chat was running/i.test(message), `Unexpected message: ${message}`)
  assert(/disable unstable runtime plugins/i.test(message), `Unexpected remediation guidance: ${message}`)
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
    '/app/DATA/default/AGENTS/resend-agent',
  )

  assert(prompt.includes('Assigned skills for this turn:'), 'Expected assigned skill block in stateless prompt')
  assert(prompt.includes('clawmax-resend (/tmp/SKILLS/custom/clawmax-resend/SKILL.md)'), 'Expected assigned skill path surfaced to the model')
  assert(prompt.includes('These are local skills/capabilities for this agent, not agents, channels, or session targets.'), 'Expected explicit note that assigned skills are not session targets')
  assert(prompt.includes('Do not use sessions_send, sessions_spawn, or agent-to-agent messaging with a skill name.'), 'Expected explicit anti-session guidance for skills')
  assert(prompt.includes('Assigned skill usage notes:'), 'Expected assigned skill usage notes header')
  assert(prompt.includes('`clawmax-resend`: to send email, use the `clawmax-resend-send` command.'), 'Expected explicit resend command note in stateless prompt')
  assert(prompt.includes('When the user gives an explicit recipient and clear email intent, run `clawmax-resend-send` immediately instead of describing a plan.'), 'Expected explicit direct-execution guidance for clawmax-resend')
  assert(prompt.includes('Only report that the resend tool is unavailable or failed if you actually ran `clawmax-resend-send` and it returned an error.'), 'Expected explicit no-hedging guidance for clawmax-resend')
  assert(prompt.includes('If `clawmax-resend-send` returns an error, stop and report that exact error. Do not retry with another method in the same turn.'), 'Expected explicit terminal resend failure guidance')
  assert(prompt.includes('Do not claim an email was sent unless `clawmax-resend-send` returned a success message.'), 'Expected explicit no-false-success guidance for clawmax-resend')
  assert(prompt.includes('After a successful send, confirm briefly. If the command did not confirm success, report the failure instead of implying delivery.'), 'Expected explicit post-send confirmation rule for clawmax-resend')
  assert(prompt.includes('Do not create local files or tell the user to email something manually when `clawmax-resend` is assigned unless the user explicitly asked for that fallback.'), 'Expected explicit no-manual-fallback note for clawmax-resend')
  assert(prompt.includes('For inline content sends, do not create temporary files such as `current_status.txt` or `summary.md`; pass the content directly with `--body`.'), 'Expected explicit no-temp-file guidance for inline resend sends')
  assert(prompt.includes('Do not spawn subagents or wait on other sessions for normal resend content sends.'), 'Expected explicit no-subagent/no-wait guidance for inline resend sends')
  assert(prompt.includes('For summaries, status updates, or other generated writeups, send the content inline in the email body by default. Do not create `summary.md` or attach a generated file unless the user explicitly asked for a file or attachment.'), 'Expected explicit inline-summary guidance for clawmax-resend')
  assert(prompt.includes('For file requests like "send your identity.md", use `clawmax-resend-send --attach <path>` and attach the file instead of pasting its contents into a generic message tool.'), 'Expected explicit attachment guidance for clawmax-resend')
  assert(prompt.includes('For direct file requests like "send your soul.md file to mmaximilien@gmail.com", call `clawmax-resend-send` with `--to`, a concise `--subject`, a short `--body`, and `--attach` for the original file path.'), 'Expected explicit direct file-send example for clawmax-resend')
  assert(prompt.includes('Do not edit, patch, or rewrite the file when the user asked to send it; attach the existing file as-is.'), 'Expected explicit no-edit guidance for attachment requests')
  assert(prompt.includes('Do not create copied workspace files such as `identity_identity.md` or `soul_copy.md` while preparing an attachment; attach the original file directly.'), 'Expected explicit no-copy guidance for attachments')
  assert(prompt.includes('Do not delegate email sending to subagents. Run `clawmax-resend-send` in the current agent session.'), 'Expected explicit no-subagent guidance for clawmax-resend')
  assert(prompt.includes('If the user says "same email", reuse the most recent recipient email from the current conversation.'), 'Expected explicit same-email reuse guidance')
  assert(prompt.includes('Current agent file paths you may attach directly with `clawmax-resend-send --attach`:'), 'Expected direct attachment path section for current agent files')
  assert(prompt.includes('/app/DATA/default/AGENTS/resend-agent/SOUL.md'), 'Expected explicit current-agent SOUL.md path in stateless prompt')
  assert(prompt.includes('For these current-agent files, do not use gateway file_fetch first. Pass the file path directly to `clawmax-resend-send --attach`.'), 'Expected explicit no-file-fetch guidance for protected current-agent files')
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

test('buildManagedResendDispatch handles explicit status sends without OpenClaw tool detours', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-resend-dispatch-'))
  const agentRoot = path.join(workspaceRoot, 'AGENTS', 'jarvis')
  fs.mkdirSync(agentRoot, { recursive: true })
  fs.writeFileSync(path.join(agentRoot, 'IDENTITY.md'), '# Identity\n\nName: jarvis\n', 'utf-8')

  const dispatch = buildManagedResendDispatch({
    message: 'Who are you? Give me a status and send it to mmaximilien@gmail.com.',
    agentId: 'jarvis',
    agentWorkspaceDir: agentRoot,
    model: 'openai/gpt-4o-mini',
    provider: 'openai',
    assignedSkillIds: ['clawmax-resend'],
  })

  if (!dispatch) throw new Error('Expected managed resend dispatch for explicit email request')
  assert(dispatch.to === 'mmaximilien@gmail.com', 'Expected recipient from explicit email request')
  assert(dispatch.body.includes('Name: jarvis'), 'Expected current agent identity in managed resend body')
  assert(dispatch.attachmentPaths.length === 0, 'Expected status send to avoid temporary attachment files')
})

test('shouldAttemptManagedResendDispatch only depends on assigned clawmax-resend skill', () => {
  assert(shouldAttemptManagedResendDispatch(['clawmax-resend']), 'Expected assigned clawmax-resend to enable managed dispatch')
  assert(!shouldAttemptManagedResendDispatch(['gog']), 'Expected unrelated skills not to enable managed dispatch')
})

test('buildManagedResendDispatch attaches current agent protected files directly', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-resend-dispatch-file-'))
  const agentRoot = path.join(workspaceRoot, 'AGENTS', 'jarvis')
  fs.mkdirSync(agentRoot, { recursive: true })
  const identityPath = path.join(agentRoot, 'IDENTITY.md')
  fs.writeFileSync(identityPath, '# Identity\n\nName: jarvis\n', 'utf-8')

  const dispatch = buildManagedResendDispatch({
    message: 'Give me a status and send that to mmaximilien@gmail.com. Also include your identity.md',
    agentId: 'jarvis',
    agentWorkspaceDir: agentRoot,
    model: 'openai/gpt-4o-mini',
    provider: 'openai',
    assignedSkillIds: ['clawmax-resend'],
  })

  if (!dispatch) throw new Error('Expected managed resend dispatch for file email request')
  assert(dispatch.attachmentPaths.includes(identityPath), 'Expected current agent IDENTITY.md attached directly')
})

test('buildManagedResendDispatch fails fast for missing explicit files', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-resend-dispatch-missing-'))
  const agentRoot = path.join(workspaceRoot, 'AGENTS', 'jarvis')
  fs.mkdirSync(agentRoot, { recursive: true })

  let threw = false
  try {
    buildManagedResendDispatch({
      message: 'send missing-report.md to mmaximilien@gmail.com',
      agentId: 'jarvis',
      agentWorkspaceDir: agentRoot,
      assignedSkillIds: ['clawmax-resend'],
    })
  } catch (err: any) {
    threw = /Attachment file not found/i.test(err?.message || '')
  }

  assert(threw, 'Expected missing explicit attachment to fail before OpenClaw execution')
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

test('sendResendTestEmail sends with an abort timeout signal', async () => {
  resetResendSendGuardrailsForTests()
  let capturedInit: RequestInit | undefined
  const fakeFetch: any = async (_url: string, init: RequestInit) => {
    capturedInit = init
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'email_timeout_test' }),
    }
  }

  await sendResendTestEmail({
    apiKey: 're_test_123',
    agentId: 'timeout-agent',
    workspaceLabel: 'test-1.7.x',
    to: 'mmaximilien@gmail.com',
    subject: 'status',
    text: 'ready',
  }, fakeFetch)

  assert(capturedInit?.signal instanceof AbortSignal, 'Expected Resend fetch to include an AbortSignal timeout')
  resetResendSendGuardrailsForTests()
})

test('retryAssistantTextLookup waits briefly for persisted assistant text to appear', async () => {
  let reads = 0
  const result = await retryAssistantTextLookup(() => {
    reads += 1
    if (reads < 3) return { sessionId: 'chat-session' }
    return { sessionId: 'chat-session', content: 'Hello from the persisted session.' }
  }, 3, 1)

  assert(result?.content === 'Hello from the persisted session.', 'Expected retry helper to return the first non-empty assistant text')
  assert(reads === 3, `Expected retry helper to poll until content appeared, got ${reads} reads`)
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
