import { subscribeSystemRefresh } from './systemRefresh'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('multiple subscribers on the same target all receive the event', () => {
  const target = new EventTarget()
  let first = 0
  let second = 0
  const offFirst = subscribeSystemRefresh(() => { first += 1 }, target)
  const offSecond = subscribeSystemRefresh(() => { second += 1 }, target)

  target.dispatchEvent(new Event('workspace-switched'))
  offFirst()
  offSecond()

  assert(first === 1, `Expected first subscriber once, got ${first}`)
  assert(second === 1, `Expected second subscriber once, got ${second}`)
})

test('unsubscribing one subscriber leaves the other active', () => {
  const target = new EventTarget()
  let first = 0
  let second = 0
  const offFirst = subscribeSystemRefresh(() => { first += 1 }, target)
  subscribeSystemRefresh(() => { second += 1 }, target)

  offFirst()
  target.dispatchEvent(new Event('workspace-switched'))

  assert(first === 0, `Expected first subscriber removed, got ${first}`)
  assert(second === 1, `Expected second subscriber to remain active, got ${second}`)
})

test('events with other names do not trigger refresh callbacks', () => {
  const target = new EventTarget()
  let calls = 0
  const off = subscribeSystemRefresh(() => { calls += 1 }, target)

  target.dispatchEvent(new Event('workspace-loaded'))
  off()

  assert(calls === 0, `Expected non-workspace-switched events to be ignored, got ${calls}`)
})

test('unsubscribe is safe to call more than once', () => {
  const target = new EventTarget()
  let calls = 0
  const off = subscribeSystemRefresh(() => { calls += 1 }, target)

  off()
  off()
  target.dispatchEvent(new Event('workspace-switched'))

  assert(calls === 0, `Expected callback to stay removed after repeated unsubscribe, got ${calls}`)
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`systemRefreshEdges.test.ts: ${passed} tests passed`)
