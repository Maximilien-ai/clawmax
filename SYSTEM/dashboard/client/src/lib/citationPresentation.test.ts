import assert from 'node:assert/strict'
import { presentCitationMarkers, remarkCitationPresentation } from './citationPresentation'
const marker = '\uE200cite\uE202turn123search0\uE202turn456search2\uE201'
assert.equal(presentCitationMarkers('Claim ' + marker), 'Claim [Source reference unavailable]')
for (const text of ['日本語 café 😀', '[Source](https://example.com)', 'literal cite text', '\uE200cite\uE202unfinished']) assert.equal(presentCitationMarkers(text), text)
const tree = { type: 'root', children: [{ type: 'text', value: marker }, { type: 'inlineCode', value: marker }, { type: 'code', value: marker }] }
remarkCitationPresentation()(tree)
assert.equal(tree.children[0].value, '[Source reference unavailable]')
assert.equal(tree.children[1].value, marker)
assert.equal(tree.children[2].value, marker)
console.log('Citation presentation regression checks passed')
