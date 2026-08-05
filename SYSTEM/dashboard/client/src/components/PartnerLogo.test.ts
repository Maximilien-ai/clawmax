import assert from 'assert'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PartnerLogo } from './PartnerLogo'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('partner logo renders remote image inside a dark-mode-safe white chip', () => {
  const markup = renderToStaticMarkup(
    React.createElement(PartnerLogo, {
      slug: 'resend',
      name: 'Resend',
      logoUrl: 'https://cdn.resend.com/brand/resend-wordmark-black.svg',
    }),
  )

  assert(markup.includes('<img'), 'Expected remote logo image to remain available for light mode')
  assert(markup.includes('dark:bg-white'), 'Expected logo chip to stay white in dark mode')
  assert(markup.includes('overflow-hidden'), 'Expected logo to render inside a contained chip')
  assert(markup.includes('max-h-full'), 'Expected image to fit the chip instead of owning the background')
})

test('partner logo has a compact icon fallback when a remote logo is unavailable', () => {
  const markup = renderToStaticMarkup(React.createElement(PartnerLogo, { slug: 'digo', name: 'Digo' }))
  assert(markup.includes('aria-label="Digo logo"'), 'Expected accessible Digo fallback label')
  assert(markup.includes('>D</span>'), 'Expected Digo icon fallback')
  assert(!markup.includes('>Digo</span>'), 'Fallback should not consume the full partner name')
})

console.log('PartnerLogo.test.ts: ok')
