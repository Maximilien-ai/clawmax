import assert from 'assert'
import {
  buildCommunicationCacheKey,
  communicationTitle,
  mergeTypingAgents,
  removeRespondedAgentsFromPending,
  resolveCommunicationDocPath,
  shouldUpdateChannelMessages,
  cleanCommunicationMessage,
} from './communicationMessages'

function run() {
  assert.equal(communicationTitle({ name: 'opaque-id', displayName: 'Daily Site Health' }), 'Daily Site Health')
  assert.equal(communicationTitle({ name: 'Legacy Group', displayName: '  ' }), 'Legacy Group')
  assert.equal(communicationTitle({ name: 'bulk-id', displayName: 'Ignored', tags: ['bulk-chat'], description: 'Temporary chat with Analysts' }), 'Temporary chat with Analysts')
  assert.equal(buildCommunicationCacheKey('group', 'opaque-id'), 'group:opaque-id', 'Display labels must not change storage identity')
  assert.strictEqual(buildCommunicationCacheKey('group', 'Leadership'), 'group:Leadership')

  const base = [
    { id: '1', from: 'alice', content: 'hello', timestamp: 1 },
    { id: '2', from: 'bob', content: 'hi', timestamp: 2 },
  ]

  assert.strictEqual(shouldUpdateChannelMessages(base, [...base]), false)
  assert.strictEqual(
    shouldUpdateChannelMessages(base, [...base, { id: '3', from: 'carol', content: 'new', timestamp: 3 }]),
    true
  )
  assert.strictEqual(
    shouldUpdateChannelMessages(base, [
      { id: '1', from: 'alice', content: 'hello edited', timestamp: 1 },
      { id: '2', from: 'bob', content: 'hi', timestamp: 2 },
    ]),
    true
  )

  const merged = mergeTypingAgents(new Set(['alice', 'bob']), new Set(['bob', 'carol']))
  assert.deepStrictEqual(Array.from(merged).sort(), ['alice', 'bob', 'carol'])

  const pendingAfterResponse = removeRespondedAgentsFromPending(
    new Set(['alice', 'bob']),
    [
      { id: '1', from: 'User', content: 'hello', timestamp: 1 },
      { id: '2', from: 'alice', content: 'reply', timestamp: 2 },
    ],
    1
  )
  assert.deepStrictEqual(Array.from(pendingAfterResponse).sort(), ['bob'])

  const pendingAfterNamedResponse = removeRespondedAgentsFromPending(
    new Set(['agent-a', 'agent-b']),
    [
      { id: '1', from: 'User', content: 'hello', timestamp: 1 },
      { id: '2', from: 'Briefing Writer', content: 'reply', timestamp: 2 },
    ],
    1,
    [
      { id: 'agent-a', name: 'Briefing Writer' },
      { id: 'agent-b', name: 'Research Analyst' },
    ]
  )
  assert.deepStrictEqual(Array.from(pendingAfterNamedResponse).sort(), ['agent-b'])

  const docEntries = [
    { path: 'WORKFLOWS/outputs/final-review/peptide-optimization-final-report.md' },
    { path: 'AGENTS/researcher/IDENTITY.md' },
    { path: 'ORG/MASTER_PLAN.md' },
    { path: 'AGENTS/researcher/preview.png' },
  ]
  assert.strictEqual(
    resolveCommunicationDocPath('peptide-optimization-final-report.md', docEntries),
    'WORKFLOWS/outputs/final-review/peptide-optimization-final-report.md'
  )
  assert.strictEqual(
    resolveCommunicationDocPath('WORKFLOWS/outputs/final-review/peptide-optimization-final-report.md', docEntries),
    'WORKFLOWS/outputs/final-review/peptide-optimization-final-report.md'
  )
  assert.strictEqual(
    resolveCommunicationDocPath('WORKFLOWS/outputs/final-review/peptide-optimization-final-report.md', []),
    'WORKFLOWS/outputs/final-review/peptide-optimization-final-report.md'
  )
  assert.strictEqual(
    resolveCommunicationDocPath('preview.png', docEntries),
    'AGENTS/researcher/preview.png'
  )
  assert.strictEqual(
    resolveCommunicationDocPath('show.pdf', [
      { path: 'AGENTS/researcher/show.pdf' },
      { path: 'WORKFLOWS/outputs/demo/show.pdf' },
    ]),
    null
  )

  // A forwarded reply keeps its code: this panel's own filter used to empty every fenced JSON block
  // and drop lines such as `Usage:` or a lone `}` wherever they appeared.
  const forwarded = [
    '**[Forwarded from Test Lead]**',
    '',
    '## Example response',
    '',
    '```json',
    '{',
    '  "status": "ok",',
    '  "items": [1, 2]',
    '}',
    '```',
    '',
    'Usage: send the header shown above.',
  ].join('\n')
  assert.equal(cleanCommunicationMessage(forwarded), forwarded)
  assert.equal(
    cleanCommunicationMessage('FailoverError: Incorrect API key provided for openai'),
    'Runtime auth error while contacting the configured model provider. Check the provider key/configuration and retry.',
    'One-line runtime failures still read as a plain explanation',
  )

  const examples = [
    '```text\nConnection error\n```',
    '```json\n{"error":"FailoverError: Incorrect API key provided"}\n```',
    '~~~text\nmodel fallback decision\nProvider example auth issue\n~~~',
    'Use `Incorrect API key provided` as the example text.',
    '`Connection error`',
    'A Connection error means the example failed.',
    'Connection error example:\n```text\nkeep config.json and this explanation\n```',
  ]
  for (const example of examples) {
    assert.equal(cleanCommunicationMessage(example), example, 'Error-like phrases in examples must survive without blank separator lines')
  }
  console.log(`communicationMessages.test.ts: ${14 + examples.length} tests passed`)
}

run()
