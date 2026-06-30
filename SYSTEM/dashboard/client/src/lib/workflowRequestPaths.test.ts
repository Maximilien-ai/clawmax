import { buildWorkflowDocsIndexPath, buildWorkflowsCollectionPath } from './workflowRequestPaths'

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

test('scopes workflow collection requests to the active workspace', () => {
  assertEqual(buildWorkflowsCollectionPath('customer-a'), '/api/workflows?workspaceId=customer-a')
})

test('leaves workflow collection path unchanged without a workspace id', () => {
  assertEqual(buildWorkflowsCollectionPath(''), '/api/workflows')
})

test('scopes docs index requests to the active workspace', () => {
  assertEqual(buildWorkflowDocsIndexPath('cloud-demo'), '/api/docs?workspaceId=cloud-demo')
})

test('leaves docs index path unchanged without a workspace id', () => {
  assertEqual(buildWorkflowDocsIndexPath(undefined), '/api/docs')
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`workflowRequestPaths.test.ts: ${passed} tests passed`)
