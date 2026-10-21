import assert from 'assert'
import { isStalePdfAssetError } from './pdfLoadError'

for (const message of [
  'Failed to fetch dynamically imported module: /assets/markdownPdf-old.js',
  'error loading dynamically imported module',
  'Importing a module script failed.',
  'ChunkLoadError: Loading chunk 123 failed.',
  'Failed to load module script: Expected a JavaScript module script',
]) assert.equal(isStalePdfAssetError(new TypeError(message)), true)

assert.equal(isStalePdfAssetError(new Error('Invalid PDF table width')), false)
assert.equal(isStalePdfAssetError(null), false)
console.log('pdfLoadError.test.ts: 7 tests passed')
