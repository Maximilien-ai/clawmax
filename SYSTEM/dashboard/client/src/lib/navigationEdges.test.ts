import assert from 'assert'
import {
  buildPluginPage,
  isPluginPage,
  pageToPath,
  pathToPage,
  pluginSlugFromPage,
} from './navigation'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('buildPluginPage trims surrounding whitespace', () => {
  assert.strictEqual(buildPluginPage('  lab-notes  '), 'plugin:lab-notes')
})

test('pluginSlugFromPage returns null for empty plugin slugs', () => {
  assert.strictEqual(pluginSlugFromPage('plugin:'), null)
  assert.strictEqual(pluginSlugFromPage('plugin:   '), null)
})

test('pageToPath falls back to builder for empty plugin pages', () => {
  assert.strictEqual(pageToPath('plugin:'), '/builder')
  assert.strictEqual(pageToPath('plugin:   '), '/builder')
})

test('pathToPage trims plugin routes and ignores trailing slashes', () => {
  assert.strictEqual(pathToPage('/plugins/  lab-notes  /'), 'plugin:lab-notes')
})

test('isPluginPage only matches plugin-prefixed pages', () => {
  assert.strictEqual(isPluginPage('plugin:ops-hub'), true)
  assert.strictEqual(isPluginPage('plugins/ops-hub' as any), false)
})

console.log('navigationEdges.test.ts: ok')
