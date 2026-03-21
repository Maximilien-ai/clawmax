/**
 * Agent config validation test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/agent-config-validation.test.ts
 */

import { validateAgentConfigSections, validateProvisionInput } from './agent-config-validation'

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

function assertIncludes(values: string[], expected: string, message?: string) {
  if (!values.some(value => value.includes(expected))) {
    throw new Error(message || `Expected to find "${expected}" in ${JSON.stringify(values)}`)
  }
}

const validIdentity = `# IDENTITY.md - Who Am I?

- **Name:** Engineer One
- **Creature:** software engineer
- **Vibe:** calm
- **Emoji:** 🤖
- **WhatsApp:** +14155551234
- **Tags:** engineer, backend
`

const validSoul = `# SOUL.md - Who You Are

## Core Truths

Be direct, reliable, and technically precise. Prefer reading the code before asking questions.
`

const validTools = `# TOOLS.md - Local Notes

## Environment

- Preferred editor: VS Code
- Main repo: clawmax
`

console.log(`\n${YELLOW}=== Agent Config Validation Test Suite ===${RESET}\n`)

test('validateAgentConfigSections accepts valid config', () => {
  const result = validateAgentConfigSections({
    identity: validIdentity,
    soul: validSoul,
    tools: validTools,
  }, 'engineer1')

  assert(result.valid, 'Expected config to be valid')
  assert(result.errors.length === 0, 'Expected no validation errors')
})

test('validateAgentConfigSections allows human-readable identity name', () => {
  const result = validateAgentConfigSections({
    identity: validIdentity.replace('Engineer One', 'CEO'),
    soul: validSoul,
    tools: validTools,
  }, 'engineer1')

  assert(result.valid, 'Expected human-readable identity names to remain valid')
})

test('validateAgentConfigSections rejects duplicate tags and bad WhatsApp', () => {
  const result = validateAgentConfigSections({
    identity: validIdentity
      .replace('+14155551234', '123-456')
      .replace('engineer, backend', 'engineer, engineer'),
    soul: validSoul,
    tools: validTools,
  }, 'engineer1')

  assert(!result.valid, 'Expected config to be invalid')
  assertIncludes(result.errors, 'Duplicate tag')
  assertIncludes(result.errors, 'E.164')
})

test('validateAgentConfigSections allows empty WhatsApp without swallowing following tags', () => {
  const result = validateAgentConfigSections({
    identity: `# Identity: CEO

**Agent ID:** ceo
**Name:** CEO
**Creature:** Chief Executive Officer
**Role:** Executive Leadership
**WhatsApp:**
- **Tags:** leadership, executive
`,
    soul: validSoul,
    tools: validTools,
  }, 'ceo')

  assert(result.valid, 'Expected empty WhatsApp to remain valid')
  assert(!result.errors.some(error => error.includes('E.164')), 'Expected no WhatsApp format error for empty field')
  assert(result.warnings.some(warning => warning.includes('**Vibe:**')), 'Expected legacy role-based identity to warn for missing vibe')
})

test('validateAgentConfigSections warns on weak SOUL.md and TOOLS.md structure', () => {
  const result = validateAgentConfigSections({
    identity: validIdentity,
    soul: 'short soul',
    tools: 'short tools',
  }, 'engineer1')

  assert(result.valid, 'Expected weak content to warn but remain valid')
  assert(result.warnings.length >= 2, 'Expected warnings for short sections')
})

test('validateProvisionInput rejects invalid provisioning payload', () => {
  const result = validateProvisionInput({
    name: 'Engineer One',
    model: '',
    cloneFrom: 'missing-agent',
    whatsapp: '555',
    port: 80,
    tags: ['good-tag', 'Bad Tag'],
  }, {
    existingAgentIds: ['engineer1'],
    availableModels: ['openai/gpt-4o'],
  })

  assert(!result.valid, 'Expected provision validation to fail')
  assertIncludes(result.errors, 'Agent name must be lowercase')
  assertIncludes(result.errors, 'Model is required')
  assertIncludes(result.errors, 'Clone source "missing-agent" was not found')
  assertIncludes(result.errors, 'Gateway port must be an integer between 1024 and 65535')
  assertIncludes(result.errors, 'Tag "Bad Tag"')
})

test('validateProvisionInput warns for unavailable model but stays valid', () => {
  const result = validateProvisionInput({
    name: 'engineer2',
    model: 'openai/gpt-5',
    tags: ['engineer'],
  }, {
    existingAgentIds: ['engineer1'],
    availableModels: ['openai/gpt-4o'],
  })

  assert(result.valid, 'Expected provisioning to remain valid')
  assertIncludes(result.warnings, 'may fall back during provisioning')
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
