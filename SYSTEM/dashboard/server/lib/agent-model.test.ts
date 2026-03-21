/**
 * Agent model update test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/agent-model.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { updateAgentModelInConfigFile } from './agent-model'
import { parseIdentity } from './workspace'

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

console.log(`\n${YELLOW}=== Agent Model Test Suite ===${RESET}\n`)

test('updateAgentModelInConfigFile updates model in openclaw.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'ceo', name: 'CEO', model: 'anthropic/claude-3-haiku-20240307' }
      ]
    }
  }, null, 2))

  const result = updateAgentModelInConfigFile(configPath, 'ceo', 'openai/gpt-4.1')
  assert(result.ok, result.error || 'Expected update to succeed')

  const updated = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(updated.agents.list[0].model === 'openai/gpt-4.1', 'Expected model to be updated')
  assert(typeof updated.meta?.lastTouchedAt === 'string', 'Expected metadata stamp to be written')
})

test('updateAgentModelInConfigFile rejects missing agent', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-model-test-'))
  const configPath = path.join(tmpDir, 'openclaw.json')

  fs.writeFileSync(configPath, JSON.stringify({
    agents: { list: [] }
  }, null, 2))

  const result = updateAgentModelInConfigFile(configPath, 'missing', 'openai/gpt-4.1')
  assert(!result.ok, 'Expected update to fail')
  assert((result.error || '').includes('not found'), 'Expected missing agent error')
})

test('parseIdentity extracts model from markdown', () => {
  const identity = parseIdentity(`# Identity

**Agent ID:** ceo
**Name:** CEO
**Model:** openai/gpt-4.1
`)

  assert(identity.model === 'openai/gpt-4.1', 'Expected parseIdentity to extract model')
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
