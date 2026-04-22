import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildWorkspaceArtifactNotification, createWriterAttributedArtifactNotification, extractWorkspaceArtifactMentions, loadNotifications, shouldSuppressArtifactNotification } from './notifications'

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
process.env.HOME = tempWorkspace
process.env.OPENCLAW_WORKSPACE = tempWorkspace
const agentsDir = path.join(tempWorkspace, 'AGENTS')
fs.mkdirSync(agentsDir, { recursive: true })
fs.mkdirSync(path.join(tempWorkspace, 'SYSTEM'), { recursive: true })
fs.writeFileSync(path.join(tempWorkspace, 'SYSTEM', 'notifications.json'), '[]', 'utf-8')

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

test('extractWorkspaceArtifactMentions resolves AGENTS asset paths from agent output', () => {
  const itemDir = path.join(agentsDir, 'cw-items', 'item1')
  fs.mkdirSync(itemDir, { recursive: true })
  fs.writeFileSync(path.join(itemDir, 'post.md'), '# Post\n', 'utf-8')

  const mentions = extractWorkspaceArtifactMentions(
    'Finalized paths\ncw-items/item1/post.md\nFiles:\npost.md',
    tempWorkspace
  )

  assert(mentions.length === 1, `Expected one resolved mention, got ${mentions.length}`)
  assert(mentions[0] === 'AGENTS/cw-items/item1/post.md', `Unexpected mention: ${mentions[0]}`)
})

test('extractWorkspaceArtifactMentions resolves bare filenames to a unique recent workspace artifact', () => {
  const reportPath = path.join(agentsDir, 'cw-items', 'kickoff-plan.md')
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, '# Kickoff\n', 'utf-8')

  const mentions = extractWorkspaceArtifactMentions(
    'Files:\nkickoff-plan.md',
    tempWorkspace
  )

  assert(mentions.length === 1, `Expected one resolved bare filename mention, got ${mentions.length}`)
  assert(mentions[0] === 'AGENTS/cw-items/kickoff-plan.md', `Unexpected mention: ${mentions[0]}`)
})

test('createWriterAttributedArtifactNotification attributes uploaded asset writes to the real agent', () => {
  const reportPath = path.join(agentsDir, 'cw-items', 'image-review-report.md')
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, '# Report\n', 'utf-8')

  const notification = createWriterAttributedArtifactNotification({
    agentId: 'image-analyst1',
    artifactPath: 'AGENTS/cw-items/image-review-report.md',
    workflowId: 'cw-image-analysis',
  })

  assert(notification !== null, 'Expected writer-attributed notification')
  assert(notification!.entityId === 'image-analyst1', `Expected real agent id, got ${notification!.entityId}`)
  assert(notification!.entityType === 'agent', `Expected agent entity type, got ${notification!.entityType}`)
  assert(notification!.artifactPath === 'AGENTS/cw-items/image-review-report.md', `Unexpected artifact path: ${notification!.artifactPath}`)
  assert(notification!.title.includes('image-analyst1'), `Expected title to include real agent id, got ${notification!.title}`)

  const active = loadNotifications()
  const saved = active.find((entry) => entry.id === notification!.id)
  assert(!!saved, 'Expected notification persisted to notifications store')
})

test('writer-attributed artifacts suppress the later generic scan notification for the same file', () => {
  const artifactPath = 'AGENTS/cw-items/item1/post.md'
  const fullPath = path.join(tempWorkspace, artifactPath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, '# Post\n', 'utf-8')

  createWriterAttributedArtifactNotification({
    agentId: 'content-writer1',
    artifactPath,
    workflowId: 'cw-content-drafting',
  })

  assert(shouldSuppressArtifactNotification(artifactPath) === true, 'Expected generic scan suppression after writer-attributed notification')
})

console.log(`\n${YELLOW}=== Test Summary ===${RESET}`)
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`)
console.log(`${RED}Failed: ${testsFailed}${RESET}`)

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed${RESET}`)
  process.exit(1)
}

console.log(`\n${GREEN}All tests passed! ✓${RESET}`)
