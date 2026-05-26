/**
 * Chat normalization test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/chat-normalization.test.ts
 */

import { normalizeChatMessage } from './chat-normalization'

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
