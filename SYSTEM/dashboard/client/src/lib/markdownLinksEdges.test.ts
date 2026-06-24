import { isOpenableWorkspaceFileMention, transformWorkspaceMarkdownUrl } from './markdownLinks'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('keeps safe mailto links intact', () => {
  assert(
    transformWorkspaceMarkdownUrl('mailto:test@example.com') === 'mailto:test@example.com',
    'Expected mailto links to remain valid'
  )
})

test('blocks custom script-like protocols that are not allowlisted', () => {
  assert(
    transformWorkspaceMarkdownUrl('vscode://file/tmp/demo.md') === '',
    'Expected vscode protocol links to be stripped by markdown sanitization'
  )
})

test('keeps relative workspace-looking paths without protocols intact', () => {
  assert(
    transformWorkspaceMarkdownUrl('AGENTS/jarvis/TODO.md#next') === 'AGENTS/jarvis/TODO.md#next',
    'Expected relative workspace paths to remain intact'
  )
})

test('rejects hidden openclaw helper paths as openable workspace mentions', () => {
  assert(
    isOpenableWorkspaceFileMention('AGENTS/jarvis/.openclaw/state.json') === false,
    'Expected nested .openclaw helper paths to be non-openable'
  )
  assert(
    isOpenableWorkspaceFileMention('.openclaw/state.json') === false,
    'Expected root .openclaw helper paths to be non-openable'
  )
})

test('accepts trimmed workspace-file targets for ordinary assets', () => {
  assert(
    isOpenableWorkspaceFileMention('  workspace-file:WORKFLOWS/outputs/demo/final-report.json  ') === true,
    'Expected trimmed workspace-file targets for output assets to be openable'
  )
})

test('rejects runtime-only filenames even through workspace-file prefix', () => {
  assert(
    isOpenableWorkspaceFileMention('workspace-file:auth-profiles.json') === false,
    'Expected runtime-only auth profile file mentions to remain blocked'
  )
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`markdownLinksEdges.test.ts: ${passed} tests passed`)
