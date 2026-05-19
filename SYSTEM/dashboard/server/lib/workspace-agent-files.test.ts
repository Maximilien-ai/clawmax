/**
 * Workspace agent file seeding test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workspace-agent-files.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { ensureManagedAgentWorkspaceFiles, listAgents, listDocEntries } from './workspace'
import { resetWorkspaceManagerForTests } from './workspace-manager'

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

console.log(`\n${YELLOW}=== Workspace Agent File Seeding Test Suite ===${RESET}\n`)

test('ensureManagedAgentWorkspaceFiles makes plain created agents visible and protected in DocHub', () => {
  const originalWorkspace = process.env.OPENCLAW_WORKSPACE
  const originalHome = process.env.HOME
  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-agent-files-'))
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-agent-home-'))

  try {
    process.env.OPENCLAW_WORKSPACE = tempWorkspace
    process.env.HOME = tempHome
    resetWorkspaceManagerForTests()

    fs.mkdirSync(path.join(tempWorkspace, 'AGENTS'), { recursive: true })
    fs.mkdirSync(path.join(tempHome, '.openclaw', 'agents', 'agent0'), { recursive: true })
    fs.mkdirSync(path.join(tempHome, '.openclaw'), { recursive: true })
    fs.writeFileSync(path.join(tempHome, '.openclaw', 'openclaw.json'), JSON.stringify({
      agents: {
        list: [
          {
            id: 'agent0',
            workspace: path.join(tempWorkspace, 'AGENTS', 'agent0'),
          },
        ],
      },
    }, null, 2), 'utf-8')

    const seeded = ensureManagedAgentWorkspaceFiles({
      agentId: 'agent0',
      model: 'openai/gpt-4o-mini',
      tags: ['assistant'],
      workspacePath: tempWorkspace,
    })

    assert(seeded.created.includes('IDENTITY.md'), 'Expected IDENTITY.md to be created')
    assert(seeded.created.includes('SOUL.md'), 'Expected SOUL.md to be created')
    assert(seeded.created.includes('TOOLS.md'), 'Expected TOOLS.md to be created')

    const agents = listAgents()
    const createdAgent = agents.find((agent) => agent.id === 'agent0')
    assert(!!createdAgent, 'Expected seeded agent to appear in listAgents()')
    assert(createdAgent?.name === 'Agent0', 'Expected seeded agent to get a readable default name')

    const docEntries = listDocEntries()
    const identityEntry = docEntries.find((entry) => entry.path === 'AGENTS/agent0/IDENTITY.md')
    assert(!!identityEntry, 'Expected DocHub to surface the seeded agent identity file')
    assert(identityEntry?.isAgentWorkspace === true, 'Expected seeded agent workspace to be treated as a registered agent workspace')
    assert(identityEntry?.canDelete === false, 'Expected protected agent workspace files to be non-deletable')
  } finally {
    if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = originalWorkspace
    if (typeof originalHome === 'undefined') delete process.env.HOME
    else process.env.HOME = originalHome
    resetWorkspaceManagerForTests()
    fs.rmSync(tempWorkspace, { recursive: true, force: true })
    fs.rmSync(tempHome, { recursive: true, force: true })
  }
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
