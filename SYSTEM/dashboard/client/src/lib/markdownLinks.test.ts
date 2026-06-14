import { isOpenableWorkspaceFileMention, transformWorkspaceMarkdownUrl } from './markdownLinks'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(
  transformWorkspaceMarkdownUrl('workspace-file:trip_brief_template.md') === 'workspace-file:trip_brief_template.md',
  'Expected internal workspace-file links to survive markdown URL sanitization'
)

assert(
  transformWorkspaceMarkdownUrl('https://example.com/doc.md') === 'https://example.com/doc.md',
  'Expected normal HTTPS links to remain valid'
)

assert(
  transformWorkspaceMarkdownUrl('javascript:alert(1)') === '',
  'Expected unsafe script links to stay blocked'
)

assert(
  isOpenableWorkspaceFileMention('AGENTS/jarvis/SOUL.md') === true,
  'Expected workspace agent markdown files to be openable'
)

assert(
  isOpenableWorkspaceFileMention('AGENTS/jarvis/preview.png') === true,
  'Expected workspace image files to be openable'
)

assert(
  isOpenableWorkspaceFileMention('auth-profiles.json') === false,
  'Expected runtime auth profile files to stay out of DocHub links'
)

console.log('markdownLinks.test.ts: 6 tests passed')
