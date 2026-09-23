/**
 * Workspace deleteAgent test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workspace-delete-agent.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { deleteAgent, parseGroups, parseGroupsWithMembers, parseIdentity, parseTags } from './workspace'
import { resetWorkspaceManagerForTests } from './workspace-manager'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function writeWorkspaceRegistry(tmpHome: string, workspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'workspace-under-test',
    workspaces: [{
      id: 'workspace-under-test',
      name: 'Workspace Under Test',
      path: workspacePath,
      createdAt: '2026-04-02T00:00:00.000Z',
      lastAccessedAt: '2026-04-02T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

console.log(`\n${YELLOW}=== Workspace Delete Agent Test Suite ===${RESET}\n`)

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-delete-agent-test-'))
const workspacePath = path.join(tmpHome, 'workspace-under-test')
const agentId = 'test-agent1'
const workspaceAgentDir = path.join(workspacePath, 'AGENTS', agentId)
const sharedAgentDir = path.join(tmpHome, '.openclaw', 'agents', agentId, 'agent')
const openclawConfigPath = path.join(tmpHome, '.openclaw', 'openclaw.json')

fs.mkdirSync(workspaceAgentDir, { recursive: true })
fs.writeFileSync(path.join(workspaceAgentDir, 'IDENTITY.md'), '# Test Agent\n', 'utf-8')
fs.mkdirSync(sharedAgentDir, { recursive: true })
fs.writeFileSync(path.join(sharedAgentDir, 'session.json'), '{}', 'utf-8')
fs.mkdirSync(path.dirname(openclawConfigPath), { recursive: true })
fs.writeFileSync(openclawConfigPath, JSON.stringify({
  gateway: { port: 18889, auth: { token: 'test-token' } },
  agents: {
    list: [{
      id: agentId,
      name: agentId,
      workspace: workspaceAgentDir,
      agentDir: sharedAgentDir,
    }],
  },
}, null, 2))

writeWorkspaceRegistry(tmpHome, workspacePath)
process.env.HOME = tmpHome
process.env.OPENCLAW_WORKSPACE = workspacePath
resetWorkspaceManagerForTests()

async function run() {
  await test('deleteAgent removes workspace dir, shared home dir, and config entry', () => {
    const result = deleteAgent(agentId, false)
    assert(result.errors.length === 0, `Expected no errors, got: ${result.errors.join('; ')}`)
    assert(!fs.existsSync(workspaceAgentDir), 'Expected workspace agent dir to be removed')
    assert(!fs.existsSync(path.join(tmpHome, '.openclaw', 'agents', agentId)), 'Expected shared ~/.openclaw agent dir to be removed')

    const config = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf-8'))
    const stillPresent = Boolean(config.agents?.entries?.[agentId])
    assert(!stillPresent, 'Expected agent entry to be removed from openclaw.json')
  })

  await test('deleteAgent preserves shared state when another workspace still references the same agent id', () => {
    const multiHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-delete-agent-multi-'))
    const activeWorkspace = path.join(multiHome, 'workspace-a')
    const otherWorkspace = path.join(multiHome, 'workspace-b')
    const duplicateId = 'shared-agent'
    const activeAgentDir = path.join(activeWorkspace, 'AGENTS', duplicateId)
    const otherAgentDir = path.join(otherWorkspace, 'AGENTS', duplicateId)
    const sharedRootDir = path.join(multiHome, '.openclaw', 'agents', duplicateId)
    const sharedAgentRuntimeDir = path.join(sharedRootDir, 'agent')
    const multiConfigPath = path.join(multiHome, '.openclaw', 'openclaw.json')

    fs.mkdirSync(activeAgentDir, { recursive: true })
    fs.mkdirSync(otherAgentDir, { recursive: true })
    fs.writeFileSync(path.join(activeAgentDir, 'IDENTITY.md'), '# Active Copy\n', 'utf-8')
    fs.writeFileSync(path.join(otherAgentDir, 'IDENTITY.md'), '# Other Copy\n', 'utf-8')
    fs.mkdirSync(sharedAgentRuntimeDir, { recursive: true })
    fs.writeFileSync(path.join(sharedAgentRuntimeDir, 'session.json'), '{}', 'utf-8')
    fs.mkdirSync(path.dirname(multiConfigPath), { recursive: true })
    fs.writeFileSync(multiConfigPath, JSON.stringify({
      agents: {
        list: [
          { id: duplicateId, workspace: activeAgentDir, agentDir: sharedAgentRuntimeDir },
          { id: duplicateId, workspace: otherAgentDir, agentDir: sharedAgentRuntimeDir },
        ],
      },
    }, null, 2))

    writeWorkspaceRegistry(multiHome, activeWorkspace)
    process.env.HOME = multiHome
    process.env.OPENCLAW_WORKSPACE = activeWorkspace
    resetWorkspaceManagerForTests()

    const result = deleteAgent(duplicateId, true)
    assert(result.errors.length === 0, `Expected no errors, got: ${result.errors.join('; ')}`)
    assert(!fs.existsSync(activeAgentDir), 'Expected active workspace copy removed')
    assert(fs.existsSync(otherAgentDir), 'Expected other workspace copy preserved')
    assert(fs.existsSync(sharedRootDir), 'Expected shared runtime preserved for remaining workspace copy')

    const config = JSON.parse(fs.readFileSync(multiConfigPath, 'utf-8'))
    const remaining = config.agents?.entries?.[duplicateId]
    assert(remaining, 'Expected one keyed agent entry to remain')
    assert(remaining.workspace === otherAgentDir, 'Expected other workspace entry to remain registered')
  })

  await test('parseGroups supports agent membership files that use ## entry headings', () => {
    const communitiesMd = `# Communities

## CW Team

Community overseeing the creation of posts.

**Tags:** camera, sales
`
    const groupsMd = `# Groups

## Content Creation

Group focused on writing and editing posts.

**Community:** CW Team

**Tags:** writing, editing
`

    const parsedCommunities = parseGroups(communitiesMd)
    const parsedGroups = parseGroups(groupsMd)

    assert(parsedCommunities.communities.length === 1, `Expected 1 community, got ${parsedCommunities.communities.length}`)
    assert(parsedCommunities.communities[0].name === 'CW Team', 'Expected CW Team community to parse')
    assert(parsedGroups.groups.length === 1, `Expected 1 group, got ${parsedGroups.groups.length}`)
    assert(parsedGroups.groups[0].name === 'Content Creation', 'Expected Content Creation group to parse')
    assert(parsedGroups.groups[0].community === 'CW Team', 'Expected group community link to parse')
  })

  await test('verbose group parsers retain metadata and do not cross section boundaries', () => {
    const content = [
      '# Communities',
      '### Research',
      '- **Description:** Shared research',
      '- **Tags:** science, , analysis',
      '- **Channels:** slack, , email',
      '- **Members:** analyst, , editor',
      '# Groups',
      '### Writers',
      '- **Description:** Daily output',
      '- **Community:** Research',
      '- **Tags:** writing, editing',
      '- **Channels:** whatsapp',
      '- **Members:** editor, analyst',
      '## Unrelated',
      '### Ignored',
      '- **Members:** outsider',
    ].join('\n')
    const withMembers = parseGroupsWithMembers(content)
    assert(withMembers.communities.length === 1 && withMembers.groups.length === 1, 'Expected entries only in recognized sections')
    assert(withMembers.communities[0].description === 'Shared research', 'Expected community description')
    assert(withMembers.communities[0].tags.join(',') === 'science,analysis', 'Expected empty tags removed')
    assert(withMembers.communities[0].channels.join(',') === 'slack,email', 'Expected empty channels removed')
    assert(withMembers.communities[0].members.join(',') === 'analyst,editor', 'Expected members parsed')
    assert(withMembers.groups[0].community === 'Research', 'Expected group community retained')
    assert(withMembers.groups[0].members.join(',') === 'editor,analyst', 'Expected group members parsed')
    const simple = parseGroups(content)
    assert(simple.communities.length === 1 && simple.groups.some(group => group.name === 'Writers'), 'Simple parser should retain recognized entries')
    assert(simple.groups.find(group => group.name === 'Writers')?.channels.join(',') === 'whatsapp', 'Simple parser should retain channel metadata')
  })

  await test('compact group parser separates descriptions, tags, community links, and channels', () => {
    const parsed = parseGroups([
      '# Communities',
      '- Research: Findings [science, analysis] 📧',
      '- General',
      '# Groups',
      '- Writers: Daily output [writing, editing] @Research 📱 💬',
      '- Assistants: No channel @Research',
      '- Standalone',
    ].join('\n'))
    assert(parsed.communities.length === 2 && parsed.groups.length === 3, 'Expected both compact sections')
    assert(parsed.communities[0].name === 'Research' && parsed.communities[0].description === 'Findings', 'Expected compact description')
    assert(parsed.communities[0].tags.join(',') === 'science,analysis', 'Expected compact tags')
    assert(parsed.communities[0].channels.join(',') === 'email', 'Expected email channel')
    assert(parsed.communities[1].description === null, 'Expected absent description to stay null')
    assert(parsed.groups[0].community === 'Research', 'Expected group community link')
    assert(parsed.groups[0].channels.join(',') === 'whatsapp,slack', 'Expected multiple channels')
    assert(parsed.groups[1].community === 'Research', 'Expected community without tags')
    assert(parsed.groups[2].community === null, 'Expected absent community to stay null')
  })

  await test('identity parser excludes creation metadata and normalizes optional runtime fields', () => {
    const parsed = parseIdentity([
      '# Identity',
      '- **Name:** Analyst',
      '- **Creature:** Assistant',
      '- **Vibe:** Careful',
      '- **Emoji:** 🔎',
      '- **Model:** openai/gpt-5.4-mini',
      '- **Backup Model:** openai/gpt-4o-mini',
      '- **Model Selection:** AUTO',
      '- **Model Priority:** COST',
      '- **Runtime:** default',
      '- **WhatsApp:** +15551234567',
      '- **Tags:** analyst, investigator',
      '## Creation Metadata',
      '- **Model:** stale/local-model',
      '- **Tags:** leaked',
    ].join('\n'))
    assert(parsed.name === 'Analyst' && parsed.creature === 'Assistant' && parsed.vibe === 'Careful', 'Expected identity fields')
    assert(parsed.emoji === '🔎' && parsed.runtime === 'default', 'Expected display and runtime fields')
    assert(parsed.model === 'openai/gpt-5.4-mini' && parsed.backupModel === 'openai/gpt-4o-mini', 'Expected live models only')
    assert(parsed.modelSelection === 'auto' && parsed.modelPreference === 'cost', 'Expected normalized model preferences')
    assert(parsed.whatsapp === '+15551234567', 'Expected WhatsApp number')
    assert(parsed.tags.join(',') === 'analyst,investigator', 'Expected creation tags excluded')
    assert(parseTags('**Tags:**\n**Model:** openai/test').length === 0, 'Empty tags must not consume the next line')
    const invalid = parseIdentity('**Model Selection:** unknown\n**Model Priority:** fast\n**WhatsApp:**\n')
    assert(invalid.modelSelection === undefined && invalid.modelPreference === undefined, 'Unknown model preferences must be ignored')
    assert(invalid.whatsapp === null, 'Empty WhatsApp value must stay null')
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome

  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace

  resetWorkspaceManagerForTests()

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
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
