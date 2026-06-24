import { getSmartDropdownPlacement, getViewportSafeDropdownStyle } from './dropdownPosition'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const originalWindow = globalThis.window
if (!globalThis.window) {
  ;(globalThis as any).window = {}
}

const originalInnerWidth = globalThis.window.innerWidth
const originalInnerHeight = globalThis.window.innerHeight

Object.defineProperty(globalThis.window, 'innerWidth', { configurable: true, value: 360 })
Object.defineProperty(globalThis.window, 'innerHeight', { configurable: true, value: 640 })

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('prefers bottom placement when there is enough space below', () => {
  const placement = getSmartDropdownPlacement({ top: 120, bottom: 160 } as DOMRect, 220)
  assert(placement === 'bottom', `Expected bottom placement, got ${placement}`)
})

test('prefers top placement when below space is tighter than above space', () => {
  const placement = getSmartDropdownPlacement({ top: 420, bottom: 600 } as DOMRect, 180)
  assert(placement === 'top', `Expected top placement, got ${placement}`)
})

test('ties still choose bottom placement', () => {
  const placement = getSmartDropdownPlacement({ top: 260, bottom: 380 } as DOMRect, 400)
  assert(placement === 'bottom', `Expected tie to fall back to bottom, got ${placement}`)
})

test('clamps zero-width menus to viewport-safe width', () => {
  const style = getViewportSafeDropdownStyle({ top: 100, bottom: 140, right: 220 }, 0)
  assert(Number(style.width) === 0, `Expected zero-width style width, got ${style.width}`)
  assert(Number(style.left) >= 12, `Expected left padding clamp, got ${style.left}`)
})

test('top placement uses a bottom offset instead of a top offset', () => {
  const style = getViewportSafeDropdownStyle({ top: 4, bottom: 44, right: 120 }, 180, 'top')
  assert(style.top === undefined, 'Expected top placement not to set top')
  assert(Number(style.bottom) === 642, `Expected bottom offset from trigger position, got ${style.bottom}`)
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

Object.defineProperty(globalThis.window, 'innerWidth', { configurable: true, value: originalInnerWidth })
Object.defineProperty(globalThis.window, 'innerHeight', { configurable: true, value: originalInnerHeight })
if (!originalWindow) {
  delete (globalThis as any).window
}

console.log(`dropdownPositionEdges.test.ts: ${passed} tests passed`)
