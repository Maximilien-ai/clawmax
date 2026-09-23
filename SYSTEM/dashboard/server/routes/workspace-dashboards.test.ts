/**
 * Workspace dashboard route helper tests
 *
 * Run with: npx ts-node --transpileOnly server/routes/workspace-dashboards.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import strictAssert from 'node:assert/strict'
import {
  extractLinks,
  extractParticipantResponses,
  extractProjectConfigurationLines,
  extractWorkspaceFilePaths,
  inferWorkspaceDashboardCompanies,
  normalizeResultArtifacts,
  summarizeSentence,
} from './workspace-dashboards'

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

console.log(`\n${YELLOW}=== Workspace Dashboard Route Helper Tests ===${RESET}\n`)

test('extractProjectConfigurationLines returns structured kickoff items', () => {
  const content = `
# Workflow

## Project Configuration

> **Customize these before applying:**
- Research question: What changed this week?
- Output artifact: decision brief
- Action target: founder review

## Your Tasks

1. Do the work
`

  const result = extractProjectConfigurationLines(content)
  assert(result.length === 3, `Expected 3 kickoff lines, got ${result.length}`)
  assert(result[0] === 'Research question: What changed this week?', 'Expected first kickoff line to be extracted cleanly')
})

test('extractParticipantResponses prefers participant response content', () => {
  const execution = {
    participants: [
      { response: 'First useful answer' },
      { result: { text: 'Second useful answer' } },
      { result: { response: 'Third useful answer' } },
      { response: '' },
    ],
  }

  const result = extractParticipantResponses(execution)
  assert(result.length === 3, `Expected 3 participant responses, got ${result.length}`)
  assert(result[1] === 'Second useful answer', 'Expected nested result text to be extracted')
})

test('extractLinks deduplicates and trims trailing punctuation', () => {
  const result = extractLinks([
    'Review https://example.com/report.pdf.',
    'Also https://example.com/report.pdf and https://github.com/org/repo/issues/1!',
  ])

  assert(result.length === 2, `Expected 2 unique links, got ${result.length}`)
  assert(result[0] === 'https://example.com/report.pdf', 'Expected trailing punctuation to be removed')
})

test('extractWorkspaceFilePaths returns only existing workspace files', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-wd-route-test-'))
  const docsDir = path.join(workspaceRoot, 'SYSTEM', 'docs')
  fs.mkdirSync(docsDir, { recursive: true })
  const reportPath = path.join(docsDir, 'brief.md')
  fs.writeFileSync(reportPath, '# Brief\n', 'utf-8')

  const result = extractWorkspaceFilePaths([
    `See ${reportPath} and /tmp/ignore-me.txt`,
  ], workspaceRoot)

  assert(result.length === 1, `Expected 1 workspace file, got ${result.length}`)
  assert(result[0] === reportPath, 'Expected workspace file path to be preserved')
})

test('normalizeResultArtifacts builds labeled links and workspace files', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-wd-artifacts-test-'))
  const artifactPath = path.join(workspaceRoot, 'SYSTEM', 'docs', 'FINAL_BRIEF.md')
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true })
  fs.writeFileSync(artifactPath, '# Final brief\n', 'utf-8')

  const artifacts = normalizeResultArtifacts({
    links: ['https://github.com/Maximilien-ai/clawmax/pull/57'],
    filePaths: [artifactPath],
    workspacePath: workspaceRoot,
  })

  assert(artifacts.length === 2, `Expected 2 artifacts, got ${artifacts.length}`)
  assert(artifacts[0].kind === 'link', 'Expected first artifact to be a link')
  assert(artifacts[1].kind === 'file', 'Expected second artifact to be a file')
  assert(artifacts[1].relativePath === path.relative(workspaceRoot, artifactPath), 'Expected relative path for file artifact')
})

test('summarizeSentence truncates long text cleanly', () => {
  const summary = summarizeSentence('a'.repeat(300), 50)
  assert(summary.length <= 50, `Expected summary length <= 50, got ${summary.length}`)
  assert(summary.endsWith('…'), 'Expected truncated summary to end with ellipsis')
})

test('inferWorkspaceDashboardCompanies returns workspace, team, and prefix focus options', () => {
  const companies = inferWorkspaceDashboardCompanies({
    teams: [
      {
        id: 'build-a-company-hackathon-org',
        name: 'Build-a-Company Hackathon Org',
        memberAgentIds: [],
        tags: ['company-root'],
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:00.000Z',
      },
    ] as any,
    workflows: [
      { name: 'Build-a-Company Hack Test · Leadership Kickoff' },
      { name: 'b2b · Project Kickoff' },
    ],
  })

  assert(companies[0].kind === 'workspace', 'Expected workspace option first')
  assert(companies.some((company) => company.kind === 'team' && company.value === 'build-a-company-hackathon-org'), 'Expected team-backed company option')
  assert(companies.some((company) => company.kind === 'prefix' && company.value === 'b2b'), 'Expected derived prefix company option')
})

test('dashboard helpers handle missing, malformed and bounded result content', () => {
  strictAssert.equal(summarizeSentence(' \n\t '), '')
  strictAssert.equal(summarizeSentence(' short\n text '), 'short text')
  strictAssert.deepEqual(extractProjectConfigurationLines('# No configuration'), [])
  strictAssert.deepEqual(extractProjectConfigurationLines('## Project Configuration\nParagraph\n1. First\n2. Second\n## Stop\n- Excluded'), ['First', 'Second'])
  strictAssert.equal(extractProjectConfigurationLines('## Project Configuration\n' + Array.from({ length: 10 }, (_, i) => `- Item ${i}`).join('\n')).length, 6)
  strictAssert.deepEqual(extractParticipantResponses(null), [])
  strictAssert.deepEqual(extractParticipantResponses({ participants: {} }), [])
  strictAssert.deepEqual(extractParticipantResponses({ participants: [null, {}, { response: 1 }, { response: ' ' }, { result: { response: 'usable' } }] }), ['usable'])
  strictAssert.deepEqual(extractLinks([null, undefined, '', 'No links', 'https://a.invalid https://b.invalid'], 1), ['https://a.invalid'])
  strictAssert.deepEqual(normalizeResultArtifacts({ links: ['invalid link', 'https://host.invalid/'], filePaths: [], workspacePath: '/fixture' }), [
    { kind: 'link', label: 'invalid link', url: 'invalid link' },
    { kind: 'link', label: 'host.invalid / host.invalid', url: 'https://host.invalid/' },
  ])
})

test('company options deduplicate teams and prefixes while excluding child teams', () => {
  strictAssert.deepEqual(inferWorkspaceDashboardCompanies({} as any), [{ kind: 'workspace', value: null, label: 'Whole workspace' }])
  const options = inferWorkspaceDashboardCompanies({ teams: [
    { id: 'a', name: 'Alpha' }, { id: 'a', name: 'Alpha duplicate' },
    { id: 'b', name: 'Beta' }, { id: 'child', name: 'Child', parentTeamId: 'a' },
  ] as any, workflows: [{}, { name: '' }, { name: 'Standalone' }, { name: 'Alpha · Work' }, { name: 'Gamma · One' }, { name: 'gamma · Two' }] })
  strictAssert.deepEqual(options.map(option => option.label.toLowerCase()), ['whole workspace', 'alpha', 'beta', 'gamma'])
})

test('workspace artifact extraction ignores absent files and honors deduplication and limits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-artifact-edges-'))
  try {
    const a = path.join(root, 'a.md')
    const b = path.join(root, 'b.md')
    fs.writeFileSync(a, 'a')
    fs.writeFileSync(b, 'b')
    strictAssert.deepEqual(extractWorkspaceFilePaths([null, '', 'No paths', `${root}/missing.md`, a, a, b], root, 1), [a])
    strictAssert.deepEqual(extractWorkspaceFilePaths([a, a, b], root), [a, b])
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
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
