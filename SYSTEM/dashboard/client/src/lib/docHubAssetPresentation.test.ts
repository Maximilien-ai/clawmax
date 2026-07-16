import assert from 'assert'
import { getDocHubAssetLabel } from './docHubAssetPresentation'

assert.strictEqual(getDocHubAssetLabel({ path: 'AGENTS/a/MEMORY/photo.png', assetSource: 'generated' }), 'asset')
assert.strictEqual(getDocHubAssetLabel({ path: 'AGENTS/a/MEMORY/photo', assetSource: 'generated' }), 'asset')
assert.strictEqual(getDocHubAssetLabel({ path: 'AGENTS/a/MEMORY/notes.md', assetSource: 'generated' }), 'memory')
assert.strictEqual(getDocHubAssetLabel({ path: 'AGENTS/a/MEMORY/NOTES.MD', assetSource: 'generated' }), 'memory')
assert.strictEqual(getDocHubAssetLabel({ path: 'AGENTS/a/MEMORY/upload.md', assetSource: 'uploaded' }), 'asset')
assert.strictEqual(getDocHubAssetLabel(null), 'asset')

console.log('docHubAssetPresentation.test.ts: 6 assertions passed')
