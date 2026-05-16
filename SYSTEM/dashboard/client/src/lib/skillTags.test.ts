import { collectSkillTags, matchesSelectedSkillTags } from './skillTags'
import type { OpenClawSkill } from '../types'

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
  } catch (error: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${error.message}`)
    testsFailed++
  }
}

function assertEqual(actual: unknown, expected: unknown, message?: string) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) {
    throw new Error(message || `Expected ${expectedJson}, got ${actualJson}`)
  }
}

const sampleSkills: OpenClawSkill[] = [
  {
    name: 'github',
    description: 'GitHub skill',
    filePath: '/tmp/github/SKILL.md',
    bundled: true,
    source: 'bundled',
    tags: ['devtools', 'git'],
  },
  {
    name: 'gog',
    description: 'Google skill',
    filePath: '/tmp/gog/SKILL.md',
    bundled: true,
    source: 'bundled',
    tags: ['email', 'productivity'],
  },
  {
    name: 'review',
    description: 'Review skill',
    filePath: '/tmp/review/SKILL.md',
    bundled: false,
    source: 'workspace',
    tags: ['devtools', 'qa'],
  },
]

console.log(`\n${YELLOW}=== Skill Tags Helper Test Suite ===${RESET}\n`)

test('collectSkillTags returns sorted unique tags', () => {
  assertEqual(collectSkillTags(sampleSkills), ['devtools', 'email', 'git', 'productivity', 'qa'])
})

test('matchesSelectedSkillTags returns true when no tags are selected', () => {
  assertEqual(matchesSelectedSkillTags(sampleSkills[0], new Set()), true)
})

test('matchesSelectedSkillTags matches any selected tag on the skill', () => {
  assertEqual(matchesSelectedSkillTags(sampleSkills[2], new Set(['email', 'qa'])), true)
  assertEqual(matchesSelectedSkillTags(sampleSkills[0], new Set(['email', 'qa'])), false)
})

console.log('\n========================================')
console.log(`Tests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)
console.log('========================================\n')

if (testsFailed > 0) {
  process.exit(1)
}

console.log(`${GREEN}All tests passed${RESET}`)
