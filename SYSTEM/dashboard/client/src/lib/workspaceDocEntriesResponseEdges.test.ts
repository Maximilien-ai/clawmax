import assert from 'assert'
import { parseWorkspaceDocEntriesResponse } from './workspaceFiles'

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('parses docs payload entries', () => {
  assert.deepStrictEqual(
    parseWorkspaceDocEntriesResponse({
      docs: [{ path: 'SYSTEM/docs/STATUS.md' }, { path: 'AGENTS/jarvis/IDENTITY.md' }],
    }),
    [
      { path: 'SYSTEM/docs/STATUS.md' },
      { path: 'AGENTS/jarvis/IDENTITY.md' },
    ]
  )
})

test('parses legacy files payload entries', () => {
  assert.deepStrictEqual(
    parseWorkspaceDocEntriesResponse({
      files: [{ path: 'WORKFLOWS/demo.md' }, { path: 'ORG/README.md' }],
    }),
    [
      { path: 'WORKFLOWS/demo.md' },
      { path: 'ORG/README.md' },
    ]
  )
})

test('accepts string path arrays and trims blanks', () => {
  assert.deepStrictEqual(
    parseWorkspaceDocEntriesResponse({
      docs: ['  SYSTEM/docs/STATUS.md  ', '', 'AGENTS/jarvis/TODOs.md'],
    }),
    [
      { path: 'SYSTEM/docs/STATUS.md' },
      { path: 'AGENTS/jarvis/TODOs.md' },
    ]
  )
})

test('returns empty list for unknown payload shapes', () => {
  assert.deepStrictEqual(parseWorkspaceDocEntriesResponse({ items: [] }), [])
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`workspaceDocEntriesResponseEdges.test.ts: ${passed} tests passed`)
