import assert from 'assert'
import {
  extractWorkspaceFileMentions,
  linkifyWorkspaceFiles,
  normalizeWorkspaceFileTarget,
  resolveWorkspaceDocPath,
} from './workspaceFiles'

function run() {
  assert.strictEqual(
    normalizeWorkspaceFileTarget('  /workspace/default/SYSTEM/docs/STATUS.md  '),
    'SYSTEM/docs/STATUS.md'
  )

  assert.deepStrictEqual(
    extractWorkspaceFileMentions(
      'Refs: /app/DATA/default/AGENTS/jarvis/show.pdf AGENTS/jarvis/show.pdf .openclaw/state.json AGENTS/jarvis/.openclaw/state.json auth-profiles.json'
    ),
    ['AGENTS/jarvis/show.pdf']
  )

  const linked = linkifyWorkspaceFiles('Compare AGENTS/jarvis/show.pdf and auth-profiles.json before review.')
  assert(
    linked.includes('[AGENTS/jarvis/show.pdf](workspace-file:AGENTS/jarvis/show.pdf)'),
    'Expected scoped workspace file to linkify'
  )
  assert(
    linked.includes('auth-profiles.json') && !linked.includes('[auth-profiles.json]'),
    'Expected runtime-only auth profile file to remain plain text'
  )

  const docEntries = [
    { path: 'SYSTEM/docs/STATUS.md' },
    { path: 'AGENTS/jarvis/STATUS.md' },
    { path: 'AGENTS/jarvis/show.pdf' },
  ]
  assert.strictEqual(
    resolveWorkspaceDocPath('SYSTEM/docs/STATUS.md', docEntries),
    'SYSTEM/docs/STATUS.md'
  )
  assert.strictEqual(resolveWorkspaceDocPath('STATUS.md', docEntries), null)
  assert.strictEqual(resolveWorkspaceDocPath('show.pdf', docEntries), 'AGENTS/jarvis/show.pdf')

  console.log('workspaceFilesEdges.test.ts: 7 tests passed')
}

run()
