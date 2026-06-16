import assert from 'assert'
import { resolveNavigableWorkspaceDocPath } from './workspaceDocNavigation'

function run() {
  const docEntries = [
    { path: 'AGENTS/jarvis/show.pdf' },
    { path: 'AGENTS/jarvis/TODOs.md' },
    { path: 'WORKFLOWS/outputs/demo/final-report.json' },
  ]

  assert.strictEqual(resolveNavigableWorkspaceDocPath('show.pdf', []), null)
  assert.strictEqual(resolveNavigableWorkspaceDocPath('AGENTS/jarvis/TODOs.md', []), 'AGENTS/jarvis/TODOs.md')
  assert.strictEqual(resolveNavigableWorkspaceDocPath('show.pdf', docEntries), 'AGENTS/jarvis/show.pdf')
  assert.strictEqual(
    resolveNavigableWorkspaceDocPath('WORKFLOWS/outputs/demo/final-report.json', docEntries),
    'WORKFLOWS/outputs/demo/final-report.json'
  )
  assert.strictEqual(resolveNavigableWorkspaceDocPath('AGENTS/jarvis/missing.md', docEntries), null)

  console.log('workspaceDocNavigation.test.ts: 5 tests passed')
}

run()
