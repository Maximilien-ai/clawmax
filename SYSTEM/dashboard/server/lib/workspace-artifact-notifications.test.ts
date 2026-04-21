import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildWorkspaceArtifactNotification } from './notifications'

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

console.log(`\n${YELLOW}=== Workspace Artifact Notifications Test Suite ===${RESET}\n`)

const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-artifact-notif-'))
process.env.OPENCLAW_WORKSPACE = tempWorkspace
const agentsDir = path.join(tempWorkspace, 'AGENTS')
fs.mkdirSync(agentsDir, { recursive: true })

test('uploaded AGENTS asset dirs do not pretend to be agent actors', () => {
  const assetDir = path.join(agentsDir, 'cw-items')
  fs.mkdirSync(assetDir, { recursive: true })

  const notification = buildWorkspaceArtifactNotification({
    agentId: 'cw-items',
    file: 'image-review-report.md',
    mtime: new Date().toISOString(),
  }, false)

  assert(notification.entityId === undefined, 'Expected no agent entity id for uploaded asset directory')
  assert(notification.entityType === undefined, 'Expected no agent entity type for uploaded asset directory')
  assert(notification.title === 'agents updated cw-items/image-review-report.md', `Unexpected title: ${notification.title}`)
  assert(notification.message === 'Updated agent-created workspace artifact in cw-items: image-review-report.md', `Unexpected message: ${notification.message}`)
  assert(notification.artifactPath === 'AGENTS/cw-items/image-review-report.md', `Unexpected artifact path: ${notification.artifactPath}`)
})

test('managed agent workspace dirs still attribute to the agent', () => {
  const agentDir = path.join(agentsDir, 'image-analyst1')
  fs.mkdirSync(agentDir, { recursive: true })
  fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), '# Identity\n\n- **Name:** image-analyst1\n', 'utf-8')

  const notification = buildWorkspaceArtifactNotification({
    agentId: 'image-analyst1',
    file: 'MEMORY.md',
    mtime: new Date().toISOString(),
  }, true)

  assert(notification.entityId === 'image-analyst1', `Expected managed agent entity id, got ${notification.entityId}`)
  assert(notification.entityType === 'agent', `Expected managed agent entity type, got ${notification.entityType}`)
  assert(notification.title === 'image-analyst1 created MEMORY.md', `Unexpected title: ${notification.title}`)
  assert(notification.message === 'New workspace artifact from image-analyst1: MEMORY.md', `Unexpected message: ${notification.message}`)
})

console.log(`\n${YELLOW}=== Test Summary ===${RESET}`)
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`)
console.log(`${RED}Failed: ${testsFailed}${RESET}`)

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed${RESET}`)
  process.exit(1)
}

console.log(`\n${GREEN}All tests passed! ✓${RESET}`)
