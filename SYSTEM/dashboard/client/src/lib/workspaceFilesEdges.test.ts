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

  // Code is shown and copied verbatim: a file name inside a fence or an inline code span must not
  // become Markdown link syntax, which renders there as literal `[x](workspace-file:x)` text.
  const fenced = [
    'Edit config.json, then run:',
    '',
    '```bash',
    'cat config.json | jq .',
    'cp AGENTS/demo/notes.md /tmp',
    '```',
    '',
    '~~~',
    'open report.pdf',
    '~~~',
    'Inline `cat summary.md` stays code, while `x` chart.png after it links.',
  ].join('\n')
  const fencedLinked = linkifyWorkspaceFiles(fenced)
  assert(fencedLinked.startsWith('Edit [config.json](workspace-file:config.json), then run:'), 'Prose before a fence still links')
  assert(fencedLinked.includes('\ncat config.json | jq .\ncp AGENTS/demo/notes.md /tmp\n'), 'A backtick fence keeps its code verbatim')
  assert(fencedLinked.includes('\nopen report.pdf\n'), 'A tilde fence keeps its code verbatim')
  assert(fencedLinked.includes('`cat summary.md`'), 'An inline code span keeps its text verbatim')
  assert(fencedLinked.includes('`x` [chart.png](workspace-file:chart.png) after'), 'Prose after an inline code span still links')
  assert.strictEqual(
    linkifyWorkspaceFiles('```\nnotes.md\n'),
    '```\nnotes.md\n',
    'An unclosed fence runs to the end of the message, as Markdown renders it'
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
