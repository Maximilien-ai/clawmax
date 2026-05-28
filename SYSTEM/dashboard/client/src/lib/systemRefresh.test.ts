import { subscribeSystemRefresh } from './systemRefresh'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

let passed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
    passed += 1
  } catch (error: any) {
    console.error(`✗ ${name}`)
    console.error(error?.message || error)
    process.exitCode = 1
  }
}

test('subscribeSystemRefresh listens for workspace-switched events', () => {
  let calls = 0
  const target = new EventTarget()
  const unsubscribe = subscribeSystemRefresh(() => {
    calls += 1
  }, target)

  target.dispatchEvent(new Event('workspace-switched'))
  unsubscribe()

  assert(calls === 1, `Expected callback to run once, got ${calls}`)
})

test('unsubscribe stops future workspace refresh callbacks', () => {
  let calls = 0
  const target = new EventTarget()
  const unsubscribe = subscribeSystemRefresh(() => {
    calls += 1
  }, target)

  unsubscribe()
  target.dispatchEvent(new Event('workspace-switched'))

  assert(calls === 0, `Expected callback to stop after unsubscribe, got ${calls}`)
})

if (!process.exitCode) {
  console.log('All tests passed')
  console.log(`Passed: ${passed}`)
}
