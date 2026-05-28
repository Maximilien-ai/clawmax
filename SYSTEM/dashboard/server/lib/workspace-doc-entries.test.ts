/**
 * Workspace DocHub entry filtering test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workspace-doc-entries.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { listDocEntries } from './workspace'

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

console.log(`\n${YELLOW}=== Workspace Doc Entries Test Suite ===${RESET}\n`)

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-doc-entries-'))
const workspacePath = path.join(tmpRoot, 'workspace')
fs.mkdirSync(path.join(workspacePath, 'AGENTS', 'cw-items', 'item1'), { recursive: true })
fs.mkdirSync(path.join(workspacePath, 'AGENTS', 'cw-items', '.git'), { recursive: true })
fs.mkdirSync(path.join(workspacePath, 'AGENTS', 'cw-items', '.openclaw'), { recursive: true })
fs.mkdirSync(path.join(workspacePath, 'WORKFLOWS', 'outputs', 'demo-workflow', 'nested'), { recursive: true })
fs.mkdirSync(path.join(workspacePath, 'WORKFLOWS', 'outputs', 'demo-workflow', '.git'), { recursive: true })
fs.writeFileSync(path.join(workspacePath, 'AGENTS', 'cw-items', 'item1', 'post.md'), '# post', 'utf-8')
fs.writeFileSync(path.join(workspacePath, 'AGENTS', 'cw-items', '.git', 'config'), '[core]\n', 'utf-8')
fs.writeFileSync(path.join(workspacePath, 'AGENTS', 'cw-items', '.openclaw', 'state.json'), '{}', 'utf-8')
fs.writeFileSync(path.join(workspacePath, 'WORKFLOWS', 'outputs', 'demo-workflow', 'brief.txt'), 'brief', 'utf-8')
fs.writeFileSync(path.join(workspacePath, 'WORKFLOWS', 'outputs', 'demo-workflow', 'nested', 'chart.png'), 'png', 'utf-8')
fs.writeFileSync(path.join(workspacePath, 'WORKFLOWS', 'outputs', 'demo-workflow', '.git', 'config'), '[core]\n', 'utf-8')

const previousWorkspace = process.env.OPENCLAW_WORKSPACE
const previousHome = process.env.HOME
process.env.HOME = tmpRoot
process.env.OPENCLAW_WORKSPACE = workspacePath

test('listDocEntries hides hidden helper dirs inside AGENTS asset trees', () => {
  const entries = listDocEntries().map((entry) => entry.path)
  assert(entries.includes('AGENTS/cw-items/item1/post.md'), 'Expected normal visible asset markdown to remain')
  assert(!entries.some((entry) => entry.includes('/.git/') || entry.endsWith('/.git')), 'Expected .git entries to be hidden')
  assert(!entries.some((entry) => entry.includes('/.openclaw/') || entry.endsWith('/.openclaw')), 'Expected .openclaw entries to be hidden')
})

test('listDocEntries surfaces workflow output assets and nested files', () => {
  const entries = listDocEntries()
  const paths = entries.map((entry) => entry.path)
  const brief = entries.find((entry) => entry.path === 'WORKFLOWS/outputs/demo-workflow/brief.txt')
  const chart = entries.find((entry) => entry.path === 'WORKFLOWS/outputs/demo-workflow/nested/chart.png')

  assert(!!brief, 'Expected workflow output text artifact to be listed')
  assert(!!chart, 'Expected nested workflow output asset to be listed')
  assert(brief?.section === 'WORKFLOWS', `Expected workflow output section, got ${brief?.section}`)
  assert(brief?.kind === 'asset', `Expected workflow output kind=asset, got ${brief?.kind}`)
  assert(brief?.assetSource === 'generated', `Expected workflow output assetSource=generated, got ${brief?.assetSource}`)
  assert(!paths.some((entry) => entry.includes('WORKFLOWS/outputs/demo-workflow/.git/')), 'Expected hidden workflow output helper dirs to remain hidden')
})

if (previousWorkspace === undefined) {
  delete process.env.OPENCLAW_WORKSPACE
} else {
  process.env.OPENCLAW_WORKSPACE = previousWorkspace
}

if (previousHome === undefined) {
  delete process.env.HOME
} else {
  process.env.HOME = previousHome
}

console.log('\n========================================')
console.log(`Passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)
console.log('========================================\n')

if (testsFailed > 0) {
  console.log(`${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`${GREEN}All tests passed${RESET}`)
}
