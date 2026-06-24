import { buildWorkspaceScopedPath } from './workspaceScope'

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

test('replaces an existing workspaceId query param', () => {
  assertEqual(
    buildWorkspaceScopedPath('/api/notifications?workspaceId=default&limit=20', 'customer-a'),
    '/api/notifications?workspaceId=customer-a&limit=20'
  )
})

test('preserves hash fragments while appending workspace id', () => {
  assertEqual(
    buildWorkspaceScopedPath('/docs?tab=recent#artifact-2', 'ops'),
    '/docs?tab=recent&workspaceId=ops#artifact-2'
  )
})

test('supports relative paths as well as absolute dashboard paths', () => {
  assertEqual(
    buildWorkspaceScopedPath('api/workspaces/active', 'customer-b'),
    '/api/workspaces/active?workspaceId=customer-b'
  )
})

test('encodes workspace ids with spaces safely', () => {
  assertEqual(
    buildWorkspaceScopedPath('/api/activity', 'Client Success'),
    '/api/activity?workspaceId=Client+Success'
  )
})

test('returns original path for empty workspace ids', () => {
  assertEqual(buildWorkspaceScopedPath('/api/activity?limit=5', ''), '/api/activity?limit=5')
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`workspaceScopeEdges.test.ts: ${passed} tests passed`)
