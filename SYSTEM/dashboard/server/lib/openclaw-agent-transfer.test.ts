/**
 * OpenClaw agent transfer test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/openclaw-agent-transfer.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { resetWorkspaceManagerForTests } from './workspace-manager'
import { execFileSync } from 'child_process'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function createZipArchive(zipPath: string, folderName: string, cwd: string) {
  try {
    execFileSync('zip', ['-qr', zipPath, folderName], { cwd, stdio: 'ignore' })
    return
  } catch {}

  execFileSync('python3', ['-m', 'zipfile', '-c', zipPath, folderName], { cwd, stdio: 'ignore' })
}

console.log(`\n${YELLOW}=== OpenClaw Agent Transfer Test Suite ===${RESET}\n`)

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-transfer-test-'))
const workspace = path.join(tmpHome, 'workspace')
const agentDir = path.join(workspace, 'AGENTS', 'alpha')
fs.mkdirSync(path.join(workspace, 'ORG'), { recursive: true })
fs.mkdirSync(agentDir, { recursive: true })

fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), '# Identity\n\n**Name:** Alpha\n', 'utf-8')
fs.writeFileSync(path.join(agentDir, 'SOUL.md'), '# Soul\n\nHelpful.\n', 'utf-8')
fs.writeFileSync(path.join(agentDir, 'TOOLS.md'), '# Tools\n\n- gh\n', 'utf-8')

fs.writeFileSync(path.join(workspace, 'ORG', 'COMMUNITIES.md'), `# Communities

## Communities

### Core
- **Description:** Core team
- **Members:** alpha
`, 'utf-8')

fs.writeFileSync(path.join(workspace, 'ORG', 'GROUPS.md'), `# Groups

## Groups

### Builders
- **Description:** Builders group
- **Community:** Core
- **Members:** alpha
`, 'utf-8')

fs.mkdirSync(path.join(tmpHome, '.openclaw'), { recursive: true })
fs.writeFileSync(path.join(tmpHome, '.openclaw', 'openclaw.json'), JSON.stringify({
  agents: {
    list: [
      {
        id: 'alpha',
        name: 'alpha',
        workspace: agentDir,
        agentDir: path.join(tmpHome, '.openclaw', 'agents', 'alpha', 'agent'),
        skills: ['github', 'workspace-ls'],
      }
    ]
  }
}, null, 2), 'utf-8')

process.env.HOME = tmpHome
process.env.OPENCLAW_WORKSPACE = workspace
resetWorkspaceManagerForTests()

async function run() {
  const {
    exportAgentToOpenClaw,
    getAgentTransferMetadata,
    importAgentFromBundleDirectory,
    importAgentFromOpenClaw,
    importAgentFromZipArchive,
    listImportableOpenClawAgents,
  } = await import('./openclaw-agent-transfer')

  await test('exportAgentToOpenClaw writes markdown files, config, and metadata', () => {
    const result = exportAgentToOpenClaw('alpha')
    assert(result.exportedId === 'alpha', 'Expected exported ID to match source')
    assert(result.files.includes('IDENTITY.md'), 'Expected IDENTITY.md to be exported')

    const exportedAgentDir = path.join(tmpHome, '.openclaw', 'agents', 'alpha', 'agent')
    assert(fs.existsSync(path.join(exportedAgentDir, 'IDENTITY.md')), 'Expected exported IDENTITY.md in OpenClaw agent dir')

    const metadata = JSON.parse(fs.readFileSync(path.join(tmpHome, '.openclaw', 'agents', 'alpha', 'clawmax-export.json'), 'utf-8'))
    assert(Array.isArray(metadata.skills) && metadata.skills.includes('github'), 'Expected skills in export metadata')
    assert(metadata.groups.some((group: any) => group.name === 'Builders'), 'Expected groups in export metadata')
    assert(metadata.communities.some((community: any) => community.name === 'Core'), 'Expected communities in export metadata')
  })

  await test('listImportableOpenClawAgents includes exported agent', () => {
    const importable = listImportableOpenClawAgents()
    assert(importable.some((agent) => agent.id === 'alpha' && agent.hasMetadata), 'Expected alpha to be listed as importable')
  })

  await test('importAgentFromOpenClaw round-trips files and memberships under a new ID', () => {
    const result = importAgentFromOpenClaw('alpha', 'beta')
    assert(result.importedId === 'beta', 'Expected imported ID to be beta')
    assert(result.metadataRestored === true, 'Expected metadata restoration on round-trip import')

    const importedAgentDir = path.join(workspace, 'AGENTS', 'beta')
    assert(fs.existsSync(path.join(importedAgentDir, 'IDENTITY.md')), 'Expected imported IDENTITY.md in workspace')

    const communities = fs.readFileSync(path.join(workspace, 'ORG', 'COMMUNITIES.md'), 'utf-8')
    const groups = fs.readFileSync(path.join(workspace, 'ORG', 'GROUPS.md'), 'utf-8')
    assert(communities.includes('alpha, beta') || communities.includes('beta, alpha'), 'Expected imported agent added to community members')
    assert(groups.includes('alpha, beta') || groups.includes('beta, alpha'), 'Expected imported agent added to group members')

    const config = JSON.parse(fs.readFileSync(path.join(tmpHome, '.openclaw', 'openclaw.json'), 'utf-8'))
    const importedConfig = config.agents.list.find((agent: any) => agent.id === 'beta')
    assert(importedConfig, 'Expected imported agent registered in openclaw.json')
    assert(Array.isArray(importedConfig.skills) && importedConfig.skills.includes('workspace-ls'), 'Expected skills preserved in imported config')
  })

  await test('importAgentFromBundleDirectory imports bundle and restores metadata warnings/sklls', () => {
    const bundleRoot = path.join(tmpHome, 'bundle-gamma')
    const bundleDir = path.join(bundleRoot, 'gamma')
    fs.mkdirSync(bundleDir, { recursive: true })
    fs.writeFileSync(path.join(bundleDir, 'IDENTITY.md'), '# Identity\n\n**Name:** Gamma\n', 'utf-8')
    fs.writeFileSync(path.join(bundleDir, 'SOUL.md'), '# Soul\n\nCalm.\n', 'utf-8')
    fs.writeFileSync(path.join(bundleDir, 'TOOLS.md'), '# Tools\n\n- rg\n', 'utf-8')
    fs.writeFileSync(path.join(bundleDir, 'clawmax-export.json'), JSON.stringify({
      ...getAgentTransferMetadata('alpha'),
      agentId: 'gamma',
      skills: ['github'],
      communities: [{ name: 'Missing Community', description: null, tags: [], channels: [], community: null }],
      groups: [],
    }, null, 2), 'utf-8')

    const result = importAgentFromBundleDirectory(bundleRoot)
    assert(result.importedId === 'gamma', 'Expected inferred agent ID from bundle directory')
    assert(result.metadataRestored === true, 'Expected bundle metadata to be restored')
    assert(result.warnings.some((warning) => warning.includes('Missing Community')), 'Expected warning for missing community')

    const config = JSON.parse(fs.readFileSync(path.join(tmpHome, '.openclaw', 'openclaw.json'), 'utf-8'))
    const importedConfig = config.agents.list.find((agent: any) => agent.id === 'gamma')
    assert(importedConfig?.skills?.includes('github'), 'Expected bundle skill metadata to be restored')
  })

  await test('importAgentFromZipArchive imports exported ZIP bundle', () => {
    const zipSourceRoot = path.join(tmpHome, 'zip-source')
    const zipAgentDir = path.join(zipSourceRoot, 'zip-agent')
    fs.mkdirSync(zipAgentDir, { recursive: true })
    fs.writeFileSync(path.join(zipAgentDir, 'IDENTITY.md'), '# Identity\n\n**Name:** Zip Agent\n', 'utf-8')
    fs.writeFileSync(path.join(zipAgentDir, 'SOUL.md'), '# Soul\n\nZip.\n', 'utf-8')
    fs.writeFileSync(path.join(zipAgentDir, 'TOOLS.md'), '# Tools\n\n- zip\n', 'utf-8')
    fs.writeFileSync(path.join(zipAgentDir, 'clawmax-export.json'), JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      sourceWorkspacePath: workspace,
      agentId: 'zip-agent',
      skills: ['workspace-ls'],
      communities: [],
      groups: [],
    }, null, 2), 'utf-8')

    const zipPath = path.join(tmpHome, 'zip-agent.zip')
    createZipArchive(zipPath, 'zip-agent', zipSourceRoot)

    const result = importAgentFromZipArchive(zipPath)
    assert(result.importedId === 'zip-agent', 'Expected ZIP import to preserve bundle folder name')
    assert(result.files.includes('IDENTITY.md'), 'Expected IDENTITY.md restored from ZIP')
  })

  await test('importAgentFromOpenClaw prefers the active workspace record when ids collide and preserves gateway config', () => {
    const activeWorkspace = workspace
    const staleWorkspace = path.join(tmpHome, 'stale-workspace')
    const staleAgentDir = path.join(staleWorkspace, 'AGENTS', 'alpha')
    fs.mkdirSync(staleAgentDir, { recursive: true })
    fs.writeFileSync(path.join(staleAgentDir, 'IDENTITY.md'), '# Identity\n\n**Name:** Alpha stale\n', 'utf-8')

    fs.writeFileSync(path.join(tmpHome, '.openclaw', 'openclaw.json'), JSON.stringify({
      gateway: {
        auth: { token: 'stable-token' },
        remote: { token: 'stable-token' },
        tailscale: { enabled: true, hostname: 'stable-host' },
      },
      agents: {
        list: [
          {
            id: 'alpha',
            name: 'alpha',
            workspace: staleAgentDir,
            agentDir: path.join(tmpHome, '.openclaw', 'agents', 'alpha', 'agent'),
            skills: ['slack'],
          },
          {
            id: 'alpha',
            name: 'alpha',
            workspace: path.join(activeWorkspace, 'AGENTS', 'alpha'),
            agentDir: path.join(tmpHome, '.openclaw', 'agents', 'alpha', 'agent'),
            skills: ['github', 'workspace-ls'],
          }
        ]
      }
    }, null, 2), 'utf-8')

    const result = importAgentFromOpenClaw('alpha', 'delta')
    assert(result.importedId === 'delta', 'Expected imported ID to be delta')

    const config = JSON.parse(fs.readFileSync(path.join(tmpHome, '.openclaw', 'openclaw.json'), 'utf-8'))
    const importedConfig = config.agents.list.find((agent: any) => agent.id === 'delta')
    assert(importedConfig, 'Expected imported delta registered in openclaw.json')
    assert(Array.isArray(importedConfig.skills) && importedConfig.skills.includes('workspace-ls'), 'Expected active workspace skills preserved during import')
    assert(config.gateway.auth.token === 'stable-token', 'Expected gateway auth token preserved')
    assert(config.gateway.remote.token === 'stable-token', 'Expected gateway remote token preserved')
    assert(config.gateway.tailscale.hostname === 'stable-host', 'Expected gateway tailscale config preserved')
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
