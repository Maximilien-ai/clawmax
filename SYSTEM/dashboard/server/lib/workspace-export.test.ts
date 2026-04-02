/**
 * Workspace export test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workspace-export.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildWorkspaceExportManifest, getWorkspaceExportFileName, sanitizeWorkspaceExportName } from './workspace-export'
import { resetWorkspaceManagerForTests } from './workspace-manager'
import { writeWorkspaceIntegrationConfig } from './workspace-integrations'
import { createWorkspaceDashboard } from './workspace-dashboards'

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
    activeWorkspaceId: 'workspace-a',
    workspaces: [{
      id: 'workspace-a',
      name: 'My Workspace',
      path: workspacePath,
      createdAt: '2026-04-02T00:00:00.000Z',
      lastAccessedAt: '2026-04-02T00:00:00.000Z',
      color: '#3B82F6',
      tags: ['test'],
    }],
  }, null, 2))
}

console.log(`\n${YELLOW}=== Workspace Export Test Suite ===${RESET}\n`)

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-export-test-'))
const workspacePath = path.join(tmpHome, 'workspace-a')
fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
writeWorkspaceRegistry(tmpHome, workspacePath)

process.env.HOME = tmpHome
process.env.OPENCLAW_WORKSPACE = workspacePath
resetWorkspaceManagerForTests()

async function run() {
  await test('sanitizeWorkspaceExportName creates stable slugs', () => {
    assert(sanitizeWorkspaceExportName('My Workspace!') === 'my-workspace', 'Expected slugified workspace name')
  })

  await test('buildWorkspaceExportManifest includes dashboards and integrations', async () => {
    writeWorkspaceIntegrationConfig({
      githubDefaultRepo: 'Maximilien-ai/clawmax',
      sensoContextLabel: 'hack',
      opikWorkspace: 'workspace-a',
    })
    createWorkspaceDashboard('workspace-a', { title: 'My Dashboard' })

    const manifest = await buildWorkspaceExportManifest('workspace-a')
    assert(manifest.workspace.id === 'workspace-a', 'Expected workspace id in manifest')
    assert(manifest.integrations.githubDefaultRepo === 'Maximilien-ai/clawmax', 'Expected github repo in manifest')
    assert(manifest.dashboards.count === 1, 'Expected dashboard count in manifest')
    assert(manifest.notes.length > 0, 'Expected notes in manifest')
  })

  await test('getWorkspaceExportFileName uses workspace name slug', () => {
    const fileName = getWorkspaceExportFileName({
      id: 'workspace-a',
      name: 'My Workspace',
      path: workspacePath,
      createdAt: '2026-04-02T00:00:00.000Z',
      lastAccessedAt: '2026-04-02T00:00:00.000Z',
    })
    assert(fileName.startsWith('my-workspace-'), 'Expected slugged filename prefix')
    assert(fileName.endsWith('.zip'), 'Expected zip filename')
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
