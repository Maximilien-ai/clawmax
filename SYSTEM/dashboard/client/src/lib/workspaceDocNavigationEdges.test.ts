import assert from 'assert'
import { resolveNavigableWorkspaceDocPath } from './workspaceDocNavigation'

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

const docEntries = [
  { path: 'AGENTS/jarvis/show.pdf' },
  { path: 'WORKFLOWS/outputs/demo/final-report.json' },
  { path: 'SYSTEM/docs/STATUS.md' },
]

test('normalizes absolute workspace paths before navigation lookup', () => {
  assert.strictEqual(
    resolveNavigableWorkspaceDocPath('/app/DATA/default/AGENTS/jarvis/show.pdf', docEntries),
    'AGENTS/jarvis/show.pdf'
  )
})

test('trims whitespace from direct workspace targets', () => {
  assert.strictEqual(
    resolveNavigableWorkspaceDocPath('  WORKFLOWS/outputs/demo/final-report.json  ', docEntries),
    'WORKFLOWS/outputs/demo/final-report.json'
  )
})

test('returns null for ambiguous bare filenames when doc entries are loaded', () => {
  assert.strictEqual(
    resolveNavigableWorkspaceDocPath('STATUS.md', [
      { path: 'SYSTEM/docs/STATUS.md' },
      { path: 'ORG/STATUS.md' },
    ]),
    null
  )
})

test('returns direct scoped workspace path when doc entries are still warming', () => {
  assert.strictEqual(
    resolveNavigableWorkspaceDocPath('SYSTEM/docs/STATUS.md', null),
    'SYSTEM/docs/STATUS.md'
  )
})

test('returns null for bare filenames while doc entries are still warming', () => {
  assert.strictEqual(resolveNavigableWorkspaceDocPath('STATUS.md', undefined), null)
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`workspaceDocNavigationEdges.test.ts: ${passed} tests passed`)
