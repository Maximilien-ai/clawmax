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

test('createBuilderSessionDocPath places builder sessions under SYSTEM Builder Sessions', () => {
  const path = createBuilderSessionDocPath({
    workspaceName: 'Personal Workspace',
    sessionTitle: 'Monthly Gallery Shows',
    timestamp: Date.parse('2026-05-25T12:34:56.000Z'),
  })

  assert.equal(path, 'SYSTEM/Builder Sessions/personal-workspace/2026-05-25/monthly-gallery-shows.md')
})

test('buildBuilderRecommendationKey includes recommendation shape and title', () => {
  const key = buildBuilderRecommendationKey({
    intent: 'team_template',
    scope: 'team',
    operation: 'refine_template',
    confidence: 'medium',
    recommendedPath: { title: 'Refine Conference Ops Hub' },
  })

  assert.equal(key, 'team_template|team|refine_template|Refine Conference Ops Hub')
})

test('createBuilderSessionMarkdown captures recommendation, grouping, messages, and matched assets', () => {
  const markdown = createBuilderSessionMarkdown({
    workspaceName: 'Personal',
    workspaceId: 'personal',
    sessionId: 'builder-123',
    sessionTitle: 'Gallery Workshop Series',
    timestamp: Date.parse('2026-05-25T12:34:56.000Z'),
    feedback: 'up',
    messages: [
      { role: 'user', content: 'Create a team for a monthly creative workshop series.' },
      { role: 'assistant', content: 'Conference Ops Hub is close, but a new template may fit better.' },
    ],
    recommendation: {
      intent: 'team_template',
      scope: 'team',
      operation: 'create_new',
      confidence: 'low',
      summary: 'A new template is likely the best path.',
      recommendedPath: {
        title: 'Create a new team template',
        reasoning: 'The closest event template is still too generic for the workshop series.',
      },
      groupingSuggestion: {
        label: 'creative_workshop_series',
        rationale: 'This looks like recurring creative program operations.',
        alternatives: ['event_ops', 'community_program_ops'],
      },
      testPlan: ['Generate the template and test it with one event.', 'Check that handoffs match the real workshop flow.'],
      matchedAssets: {
        organizationTemplates: [{ name: 'Conference Ops Hub' }],
      },
    },
  })

  assert(markdown.includes('docType: builder-session'))
  assert(markdown.includes('# Gallery Workshop Series'))
  assert(markdown.includes('## Recommendation'))
  assert(markdown.includes('### Suggested Grouping'))
  assert(markdown.includes('creative_workshop_series'))
  assert(markdown.includes('## Conversation'))
  assert(markdown.includes('### User'))
  assert(markdown.includes('### Builder agent'))
  assert(markdown.includes('## Matched Assets'))
  assert(markdown.includes('Conference Ops Hub'))
})
