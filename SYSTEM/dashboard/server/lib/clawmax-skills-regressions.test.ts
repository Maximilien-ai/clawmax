import { getSkillById } from './skills'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

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

console.log(`\n${YELLOW}=== ClawMax Skills Regression Tests ===${RESET}\n`)

test('clawmax-resend is discoverable as a packaged first-party skill', () => {
  const skill = getSkillById('clawmax-resend')
  assert(!!skill, 'Expected clawmax-resend to exist')
  assert(skill?.source === 'bundled' || skill?.source === 'workspace', `Expected clawmax-resend to be discoverable, got ${skill?.source}`)
})

test('workspace-ls remains available as a legacy helper skill', () => {
  const skill = getSkillById('workspace-ls')
  assert(!!skill, 'Expected workspace-ls to exist')
  assert(skill?.name === 'workspace-ls', `Expected workspace-ls name, got ${skill?.name}`)
})

test('clawmax-workspace-ls is discoverable as the canonical first-party workspace helper', () => {
  const skill = getSkillById('clawmax-workspace-ls')
  assert(!!skill, 'Expected clawmax-workspace-ls to exist')
  assert(skill?.source === 'bundled' || skill?.source === 'workspace', `Expected clawmax-workspace-ls to be discoverable, got ${skill?.source}`)
})

console.log(`\nTests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`\n${GREEN}All tests passed${RESET}`)
}
