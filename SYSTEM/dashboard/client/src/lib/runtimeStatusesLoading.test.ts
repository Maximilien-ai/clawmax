/**
 * Runtime statuses loading/error state helper tests
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/runtimeStatusesLoading.test.ts
 */

import { describeRuntimeStatusesFetchError, describeRuntimeStatusesViewState } from './runtimeStatusesLoading'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('shows loading state while the initial fetch is in flight', () => {
  assert(
    describeRuntimeStatusesViewState({ loading: true, statusesCount: 0, error: null }) === 'loading',
    'expected loading=true with no statuses yet to render the loading state'
  )
})

test('loading state takes priority even if a stale error is still set', () => {
  assert(
    describeRuntimeStatusesViewState({ loading: true, statusesCount: 0, error: 'stale error' }) === 'loading',
    'expected an in-flight retry to show loading, not the previous error'
  )
})

test('shows error state once loading finishes with no statuses and an error', () => {
  assert(
    describeRuntimeStatusesViewState({ loading: false, statusesCount: 0, error: 'Could not detect installed runtimes.' }) === 'error',
    'expected a failed fetch (loading done, empty list, error set) to render the error state'
  )
})

test('does not show error state while still loading', () => {
  assert(
    describeRuntimeStatusesViewState({ loading: true, statusesCount: 0, error: 'boom' }) !== 'error',
    'expected the error state to wait until loading finishes'
  )
})

test('renders ready (grid) once runtimes are present, regardless of a stale error', () => {
  assert(
    describeRuntimeStatusesViewState({ loading: false, statusesCount: 3, error: null }) === 'ready',
    'expected a populated list to render ready'
  )
  assert(
    describeRuntimeStatusesViewState({ loading: false, statusesCount: 3, error: 'ignored' }) === 'ready',
    'expected a populated list to render ready even if a stale error string lingers'
  )
})

test('renders ready for a legitimately empty, successfully-fetched list', () => {
  assert(
    describeRuntimeStatusesViewState({ loading: false, statusesCount: 0, error: null }) === 'ready',
    'expected an empty-but-successful fetch (no error) not to be treated as an error state'
  )
})

test('formats a server error message when the response had an HTTP status', () => {
  const message = describeRuntimeStatusesFetchError(500)
  assert(message.includes('HTTP 500'), 'expected the error message to include the HTTP status code')
})

test('formats a network error message when there is no HTTP status', () => {
  const withUndefined = describeRuntimeStatusesFetchError(undefined)
  const withNull = describeRuntimeStatusesFetchError(null)
  assert(!withUndefined.includes('HTTP'), 'expected a network failure message to omit an HTTP status')
  assert(withUndefined === withNull, 'expected undefined and null status to produce the same message')
})

console.log('\nAll tests passed')
