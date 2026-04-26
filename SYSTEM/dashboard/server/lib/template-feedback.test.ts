import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  addTemplateFeedback,
  getAllTemplateFeedbackSummaries,
  getTemplateApplyCount,
  recordTemplateApply,
} from './template-feedback'
import { buildTemplateFeedbackMetadata, type AgentTemplate, type OrganizationTemplate } from './templates'
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

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

console.log(`\n${YELLOW}=== Template Feedback Test Suite ===${RESET}\n`)

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE
const originalRemoteUrl = process.env.TEMPLATE_FEEDBACK_REMOTE_URL
const originalSummaryUrl = process.env.TEMPLATE_FEEDBACK_SUMMARY_URL
const originalToken = process.env.TEMPLATE_FEEDBACK_TOKEN
const originalFetch = globalThis.fetch

async function run() {
  await test('records cumulative apply count and builds canonical company metadata', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-feedback-home-'))
    const tempWorkspace = path.join(tempHome, 'workspace')
    process.env.HOME = tempHome
    process.env.OPENCLAW_WORKSPACE = tempWorkspace
    delete process.env.TEMPLATE_FEEDBACK_REMOTE_URL
    delete process.env.TEMPLATE_FEEDBACK_SUMMARY_URL
    delete process.env.TEMPLATE_FEEDBACK_TOKEN
    resetWorkspaceManagerForTests()

    try {
      const template: OrganizationTemplate = {
        name: 'Revenue Engine',
        slug: 'revenue-engine',
        type: 'organization',
        kind: 'company',
        source: 'workspace',
        version: '1.2.3',
        author: 'Max',
        tags: ['B2B SaaS', 'Growth'],
        agents: [
          { id: 'ceo', role: 'Chief Executive Officer' },
        ],
        teams: [
          { id: 'leadership', name: 'Leadership', leaderAgentId: 'ceo' },
        ],
        workflows: [
          {
            id: 'kickoff',
            name: 'Kickoff',
            description: 'Start',
            schedule: '',
            enabled: true,
            executionMode: 'managed',
            targeting: { communities: [], groups: [], tags: [], agents: [] },
            content: 'Run kickoff',
          },
        ],
      }

      const metadata = buildTemplateFeedbackMetadata(template)
      assertEqual(metadata.templateType, 'company', 'Expected org kind=company to map to canonical company type')
      assertEqual(metadata.templateSource, 'user', 'Expected workspace template to map to user source')
      assertEqual(metadata.templateId, 'user:revenue-engine', 'Expected stable template identity')
      assertEqual(metadata.templateTags.join(','), 'b2b-saas,growth', 'Expected tags to be normalized')
      assertEqual(metadata.templateInfo.department, 'Leadership', 'Expected compact info to include first department/team')

      const first = recordTemplateApply(metadata)
      const second = recordTemplateApply(metadata)
      assertEqual(first, 1, 'Expected first apply count to start at 1')
      assertEqual(second, 2, 'Expected second apply count to increment')
      assertEqual(getTemplateApplyCount(metadata.templateId), 2, 'Expected cumulative apply count lookup to match')
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true })
    }
  })

  await test('sends expanded remote payload fields for canonical feedback contract', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-feedback-remote-home-'))
    const tempWorkspace = path.join(tempHome, 'workspace')
    process.env.HOME = tempHome
    process.env.OPENCLAW_WORKSPACE = tempWorkspace
    process.env.TEMPLATE_FEEDBACK_REMOTE_URL = 'https://example.test/api/template-feedback'
    process.env.TEMPLATE_FEEDBACK_SUMMARY_URL = 'https://example.test/api/template-feedback/summary'
    process.env.TEMPLATE_FEEDBACK_TOKEN = 'token-123'
    resetWorkspaceManagerForTests()

    let capturedBody: any = null
    globalThis.fetch = (async (_input: any, init?: any) => {
      capturedBody = JSON.parse(String(init?.body || '{}'))
      return {
        ok: true,
        json: async () => ({
          feedback: { id: 'fb_123' },
          summary: { count: 2, avgRating: 4.5, entries: [] },
        }),
      } as any
    }) as any

    try {
      await addTemplateFeedback({
        templateType: 'company',
        templateSlug: 'revenue-engine',
        templateId: 'user:revenue-engine',
        templateSource: 'user',
        applyCount: 7,
        templateTags: ['b2b-saas', 'growth'],
        templateInfo: { title: 'Revenue Engine', department: 'Leadership' },
        templateName: 'Revenue Engine',
        rating: 5,
        easyToUse: 'yes',
        solvedUseCase: 'yes',
        customized: 'a-little',
        otherUseCases: 'Sales operations',
        suggestions: 'More variants',
      }, {
        actorKey: 'max@example.com',
        actorDisplay: 'Max',
      })

      assert(capturedBody !== null, 'Expected remote payload to be captured')
      assertEqual(capturedBody.templateType, 'company', 'Expected canonical templateType in remote payload')
      assertEqual(capturedBody.templateSlug, 'revenue-engine', 'Expected templateSlug in remote payload')
      assertEqual(capturedBody.templateId, 'user:revenue-engine', 'Expected templateId in remote payload')
      assertEqual(capturedBody.templateSource, 'user', 'Expected templateSource in remote payload')
      assertEqual(capturedBody.applyCount, 7, 'Expected applyCount in remote payload')
      assertEqual(capturedBody.templateTags.join(','), 'b2b-saas,growth', 'Expected templateTags in remote payload')
      assertEqual(capturedBody.templateInfo.title, 'Revenue Engine', 'Expected templateInfo.title in remote payload')
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true })
    }
  })

  await test('local summaries still group canonical team/company feedback under organization keys for OSS mode', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-feedback-local-home-'))
    const tempWorkspace = path.join(tempHome, 'workspace')
    process.env.HOME = tempHome
    process.env.OPENCLAW_WORKSPACE = tempWorkspace
    delete process.env.TEMPLATE_FEEDBACK_REMOTE_URL
    delete process.env.TEMPLATE_FEEDBACK_SUMMARY_URL
    delete process.env.TEMPLATE_FEEDBACK_TOKEN
    resetWorkspaceManagerForTests()

    try {
      await addTemplateFeedback({
        templateType: 'team',
        templateSlug: 'support-squad',
        templateId: 'user:support-squad',
        templateSource: 'user',
        applyCount: 1,
        templateTags: ['support'],
        templateInfo: { title: 'Support Squad' },
        templateName: 'Support Squad',
        rating: 4,
      })

      await addTemplateFeedback({
        templateType: 'company',
        templateSlug: 'revenue-engine',
        templateId: 'user:revenue-engine',
        templateSource: 'user',
        applyCount: 2,
        templateTags: ['growth'],
        templateInfo: { title: 'Revenue Engine' },
        templateName: 'Revenue Engine',
        rating: 5,
      })

      const summaries = await getAllTemplateFeedbackSummaries()
      assertEqual(summaries['organization:support-squad']?.count, 1, 'Expected team feedback to remain visible under organization key')
      assertEqual(summaries['organization:revenue-engine']?.count, 1, 'Expected company feedback to remain visible under organization key')
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true })
    }
  })

  globalThis.fetch = originalFetch
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalRemoteUrl === 'undefined') delete process.env.TEMPLATE_FEEDBACK_REMOTE_URL
  else process.env.TEMPLATE_FEEDBACK_REMOTE_URL = originalRemoteUrl
  if (typeof originalSummaryUrl === 'undefined') delete process.env.TEMPLATE_FEEDBACK_SUMMARY_URL
  else process.env.TEMPLATE_FEEDBACK_SUMMARY_URL = originalSummaryUrl
  if (typeof originalToken === 'undefined') delete process.env.TEMPLATE_FEEDBACK_TOKEN
  else process.env.TEMPLATE_FEEDBACK_TOKEN = originalToken
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
  globalThis.fetch = originalFetch
  console.error(err)
  process.exit(1)
})
