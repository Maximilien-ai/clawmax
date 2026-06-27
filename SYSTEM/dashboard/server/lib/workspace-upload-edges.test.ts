import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import {
  deleteWorkspaceAsset,
  extractZipBufferToWorkspace,
  readWorkspaceBinaryFile,
  resolveWorkspacePath,
  writeWorkspaceBinaryFile,
} from './workspace'
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

console.log(`\n${YELLOW}=== Workspace Upload Edge Test Suite ===${RESET}\n`)

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-upload-edges-'))
const workspacePath = path.join(tmpRoot, 'workspace')
fs.mkdirSync(workspacePath, { recursive: true })

const previousWorkspace = process.env.OPENCLAW_WORKSPACE
const previousHome = process.env.HOME
process.env.HOME = tmpRoot
process.env.OPENCLAW_WORKSPACE = workspacePath
resetWorkspaceManagerForTests()

test('resolveWorkspacePath rejects blank and traversal paths', () => {
  assert(resolveWorkspacePath('   ', workspacePath) === null, 'Expected blank path rejection')
  assert(resolveWorkspacePath('../../escape.txt', workspacePath) === null, 'Expected traversal path rejection')
})

test('readWorkspaceBinaryFile returns null for unsafe paths and missing files', () => {
  assert(readWorkspaceBinaryFile('../escape.txt', workspacePath) === null, 'Expected unsafe binary read rejection')
  assert(readWorkspaceBinaryFile('AGENTS/missing/file.bin', workspacePath) === null, 'Expected missing binary read to return null')
})

test('extractZipBufferToWorkspace rejects archives with unsafe entry paths', () => {
  const zipPath = path.join(tmpRoot, 'unsafe-bundle.zip')
  execFileSync('python3', ['-c', [
    'import sys, zipfile',
    'zip_path = sys.argv[1]',
    'with zipfile.ZipFile(zip_path, "w") as zf:',
    '    zf.writestr("../escape.txt", "bad")',
  ].join('\n'), zipPath])

  const result = extractZipBufferToWorkspace('AGENTS/shared/unsafe', fs.readFileSync(zipPath), workspacePath)
  assert(!result.ok, 'Expected unsafe ZIP extraction to fail')
  assert(/unsafe path/i.test(result.error || ''), 'Expected unsafe path error')
})

test('deleteWorkspaceAsset refuses non-agent paths and protected managed agent files', () => {
  const protectedAgentDir = path.join(workspacePath, 'AGENTS', 'managed-agent')
  fs.mkdirSync(protectedAgentDir, { recursive: true })
  fs.writeFileSync(path.join(protectedAgentDir, 'IDENTITY.md'), '# IDENTITY.md\n\n- **Name:** Managed Agent\n', 'utf-8')
  fs.mkdirSync(path.join(tmpRoot, '.openclaw', 'agents', 'managed-agent'), { recursive: true })

  let result = deleteWorkspaceAsset('WORKFLOWS/outputs/report.txt', workspacePath)
  assert(!result.ok, 'Expected non-agent asset delete rejection')
  assert(/Only AGENTS assets/i.test(result.error || ''), 'Expected AGENTS-only delete guidance')

  result = deleteWorkspaceAsset('AGENTS/managed-agent/IDENTITY.md', workspacePath)
  assert(!result.ok, 'Expected protected managed file delete rejection')
  assert(/protected agent workspace files/i.test(result.error || ''), 'Expected protected file guidance')
})

test('writeWorkspaceBinaryFile can create nested files that readWorkspaceBinaryFile returns', () => {
  const relPath = 'AGENTS/shared/nested/data.bin'
  const payload = Buffer.from('edge-binary')
  assert(writeWorkspaceBinaryFile(relPath, payload, workspacePath), 'Expected nested binary write success')
  const loaded = readWorkspaceBinaryFile(relPath, workspacePath)
  assert(!!loaded, 'Expected binary content to be readable')
  assert(loaded?.toString('utf-8') === 'edge-binary', 'Expected binary payload round-trip')
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
