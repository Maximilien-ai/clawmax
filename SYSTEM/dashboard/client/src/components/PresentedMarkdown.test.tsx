import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PresentedMarkdown from './PresentedMarkdown'
import { buildMarkdownPdf } from '../lib/markdownPdf'
const marker = '\uE200cite\uE202turn123search0\uE201'
const source = `日本語 café 😀 Claim ${marker}\n\n[Real source](https://example.com)\n\n\`${marker}\`\n\n\`\`\`text\n${marker}\n\`\`\``
const html = renderToStaticMarkup(<PresentedMarkdown>{source}</PresentedMarkdown>)
assert(html.includes('Claim [Source reference unavailable]'))
assert(html.includes('href="https://example.com"'))
assert(html.includes(`<code>${marker}</code>`))
assert(html.includes('日本語 café 😀'))
assert.equal(source.includes(marker), true)
void buildMarkdownPdf(`Claim ${marker}`, 'test.md').then(result => {
 assert(JSON.stringify(result).includes('[Source reference unavailable]'))
 assert(!JSON.stringify(result).includes(marker))
 console.log('PresentedMarkdown and PDF citation regressions passed')
})
