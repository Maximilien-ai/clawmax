/**
 * Chat normalization test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/chat-normalization.test.ts
 */

import { createStreamingWarningFilter, normalizeChatMessage, stripBenignChatRuntimeWarnings } from './chat-normalization'

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
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Chat Normalization Test Suite ===${RESET}\n`)

test('extracts payload text from gateway json envelopes', () => {
  const raw = JSON.stringify({
    result: {
      payloads: [
        { text: 'First answer' },
        { text: 'Second answer' },
      ],
    },
  })
  const normalized = normalizeChatMessage(raw)
  assert(normalized === 'First answer\n\nSecond answer', `Unexpected normalized output: ${normalized}`)
})

test('extracts content from archived raw message arrays', () => {
  const raw = JSON.stringify([
    { id: '1', from: 'agent', content: 'Alpha' },
    { id: '2', from: 'agent', content: 'Beta' },
  ])
  const normalized = normalizeChatMessage(raw)
  assert(normalized === 'Alpha\n\nBeta', `Unexpected normalized output: ${normalized}`)
})

test('strips ansi and internal openclaw lines from plain text', () => {
  const raw = '\x1b[31mError header\x1b[0m\n🦞 OpenClaw debug\nUseful line\n(Command exited 0)'
  const normalized = normalizeChatMessage(raw)
  assert(normalized === 'Error header\nUseful line', `Unexpected normalized output: ${normalized}`)
})

test('strips runtime metadata, tool json, and file artifact blocks from chat transcripts', () => {
  const raw = `Let me check what was happening recently to understand where to pick up.

{ "results": [], "provider": "openai", "model": "text-embedding-3-small", "citations": "auto", "mode": "hybrid" }

🕒 Time: Tuesday, May 19th, 2026 — 1:54 PM (America/Los_Angeles) 🧠 Model: ollama/qwen2.5:latest · 🔑 unknown

(processing...)

Files:
2026-05-19.md
2026-05-18.md

total 16 drwxr-xr-x@ 4 maximilien staff 128 May 19 13:54 . drwxr-xr-x@ 11 maximilien staff 352 May 19 13:54 ..

2026-05-19
No notes yet.

{ "count": 1, "sessions": [ { "key": "agent:agent0:main", "kind": "other" } ] }

This looks like a fresh session — the memory files are empty, and there's no prior work to continue from.

What would you like me to work on?`
  const normalized = normalizeChatMessage(raw)
  assert(
    normalized === "Let me check what was happening recently to understand where to pick up.\n\nThis looks like a fresh session — the memory files are empty, and there's no prior work to continue from.\n\nWhat would you like me to work on?",
    `Unexpected normalized output: ${normalized}`
  )
})

test('suppresses metadata-only json blobs when no human text is present', () => {
  const raw = '{ "results": [], "provider": "openai", "model": "text-embedding-3-small", "citations": "auto", "mode": "hybrid" }'
  const normalized = normalizeChatMessage(raw)
  assert(normalized === '', `Expected metadata-only JSON to be suppressed, got: ${normalized}`)
})

test('extracts human-friendly text from mechdog tool json blobs', () => {
  const moveRaw = '{ "status": "ok", "message": "Moving forward for 5000ms", "state": { "rotation": 0 } }'
  const actionRaw = '{ "status": "ok", "action": "wave", "estimated_duration": 2.5, "state": { "rotation": 0 } }'
  assert(normalizeChatMessage(moveRaw) === 'Moving forward for 5000ms', 'Expected move tool JSON to collapse to its message')
  assert(normalizeChatMessage(actionRaw) === 'Performed action: wave', 'Expected action tool JSON to collapse to a concise summary')
})

test('strips benign Cognee plugin runtime config warning from chat output', () => {
  const warning = 'plugin runtime config.loadConfig() is deprecated (runtime-config-load-write); use config.current().'
  const raw = `${warning}\n\nUseful agent response.`
  const stripped = stripBenignChatRuntimeWarnings(raw)
  const normalized = normalizeChatMessage(raw)

  assert(!stripped.includes('runtime-config-load-write'), 'Expected warning stripped from streamed chunks')
  assert(normalized === 'Useful agent response.', `Unexpected normalized output: ${normalized}`)
})

test('strips OpenClaw provider transport diagnostics from streamed chat output', () => {
  const raw = `[provider-transport-fetch] [model-fetch] start provider=lmstudio api=openai-completions model=qwen/qwen3.6-27b method=POST url=http://host.containers.internal:1234/v1/chat/completions timeoutMs=undefined proxy=none policy=custom
[provider-transport-fetch] [model-fetch] response provider=lmstudio api=openai-completions model=qwen/qwen3.6-27b status=200 elapsedMs=16 contentType=text/event-stream
RC14 container chat works`
  const stripped = stripBenignChatRuntimeWarnings(raw)
  const normalized = normalizeChatMessage(raw)

  assert(!stripped.includes('[provider-transport-fetch]'), 'Expected provider transport diagnostics stripped from streamed chunks')
  assert(normalized === 'RC14 container chat works', `Unexpected normalized output: ${normalized}`)
})

test('strips plugin allowlist discovery warnings from chat output', () => {
  const raw = `[plugins] plugins.allow is empty; discovered non-bundled plugins may auto-load: cognee-openclaw (/app/DATA/.home/.openclaw/npm/node_modules/@cognee/cognee-openclaw/dist/index.js). To trust them explicitly, set plugins.allow in openclaw.json (e.g. "plugins": { "allow": ["cognee-openclaw"] }). Run 'openclaw plugins list --enabled --verbose' or 'openclaw plugins inspect cognee-openclaw' to confirm plugin ids.

Useful agent response.`
  const stripped = stripBenignChatRuntimeWarnings(raw)
  const normalized = normalizeChatMessage(raw)

  assert(!/plugins\.allow is empty/i.test(stripped), 'Expected plugin discovery warning stripped from streamed chunks')
  assert(normalized === 'Useful agent response.', `Unexpected normalized output: ${normalized}`)
})

test('strips plugin deny warnings from chat output without treating them as a reply', () => {
  const warning = '| - plugins.deny: plugin not found: cognee-openclaw (stale config entry | | ignored; remove it from plugins config) |'
  const normalized = normalizeChatMessage(warning)
  assert(normalized === '', `Expected plugin deny warning to normalize to empty, got: ${normalized}`)
})

test('keeps the real answer when a plugin warning precedes it', () => {
  const raw = '| - plugins.deny: plugin not found: cognee-openclaw (stale config entry | | ignored; remove it from plugins config) |\n\nHello! How can I help?'
  const normalized = normalizeChatMessage(raw)
  assert(normalized === 'Hello! How can I help?', `Expected warning removed while preserving answer, got: ${normalized}`)
})

test('strips wrapped stale plugin warning continuations without hiding the reply', () => {
  const raw = `◇ Config warnings ───────────────────────────────────────────────────────╮
│ - plugins.deny: plugin not found: cognee-openclaw (stale config entry │
│ ignored; remove it from plugins config) │
╰────────────────────────────────────────────────────────────────────────╯

I’m playbot — your playful assistant.`
  const normalized = normalizeChatMessage(raw)

  assert(!normalized.includes('remove it from plugins config'), `Expected wrapped continuation removed, got: ${normalized}`)
  assert(normalized === 'I’m playbot — your playful assistant.', `Expected reply preserved, got: ${normalized}`)
})

test('strips a standalone wrapped plugin warning continuation', () => {
  const raw = '│ ignored; remove it from plugins config) │\nI can help with your workspace.'
  const normalized = normalizeChatMessage(raw)

  assert(normalized === 'I can help with your workspace.', `Expected continuation removed, got: ${normalized}`)
})

test('returns empty for runtime status-only output so persisted-answer fallback can run', () => {
  const raw = '🕒 status line\n🧠 another status line'
  const normalized = normalizeChatMessage(raw)
  assert(normalized === '', `Expected status-only output to normalize to empty, got: ${normalized}`)
})

test('strips boxed stale Cognee deny diagnostics without losing the real reply', () => {
  const warning = '│ - plugins.deny: plugin not found: cognee-openclaw (stale config entry │ │ ignored; remove it from plugins config) │'
  assert(normalizeChatMessage(warning) === '', 'A warning alone is not an Agent reply')
  assert(normalizeChatMessage(`${warning}\nHello from the agent.`) === 'Hello from the agent.', 'Preserve real reply')
  const wrapped = '│ - plugins.deny: plugin not found: cognee-openclaw (stale config entry │\n│ ignored; remove it from plugins config) │'
  assert(stripBenignChatRuntimeWarnings(wrapped).trim() === '', 'Strip wrapped diagnostics')
})

test('strips stale plugin allowlist config warning blocks from chat output', () => {
  const raw = `◇ Config warnings ───────────────────────────────────────────────────────╮ │ - plugins.allow: plugin not found: clawmax_no_non_bundled_plugins │ │ (stale config entry ignored; remove it from plugins config) │

Useful agent response.`
  const stripped = stripBenignChatRuntimeWarnings(raw)
  const normalized = normalizeChatMessage(raw)

  assert(!/Config warnings/i.test(stripped), 'Expected config warning header stripped from streamed chunks')
  assert(!/clawmax_no_non_bundled_plugins/i.test(stripped), 'Expected stale sentinel warning stripped from streamed chunks')
  assert(normalized === 'Useful agent response.', `Unexpected normalized output: ${normalized}`)
})

test('suppresses warning-only chat output instead of restoring the raw warning', () => {
  const raw = `◇ Config warnings ───────────────────────────────────────────────────────╮ │ - plugins.allow: plugin not found: clawmax_no_non_bundled_plugins │ │ (stale config entry ignored; remove it from plugins config) │`
  const normalized = normalizeChatMessage(raw)

  assert(normalized === '', `Expected warning-only output to be suppressed, got: ${normalized}`)
})

test('strips doctor warning blocks from chat output so runtime diagnostics do not appear as assistant replies', () => {
  const raw = `|◇ Doctor warnings
────────────────────────────────
||| - Left legacy config health state in place because 1 entry conflicts || with shared SQLite state:
|| /app/DATA/.home/.openclaw/logs/config-health.json |||
────────────────────────────────

Useful agent response.`
  const stripped = stripBenignChatRuntimeWarnings(raw)
  const normalized = normalizeChatMessage(raw)

  assert(!/Doctor warnings/i.test(stripped), 'Expected doctor warning header stripped from streamed chunks')
  assert(!/config-health\.json/i.test(stripped), 'Expected config health path stripped from streamed chunks')
  assert(normalized === 'Useful agent response.', `Unexpected normalized output: ${normalized}`)
})

test('strips OpenClaw 2 doctor migration changes and credential errors from chat output', () => {
  const raw = `◇ Doctor changes ────────────────────────────────╮
│ Migrated auth profile JSON for ~/.openclaw/agents/ceo/agent/auth-profiles.json │
│ into SQLite (archive: ~/.openclaw/agents/ceo/agent/auth-profiles.json.migrated-2026-09-02). │
╰────────────────────────────────────────────────╯
Auth profile store ~/.openclaw/agents/ceo/agent/openclaw-agent.sqlite requires legacy credential migration; run openclaw doctor --fix.`
  const stripped = stripBenignChatRuntimeWarnings(raw)
  const normalized = normalizeChatMessage(raw)

  assert(!/Doctor changes/i.test(stripped), 'Expected doctor changes header stripped from streamed chunks')
  assert(!/legacy credential migration/i.test(stripped), 'Expected credential migration diagnostic stripped from streamed chunks')
  assert(normalized === '', `Expected migration-only output to normalize to empty, got: ${normalized}`)
})

test('strips OpenClaw 2 historical transcript migration notices', () => {
  const raw = `◇ Doctor notices ─────────────────────────────────╮
│ - Skipped historical transcript directive migration: shared-state lease inspection failed │
╰─────────────────────────────────────────────────╯`
  assert(normalizeChatMessage(raw) === '', 'Expected historical transcript migration notice to be suppressed')
})

test('strips state-migration warning variants from chat output so on-prem runtime leftovers do not appear as assistant replies', () => {
  const raw = `│ - Left migrated task registry sidecar in place because archive already │ │ exists: /app/DATA/.home/.openclaw/tasks/runs.sqlite.migrated │ │ - Left legacy update-check state in place because shared SQLite state │ │ already differs: /app/DATA/.home/.openclaw/update-check.json │ │ with shared SQLite state: │

Useful agent response.`
  const stripped = stripBenignChatRuntimeWarnings(raw)
  const normalized = normalizeChatMessage(raw)

  assert(!/runs\.sqlite\.migrated/i.test(stripped), 'Expected migrated task registry warning stripped from streamed chunks')
  assert(!/update-check\.json/i.test(stripped), 'Expected update-check warning stripped from streamed chunks')
  assert(normalized === 'Useful agent response.', `Unexpected normalized output: ${normalized}`)
})

// Real replies lost content to filters written for runtime noise: every line of a fenced JSON
// example and every `|` of an ASCII diagram was removed from an otherwise normal FastAPI answer.
const preservedReplies: Array<[string, string]> = [
  ['fenced JSON request/response examples', 'Request:\n\n```json\n{\n  "target_url": "https://example.com/a",\n  "custom_code": "example"\n}\n```\n\nResponse:\n\n```json\n{"status": "ok"}\n```'],
  ['an ASCII diagram inside a text fence', '```text\nClient\n  |\nFastAPI routers\n  |\n│\nPostgreSQL\n```'],
  ['tilde fences and a longer closing fence', '~~~python\nresult = items[m]\n[x for x in range(3)]\n}\n~~~~'],
  ['a fenced warning-shaped line', '```text\nplugin runtime config.loadConfig() is deprecated (runtime-config-load-write); use config.current().\n```'],
  ['an unfenced JSON body that is not runtime output', 'Send this body:\n{\n  "url": "https://example.com",\n  "tags": ["a", "b"]\n}\nThen poll the status.'],
  ['a reply that is only a JSON example', '{\n  "name": "demo",\n  "enabled": true\n}'],
  ['Markdown links and task lists that start with a bracket', '[FastAPI docs](https://fastapi.tiangolo.com)\n[x] Add tests'],
  ['bare file references', 'I created these files:\n\nREADME.md\ndocker-compose.yml'],
  ['a Files heading followed by a Markdown list', 'Files:\n- app/main.py\n- tests/test_api.py'],
  ['prose that begins with CLI-like words', 'Usage is metered per request.\nExamples of valid codes follow.\nGraphQL is not required here.\nOptions include Redis or Postgres.'],
  ['inline code containing a typed JSON object', 'Post `{"type": "click", "x": 1}` to the events endpoint.'],
  ['array indexing that resembles a stripped ANSI code', 'Use `dp[m][n]` and `matrix[1m]` carefully.'],
]
for (const [name, reply] of preservedReplies) {
  test(`preserves ${name}`, () => {
    const normalized = normalizeChatMessage(reply)
    assert(normalized === reply, `Expected the reply unchanged, got:\n${normalized}`)
    assert(normalizeChatMessage(normalized) === normalized, 'Normalizing twice must be stable (history is normalized on read and again in the browser)')
  })
}

const moreReplies: Array<[string, string]> = [
  ['an unfenced JSON block containing a blank line', 'Body:\n{\n  "a": 1,\n\n  "b": {\n    "c": 2\n  }\n}\nDone.'],
  ['braces and brackets inside JSON strings', '{"pattern": "}{][", "path": "/items/{id}"}'],
  ['a stray bracket opening prose', '[1, 2,\nthat list was cut off above, sorry.'],
  ['everything after a fence the reply never closed', 'Partial:\n```json\n{"status": "ok"}\nplugin runtime config.loadConfig() is deprecated (runtime-config-load-write); use config.current().'],
  ['prose lines that start like CLI help headers', 'Options:\n- Redis\n- Postgres\nExamples:\n- docs/README.md\nCommands: run make test'],
]
for (const [name, reply] of moreReplies) {
  test(`preserves ${name}`, () => {
    const normalized = normalizeChatMessage(reply)
    assert(normalized === reply, `Expected the reply unchanged, got:\n${normalized}`)
  })
}

// Runtime output that must still be filtered, each line around a real reply. These are the exact
// shapes the CLI, an echoed tool, or a model without native tool calling writes.
const runtimeNoise: Array<[string, string]> = [
  ['CLI usage line', 'Usage: openclaw agent [options]'],
  ['CLI docs footer', 'Docs: https://docs.openclaw.ai/cli/agent'],
  ['gh field list header', 'Available fields:'],
  ['gh unknown field error', 'Unknown JSON field: "nme"'],
  ['GraphQL error', 'GraphQL: Could not resolve to a Repository with the name x/y. (repository)'],
  ['exec exit status', '(Command exited with code 1)'],
  ['exec still running', 'Command still running (session abc, pid 42).'],
  ['process exit', 'Process exited with code 0.'],
  ['write tool result', 'Successfully wrote 120 bytes to notes.md'],
  ['store path', 'store: ~/.openclaw/agents/a/agent/openclaw-agent.sqlite'],
  ['printed function call', '{"type":"function","name":"read","parameters":{"path":"a.md"}}'],
  ['printed name/arguments call', '{"name": "memory_search", "arguments": {"query": "notes"}}'],
  ['tool result block', '{"type":"toolResult","toolCallId":"c1","content":"ok"}'],
  ['snake-case tool result block', '{"type":"tool_result","tool_use_id":"c1","content":"ok"}'],
  ['thinking block', '{"type":"thinking","thinking":"..."}'],
  ['content block array', '[{"type":"text","text":"Hello"}]'],
]
for (const [name, noise] of runtimeNoise) {
  test(`strips ${name}`, () => {
    const normalized = normalizeChatMessage(`Before.\n${noise}\nAfter.`)
    assert(normalized === 'Before.\nAfter.', `Expected the noise line removed, got:\n${normalized}`)
  })
}

test('normalization stays linear on long replies', () => {
  const reply = Array.from({ length: 40_000 }, (_, index) => `Line ${index} of a long answer.`).join('\n')
  const started = Date.now()
  assert(normalizeChatMessage(reply) === reply, 'A long plain reply must survive unchanged')
  assert(Date.now() - started < 2000, `Normalizing 40k lines took ${Date.now() - started}ms`)
})

test('still strips runtime noise around a fenced answer', () => {
  const raw = '\x1b[33m│ - plugins.deny: plugin not found: cognee-openclaw (stale config entry │\x1b[0m\n{"type":"function","name":"read","parameters":{"path":"a.md"}}\n{ "count": 1, "sessions": [ { "key": "agent:a:main" } ] }\n\nHere is the schema:\n\n```json\n{ "count": 1 }\n```'
  const normalized = normalizeChatMessage(raw)
  assert(normalized === 'Here is the schema:\n\n```json\n{ "count": 1 }\n```', `Unexpected normalized output:\n${normalized}`)
})

test('streaming warning filter keeps fenced lines split across chunks', () => {
  const filter = createStreamingWarningFilter()
  const chunks = ['Plan:\n```te', 'xt\nClient\n  |\n', '│\nAPI\n``', '`\n│ ignored; remove it from plugins config) │\nDone']
  const streamed = chunks.map((chunk) => filter.push(chunk)).join('') + filter.flush()
  assert(streamed === 'Plan:\n```text\nClient\n  |\n│\nAPI\n```\nDone', `Unexpected streamed output:\n${JSON.stringify(streamed)}`)
})

test('local CLI output: OpenClaw console log lines never reach the reply, wherever chunks split', () => {
  // `openclaw agent --local` prints its subsystem logs to stdout, coloured, around the reply (only
  // --json moves them to stderr). Captured from OpenClaw 2026.9.7.
  const esc = '\x1b'
  const stdout = [
    `${esc}[33m[agent/embedded]${esc}[39m ${esc}[36mtool-search: cataloged 46 tools behind compact prompt surface${esc}[39m`,
    `${esc}[33m[provider-transport-fetch]${esc}[39m ${esc}[36m[model-fetch] response provider=openai api=openai-responses model=gpt-5.4-mini status=200${esc}[39m`,
    'DNS translates names like `example.com` into IP addresses.',
    '[docs](https://example.com/dns) and [RFC 1035] cover the details.',
    '```text',
    '[agent/embedded] shown in a code block stays',
    '```',
    `${esc}[33m[agents/agent-command]${esc}[39m ${esc}[36m[agent] run 560b0913 finished${esc}[39m`,
    `${esc}[90m21:04:05${esc}[39m ${esc}[34m[session-sqlite]${esc}[39m ${esc}[36mreclamation worker retired reason=revoked${esc}[39m`,
    '[todo] Write tests for the parser',
    '',
  ].join('\n')
  const expected = [
    'DNS translates names like `example.com` into IP addresses.',
    '[docs](https://example.com/dns) and [RFC 1035] cover the details.',
    '```text',
    '[agent/embedded] shown in a code block stays',
    '```',
    '[todo] Write tests for the parser',
    '',
  ].join('\n')
  for (const size of [1, 7, 64, stdout.length]) {
    const filter = createStreamingWarningFilter()
    let out = ''
    for (let i = 0; i < stdout.length; i += size) out += filter.push(stdout.slice(i, i + size))
    out += filter.flush()
    assert(out === expected, `chunk size ${size}: got ${JSON.stringify(out)}`)
  }
  // Transcripts hold only the model's text: the shared normalizer keeps a line that merely looks like one.
  assert(normalizeChatMessage('[draft] Release notes follow.') === '[draft] Release notes follow.', 'The normalizer keeps a model line that looks like a log line')
})

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
