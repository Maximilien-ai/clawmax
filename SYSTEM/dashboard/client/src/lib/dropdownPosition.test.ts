import { getViewportSafeDropdownStyle } from './dropdownPosition'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const originalWindow = globalThis.window
if (!globalThis.window) {
  ;(globalThis as any).window = {}
}

const originalInnerWidth = globalThis.window.innerWidth
const originalInnerHeight = globalThis.window.innerHeight

Object.defineProperty(globalThis.window, 'innerWidth', { configurable: true, value: 390 })
Object.defineProperty(globalThis.window, 'innerHeight', { configurable: true, value: 820 })

const leftEdge = getViewportSafeDropdownStyle({ top: 120, bottom: 168, right: 180 }, 288)
assert(leftEdge.position === 'fixed', 'Expected viewport-safe dropdown to use fixed positioning')
assert(Number(leftEdge.left) >= 12, 'Expected dropdown left edge to stay inside viewport padding')
assert(Number(leftEdge.width) === 288, 'Expected menu width to remain unchanged when it fits viewport')

const nearLeftTrigger = getViewportSafeDropdownStyle({ top: 120, bottom: 168, right: 36 }, 288)
assert(Number(nearLeftTrigger.left) === 12, 'Expected dropdown near left edge to clamp to viewport padding')

const nearRightTrigger = getViewportSafeDropdownStyle({ top: 120, bottom: 168, right: 388 }, 288)
assert(Number(nearRightTrigger.left) === 90, 'Expected dropdown near right edge to keep right edge inside viewport padding')

const tooWide = getViewportSafeDropdownStyle({ top: 120, bottom: 168, right: 380 }, 520)
assert(Number(tooWide.left) === 12, 'Expected oversized menu to clamp to viewport padding')
assert(Number(tooWide.width) === 366, 'Expected oversized menu width to fit mobile viewport')

const topPlacement = getViewportSafeDropdownStyle({ top: 120, bottom: 168, right: 380 }, 288, 'top')
assert(topPlacement.bottom !== undefined && topPlacement.top === undefined, 'Expected top placement to use bottom offset')
assert(Number(topPlacement.left) === 90, 'Expected top placement to apply the same horizontal viewport clamp')

Object.defineProperty(globalThis.window, 'innerWidth', { configurable: true, value: originalInnerWidth })
Object.defineProperty(globalThis.window, 'innerHeight', { configurable: true, value: originalInnerHeight })
if (!originalWindow) {
  delete (globalThis as any).window
}

console.log('dropdownPosition.test.ts: 9 tests passed')
