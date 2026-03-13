/**
 * Skills API Test Suite
 *
 * Run with: npx ts-node server/lib/skills.test.ts
 */

import {
  listAvailableSkills,
  getSkillById,
  getAgentSkills,
  setAgentSkills,
  validateSkills
} from './skills'

// ANSI color codes
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn()
    if (result instanceof Promise) {
      result.then(() => {
        console.log(`${GREEN}✓${RESET} ${name}`)
        testsPassed++
      }).catch(err => {
        console.log(`${RED}✗${RESET} ${name}`)
        console.error(`  Error: ${err.message}`)
        testsFailed++
      })
    } else {
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    }
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

console.log(`\n${YELLOW}=== Skills API Test Suite ===${RESET}\n`)

// Test 1: List available skills
test('listAvailableSkills() returns array of skills', () => {
  const skills = listAvailableSkills()
  assert(Array.isArray(skills), 'Should return an array')
  assert(skills.length > 0, 'Should have at least one skill')
  console.log(`  Found ${skills.length} skills`)
})

// Test 2: Skills have required properties
test('Skills have required properties (name, description, emoji)', () => {
  const skills = listAvailableSkills()
  const firstSkill = skills[0]

  assert(typeof firstSkill.name === 'string', 'name should be a string')
  assert(firstSkill.name.length > 0, 'name should not be empty')
  assert(typeof firstSkill.description === 'string', 'description should be a string')
  assert(typeof firstSkill.bundled === 'boolean', 'bundled should be a boolean')
  assert(['bundled', 'managed', 'workspace'].includes(firstSkill.source), 'source should be valid')

  console.log(`  Sample: ${firstSkill.name} ${firstSkill.emoji || ''}`)
})

// Test 3: Get skill by ID - valid skill
test('getSkillById("github") returns github skill', () => {
  const skill = getSkillById('github')

  assert(skill !== null, 'Should find github skill')
  assertEqual(skill!.name, 'github', 'Name should be "github"')
  assert(skill!.emoji === '🐙', 'Should have octopus emoji')
  assert(skill!.description.includes('GitHub'), 'Description should mention GitHub')

  console.log(`  Found: ${skill!.name} ${skill!.emoji}`)
})

// Test 4: Get skill by ID - invalid skill
test('getSkillById("invalid-skill") returns null', () => {
  const skill = getSkillById('invalid-skill')
  assertEqual(skill, null, 'Should return null for invalid skill')
})

// Test 5: Validate skills - all valid
test('validateSkills(["github", "slack"]) is valid', () => {
  const result = validateSkills(['github', 'slack'])

  assert(result.valid === true, 'Should be valid')
  assert(result.missing.length === 0, 'Should have no missing skills')
})

// Test 6: Validate skills - some invalid
test('validateSkills(["github", "fake"]) is invalid', () => {
  const result = validateSkills(['github', 'fake-skill'])

  assert(result.valid === false, 'Should be invalid')
  assert(result.missing.length === 1, 'Should have 1 missing skill')
  assert(result.missing.includes('fake-skill'), 'Should include "fake-skill"')
})

// Test 7: Validate skills - all invalid
test('validateSkills(["fake1", "fake2"]) lists all missing', () => {
  const result = validateSkills(['fake1', 'fake2'])

  assert(result.valid === false, 'Should be invalid')
  assertEqual(result.missing.length, 2, 'Should have 2 missing skills')
})

// Test 8: Get agent skills - agent with skills
test('getAgentSkills("engineer") returns assigned skills', () => {
  const skills = getAgentSkills('engineer')

  assert(Array.isArray(skills), 'Should return an array')
  // May be empty if no skills assigned yet
  console.log(`  Engineer has ${skills.length} skills: ${skills.join(', ') || '(none)'}`)
})

// Test 9: Get agent skills - non-existent agent
test('getAgentSkills("nonexistent") returns empty array', () => {
  const skills = getAgentSkills('nonexistent-agent-id')

  assert(Array.isArray(skills), 'Should return an array')
  assertEqual(skills.length, 0, 'Should be empty for non-existent agent')
})

// Test 10: Skills are sorted alphabetically
test('listAvailableSkills() returns sorted skills', () => {
  const skills = listAvailableSkills()

  for (let i = 1; i < Math.min(5, skills.length); i++) {
    const prev = skills[i - 1].name
    const curr = skills[i].name
    assert(prev.localeCompare(curr) <= 0, `Skills should be sorted: ${prev} should come before ${curr}`)
  }

  console.log(`  First 3: ${skills.slice(0, 3).map(s => s.name).join(', ')}`)
})

// Test 11: GitHub skill has install options
test('GitHub skill has install options', () => {
  const skill = getSkillById('github')

  assert(skill !== null, 'GitHub skill should exist')
  assert(Array.isArray(skill!.install), 'Should have install array')
  assert((skill!.install?.length || 0) > 0, 'Should have at least one install option')

  const brewInstall = skill!.install?.find(i => i.kind === 'brew')
  assert(brewInstall !== undefined, 'Should have brew install option')
  assertEqual(brewInstall!.formula, 'gh', 'Brew formula should be "gh"')

  console.log(`  Install options: ${skill!.install?.map(i => i.kind).join(', ')}`)
})

// Test 12: GitHub skill has requirements
test('GitHub skill requires gh binary', () => {
  const skill = getSkillById('github')

  assert(skill !== null, 'GitHub skill should exist')
  assert(skill!.requires !== undefined, 'Should have requirements')
  assert(Array.isArray(skill!.requires?.bins), 'Should have bins array')
  assert(skill!.requires?.bins?.includes('gh') === true, 'Should require "gh" binary')

  console.log(`  Requires: ${skill!.requires?.bins?.join(', ')}`)
})

// Test 13: Skills have unique names
test('All skills have unique names', () => {
  const skills = listAvailableSkills()
  const names = skills.map(s => s.name)
  const uniqueNames = new Set(names)

  assertEqual(names.length, uniqueNames.size, 'All skill names should be unique')
  console.log(`  ${uniqueNames.size} unique skills`)
})

// Test 14: Bundled skills are from OpenClaw repo
test('Bundled skills have correct file path', () => {
  const skills = listAvailableSkills()
  const bundledSkills = skills.filter(s => s.bundled)

  assert(bundledSkills.length > 0, 'Should have bundled skills')

  const firstBundled = bundledSkills[0]
  assert(firstBundled.filePath.includes('/openclaw/skills/'), 'Path should include /openclaw/skills/')
  assert(firstBundled.filePath.endsWith('SKILL.md'), 'Path should end with SKILL.md')

  console.log(`  ${bundledSkills.length} bundled skills found`)
})

// Summary
setTimeout(() => {
  console.log(`\n${YELLOW}=== Test Summary ===${RESET}`)
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`)

  if (testsFailed > 0) {
    console.log(`${RED}Failed: ${testsFailed}${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed! ✓${RESET}\n`)
    process.exit(0)
  }
}, 100)
