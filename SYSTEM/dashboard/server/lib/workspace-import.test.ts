/**
 * Workspace import test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workspace-import.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { importWorkspaceFromZipArchive } from './workspace-import'
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

function writeWorkspaceRegistry(tmpHome: string, activeWorkspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'default',
    workspaces: [{
      id: 'default',
      name: 'Personal',
      path: activeWorkspacePath,
      createdAt: '2026-04-02T00:00:00.000Z',
      lastAccessedAt: '2026-04-02T00:00:00.000Z',
      color: '#3B82F6',
      tags: ['personal'],
    }],
  }, null, 2))
}

console.log(`\n${YELLOW}=== Workspace Import Test Suite ===${RESET}\n`)

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-import-test-'))
const defaultWorkspacePath = path.join(tmpHome, 'workspace-default')
fs.mkdirSync(path.join(defaultWorkspacePath, 'SYSTEM'), { recursive: true })
writeWorkspaceRegistry(tmpHome, defaultWorkspacePath)

process.env.HOME = tmpHome
process.env.OPENCLAW_WORKSPACE = defaultWorkspacePath
resetWorkspaceManagerForTests()

async function run() {
  await test('importWorkspaceFromZipArchive restores workspace and activates it', () => {
    const exportRoot = path.join(tmpHome, 'export-root')
    const archiveWorkspace = path.join(exportRoot, 'my-imported-workspace')
    fs.mkdirSync(path.join(archiveWorkspace, 'AGENTS', 'demo-agent'), { recursive: true })
    fs.mkdirSync(path.join(archiveWorkspace, 'ORG'), { recursive: true })
    fs.mkdirSync(path.join(archiveWorkspace, 'SYSTEM'), { recursive: true })
    fs.writeFileSync(path.join(archiveWorkspace, 'AGENTS', 'demo-agent', 'IDENTITY.md'), '# Agent\n', 'utf-8')
    fs.writeFileSync(path.join(archiveWorkspace, 'ORG', 'GROUPS.md'), '# Groups\n', 'utf-8')
    fs.writeFileSync(path.join(archiveWorkspace, 'SYSTEM', 'export-manifest.json'), JSON.stringify({
      version: '1.0.0',
      exportedAt: '2026-04-05T00:00:00.000Z',
      workspace: {
        id: 'workspace-a',
        name: 'Imported Workspace',
        path: '/tmp/old-workspace',
        createdAt: '2026-04-02T00:00:00.000Z',
        lastAccessedAt: '2026-04-02T00:00:00.000Z',
        color: '#10B981',
        tags: ['imported', 'demo'],
      },
      includes: ['workspace directory contents'],
      dashboards: { count: 0 },
      integrations: {},
      notes: [],
    }, null, 2), 'utf-8')

    const zipPath = path.join(tmpHome, 'workspace-export.zip')
    execFileSync('zip', ['-qr', zipPath, 'my-imported-workspace'], { cwd: exportRoot })

    const result = importWorkspaceFromZipArchive(zipPath)
    assert(result.workspace.name === 'Imported Workspace', 'Expected imported workspace name')
    assert(result.workspace.color === '#10B981', 'Expected imported workspace color')
    assert(result.workspace.tags?.includes('imported') === true, 'Expected imported workspace tags')
    assert(fs.existsSync(path.join(result.importedPath, 'AGENTS', 'demo-agent', 'IDENTITY.md')), 'Expected agent file restored')

    const registry = JSON.parse(fs.readFileSync(path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json'), 'utf-8'))
    assert(registry.activeWorkspaceId === result.workspace.id, 'Expected imported workspace to become active')
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
