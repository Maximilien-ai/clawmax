/**
 * Workspace integrations config test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workspace-integrations.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  getResolvedWorkspaceIntegrationConfig,
  getResolvedWorkspaceIntegrationSecretPresence,
  getResolvedWorkspaceIntegrationSecretSummaries,
  getWorkspaceGitHubToken,
  getWorkspaceIntegrationSecretPresence,
  hasWorkspaceManagedPartnerSecrets,
  readWorkspaceIntegrationConfig,
  readWorkspaceIntegrationSecrets,
  writeWorkspaceIntegrationConfig,
  writeWorkspaceIntegrationSecrets,
} from './workspace-integrations'
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
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

function writeWorkspaceRegistry(tmpHome: string, workspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'test-workspace',
    workspaces: [{
      id: 'test-workspace',
      name: 'Test Workspace',
      path: workspacePath,
      createdAt: '2026-04-02T00:00:00.000Z',
      lastAccessedAt: '2026-04-02T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

console.log(`\n${YELLOW}=== Workspace Integrations Config Test Suite ===${RESET}\n`)

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE
const originalResendApiKey = process.env.RESEND_API_KEY
const originalCogneeApiKey = process.env.COGNEE_API_KEY
const originalCogneeBaseUrl = process.env.COGNEE_BASE_URL
const originalCogneeDatasetName = process.env.COGNEE_DATASET_NAME
const originalCogneeSearchType = process.env.COGNEE_SEARCH_TYPE

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-integrations-test-'))
const workspacePath = path.join(tmpHome, 'workspace')
fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
writeWorkspaceRegistry(tmpHome, workspacePath)

process.env.HOME = tmpHome
process.env.OPENCLAW_WORKSPACE = workspacePath
resetWorkspaceManagerForTests()

test('readWorkspaceIntegrationConfig returns empty object when no config exists', () => {
  const config = readWorkspaceIntegrationConfig()
  assert(Object.keys(config).length === 0, 'Expected empty config')
})

test('writeWorkspaceIntegrationConfig persists trimmed workspace defaults', () => {
  const config = writeWorkspaceIntegrationConfig({
    preferredModel: ' openai/gpt-4.1 ',
    systemPreferredModel: ' anthropic/claude-sonnet-4-20250514 ',
    githubDefaultRepo: ' Maximilien-ai/clawmax ',
    sensoContextLabel: ' Launch / Demo ',
    ollamaBaseUrl: ' http://localhost:11434 ',
    ollamaDefaultModel: ' llama3.2 ',
    opikWorkspace: ' team-space ',
    opikProject: ' clawmax ',
  })

  assert(config.preferredModel === 'openai/gpt-4.1', 'Expected trimmed preferredModel')
  assert(config.systemPreferredModel === 'anthropic/claude-sonnet-4-20250514', 'Expected trimmed systemPreferredModel')
  assert(config.githubDefaultRepo === 'Maximilien-ai/clawmax', 'Expected trimmed github repo')
  assert(config.sensoContextLabel === 'Launch / Demo', 'Expected trimmed senso context')
  assert(typeof config.updatedAt === 'string' && config.updatedAt.length > 0, 'Expected updatedAt')

  const persisted = readWorkspaceIntegrationConfig()
  assert(persisted.systemPreferredModel === 'anthropic/claude-sonnet-4-20250514', 'Expected persisted systemPreferredModel')
  assert(persisted.githubDefaultRepo === 'Maximilien-ai/clawmax', 'Expected persisted github repo')
  assert(persisted.ollamaDefaultModel === 'llama3.2', 'Expected persisted ollama model')
  assert(persisted.opikProject === 'clawmax', 'Expected persisted opik project')
})

test('writeWorkspaceIntegrationConfig persists a valid agentRuntime and omits invalid values', () => {
  const config = writeWorkspaceIntegrationConfig({ agentRuntime: 'claude' })
  assert(config.agentRuntime === 'claude', 'Expected agentRuntime to persist')

  const persisted = readWorkspaceIntegrationConfig()
  assert(persisted.agentRuntime === 'claude', 'Expected persisted agentRuntime')

  const invalid = writeWorkspaceIntegrationConfig({ agentRuntime: 'not-a-runtime' as any })
  assert(invalid.agentRuntime === undefined, 'Expected invalid agentRuntime to be omitted, not stored')

  const persistedInvalid = readWorkspaceIntegrationConfig()
  assert(persistedInvalid.agentRuntime === undefined, 'Expected invalid agentRuntime to stay omitted after reload')
})

test('writeWorkspaceIntegrationConfig normalizes enabled partner selections', () => {
  const config = writeWorkspaceIntegrationConfig({
    enabledPartners: [' senso ', 'github', 'github'],
  })

  assert(JSON.stringify(config.enabledPartners) === JSON.stringify(['senso', 'github']), 'Expected enabled partners normalized and deduplicated')

  const persisted = readWorkspaceIntegrationConfig()
  assert(JSON.stringify(persisted.enabledPartners) === JSON.stringify(['senso', 'github']), 'Expected persisted enabled partners')
})

test('writeWorkspaceIntegrationSecrets persists github runtime token without exposing it in config', () => {
  writeWorkspaceIntegrationSecrets({
    partners: {
      github: {
        token: ' ghp_test_token ',
      },
    },
  })

  const secrets = readWorkspaceIntegrationSecrets()
  assert(secrets.partners?.github?.token === 'ghp_test_token', 'Expected trimmed github token in secrets store')
  assert(getWorkspaceGitHubToken() === 'ghp_test_token', 'Expected github token helper to resolve token')

  const presence = getWorkspaceIntegrationSecretPresence()
  assert(presence.github?.token === true, 'Expected secret presence marker for github token')

  const config = readWorkspaceIntegrationConfig()
  assert(!config.partners?.github?.token, 'Expected raw github token to stay out of non-secret config')
})

test('resolved workspace config includes runtime-managed Cognee Cloud and self-hosted defaults', () => {
  delete process.env.RESEND_API_KEY
  process.env.COGNEE_API_KEY = ' cognee-test-key '
  process.env.COGNEE_BASE_URL = ' https://cognee.example.test '
  process.env.COGNEE_DATASET_NAME = ' clawmax-memory '
  process.env.COGNEE_SEARCH_TYPE = ' GRAPH_COMPLETION '

  writeWorkspaceIntegrationConfig({})
  writeWorkspaceIntegrationSecrets({})

  const config = getResolvedWorkspaceIntegrationConfig()
  assert(config.partners?.cognee?.baseUrl === 'https://cognee.example.test', 'Expected runtime Cognee base URL in resolved config')
  assert(config.partners?.cognee?.datasetName === 'clawmax-memory', 'Expected runtime Cognee dataset in resolved config')
  assert(config.partners?.cognee?.searchType === 'GRAPH_COMPLETION', 'Expected runtime Cognee search type in resolved config')

  const presence = getResolvedWorkspaceIntegrationSecretPresence()
  assert(presence.cognee?.apiKey === true, 'Expected runtime Cognee API key presence')
  const summaries = getResolvedWorkspaceIntegrationSecretSummaries()
  assert(summaries.cognee?.apiKey?.preview === 'cogn••••-key', `Unexpected Cognee key preview: ${summaries.cognee?.apiKey?.preview}`)
  assert(hasWorkspaceManagedPartnerSecrets(), 'Expected runtime-managed Cognee key to count as a managed partner secret')
})

test('runtime-managed Resend key counts as a managed partner secret for local tool execution', () => {
  delete process.env.COGNEE_API_KEY
  delete process.env.COGNEE_BASE_URL
  delete process.env.COGNEE_DATASET_NAME
  delete process.env.COGNEE_SEARCH_TYPE
  process.env.RESEND_API_KEY = ' re_runtime_1234567890 '

  writeWorkspaceIntegrationConfig({})
  writeWorkspaceIntegrationSecrets({})

  const presence = getResolvedWorkspaceIntegrationSecretPresence()
  assert(presence.resend?.apiKey === true, 'Expected runtime Resend key presence')
  assert(hasWorkspaceManagedPartnerSecrets(), 'Expected runtime Resend key to force local partner-tool execution')
})

if (typeof originalHome === 'undefined') delete process.env.HOME
else process.env.HOME = originalHome

if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
else process.env.OPENCLAW_WORKSPACE = originalWorkspace

if (typeof originalResendApiKey === 'undefined') delete process.env.RESEND_API_KEY
else process.env.RESEND_API_KEY = originalResendApiKey
if (typeof originalCogneeApiKey === 'undefined') delete process.env.COGNEE_API_KEY
else process.env.COGNEE_API_KEY = originalCogneeApiKey
if (typeof originalCogneeBaseUrl === 'undefined') delete process.env.COGNEE_BASE_URL
else process.env.COGNEE_BASE_URL = originalCogneeBaseUrl
if (typeof originalCogneeDatasetName === 'undefined') delete process.env.COGNEE_DATASET_NAME
else process.env.COGNEE_DATASET_NAME = originalCogneeDatasetName
if (typeof originalCogneeSearchType === 'undefined') delete process.env.COGNEE_SEARCH_TYPE
else process.env.COGNEE_SEARCH_TYPE = originalCogneeSearchType

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
