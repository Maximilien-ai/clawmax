import assert from 'assert'
import { resolveNavigableWorkspaceDocPath } from './workspaceDocNavigation'

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

const docEntries = [
  { path: 'AGENTS/jarvis/show.pdf' },
  { path: 'SYSTEM/docs/STATUS.md' },
  { path: 'WORKFLOWS/outputs/demo/final report.json' },
]

test('resolves workspace-file urls with fragments', () => {
  assert.strictEqual(
    resolveNavigableWorkspaceDocPath('workspace-file:SYSTEM/docs/STATUS.md#top', docEntries),
    'SYSTEM/docs/STATUS.md'
  )
})

test('resolves workspace-file urls with query strings', () => {
  assert.strictEqual(
    resolveNavigableWorkspaceDocPath('workspace-file:AGENTS/jarvis/show.pdf?download=1', docEntries),
    'AGENTS/jarvis/show.pdf'
  )
})

test('decodes encoded workspace paths before lookup', () => {
  assert.strictEqual(
    resolveNavigableWorkspaceDocPath('workspace-file:WORKFLOWS/outputs/demo/final%20report.json', docEntries),
    'WORKFLOWS/outputs/demo/final report.json'
  )
})

test('leaves malformed encodings unresolved', () => {
  assert.strictEqual(
    resolveNavigableWorkspaceDocPath('workspace-file:WORKFLOWS/outputs/demo/%E0%A4%A', docEntries),
    null
  )
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`workspaceDocNavigationUrlEdges.test.ts: ${passed} tests passed`)
