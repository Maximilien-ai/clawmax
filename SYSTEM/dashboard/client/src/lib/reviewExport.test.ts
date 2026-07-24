import assert from 'assert'
import {
  buildReleaseReviewFilename,
  buildReleaseReviewMarkdown,
  isReviewErrorLine,
  sanitizeReviewLogLine,
} from './reviewExport'
import type { GenericPluginRecord } from './plugins'

const records: GenericPluginRecord[] = [
  {
    id: 'mobile-layout',
    kind: 'review-note',
    name: 'Mobile layout',
    description: 'Verify mobile layout',
    enabled: true,
    tags: ['responsive'],
    fields: {
      release: '2.0.0-test-rc7',
      area: 'responsive',
      completed: true,
      outcome: 'passed',
      notes: 'Looks good | iPhone',
      owner: 'Mike',
      evidence: ['screenshot.png'],
    },
    createdAt: '2026-07-24T12:00:00.000Z',
    updatedAt: '2026-07-24T12:30:00.000Z',
  },
  {
    id: 'plugin-layout',
    kind: 'review-note',
    name: 'Plugin layout',
    description: 'Verify plugin layout',
    enabled: true,
    tags: ['plugins'],
    fields: {
      release: '2.0.0-test-rc7',
      area: 'plugins',
      completed: true,
      outcome: 'failed',
      notes: 'Toolbar wraps',
      owner: 'Mike',
      evidence: [],
    },
  },
]

const markdown = buildReleaseReviewMarkdown({
  release: '2.0.0-test-rc7',
  reviewer: { name: 'Mike Tester', email: 'mike@example.com' },
  exportedAt: '2026-07-24T16:00:00.000Z',
  instance: {
    deploymentKind: 'onprem',
    instanceLabel: 'Customer Lab',
    version: '2.0.0-test-rc7',
    hostname: 'lab-host',
    platform: 'linux',
    workspace: '/workspace',
  },
  records,
  recentErrors: ['ERROR token=super-secret-value failed to connect'],
})

assert(markdown.includes('# ClawMax 2.0.0-test-rc7 Release Review'))
assert(markdown.includes('- Reviewer: Mike Tester'))
assert(markdown.includes('- Environment: onprem'))
assert(markdown.includes('- Passed: 1'))
assert(markdown.includes('- Failed: 1'))
assert(markdown.includes('Looks good \\| iPhone'))
assert(markdown.includes('token=[REDACTED]'))
assert(!markdown.includes('super-secret-value'))
assert(sanitizeReviewLogLine('Authorization: Bearer abc.def.ghi') === 'Authorization: Bearer [REDACTED]')
assert(isReviewErrorLine('ERROR workflow execution failed'))
assert(!isReviewErrorLine('INFO workflow execution completed'))
assert(
  buildReleaseReviewFilename('2.0.0 Test RC7', '2026-07-24T16:00:00.000Z') ===
    'clawmax-2.0.0-test-rc7-review-2026-07-24-16-00-00.md',
)

console.log('reviewExport.test.ts: 12 tests passed')
