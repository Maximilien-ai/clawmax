import assert from 'assert'
import {
  CUMULATIVE_2_0_REVIEW_RELEASE,
  getCompletedReviewReleaseIdsToArchive,
  getReviewReleaseGroups,
  planReviewReleaseConsolidation,
} from './reviewLifecycle'
import { isGenericPluginRecord, type PluginRecord } from './plugins'

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

const migrationRecords = [
  {
    ...record('cumulative-copy', CUMULATIVE_2_0_REVIEW_RELEASE, false),
    name: 'Mobile plugin navigation',
    fields: {
      release: CUMULATIVE_2_0_REVIEW_RELEASE,
      completed: false,
      outcome: 'pending',
      notes: '',
      evidence: ['current.png'],
      verifiedBy: [],
    },
  },
  {
    ...record('rc5-copy', '2.0.0-test-rc5', true),
    name: 'Mobile plugin navigation',
    archived: true,
    fields: {
      release: '2.0.0-test-rc5',
      completed: true,
      outcome: 'passed',
      notes: 'Passed on Max test10.',
      evidence: ['rc5.png'],
      verifiedBy: ['Max - cloud'],
    },
  },
  {
    ...record('rc10-only', '2.0.0-test-rc10', false),
    name: 'Review export identity',
    fields: {
      release: '2.0.0-test-rc10',
      completed: false,
      outcome: 'failed',
      notes: 'Email was blank.',
      evidence: [],
      verifiedBy: [],
    },
  },
  record('current-rc', '2.0.0-test-rc19', false),
]
const consolidation = planReviewReleaseConsolidation(
  migrationRecords,
  'release',
  'completed',
  '2.0.0-test-rc19',
)
assert.deepStrictEqual(
  consolidation.deleteIds,
  ['rc5-copy'],
  'a legacy duplicate should be removed only after merging into its cumulative copy',
)
assert.strictEqual(consolidation.updates.length, 2, 'duplicate and unique legacy checks should both produce cumulative updates')
const mergedDuplicate = consolidation.updates.find((entry) => entry.id === 'cumulative-copy')
assert.strictEqual(mergedDuplicate && isGenericPluginRecord(mergedDuplicate) && mergedDuplicate.fields.release, CUMULATIVE_2_0_REVIEW_RELEASE)
assert.strictEqual(mergedDuplicate && isGenericPluginRecord(mergedDuplicate) && mergedDuplicate.fields.completed, true)
assert.strictEqual(mergedDuplicate && isGenericPluginRecord(mergedDuplicate) && mergedDuplicate.fields.outcome, 'passed')
assert.strictEqual(mergedDuplicate && isGenericPluginRecord(mergedDuplicate) && mergedDuplicate.fields.notes, 'Passed on Max test10.')
assert.deepStrictEqual(
  mergedDuplicate && isGenericPluginRecord(mergedDuplicate) ? mergedDuplicate.fields.evidence : [],
  ['current.png', 'rc5.png'],
)
const migratedUnique = consolidation.updates.find((entry) => entry.id === 'rc10-only')
assert.strictEqual(migratedUnique && isGenericPluginRecord(migratedUnique) && migratedUnique.fields.release, CUMULATIVE_2_0_REVIEW_RELEASE)
assert.strictEqual(migratedUnique && isGenericPluginRecord(migratedUnique) && migratedUnique.fields.outcome, 'failed')
assert.strictEqual(
  planReviewReleaseConsolidation(migrationRecords, 'release', 'completed', '2.0.0-test-rc10').updates.some((entry) => entry.id === 'rc10-only'),
  false,
  'the current focused release must never be migrated',
)

console.log('reviewLifecycle.test.ts: 13 assertions passed')
