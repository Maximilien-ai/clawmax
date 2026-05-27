import assert from 'assert'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderMaintenanceBannerText } from './maintenanceBannerLinks'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('renders plain banner text unchanged', () => {
  const markup = renderToStaticMarkup(<>{renderMaintenanceBannerText('Planned maintenance tonight.', 'test-link')}</>)
  assert(markup.includes('Planned maintenance tonight.'), 'Expected plain text to remain visible')
})

test('renders embedded urls as clickable links', () => {
  const markup = renderToStaticMarkup(
    <>{renderMaintenanceBannerText('Read https://example.com/releases/1.6.0 for details.', 'test-link')}</>,
  )
  assert(markup.includes('<a'), 'Expected rendered anchor tag')
  assert(markup.includes('href="https://example.com/releases/1.6.0"'), 'Expected embedded URL href')
  assert(markup.includes('>https://example.com/releases/1.6.0</a>'), 'Expected embedded URL label')
})

test('preserves multiline banner text while linkifying urls', () => {
  const markup = renderToStaticMarkup(
    <>{renderMaintenanceBannerText('Heads up\nhttps://status.example.com\nSave work first.', 'test-link')}</>,
  )
  assert(markup.includes('<br/>'), 'Expected line breaks to be preserved')
  assert(markup.includes('href="https://status.example.com"'), 'Expected multiline URL href')
})

console.log('maintenanceBannerLinks.test.tsx: ok')
