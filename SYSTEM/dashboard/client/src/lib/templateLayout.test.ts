import {
  TEMPLATE_FILTER_ROW_CLASSNAME,
  TEMPLATE_HEADER_CONTROLS_CLASSNAME,
  TEMPLATE_PAGE_CONTAINER_CLASSNAME,
} from './templateLayout'

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

function assertIncludes(actual: string, expected: string, message?: string) {
  if (!actual.includes(expected)) {
    throw new Error(message || `Expected "${actual}" to include "${expected}"`)
  }
}

test('template page container prevents horizontal spill', () => {
  assertIncludes(TEMPLATE_PAGE_CONTAINER_CLASSNAME, 'overflow-x-hidden')
})

test('template header controls preserve mobile grid and desktop wrapping', () => {
  assertIncludes(TEMPLATE_HEADER_CONTROLS_CLASSNAME, 'grid-cols-2')
  assertIncludes(TEMPLATE_HEADER_CONTROLS_CLASSNAME, 'sm:flex-wrap')
})

test('template filter rows wrap on narrow screens', () => {
  assertIncludes(TEMPLATE_FILTER_ROW_CLASSNAME, 'flex-wrap')
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`templateLayout.test.ts: ${passed} tests passed`)
