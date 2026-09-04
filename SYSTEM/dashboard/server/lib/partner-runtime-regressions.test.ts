/**
 * Partner runtime regression suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/partner-runtime-regressions.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  buildManagedResendDispatch,
  shouldAttemptManagedResendDispatch,
  shouldUseLocalChatExecution,
} from '../routes/chat'
import { stripBenignChatRuntimeWarnings } from './chat-normalization'
import { safeEnv } from './safe-env'

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

const originalEnv = {
  HOME: process.env.HOME,
  OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE,
  CLAWMAX_TEST_WORKSPACE: process.env.CLAWMAX_TEST_WORKSPACE,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  COGNEE_API_KEY: process.env.COGNEE_API_KEY,
  COGNEE_BASE_URL: process.env.COGNEE_BASE_URL,
  COGNEE_DATASET_NAME: process.env.COGNEE_DATASET_NAME,
  COGNEE_SEARCH_TYPE: process.env.COGNEE_SEARCH_TYPE,
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === 'undefined') delete process.env[key]
    else process.env[key] = value
  }
}

function withWorkspace<T>(fn: (workspace: string) => T): T {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-partner-runtime-'))
  const workspace = path.join(tmpHome, 'workspace')
  fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })

  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspace
  process.env.CLAWMAX_TEST_WORKSPACE = workspace

  return fn(workspace)
}

console.log(`\n${YELLOW}=== Partner Runtime Regression Suite ===${RESET}\n`)

test('runtime-managed Resend and Cognee env reach agent child processes', () => {
  withWorkspace(() => {
    process.env.RESEND_API_KEY = 're_runtime_1234567890'
    process.env.COGNEE_API_KEY = 'cognee_runtime_key'
    process.env.COGNEE_BASE_URL = 'https://cognee.example.test'
    process.env.COGNEE_DATASET_NAME = 'clawmax-memory'
    process.env.COGNEE_SEARCH_TYPE = 'GRAPH_COMPLETION'

    const env = safeEnv()
    assert(env.RESEND_API_KEY === 're_runtime_1234567890', 'Expected runtime Resend key in child env')
    assert(env.COGNEE_API_KEY === 'cognee_runtime_key', 'Expected runtime Cognee key in child env')
    assert(env.COGNEE_BASE_URL === 'https://cognee.example.test', 'Expected runtime Cognee base URL in child env')
    assert(env.COGNEE_DATASET_NAME === 'clawmax-memory', 'Expected runtime Cognee dataset in child env')
    assert(env.COGNEE_SEARCH_TYPE === 'GRAPH_COMPLETION', 'Expected runtime Cognee search type in child env')
  })
})

test('workspace-managed Resend and Cognee settings override empty runtime env for tools', () => {
  withWorkspace((workspace) => {
    delete process.env.RESEND_API_KEY
    delete process.env.COGNEE_API_KEY
    delete process.env.COGNEE_BASE_URL
    delete process.env.COGNEE_DATASET_NAME
    delete process.env.COGNEE_SEARCH_TYPE

    fs.writeFileSync(path.join(workspace, 'SYSTEM', 'integrations.secrets.json'), JSON.stringify({
      partners: {
        resend: { apiKey: 're_workspace_1234567890' },
        cognee: { apiKey: 'cognee_workspace_key' },
      },
    }, null, 2))
    fs.writeFileSync(path.join(workspace, 'SYSTEM', 'integrations.json'), JSON.stringify({
      partners: {
        cognee: {
          baseUrl: 'https://self-hosted-cognee.example.test',
          datasetName: 'team-memory',
          searchType: 'RAG_COMPLETION',
        },
      },
    }, null, 2))

    const env = safeEnv()
    assert(env.RESEND_API_KEY === 're_workspace_1234567890', 'Expected workspace Resend key in child env')
    assert(env.COGNEE_API_KEY === 'cognee_workspace_key', 'Expected workspace Cognee key in child env')
    assert(env.COGNEE_BASE_URL === 'https://self-hosted-cognee.example.test', 'Expected workspace Cognee base URL in child env')
    assert(env.COGNEE_DATASET_NAME === 'team-memory', 'Expected workspace Cognee dataset in child env')
    assert(env.COGNEE_SEARCH_TYPE === 'RAG_COMPLETION', 'Expected workspace Cognee search type in child env')
  })
})

test('workspace-managed partner secrets do not create a competing OpenClaw 2 state owner', () => {
  assert(!shouldUseLocalChatExecution({
    provider: 'openai',
    byok: {},
    gatewayRunning: true,
    hasWorkspaceManagedSecrets: true,
  }), 'Expected hosted chat to use the process that already owns OpenClaw state')
})

test('managed Resend dispatch sends inline status without temp files', () => {
  withWorkspace((workspace) => {
    const agentRoot = path.join(workspace, 'AGENTS', 'jarvis')
    fs.mkdirSync(agentRoot, { recursive: true })
    fs.writeFileSync(path.join(agentRoot, 'IDENTITY.md'), '# Identity\n\nName: jarvis\nRole: assistant\n', 'utf-8')

    const dispatch = buildManagedResendDispatch({
      message: 'Who are you? Give me a status and send it to mmaximilien@gmail.com.',
      agentId: 'jarvis',
      agentWorkspaceDir: agentRoot,
      model: 'openai/gpt-4o-mini',
      provider: 'openai',
      assignedSkillIds: ['clawmax-resend'],
    })

    assert(shouldAttemptManagedResendDispatch(['clawmax-resend']), 'Expected assigned clawmax-resend to enable managed dispatch')
    if (!dispatch) throw new Error('Expected managed Resend dispatch')
    assert(dispatch.to === 'mmaximilien@gmail.com', 'Expected explicit recipient')
    assert(dispatch.body.includes('Name: jarvis'), 'Expected current-agent identity included in status body')
    assert(dispatch.attachmentPaths.length === 0, 'Expected inline status send without temp files')
  })
})

test('managed Resend dispatch attaches current-agent files directly', () => {
  withWorkspace((workspace) => {
    const agentRoot = path.join(workspace, 'AGENTS', 'jarvis')
    fs.mkdirSync(agentRoot, { recursive: true })
    const soulPath = path.join(agentRoot, 'SOUL.md')
    fs.writeFileSync(path.join(agentRoot, 'IDENTITY.md'), '# Identity\n\nName: jarvis\n', 'utf-8')
    fs.writeFileSync(soulPath, '# Soul\n\nUse the workspace first.\n', 'utf-8')

    const dispatch = buildManagedResendDispatch({
      message: 'Send your soul.md file to mmaximilien@gmail.com.',
      agentId: 'jarvis',
      agentWorkspaceDir: agentRoot,
      model: 'openai/gpt-4o-mini',
      provider: 'openai',
      assignedSkillIds: ['clawmax-resend'],
    })

    if (!dispatch) throw new Error('Expected managed Resend dispatch for file request')
    assert(dispatch.attachmentPaths.includes(soulPath), 'Expected original current-agent SOUL.md attached directly')
  })
})

test('Cognee benign runtime warning is stripped without hiding real output', () => {
  const warning = 'plugin runtime config.loadConfig() is deprecated (runtime-config-load-write); use config.current().'
  const realOutput = 'Cognee memory query completed.'
  const stripped = stripBenignChatRuntimeWarnings(`${warning}\n${realOutput}`)

  assert(!stripped.includes('runtime-config-load-write'), 'Expected benign Cognee warning removed')
  assert(stripped.includes(realOutput), 'Expected real chat output preserved')
})

restoreEnv()

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
