import assert from 'assert'
import { extractJsonResponseText, normalizeGeneratedSkillScaffold, parseJsonResponse } from './ai-generator'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`\x1b[32m✓\x1b[0m ${name}`)
    passed++
  } catch (err: any) {
    console.error(`\x1b[31m✗\x1b[0m ${name}`)
    console.error(err?.stack || err)
    failed++
  }
}

console.log('\n\x1b[33m=== AI Generator Test Suite ===\x1b[0m\n')

test('extractJsonResponseText strips fenced json blocks', () => {
  const raw = '```json\n{ "name": "agent" }\n```'
  assert.strictEqual(extractJsonResponseText(raw), '{ "name": "agent" }')
})

test('parseJsonResponse parses fenced json payloads', () => {
  const raw = '```json\n{ "role": "assistant", "emoji": "🤖" }\n```'
  const parsed = parseJsonResponse(raw, {} as { role?: string; emoji?: string })
  assert.strictEqual(parsed.role, 'assistant')
  assert.strictEqual(parsed.emoji, '🤖')
})

test('parseJsonResponse returns fallback on invalid json', () => {
  const fallback = { cron: '', explanation: '' }
  const parsed = parseJsonResponse('not json at all', fallback)
  assert.deepStrictEqual(parsed, fallback)
})

test('normalizeGeneratedSkillScaffold sanitizes skill ids and fills defaults', () => {
  const normalized = normalizeGeneratedSkillScaffold({
    name: 'My Fancy Skill!!!',
    content: '',
  }, 'help summarize pii docs')

  assert.strictEqual(normalized.name, 'my-fancy-skill')
  assert.strictEqual(typeof normalized.description, 'string')
  assert.strictEqual(normalized.emoji, '🛠️')
  assert(normalized.content.includes('## Purpose'))
})

console.log('\n========================================')
console.log(`Tests passed: ${passed}`)
console.log(`Tests failed: ${failed}`)
console.log('========================================\n')

if (failed > 0) {
  process.exit(1)
}

console.log('\x1b[32mAll tests passed\x1b[0m')
