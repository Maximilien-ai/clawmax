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
  validateSkills,
  importWorkspaceSkill,
  deleteWorkspaceSkill,
  getWorkspaceSkillsDir
} from './skills'
import fs from 'fs'
import path from 'path'
import os from 'os'

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

// Test 15: importWorkspaceSkill auto-renames skill.md → SKILL.md
test('importWorkspaceSkill() auto-renames skill.md to SKILL.md', () => {
  // Cleanup any existing test skill from previous runs
  try { deleteWorkspaceSkill('test-rename-skill') } catch (e) {}

  // Create temporary skill directory with lowercase skill.md
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-skill-'))
  const skillDir = path.join(tmpDir, 'test-rename-skill')
  fs.mkdirSync(skillDir)

  // Create skill.md (lowercase)
  const skillContent = `---
name: Test Rename Skill
description: Test skill for auto-rename
---

# Test Skill

This is a test skill.`

  fs.writeFileSync(path.join(skillDir, 'skill.md'), skillContent)

  // Create index.ts (required for validation)
  fs.writeFileSync(path.join(skillDir, 'index.ts'), 'export default function() {}')

  // Import the skill
  const result = importWorkspaceSkill(skillDir)

  // Verify import succeeded
  assert(result.success === true, `Import should succeed. Error: ${result.error}`)
  assert(result.skillId === 'test-rename-skill', 'Should return correct skill ID')

  // Verify SKILL.md exists and skill.md doesn't
  // Note: On case-insensitive filesystems, must check actual filename list
  const importedSkillPath = path.join(getWorkspaceSkillsDir(), 'test-rename-skill')
  const files = fs.readdirSync(importedSkillPath)
  assert(files.includes('SKILL.md'), 'SKILL.md should exist')
  assert(!files.includes('skill.md'), 'skill.md should not exist')

  // Cleanup
  deleteWorkspaceSkill('test-rename-skill')
  fs.rmSync(tmpDir, { recursive: true, force: true })

  console.log('  ✓ skill.md renamed to SKILL.md')
})

// Test 16: importWorkspaceSkill preserves existing SKILL.md
test('importWorkspaceSkill() preserves existing SKILL.md', () => {
  // Cleanup any existing test skill from previous runs
  try { deleteWorkspaceSkill('test-preserve-skill') } catch (e) {}

  // Create temporary skill directory with uppercase SKILL.md
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-skill-'))
  const skillDir = path.join(tmpDir, 'test-preserve-skill')
  fs.mkdirSync(skillDir)

  // Create SKILL.md (uppercase) - but validation still needs skill.md
  const skillContent = `---
name: Test Preserve Skill
description: Test skill for preserve SKILL.md
---

# Test Skill

This skill already has SKILL.md.`

  // Create both files (skill.md for validation, SKILL.md to test preservation)
  fs.writeFileSync(path.join(skillDir, 'skill.md'), skillContent)
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent)
  fs.writeFileSync(path.join(skillDir, 'index.ts'), 'export default function() {}')

  // Import the skill
  const result = importWorkspaceSkill(skillDir)

  // Verify import succeeded
  assert(result.success === true, 'Import should succeed')

  // Verify SKILL.md still exists
  const importedSkillPath = path.join(getWorkspaceSkillsDir(), 'test-preserve-skill')
  assert(fs.existsSync(path.join(importedSkillPath, 'SKILL.md')), 'SKILL.md should exist')

  // Verify content is preserved
  const importedContent = fs.readFileSync(path.join(importedSkillPath, 'SKILL.md'), 'utf-8')
  assert(importedContent.includes('already has SKILL.md'), 'Content should be preserved')

  // Cleanup
  deleteWorkspaceSkill('test-preserve-skill')
  fs.rmSync(tmpDir, { recursive: true, force: true })

  console.log('  ✓ SKILL.md preserved')
})

// Test 17: importWorkspaceSkill with tags updates renamed file
test('importWorkspaceSkill() adds tags to renamed SKILL.md', () => {
  // Cleanup any existing test skill from previous runs
  try { deleteWorkspaceSkill('test-tags-skill') } catch (e) {}

  // Create temporary skill directory with lowercase skill.md
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-skill-'))
  const skillDir = path.join(tmpDir, 'test-tags-skill')
  fs.mkdirSync(skillDir)

  // Create skill.md with frontmatter
  const skillContent = `---
name: Test Tags Skill
description: Test skill for tags
---

# Test Skill

This is a test skill.`

  fs.writeFileSync(path.join(skillDir, 'skill.md'), skillContent)
  fs.writeFileSync(path.join(skillDir, 'index.ts'), 'export default function() {}')

  // Import the skill with tags
  const result = importWorkspaceSkill(skillDir, ['test', 'automation'])

  // Verify import succeeded
  assert(result.success === true, 'Import should succeed')

  // Verify SKILL.md has tags
  const importedSkillPath = path.join(getWorkspaceSkillsDir(), 'test-tags-skill')
  const importedContent = fs.readFileSync(path.join(importedSkillPath, 'SKILL.md'), 'utf-8')

  assert(importedContent.includes('tags:'), 'Should have tags in frontmatter')
  assert(importedContent.includes('- test'), 'Should have "test" tag')
  assert(importedContent.includes('- automation'), 'Should have "automation" tag')

  // Cleanup
  deleteWorkspaceSkill('test-tags-skill')
  fs.rmSync(tmpDir, { recursive: true, force: true })

  console.log('  ✓ Tags added to renamed SKILL.md')
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
