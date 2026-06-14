import assert from 'assert'
import {
  extractWorkspaceFileMentions,
  linkifyWorkspaceFiles,
  normalizeWorkspaceFileTarget,
  resolveWorkspaceDocPath,
} from './workspaceFiles'

function run() {
  assert.strictEqual(
    normalizeWorkspaceFileTarget('/app/DATA/default/AGENTS/jarvis/report.png'),
    'AGENTS/jarvis/report.png'
  )

  assert.deepStrictEqual(
    extractWorkspaceFileMentions('Files: show.pdf preview.png AGENTS/jarvis/notes.md auth-profiles.json'),
    ['show.pdf', 'preview.png', 'AGENTS/jarvis/notes.md']
  )

  const linked = linkifyWorkspaceFiles('Review show.pdf and AGENTS/jarvis/chart.png today.')
  assert(linked.includes('[show.pdf](workspace-file:show.pdf)'), 'Expected bare PDF to linkify')
  assert(linked.includes('[AGENTS/jarvis/chart.png](workspace-file:AGENTS/jarvis/chart.png)'), 'Expected scoped PNG to linkify')

  const docEntries = [
    { path: 'AGENTS/jarvis/show.pdf' },
    { path: 'WORKFLOWS/outputs/demo/preview.png' },
  ]
  assert.strictEqual(resolveWorkspaceDocPath('show.pdf', docEntries), 'AGENTS/jarvis/show.pdf')
  assert.strictEqual(resolveWorkspaceDocPath('preview.png', docEntries), 'WORKFLOWS/outputs/demo/preview.png')

  const ambiguousEntries = [
    { path: 'AGENTS/a/show.pdf' },
    { path: 'WORKFLOWS/outputs/final/show.pdf' },
  ]
  assert.strictEqual(resolveWorkspaceDocPath('show.pdf', ambiguousEntries), null)

  console.log('workspaceFiles.test.ts: 6 tests passed')
}

run()
