/**
 * Workspace upload helpers test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workspace-upload.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { deleteWorkspaceAsset, extractZipBufferToWorkspace, getAgentActivity, resolveWorkspacePath, writeWorkspaceBinaryFile } from './workspace'
import { resetWorkspaceManagerForTests } from './workspace-manager'

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
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

console.log(`\n${YELLOW}=== Workspace Upload Test Suite ===${RESET}\n`)

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-upload-test-'))
const workspacePath = path.join(tmpRoot, 'workspace')
fs.mkdirSync(workspacePath, { recursive: true })

test('resolveWorkspacePath keeps writes inside workspace', () => {
  const safe = resolveWorkspacePath('AGENTS/shared/readme.txt', workspacePath)
  const unsafe = resolveWorkspacePath('../escape.txt', workspacePath)

  assert(safe === path.join(workspacePath, 'AGENTS', 'shared', 'readme.txt'), 'Expected safe path to resolve inside workspace')
  assert(unsafe === null, 'Expected traversal path to be rejected')
})

test('writeWorkspaceBinaryFile writes arbitrary file content inside workspace', () => {
  const ok = writeWorkspaceBinaryFile('AGENTS/shared/example.txt', Buffer.from('hello upload'), workspacePath)
  const saved = path.join(workspacePath, 'AGENTS', 'shared', 'example.txt')

  assert(ok, 'Expected binary write to succeed')
  assert(fs.readFileSync(saved, 'utf-8') === 'hello upload', 'Expected file content to match')
})

test('extractZipBufferToWorkspace expands safe archives into target directory', () => {
  const zipSourceRoot = fs.mkdtempSync(path.join(tmpRoot, 'zip-src-'))
  const docsDir = path.join(zipSourceRoot, 'docs')
  fs.mkdirSync(docsDir, { recursive: true })
  fs.writeFileSync(path.join(docsDir, 'brief.md'), '# Brief\n', 'utf-8')
  fs.writeFileSync(path.join(zipSourceRoot, 'notes.txt'), 'hello', 'utf-8')

  const zipPath = path.join(tmpRoot, 'bundle.zip')
  execFileSync('python3', ['-c', [
    'import pathlib, sys, zipfile',
    'src = pathlib.Path(sys.argv[1])',
    'zip_path = pathlib.Path(sys.argv[2])',
    'with zipfile.ZipFile(zip_path, "w") as zf:',
    '    for item in src.rglob("*"):',
    '        if item.is_file():',
    '            zf.write(item, item.relative_to(src))',
  ].join('\n'), zipSourceRoot, zipPath])

  const result = extractZipBufferToWorkspace('AGENTS/shared/imports', fs.readFileSync(zipPath), workspacePath)

  assert(result.ok, `Expected zip extraction to succeed: ${result.error}`)
  assert(
    fs.existsSync(path.join(workspacePath, 'AGENTS', 'shared', 'imports', 'docs', 'brief.md')),
    'Expected markdown file to be extracted'
  )
  assert(
    fs.existsSync(path.join(workspacePath, 'AGENTS', 'shared', 'imports', 'notes.txt')),
    'Expected text file to be extracted'
  )
})

test('extractZipBufferToWorkspace rejects archives that would overwrite existing paths', () => {
  const zipSourceRoot = fs.mkdtempSync(path.join(tmpRoot, 'zip-conflict-src-'))
  fs.writeFileSync(path.join(zipSourceRoot, 'agent-notes.md'), '# Notes\n', 'utf-8')

  const zipPath = path.join(tmpRoot, 'conflict-bundle.zip')
  execFileSync('python3', ['-c', [
    'import pathlib, sys, zipfile',
    'src = pathlib.Path(sys.argv[1])',
    'zip_path = pathlib.Path(sys.argv[2])',
    'with zipfile.ZipFile(zip_path, "w") as zf:',
    '    for item in src.rglob("*"):',
    '        if item.is_file():',
    '            zf.write(item, item.relative_to(src))',
  ].join('\n'), zipSourceRoot, zipPath])

  const existingPath = path.join(workspacePath, 'AGENTS', 'shared', 'imports-conflict', 'agent-notes.md')
  fs.mkdirSync(path.dirname(existingPath), { recursive: true })
  fs.writeFileSync(existingPath, 'preexisting', 'utf-8')

  const result = extractZipBufferToWorkspace('AGENTS/shared/imports-conflict', fs.readFileSync(zipPath), workspacePath)

  assert(!result.ok, 'Expected conflicting extraction to fail')
  assert(/overwrite existing paths/i.test(result.error || ''), 'Expected overwrite conflict error')
  assert(fs.readFileSync(existingPath, 'utf-8') === 'preexisting', 'Expected existing file to remain unchanged')
})

test('deleteWorkspaceAsset removes invalid auto-registered agent-like directories and stale runtime state', () => {
  const previousHome = process.env.HOME || ''
  process.env.HOME = tmpRoot

  const invalidDir = path.join(workspacePath, 'AGENTS', 'cw-items')
  fs.mkdirSync(invalidDir, { recursive: true })
  fs.writeFileSync(path.join(invalidDir, 'IDENTITY.md'), '# IDENTITY.md\n\n- **Name:**\n', 'utf-8')
  fs.writeFileSync(path.join(invalidDir, 'grading.txt'), 'score', 'utf-8')

  const openclawDir = path.join(tmpRoot, '.openclaw')
  fs.mkdirSync(path.join(openclawDir, 'agents', 'cw-items', 'agent'), { recursive: true })
  fs.writeFileSync(path.join(openclawDir, 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        {
          id: 'cw-items',
          workspace: invalidDir,
          agentDir: path.join(openclawDir, 'agents', 'cw-items', 'agent'),
        },
      ],
    },
  }, null, 2), 'utf-8')

  const result = deleteWorkspaceAsset('AGENTS/cw-items', workspacePath)

  assert(result.ok, `Expected delete to succeed: ${result.error}`)
  assert(!fs.existsSync(invalidDir), 'Expected invalid uploaded directory to be deleted')
  const config = JSON.parse(fs.readFileSync(path.join(openclawDir, 'openclaw.json'), 'utf-8'))
  assert((config.agents?.list || []).length === 0, 'Expected stale openclaw registration to be removed')
  assert(!fs.existsSync(path.join(openclawDir, 'agents', 'cw-items')), 'Expected stale runtime state to be removed')

  process.env.HOME = previousHome
})

test('getAgentActivity prefers the active workspace live record when agent ids collide', () => {
  const previousHome = process.env.HOME || ''
  const previousWorkspace = process.env.OPENCLAW_WORKSPACE || ''
  process.env.HOME = tmpRoot

  const defaultWorkspace = path.join(tmpRoot, '.openclaw', 'workspace')
  const activeWorkspace = path.join(tmpRoot, '.openclaw', 'workspaces', 'activity-test')
  const defaultAgentDir = path.join(defaultWorkspace, 'AGENTS', 'people-researcher')
  const activeAgentDir = path.join(activeWorkspace, 'AGENTS', 'people-researcher')
  fs.mkdirSync(defaultAgentDir, { recursive: true })
  fs.mkdirSync(activeAgentDir, { recursive: true })
  fs.mkdirSync(path.join(activeWorkspace, 'SYSTEM'), { recursive: true })
  fs.writeFileSync(path.join(tmpRoot, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'activity-test',
    workspaces: [
      { id: 'default', name: 'Default', path: defaultWorkspace, createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
      { id: 'activity-test', name: 'Activity Test', path: activeWorkspace, createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
    ],
  }, null, 2), 'utf-8')
  fs.writeFileSync(path.join(tmpRoot, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'people-researcher', workspace: defaultAgentDir, agentDir: path.join(tmpRoot, '.openclaw', 'agents', 'people-researcher', 'agent'), model: 'openai/gpt-3.5-turbo' },
        { id: 'people-researcher', workspace: activeAgentDir, agentDir: path.join(tmpRoot, '.openclaw', 'agents', 'people-researcher', 'agent'), model: 'openai/gpt-5' },
      ],
    },
  }, null, 2), 'utf-8')
  process.env.OPENCLAW_WORKSPACE = activeWorkspace
  resetWorkspaceManagerForTests()

  const activity = getAgentActivity(activeAgentDir, 'people-researcher')
  assert(activity.liveConfig?.model === 'openai/gpt-5', 'Expected active workspace model to win over stale duplicate record')

  process.env.HOME = previousHome
  process.env.OPENCLAW_WORKSPACE = previousWorkspace
  resetWorkspaceManagerForTests()
})

test('getAgentActivity falls back to preferred workspace model instead of unknown', () => {
  const previousHome = process.env.HOME || ''
  const previousWorkspace = process.env.OPENCLAW_WORKSPACE || ''
  process.env.HOME = tmpRoot

  const activeWorkspace = path.join(tmpRoot, '.openclaw', 'workspaces', 'activity-fallback-test')
  const activeAgentDir = path.join(activeWorkspace, 'AGENTS', 'people-researcher')
  fs.mkdirSync(activeAgentDir, { recursive: true })
  fs.mkdirSync(path.join(activeWorkspace, 'SYSTEM'), { recursive: true })
  fs.writeFileSync(path.join(activeWorkspace, 'SYSTEM', 'integrations.json'), JSON.stringify({
    preferredModel: 'openai/gpt-5',
  }, null, 2), 'utf-8')
  fs.writeFileSync(path.join(tmpRoot, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'activity-fallback-test',
    workspaces: [
      { id: 'default', name: 'Default', path: path.join(tmpRoot, '.openclaw', 'workspace'), createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
      { id: 'activity-fallback-test', name: 'Activity Fallback Test', path: activeWorkspace, createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString() },
    ],
  }, null, 2), 'utf-8')
  fs.writeFileSync(path.join(tmpRoot, '.openclaw', 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'people-researcher', workspace: activeAgentDir, agentDir: path.join(tmpRoot, '.openclaw', 'agents', 'people-researcher', 'agent') },
      ],
    },
  }, null, 2), 'utf-8')
  process.env.OPENCLAW_WORKSPACE = activeWorkspace
  resetWorkspaceManagerForTests()

  const activity = getAgentActivity(activeAgentDir, 'people-researcher')
  assert(activity.liveConfig?.model === 'openai/gpt-5', 'Expected preferred workspace model to replace unknown fallback')

  process.env.HOME = previousHome
  process.env.OPENCLAW_WORKSPACE = previousWorkspace
  resetWorkspaceManagerForTests()
})

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
