import fs from 'fs'
import path from 'path'
import os from 'os'
import { resetWorkspaceManagerForTests } from './workspace-manager'
import type { OpenClawSkill, SkillInstallOption } from './skills'

/**
 * Skills API Test Suite
 *
 * Run with: npx ts-node server/lib/skills.test.ts
 */

function setupTestWorkspace() {
  const originalHome = os.homedir()
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-skills-home-'))
  const tempWorkspace = path.join(tempHome, '.openclaw', 'workspace')
  const registryPath = path.join(tempHome, '.openclaw', 'dashboard-workspaces.json')
  const openClawConfigPath = path.join(tempHome, '.openclaw', 'openclaw.json')

  fs.mkdirSync(path.join(tempWorkspace, 'SKILLS', 'custom'), { recursive: true })
  fs.writeFileSync(openClawConfigPath, JSON.stringify({ agents: { list: [] } }, null, 2))
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'default',
    workspaces: [
      {
        id: 'default',
        name: 'Test',
        path: tempWorkspace,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      }
    ]
  }, null, 2))

  process.env.HOME = tempHome
  process.env.OPENCLAW_WORKSPACE = tempWorkspace
  if (!process.env.OPENCLAW_SKILLS_DIR) {
    const fallbackSkillsDir = path.join(originalHome, 'github/maximilien/openclaw/skills')
    if (fs.existsSync(fallbackSkillsDir)) {
      process.env.OPENCLAW_SKILLS_DIR = fallbackSkillsDir
    }
  }
  resetWorkspaceManagerForTests()

  return { tempHome, tempWorkspace }
}

const testEnv = setupTestWorkspace()

const {
  listAvailableSkills,
  getSkillById,
  getSkillContent,
  getAgentSkills,
  setAgentSkills,
  validateSkills,
  createCustomSkill,
  importWorkspaceSkill,
  deleteWorkspaceSkill,
  getWorkspaceSkillsDir,
  updateSkillContent,
  getSkillRequirementInstallCommands,
  getSkillSetupCommands,
  validateSkillChanges
} = require('./skills')

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

test('getSkillById("workspace-ls") returns packaged ClawMax repo skill', () => {
  const skill = getSkillById('workspace-ls')

  assert(skill !== null, 'Should find workspace-ls skill')
  assertEqual(skill!.name, 'workspace-ls', 'Name should be "workspace-ls"')
  assert(skill!.source === 'bundled' || skill!.source === 'workspace', 'workspace-ls should be discoverable in the catalog')
})

test('updateSkillContent() creates a workspace copy when editing a bundled skill', () => {
  const bundledSkill = getSkillById('workspace-ls')
  assert(bundledSkill, 'Expected bundled workspace-ls skill')
  assertEqual(bundledSkill!.source, 'bundled', 'Expected packaged skill to appear as bundled before edit')

  const original = getSkillContent('workspace-ls')
  assert(original, 'Expected original content for workspace-ls')

  const nextContent = `${original!.content}\n\n<!-- workspace copy test -->\n`
  const updated = updateSkillContent('workspace-ls', nextContent)

  assertEqual(updated.skill.source, 'workspace', 'Edited bundled skill should become a workspace variant')
  assertEqual(updated.skill.variantOf, 'workspace-ls', 'Workspace copy should record original skill name')
  assertEqual(updated.skill.originalSource, 'bundled', 'Workspace copy should record original source')
  assert(updated.content.includes('workspace copy test'), 'Updated content should persist')
})

test('updateSkillContent() can rename a managed skill and keep it editable', () => {
  const created = createCustomSkill({
    name: 'test-editable-skill',
    description: 'Original description',
    content: '# Test Editable Skill\n\nInitial body.\n',
  })
  assertEqual(created.source, 'managed', 'Expected managed custom skill to be created')

  const renamed = updateSkillContent('test-editable-skill', '# Test Editable Skill\n\nUpdated body.\n', {
    name: 'test-editable-skill-v2',
    description: 'Updated description',
  })

  assertEqual(renamed.skill.name, 'test-editable-skill-v2', 'Expected renamed skill name')
  assertEqual(renamed.skill.id, 'test-editable-skill-v2', 'Expected renamed managed skill id')
  assertEqual(renamed.skill.source, 'managed', 'Expected managed skill to stay managed')
  assert(renamed.content.includes('Updated description'), 'Expected updated description to persist in content')
  assertEqual(getSkillById('test-editable-skill'), null, 'Expected old skill name lookup to disappear')

  const reopened = getSkillContent('test-editable-skill-v2')
  assert(reopened, 'Expected renamed skill to be reopenable')
  const secondSave = updateSkillContent('test-editable-skill-v2', `${reopened!.content}\n<!-- renamed again -->\n`, {
    name: 'test-editable-skill-v2',
    description: 'Updated description',
  })
  assert(secondSave.content.includes('renamed again'), 'Expected renamed skill to remain editable')
  deleteWorkspaceSkill('test-editable-skill-v2')
})

test('updateSkillContent() can rename a bundled skill into a workspace copy', () => {
  const original = getSkillContent('workspace-ls')
  assert(original, 'Expected original content for workspace-ls')

  const updated = updateSkillContent('workspace-ls', original!.content, {
    name: 'workspace-ls-custom',
    description: 'Workspace copy of workspace-ls',
  })

  assertEqual(updated.skill.name, 'workspace-ls-custom', 'Expected workspace copy to use the new name')
  assertEqual(updated.skill.id, 'workspace-ls-custom', 'Expected workspace copy id to follow the renamed slug')
  assertEqual(updated.skill.source, 'workspace', 'Expected bundled edit to create workspace copy')
  assertEqual(updated.skill.variantOf, 'workspace-ls', 'Expected workspace copy to remember bundled parent')
  deleteWorkspaceSkill('workspace-ls-custom')
})

test('deleteWorkspaceSkill() removes managed custom skills too', () => {
  const created = createCustomSkill({
    name: 'test-managed-delete-skill',
    description: 'Managed skill delete coverage',
    content: '# Test Managed Delete Skill\n',
  })
  assert(created.source === 'managed', 'Expected managed custom skill to be created')

  const deleted = deleteWorkspaceSkill('test-managed-delete-skill')
  assertEqual(deleted.success, true, 'Expected managed custom skill delete to succeed')
  assertEqual(getSkillById('test-managed-delete-skill'), null, 'Expected deleted managed skill to be gone')
})

test('workspace skills expose registry provenance metadata when present', () => {
  const workspaceSkillsDir = getWorkspaceSkillsDir()
  const skillDir = path.join(workspaceSkillsDir, 'test-tessl-skill')
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: test-tessl-skill
description: Skill imported from Tessl
metadata:
  openclaw:
    registryProvider: tessl
    registryName: acme/test-tessl-skill
---

# Test Tessl Skill
`, 'utf-8')

  const skill = getSkillById('test-tessl-skill')
  assert(skill !== null, 'Expected imported registry skill to load')
  assertEqual(skill!.registryProvider as any, 'tessl', 'Expected registry provider metadata')
  assertEqual(skill!.registryName as any, 'acme/test-tessl-skill', 'Expected registry name metadata')

  deleteWorkspaceSkill('test-tessl-skill')
})

test('workspace skills expose setup requirement metadata when present', () => {
  const workspaceSkillsDir = getWorkspaceSkillsDir()
  const skillDir = path.join(workspaceSkillsDir, 'test-setup-skill')
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: test-setup-skill
description: Skill with guided setup metadata
setupRequirements:
  label: Needs setup
  message: Finish auth before use.
  actionId: gog-google-workspace-auth
  actionLabel: Complete Setup
  inputs:
    - key: clientSecretPath
      label: Client Secret JSON
      kind: path
      required: true
    - key: accountEmail
      label: Google Account Email
      kind: email
      required: true
---

# Test Setup Skill
`, 'utf-8')

  const skill = getSkillById('test-setup-skill')
  assert(skill !== null, 'Expected setup skill to load')
  assertEqual(skill!.setupRequirements?.actionId as any, 'gog-google-workspace-auth', 'Expected setup action id to persist')
  assertEqual(skill!.setupRequirements?.inputs?.length as any, 2, 'Expected setup inputs to persist')

  deleteWorkspaceSkill('test-setup-skill')
})

test('getSkillSetupCommands() builds guided setup commands from metadata action id', () => {
  const commands = getSkillSetupCommands({
    name: 'test-setup-skill',
    description: 'Skill with setup',
    filePath: '/tmp/test-setup-skill/SKILL.md',
    bundled: false,
    source: 'workspace',
    setupRequirements: {
      label: 'Needs setup',
      message: 'Finish auth before use.',
      actionId: 'gog-google-workspace-auth',
      inputs: [
        { key: 'clientSecretPath', label: 'Client Secret JSON', kind: 'path', required: true },
        { key: 'accountEmail', label: 'Google Account Email', kind: 'email', required: true },
      ],
    },
  }, {
    inputs: {
      clientSecretPath: '/tmp/client_secret.json',
      accountEmail: 'you@gmail.com',
    },
  })

  assertEqual(commands.length, 3, 'Expected guided setup to emit all gog setup commands')
  assertEqual(commands[0].display, 'gog auth credentials /tmp/client_secret.json', 'Expected credentials command')
  assertEqual(commands[1].display, 'gog auth add you@gmail.com --services gmail,calendar,drive,contacts,docs,sheets', 'Expected auth add command')
  assertEqual(commands[2].display, 'gog auth list', 'Expected auth list verification command')
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

test('getAgentSkills() prefers the active workspace record when ids collide', () => {
  const configPath = path.join(testEnv.tempHome, '.openclaw', 'openclaw.json')
  const defaultWorkspaceAgent = path.join(testEnv.tempHome, '.openclaw', 'workspace', 'AGENTS', 'shared-agent')
  const activeWorkspace = path.join(testEnv.tempHome, '.openclaw', 'workspaces', 'skills-system-test')
  const activeWorkspaceAgent = path.join(activeWorkspace, 'AGENTS', 'shared-agent')

  fs.mkdirSync(defaultWorkspaceAgent, { recursive: true })
  fs.mkdirSync(activeWorkspaceAgent, { recursive: true })
  fs.writeFileSync(path.join(testEnv.tempHome, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'system-test',
    workspaces: [
      {
        id: 'default',
        name: 'Test',
        path: path.join(testEnv.tempHome, '.openclaw', 'workspace'),
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      },
      {
        id: 'system-test',
        name: 'System Test',
        path: activeWorkspace,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      }
    ]
  }, null, 2))
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      auth: { token: 'stable-token' },
      remote: { token: 'stable-token' },
    },
    agents: {
      list: [
        { id: 'shared-agent', workspace: defaultWorkspaceAgent, skills: ['github'] },
        { id: 'shared-agent', workspace: activeWorkspaceAgent, skills: ['slack'] },
      ]
    }
  }, null, 2))
  process.env.OPENCLAW_WORKSPACE = activeWorkspace
  resetWorkspaceManagerForTests()

  const skills = getAgentSkills('shared-agent')
  assertEqual(JSON.stringify(skills), JSON.stringify(['slack']), 'Expected active workspace skill list')
})

test('setAgentSkills() updates only the active workspace record and preserves gateway config', () => {
  const configPath = path.join(testEnv.tempHome, '.openclaw', 'openclaw.json')
  const defaultWorkspaceAgent = path.join(testEnv.tempHome, '.openclaw', 'workspace', 'AGENTS', 'shared-agent')
  const activeWorkspace = path.join(testEnv.tempHome, '.openclaw', 'workspaces', 'skills-system-test')
  const activeWorkspaceAgent = path.join(activeWorkspace, 'AGENTS', 'shared-agent')

  fs.mkdirSync(defaultWorkspaceAgent, { recursive: true })
  fs.mkdirSync(activeWorkspaceAgent, { recursive: true })
  fs.writeFileSync(path.join(testEnv.tempHome, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'system-test',
    workspaces: [
      {
        id: 'default',
        name: 'Test',
        path: path.join(testEnv.tempHome, '.openclaw', 'workspace'),
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      },
      {
        id: 'system-test',
        name: 'System Test',
        path: activeWorkspace,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      }
    ]
  }, null, 2))
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      auth: { token: 'stable-token' },
      remote: { token: 'stable-token' },
      tailscale: { enabled: true, hostname: 'stable-host' },
    },
    agents: {
      list: [
        { id: 'shared-agent', workspace: defaultWorkspaceAgent, skills: ['github'] },
        { id: 'shared-agent', workspace: activeWorkspaceAgent, skills: ['slack'] },
      ]
    }
  }, null, 2))
  process.env.OPENCLAW_WORKSPACE = activeWorkspace
  resetWorkspaceManagerForTests()

  setAgentSkills('shared-agent', ['github', 'workspace-ls'])

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const defaultEntry = config.agents.list.find((entry: any) => entry.workspace === defaultWorkspaceAgent)
  const activeEntry = config.agents.list.find((entry: any) => entry.workspace === activeWorkspaceAgent)
  assertEqual(JSON.stringify(defaultEntry.skills), JSON.stringify(['github']), 'Expected stale workspace skills unchanged')
  assertEqual(JSON.stringify(activeEntry.skills), JSON.stringify(['github', 'workspace-ls']), 'Expected active workspace skills updated')
  assertEqual(config.gateway.auth.token, 'stable-token', 'Expected gateway auth token preserved')
  assertEqual(config.gateway.remote.token, 'stable-token', 'Expected gateway remote token preserved')
  assertEqual(config.gateway.tailscale.hostname, 'stable-host', 'Expected gateway tailscale preserved')
})

test('setAgentSkills() is a no-op when the requested skills are unchanged', () => {
  const configPath = path.join(testEnv.tempHome, '.openclaw', 'openclaw.json')
  const workspacePath = path.join(testEnv.tempHome, '.openclaw', 'workspaces', 'skills-noop-test')
  const workspaceAgent = path.join(workspacePath, 'AGENTS', 'noop-agent')

  fs.mkdirSync(workspaceAgent, { recursive: true })
  fs.writeFileSync(path.join(testEnv.tempHome, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'noop-test',
    workspaces: [
      {
        id: 'default',
        name: 'Test',
        path: path.join(testEnv.tempHome, '.openclaw', 'workspace'),
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      },
      {
        id: 'noop-test',
        name: 'Noop Test',
        path: workspacePath,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      }
    ]
  }, null, 2))
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      auth: { token: 'stable-token' },
    },
    agents: {
      list: [
        { id: 'noop-agent', workspace: workspaceAgent, skills: ['github', 'workspace-ls'] },
      ]
    }
  }, null, 2))
  process.env.OPENCLAW_WORKSPACE = workspacePath
  resetWorkspaceManagerForTests()

  const before = fs.readFileSync(configPath, 'utf-8')
  setAgentSkills('noop-agent', ['github', 'workspace-ls'])
  const after = fs.readFileSync(configPath, 'utf-8')

  assertEqual(after, before, 'Expected no config rewrite when skills are unchanged')
})

test('setAgentSkills() refreshes TOOLS skill hints and resets cached sessions', () => {
  const configPath = path.join(testEnv.tempHome, '.openclaw', 'openclaw.json')
  const workspacePath = path.join(testEnv.tempHome, '.openclaw', 'workspaces', 'skills-sync-test')
  const workspaceAgent = path.join(workspacePath, 'AGENTS', 'skills-sync-agent')

  fs.mkdirSync(workspaceAgent, { recursive: true })
  fs.writeFileSync(path.join(workspaceAgent, 'TOOLS.md'), '# TOOLS.md - Local Notes\n\nOriginal notes.\n', 'utf-8')
  fs.writeFileSync(path.join(testEnv.tempHome, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'skills-sync-test',
    workspaces: [
      {
        id: 'default',
        name: 'Test',
        path: path.join(testEnv.tempHome, '.openclaw', 'workspace'),
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      },
      {
        id: 'skills-sync-test',
        name: 'Skills Sync Test',
        path: workspacePath,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      }
    ]
  }, null, 2))
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'skills-sync-agent', workspace: workspaceAgent, skills: ['github'] },
      ]
    }
  }, null, 2))

  const sessionsDir = path.join(testEnv.tempHome, '.openclaw', 'agents', 'skills-sync-agent', 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), JSON.stringify({
    'agent:skills-sync-agent:main': { model: 'openai/gpt-4o-mini' },
  }), 'utf-8')
  fs.writeFileSync(path.join(sessionsDir, 'main.jsonl'), '{"type":"session"}\n', 'utf-8')

  process.env.OPENCLAW_WORKSPACE = workspacePath
  resetWorkspaceManagerForTests()

  setAgentSkills('skills-sync-agent', ['github', 'gog'])

  const tools = fs.readFileSync(path.join(workspaceAgent, 'TOOLS.md'), 'utf-8')
  assert(tools.includes('## Assigned Skills'), 'Expected TOOLS.md assigned skills section')
  assert(tools.includes('- github'), 'Expected github listed in TOOLS.md assigned skills')
  assert(tools.includes('- gog'), 'Expected gog listed in TOOLS.md assigned skills')
  assert(!fs.existsSync(path.join(sessionsDir, 'sessions.json')), 'Expected live sessions index removed after skill change')
  assert(fs.existsSync(path.join(sessionsDir, 'archive')), 'Expected archived sessions after skill change')
})

test('setAgentSkills() syncs TOOLS.md for agents whose record workspace differs from the active workspace', () => {
  const configPath = path.join(testEnv.tempHome, '.openclaw', 'openclaw.json')
  const activeWorkspacePath = path.join(testEnv.tempHome, '.openclaw', 'workspaces', 'active-skills-workspace')
  const externalWorkspaceAgent = path.join(testEnv.tempHome, '.openclaw', 'workspace', 'AGENTS', 'jarvis')

  fs.mkdirSync(path.join(activeWorkspacePath, 'AGENTS'), { recursive: true })
  fs.mkdirSync(externalWorkspaceAgent, { recursive: true })
  fs.writeFileSync(path.join(externalWorkspaceAgent, 'TOOLS.md'), '# TOOLS.md - Local Notes\n\nOriginal external workspace notes.\n', 'utf-8')
  fs.writeFileSync(path.join(testEnv.tempHome, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'active-skills-workspace',
    workspaces: [
      {
        id: 'default',
        name: 'Test',
        path: path.join(testEnv.tempHome, '.openclaw', 'workspace'),
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      },
      {
        id: 'active-skills-workspace',
        name: 'Active Skills Workspace',
        path: activeWorkspacePath,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      }
    ]
  }, null, 2))
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [
        { id: 'jarvis', workspace: externalWorkspaceAgent, skills: ['github'] },
      ]
    }
  }, null, 2))

  process.env.OPENCLAW_WORKSPACE = activeWorkspacePath
  resetWorkspaceManagerForTests()

  setAgentSkills('jarvis', ['github', 'gog'])

  const tools = fs.readFileSync(path.join(externalWorkspaceAgent, 'TOOLS.md'), 'utf-8')
  assert(tools.includes('- gog'), 'Expected TOOLS.md sync to use the matched record workspace, not the active workspace path')
})

// Test 10: Skills are sorted alphabetically
test('listAvailableSkills() returns sorted skills', () => {
  const skills = listAvailableSkills()

  for (let i = 1; i < Math.min(5, skills.length); i++) {
    const prev = skills[i - 1].name
    const curr = skills[i].name
    assert(prev.localeCompare(curr) <= 0, `Skills should be sorted: ${prev} should come before ${curr}`)
  }

  console.log(`  First 3: ${skills.slice(0, 3).map((s: OpenClawSkill) => s.name).join(', ')}`)
})

// Test 11: GitHub skill has install options
test('GitHub skill has install options', () => {
  const skill = getSkillById('github')

  assert(skill !== null, 'GitHub skill should exist')
  assert(Array.isArray(skill!.install), 'Should have install array')
  assert((skill!.install?.length || 0) > 0, 'Should have at least one install option')

  const brewInstall = skill!.install?.find((i: SkillInstallOption) => i.kind === 'brew')
  assert(brewInstall !== undefined, 'Should have brew install option')
  assertEqual(brewInstall!.formula, 'gh', 'Brew formula should be "gh"')

  console.log(`  Install options: ${skill!.install?.map((i: SkillInstallOption) => i.kind).join(', ')}`)
})

test('getSkillRequirementInstallCommands() builds deduplicated brew commands', () => {
  const skill = getSkillById('github')

  assert(skill !== null, 'GitHub skill should exist')
  const commands = getSkillRequirementInstallCommands({
    ...skill!,
    install: [
      ...(skill!.install || []),
      { id: 'dup-gh', kind: 'brew', formula: 'gh', label: 'Duplicate gh install' },
    ],
  })

  assertEqual(commands.length, 1, 'Expected duplicate brew formulas to collapse into one command')
  assertEqual(commands[0].display, 'brew install gh', 'Expected brew install command display')
})

test('validateSkillChanges() warns about preserved invalid skills without blocking valid additions', () => {
  const result = validateSkillChanges(
    ['fake-old-skill', 'github'],
    ['fake-old-skill', 'github', 'workspace-ls'],
  )

  assertEqual(JSON.stringify(result.invalidAdded), JSON.stringify([]), 'Expected no newly added invalid skills')
  assertEqual(JSON.stringify(result.invalidPreserved), JSON.stringify(['fake-old-skill']), 'Expected preserved invalid skill warning')
})

test('validateSkillChanges() still blocks newly added invalid skills', () => {
  const result = validateSkillChanges(
    ['fake-old-skill', 'github'],
    ['fake-old-skill', 'github', 'fake-new-skill'],
  )

  assertEqual(JSON.stringify(result.invalidAdded), JSON.stringify(['fake-new-skill']), 'Expected new invalid skill to block')
  assertEqual(JSON.stringify(result.invalidPreserved), JSON.stringify(['fake-old-skill']), 'Expected preserved invalid skill warning to remain')
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
  const names = skills.map((s: OpenClawSkill) => s.name)
  const uniqueNames = new Set(names)

  assertEqual(names.length, uniqueNames.size, 'All skill names should be unique')
  console.log(`  ${uniqueNames.size} unique skills`)
})

// Test 14: Bundled skills are from OpenClaw repo
test('Bundled skills have correct file path', () => {
  const skills = listAvailableSkills()
  const bundledSkills = skills.filter((s: OpenClawSkill) => s.bundled)

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

// Test 18: importWorkspaceSkill() creates index.ts shim for index.js-only skills
test('importWorkspaceSkill() generates index.ts shim when only index.js exists', () => {
  try { deleteWorkspaceSkill('test-js-only-skill') } catch (e) {}

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-skill-'))
  const skillDir = path.join(tmpDir, 'test-js-only-skill')
  fs.mkdirSync(skillDir)

  const skillContent = `---
name: Test JS Only Skill
description: Test skill for index.js fallback
---

# Test Skill

This skill only ships index.js.`

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent)
  fs.writeFileSync(path.join(skillDir, 'index.js'), 'module.exports = {}')

  const result = importWorkspaceSkill(skillDir)

  assert(result.success === true, `Import should succeed. Error: ${result.error}`)
  assert(typeof result.warning === 'string' && result.warning.includes('generated a minimal index.ts'), 'Should return a shim warning')

  const importedSkillPath = path.join(getWorkspaceSkillsDir(), 'test-js-only-skill')
  assert(fs.existsSync(path.join(importedSkillPath, 'index.js')), 'Original index.js should be preserved')
  assert(fs.existsSync(path.join(importedSkillPath, 'index.ts')), 'Generated index.ts shim should exist')

  const shimContent = fs.readFileSync(path.join(importedSkillPath, 'index.ts'), 'utf-8')
  assert(shimContent.includes('Auto-generated by ClawMax'), 'Generated index.ts should mention it was auto-generated')

  deleteWorkspaceSkill('test-js-only-skill')
  fs.rmSync(tmpDir, { recursive: true, force: true })

  console.log('  ✓ index.ts shim generated for index.js-only skill')
})

// Test 19: createCustomSkill() writes index.ts stub
test('createCustomSkill() writes index.ts entrypoint for new managed skills', () => {
  const skillName = 'test-ai-created-skill'
  const managedSkillDir = path.join(process.env.HOME!, '.openclaw', 'skills', skillName)
  try { fs.rmSync(managedSkillDir, { recursive: true, force: true }) } catch (e) {}

  const skill = createCustomSkill({
    name: skillName,
    description: 'Test AI-created skill',
    content: '# Test Skill\n\n## Purpose\n\nThis is a test.',
  })

  assert(skill.name === skillName, 'Created skill should keep requested name')
  assert(fs.existsSync(path.join(managedSkillDir, 'SKILL.md')), 'SKILL.md should exist')
  assert(fs.existsSync(path.join(managedSkillDir, 'index.ts')), 'index.ts should exist for created skill')

  const indexContent = fs.readFileSync(path.join(managedSkillDir, 'index.ts'), 'utf-8')
  assert(indexContent.includes('Auto-generated ClawMax skill entrypoint'), 'index.ts should be the generated stub')

  fs.rmSync(managedSkillDir, { recursive: true, force: true })
  console.log('  ✓ createCustomSkill writes index.ts stub')
})

// Summary
setTimeout(() => {
  console.log(`\n${YELLOW}=== Test Summary ===${RESET}`)
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`)
  fs.rmSync(testEnv.tempHome, { recursive: true, force: true })

  if (testsFailed > 0) {
    console.log(`${RED}Failed: ${testsFailed}${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed! ✓${RESET}\n`)
    process.exit(0)
  }
}, 100)
