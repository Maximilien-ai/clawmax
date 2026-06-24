import assert from 'assert'
import {
  buildBuilderRecommendationKey,
  createBuilderSessionDocPath,
  createBuilderSessionMarkdown,
} from './builderSession'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('createBuilderSessionDocPath falls back to workspace and builder-session slugs', () => {
  const path = createBuilderSessionDocPath({
    workspaceName: '',
    sessionTitle: '   ',
    timestamp: Date.parse('2026-06-24T09:15:00.000Z'),
  })

  assert.equal(path, 'SYSTEM/Builder Sessions/workspace/2026-06-24/builder-session.md')
})

test('buildBuilderRecommendationKey returns null for missing recommendations', () => {
  assert.equal(buildBuilderRecommendationKey(null), null)
})

test('createBuilderSessionMarkdown omits recommendation section when recommendation is null', () => {
  const markdown = createBuilderSessionMarkdown({
    workspaceName: 'Personal',
    workspaceId: 'personal',
    sessionId: 'builder-456',
    sessionTitle: 'Quick Note',
    timestamp: Date.parse('2026-06-24T09:15:00.000Z'),
    messages: [
      { role: 'user', content: 'Help me draft something small.' },
    ],
    recommendation: null,
  })

  assert(markdown.includes('# Quick Note'))
  assert(!markdown.includes('## Recommendation'))
  assert(markdown.includes('## Conversation'))
})

test('createBuilderSessionMarkdown normalizes CRLF message content and trims extra blank lines', () => {
  const markdown = createBuilderSessionMarkdown({
    sessionId: 'builder-789',
    sessionTitle: 'Escaping Demo',
    timestamp: Date.parse('2026-06-24T09:15:00.000Z'),
    messages: [
      { role: 'user', content: 'Line one.\r\nLine two.\r\n\r\n' },
      { role: 'assistant', content: 'Answer block.\r\n' },
    ],
    recommendation: {
      intent: 'team_template',
      scope: 'team',
      operation: 'refine_template',
      confidence: 'medium',
    },
  })

  assert(markdown.includes('Line one.\nLine two.'), 'Expected CRLF normalization in message content')
  assert(!markdown.includes('\r'), 'Expected carriage returns to be removed')
  assert(markdown.includes('### Builder agent'), 'Expected assistant messages to remain labeled as Builder agent')
})

console.log('builderSessionEdges.test.ts: 4 tests passed')
