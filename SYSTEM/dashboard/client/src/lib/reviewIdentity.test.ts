import assert from 'assert'
import {
  readStoredReviewIdentity,
  resolveReviewIdentity,
  REVIEW_IDENTITY_STORAGE_KEY,
  storeReviewIdentity,
} from './reviewIdentity'

assert.deepStrictEqual(
  resolveReviewIdentity(
    { name: 'Max Maximilien', login: 'max', email: 'max@example.com' },
    { name: 'Stored Name', email: 'stored@example.com' },
  ),
  { name: 'Max Maximilien', email: 'max@example.com' },
)
assert.deepStrictEqual(
  resolveReviewIdentity(
    { name: null, login: 'max', email: null },
    { name: 'Stored Name', email: 'stored@example.com' },
  ),
  { name: 'max', email: 'stored@example.com' },
)
assert.deepStrictEqual(
  resolveReviewIdentity(null, { name: 'Stored Name', email: 'stored@example.com' }),
  { name: 'Stored Name', email: 'stored@example.com' },
)

const values = new Map<string, string>()
const storage = {
  getItem: (key: string) => values.get(key) || null,
  setItem: (key: string, value: string) => { values.set(key, value) },
}
storeReviewIdentity(storage, { name: '  Max  ', email: ' max@example.com ' })
assert.strictEqual(values.has(REVIEW_IDENTITY_STORAGE_KEY), true)
assert.deepStrictEqual(readStoredReviewIdentity(storage), { name: 'Max', email: 'max@example.com' })

values.set(REVIEW_IDENTITY_STORAGE_KEY, '{invalid')
assert.deepStrictEqual(readStoredReviewIdentity(storage), { name: '', email: '' })

console.log('reviewIdentity.test.ts: 7 tests passed')
