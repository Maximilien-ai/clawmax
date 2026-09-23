import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  addTemplateFeedback,
  getAllTemplateFeedbackSummaries,
  getTemplateApplyCount,
  getTemplateFeedbackSummary,
  listTemplateFeedback,
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

async function assertRejects(promise: Promise<unknown>, expected: string) {
  try {
    await promise
    throw new Error(`Expected rejection containing ${expected}`)
  } catch (error: any) {
    assert(String(error?.message).includes(expected), `Unexpected rejection: ${error?.message}`)
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

  await test('local feedback ignores malformed files and preserves type aliases and newest-first history', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-feedback-history-'))
    process.env.HOME = tempHome
    process.env.OPENCLAW_WORKSPACE = path.join(tempHome, 'workspace')
    delete process.env.TEMPLATE_FEEDBACK_REMOTE_URL
    delete process.env.TEMPLATE_FEEDBACK_SUMMARY_URL
    delete process.env.TEMPLATE_FEEDBACK_TOKEN
    resetWorkspaceManagerForTests()
    const filePath = path.join(process.env.OPENCLAW_WORKSPACE, 'SYSTEM', 'template-feedback.json')
    try {
      assertEqual((await getTemplateFeedbackSummary('agent', 'writer')).count, 0, 'Missing file should be empty')
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, '{broken')
      assertEqual(listTemplateFeedback('agent', 'writer').length, 0, 'Corrupt file should be empty')
      fs.writeFileSync(filePath, JSON.stringify({ entries: null }))
      assertEqual(listTemplateFeedback('agent', 'writer').length, 0, 'Non-array entries should be empty')
      fs.writeFileSync(filePath, JSON.stringify({ entries: [
        { templateType: 'team', templateSlug: 'writer', rating: 2, createdAt: '2026-01-01' },
        { templateType: 'organization', templateSlug: 'writer', rating: 4, createdAt: '2026-02-01' },
        { templateType: 'company', templateSlug: 'writer', rating: 5, createdAt: '2026-03-01' },
        { templateType: 'workflow', templateSlug: 'writer', rating: 3, createdAt: '2026-04-01' },
        { templateType: 'agent', templateSlug: 'other', rating: 1, createdAt: '2026-05-01' },
      ] }))
      const org = await getTemplateFeedbackSummary('organization', 'writer')
      assertEqual(org.count, 3, 'Organization should include team and company aliases')
      assertEqual(org.entries[0].createdAt, '2026-03-01', 'History should be newest first')
      assertEqual(org.avgRating, 3.67, 'Average should be rounded to two decimals')
      assertEqual(listTemplateFeedback('team', 'writer').length, 2, 'Team should include legacy organization')
      assertEqual(listTemplateFeedback('company', 'writer').length, 3, 'Company should include workflows and legacy organization')
      assertEqual(listTemplateFeedback('workflow', 'writer').length, 2, 'Workflow should include company feedback')
      assertEqual(listTemplateFeedback('agent', 'writer').length, 0, 'Agent must remain isolated')
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true })
    }
  })

  await test('apply counters recover from malformed storage and reject empty identities', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-feedback-counts-'))
    process.env.HOME = tempHome
    process.env.OPENCLAW_WORKSPACE = path.join(tempHome, 'workspace')
    resetWorkspaceManagerForTests()
    const filePath = path.join(process.env.OPENCLAW_WORKSPACE, 'SYSTEM', 'template-apply-stats.json')
    const entry = { templateId: ' user:writer ', templateType: 'agent' as const, templateSlug: 'writer', templateSource: 'user' as const }
    try {
      assertEqual(recordTemplateApply({ ...entry, templateId: '  ' }), 0, 'Blank identity must not create a count')
      assertEqual(getTemplateApplyCount(null), 0, 'Null identity must return zero')
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, '{broken')
      assertEqual(getTemplateApplyCount('user:writer'), 0, 'Corrupt stats must read as empty')
      fs.writeFileSync(filePath, JSON.stringify({ entries: null }))
      assertEqual(recordTemplateApply(entry), 1, 'Invalid stats shape must start at one')
      assertEqual(getTemplateApplyCount('user:writer'), 1, 'Identity must be trimmed for lookup')
      assertEqual(recordTemplateApply(entry), 2, 'Count must survive a second write')
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true })
    }
  })

  await test('remote feedback normalizes sparse replies and excludes failed summaries', async () => {
    process.env.TEMPLATE_FEEDBACK_REMOTE_URL = 'https://example.test/api/feedback'
    process.env.TEMPLATE_FEEDBACK_SUMMARY_URL = 'https://example.test/api/summary'
    process.env.TEMPLATE_FEEDBACK_TOKEN = 'synthetic-token'
    const requested: string[] = []
    globalThis.fetch = (async (input: any) => {
      const url = String(input)
      requested.push(url)
      if (url.includes('broken')) return { ok: false, status: 503, json: async () => ({ error: 'Synthetic unavailable' }) } as any
      if (url.includes('fallback')) return { ok: false, status: 502, json: async () => { throw new Error('Synthetic JSON failure') } } as any
      return { ok: true, json: async () => ({ summary: { count: '2', avgRating: '4.5', entries: [
        { id: 5, templateType: null, templateSlug: 8, templateSource: 'invalid', applyCount: 'NaN', templateTags: ['ok', 3], rating: '5', createdAt: null },
        { id: 'remote-2', templateType: 'team', templateSlug: 'writer', templateSource: 'system', applyCount: '3', templateInfo: { title: 'Writer' }, rating: 4, createdAt: '2026-01-01' },
      ] } }) } as any
    }) as any
    try {
      const summary = await getTemplateFeedbackSummary('company', 'writer')
      assertEqual(summary.count, 2, 'Remote count should normalize numeric strings')
      assertEqual(summary.avgRating, 4.5, 'Remote average should normalize numeric strings')
      assertEqual(summary.entries[0].id, null, 'Invalid remote ID should be null')
      assertEqual(summary.entries[0].templateType, 'organization', 'Missing type should use legacy default')
      assertEqual(summary.entries[0].templateSource, undefined, 'Invalid source should be ignored')
      assertEqual(summary.entries[0].templateTags?.join(','), 'ok', 'Tags should contain only strings')
      assertEqual(summary.entries[1].applyCount, 3, 'Valid numeric count should normalize')
      assert(requested[0].includes('templateType=company') && requested[0].includes('templateSlug=writer'), 'Summary request must identify the template')
      const all = await getAllTemplateFeedbackSummaries([
        { templateType: 'team', templateSlug: 'writer' },
        { templateType: 'team', templateSlug: 'broken' },
      ])
      assertEqual(Object.keys(all).join(','), 'team:writer', 'Failed remote summary must be excluded')
      await assertRejects(getTemplateFeedbackSummary('team', 'broken'), 'Synthetic unavailable')
      await assertRejects(getTemplateFeedbackSummary('team', 'fallback'), 'Remote template feedback request failed (502)')
    } finally {
      globalThis.fetch = originalFetch
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
