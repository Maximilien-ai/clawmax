import assert from 'assert'
import {
  getCompletedReviewReleaseIdsToArchive,
  getReviewReleaseGroups,
} from './reviewLifecycle'
import type { PluginRecord } from './plugins'

function record(id: string, release: string, completed: boolean, archived = false): PluginRecord {
  return {
    id,
    kind: 'review-note',
    name: id,
    description: '',
    enabled: true,
    archived,
    tags: [],
    fields: { release, completed },
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
  }
}

const records = [
  record('old-1', '2.0.0-test-rc9', true),
  record('old-2', '2.0.0-test-rc9', true),
  record('pending', '2.0.0 previous RCs', false),
  record('current', '2.0.0-test-rc10', true),
  record('archived', '1.9.9 regression', true, true),
]

assert.deepStrictEqual(
  getReviewReleaseGroups(records, 'release', false),
  ['2.0.0-test-rc10', '2.0.0-test-rc9', '2.0.0 previous RCs'],
  'active release groups should exclude archived records',
)
assert.deepStrictEqual(
  getReviewReleaseGroups(records, 'release', true),
  ['1.9.9 regression'],
  'archived release groups should be isolated from active releases',
)
assert.deepStrictEqual(
  getCompletedReviewReleaseIdsToArchive(records, 'release', 'completed', '2.0.0-test-rc10').sort(),
  ['old-1', 'old-2'],
  'only fully completed older releases should be archived',
)
assert.deepStrictEqual(
  getCompletedReviewReleaseIdsToArchive(records, 'release', 'completed', '2.0.0-test-rc9'),
  ['current'],
  'the incoming release should never archive itself',
)

console.log('reviewLifecycle.test.ts: 4 assertions passed')
