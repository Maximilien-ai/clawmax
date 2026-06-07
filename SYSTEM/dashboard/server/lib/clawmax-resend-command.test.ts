/**
 * ClawMax Resend command helper test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/clawmax-resend-command.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { executeClawmaxResendSend, parseClawmaxResendSendArgs } from './clawmax-resend-command'
import { resolveWorkspaceEmailAttachments } from './resend-partner'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

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

console.log(`\n${YELLOW}=== ClawMax Resend Command Test Suite ===${RESET}\n`)

async function main() {
await test('parseClawmaxResendSendArgs accepts stdin body and attachment paths', () => {
  const parsed = parseClawmaxResendSendArgs(
    ['--to', 'mmaximilien@gmail.com', '--subject', 'Status', '--attach', 'WORKFLOWS/outputs/report.md'],
    {
      CLAWMAX_AGENT_ID: 'jarvis',
      OPENCLAW_WORKSPACE: '/tmp/workspace',
    } as NodeJS.ProcessEnv,
    'First line\n\nSecond line'
  )

  assert(parsed.to === 'mmaximilien@gmail.com', 'Expected recipient')
  assert(parsed.subject === 'Status', 'Expected subject')
  assert(parsed.body.includes('Second line'), 'Expected stdin body')
  assert(parsed.agentId === 'jarvis', 'Expected agent id from env')
  assert(parsed.attachmentPaths[0] === 'WORKFLOWS/outputs/report.md', 'Expected attachment path')
})

await test('parseClawmaxResendSendArgs reads body-file content', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-resend-cmd-'))
  const bodyFile = path.join(tmpDir, 'body.txt')
  fs.writeFileSync(bodyFile, 'Body from file', 'utf-8')

  const parsed = parseClawmaxResendSendArgs(
    ['--to', 'mmaximilien@gmail.com', '--subject', 'Status', '--body-file', bodyFile],
    {} as NodeJS.ProcessEnv,
    ''
  )

  assert(parsed.body === 'Body from file', 'Expected body loaded from file')
})

await test('executeClawmaxResendSend calls the shared resend backend with resolved attachments', async () => {
  let captured: any = null
  const result = await executeClawmaxResendSend(
    {
      to: 'mmaximilien@gmail.com',
      subject: 'Jarvis status',
      body: 'Gateway 10s',
      attachmentPaths: ['WORKFLOWS/outputs/report.md'],
      agentId: 'jarvis',
      workspaceRoot: '/tmp/workspace',
      workspaceLabel: 'default',
    },
    {
      getApiKey: () => 're_test_123',
      resolveAttachments: () => [{ filename: 'report.md', content: Buffer.from('hello').toString('base64') }],
      sendEmail: async (input: any) => {
        captured = input
        return { id: 'provider-123', message: 'ok' }
      },
    }
  )

  assert(captured?.agentId === 'jarvis', 'Expected agent id passed through')
  assert(captured?.attachments?.[0]?.filename === 'report.md', 'Expected resolved attachment passed through')
  assert(result.message.includes('provider-123'), 'Expected confirmation to include provider id')
})

await test('resolveWorkspaceEmailAttachments prefers the current agent workspace for protected bare filenames', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-resend-attach-'))
  const currentAgentRoot = path.join(workspaceRoot, 'AGENTS', 'resend-agent')
  const otherAgentRoot = path.join(workspaceRoot, 'AGENTS', 'fake-agent')
  fs.mkdirSync(currentAgentRoot, { recursive: true })
  fs.mkdirSync(otherAgentRoot, { recursive: true })
  fs.writeFileSync(path.join(currentAgentRoot, 'TOOLS.md'), 'resend-agent tools', 'utf-8')
  fs.writeFileSync(path.join(otherAgentRoot, 'TOOLS.md'), 'fake-agent tools', 'utf-8')

  const attachments = resolveWorkspaceEmailAttachments(workspaceRoot, ['TOOLS.md'], [currentAgentRoot])
  const decoded = Buffer.from(attachments[0].content, 'base64').toString('utf-8')
  assert(decoded === 'resend-agent tools', 'Expected protected bare filename to resolve from current agent workspace first')
})

await test('resolveWorkspaceEmailAttachments accepts absolute attachment paths inside the workspace', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-resend-attach-abs-'))
  const agentRoot = path.join(workspaceRoot, 'AGENTS', 'resend-agent')
  fs.mkdirSync(agentRoot, { recursive: true })
  const soulPath = path.join(agentRoot, 'SOUL.md')
  fs.writeFileSync(soulPath, 'agent soul', 'utf-8')

  const attachments = resolveWorkspaceEmailAttachments(workspaceRoot, [soulPath], [agentRoot])
  const decoded = Buffer.from(attachments[0].content, 'base64').toString('utf-8')
  assert(decoded === 'agent soul', 'Expected absolute in-workspace attachment path to resolve correctly')
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
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
